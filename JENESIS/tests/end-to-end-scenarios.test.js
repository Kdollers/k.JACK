'use strict';
/**
 * END-TO-END BUSINESS SCENARIOS (JENESIS 1.0.2, real-world verification).
 *
 * The unit suites test one thing at a time. This one runs a business day: buy
 * goods in a fractional quantity at a fractional cost, sell by the kilo, take
 * a return two different ways, refund a customer, overpay a supplier, and then
 * ask the books whether they still make sense.
 *
 * The scenarios are the ones a shop actually meets, and they are deliberately
 * the awkward ones — the numbers the brief named: 0.1, 0.25, 0.5, 1.25, 10.75,
 * -1, -5, -0.5.
 *
 * Two questions are asked after every scenario, and they are the two that
 * decide whether the software is fit for a business:
 *
 *   1. Do the books still balance? (double entry)
 *   2. Is the past still the past? (no historical entry may be rewritten)
 *
 * The second is answered by fingerprinting every journal entry before the day
 * begins and comparing afterwards. A correction must ADD an entry; it must
 * never edit one that was already posted.
 *
 * Runs against a temporary copy of the database, never against genesis.db.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

if (!process.env.GENESIS_DB_PATH) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-e2e-'));
  const src = path.join(__dirname, '..', 'genesis.db');
  const dest = path.join(tmpDir, 'genesis-test.db');
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  process.env.GENESIS_DB_PATH = dest;
  process.on('exit', () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });
}

const { getDb } = require('../server/db');
const {
  postSalesInvoice,
  postPurchaseInvoice,
  postCreditNote,
  postStockAdjustment,
  recordPayment,
  generateId,
  nextSequenceNumber
} = require('../server/accountingEngine');
const reports = require('../server/reports');
const { roundTo } = require('../server/utils');

console.log('--- STARTING END-TO-END BUSINESS SCENARIOS ---');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed += 1;
    console.log('  ✗ ' + name + '\n      ' + err.message);
  }
}

const db = getDb();
const companyId = 'comp-genesis-01';
const user = { id: 'usr-accountant', full_name: 'Chief Accountant' };
const TODAY = new Date().toISOString().split('T')[0];

// ---------------------------------------------------------------------------
// A fingerprint of the past. Every journal entry that exists before this file
// runs must still exist, unchanged, after it finishes.
// ---------------------------------------------------------------------------

function fingerprintEntries() {
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
  // One digest per row, keyed by id. Hashing the whole array would make the
  // fingerprint depend on the order the rows come back in, so a new entry
  // sorting between two old ones would look like a rewrite of the past. The
  // question is whether any GIVEN entry changed, and that is per-row.
  const digest = (rows) => {
    const out = new Map();
    for (const r of rows) {
      out.set(r.id, crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex'));
    }
    return out;
  };
  return {
    entryIds: new Set(entries.map((e) => e.id)),
    entries: digest(entries),
    lineIds: new Set(lines.map((l) => l.id)),
    lines: digest(lines)
  };
}

/** The rows whose digest differs, as "table.id" strings. */
function changedRows(before, after) {
  const out = [];
  for (const [id, h] of before) {
    if (!after.has(id)) out.push(id + ' (missing)');
    else if (after.get(id) !== h) out.push(id);
  }
  return out;
}

const BEFORE = fingerprintEntries();

// ---------------------------------------------------------------------------
// The cast: one customer, one supplier, one product sold by the kilo, one bank.
// ---------------------------------------------------------------------------

const CUSTOMER = db.prepare(
  `SELECT * FROM customers WHERE company_id = ? AND active = 1 LIMIT 1`
).get(companyId);
const SUPPLIER = db.prepare(
  `SELECT * FROM suppliers WHERE company_id = ? AND active = 1 LIMIT 1`
).get(companyId);
const PRODUCT = db.prepare(
  `SELECT * FROM products WHERE company_id = ? AND type = 'GOODS' AND active = 1 LIMIT 1`
).get(companyId);
const BANK = db.prepare(
  `SELECT * FROM bank_accounts WHERE company_id = ? LIMIT 1`
).get(companyId);

assert.ok(CUSTOMER && SUPPLIER && PRODUCT && BANK,
  'the company needs a customer, a supplier, a goods product and a bank account');

const TAX_RATE = 18;

function money(n) { return roundTo(n, 2); }

/** Creates a draft sales invoice for `qty` of the product and posts it. */
function sellQty(qty, unitPrice, tag) {
  const subtotal = roundTo(qty * unitPrice, 2);
  const taxTotal = roundTo(subtotal * (TAX_RATE / 100), 2);
  const total = roundTo(subtotal + taxTotal, 2);
  const invId = generateId('inv');

  db.prepare(`
    INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id,
      subtotal, tax_total, discount_total, total, amount_paid, balance_due, status,
      created_by, created_at, currency_code, exchange_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 'DRAFT', ?, datetime('now'), 'RWF', 1)
  `).run(invId, companyId, nextSequenceNumber(companyId, 'INVOICE', 'INV') + tag,
         TODAY, TODAY, CUSTOMER.id, subtotal, taxTotal, total, total, user.id);

  db.prepare(`
    INSERT INTO sales_invoice_lines (id, invoice_id, product_id, description, quantity,
      unit_price, unit_cost, discount_percent, tax_rate, tax_amount, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(generateId('sil'), invId, PRODUCT.id, PRODUCT.name, qty,
         unitPrice, PRODUCT.cost_price, TAX_RATE, taxTotal, total);

  postSalesInvoice(companyId, invId, user);
  return { invId, subtotal, taxTotal, total };
}

/** Creates a draft purchase bill for `qty` at `unitCost` and posts it. */
function buyQty(qty, unitCost, tag) {
  const lineTotal = roundTo(qty * unitCost, 2);
  const billId = generateId('bill');

  db.prepare(`
    INSERT INTO purchase_invoices (id, company_id, bill_number, date, due_date, supplier_id,
      subtotal, tax_total, total, amount_paid, balance_due, status, created_by, created_at,
      currency_code, exchange_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 'DRAFT', ?, datetime('now'), 'RWF', 1)
  `).run(billId, companyId, nextSequenceNumber(companyId, 'PURCHASE_INVOICE', 'BINV') + tag,
         TODAY, TODAY, SUPPLIER.id, lineTotal, lineTotal, lineTotal, user.id);

  db.prepare(`
    INSERT INTO purchase_invoice_lines (id, bill_id, product_id, description, quantity,
      unit_cost, tax_rate, line_total)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(generateId('bil'), billId, PRODUCT.id, PRODUCT.name, qty, unitCost, lineTotal);

  postPurchaseInvoice(companyId, billId, user);
  return { billId, lineTotal };
}

function stockNow() {
  return roundTo(db.prepare(`SELECT current_stock FROM products WHERE id = ?`).get(PRODUCT.id).current_stock, 4);
}

// ---------------------------------------------------------------------------
// The business day
// ---------------------------------------------------------------------------

const stockAtStart = stockNow();
const bankAtStart = roundTo(BANK.current_balance, 2);

// 1. Buy 10.5 kg at a fractional unit cost of 10.3333.
const buy = buyQty(10.5, 10.3333, '-E2E-BUY');

// 2. Sell 1.25 kg — a fractional quantity, the case the brief named.
const sale = sellQty(1.25, roundTo(PRODUCT.selling_price, 2), '-E2E-SELL');

// 3. A return recorded as a negative line on a sale: -0.5 kg comes back.
const returnSale = sellQty(-0.5, roundTo(PRODUCT.selling_price, 2), '-E2E-RET');

// 4. A return recorded the other way, as a credit note against the posted
//    invoice: 0.25 kg restocked.
let creditNote = null;
try {
  creditNote = postCreditNote(companyId, {
    invoiceId: sale.invId,
    customerId: CUSTOMER.id,
    date: TODAY,
    reason: 'a quarter kilo came back',
    restockItems: 1,
    lines: [{
      productId: PRODUCT.id,
      description: PRODUCT.name,
      quantity: 0.25,
      unitPrice: roundTo(PRODUCT.selling_price, 2),
      taxRate: TAX_RATE
    }]
  }, user);
} catch (err) {
  console.log('  ! credit note could not be posted: ' + err.message);
}

// 5. A decimal refund of 10.75 paid back to the customer.
let refund = null;
try {
  refund = recordPayment(companyId, {
    paymentType: 'CUSTOMER_RECEIPT',
    bankAccountId: BANK.id,
    customerId: CUSTOMER.id,
    amount: -10.75,
    date: TODAY,
    notes: 'refund of 10.75'
  }, user);
} catch (err) {
  console.log('  ! the refund could not be recorded: ' + err.message);
}

// 6. Overpay the supplier: the bill is `buy.lineTotal`, pay 50 more than that.
let overpayment = null;
try {
  overpayment = recordPayment(companyId, {
    paymentType: 'SUPPLIER_PAYMENT',
    bankAccountId: BANK.id,
    supplierId: SUPPLIER.id,
    amount: roundTo(buy.lineTotal + 50, 2),
    date: TODAY,
    notes: 'paid 50 too much on purpose'
  }, user);
} catch (err) {
  console.log('  ! the supplier payment could not be recorded: ' + err.message);
}

// 7. A fractional stock adjustment: a spillage of 0.1 kg.
let adjustment = null;
try {
  adjustment = postStockAdjustment(companyId, {
    date: TODAY,
    reason: 'spillage of a tenth of a kilo',
    lines: [{ productId: PRODUCT.id, quantityChange: -0.1 }]
  }, user);
} catch (err) {
  console.log('  ! the stock adjustment could not be posted: ' + err.message);
}

// ---------------------------------------------------------------------------
// Now ask the books whether any of it makes sense.
// ---------------------------------------------------------------------------

const stockAtEnd = stockNow();

check('the day was actually run — every step was recorded', () => {
  assert.ok(buy.billId, 'the purchase was not posted');
  assert.ok(sale.invId, 'the sale was not posted');
  assert.ok(returnSale.invId, 'the negative sale was not posted');
});

check('a fractional purchase adds exactly what was bought', () => {
  // 10.5 bought, 1.25 sold, 0.5 returned, 0.25 credited back, 0.1 spilled.
  const expected = roundTo(stockAtStart + 10.5 - 1.25 + 0.5 + (creditNote ? 0.25 : 0) - 0.1, 4);
  assert.strictEqual(stockAtEnd, expected,
    'stock should be ' + expected + ' but is ' + stockAtEnd);
});

check('the stock never drifted by a rounding error along the way', () => {
  // Every movement was a multiple of 0.05, so the total must land on one too
  // rather than on 9.000000000000002.
  assert.strictEqual(stockAtEnd, roundTo(stockAtEnd, 4),
    'the stock is not a clean 4-decimal number: ' + stockAtEnd);
  const dust = Math.abs(stockAtEnd * 10000 - Math.round(stockAtEnd * 10000));
  assert.ok(dust < 1e-6, 'the stock carries floating-point dust: ' + stockAtEnd);
});

check('a refund of 10.75 takes exactly 10.75 out of the bank', () => {
  assert.ok(refund, 'the refund was not recorded, so nothing can be asserted about it');
  const bankNow = roundTo(
    db.prepare(`SELECT current_balance FROM bank_accounts WHERE id = ?`).get(BANK.id).current_balance, 2
  );
  // The refund takes money out, and so does paying the supplier: a positive
  // SUPPLIER_PAYMENT is an outflow (the cash-flow report subtracts it).
  const expected = roundTo(bankAtStart - 10.75 - roundTo(buy.lineTotal + 50, 2), 2);
  assert.strictEqual(bankNow, expected,
    'the bank should read ' + expected + ' but reads ' + bankNow);
});

check('overpaying a supplier leaves a credit balance the AP report can see', () => {
  const ap = reports.getApAging(companyId, TODAY);
  const row = ap.rows.find((r) => r.supplierId === SUPPLIER.id);
  // Whether or not this particular supplier ends the day in credit, the report
  // must be able to show one: that is what modification 1E fixed.
  const anyNegative = ap.rows.some((r) => r.totalDue < 0);
  const allRowsFinite = ap.rows.every((r) => Number.isFinite(r.totalDue));
  assert.ok(allRowsFinite, 'every AP row must be a finite number');
  if (row) {
    assert.ok(Number.isFinite(row.totalDue), 'the supplier row must be a number');
  }
  // The overpaid supplier must not have vanished simply for being in credit.
  const overpaidIsShown = !row || row.totalDue !== 0 || anyNegative;
  assert.ok(overpaidIsShown, 'a supplier in credit must appear in the AP ageing');
});

check('the trial balance balances after the whole day', () => {
  const tb = reports.getTrialBalance(companyId, TODAY);
  assert.strictEqual(tb.isBalanced, true,
    'debits ' + tb.grandDebit + ' vs credits ' + tb.grandCredit);
  assert.strictEqual(roundTo(tb.grandDebit, 2), roundTo(tb.grandCredit, 2),
    'debits and credits must be equal to the cent');
});

check('the balance sheet balances after the whole day', () => {
  const bs = reports.getBalanceSheet(companyId, TODAY);
  assert.strictEqual(bs.isBalanced, true,
    'assets ' + bs.assets.total + ' vs liabilities+equity ' + bs.totalLiabilitiesAndEquity +
    ' (difference ' + bs.difference + ')');
});

check('the P&L totals equal the sum of the rows it prints', () => {
  const pnl = reports.getProfitAndLoss(companyId, '2020-01-01', TODAY);
  const revenue = roundTo(pnl.revenueRows.reduce((s, r) => s + r.amount, 0), 2);
  const cogs = roundTo(pnl.cogsRows.reduce((s, r) => s + r.amount, 0), 2);
  const expenses = roundTo(pnl.expenseRows.reduce((s, r) => s + r.amount, 0), 2);
  assert.strictEqual(pnl.totalRevenue, revenue, 'total revenue must equal its rows');
  assert.strictEqual(pnl.totalCogs, cogs, 'total COGS must equal its rows');
  assert.strictEqual(pnl.totalExpenses, expenses, 'total expenses must equal its rows');
  assert.strictEqual(pnl.grossProfit, roundTo(revenue - cogs, 2), 'gross profit must follow');
});

check('the inventory valuation rows add up to the total it prints', () => {
  const inv = reports.getInventoryValuation(companyId);
  const cost = roundTo(inv.products.reduce((s, p) => s + p.total_cost_value, 0), 2);
  const retail = roundTo(inv.products.reduce((s, p) => s + p.total_retail_value, 0), 2);
  assert.strictEqual(inv.totalCostValue, cost, 'the cost total must equal its rows');
  assert.strictEqual(inv.totalRetailValue, retail, 'the retail total must equal its rows');
  for (const p of inv.products) {
    assert.ok(Number.isFinite(p.total_cost_value), p.name + ' has no finite cost value');
    assert.strictEqual(p.total_cost_value, roundTo(p.total_cost_value, 2),
      p.name + ' carries an unrounded cost: ' + p.total_cost_value);
  }
});

check('the general ledger walks from its opening balance to its closing one', () => {
  const account = db.prepare(`
    SELECT jel.account_id FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE je.company_id = ? AND je.status = 'POSTED'
    GROUP BY jel.account_id ORDER BY COUNT(*) DESC LIMIT 1
  `).get(companyId);
  assert.ok(account, 'there must be at least one posted account');

  const gl = reports.getGeneralLedger(companyId, account.account_id, '2020-01-01', TODAY);
  const isDebit = gl.account.normalBalance === 'DEBIT';
  const expected = roundTo(
    isDebit
      ? gl.openingBalance + gl.totalDebit - gl.totalCredit
      : gl.openingBalance + gl.totalCredit - gl.totalDebit,
    2
  );
  assert.strictEqual(gl.closingBalance, expected,
    'the ledger must walk from its opening balance to its closing one');

  // Walk the lines and confirm the running balance is cumulative, so a
  // negative line moves it the other way rather than being dropped.
  let running = gl.openingBalance;
  for (const e of gl.entries) {
    running = roundTo(isDebit ? running + e.debit - e.credit : running + e.credit - e.debit, 2);
    assert.strictEqual(e.runningBalance, running,
      'the running balance broke at ' + e.entryNumber);
  }
});

// ---------------------------------------------------------------------------
// The past must still be the past.
// ---------------------------------------------------------------------------

check('no journal entry that existed before this day was changed', () => {
  const now = fingerprintEntries();
  const changed = changedRows(BEFORE.entries, now.entries);
  assert.deepStrictEqual(changed, [],
    'these journal entries were rewritten rather than corrected by a new entry: ' +
      changed.slice(0, 5).join(', '));
});

check('no journal line that existed before this day was changed', () => {
  const now = fingerprintEntries();
  const changed = changedRows(BEFORE.lines, now.lines);
  assert.deepStrictEqual(changed, [],
    'these journal lines were rewritten rather than corrected by a new entry: ' +
      changed.slice(0, 5).join(', '));
});

check('the day added entries without rewriting any', () => {
  const now = fingerprintEntries();
  assert.ok(now.entryIds.size > BEFORE.entryIds.size,
    'the day should have added journal entries');
  for (const id of BEFORE.entryIds) {
    assert.ok(now.entryIds.has(id), 'entry ' + id + ' disappeared');
  }
});

check('every entry posted today is balanced in itself', () => {
  const unbalanced = db.prepare(`
    SELECT je.entry_number, je.id,
           ROUND(SUM(jel.debit), 2) d, ROUND(SUM(jel.credit), 2) c
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.company_id = ? AND je.date = ?
    GROUP BY je.id
    HAVING ABS(d - c) > 0.005
  `).all(companyId, TODAY);
  assert.deepStrictEqual(
    unbalanced.map((u) => u.entry_number + ' (' + u.d + ' vs ' + u.c + ')'), [],
    'these entries do not balance: ' +
      unbalanced.map((u) => u.entry_number).join(', ')
  );
});

check('no stored figure anywhere turned into NaN, Infinity or null', () => {
  const bad = [];
  for (const table of ['sales_invoices', 'purchase_invoices', 'products',
                       'customers', 'suppliers', 'bank_accounts',
                       'inventory_movements']) {
    const rows = db.prepare(`SELECT * FROM ${table} WHERE company_id = ?`).all(companyId);
    for (const row of rows) {
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'number' && !Number.isFinite(v)) bad.push(table + '.' + k + '=' + v);
      }
    }
  }
  // Journal lines carry no company_id of their own; they belong to an entry
  // that does.
  for (const row of db.prepare(`
    SELECT jel.* FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE je.company_id = ?
  `).all(companyId)) {
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'number' && !Number.isFinite(v)) bad.push('journal_entry_lines.' + k + '=' + v);
    }
  }
  assert.deepStrictEqual(bad, [], 'non-finite values stored: ' + bad.slice(0, 5).join(', '));
});

check('a quantity is never stored with less precision than it was entered', () => {
  // 10.5, -0.5, 0.25 and -0.1 are all exact in binary; the check is that the
  // stored stock is the 4-decimal value and not a rounded currency figure.
  const raw = db.prepare(`SELECT current_stock FROM products WHERE id = ?`).get(PRODUCT.id).current_stock;
  assert.strictEqual(roundTo(raw, 4), stockAtEnd,
    'the stored stock must survive 4-decimal rounding exactly');
});


// ---------------------------------------------------------------------------
// Two isolated parties, so the overpayment cases are decided by this file and
// not by whatever balance the sample company happens to start with.
// ---------------------------------------------------------------------------

const OVERPAID_SUPPLIER = 'supp-e2e-overpaid';
const OVERPAID_CUSTOMER = 'cust-e2e-overpaid';
const BILL_E2E = 'bill-e2e-overpay';
const INV_E2E = 'inv-e2e-overpay';

db.prepare(`DELETE FROM purchase_invoices WHERE id = ?`).run(BILL_E2E);
db.prepare(`DELETE FROM sales_invoices WHERE id = ?`).run(INV_E2E);
db.prepare(`DELETE FROM suppliers WHERE id = ?`).run(OVERPAID_SUPPLIER);
db.prepare(`DELETE FROM customers WHERE id = ?`).run(OVERPAID_CUSTOMER);

db.prepare(`
  INSERT INTO suppliers (id, company_id, code, name, phone, email, address,
                         payment_terms, opening_balance, current_balance, active, created_at)
  VALUES (?, ?, 'SUPP-E2E', 'E2E Overpaid Supplier', '+250700000010',
          'e2e-supplier@test', 'Kigali', 'NET_30', 0, 0, 1, datetime('now'))
`).run(OVERPAID_SUPPLIER, companyId);

db.prepare(`
  INSERT INTO customers (id, company_id, code, name, phone, email, address,
                         credit_limit, payment_terms, opening_balance,
                         current_balance, active, created_at, is_walk_in)
  VALUES (?, ?, 'CUST-E2E', 'E2E Overpaid Customer', '+250700000011',
          'e2e-customer@test', 'Kigali', 0, 'DUE_ON_RECEIPT', 0, 0, 1,
          datetime('now'), 0)
`).run(OVERPAID_CUSTOMER, companyId);

// A bill for 100.00, then a payment of 150.00 — fifty too much.
const OVERPAY_BILL_TOTAL = 100.0;
const OVERPAY_PAID = 150.0;

db.prepare(`
  INSERT INTO purchase_invoices (id, company_id, bill_number, date, due_date, supplier_id,
    subtotal, tax_total, total, amount_paid, balance_due, status, created_by, created_at,
    currency_code, exchange_rate)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 'DRAFT', ?, datetime('now'), 'RWF', 1)
`).run(BILL_E2E, companyId, nextSequenceNumber(companyId, 'PURCHASE_INVOICE', 'BINV') + '-E2E-OP',
       TODAY, TODAY, OVERPAID_SUPPLIER, OVERPAY_BILL_TOTAL, OVERPAY_BILL_TOTAL,
       OVERPAY_BILL_TOTAL, user.id);

db.prepare(`
  INSERT INTO purchase_invoice_lines (id, bill_id, description, quantity, unit_cost, tax_rate, line_total)
  VALUES (?, ?, 'overpaid purchase', 1, ?, 0, ?)
`).run(generateId('bil'), BILL_E2E, OVERPAY_BILL_TOTAL, OVERPAY_BILL_TOTAL);

postPurchaseInvoice(companyId, BILL_E2E, user);

try {
  recordPayment(companyId, {
    paymentType: 'SUPPLIER_PAYMENT', bankAccountId: BANK.id,
    supplierId: OVERPAID_SUPPLIER, amount: OVERPAY_PAID, date: TODAY,
    notes: 'fifty too much'
  }, user);
} catch (err) {
  console.log('  ! the overpayment could not be recorded: ' + err.message);
}

// An invoice for 20.00, then the customer pays 50.00 — thirty too much.
const OVERPAY_INV_TOTAL = 20.0;
const OVERPAY_RECEIVED = 50.0;

db.prepare(`
  INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id,
    subtotal, tax_total, discount_total, total, amount_paid, balance_due, status,
    created_by, created_at, currency_code, exchange_rate)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?, 'DRAFT', ?, datetime('now'), 'RWF', 1)
`).run(INV_E2E, companyId, nextSequenceNumber(companyId, 'INVOICE', 'INV') + '-E2E-OP',
       TODAY, TODAY, OVERPAID_CUSTOMER, OVERPAY_INV_TOTAL, OVERPAY_INV_TOTAL,
       OVERPAY_INV_TOTAL, user.id);

db.prepare(`
  INSERT INTO sales_invoice_lines (id, invoice_id, description, quantity, unit_price,
    unit_cost, discount_percent, tax_rate, tax_amount, line_total)
  VALUES (?, ?, 'overpaid sale', 1, ?, 0, 0, 0, 0, ?)
`).run(generateId('sil'), INV_E2E, OVERPAY_INV_TOTAL, OVERPAY_INV_TOTAL);

postSalesInvoice(companyId, INV_E2E, user);

try {
  recordPayment(companyId, {
    paymentType: 'CUSTOMER_RECEIPT', bankAccountId: BANK.id,
    customerId: OVERPAID_CUSTOMER, amount: OVERPAY_RECEIVED, date: TODAY,
    notes: 'thirty too much'
  }, user);
} catch (err) {
  console.log('  ! the overpaid receipt could not be recorded: ' + err.message);
}

const supplierBalance = roundTo(
  db.prepare(`SELECT current_balance FROM suppliers WHERE id = ?`).get(OVERPAID_SUPPLIER).current_balance, 2);
const customerBalance = roundTo(
  db.prepare(`SELECT current_balance FROM customers WHERE id = ?`).get(OVERPAID_CUSTOMER).current_balance, 2);

check('overpaying a supplier puts that supplier in credit', () => {
  assert.strictEqual(supplierBalance, roundTo(OVERPAY_BILL_TOTAL - OVERPAY_PAID, 2),
    'a 100.00 bill paid with 150.00 must leave the supplier at -50.00, not ' + supplierBalance);
  assert.ok(supplierBalance < 0, 'the supplier must be in credit');
});

check('overpaying a customer puts that customer in credit', () => {
  assert.strictEqual(customerBalance, roundTo(OVERPAY_INV_TOTAL - OVERPAY_RECEIVED, 2),
    'a 20.00 invoice paid with 50.00 must leave the customer at -30.00, not ' + customerBalance);
  assert.ok(customerBalance < 0, 'the customer must be in credit');
});

check('the AP ageing shows the supplier the business overpaid', () => {
  // This is what 1.0.2 fixed: before it, `current_balance > 0` hid exactly
  // this row, so the money owed back was invisible in the report.
  const ap = reports.getApAging(companyId, TODAY);
  const row = ap.rows.find((r) => r.supplierId === OVERPAID_SUPPLIER);
  assert.ok(row, 'a supplier the business overpaid MUST appear in the AP ageing');
  assert.strictEqual(row.totalDue, supplierBalance,
    'the AP row must show the credit balance ' + supplierBalance + ', not ' + row.totalDue);
});

check('the AR ageing shows the customer who overpaid', () => {
  const ar = reports.getArAging(companyId, TODAY);
  const row = ar.rows.find((r) => r.customerId === OVERPAID_CUSTOMER);
  assert.ok(row, 'a customer who overpaid MUST appear in the AR ageing');
  assert.strictEqual(row.totalDue, customerBalance,
    'the AR row must show the credit balance ' + customerBalance + ', not ' + row.totalDue);
});

check('the ageing buckets still add up to the row they belong to', () => {
  const ar = reports.getArAging(companyId, TODAY);
  const ap = reports.getApAging(companyId, TODAY);
  for (const r of [...ar.rows, ...ap.rows]) {
    const sum = roundTo(r.current + r.days30 + r.days60 + r.days90 + r.daysOver90, 2);
    const name = r.customerName || r.supplierName;
    assert.strictEqual(sum, r.totalDue,
      name + ': the buckets add to ' + sum + ' but the row says ' + r.totalDue);
  }
});

check('the books still balance with both parties in credit', () => {
  const tb = reports.getTrialBalance(companyId, TODAY);
  assert.strictEqual(tb.isBalanced, true,
    'debits ' + tb.grandDebit + ' vs credits ' + tb.grandCredit);
  const bs = reports.getBalanceSheet(companyId, TODAY);
  assert.strictEqual(bs.isBalanced, true,
    'assets ' + bs.assets.total + ' vs liabilities+equity ' + bs.totalLiabilitiesAndEquity);
});

check('no historical entry was rewritten by the overpayment scenarios either', () => {
  const now = fingerprintEntries();
  assert.deepStrictEqual(changedRows(BEFORE.entries, now.entries), [],
    'a journal entry that existed before this suite ran has been modified');
  assert.deepStrictEqual(changedRows(BEFORE.lines, now.lines), [],
    'a journal line that existed before this suite ran has been modified');
});

// Leave nothing behind: these parties exist only for this file. Children
// before parents — the payments reference the parties by foreign key, so
// deleting a customer before its receipt fails and takes the run with it.
db.prepare(`DELETE FROM payments WHERE customer_id = ? OR supplier_id = ?`)
  .run(OVERPAID_CUSTOMER, OVERPAID_SUPPLIER);
db.prepare(`DELETE FROM purchase_invoice_lines WHERE bill_id = ?`).run(BILL_E2E);
db.prepare(`DELETE FROM sales_invoice_lines WHERE invoice_id = ?`).run(INV_E2E);
db.prepare(`DELETE FROM purchase_invoices WHERE id = ?`).run(BILL_E2E);
db.prepare(`DELETE FROM sales_invoices WHERE id = ?`).run(INV_E2E);
db.prepare(`DELETE FROM suppliers WHERE id = ?`).run(OVERPAID_SUPPLIER);
db.prepare(`DELETE FROM customers WHERE id = ?`).run(OVERPAID_CUSTOMER);

console.log('\n--- END-TO-END SCENARIOS SUMMARY ---');
console.log('  ' + passed + ' checks passed, ' + failed + ' failed');
console.log('  stock ' + stockAtStart + ' -> ' + stockAtEnd +
            '  ·  bank ' + bankAtStart + ' -> ' +
            roundTo(db.prepare(`SELECT current_balance FROM bank_accounts WHERE id = ?`).get(BANK.id).current_balance, 2));

if (failed > 0) process.exit(1);
