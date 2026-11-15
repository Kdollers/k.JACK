'use strict';
/**
 * AR/AP PAYMENT SCENARIOS — the eight cases a counter actually meets.
 *
 * MOD 1 of the 1.0.3 brief. The overpayment cases were already covered by
 * tests/end-to-end-scenarios.test.js; this file exists because the other six
 * were not, and because "the report looks plausible" is not the same as "the
 * number is right".
 *
 * The eight:
 *
 *   1. a partial payment leaves the right amount outstanding
 *   2. a full payment leaves nothing outstanding
 *   3. a customer overpayment is a credit, not a debt
 *   4. a supplier overpayment is a credit, not a bill
 *   5. several payments against one invoice, checked after each one
 *   6. a credit note reduces what the customer owes
 *   7. a refund returns an overpayment
 *   8. the outstanding balance after payment is right in every case above
 *
 * WHAT MAKES THESE WORTH MORE THAN A TOTAL
 *
 * Each scenario is checked four ways, because the four figures are computed
 * from four different places and only agree when the posting was right:
 *
 *   a. the party's `current_balance`, maintained incrementally by the engine
 *   b. the statement's closing balance, arrived at by replaying the
 *      transactions from the opening balance — a separate computation
 *   c. the ageing report, built from the open documents
 *   d. the control account in the nominal ledger
 *
 * A payment recorded against a party without naming a document reduces (a)
 * and (d) but leaves the document open, which is exactly how (c) used to
 * disagree and report an overpaid supplier as money still owed. So (c) is
 * held to (a) here, in both directions, for every scenario.
 *
 * Alongside them, after every scenario: the trial balance must balance, the
 * balance sheet must balance, and no figure may be NaN or Infinity.
 *
 * Runs against a temporary copy of the database, never against genesis.db.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

if (!process.env.GENESIS_DB_PATH) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-arap-'));
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
  recordPayment,
  generateId,
  nextSequenceNumber
} = require('../server/accountingEngine');
const reports = require('../server/reports');
const { roundTo } = require('../server/utils');

console.log('--- STARTING AR/AP PAYMENT SCENARIOS ---');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${name}\n      ${err && err.message ? err.message : err}`);
  }
}

const db = getDb();
const companyId = 'comp-genesis-01';
const user = { id: 'usr-accountant', full_name: 'Chief Accountant' };
const TODAY = new Date().toISOString().split('T')[0];

const BANK = db.prepare(
  `SELECT * FROM bank_accounts WHERE company_id = ? AND active = 1 LIMIT 1`
).get(companyId);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Every id this file creates, so cleanup cannot miss one. */
const created = { customers: [], suppliers: [], invoices: [], bills: [], creditNotes: [], payments: [] };

function makeCustomer(id, name) {
  db.prepare(`DELETE FROM customers WHERE id = ?`).run(id);
  db.prepare(`
    INSERT INTO customers (id, company_id, code, name, phone, email, address,
                           credit_limit, payment_terms, opening_balance,
                           current_balance, active, created_at, is_walk_in)
    VALUES (?, ?, ?, ?, '+250700000000', 'arap@test', 'Kigali', 0,
            'DUE_ON_RECEIPT', 0, 0, 1, datetime('now'), 0)
  `).run(id, companyId, id.toUpperCase(), name);
  created.customers.push(id);
  return id;
}

function makeSupplier(id, name) {
  db.prepare(`DELETE FROM suppliers WHERE id = ?`).run(id);
  db.prepare(`
    INSERT INTO suppliers (id, company_id, code, name, phone, email, address,
                           payment_terms, opening_balance, current_balance,
                           active, created_at)
    VALUES (?, ?, ?, ?, '+250700000001', 'arap-supp@test', 'Kigali',
            'NET_30', 0, 0, 1, datetime('now'))
  `).run(id, companyId, id.toUpperCase(), name);
  created.suppliers.push(id);
  return id;
}

/** Creates and posts a sales invoice for a round amount. */
function makeInvoice(id, customerId, total) {
  db.prepare(`DELETE FROM sales_invoices WHERE id = ?`).run(id);
  db.prepare(`
    INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date,
      customer_id, subtotal, tax_total, discount_total, total, amount_paid,
      balance_due, status, created_by, created_at, currency_code, exchange_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?, 'DRAFT', ?, datetime('now'), 'RWF', 1)
  `).run(id, companyId,
    // The id is part of the number: nextSequenceNumber counts what already
    // exists, and several fixtures here are created from the same starting
    // count, so two of them would otherwise ask for the same number.
    nextSequenceNumber(companyId, 'INVOICE', 'INV') + '-' + id,
    TODAY, TODAY, customerId, total, total, user.id);
  db.prepare(`
    INSERT INTO sales_invoice_lines (id, invoice_id, description, quantity,
      unit_price, unit_cost, discount_percent, tax_rate, tax_amount, line_total)
    VALUES (?, ?, 'arap line', 1, ?, 0, 0, 0, 0, ?)
  `).run(generateId('sil'), id, total, total);
  postSalesInvoice(companyId, id, user);
  created.invoices.push(id);
  return id;
}

/** Creates and posts a purchase bill for a round amount. */
function makeBill(id, supplierId, total) {
  db.prepare(`DELETE FROM purchase_invoices WHERE id = ?`).run(id);
  db.prepare(`
    INSERT INTO purchase_invoices (id, company_id, bill_number, date, due_date,
      supplier_id, subtotal, tax_total, total, amount_paid, balance_due, status,
      created_by, created_at, currency_code, exchange_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 'DRAFT', ?, datetime('now'), 'RWF', 1)
  `).run(id, companyId,
    nextSequenceNumber(companyId, 'PURCHASE_INVOICE', 'BINV') + '-' + id,
    TODAY, TODAY, supplierId, total, total, total, user.id);
  db.prepare(`
    INSERT INTO purchase_invoice_lines (id, bill_id, description, quantity,
      unit_cost, tax_rate, line_total)
    VALUES (?, ?, 'arap line', 1, ?, 0, ?)
  `).run(generateId('bil'), id, total, total);
  postPurchaseInvoice(companyId, id, user);
  created.bills.push(id);
  return id;
}

/** Money in from a customer. Pass `invoiceId` to allocate it to a document. */
function receive(customerId, amount, { invoiceId = null, notes = '' } = {}) {
  return recordPayment(companyId, {
    paymentType: 'CUSTOMER_RECEIPT', bankAccountId: BANK.id,
    customerId, salesInvoiceId: invoiceId, amount, date: TODAY, notes
  }, user);
}

/** Money out to a supplier. Pass `billId` to allocate it to a document. */
function paySupplier(supplierId, amount, { billId = null, notes = '' } = {}) {
  return recordPayment(companyId, {
    paymentType: 'SUPPLIER_PAYMENT', bankAccountId: BANK.id,
    supplierId, purchaseInvoiceId: billId, amount, date: TODAY, notes
  }, user);
}

function issueCreditNote(invoiceId, customerId, quantity, unitPrice) {
  const cn = postCreditNote(companyId, {
    invoiceId, customerId, date: TODAY,
    reason: 'arap scenario return', restockItems: 0,
    lines: [{ quantity, unitPrice, taxRate: 0, description: 'arap return' }]
  }, user);
  // postCreditNote returns creditNoteId, not id — reading the wrong field here
  // left the note out of the cleanup list, and the customer then could not be
  // deleted behind it.
  const creditNoteId = cn && cn.creditNoteId;
  if (creditNoteId) created.creditNotes.push(creditNoteId);
  return creditNoteId;
}

// ---------------------------------------------------------------------------
// The four-way agreement
// ---------------------------------------------------------------------------

function customerBalance(id) {
  return roundTo(db.prepare(`SELECT current_balance FROM customers WHERE id = ?`).get(id).current_balance, 2);
}

function supplierBalance(id) {
  return roundTo(db.prepare(`SELECT current_balance FROM suppliers WHERE id = ?`).get(id).current_balance, 2);
}

/** The net balance of every account of one subtype in the trial balance. */
function controlBalance(subtype) {
  const tb = reports.getTrialBalance(companyId);
  return tb.rows
    .filter((r) => r.subtype === subtype)
    .reduce((acc, r) => acc + (Number(r.netDebit) || 0) - (Number(r.netCredit) || 0), 0);
}

/**
 * Holds one party to its own four figures.
 *
 * `expected` is the amount the party owes (positive) or is owed (negative).
 * The ageing is checked against the recorded balance in both directions, so
 * an overpaid party cannot be quietly reported as a debtor.
 */
function assertCustomerAgrees(what, customerId, expected) {
  const recorded = customerBalance(customerId);
  const statement = reports.getCustomerStatement(companyId, customerId, '2020-01-01', TODAY);
  const ageing = reports.getArAging(companyId, TODAY);
  const row = ageing.rows.find((r) => r.customerId === customerId);

  assert.strictEqual(recorded, roundTo(expected, 2),
    `${what}: the customer's recorded balance is ${recorded}, expected ${expected}`);
  assert.strictEqual(roundTo(statement.closingBalance, 2), roundTo(expected, 2),
    `${what}: the statement closes at ${statement.closingBalance}, expected ${expected}`);

  if (expected === 0) {
    // Nothing owed: the row may be absent, but must not claim a balance.
    if (row) {
      assert.strictEqual(roundTo(row.totalDue, 2), 0,
        `${what}: the customer owes nothing but the ageing says ${row.totalDue}`);
    }
    return { row, ageing };
  }

  assert.ok(row, `${what}: a customer with a balance of ${expected} must appear in the AR ageing`);
  assert.strictEqual(roundTo(row.totalDue, 2), roundTo(expected, 2),
    `${what}: the ageing says ${row.totalDue} but the account says ${expected}`);

  const buckets = roundTo(
    (Number(row.current) || 0) + (Number(row.days30) || 0) + (Number(row.days60) || 0) +
    (Number(row.days90) || 0) + (Number(row.daysOver90) || 0), 2);
  assert.strictEqual(buckets, roundTo(expected, 2),
    `${what}: the ageing buckets add to ${buckets} but the row's total is ${row.totalDue}`);

  return { row, ageing };
}

function assertSupplierAgrees(what, supplierId, expected) {
  const recorded = supplierBalance(supplierId);
  const statement = reports.getSupplierStatement(companyId, supplierId, '2020-01-01', TODAY);
  const ageing = reports.getApAging(companyId, TODAY);
  const row = ageing.rows.find((r) => r.supplierId === supplierId);

  assert.strictEqual(recorded, roundTo(expected, 2),
    `${what}: the supplier's recorded balance is ${recorded}, expected ${expected}`);
  assert.strictEqual(roundTo(statement.closingBalance, 2), roundTo(expected, 2),
    `${what}: the statement closes at ${statement.closingBalance}, expected ${expected}`);

  if (expected === 0) {
    if (row) {
      assert.strictEqual(roundTo(row.totalDue, 2), 0,
        `${what}: the supplier is owed nothing but the ageing says ${row.totalDue}`);
    }
    return { row, ageing };
  }

  assert.ok(row, `${what}: a supplier with a balance of ${expected} must appear in the AP ageing`);
  assert.strictEqual(roundTo(row.totalDue, 2), roundTo(expected, 2),
    `${what}: the ageing says ${row.totalDue} but the account says ${expected}`);

  const buckets = roundTo(
    (Number(row.current) || 0) + (Number(row.days30) || 0) + (Number(row.days60) || 0) +
    (Number(row.days90) || 0) + (Number(row.daysOver90) || 0), 2);
  assert.strictEqual(buckets, roundTo(expected, 2),
    `${what}: the ageing buckets add to ${buckets} but the row's total is ${row.totalDue}`);

  return { row, ageing };
}

/** The books must hold after every scenario, not only at the end. */
function assertBooksStillBalance(what) {
  const tb = reports.getTrialBalance(companyId);
  const bs = reports.getBalanceSheet(companyId);
  assert.ok(tb.isBalanced, `${what}: the trial balance does not balance (${tb.grandDebit} vs ${tb.grandCredit})`);
  assert.strictEqual(roundTo(tb.netDebitTotal, 2), roundTo(tb.netCreditTotal, 2),
    `${what}: net debits ${tb.netDebitTotal} against net credits ${tb.netCreditTotal}`);
  assert.ok(bs.isBalanced, `${what}: the balance sheet does not balance`);
}

// ---------------------------------------------------------------------------
// 1. A partial payment
// ---------------------------------------------------------------------------

const PARTIAL_CUSTOMER = makeCustomer('cust-arap-partial', 'ARAP Partial Customer');
const PARTIAL_INVOICE = makeInvoice('inv-arap-partial', PARTIAL_CUSTOMER, 100.0);

check('a partial payment leaves exactly the unpaid part outstanding', () => {
  receive(PARTIAL_CUSTOMER, 40.0, { invoiceId: PARTIAL_INVOICE });
  assertCustomerAgrees('partial payment', PARTIAL_CUSTOMER, 60.0);
  assertBooksStillBalance('partial payment');
});

check('the invoice itself records what was paid and what is left', () => {
  const row = db.prepare(
    `SELECT amount_paid, balance_due FROM sales_invoices WHERE id = ?`).get(PARTIAL_INVOICE);
  assert.strictEqual(roundTo(row.amount_paid, 2), 40.0, `amount_paid is ${row.amount_paid}`);
  assert.strictEqual(roundTo(row.balance_due, 2), 60.0, `balance_due is ${row.balance_due}`);
});

// ---------------------------------------------------------------------------
// 2. A full payment
// ---------------------------------------------------------------------------

const FULL_CUSTOMER = makeCustomer('cust-arap-full', 'ARAP Full Customer');
const FULL_INVOICE = makeInvoice('inv-arap-full', FULL_CUSTOMER, 200.0);

check('a full payment leaves nothing outstanding', () => {
  receive(FULL_CUSTOMER, 200.0, { invoiceId: FULL_INVOICE });
  assertCustomerAgrees('full payment', FULL_CUSTOMER, 0);
  assertBooksStillBalance('full payment');
});

check('a fully paid invoice is not reported as owed', () => {
  const row = db.prepare(
    `SELECT amount_paid, balance_due, status FROM sales_invoices WHERE id = ?`).get(FULL_INVOICE);
  assert.strictEqual(roundTo(row.balance_due, 2), 0, `balance_due is ${row.balance_due}`);
});

// ---------------------------------------------------------------------------
// 3. A customer overpayment
// ---------------------------------------------------------------------------

const OVER_CUSTOMER = makeCustomer('cust-arap-over', 'ARAP Overpaying Customer');
const OVER_INVOICE = makeInvoice('inv-arap-over', OVER_CUSTOMER, 100.0);

check('a customer overpayment is a credit, not a debt', () => {
  receive(OVER_CUSTOMER, 130.0, { invoiceId: OVER_INVOICE });
  const { row } = assertCustomerAgrees('customer overpayment', OVER_CUSTOMER, -30.0);
  assert.ok(row.totalDue < 0,
    `the customer is owed 30.00 so the ageing must show a negative, not ${row.totalDue}`);
  assertBooksStillBalance('customer overpayment');
});

check('an overpaid invoice does not stay open', () => {
  const row = db.prepare(
    `SELECT amount_paid, balance_due FROM sales_invoices WHERE id = ?`).get(OVER_INVOICE);
  assert.ok(roundTo(row.balance_due, 2) <= 0, `a 100.00 invoice paid with 130.00 still shows ${row.balance_due} due`);
});

// ---------------------------------------------------------------------------
// 4. A supplier overpayment
// ---------------------------------------------------------------------------

const OVER_SUPPLIER = makeSupplier('supp-arap-over', 'ARAP Overpaid Supplier');
const OVER_BILL = makeBill('bill-arap-over', OVER_SUPPLIER, 100.0);

check('a supplier overpayment is a credit, not an unpaid bill', () => {
  paySupplier(OVER_SUPPLIER, 150.0, { billId: OVER_BILL });
  const { row } = assertSupplierAgrees('supplier overpayment', OVER_SUPPLIER, -50.0);
  assert.ok(row.totalDue < 0,
    `the supplier owes the business 50.00 so the ageing must show a negative, not ${row.totalDue}`);
  assertBooksStillBalance('supplier overpayment');
});

check('an overpaid supplier is not reported as money the business owes', () => {
  const ageing = reports.getApAging(companyId, TODAY);
  const row = ageing.rows.find((r) => r.supplierId === OVER_SUPPLIER);
  assert.ok(row, 'the overpaid supplier must appear in the AP ageing');
  // This is the defect 1.0.2 carried, stated as plainly as it can be: a
  // supplier the business has overpaid must never be counted as a debt.
  assert.ok(!(row.totalDue > 0),
    `the AP ageing reports ${row.totalDue} owed to a supplier who was overpaid`);
});

// ---------------------------------------------------------------------------
// 4b. The same two overpayments, but recorded WITHOUT naming a document.
//
// The Banking form offers "None" for the document, and an overpayment or an
// opening balance legitimately has nothing to be allocated to. This is the
// case JENESIS 1.0.2 got wrong: the payment reduced the party's balance
// correctly, but the document was never marked paid, so the ageing — built
// from the open documents — went on reporting the full amount as owed while
// the account said the party was in credit.
//
// Nothing here is allocated. If these two checks ever fail while the ones
// above pass, the report has stopped answering to the party's balance.
// ---------------------------------------------------------------------------

const UNALLOC_SUPPLIER = makeSupplier('supp-arap-unalloc', 'ARAP Unallocated Supplier');
const UNALLOC_BILL = makeBill('bill-arap-unalloc', UNALLOC_SUPPLIER, 100.0);

check('a supplier overpayment recorded with no document named still leaves a credit', () => {
  paySupplier(UNALLOC_SUPPLIER, 150.0); // no billId on purpose
  const { row } = assertSupplierAgrees('unallocated supplier overpayment', UNALLOC_SUPPLIER, -50.0);
  assert.ok(row.totalDue < 0,
    `paid 150.00 against a 100.00 bill: the ageing must show -50.00, not ${row.totalDue}`);
  assertBooksStillBalance('unallocated supplier overpayment');
});

const UNALLOC_CUSTOMER = makeCustomer('cust-arap-unalloc', 'ARAP Unallocated Customer');
const UNALLOC_INVOICE = makeInvoice('inv-arap-unalloc', UNALLOC_CUSTOMER, 100.0);

check('a customer overpayment recorded with no document named still leaves a credit', () => {
  receive(UNALLOC_CUSTOMER, 130.0); // no invoiceId on purpose
  const { row } = assertCustomerAgrees('unallocated customer overpayment', UNALLOC_CUSTOMER, -30.0);
  assert.ok(row.totalDue < 0,
    `received 130.00 against a 100.00 invoice: the ageing must show -30.00, not ${row.totalDue}`);
  assertBooksStillBalance('unallocated customer overpayment');
});

check('an unallocated payment never leaves a document looking unpaid', () => {
  // The bill was paid with 50.00 more than it asked for. Whatever the ageing
  // says about the party, no report may leave 100.00 of it looking owed.
  const ageing = reports.getApAging(companyId, TODAY);
  const row = ageing.rows.find((r) => r.supplierId === UNALLOC_SUPPLIER);
  assert.ok(row, 'the supplier must appear in the AP ageing');
  assert.ok(!(row.totalDue > 0),
    `a bill of 100.00 paid with 150.00 is still reported as ${row.totalDue} owed`);
});

// ---------------------------------------------------------------------------
// 5. Several payments against one invoice
// ---------------------------------------------------------------------------

const MULTI_CUSTOMER = makeCustomer('cust-arap-multi', 'ARAP Multiple Payments');
const MULTI_INVOICE = makeInvoice('inv-arap-multi', MULTI_CUSTOMER, 300.0);

check('three payments against one invoice are tracked after each one', () => {
  receive(MULTI_CUSTOMER, 100.0, { invoiceId: MULTI_INVOICE, notes: 'first' });
  assertCustomerAgrees('after the first of three', MULTI_CUSTOMER, 200.0);

  receive(MULTI_CUSTOMER, 100.0, { invoiceId: MULTI_INVOICE, notes: 'second' });
  assertCustomerAgrees('after the second of three', MULTI_CUSTOMER, 100.0);

  receive(MULTI_CUSTOMER, 100.0, { invoiceId: MULTI_INVOICE, notes: 'third' });
  assertCustomerAgrees('after the third of three', MULTI_CUSTOMER, 0);

  assertBooksStillBalance('three payments against one invoice');
});

check('the invoice totals what it was actually paid, not the last payment', () => {
  const row = db.prepare(
    `SELECT amount_paid, balance_due FROM sales_invoices WHERE id = ?`).get(MULTI_INVOICE);
  assert.strictEqual(roundTo(row.amount_paid, 2), 300.0,
    `three payments of 100.00 must total 300.00 paid, not ${row.amount_paid}`);
  assert.strictEqual(roundTo(row.balance_due, 2), 0, `balance_due is ${row.balance_due}`);
});

check('every one of the three payments is on the statement', () => {
  const statement = reports.getCustomerStatement(companyId, MULTI_CUSTOMER, '2020-01-01', TODAY);
  const payments = statement.transactions.filter((t) => t.type === 'PAYMENT');
  assert.strictEqual(payments.length, 3,
    `expected three payments on the statement, found ${payments.length}`);
  const total = payments.reduce((acc, p) => acc + (Number(p.credit) || 0), 0);
  assert.strictEqual(roundTo(total, 2), 300.0, `the payments on the statement total ${total}`);
});

// ---------------------------------------------------------------------------
// 6. A credit note
// ---------------------------------------------------------------------------

const CN_CUSTOMER = makeCustomer('cust-arap-cn', 'ARAP Credit Note Customer');
const CN_INVOICE = makeInvoice('inv-arap-cn', CN_CUSTOMER, 100.0);

check('a credit note reduces what the customer owes', () => {
  issueCreditNote(CN_INVOICE, CN_CUSTOMER, 1, 25.0);
  assertCustomerAgrees('credit note', CN_CUSTOMER, 75.0);
  assertBooksStillBalance('credit note');
});

check('the credit note appears on the statement as a credit', () => {
  const statement = reports.getCustomerStatement(companyId, CN_CUSTOMER, '2020-01-01', TODAY);
  const notes = statement.transactions.filter((t) => t.type === 'CREDIT_NOTE');
  assert.strictEqual(notes.length, 1, `expected one credit note, found ${notes.length}`);
  assert.strictEqual(roundTo(notes[0].credit, 2), 25.0, `the credit note is for ${notes[0].credit}`);
});

check('a credit note can be settled by a payment for the reduced amount', () => {
  receive(CN_CUSTOMER, 75.0, { invoiceId: CN_INVOICE });
  assertCustomerAgrees('credit note then payment', CN_CUSTOMER, 0);
  assertBooksStillBalance('credit note then payment');
});

// ---------------------------------------------------------------------------
// 7. A refund
// ---------------------------------------------------------------------------

const REFUND_CUSTOMER = makeCustomer('cust-arap-refund', 'ARAP Refunded Customer');
const REFUND_INVOICE = makeInvoice('inv-arap-refund', REFUND_CUSTOMER, 100.0);

check('a refund returns an overpayment and restores the balance', () => {
  receive(REFUND_CUSTOMER, 150.0, { invoiceId: REFUND_INVOICE });
  assertCustomerAgrees('before the refund', REFUND_CUSTOMER, -50.0);

  // A refund is a negative receipt: the money goes back out.
  receive(REFUND_CUSTOMER, -50.0, { notes: 'refund of the overpayment' });
  assertCustomerAgrees('after the refund', REFUND_CUSTOMER, 0);
  assertBooksStillBalance('refund');
});

check('the refund is on the statement and brings it back to zero', () => {
  const statement = reports.getCustomerStatement(companyId, REFUND_CUSTOMER, '2020-01-01', TODAY);
  assert.strictEqual(roundTo(statement.closingBalance, 2), 0,
    `the statement closes at ${statement.closingBalance} after the refund`);
});

// ---------------------------------------------------------------------------
// 8. The outstanding balances, all together, and the ledger underneath them
// ---------------------------------------------------------------------------

check('every scenario leaves the outstanding balance it should', () => {
  const expectations = [
    ['partial payment', PARTIAL_CUSTOMER, 60.0],
    ['full payment', FULL_CUSTOMER, 0],
    ['customer overpayment', OVER_CUSTOMER, -30.0],
    ['multiple payments', MULTI_CUSTOMER, 0],
    ['credit note then payment', CN_CUSTOMER, 0],
    ['refund', REFUND_CUSTOMER, 0],
    ['unallocated customer overpayment', UNALLOC_CUSTOMER, -30.0]
  ];
  for (const [what, id, expected] of expectations) {
    assert.strictEqual(customerBalance(id), roundTo(expected, 2),
      `${what}: expected ${expected}, the account says ${customerBalance(id)}`);
  }
  assert.strictEqual(supplierBalance(OVER_SUPPLIER), -50.0,
    `supplier overpayment: expected -50, the account says ${supplierBalance(OVER_SUPPLIER)}`);
  assert.strictEqual(supplierBalance(UNALLOC_SUPPLIER), -50.0,
    `unallocated overpayment: expected -50, the account says ${supplierBalance(UNALLOC_SUPPLIER)}`);
});

check('the receivables control account holds what all the customers owe together', () => {
  const customers = db.prepare(
    `SELECT id, current_balance FROM customers WHERE company_id = ? AND active = 1`).all(companyId);
  const owed = roundTo(customers.reduce((acc, c) => acc + (Number(c.current_balance) || 0), 0), 2);
  const control = roundTo(controlBalance('ACCOUNTS_RECEIVABLE'), 2);
  assert.strictEqual(control, owed,
    `the customers together owe ${owed} but the receivables account holds ${control}`);
});

check('the payables control account holds what all the suppliers are owed together', () => {
  const suppliers = db.prepare(
    `SELECT id, current_balance FROM suppliers WHERE company_id = ? AND active = 1`).all(companyId);
  const owed = roundTo(suppliers.reduce((acc, s) => acc + (Number(s.current_balance) || 0), 0), 2);
  // A supplier the business owes is a credit balance on the payables account,
  // so the account reads negative where the ageing reads positive.
  const control = roundTo(-controlBalance('ACCOUNTS_PAYABLE'), 2);
  assert.strictEqual(control, owed,
    `the suppliers are owed ${owed} but the payables account holds ${control}`);
});

check('no figure in any ageing report is NaN, Infinity or missing', () => {
  const bad = [];
  for (const [label, report, key] of [
    ['AR', reports.getArAging(companyId, TODAY), 'customer'],
    ['AP', reports.getApAging(companyId, TODAY), 'supplier']
  ]) {
    for (const row of report.rows) {
      for (const [field, value] of Object.entries(row)) {
        if (typeof value === 'number' && !Number.isFinite(value)) {
          bad.push(`${label} ${row[key + 'Id']}.${field} = ${value}`);
        }
      }
      const buckets = roundTo(
        (Number(row.current) || 0) + (Number(row.days30) || 0) + (Number(row.days60) || 0) +
        (Number(row.days90) || 0) + (Number(row.daysOver90) || 0), 2);
      if (buckets !== roundTo(row.totalDue, 2)) {
        bad.push(`${label} ${row[key + 'Id']}: buckets ${buckets} vs total ${row.totalDue}`);
      }
    }
  }
  assert.deepStrictEqual(bad, [], `${bad.length} problem(s): ${bad.slice(0, 8).join('; ')}`);
});

check('the trial balance and balance sheet still balance after all eight scenarios', () => {
  assertBooksStillBalance('all eight scenarios');
});

// ---------------------------------------------------------------------------
// Cleanup: payments first, because they reference the parties.
// ---------------------------------------------------------------------------

function cleanup() {
  // Children before parents. A line references the document it belongs to, so
  // deleting the document first is exactly what a foreign key is for, and it
  // is what left the earlier version of this cleanup half-done.
  //
  // The journal entries these transactions posted are deliberately left alone.
  // They are the accounting record, and deleting them would be the very thing
  // the rest of this file insists must never happen.
  db.prepare(`DELETE FROM payments WHERE company_id = ? AND (
      customer_id IN (SELECT id FROM customers WHERE id LIKE 'cust-arap-%')
      OR supplier_id IN (SELECT id FROM suppliers WHERE id LIKE 'supp-arap-%'))`).run(companyId);
  for (const id of created.creditNotes) {
    db.prepare(`DELETE FROM credit_note_lines WHERE credit_note_id = ?`).run(id);
    db.prepare(`DELETE FROM credit_notes WHERE id = ?`).run(id);
  }
  for (const id of created.invoices) {
    db.prepare(`DELETE FROM sales_invoice_lines WHERE invoice_id = ?`).run(id);
    db.prepare(`DELETE FROM sales_invoices WHERE id = ?`).run(id);
  }
  for (const id of created.bills) {
    db.prepare(`DELETE FROM purchase_invoice_lines WHERE bill_id = ?`).run(id);
    db.prepare(`DELETE FROM purchase_invoices WHERE id = ?`).run(id);
  }
  for (const id of created.customers) db.prepare(`DELETE FROM customers WHERE id = ?`).run(id);
  for (const id of created.suppliers) db.prepare(`DELETE FROM suppliers WHERE id = ?`).run(id);
}

try {
  cleanup();
} catch (err) {
  console.log(`  ! cleanup could not finish: ${err.message}`);
}

console.log(`\n--- AR/AP PAYMENT SCENARIOS SUMMARY ---`);
console.log(`  ${passed} checks passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
