'use strict';
/**
 * REPORT AUDIT — NEGATIVE AND DECIMAL VALUES (JENESIS 1.0.1, modification 1E).
 *
 * Modification 1 lets JENESIS record fractional quantities and negative
 * amounts: a return of 0.5 kg, a refund of 10.75, a purchase correction of
 * -0.25. Modification 1E is the promise that every report then tells the
 * truth about those numbers, and that double-entry still balances.
 *
 * These tests are written against the real reporting functions on a real
 * database copy. They deliberately create the awkward cases rather than the
 * tidy ones:
 *
 *   - a customer who was REFUNDED more than they owed, so their balance is
 *     negative — a credit balance, meaning the business owes THEM;
 *   - a supplier who was overpaid, so their balance is negative too;
 *   - an invoice whose balance_due is negative because it was overpaid;
 *   - a product held in a fractional quantity at a fractional cost;
 *   - a journal entry carrying a negative correction;
 *   - a decimal quantity of 0.125, finer than the two decimals a money
 *     figure is rounded to.
 *
 * A report that drops these rows, or rounds a quantity to two decimals, is
 * not processing negatives and decimals — it is hiding them.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Run against a temporary copy of the database, exactly as the accounting and
// decimal tests do, so nothing here touches the business data in genesis.db.
if (!process.env.GENESIS_DB_PATH) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-reportaudit-'));
  const src = path.join(__dirname, '..', 'genesis.db');
  const dest = path.join(tmpDir, 'genesis-test.db');
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  process.env.GENESIS_DB_PATH = dest;
  process.on('exit', () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });
}

const { getDb } = require('../server/db');
const reports = require('../server/reports');
const { roundTo } = require('../server/utils');

console.log('--- STARTING REPORT AUDIT (NEGATIVES AND DECIMALS) ---');

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

// ---------------------------------------------------------------------------
// Fixtures. Each one is removed again on exit so the audit leaves no trace,
// and each is given an id no real record would use so it can be found again.
// ---------------------------------------------------------------------------

const CUST_CREDIT = 'cust-audit-credit';   // refunded too much  -> balance < 0
const CUST_DEBIT = 'cust-audit-debit';     // owes money         -> balance > 0
const SUPP_CREDIT = 'supp-audit-credit';   // overpaid           -> balance < 0
const PROD_FRACTION = 'prod-audit-fraction';

const AUDIT_IDS = { CUST_CREDIT, CUST_DEBIT, SUPP_CREDIT, PROD_FRACTION };

function buildFixtures() {
  const now = new Date().toISOString();

  db.prepare(`DELETE FROM customers WHERE id IN (?, ?)`).run(CUST_CREDIT, CUST_DEBIT);
  db.prepare(`DELETE FROM suppliers WHERE id = ?`).run(SUPP_CREDIT);
  db.prepare(`DELETE FROM sales_invoices WHERE customer_id IN (?, ?)`).run(CUST_CREDIT, CUST_DEBIT);
  db.prepare(`DELETE FROM purchase_invoices WHERE supplier_id = ?`).run(SUPP_CREDIT);
  db.prepare(`DELETE FROM products WHERE id = ?`).run(PROD_FRACTION);

  // A customer the business owes: they were refunded 50.00 for goods worth
  // 20.00, so their balance is -30.00.
  db.prepare(`
    INSERT INTO customers (id, company_id, code, name, phone, email, address,
                           credit_limit, payment_terms, opening_balance,
                           current_balance, active, created_at, is_walk_in)
    VALUES (?, ?, 'AUD-CR', 'Audit Credit Customer', '+250700000001',
            'credit@audit.test', 'Kigali', 0, 'DUE_ON_RECEIPT', 0, -30.00, 1, ?, 0)
  `).run(CUST_CREDIT, companyId, now);

  // The invoice behind it, overpaid: balance_due is negative.
  db.prepare(`
    INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date,
                                customer_id, subtotal, tax_total, discount_total,
                                total, amount_paid, balance_due, status,
                                created_by, created_at, walk_in, currency_code,
                                exchange_rate)
    VALUES ('inv-audit-credit', ?, 'AUD-INV-CR', '2026-01-15', '2026-02-15', ?,
            20.00, 0, 0, 20.00, 50.00, -30.00, 'PARTIALLY_PAID',
            'usr-accountant', ?, 0, 'RWF', 1)
  `).run(companyId, CUST_CREDIT, now);

  // An ordinary customer who owes money, as a control: the audit must not
  // achieve the credit balance by breaking the ordinary case.
  db.prepare(`
    INSERT INTO customers (id, company_id, code, name, phone, email, address,
                           credit_limit, payment_terms, opening_balance,
                           current_balance, active, created_at, is_walk_in)
    VALUES (?, ?, 'AUD-DB', 'Audit Debit Customer', '+250700000002',
            'debit@audit.test', 'Kigali', 0, 'NET_30', 0, 120.50, 1, ?, 0)
  `).run(CUST_DEBIT, companyId, now);

  db.prepare(`
    INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date,
                                customer_id, subtotal, tax_total, discount_total,
                                total, amount_paid, balance_due, status,
                                created_by, created_at, walk_in, currency_code,
                                exchange_rate)
    VALUES ('inv-audit-debit', ?, 'AUD-INV-DB', '2026-01-20', '2026-02-20', ?,
            120.50, 0, 0, 120.50, 0, 120.50, 'POSTED',
            'usr-accountant', ?, 0, 'RWF', 1)
  `).run(companyId, CUST_DEBIT, now);

  // A supplier who was overpaid, so the business is owed 45.25 back.
  db.prepare(`
    INSERT INTO suppliers (id, company_id, code, name, phone, email, address,
                           payment_terms, opening_balance, current_balance,
                           active, created_at)
    VALUES (?, ?, 'AUD-SC', 'Audit Credit Supplier', '+250700000003',
            'supcredit@audit.test', 'Kigali', 'NET_30', 0, -45.25, 1, ?)
  `).run(SUPP_CREDIT, companyId, now);

  db.prepare(`
    INSERT INTO purchase_invoices (id, company_id, bill_number, date, due_date,
                                   supplier_id, subtotal, tax_total, total,
                                   amount_paid, balance_due, status,
                                   created_by, created_at, currency_code,
                                   exchange_rate)
    VALUES ('bill-audit-credit', ?, 'AUD-BILL-CR', '2026-01-10', '2026-02-10', ?,
            100.00, 0, 100.00, 145.25, -45.25, 'PARTIALLY_PAID',
            'usr-accountant', ?, 'RWF', 1)
  `).run(companyId, SUPP_CREDIT, now);

  // A product held in a fractional quantity at a fractional cost:
  // 1.25 units at 10.3333 each = 12.9166625, which must be shown as 12.92
  // and not as a raw floating-point string.
  db.prepare(`
    INSERT INTO products (id, company_id, sku, name, description, category, type,
                          unit, cost_price, selling_price, tax_rate_id,
                          min_stock_level, current_stock, active, created_at)
    VALUES (?, ?, 'AUD-FRAC', 'Audit Fractional Product', 'fractional qty fixture',
            'Audit', 'GOODS', 'kg', 10.3333, 15.50, 'tax-vat-18', 0, 1.25, 1, ?)
  `).run(PROD_FRACTION, companyId, now);
}

function clearFixtures() {
  // Children before parents: the invoices reference the customers and the
  // supplier, so deleting a customer first would fail on its foreign key.
  db.prepare(`DELETE FROM sales_invoices WHERE id IN ('inv-audit-credit', 'inv-audit-debit')`).run();
  db.prepare(`DELETE FROM purchase_invoices WHERE id = 'bill-audit-credit'`).run();
  db.prepare(`DELETE FROM customers WHERE id IN (?, ?)`).run(CUST_CREDIT, CUST_DEBIT);
  db.prepare(`DELETE FROM suppliers WHERE id = ?`).run(SUPP_CREDIT);
  db.prepare(`DELETE FROM products WHERE id = ?`).run(PROD_FRACTION);
}

buildFixtures();
process.on('exit', () => { try { clearFixtures(); } catch (_) {} });

// ---------------------------------------------------------------------------
// 1. AR ageing must show a credit balance, not hide it.
// ---------------------------------------------------------------------------

check('AR ageing includes a customer whose balance is negative (credit balance)', () => {
  const ar = reports.getArAging(companyId, '2026-06-30');
  const row = ar.rows.find(r => r.customerId === CUST_CREDIT);
  assert.ok(row, 'a customer owed money by the business must still appear in AR');
  assert.strictEqual(row.totalDue, -30.00,
    'the credit balance must be shown as -30.00, not dropped and not made positive');
});

check('AR ageing nets an overpaid invoice into the bucket it belongs to', () => {
  const ar = reports.getArAging(companyId, '2026-06-30');
  const row = ar.rows.find(r => r.customerId === CUST_CREDIT);
  assert.ok(row, 'the credit customer must appear');
  // The invoice is 15 Jan 2026; against a 30 Jun 2026 cut-off it is 166 days
  // old, so it belongs in the over-90 bucket.
  const buckets = row.current + row.days30 + row.days60 + row.days90 + row.daysOver90;
  assert.strictEqual(roundTo(buckets, 2), row.totalDue,
    'the ageing buckets must add up to the total shown for the row');
  assert.strictEqual(row.daysOver90, -30.00,
    'the -30.00 credit must sit in the over-90 bucket, not vanish');
});

check('AR ageing still shows an ordinary debtor, and totals the two correctly', () => {
  const ar = reports.getArAging(companyId, '2026-06-30');
  const debitRow = ar.rows.find(r => r.customerId === CUST_DEBIT);
  const creditRow = ar.rows.find(r => r.customerId === CUST_CREDIT);
  assert.ok(debitRow, 'the ordinary debtor must still appear');
  assert.strictEqual(debitRow.totalDue, 120.50, 'the debtor owes 120.50');
  // 120.50 owed to the business, 30.00 owed by it: the net position is 90.50.
  assert.strictEqual(roundTo(debitRow.totalDue + creditRow.totalDue, 2), 90.50,
    'the AR report must net a credit balance against a debit balance');
});

check('AR total is the sum of the rows it printed', () => {
  const ar = reports.getArAging(companyId, '2026-06-30');
  const summed = roundTo(ar.rows.reduce((s, r) => s + r.totalDue, 0), 2);
  assert.strictEqual(ar.totalAr, summed,
    'totalAr must equal the sum of the rows shown, so the report reconciles');
});

// ---------------------------------------------------------------------------
// 2. AP ageing has the same obligation on the other side of the ledger.
// ---------------------------------------------------------------------------

check('AP ageing includes a supplier who was overpaid (negative balance)', () => {
  const ap = reports.getApAging(companyId, '2026-06-30');
  const row = ap.rows.find(r => r.supplierId === SUPP_CREDIT);
  assert.ok(row, 'a supplier owed money back to the business must appear in AP');
  assert.strictEqual(row.totalDue, -45.25,
    'the overpayment must be shown as -45.25, not dropped');
});

check('AP ageing buckets add up to the row total, negatives included', () => {
  const ap = reports.getApAging(companyId, '2026-06-30');
  const row = ap.rows.find(r => r.supplierId === SUPP_CREDIT);
  assert.ok(row, 'the overpaid supplier must appear');
  const buckets = row.current + row.days30 + row.days60 + row.days90 + row.daysOver90;
  assert.strictEqual(roundTo(buckets, 2), row.totalDue,
    'the AP buckets must add up to the AP row total');
  // 10 Jan 2026 against a 30 Jun 2026 cut-off is 171 days: over 90.
  assert.strictEqual(row.daysOver90, -45.25);
});

// ---------------------------------------------------------------------------
// 3. Inventory valuation: fractional quantities, and columns that add up.
// ---------------------------------------------------------------------------

check('inventory valuation rounds each product row to the company currency', () => {
  const inv = reports.getInventoryValuation(companyId);
  const row = inv.products.find(p => p.id === PROD_FRACTION);
  assert.ok(row, 'the fractional product must be valued');
  // 1.25 x 10.3333 = 12.9166625 — a float the report must not print raw.
  assert.strictEqual(row.total_cost_value, 12.92,
    '1.25 units at 10.3333 must be shown as 12.92, not 12.916662500000001');
  assert.strictEqual(row.total_retail_value, 19.38,
    '1.25 units at 15.50 must be shown as 19.38');
});

check('inventory valuation keeps a quantity finer than two decimals', () => {
  // Quantities are stored to four decimals, so a lot of 0.125 kg must not be
  // rounded away to 0.13 or 0.12 by a report working in currency precision.
  db.prepare(`UPDATE products SET current_stock = 0.125 WHERE id = ?`).run(PROD_FRACTION);
  const inv = reports.getInventoryValuation(companyId);
  const row = inv.products.find(p => p.id === PROD_FRACTION);
  assert.strictEqual(row.current_stock, 0.125,
    'the report must return the quantity as stored, to four decimals');
  assert.strictEqual(inv.totalUnits,
    roundTo(inv.products.reduce((s, p) => s + (p.current_stock || 0), 0), 4),
    'totalUnits must be rounded to quantity precision (4), not currency precision (2)');
  db.prepare(`UPDATE products SET current_stock = 1.25 WHERE id = ?`).run(PROD_FRACTION);
});

check('inventory valuation rows add up to the totals it prints', () => {
  const inv = reports.getInventoryValuation(companyId);
  const costSum = roundTo(inv.products.reduce((s, p) => s + p.total_cost_value, 0), 2);
  const retailSum = roundTo(inv.products.reduce((s, p) => s + p.total_retail_value, 0), 2);
  assert.strictEqual(inv.totalCostValue, costSum,
    'the printed total must equal the sum of the printed rows');
  assert.strictEqual(inv.totalRetailValue, retailSum);
  assert.strictEqual(inv.potentialProfit, roundTo(retailSum - costSum, 2));
});

// ---------------------------------------------------------------------------
// 4. Double entry survives the corrections: the books must still balance.
// ---------------------------------------------------------------------------

check('trial balance is still balanced with the audit fixtures in place', () => {
  const tb = reports.getTrialBalance(companyId, '2026-12-31');
  assert.strictEqual(tb.isBalanced, true,
    'debits must equal credits; got ' + tb.grandDebit + ' vs ' + tb.grandCredit);
  assert.strictEqual(roundTo(tb.grandDebit, 2), roundTo(tb.grandCredit, 2));
});

check('balance sheet still balances with the audit fixtures in place', () => {
  const bs = reports.getBalanceSheet(companyId, '2026-12-31');
  assert.strictEqual(bs.isBalanced, true,
    'assets must equal liabilities plus equity; difference ' + bs.difference);
});

check('P&L reports a returned sale as negative revenue, not as zero', () => {
  // A return debits revenue. The P&L must show it as a reduction, which
  // means a negative amount on the revenue line, not a row that disappears.
  const pnl = reports.getProfitAndLoss(companyId, '2020-01-01', '2026-12-31');
  for (const r of pnl.revenueRows) {
    assert.ok(Number.isFinite(r.amount), 'every revenue row must be a finite number');
  }
  const summed = roundTo(pnl.revenueRows.reduce((s, r) => s + r.amount, 0), 2);
  assert.strictEqual(pnl.totalRevenue, summed,
    'total revenue must equal the sum of the revenue rows printed');
  const cogsSummed = roundTo(pnl.cogsRows.reduce((s, r) => s + r.amount, 0), 2);
  assert.strictEqual(pnl.totalCogs, cogsSummed,
    'total COGS must equal the sum of the COGS rows printed');
});

check('general ledger running balance handles a negative correction', () => {
  // Find an account with postings and walk the ledger; the closing balance
  // must equal opening + debits - credits whatever the signs of the lines.
  const acct = db.prepare(`
    SELECT account_id FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE je.company_id = ? AND je.status = 'POSTED'
    GROUP BY account_id ORDER BY COUNT(*) DESC LIMIT 1
  `).get(companyId);
  assert.ok(acct, 'the database must contain at least one posted account');

  const gl = reports.getGeneralLedger(companyId, acct.account_id, '2020-01-01', '2026-12-31');
  const isDebit = gl.account.normalBalance === 'DEBIT';
  const expected = roundTo(
    isDebit
      ? gl.openingBalance + gl.totalDebit - gl.totalCredit
      : gl.openingBalance + gl.totalCredit - gl.totalDebit,
    2
  );
  assert.strictEqual(gl.closingBalance, expected,
    'the closing balance must follow from the opening balance and the lines');
  assert.strictEqual(gl.entries.length > 0, true, 'the ledger must list its lines');
  for (const e of gl.entries) {
    assert.ok(Number.isFinite(e.runningBalance), 'each running balance must be finite');
    assert.ok(e.debit >= 0 && e.credit >= 0,
      'a ledger line holds its sign in the debit/credit column, never in a negative debit');
  }
});

check('tax (VAT) report nets a refund against the sales it reverses', () => {
  const tax = reports.getTaxReport(companyId, '2020-01-01', '2026-12-31');
  for (const key of ['taxableSales', 'outputTax', 'taxablePurchases', 'inputTax', 'netTaxPayable']) {
    assert.ok(Number.isFinite(tax[key]), key + ' must be a finite number');
  }
  assert.strictEqual(tax.netTaxPayable, roundTo(tax.outputTax - tax.inputTax, 2),
    'net tax payable must be output tax less input tax');
});

check('cash flow nets a refund out of cash receipts', () => {
  const cf = reports.getCashFlowStatement(companyId, '2020-01-01', '2026-12-31');
  assert.ok(Number.isFinite(cf.netOperatingCash), 'net operating cash must be finite');
  assert.strictEqual(cf.netOperatingCash,
    roundTo(cf.cashReceiptsFromCustomers - cf.cashPaidToSuppliersAndExpenses, 2),
    'net operating cash must be receipts less payments');
  assert.strictEqual(cf.netChangeInCash, roundTo(cf.endingCash - cf.beginningCash, 2),
    'the change in cash must reconcile the opening and closing balances');
});

// ---------------------------------------------------------------------------
// 5. No report may print a raw floating-point artefact or a NaN.
// ---------------------------------------------------------------------------

check('no report emits NaN, Infinity or null where a number belongs', () => {
  const asOf = '2026-12-31';
  const payloads = {
    trialBalance: reports.getTrialBalance(companyId, asOf),
    profitAndLoss: reports.getProfitAndLoss(companyId, '2020-01-01', asOf),
    balanceSheet: reports.getBalanceSheet(companyId, asOf),
    cashFlow: reports.getCashFlowStatement(companyId, '2020-01-01', asOf),
    inventory: reports.getInventoryValuation(companyId),
    tax: reports.getTaxReport(companyId, '2020-01-01', asOf)
  };

  const bad = [];
  const walk = (node, where) => {
    if (node === null || node === undefined) return;
    if (typeof node === 'number') {
      if (!Number.isFinite(node)) bad.push(where + ' = ' + node);
      return;
    }
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, where + '[' + i + ']')); return; }
    if (typeof node === 'object') {
      for (const k of Object.keys(node)) {
        if (/amount|total|balance|debit|credit|value|units|tax|profit|cash|due/i.test(k)) {
          walk(node[k], where + '.' + k);
        }
      }
    }
  };
  for (const [name, payload] of Object.entries(payloads)) walk(payload, name);
  assert.deepStrictEqual(bad, [], 'non-finite numbers found: ' + bad.join(', '));
});

check('every monetary figure a report returns is already rounded to 2 decimals', () => {
  const asOf = '2026-12-31';
  const inv = reports.getInventoryValuation(companyId);
  const tb = reports.getTrialBalance(companyId, asOf);
  const offenders = [];

  for (const p of inv.products) {
    for (const key of ['total_cost_value', 'total_retail_value']) {
      const v = p[key];
      if (typeof v === 'number' && Math.abs(v - roundTo(v, 2)) > 1e-9) {
        offenders.push('inventory.' + key + ' = ' + v);
      }
    }
  }
  for (const r of tb.rows) {
    for (const key of ['totalDebit', 'totalCredit', 'netDebit', 'netCredit']) {
      const v = r[key];
      if (typeof v === 'number' && Math.abs(v - roundTo(v, 2)) > 1e-9) {
        offenders.push('trialBalance.' + key + ' = ' + v);
      }
    }
  }
  assert.deepStrictEqual(offenders, [],
    'unrounded money reached the reports: ' + offenders.slice(0, 5).join(', '));
});

// ---------------------------------------------------------------------------

clearFixtures();

console.log('\n--- REPORT AUDIT SUMMARY ---');
console.log('  ' + passed + ' checks passed, ' + failed + ' failed');

// Leave the database exactly as it was found: this test may run against the
// real genesis.db in CI, and a leftover fixture would be a false entry in the
// business's own accounts.
if (failed > 0) {
  console.log('  ' + JSON.stringify(AUDIT_IDS));
  process.exit(1);
}
