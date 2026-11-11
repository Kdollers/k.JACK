#!/usr/bin/env node
'use strict';
/**
 * trace-history-changes.cjs — which operation rewrites posted history?
 *
 * The end-to-end scenario suite fingerprints every journal entry before it
 * runs and compares afterwards, and it reported that an entry which existed
 * beforehand had changed. Double entry says a correction must ADD an entry,
 * never edit one already posted, so this script finds the exact row: it
 * snapshots the ledger, runs one business operation at a time, and reports
 * what moved after each.
 *
 * Read-only with respect to the committed baseline: it works on a copy.
 *
 * Usage:  node scripts/trace-history-changes.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

if (!process.env.GENESIS_DB_PATH) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-trace-'));
  const src = path.join(__dirname, '..', 'genesis.db');
  const dest = path.join(tmp, 'genesis-trace.db');
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  process.env.GENESIS_DB_PATH = dest;
}

const { getDb } = require('../server/db');
const {
  postSalesInvoice, postPurchaseInvoice, postCreditNote,
  postStockAdjustment, recordPayment, generateId, nextSequenceNumber
} = require('../server/accountingEngine');

const db = getDb();
const companyId = 'comp-genesis-01';
const user = { id: 'usr-accountant', full_name: 'Chief Accountant' };
const TODAY = new Date().toISOString().split('T')[0];
const TAX = 18;

function snapshot() {
  const entries = db.prepare(`
    SELECT id, entry_number, date, reference, description, source_type, source_id, status
    FROM journal_entries WHERE company_id = ? ORDER BY id
  `).all(companyId);
  const lines = db.prepare(`
    SELECT jel.id, jel.journal_entry_id, jel.account_id, jel.debit, jel.credit, jel.line_number
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE je.company_id = ? ORDER BY jel.id
  `).all(companyId);
  const byId = new Map();
  for (const e of entries) byId.set(e.id, e);
  const linesById = new Map();
  for (const l of lines) linesById.set(l.id, l);
  return { byId, linesById };
}

function diff(before, after, label) {
  const out = [];
  for (const [id, e] of before.byId) {
    const now = after.byId.get(id);
    if (!now) { out.push('  entry DELETED: ' + e.entry_number); continue; }
    for (const k of Object.keys(e)) {
      if (String(e[k]) !== String(now[k])) {
        out.push('  entry ' + e.entry_number + ' [' + k + '] "' + e[k] + '" -> "' + now[k] + '"');
      }
    }
  }
  for (const [id, l] of before.linesById) {
    const now = after.linesById.get(id);
    if (!now) { out.push('  line DELETED: ' + l.id); continue; }
    for (const k of ['debit', 'credit', 'account_id', 'line_number']) {
      if (String(l[k]) !== String(now[k])) {
        out.push('  line ' + l.id + ' [' + k + '] ' + l[k] + ' -> ' + now[k]);
      }
    }
  }
  const added = [...after.byId.keys()].filter((id) => !before.byId.has(id));
  if (out.length) {
    console.log('AFTER ' + label + ':');
    out.slice(0, 20).forEach((l) => console.log(l));
    if (out.length > 20) console.log('  ...and ' + (out.length - 20) + ' more');
  } else {
    console.log('AFTER ' + label + ': no pre-existing entry changed' +
      (added.length ? ' (' + added.length + ' added)' : ''));
  }
}

const CUSTOMER = db.prepare(`SELECT * FROM customers WHERE company_id = ? AND active = 1 LIMIT 1`).get(companyId);
const SUPPLIER = db.prepare(`SELECT * FROM suppliers WHERE company_id = ? AND active = 1 LIMIT 1`).get(companyId);
const PRODUCT = db.prepare(`SELECT * FROM products WHERE company_id = ? AND type = 'GOODS' AND active = 1 LIMIT 1`).get(companyId);
const BANK = db.prepare(`SELECT * FROM bank_accounts WHERE company_id = ? LIMIT 1`).get(companyId);
const roundTo = (n, d = 2) => Math.round((Number(n) + Number.EPSILON * Math.sign(n)) * 10 ** d) / 10 ** d;

function step(label, fn) {
  const before = snapshot();
  try {
    const r = fn();
    diff(before, snapshot(), label);
    return r;
  } catch (err) {
    console.log('AFTER ' + label + ': THREW — ' + err.message);
    diff(before, snapshot(), label + ' (after the throw)');
    return null;
  }
}

console.log('tracing which operation touches posted history\n');

// 1. Purchase
const buy = step('postPurchaseInvoice', () => {
  const qty = 10.5, unitCost = 10.3333;
  const lineTotal = roundTo(qty * unitCost, 2);
  const billId = generateId('bill');
  db.prepare(`
    INSERT INTO purchase_invoices (id, company_id, bill_number, date, due_date, supplier_id,
      subtotal, tax_total, total, amount_paid, balance_due, status, created_by, created_at,
      currency_code, exchange_rate)
    VALUES (?,?,?,?,?,?,?,0,?,0,?,'DRAFT',?,datetime('now'),'RWF',1)
  `).run(billId, companyId, nextSequenceNumber(companyId, 'PURCHASE_INVOICE', 'BINV') + '-T',
         TODAY, TODAY, SUPPLIER.id, lineTotal, lineTotal, lineTotal, user.id);
  db.prepare(`
    INSERT INTO purchase_invoice_lines (id, bill_id, product_id, description, quantity, unit_cost, tax_rate, line_total)
    VALUES (?,?,?,?,?,?,0,?)
  `).run(generateId('bil'), billId, PRODUCT.id, PRODUCT.name, qty, unitCost, lineTotal);
  postPurchaseInvoice(companyId, billId, user);
  return { billId, lineTotal };
});

// 2. Sale
const sale = step('postSalesInvoice', () => {
  const qty = 1.25, unitPrice = roundTo(PRODUCT.selling_price, 2);
  const subtotal = roundTo(qty * unitPrice, 2);
  const taxTotal = roundTo(subtotal * (TAX / 100), 2);
  const total = roundTo(subtotal + taxTotal, 2);
  const invId = generateId('inv');
  db.prepare(`
    INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id,
      subtotal, tax_total, discount_total, total, amount_paid, balance_due, status, created_by, created_at,
      currency_code, exchange_rate)
    VALUES (?,?,?,?,?,?,?,?,0,?,0,?,'DRAFT',?,datetime('now'),'RWF',1)
  `).run(invId, companyId, nextSequenceNumber(companyId, 'INVOICE', 'INV') + '-T',
         TODAY, TODAY, CUSTOMER.id, subtotal, taxTotal, total, total, user.id);
  db.prepare(`
    INSERT INTO sales_invoice_lines (id, invoice_id, product_id, description, quantity, unit_price,
      unit_cost, discount_percent, tax_rate, tax_amount, line_total)
    VALUES (?,?,?,?,?,?,?,0,?,?,?)
  `).run(generateId('sil'), invId, PRODUCT.id, PRODUCT.name, qty, unitPrice, PRODUCT.cost_price, TAX, taxTotal, total);
  postSalesInvoice(companyId, invId, user);
  return { invId, subtotal, taxTotal, total };
});

// 3. Negative sale (a return)
step('postSalesInvoice with a negative line', () => {
  if (!sale) return;
  const qty = -0.5, unitPrice = roundTo(PRODUCT.selling_price, 2);
  const subtotal = roundTo(qty * unitPrice, 2);
  const taxTotal = roundTo(subtotal * (TAX / 100), 2);
  const total = roundTo(subtotal + taxTotal, 2);
  const invId = generateId('inv');
  db.prepare(`
    INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id,
      subtotal, tax_total, discount_total, total, amount_paid, balance_due, status, created_by, created_at,
      currency_code, exchange_rate)
    VALUES (?,?,?,?,?,?,?,?,0,?,0,?,'DRAFT',?,datetime('now'),'RWF',1)
  `).run(invId, companyId, nextSequenceNumber(companyId, 'INVOICE', 'INV') + '-TN',
         TODAY, TODAY, CUSTOMER.id, subtotal, taxTotal, total, total, user.id);
  db.prepare(`
    INSERT INTO sales_invoice_lines (id, invoice_id, product_id, description, quantity, unit_price,
      unit_cost, discount_percent, tax_rate, tax_amount, line_total)
    VALUES (?,?,?,?,?,?,?,0,?,?,?)
  `).run(generateId('sil'), invId, PRODUCT.id, PRODUCT.name, qty, unitPrice, PRODUCT.cost_price, TAX, taxTotal, total);
  postSalesInvoice(companyId, invId, user);
});

// 4. Credit note
step('postCreditNote', () => {
  if (!sale) return;
  postCreditNote(companyId, {
    invoiceId: sale.invId, customerId: CUSTOMER.id, date: TODAY,
    reason: 'trace', restockItems: 1,
    lines: [{ productId: PRODUCT.id, description: PRODUCT.name, quantity: 0.25,
              unitPrice: roundTo(PRODUCT.selling_price, 2), taxRate: TAX }]
  }, user);
});

// 5. Refund
step('recordPayment: a negative customer receipt (refund)', () => {
  recordPayment(companyId, {
    paymentType: 'CUSTOMER_RECEIPT', bankAccountId: BANK.id, customerId: CUSTOMER.id,
    amount: -10.75, date: TODAY, notes: 'trace refund'
  }, user);
});

// 6. Supplier overpayment
step('recordPayment: a supplier payment larger than the bill', () => {
  if (!buy) return;
  recordPayment(companyId, {
    paymentType: 'SUPPLIER_PAYMENT', bankAccountId: BANK.id, supplierId: SUPPLIER.id,
    amount: roundTo(buy.lineTotal + 50, 2), date: TODAY, notes: 'trace overpayment'
  }, user);
});

// 7. Stock adjustment
step('postStockAdjustment', () => {
  postStockAdjustment(companyId, {
    date: TODAY, reason: 'trace spillage',
    lines: [{ productId: PRODUCT.id, quantityChange: -0.1 }]
  }, user);
});

console.log('\ndone');
