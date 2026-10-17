'use strict';
/**
 * FX SETTLEMENT TESTS — multi-currency settlement differences posted to the
 * dedicated FX gain (4800) / FX loss (5900) accounts.
 *
 * Covers: migration v3 creates the accounts, a foreign-currency invoice settled
 * at a different rate posts the base-currency difference to FX loss and clears
 * the document exactly, the supplier mirror posts an FX gain, historical rates
 * are preserved on documents, guard errors carry stable codes, and the Trial
 * Balance stays balanced throughout. Runs on a temporary COPY of the demo
 * database; the repository genesis.db is never opened for writing.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-fx-'));
const dbPath = path.join(workDir, 'genesis.db');
if (fs.existsSync(SOURCE_DB)) fs.copyFileSync(SOURCE_DB, dbPath);
process.env.GENESIS_DB_PATH = dbPath;
process.env.GENESIS_DIST_DIR = path.join(ROOT, 'dist');

const sourceMd5Before = fs.existsSync(SOURCE_DB)
  ? crypto.createHash('md5').update(fs.readFileSync(SOURCE_DB)).digest('hex')
  : null;

const { startServer } = require('../server/index.js');
const { getDb } = require('../server/db');
const { hashPassword } = require('../server/passwords');

let base;
let serverHandle;
let passed = 0;
let failed = 0;

async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${base}/api${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* not json */ }
  return { status: res.status, json };
}

function check(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(`  \u2713 ${name}`);
  }).catch((err) => {
    failed++;
    console.log(`  \u2717 ${name}\n      ${err.message}`);
  });
}

const db = () => getDb();
const COMPANY = 'comp-genesis-01';
const PASSWORD = 'Fx-Test-Password-2026';
const today = new Date().toISOString().split('T')[0];

function q(sql, ...params) { return db().prepare(sql).get(...params); }

async function main() {
  const started = await startServer({ port: 0, host: '127.0.0.1' });
  serverHandle = started;
  base = `http://127.0.0.1:${started.port}`;

  db().prepare(`INSERT INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
    VALUES ('usr-t-fxadmin', 't.fxadmin', ?, 't.fxadmin', NULL, 'admin', ?, 1, datetime('now'), 0)`)
    .run(hashPassword(PASSWORD), COMPANY);
  const login = await api('POST', '/auth/login', { body: { username: 't.fxadmin', password: PASSWORD } });
  assert.strictEqual(login.status, 200, 'test admin login');
  const admin = login.json.token;

  console.log('--- FX SETTLEMENT TESTS (gain/loss accounts, document settlement, rate history) ---');

  await check('migration v3 created FX gain/loss accounts 4800 and 5900', async () => {
    const v3 = q(`SELECT version FROM schema_migrations WHERE version = 3`);
    assert.ok(v3, 'schema_migrations must contain version 3');
    const gain = q(`SELECT * FROM accounts WHERE company_id = ? AND code = '4800'`, COMPANY);
    const loss = q(`SELECT * FROM accounts WHERE company_id = ? AND code = '5900'`, COMPANY);
    assert.ok(gain && gain.type === 'REVENUE', '4800 FX Gain account missing');
    assert.ok(loss && loss.type === 'EXPENSE', '5900 FX Loss account missing');
  });

  await check('EUR currency and an effective rate of 1.1 can be configured', async () => {
    const c = await api('POST', '/fx/currencies', { token: admin, body: { code: 'EUR', name: 'Euro', symbol: '\u20ac', decimals: 2 } });
    assert.strictEqual(c.status, 200, JSON.stringify(c.json));
    const r = await api('POST', '/fx/rates', { token: admin, body: { fromCode: 'EUR', toCode: 'USD', rate: 1.1, effectiveDate: today } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });

  // ---- customer side: EUR 1,000 invoice booked at 1.1 (base 1,100), paid in
  // full foreign amount when the rate moved to 1.05 (base 1,050) => FX LOSS 50.
  let invoiceId = null;
  await check('a EUR sales invoice stores the foreign total and the base amount at its own rate', async () => {
    const inv = await api('POST', '/sales/invoices', {
      token: admin,
      body: {
        customer_id: 'cust-01', date: today, due_date: today,
        currency_code: 'EUR', exchange_rate: 1.1, autoPost: true,
        lines: [{ product_id: 'prod-01', description: 'Laptop', quantity: 10, unit_price: 100, tax_rate: 0 }]
      }
    });
    assert.strictEqual(inv.status, 200, JSON.stringify(inv.json));
    invoiceId = inv.json.id;
    assert.strictEqual(inv.json.foreignTotal, 1000);
    assert.strictEqual(inv.json.total, 1100);
    const row = q(`SELECT total, currency_code, exchange_rate, foreign_total, status FROM sales_invoices WHERE id = ?`, invoiceId);
    assert.strictEqual(row.status, 'POSTED');
    assert.strictEqual(row.exchange_rate, 1.1);
  });

  await check('a newer same-day rate (1.05) supersedes the old one for new lookups', async () => {
    const r = await api('POST', '/fx/rates', { token: admin, body: { fromCode: 'EUR', toCode: 'USD', rate: 1.05, effectiveDate: today } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const conv = await api('GET', `/fx/convert?amount=1000&from=EUR&to=USD&date=${today}`, { token: admin });
    assert.strictEqual(conv.status, 200);
    assert.strictEqual(conv.json.rate, 1.05);
  });

  await check('settling the invoice in EUR posts the 50 base difference to FX Loss (5900) and clears the document exactly', async () => {
    const custBefore = q(`SELECT current_balance FROM customers WHERE id = 'cust-01'`).current_balance;
    const bankBefore = q(`SELECT current_balance FROM bank_accounts WHERE id = 'bank-01'`).current_balance;
    const pay = await api('POST', '/payments', {
      token: admin,
      body: {
        paymentType: 'CUSTOMER_RECEIPT', paymentMethod: 'BANK_TRANSFER',
        bankAccountId: 'bank-01', customerId: 'cust-01', salesInvoiceId: invoiceId,
        amount: 1050, currencyCode: 'EUR', exchangeRate: 1.05, foreignAmount: 1000,
        settleWithFxDifference: true
      }
    });
    assert.strictEqual(pay.status, 200, JSON.stringify(pay.json));

    const inv = q(`SELECT amount_paid, balance_due, status, exchange_rate FROM sales_invoices WHERE id = ?`, invoiceId);
    assert.strictEqual(inv.status, 'PAID');
    assert.strictEqual(inv.amount_paid, 1100);
    assert.strictEqual(inv.balance_due, 0);
    assert.strictEqual(inv.exchange_rate, 1.1, 'historical invoice rate must be preserved');

    const lines = db().prepare(`SELECT l.*, a.code FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id WHERE l.journal_entry_id = ?`).all(pay.json.journalEntryId);
    const dr = lines.reduce((s, l) => s + l.debit, 0);
    const cr = lines.reduce((s, l) => s + l.credit, 0);
    assert.ok(Math.abs(dr - cr) < 0.005, `journal unbalanced: ${dr} vs ${cr}`);
    const loss = lines.find((l) => l.code === '5900');
    assert.ok(loss && Math.abs(loss.debit - 50) < 0.005, 'FX loss of 50 must be debited to 5900');
    const ar = lines.find((l) => l.description.startsWith('AR:'));
    assert.ok(ar && Math.abs(ar.credit - 1100) < 0.005, 'AR must be credited with the full 1100 base balance');

    const custAfter = q(`SELECT current_balance FROM customers WHERE id = 'cust-01'`).current_balance;
    const bankAfter = q(`SELECT current_balance FROM bank_accounts WHERE id = 'bank-01'`).current_balance;
    assert.ok(Math.abs((custBefore - custAfter) - 1100) < 0.005, 'customer receivable cleared by full base balance');
    assert.ok(Math.abs((bankAfter - bankBefore) - 1050) < 0.005, 'bank increased only by the base amount actually received');
  });

  await check('FX settlement without a linked document is rejected with a stable code', async () => {
    const r = await api('POST', '/payments', {
      token: admin,
      body: {
        paymentType: 'CUSTOMER_RECEIPT', bankAccountId: 'bank-01', customerId: 'cust-01',
        amount: 10, currencyCode: 'EUR', exchangeRate: 1.05, settleWithFxDifference: true
      }
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.json.code, 'FX_SETTLE_REQUIRES_DOCUMENT');
  });

  await check('FX settlement in the base currency is rejected with a stable code', async () => {
    const inv = await api('POST', '/sales/invoices', {
      token: admin,
      body: {
        customer_id: 'cust-02', date: today, due_date: today, autoPost: true,
        lines: [{ product_id: 'prod-02', description: 'Laptop HP', quantity: 1, unit_price: 200, tax_rate: 0 }]
      }
    });
    assert.strictEqual(inv.status, 200, JSON.stringify(inv.json));
    const r = await api('POST', '/payments', {
      token: admin,
      body: {
        paymentType: 'CUSTOMER_RECEIPT', bankAccountId: 'bank-01', customerId: 'cust-02',
        salesInvoiceId: inv.json.id, amount: 190, settleWithFxDifference: true
      }
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.json.code, 'FX_SETTLE_BASE_CURRENCY');
  });

  // ---- supplier side: EUR 500 bill booked at 1.1 (base 550), paid when the
  // rate moved to 1.05 (base 525) => FX GAIN 25.
  let billId = null;
  await check('a EUR supplier bill settles with the difference posted to FX Gain (4800)', async () => {
    const bill = await api('POST', '/purchases/bills', {
      token: admin,
      body: {
        supplier_id: 'supp-01', vendor_invoice_number: 'FX-VEND-001', date: today, due_date: today,
        currency_code: 'EUR', exchange_rate: 1.1, autoPost: true,
        lines: [{ product_id: 'prod-03', description: 'Printer', quantity: 5, unit_cost: 100, tax_rate: 0 }]
      }
    });
    assert.strictEqual(bill.status, 200, JSON.stringify(bill.json));
    billId = bill.json.billId || bill.json.id;
    const brow = q(`SELECT total, exchange_rate, status FROM purchase_invoices WHERE id = ?`, billId);
    assert.strictEqual(brow.status, 'POSTED');
    assert.strictEqual(brow.total, 550);
    assert.strictEqual(brow.exchange_rate, 1.1);

    const suppBefore = q(`SELECT current_balance FROM suppliers WHERE id = 'supp-01'`).current_balance;
    const bankBefore = q(`SELECT current_balance FROM bank_accounts WHERE id = 'bank-01'`).current_balance;
    const pay = await api('POST', '/payments', {
      token: admin,
      body: {
        paymentType: 'SUPPLIER_PAYMENT', paymentMethod: 'BANK_TRANSFER',
        bankAccountId: 'bank-01', supplierId: 'supp-01', purchaseInvoiceId: billId,
        amount: 525, currencyCode: 'EUR', exchangeRate: 1.05, foreignAmount: 500,
        settleWithFxDifference: true
      }
    });
    assert.strictEqual(pay.status, 200, JSON.stringify(pay.json));

    const b = q(`SELECT amount_paid, balance_due, status, exchange_rate FROM purchase_invoices WHERE id = ?`, billId);
    assert.strictEqual(b.status, 'PAID');
    assert.strictEqual(b.amount_paid, 550);
    assert.strictEqual(b.balance_due, 0);
    assert.strictEqual(b.exchange_rate, 1.1, 'historical bill rate must be preserved');

    const lines = db().prepare(`SELECT l.*, a.code FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id WHERE l.journal_entry_id = ?`).all(pay.json.journalEntryId);
    const dr = lines.reduce((s, l) => s + l.debit, 0);
    const cr = lines.reduce((s, l) => s + l.credit, 0);
    assert.ok(Math.abs(dr - cr) < 0.005, `journal unbalanced: ${dr} vs ${cr}`);
    const gain = lines.find((l) => l.code === '4800');
    assert.ok(gain && Math.abs(gain.credit - 25) < 0.005, 'FX gain of 25 must be credited to 4800');
    const ap = lines.find((l) => l.description.startsWith('AP:'));
    assert.ok(ap && Math.abs(ap.debit - 550) < 0.005, 'AP must be debited with the full 550 base balance');

    const suppAfter = q(`SELECT current_balance FROM suppliers WHERE id = 'supp-01'`).current_balance;
    const bankAfter = q(`SELECT current_balance FROM bank_accounts WHERE id = 'bank-01'`).current_balance;
    assert.ok(Math.abs((suppBefore - suppAfter) - 550) < 0.005, 'supplier payable cleared by full base balance');
    assert.ok(Math.abs((bankBefore - bankAfter) - 525) < 0.005, 'bank decreased only by the base amount actually paid');
  });

  await check('without the settlement flag a foreign payment applies normally (no FX accounts touched)', async () => {
    const inv = await api('POST', '/sales/invoices', {
      token: admin,
      body: {
        customer_id: 'cust-03', date: today, due_date: today,
        currency_code: 'EUR', exchange_rate: 1.05, autoPost: true,
        lines: [{ product_id: 'prod-04', description: 'Monitor', quantity: 2, unit_price: 100, tax_rate: 0 }]
      }
    });
    assert.strictEqual(inv.status, 200, JSON.stringify(inv.json));
    const pay = await api('POST', '/payments', {
      token: admin,
      body: {
        paymentType: 'CUSTOMER_RECEIPT', bankAccountId: 'bank-01', customerId: 'cust-03',
        salesInvoiceId: inv.json.id, amount: 150, currencyCode: 'EUR', exchangeRate: 1.05
      }
    });
    assert.strictEqual(pay.status, 200, JSON.stringify(pay.json));
    const lines = db().prepare(`SELECT a.code FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id WHERE l.journal_entry_id = ?`).all(pay.json.journalEntryId);
    assert.ok(!lines.some((l) => l.code === '4800' || l.code === '5900'), 'no FX lines without the flag');
    const row = q(`SELECT amount_paid, status FROM sales_invoices WHERE id = ?`, inv.json.id);
    assert.strictEqual(row.amount_paid, 150);
    assert.strictEqual(row.status, 'PARTIALLY_PAID');
  });

  await check('the Trial Balance remains balanced after all FX settlements', async () => {
    const tb = await api('GET', '/reports/trial-balance', { token: admin });
    assert.strictEqual(tb.status, 200);
    assert.strictEqual(tb.json.isBalanced, true);
  });

  await check('repository genesis.db unchanged', async () => {
    if (!sourceMd5Before) return;
    const after = crypto.createHash('md5').update(fs.readFileSync(SOURCE_DB)).digest('hex');
    assert.strictEqual(after, sourceMd5Before);
  });

  console.log(`--- ${passed} passed, ${failed} failed ---`);
  await serverHandle.close();
  fs.rmSync(workDir, { recursive: true, force: true });
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('FATAL:', err);
  if (serverHandle) await serverHandle.close();
  process.exit(1);
});
