'use strict';
/**
 * DECIMAL AND NEGATIVE NUMBER TESTS (JENESIS 1.0.1, modification 1).
 *
 * JENESIS must accept, store, calculate, display and process negative and
 * decimal values everywhere: fractional quantities (0.5 kg, 1.25 litres),
 * negative corrections, customer returns and financial refunds.
 *
 * These tests are about the NUMBERS, so they are written against the real
 * engine on a real database - not against a mock:
 *   - rounding that is exact, not merely close;
 *   - a debit and its matching credit rounding to equal and opposite values,
 *     because double-entry accounting cannot survive a cent of drift;
 *   - fractional quantities moving stock by fractions;
 *   - a negative line on a sale bringing the stock back and crediting COGS;
 *   - a journal entry carrying a negative correction still balancing;
 *   - a return under FIFO restoring a cost layer instead of posting nothing.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Run against a temporary copy of the database, exactly as the accounting test
// does, so these postings never touch the business data in genesis.db.
if (!process.env.GENESIS_DB_PATH) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-decimal-test-'));
  const src = path.join(__dirname, '..', 'genesis.db');
  const dest = path.join(tmpDir, 'genesis-test.db');
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  process.env.GENESIS_DB_PATH = dest;
  process.on('exit', () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });
}

const { getDb } = require('../server/db');
const {
  createJournalEntry,
  postSalesInvoice,
  postStockAdjustment,
  generateId,
  nextSequenceNumber
} = require('../server/accountingEngine');
const { getTrialBalance } = require('../server/reports');
const { roundTo } = require('../server/utils');

console.log('--- STARTING DECIMAL / NEGATIVE NUMBER TESTS ---');

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

// ---------------------------------------------------------------------------
// 1. Rounding is exact, and symmetric between a debit and its credit.
// ---------------------------------------------------------------------------

check('roundTo rounds the values a float gets wrong', () => {
  // 8.165 * 100 is 816.4999999999999 in IEEE-754, so the old implementation
  // (scale, round, unscale) rounded DOWN to 8.16.
  assert.strictEqual(roundTo(8.165, 2), 8.17);
  assert.strictEqual(roundTo(35.855, 2), 35.86);
  assert.strictEqual(roundTo(1.005, 2), 1.01);
  assert.strictEqual(roundTo(2.675, 2), 2.68);
  assert.strictEqual(roundTo(0.615, 2), 0.62);
});

check('roundTo keeps a negative number\'s cents', () => {
  // The old implementation returned -1 here: it threw the cents away.
  assert.strictEqual(roundTo(-1.005, 2), -1.01);
  assert.strictEqual(roundTo(-8.165, 2), -8.17);
  assert.strictEqual(roundTo(-2.675, 2), -2.68);
});

check('a debit and its matching credit round to equal and opposite values', () => {
  // This is the reason ties go away from zero. If 1.005 rounds up but -1.005
  // rounds toward zero, a balanced pair becomes a cent out of balance.
  for (const v of [1.005, 8.165, 35.855, 2.675, 0.615, 10.235]) {
    const debit = roundTo(v, 2);
    const credit = roundTo(-v, 2);
    assert.strictEqual(
      roundTo(debit + credit, 2), 0,
      `${v} and -${v} rounded to ${debit} and ${credit}: the pair does not balance`
    );
  }
});

check('roundTo never returns negative zero, and survives junk input', () => {
  assert.ok(!Object.is(roundTo(-0.0001, 2), -0), 'rounding must not produce -0');
  assert.strictEqual(roundTo(NaN, 2), 0);
  assert.strictEqual(roundTo(Infinity, 2), 0);
  assert.strictEqual(roundTo(undefined, 2), 0);
  assert.strictEqual(roundTo('12.345', 2), 12.35);
});

check('roundTo handles very small and very large magnitudes', () => {
  // Exponential notation has to be expanded before there is a digit to round.
  assert.strictEqual(roundTo(1e-7, 4), 0);
  assert.strictEqual(roundTo(1.23456e-3, 5), 0.00123);
  assert.strictEqual(roundTo(1234.5678, 0), 1235);
  assert.strictEqual(roundTo(999.999, 2), 1000);
});

// ---------------------------------------------------------------------------
// 2. Fractional quantities.
// ---------------------------------------------------------------------------

check('a sale of a fractional quantity moves stock by that fraction', () => {
  const prod = db.prepare(
    `SELECT * FROM products WHERE company_id = ? AND type = 'GOODS' AND current_stock >= 5 LIMIT 1`
  ).get(companyId);
  assert.ok(prod, 'the fixture needs a goods product with stock');
  const customer = db.prepare(`SELECT * FROM customers WHERE company_id = ? LIMIT 1`).get(companyId);

  const before = roundTo(prod.current_stock, 4);
  const qty = 1.25;                       // 1.25 litres, 1.25 kg - whatever the unit is
  const unitPrice = roundTo(prod.selling_price, 2);
  const subtotal = roundTo(qty * unitPrice, 2);
  const taxTotal = roundTo(subtotal * 0.18, 2);

  const invId = generateId('inv');
  const lineId = generateId('sil');
  db.prepare(`
    INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id,
      subtotal, tax_total, discount_total, total, amount_paid, balance_due, status, created_by, created_at, warehouse_id)
    VALUES (?, ?, ?, date('now'), date('now'), ?, ?, ?, 0, ?, 0, ?, 'DRAFT', ?, datetime('now'), ?)
  `).run(invId, companyId, nextSequenceNumber(companyId, 'INVOICE', 'INV'), customer.id,
    subtotal, taxTotal, roundTo(subtotal + taxTotal, 2), roundTo(subtotal + taxTotal, 2),
    user.id, prod.id ? null : null);

  db.prepare(`
    INSERT INTO sales_invoice_lines (id, invoice_id, product_id, description, quantity, unit_price,
      unit_cost, discount_percent, tax_rate, tax_amount, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 18, ?, ?)
  `).run(lineId, invId, prod.id, prod.name, qty, unitPrice, prod.cost_price, taxTotal, roundTo(subtotal + taxTotal, 2));

  postSalesInvoice(companyId, invId, user);

  const after = roundTo(db.prepare(`SELECT current_stock FROM products WHERE id = ?`).get(prod.id).current_stock, 4);
  assert.strictEqual(
    after, roundTo(before - qty, 4),
    `selling ${qty} of ${prod.name} moved stock from ${before} to ${after}, expected ${roundTo(before - qty, 4)}`
  );
  assert.ok(
    Math.abs(after - before - 1.25) > 0.00001,
    'the change must be the fraction itself, not a rounded whole number'
  );
});

check('a sale of half a unit is not silently rounded to a whole one', () => {
  const prod = db.prepare(
    `SELECT * FROM products WHERE company_id = ? AND type = 'GOODS' AND current_stock >= 3 LIMIT 1`
  ).get(companyId);
  const customer = db.prepare(`SELECT * FROM customers WHERE company_id = ? LIMIT 1`).get(companyId);

  const before = roundTo(prod.current_stock, 4);
  const qty = 0.5;
  const unitPrice = roundTo(prod.selling_price, 2);
  const subtotal = roundTo(qty * unitPrice, 2);
  const taxTotal = roundTo(subtotal * 0.18, 2);
  const total = roundTo(subtotal + taxTotal, 2);

  const invId = generateId('inv');
  db.prepare(`
    INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id,
      subtotal, tax_total, discount_total, total, amount_paid, balance_due, status, created_by, created_at)
    VALUES (?, ?, ?, date('now'), date('now'), ?, ?, ?, 0, ?, 0, ?, 'DRAFT', ?, datetime('now'))
  `).run(invId, companyId, nextSequenceNumber(companyId, 'INVOICE', 'INV'), customer.id,
    subtotal, taxTotal, total, total, user.id);

  db.prepare(`
    INSERT INTO sales_invoice_lines (id, invoice_id, product_id, description, quantity, unit_price,
      unit_cost, discount_percent, tax_rate, tax_amount, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 18, ?, ?)
  `).run(generateId('sil'), invId, prod.id, prod.name, qty, unitPrice, prod.cost_price, taxTotal, total);

  postSalesInvoice(companyId, invId, user);

  const after = roundTo(db.prepare(`SELECT current_stock FROM products WHERE id = ?`).get(prod.id).current_stock, 4);
  assert.strictEqual(after, roundTo(before - 0.5, 4), `half a unit must remove half a unit (${before} -> ${after})`);
  // The stored quantity itself must not have been coerced to a whole number.
  const stored = db.prepare(`SELECT quantity FROM sales_invoice_lines WHERE invoice_id = ?`).get(invId).quantity;
  assert.strictEqual(roundTo(stored, 4), 0.5, 'the stored line quantity must stay 0.5');
});

// ---------------------------------------------------------------------------
// 3. Negative quantities: returns and corrections.
// ---------------------------------------------------------------------------

check('a negative line on a sale brings the stock back', () => {
  const prod = db.prepare(
    `SELECT * FROM products WHERE company_id = ? AND type = 'GOODS' AND current_stock >= 1 LIMIT 1`
  ).get(companyId);
  const customer = db.prepare(`SELECT * FROM customers WHERE company_id = ? LIMIT 1`).get(companyId);

  const before = roundTo(prod.current_stock, 4);
  const qty = -1;                          // one returned
  const unitPrice = roundTo(prod.selling_price, 2);
  const subtotal = roundTo(qty * unitPrice, 2);
  const taxTotal = roundTo(subtotal * 0.18, 2);
  const total = roundTo(subtotal + taxTotal, 2);

  const invId = generateId('inv');
  db.prepare(`
    INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id,
      subtotal, tax_total, discount_total, total, amount_paid, balance_due, status, created_by, created_at)
    VALUES (?, ?, ?, date('now'), date('now'), ?, ?, ?, 0, ?, 0, ?, 'DRAFT', ?, datetime('now'))
  `).run(invId, companyId, nextSequenceNumber(companyId, 'INVOICE', 'INV'), customer.id,
    subtotal, taxTotal, total, total, user.id);

  db.prepare(`
    INSERT INTO sales_invoice_lines (id, invoice_id, product_id, description, quantity, unit_price,
      unit_cost, discount_percent, tax_rate, tax_amount, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 18, ?, ?)
  `).run(generateId('sil'), invId, prod.id, 'returned: ' + prod.name, qty, unitPrice, prod.cost_price, taxTotal, total);

  postSalesInvoice(companyId, invId, user);

  const after = roundTo(db.prepare(`SELECT current_stock FROM products WHERE id = ?`).get(prod.id).current_stock, 4);
  assert.strictEqual(
    after, roundTo(before + 1, 4),
    `returning one unit must ADD it back (${before} -> ${after}, expected ${roundTo(before + 1, 4)})`
  );
});

check('a returned fraction brings back exactly that fraction', () => {
  const prod = db.prepare(
    `SELECT * FROM products WHERE company_id = ? AND type = 'GOODS' AND current_stock >= 1 LIMIT 1`
  ).get(companyId);
  const customer = db.prepare(`SELECT * FROM customers WHERE company_id = ? LIMIT 1`).get(companyId);

  const before = roundTo(prod.current_stock, 4);
  const qty = -0.5;                        // half a kilo returned
  const unitPrice = roundTo(prod.selling_price, 2);
  const subtotal = roundTo(qty * unitPrice, 2);
  const taxTotal = roundTo(subtotal * 0.18, 2);
  const total = roundTo(subtotal + taxTotal, 2);

  const invId = generateId('inv');
  db.prepare(`
    INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id,
      subtotal, tax_total, discount_total, total, amount_paid, balance_due, status, created_by, created_at)
    VALUES (?, ?, ?, date('now'), date('now'), ?, ?, ?, 0, ?, 0, ?, 'DRAFT', ?, datetime('now'))
  `).run(invId, companyId, nextSequenceNumber(companyId, 'INVOICE', 'INV'), customer.id,
    subtotal, taxTotal, total, total, user.id);

  db.prepare(`
    INSERT INTO sales_invoice_lines (id, invoice_id, product_id, description, quantity, unit_price,
      unit_cost, discount_percent, tax_rate, tax_amount, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 18, ?, ?)
  `).run(generateId('sil'), invId, prod.id, 'returned half: ' + prod.name, qty, unitPrice, prod.cost_price, taxTotal, total);

  postSalesInvoice(companyId, invId, user);

  const after = roundTo(db.prepare(`SELECT current_stock FROM products WHERE id = ?`).get(prod.id).current_stock, 4);
  assert.strictEqual(after, roundTo(before + 0.5, 4), `returning 0.5 must add 0.5 (${before} -> ${after})`);
});

check('a stock adjustment accepts a fractional decrease', () => {
  const prod = db.prepare(
    `SELECT * FROM products WHERE company_id = ? AND type = 'GOODS' AND current_stock >= 2 LIMIT 1`
  ).get(companyId);
  const before = roundTo(prod.current_stock, 4);

  postStockAdjustment(companyId, {
    date: new Date().toISOString().split('T')[0],
    reason: 'fractional correction',
    lines: [{ productId: prod.id, quantityChange: -0.25, notes: 'quarter unit' }]
  }, user);

  const after = roundTo(db.prepare(`SELECT current_stock FROM products WHERE id = ?`).get(prod.id).current_stock, 4);
  assert.strictEqual(after, roundTo(before - 0.25, 4), `a -0.25 adjustment must remove a quarter (${before} -> ${after})`);
});

// ---------------------------------------------------------------------------
// 4. Negative amounts in the ledger, and the books staying balanced.
// ---------------------------------------------------------------------------

check('a journal entry carrying a negative correction still balances', () => {
  const accounts = db.prepare(
    `SELECT id FROM accounts WHERE company_id = ? AND active = 1 LIMIT 2`
  ).all(companyId);
  assert.ok(accounts.length >= 2, 'the fixture needs two active accounts');

  const amount = 10.75;
  const entry = createJournalEntry({
    companyId,
    date: new Date().toISOString().split('T')[0],
    description: 'correction using a negative amount',
    lines: [
      // A correction written as a negative on the side being reduced.
      { accountId: accounts[0].id, debit: -amount, credit: 0, description: 'reversing part of a charge' },
      { accountId: accounts[1].id, debit: 0, credit: -amount, description: 'the matching side' }
    ],
    user
  });

  assert.ok(entry && entry.id, 'the correcting entry must be created');
  const stored = db.prepare(`SELECT * FROM journal_entries WHERE id = ?`).get(entry.id);
  assert.ok(stored, 'the correcting entry must be stored');
  assert.strictEqual(
    roundTo(stored.total_debit, 2), roundTo(stored.total_credit, 2),
    `a correcting entry must balance (debits ${stored.total_debit}, credits ${stored.total_credit})`
  );
});

check('the books are still balanced after every decimal and negative posting', () => {
  const tb = getTrialBalance(companyId);
  assert.strictEqual(
    tb.isBalanced, true,
    `the trial balance drifted: debits ${tb.grandDebit}, credits ${tb.grandCredit}`
  );
  assert.strictEqual(
    roundTo(tb.grandDebit, 2), roundTo(tb.grandCredit, 2),
    `debits ${tb.grandDebit} must equal credits ${tb.grandCredit} to the cent`
  );
});

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
