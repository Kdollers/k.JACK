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
  postPurchaseInvoice,
  postStockAdjustment,
  recordPayment,
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

check('a refund is recorded as a negative payment and takes money out of the bank', () => {
  const bank = db.prepare(
    `SELECT * FROM bank_accounts WHERE company_id = ? LIMIT 1`
  ).get(companyId);
  const customer = db.prepare(`SELECT * FROM customers WHERE company_id = ? LIMIT 1`).get(companyId);
  assert.ok(bank, 'the fixture needs a bank account');

  const bankBefore = roundTo(bank.current_balance, 2);
  const refund = -10.75;                   // refunding ten and three quarters

  const posted = recordPayment(companyId, {
    paymentType: 'CUSTOMER_RECEIPT',
    bankAccountId: bank.id,
    customerId: customer.id,
    amount: refund,
    date: new Date().toISOString().split('T')[0],
    reference: 'refund test',
    notes: 'money handed back to the customer'
  }, user);

  const bankAfter = roundTo(
    db.prepare(`SELECT current_balance FROM bank_accounts WHERE id = ?`).get(bank.id).current_balance, 2
  );
  assert.strictEqual(
    bankAfter, roundTo(bankBefore + refund, 2),
    `a ${refund} refund must take that much out of the bank (${bankBefore} -> ${bankAfter})`
  );

  // The journal entry must show the bank CREDITED, not debited a negative.
  const je = db.prepare(`SELECT * FROM journal_entries WHERE id = ?`).get(posted.journalEntryId);
  const lines = db.prepare(`SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?`).all(je.id);
  const bankLines = lines.filter((l) => l.account_id === bank.account_id);
  assert.ok(bankLines.length === 1, 'the bank account must appear on exactly one line');
  assert.ok(
    bankLines[0].credit > 0 && bankLines[0].debit === 0,
    `a refund must credit the bank, got debit ${bankLines[0].debit} credit ${bankLines[0].credit}`
  );
  assert.strictEqual(roundTo(bankLines[0].credit, 2), 10.75, 'the bank credit must be the refund as a positive');
  assert.ok(
    /refund/i.test(je.description),
    `the entry should say it is a refund, it says: ${je.description}`
  );
});

check('a refund cannot give back more than the customer ever paid', () => {
  const bank = db.prepare(`SELECT * FROM bank_accounts WHERE company_id = ? LIMIT 1`).get(companyId);
  const customer = db.prepare(`SELECT * FROM customers WHERE company_id = ? LIMIT 1`).get(companyId);

  // An invoice for 25, paid in full, then a refund of 40 - more than was paid.
  const unitPrice = 25;
  const total = roundTo(unitPrice * 1.18, 2);
  const invId = generateId('inv');
  db.prepare(`
    INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id,
      subtotal, tax_total, discount_total, total, amount_paid, balance_due, status, created_by, created_at)
    VALUES (?, ?, ?, date('now'), date('now'), ?, ?, ?, 0, ?, ?, 0, 'PAID', ?, datetime('now'))
  `).run(invId, companyId, nextSequenceNumber(companyId, 'INVOICE', 'INV'), customer.id,
    unitPrice, roundTo(unitPrice * 0.18, 2), total, total, user.id);

  assert.throws(
    () => recordPayment(companyId, {
      paymentType: 'CUSTOMER_RECEIPT',
      bankAccountId: bank.id,
      customerId: customer.id,
      salesInvoiceId: invId,
      amount: -40,
      date: new Date().toISOString().split('T')[0],
      notes: 'refunding more than was paid'
    }, user),
    /refund more than was paid/i,
    'a refund larger than the amount paid must be refused'
  );
});

check('a zero payment is refused, and a decimal refund is accepted to the cent', () => {
  const bank = db.prepare(`SELECT * FROM bank_accounts WHERE company_id = ? LIMIT 1`).get(companyId);
  const customer = db.prepare(`SELECT * FROM customers WHERE company_id = ? LIMIT 1`).get(companyId);

  assert.throws(
    () => recordPayment(companyId, {
      paymentType: 'CUSTOMER_RECEIPT', bankAccountId: bank.id, customerId: customer.id,
      amount: 0, date: new Date().toISOString().split('T')[0]
    }, user),
    /cannot be zero/i,
    'a zero payment must be refused'
  );

  const before = roundTo(
    db.prepare(`SELECT current_balance FROM bank_accounts WHERE id = ?`).get(bank.id).current_balance, 2
  );
  recordPayment(companyId, {
    paymentType: 'CUSTOMER_RECEIPT', bankAccountId: bank.id, customerId: customer.id,
    amount: -0.25, date: new Date().toISOString().split('T')[0], notes: 'a quarter refunded'
  }, user);
  const after = roundTo(
    db.prepare(`SELECT current_balance FROM bank_accounts WHERE id = ?`).get(bank.id).current_balance, 2
  );
  assert.strictEqual(after, roundTo(before - 0.25, 2), 'a quarter must come off the balance, not a whole unit');
});

// ---------------------------------------------------------------------------
// A purchase correction: the engine must take a negative bill line before the
// form is allowed to offer one.
// ---------------------------------------------------------------------------

check('a purchase bill accepts a negative line as a correction, and reduces stock', () => {
  const supplier = db.prepare(`SELECT * FROM suppliers WHERE company_id = ? LIMIT 1`).get(companyId);
  const product = db.prepare(
    `SELECT * FROM products WHERE company_id = ? AND type = 'GOODS' AND active = 1 LIMIT 1`
  ).get(companyId);
  assert.ok(supplier && product, 'the company needs a supplier and a goods product');

  const stockBefore = roundTo(product.current_stock, 4);
  const correction = -0.25;

  const billId = generateId('bill');
  const billNumber = nextSequenceNumber(companyId, 'PURCHASE_INVOICE', 'BINV');
  const date = new Date().toISOString().split('T')[0];
  db.prepare(`
    INSERT INTO purchase_invoices (id, company_id, bill_number, date, due_date, supplier_id,
                                   subtotal, tax_total, total, amount_paid, balance_due, status,
                                   created_by, created_at, currency_code, exchange_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 'DRAFT', ?, datetime('now'), 'RWF', 1)
  `).run(billId, companyId, billNumber, date, date, supplier.id,
         roundTo(correction * product.cost_price, 2),
         roundTo(correction * product.cost_price, 2),
         roundTo(correction * product.cost_price, 2),
         user.id);

  db.prepare(`
    INSERT INTO purchase_invoice_lines (id, bill_id, product_id, description,
                                        quantity, unit_cost, tax_rate, line_total)
    VALUES (?, ?, ?, 'a quarter unit returned to the supplier', ?, ?, 0, ?)
  `).run(generateId('bil'), billId, product.id, correction, product.cost_price,
         roundTo(correction * product.cost_price, 2));

  const result = postPurchaseInvoice(companyId, billId, user);
  assert.ok(result && result.journalEntryId, 'the correcting bill must post');

  const stockAfter = roundTo(
    db.prepare(`SELECT current_stock FROM products WHERE id = ?`).get(product.id).current_stock, 4
  );
  assert.strictEqual(stockAfter, roundTo(stockBefore + correction, 4),
    'a correction of -0.25 must take exactly 0.25 off the stock, no more');
  // The correction must not drive the stock below zero: the business cannot
  // return goods it no longer holds.
  assert.ok(stockAfter >= 0, 'a correction must not drive stock negative');
});

check('the purchase correction keeps the journal entry balanced', () => {
  const tb = getTrialBalance(companyId);
  assert.strictEqual(tb.isBalanced, true,
    `the correction unbalanced the books: ${tb.grandDebit} vs ${tb.grandCredit}`);
});

check('a purchase of a fractional quantity lands exactly, at a fractional cost', () => {
  // Modification 1C asks for decimal quantities on the purchasing side too,
  // and 1F asks that precision be preserved rather than rounded away: buying
  // an eighth of a unit must add an eighth, not a rounded quarter or nothing.
  const supplier = db.prepare(`SELECT * FROM suppliers WHERE company_id = ? LIMIT 1`).get(companyId);
  const product = db.prepare(
    `SELECT * FROM products WHERE company_id = ? AND type = 'GOODS' AND active = 1 LIMIT 1`
  ).get(companyId);
  assert.ok(supplier && product, 'the company needs a supplier and a goods product');

  const stockBefore = roundTo(product.current_stock, 4);
  const qty = 0.125;
  const unitCost = 10.3333;
  const billId = generateId('bill');
  const billNumber = nextSequenceNumber(companyId, 'PURCHASE_INVOICE', 'BINV') + '-FRAC';
  const date = new Date().toISOString().split('T')[0];
  const lineTotal = roundTo(qty * unitCost, 2);

  db.prepare(`
    INSERT INTO purchase_invoices (id, company_id, bill_number, date, due_date, supplier_id,
                                   subtotal, tax_total, total, amount_paid, balance_due, status,
                                   created_by, created_at, currency_code, exchange_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 'DRAFT', ?, datetime('now'), 'RWF', 1)
  `).run(billId, companyId, billNumber, date, date, supplier.id,
         lineTotal, lineTotal, lineTotal, user.id);

  db.prepare(`
    INSERT INTO purchase_invoice_lines (id, bill_id, product_id, description,
                                        quantity, unit_cost, tax_rate, line_total)
    VALUES (?, ?, ?, 'an eighth of a kilo', ?, ?, 0, ?)
  `).run(generateId('bil'), billId, product.id, qty, unitCost, lineTotal);

  postPurchaseInvoice(companyId, billId, user);

  const stockAfter = roundTo(
    db.prepare(`SELECT current_stock FROM products WHERE id = ?`).get(product.id).current_stock, 4
  );
  assert.strictEqual(stockAfter, roundTo(stockBefore + qty, 4),
    'buying 0.125 must add exactly 0.125 to the stock, not 0.13 and not 0.12');

  const movement = db.prepare(`
    SELECT quantity, unit_cost FROM inventory_movements
    WHERE company_id = ? AND reference_id = ? AND product_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(companyId, billId, product.id);
  assert.ok(movement, 'the fractional purchase must be recorded as a stock movement');
  assert.strictEqual(roundTo(movement.quantity, 4), qty,
    'the movement must carry the fractional quantity');
  assert.strictEqual(roundTo(movement.unit_cost, 4), unitCost,
    'the movement must carry the fractional unit cost');
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

// ---------------------------------------------------------------------------
// The forms: a database that stores -0.5 is no use if the form refuses to let
// it be typed. These checks read the JSX and pin the constraints down, so a
// later edit cannot quietly put a min="1" back on a field that must take a
// half or a minus sign.
// ---------------------------------------------------------------------------

/**
 * Every <input> in a .jsx file, with its attributes. The tag is closed at the
 * first '>' that is not inside braces, so an arrow function in onChange
 * (which contains '=>') does not end the tag early.
 */
function numberInputs(relPath) {
  const full = path.join(__dirname, '..', relPath);
  const src = fs.readFileSync(full, 'utf8');
  const out = [];
  let i = 0;
  while ((i = src.indexOf('<input', i)) !== -1) {
    let depth = 0;
    let j = i + 6;
    for (; j < src.length; j += 1) {
      const ch = src[j];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth <= 0) break;
    }
    const tag = src.slice(i, j + 1);
    if (!/type="number"/.test(tag)) { i = j + 1; continue; }
    const attr = (name) => {
      const m = new RegExp(name + '="([^"]*)"').exec(tag);
      return m ? m[1] : null;
    };
    const valueMatch = /value=\{([^}]*)\}/.exec(tag);
    out.push({
      file: relPath,
      line: src.slice(0, i).split('\n').length,
      value: valueMatch ? valueMatch[1].trim() : '',
      step: attr('step'),
      min: attr('min'),
      max: attr('max')
    });
    i = j + 1;
  }
  return out;
}

const VIEW_FILES = [
  'src/views/SalesView.jsx',
  'src/views/PurchasesView.jsx',
  'src/views/InventoryView.jsx',
  'src/views/AccountingView.jsx',
  'src/views/BankingView.jsx',
  'src/views/CustomersView.jsx'
];

const allInputs = VIEW_FILES.flatMap(numberInputs);

check('the forms were found and parsed', () => {
  assert.ok(allInputs.length > 10,
    'the parser must find the number inputs in the views; found ' + allInputs.length);
});

check('a sale line quantity can be negative or fractional', () => {
  const field = allInputs.find(i => i.file.endsWith('SalesView.jsx') && i.value === 'line.quantity');
  assert.ok(field, 'the sale line quantity input must exist');
  assert.strictEqual(field.min, null,
    'a return is typed as a negative quantity, so the sale quantity must carry no min');
  assert.strictEqual(field.step, 'any',
    'a sale quantity must accept any decimal, not step in whole units');
});

check('a purchase line quantity can carry a negative correction', () => {
  const field = allInputs.find(i => i.file.endsWith('PurchasesView.jsx') && i.value === 'line.quantity');
  assert.ok(field, 'the purchase line quantity input must exist');
  assert.strictEqual(field.min, null,
    'the engine accepts a negative purchase correction, so the form must not block one');
  assert.strictEqual(field.step, 'any', 'a purchase quantity must accept any decimal');
});

check('a stock adjustment can decrease stock by a fraction', () => {
  const field = allInputs.find(
    i => i.file.endsWith('InventoryView.jsx') && i.value === 'adjForm.quantityChange'
  );
  assert.ok(field, 'the stock adjustment quantity input must exist');
  assert.strictEqual(field.min, null,
    'an adjustment must be able to take stock away as well as add it');
});

check('a credit note can be raised for half a unit', () => {
  const field = allInputs.find(
    i => i.file.endsWith('SalesView.jsx') && /creditNoteForm\.lines\[0\]\?\.quantity/.test(i.value)
  );
  assert.ok(field, 'the credit note quantity input must exist');
  assert.ok(Number(field.min) < 1,
    'returning 0.5 kg must be possible; min is ' + field.min);
});

check('no money, cost or price field is locked to two decimals', () => {
  // The company's currency carries a configurable number of decimals (0 to 4),
  // so step="0.01" refuses a precision the rest of JENESIS honours.
  const offenders = allInputs.filter(i => i.step === '0.01');
  assert.deepStrictEqual(
    offenders.map(o => o.file + ':' + o.line + ' (' + o.value + ')'), [],
    'these fields still refuse a third decimal: ' +
      offenders.map(o => o.file + ':' + o.line).join(', ')
  );
});

check('a physical banknote count is still a whole number', () => {
  // Left alone on purpose: a cash count counts pieces of paper. Half a
  // banknote is not a thing, so this field keeps step="1".
  const field = allInputs.find(i => i.file.endsWith('BankingView.jsx') && i.value === 'l.quantity');
  assert.ok(field, 'the cash count quantity input must exist');
  assert.strictEqual(field.step, '1', 'counting banknotes must stay in whole notes');
});

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
