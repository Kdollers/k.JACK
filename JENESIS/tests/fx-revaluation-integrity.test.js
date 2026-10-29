'use strict';
/**
 * Period-end FX revaluation — integrity tests added by the JEN 0.2 + JAN 0.3 merge.
 *
 * They go one step further than tests/fx-settlement.test.js and prove that the
 * revaluation feature cannot damage an existing ledger:
 *   - no historical journal entry is modified,
 *   - the sub-ledger (customer/supplier balances) stays in step with the
 *     A/R and A/P control accounts,
 *   - realised (4800/5900) and unrealised (4810/5910) effects stay separated,
 *   - companies are isolated from each other,
 *   - documents without a usable booking rate are skipped, never guessed.
 *
 * Runs on a temporary COPY of genesis.db; the shipped database is never written to.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jenesis-fxreval-'));
const dbPath = path.join(workDir, 'genesis.db');
if (fs.existsSync(SOURCE_DB)) fs.copyFileSync(SOURCE_DB, dbPath);
process.env.GENESIS_DB_PATH = dbPath;
process.env.GENESIS_DIST_DIR = path.join(ROOT, 'dist');

const { startServer } = require('../server/index.js');
const { getDb } = require('../server/db');
const { hashPassword } = require('../server/passwords');

const COMPANY = 'comp-genesis-01';
const OTHER_COMPANY = 'comp-other-01';
const PASSWORD = 'Fx-Reval-Password-2026';
const AR_ACCOUNT = 'acc-1100';

let base;
let serverHandle;
let admin;
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
const q = (sql, ...params) => db().prepare(sql).get(...params);
const day = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().split('T')[0];

function journalSnapshot(companyId) {
  const rows = db().prepare(`
    SELECT id, entry_number, date, description, total_debit, total_credit, source_type
    FROM journal_entries WHERE company_id = ? ORDER BY id
  `).all(companyId);
  return rows;
}

function accountBalance(companyId, accountId) {
  const row = q(`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
    FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
    WHERE je.company_id = ? AND l.account_id = ?
  `, companyId, accountId);
  return row.balance;
}

function customersBalance(companyId) {
  return q(`SELECT COALESCE(SUM(current_balance), 0) AS total FROM customers WHERE company_id = ?`, companyId).total;
}

function trialBalance(companyId) {
  return q(`
    SELECT COALESCE(SUM(l.debit), 0) AS d, COALESCE(SUM(l.credit), 0) AS c
    FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
    WHERE je.company_id = ?
  `, companyId);
}

async function main() {
  const started = await startServer({ port: 0, host: '127.0.0.1' });
  serverHandle = started;
  base = `http://127.0.0.1:${started.port}`;

  db().prepare(`INSERT INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
    VALUES ('usr-t-fxreval', 't.fxreval', ?, 'FX Revaluation Tester', NULL, 'admin', ?, 1, datetime('now'), 0)`)
    .run(hashPassword(PASSWORD), COMPANY);
  const login = await api('POST', '/auth/login', { body: { username: 't.fxreval', password: PASSWORD } });
  assert.strictEqual(login.status, 200, 'test admin login');
  admin = login.json.token;

  const bookDate = day(-10);
  const revalDate = day(0);
  const secondDate = day(1);

  console.log('--- FX REVALUATION INTEGRITY TESTS (history, sub-ledger, isolation) ---');

  // -------------------------------------------------------------------------
  // Fixtures: an open EUR invoice for company A, an open EUR document for a
  // SECOND company, and an open EUR document whose booking rate is missing.
  // -------------------------------------------------------------------------
  let invoiceId;
  let otherCompanyDocId;
  let noRateDocId;

  await check('fixtures: EUR currency, a booked rate and one partly paid EUR invoice', async () => {
    const cur = await api('POST', '/fx/currencies', { token: admin, body: { code: 'EUR', name: 'Euro', symbol: '\u20ac', decimals: 2 } });
    assert.ok(cur.status === 200 || cur.json.code === 'DUPLICATE' || cur.status === 400, JSON.stringify(cur.json));
    const rate = await api('POST', '/fx/rates', { token: admin, body: { fromCode: 'EUR', toCode: 'USD', rate: 1.1, effectiveDate: bookDate } });
    assert.strictEqual(rate.status, 200, JSON.stringify(rate.json));

    const inv = await api('POST', '/sales/invoices', {
      token: admin,
      body: {
        customer_id: 'cust-01', date: bookDate, due_date: bookDate,
        currency_code: 'EUR', exchange_rate: 1.1, autoPost: true,
        lines: [{ product_id: 'prod-01', description: 'Laptop', quantity: 10, unit_price: 100, tax_rate: 0 }]
      }
    });
    assert.strictEqual(inv.status, 200, JSON.stringify(inv.json));
    invoiceId = inv.json.id;
    assert.strictEqual(inv.json.total, 1100, 'base total = 1000 EUR x 1.10');

    const pay = await api('POST', '/payments', {
      token: admin,
      body: {
        paymentType: 'CUSTOMER_RECEIPT', paymentMethod: 'BANK_TRANSFER',
        bankAccountId: 'bank-01', customerId: 'cust-01', salesInvoiceId: invoiceId, amount: 300
      }
    });
    assert.strictEqual(pay.status, 200, JSON.stringify(pay.json));
    const row = q(`SELECT status, total, amount_paid, balance_due, foreign_total, exchange_rate, booked_exchange_rate FROM sales_invoices WHERE id = ?`, invoiceId);
    assert.strictEqual(row.status, 'PARTIALLY_PAID');
    assert.strictEqual(row.balance_due, 800);
    assert.strictEqual(row.booked_exchange_rate, 1.1, 'booking rate stamped at creation');
  });

  await check('fixtures: a second company with its own open EUR document', async () => {
    db().prepare(`INSERT INTO companies (id, code, name, currency_code, created_at, updated_at)
      VALUES (?, 'TST-OTHER', 'Other Test Company', 'USD', datetime('now'), datetime('now'))`).run(OTHER_COMPANY);
    db().prepare(`INSERT INTO customers (id, company_id, code, name, current_balance, created_at)
      VALUES ('cust-other-01', ?, 'C-OTHER', 'Other Company Customer', 0, datetime('now'))`).run(OTHER_COMPANY);
    otherCompanyDocId = 'inv-other-01';
    db().prepare(`
      INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id,
        subtotal, tax_total, discount_total, total, amount_paid, balance_due, status,
        currency_code, exchange_rate, foreign_total, created_at)
      VALUES (?, ?, 'INV-OTHER-0001', ?, ?, 'cust-other-01',
        500, 0, 0, 550, 0, 550, 'POSTED',
        'EUR', 1.1, 500, datetime('now'))
    `).run(otherCompanyDocId, OTHER_COMPANY, bookDate, bookDate);
    const row = q(`SELECT company_id, balance_due FROM sales_invoices WHERE id = ?`, otherCompanyDocId);
    assert.strictEqual(row.company_id, OTHER_COMPANY);
    assert.strictEqual(row.balance_due, 550);
  });

  await check('fixtures: an open EUR document with an unusable booking rate (0)', async () => {
    // exchange_rate is NOT NULL DEFAULT 1, so the only way such a row can exist
    // is a zero/legacy value. It must be skipped, never restated at rate 1.
    noRateDocId = 'inv-norate-01';
    db().prepare(`
      INSERT INTO sales_invoices (id, company_id, invoice_number, date, due_date, customer_id,
        subtotal, tax_total, discount_total, total, amount_paid, balance_due, status,
        currency_code, exchange_rate, created_at)
      VALUES (?, ?, 'INV-NORATE-0001', ?, ?, 'cust-02',
        100, 0, 0, 100, 0, 100, 'POSTED',
        'EUR', 0, datetime('now'))
    `).run(noRateDocId, COMPANY, bookDate, bookDate);
    const row = q(`SELECT exchange_rate FROM sales_invoices WHERE id = ?`, noRateDocId);
    assert.strictEqual(row.exchange_rate, 0);
  });

  // -------------------------------------------------------------------------
  const beforeJournals = journalSnapshot(COMPANY);
  const beforeAr = accountBalance(COMPANY, AR_ACCOUNT);
  const beforeCustomers = customersBalance(COMPANY);
  const beforeTb = trialBalance(COMPANY);
  const beforeInvoice = q(`SELECT total, amount_paid, balance_due, foreign_total, exchange_rate, booked_exchange_rate FROM sales_invoices WHERE id = ?`, invoiceId);

  let reval;

  await check('the rate moves to 1.25 and the period is revalued', async () => {
    const r = await api('POST', '/fx/rates', { token: admin, body: { fromCode: 'EUR', toCode: 'USD', rate: 1.25, effectiveDate: revalDate } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const res = await api('POST', '/fx/revaluate', { token: admin, body: { date: revalDate, notes: 'merge verification' } });
    assert.strictEqual(res.status, 200, JSON.stringify(res.json));
    reval = res.json;
    // 800 base / 1.10 = 727.2727 EUR outstanding, restated at 1.25 = 909.09 => gain 109.09
    assert.strictEqual(reval.documents, 1, 'only the document with a usable rate is revalued');
    assert.ok(Math.abs(reval.totalGain - 109.09) < 0.01, `expected gain 109.09, got ${reval.totalGain}`);
    assert.strictEqual(reval.totalLoss, 0);
  });

  await check('no historical journal entry is modified by a revaluation', async () => {
    const after = journalSnapshot(COMPANY);
    const beforeIds = new Set(beforeJournals.map((j) => j.id));
    const changed = after
      .filter((j) => beforeIds.has(j.id))
      .filter((j) => {
        const old = beforeJournals.find((b) => b.id === j.id);
        return old.total_debit !== j.total_debit || old.total_credit !== j.total_credit ||
          old.description !== j.description || old.date !== j.date || old.source_type !== j.source_type;
      });
    assert.deepStrictEqual(changed, [], `historical entries changed: ${JSON.stringify(changed)}`);
    assert.strictEqual(after.length, beforeJournals.length + 1, 'exactly one new journal entry (the revaluation)');
    const added = after.find((j) => !beforeIds.has(j.id));
    assert.strictEqual(added.source_type, 'FX_REVALUATION');
  });

  await check('the revaluation journal is balanced and the trial balance stays balanced', async () => {
    const lines = db().prepare(`SELECT l.*, a.code FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id WHERE l.journal_entry_id = ?`).all(reval.journalEntryId);
    const dr = lines.reduce((s, l) => s + l.debit, 0);
    const cr = lines.reduce((s, l) => s + l.credit, 0);
    assert.ok(Math.abs(dr - cr) < 0.005, `unbalanced revaluation journal: ${dr} vs ${cr}`);
    const ar = lines.find((l) => l.code === '1100');
    const gain = lines.find((l) => l.code === '4810');
    assert.ok(ar && Math.abs(ar.debit - 109.09) < 0.01, 'A/R control account debited with the gain');
    assert.ok(gain && Math.abs(gain.credit - 109.09) < 0.01, 'unrealised gain credited to 4810');
    assert.ok(!lines.some((l) => l.code === '4800' || l.code === '5900'),
      'a revaluation must never touch the realised FX accounts 4800/5900');
    const tb = trialBalance(COMPANY);
    assert.ok(Math.abs(tb.d - tb.c) < 0.005, `trial balance out of balance: ${tb.d} vs ${tb.c}`);
    assert.ok(Math.abs((tb.d - beforeTb.d) - 109.09) < 0.01, 'the trial balance grew by exactly the revaluation amount');
  });

  await check('the customer sub-ledger moves in step with the A/R control account', async () => {
    const arDelta = accountBalance(COMPANY, AR_ACCOUNT) - beforeAr;
    const custDelta = customersBalance(COMPANY) - beforeCustomers;
    assert.ok(Math.abs(arDelta - 109.09) < 0.01, `A/R control moved by ${arDelta}`);
    assert.ok(Math.abs(arDelta - custDelta) < 0.005,
      `sub-ledger (${custDelta}) and control account (${arDelta}) must move together`);
  });

  await check('the document is restated, but payments, foreign amount and booking rate are untouched', async () => {
    const row = q(`SELECT total, amount_paid, balance_due, foreign_total, exchange_rate, booked_exchange_rate, status FROM sales_invoices WHERE id = ?`, invoiceId);
    assert.strictEqual(row.amount_paid, beforeInvoice.amount_paid, 'cash already received must not change');
    assert.strictEqual(row.foreign_total, beforeInvoice.foreign_total, 'the foreign amount owed does not change');
    assert.strictEqual(row.booked_exchange_rate, 1.1, 'the original booking rate is preserved forever');
    assert.strictEqual(row.exchange_rate, 1.25, 'the current book rate advances to the revaluation rate');
    assert.ok(Math.abs(row.balance_due - 909.09) < 0.01, `balance restated to 909.09, got ${row.balance_due}`);
    assert.ok(Math.abs(row.total - (row.amount_paid + row.balance_due)) < 0.005, 'total = amount_paid + balance_due');
    assert.strictEqual(row.status, 'PARTIALLY_PAID');
  });

  await check('a document without a usable booking rate is skipped, never guessed', async () => {
    const row = q(`SELECT total, balance_due, exchange_rate, booked_exchange_rate FROM sales_invoices WHERE id = ?`, noRateDocId);
    assert.strictEqual(row.balance_due, 100, 'the document must be left exactly as it was');
    assert.strictEqual(row.total, 100);
    assert.strictEqual(row.exchange_rate, 0);
    const line = q(`SELECT id FROM fx_revaluation_lines WHERE revaluation_id = ? AND document_id = ?`, reval.revaluationId, noRateDocId);
    assert.strictEqual(line, undefined, 'no revaluation line may be written for it');
  });

  await check('another company is never touched by this company’s revaluation', async () => {
    const row = q(`SELECT balance_due, total, exchange_rate FROM sales_invoices WHERE id = ?`, otherCompanyDocId);
    assert.strictEqual(row.balance_due, 550, 'the other company’s document must not be restated');
    assert.strictEqual(row.exchange_rate, 1.1);
    assert.strictEqual(accountBalance(OTHER_COMPANY, 'acc-1100'), 0, 'no posting in the other company’s ledger');
    const stray = q(`SELECT id FROM fx_revaluations WHERE company_id = ?`, OTHER_COMPANY);
    assert.strictEqual(stray, undefined, 'no revaluation record for the other company');
  });

  await check('the revaluation is recorded in history with per-document lines', async () => {
    const list = await api('GET', '/fx/revaluations', { token: admin });
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.json.length, 1);
    assert.strictEqual(list.json[0].revaluation_number, reval.revaluationNumber);
    assert.strictEqual(list.json[0].documents_count, 1);

    const detail = await api('GET', `/fx/revaluations/${reval.revaluationId}`, { token: admin });
    assert.strictEqual(detail.status, 200);
    assert.strictEqual(detail.json.lines.length, 1);
    const line = detail.json.lines[0];
    assert.strictEqual(line.currency_code, 'EUR');
    assert.strictEqual(line.previous_rate, 1.1);
    assert.strictEqual(line.new_rate, 1.25);
    assert.ok(Math.abs(line.previous_base_balance - 800) < 0.01);
    assert.ok(Math.abs(line.new_base_balance - 909.09) < 0.01);
    assert.ok(Math.abs(line.difference - 109.09) < 0.01);
  });

  await check('the revaluation is written to the audit trail', async () => {
    const entry = q(`SELECT * FROM audit_logs WHERE action = 'FX_REVALUE' AND record_id = ?`, reval.revaluationId);
    assert.ok(entry, 'an audit log entry must exist for the revaluation');
    assert.strictEqual(entry.module, 'SETTINGS');
    assert.ok(/FXR-\d{4}-\d{4}/.test(entry.description), `unexpected audit description: ${entry.description}`);
  });

  await check('a second revaluation on a later date posts only the incremental movement', async () => {
    const r = await api('POST', '/fx/rates', { token: admin, body: { fromCode: 'EUR', toCode: 'USD', rate: 1.25, effectiveDate: secondDate } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const res = await api('POST', '/fx/revaluate', { token: admin, body: { date: secondDate } });
    assert.strictEqual(res.status, 400, JSON.stringify(res.json));
    assert.strictEqual(res.json.code, 'NO_FX_EXPOSURE', 'an unchanged rate must post nothing at all');
    const tb = trialBalance(COMPANY);
    assert.ok(Math.abs(tb.d - tb.c) < 0.005, 'trial balance still balanced');
  });

  await check('re-running the same date is still refused after all of the above', async () => {
    const res = await api('POST', '/fx/revaluate', { token: admin, body: { date: revalDate } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.json.code, 'FX_REVALUATION_EXISTS');
  });

  const sourceMd5Before = fs.existsSync(SOURCE_DB)
    ? crypto.createHash('md5').update(fs.readFileSync(SOURCE_DB)).digest('hex')
    : null;

  await serverHandle.close();
  await new Promise((r) => setTimeout(r, 50));
  if (sourceMd5Before) {
    const after = crypto.createHash('md5').update(fs.readFileSync(SOURCE_DB)).digest('hex');
    assert.strictEqual(after, sourceMd5Before, 'repository genesis.db must not be modified');
    console.log('  \u2713 repository genesis.db unchanged');
    passed++;
  }

  console.log(`--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
