'use strict';
/**
 * REPORTS SCREEN TESTS.
 *
 * Opening "Profit & Loss" or "Balance Sheet" used to stop the whole
 * interface: the screen drew the report that had just been asked for with the
 * answer of the report that was open before it (the trial balance), read
 * `revenueRows` / `assets.current` from a payload that does not have them, and
 * threw. Nothing could be seen until the application was restarted.
 *
 * These tests cover both halves of that:
 *   1. the rule that decides whether an answer may be drawn as a report
 *      (src/reportShapes.js), including the exact mix that used to crash;
 *   2. the reports themselves, against a real database with real entries —
 *      the figures, the date filters, the identity Assets = Liabilities +
 *      Equity, and the split between operating revenue and other income.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-reports-'));
const dbPath = path.join(workDir, 'genesis.db');
if (fs.existsSync(SOURCE_DB)) fs.copyFileSync(SOURCE_DB, dbPath);
process.env.GENESIS_DB_PATH = dbPath;
process.env.GENESIS_DIST_DIR = path.join(ROOT, 'dist');

const { startServer } = require('../server/index.js');
const { getDb } = require('../server/db');
const { hashPassword } = require('../server/passwords');

const PASSWORD = 'Report-Test-Password-2026';

let passed = 0;
let failed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    })
    .catch((err) => {
      failed += 1;
      console.log(`  ✗ ${name}\n      ${err.message}`);
    });
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** src/reportShapes.js is an ES module; it is loaded the way src tests do. */
function loadReportShapes() {
  const source = read('src/reportShapes.js');
  const names = [...source.matchAll(/export (?:function|const) (\w+)/g)].map((m) => m[1]);
  const body = source.replace(/export (function|const)/g, '$1');
  // runInThisContext keeps the same Array/Object realm, so the empty lists the
  // module returns compare equal to the ones the test writes down.
  vm.runInThisContext(`${body}\n;globalThis.__reportShapes = { ${names.join(', ')} };`, {
    filename: 'reportShapes.js'
  });
  const loaded = globalThis.__reportShapes;
  delete globalThis.__reportShapes;
  return loaded;
}

const shapes = loadReportShapes();

// The five payloads, as the server returns them.
const trialBalance = { report: 'trial_balance', rows: [{ code: '1010', netDebit: 10, netCredit: 0 }], isBalanced: true };
const pnl = {
  report: 'pnl',
  revenueRows: [{ code: '4000', amount: 100 }],
  cogsRows: [{ code: '5000', amount: 40 }],
  expenseRows: [{ code: '6000', amount: 10 }],
  otherIncomeRows: [{ code: '4900', amount: 5 }],
  otherExpenseRows: [],
  netProfit: 55
};
const balanceSheet = {
  report: 'balance_sheet',
  assets: { current: [{ code: '1010', amount: 50 }], fixed: [], total: 50 },
  liabilities: { current: [], longTerm: [], total: 10 },
  equity: { rows: [{ code: '3010', amount: 40 }], total: 40 },
  isBalanced: true
};
const cashFlow = { report: 'cash_flow', netIncome: 55, netOperatingCash: 12, beginningCash: 3, endingCash: 15, netChangeInCash: 12 };
const tax = { report: 'tax', outputTax: 18, inputTax: 5, netTaxPayable: 13, taxableSales: 100, taxablePurchases: 28 };

console.log('--- REPORTS SCREEN TESTS (the two reports that stopped the interface) ---');

// ---------------------------------------------------------------------------
// 1. The rule that decides what may be drawn
// ---------------------------------------------------------------------------
check('an answer is only drawn by the report it belongs to', () => {
  assert.strictEqual(shapes.payloadBelongsTo(trialBalance, 'trial_balance'), true);
  assert.strictEqual(shapes.payloadBelongsTo(pnl, 'pnl'), true);
  assert.strictEqual(shapes.payloadBelongsTo(balanceSheet, 'balance_sheet'), true);
  assert.strictEqual(shapes.payloadBelongsTo(cashFlow, 'cash_flow'), true);
  assert.strictEqual(shapes.payloadBelongsTo(tax, 'tax'), true);
  for (const [payload, own] of [[trialBalance, 'trial_balance'], [pnl, 'pnl'], [balanceSheet, 'balance_sheet'], [cashFlow, 'cash_flow'], [tax, 'tax']]) {
    for (const id of shapes.REPORT_IDS) {
      if (id === own) continue;
      assert.strictEqual(shapes.payloadBelongsTo(payload, id), false, `a ${own} answer must not be drawn as ${id}`);
    }
  }
});

check('the mix that stopped the interface is refused instead of drawn', () => {
  // The crash: Profit & Loss opened while the trial balance answer was still
  // in state. The screen read `revenueRows` from a payload that has no such
  // list, and the interface stopped.
  assert.strictEqual(shapes.payloadBelongsTo(trialBalance, 'pnl'), false);
  assert.strictEqual(shapes.payloadBelongsTo(trialBalance, 'balance_sheet'), false);
  assert.deepStrictEqual(shapes.rowsOf(trialBalance, 'pnl', 'revenueRows'), []);
  assert.deepStrictEqual(shapes.rowsOf(trialBalance, 'pnl', 'otherIncomeRows'), []);
  assert.strictEqual(shapes.amountOf(trialBalance, 'pnl', 'netProfit'), 0);
  assert.strictEqual(shapes.payloadBelongsTo(pnl, 'balance_sheet'), false);
  assert.deepStrictEqual(shapes.rowsOf(pnl, 'balance_sheet', 'current'), []);
});

check('an answer without a marker is recognised by its shape', () => {
  const bare = { rows: [{ code: '1010' }] };
  assert.strictEqual(shapes.payloadBelongsTo(bare, 'trial_balance'), true);
  assert.strictEqual(shapes.payloadBelongsTo(bare, 'pnl'), false);
  assert.strictEqual(shapes.payloadBelongsTo({ assets: { current: [] } }, 'balance_sheet'), true);
  assert.strictEqual(shapes.payloadBelongsTo({ outputTax: 1 }, 'tax'), true);
  assert.strictEqual(shapes.payloadBelongsTo(null, 'pnl'), false);
  assert.strictEqual(shapes.payloadBelongsTo(undefined, 'tax'), false);
  assert.strictEqual(shapes.payloadBelongsTo('nonsense', 'pnl'), false);
});

check('the Reports screen uses the rule for every report it draws', () => {
  const source = read('src/views/ReportsView.jsx');
  assert.ok(source.includes('payloadBelongsTo'), 'the screen must use the shared rule');
  assert.ok(/setData\(null\)/.test(source), 'the previous answer must be cleared before a new one is asked for');
  for (const id of shapes.REPORT_IDS) {
    const block = new RegExp(`activeReport === '${id}' && isPayload\\('${id}'\\)`).test(source);
    assert.ok(block, `the ${id} block must check that the answer belongs to it`);
  }
  // Every list the screen draws is read through the safe reader.
  assert.ok(!/(?:^|[^a-zA-Z])data\.(rows|revenueRows|cogsRows|expenseRows|otherIncomeRows|otherExpenseRows)\.map\(/.test(source),
    'no report list may be mapped without the guard');
  assert.ok(!/data\.(?:assets|liabilities|equity)\.(?:current|fixed|longTerm|rows)\.map\(/.test(source),
    'no nested balance-sheet list may be mapped without the guard');
  // A report that is not there yet says so instead of leaving a blank page.
  assert.ok(/isPayload\(activeReport\)/.test(source), 'the screen must explain an empty result');
});

// ---------------------------------------------------------------------------
// 2. The reports themselves, against a real database
// ---------------------------------------------------------------------------
const db = () => getDb();

/** A balanced, posted journal entry, written directly for the test only. */
function postEntry(id, date, lines, memo = 'report test') {
  const database = db();
  const companyId = database.prepare('SELECT id FROM companies LIMIT 1').get().id;
  const debit = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
  const credit = lines.reduce((sum, l) => sum + (l.credit || 0), 0);
  assert.ok(Math.abs(debit - credit) < 0.000001, `the test entry must balance (${debit} vs ${credit})`);
  database.prepare(`INSERT INTO journal_entries
      (id, company_id, entry_number, date, description, source_type, total_debit, total_credit, status, created_by)
    VALUES (?, ?, ?, ?, ?, 'MANUAL', ?, ?, 'POSTED', 'report-test')`)
    .run(id, companyId, `JE-${id}`, date, memo, debit, credit);
  const insertLine = database.prepare(`INSERT INTO journal_entry_lines
      (id, journal_entry_id, account_id, line_number, description, debit, credit)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  lines.forEach((line, i) => {
    insertLine.run(`${id}-l${i}`, id, line.account, i + 1, memo, line.debit || 0, line.credit || 0);
  });
  return { companyId, id };
}

/** A user of the demo company, as the other server tests create them. */
function insertUser(id, username, role) {
  const companyId = db().prepare('SELECT id FROM companies LIMIT 1').get().id;
  db().prepare(`INSERT INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
    VALUES (?, ?, ?, ?, NULL, ?, ?, 1, datetime('now'), 0)`)
    .run(id, username, hashPassword(PASSWORD), username, role, companyId);
}

async function main() {
  insertUser('usr-report-admin', 'r.admin', 'admin');

  const started = await startServer({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${started.port}`;

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'r.admin', password: PASSWORD })
  });
  const loginBody = await login.json();
  assert.ok(loginBody.token, `the test administrator must sign in: ${JSON.stringify(loginBody)}`);
  const token = loginBody.token;

  async function report(route, query = '') {
    const res = await fetch(`${base}/api/reports/${route}${query}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    const json = await res.json();
    return { status: res.status, json };
  }

  // Other revenue and other expense exist in the standard chart of accounts;
  // post one of each so the split is really exercised.
  const accounts = db().prepare('SELECT id, code, type, subtype FROM accounts').all();
  const otherRevenue = accounts.find((a) => a.subtype === 'OTHER_REVENUE');
  const bank = accounts.find((a) => a.type === 'ASSET' && a.subtype === 'BANK');
  const revenue = accounts.find((a) => a.type === 'REVENUE' && a.subtype !== 'OTHER_REVENUE');
  const expense = accounts.find((a) => a.type === 'EXPENSE');
  assert.ok(otherRevenue && bank && revenue && expense, 'the chart of accounts must offer revenue, other revenue, an expense and a bank account');

  postEntry('je-report-other-income', '2026-05-31', [
    { account: bank.id, debit: 250 },
    { account: otherRevenue.id, credit: 250 }
  ]);
  postEntry('je-report-trade', '2026-06-30', [
    { account: bank.id, debit: 1000 },
    { account: revenue.id, credit: 1000 }
  ]);
  postEntry('je-report-expense', '2026-07-31', [
    { account: expense.id, debit: 300 },
    { account: bank.id, credit: 300 }
  ]);

  await check('every report answers with the marker of the report it is', async () => {
    const expected = {
      'trial-balance': 'trial_balance',
      'profit-loss': 'pnl',
      'balance-sheet': 'balance_sheet',
      'cash-flow': 'cash_flow',
      'tax-report': 'tax'
    };
    for (const [route, id] of Object.entries(expected)) {
      const r = await report(route);
      assert.strictEqual(r.status, 200, `${route} must answer 200 (${JSON.stringify(r.json)})`);
      assert.strictEqual(r.json.report, id, `${route} must say it is a ${id} answer`);
      assert.strictEqual(shapes.payloadBelongsTo(r.json, id), true, `${route} must be drawn as ${id}`);
    }
  });

  await check('Profit & Loss reports revenue, cost of sales, gross profit, expenses and the net result', async () => {
    const r = await report('profit-loss', '?startDate=2026-01-01&endDate=2026-12-31');
    assert.strictEqual(r.status, 200);
    const d = r.json;
    for (const key of ['revenueRows', 'cogsRows', 'expenseRows', 'otherIncomeRows', 'otherExpenseRows']) {
      assert.ok(Array.isArray(d[key]), `the answer must contain ${key}`);
    }
    const sum = (rows) => rows.reduce((acc, row) => acc + row.amount, 0);
    assert.ok(Math.abs(sum(d.revenueRows) - d.totalRevenue) < 0.01, 'the revenue total is the sum of the revenue rows');
    assert.ok(Math.abs(sum(d.cogsRows) - d.totalCogs) < 0.01, 'the cost-of-sales total is the sum of its rows');
    assert.ok(Math.abs(sum(d.expenseRows) - d.totalExpenses) < 0.01, 'the expense total is the sum of its rows');
    assert.ok(Math.abs(sum(d.otherIncomeRows) - d.totalOtherIncome) < 0.01, 'the other-income total is the sum of its rows');
    assert.ok(Math.abs(d.grossProfit - (d.totalRevenue - d.totalCogs)) < 0.01, 'gross profit = revenue − cost of sales');
    assert.ok(Math.abs(d.operatingProfit - (d.grossProfit - d.totalExpenses)) < 0.01, 'operating profit = gross profit − expenses');
    assert.ok(
      Math.abs(d.netProfit - (d.operatingProfit + d.totalOtherIncome - d.totalOtherExpenses)) < 0.01,
      'net profit = operating profit + other income − other expenses'
    );
  });

  await check('other income is reported beside the trading result, never inside revenue', async () => {
    const r = await report('profit-loss', '?startDate=2026-01-01&endDate=2026-12-31');
    const d = r.json;
    assert.ok(d.totalOtherIncome > 0, 'the other income posted for this test must be reported');
    assert.ok(d.otherIncomeRows.some((row) => row.code === otherRevenue.code),
      `the other-revenue account ${otherRevenue.code} must be listed as other income`);
    assert.ok(!d.revenueRows.some((row) => row.code === otherRevenue.code),
      `the other-revenue account ${otherRevenue.code} must not be counted as operating revenue`);
    assert.ok(d.revenueRows.some((row) => row.code === revenue.code), 'ordinary revenue stays in operating revenue');
  });

  await check('the date filter decides what the Profit & Loss shows', async () => {
    const all = (await report('profit-loss', '?startDate=2026-01-01&endDate=2026-12-31')).json;
    const june = (await report('profit-loss', '?startDate=2026-06-01&endDate=2026-06-30')).json;
    assert.ok(june.totalRevenue <= all.totalRevenue, 'a narrower period can never show more revenue');
    assert.strictEqual(june.totalExpenses, 0, 'July expenses must not appear in the June period');
    assert.ok(june.totalRevenue > 0, 'the June sale must appear in the June period');
    assert.strictEqual(june.startDate, '2026-06-01');
    assert.strictEqual(june.endDate, '2026-06-30');
  });

  await check('the Balance Sheet respects Assets = Liabilities + Equity', async () => {
    const r = await report('balance-sheet', '?asOfDate=2026-12-31');
    assert.strictEqual(r.status, 200);
    const d = r.json;
    assert.ok(Array.isArray(d.assets.current) && Array.isArray(d.assets.fixed));
    assert.ok(Array.isArray(d.liabilities.current) && Array.isArray(d.liabilities.longTerm));
    assert.ok(Array.isArray(d.equity.rows));
    assert.ok(
      Math.abs(d.assets.total - (d.liabilities.total + d.equity.total)) < 0.02,
      `assets ${d.assets.total} must equal liabilities ${d.liabilities.total} + equity ${d.equity.total}`
    );
    assert.strictEqual(d.isBalanced, true, 'the balance sheet must report that it balances');
    assert.ok(Math.abs(d.totalLiabilitiesAndEquity - d.assets.total) < 0.02);
  });

  await check('the Balance Sheet carries the period result into equity', async () => {
    const d = (await report('balance-sheet', '?asOfDate=2026-12-31')).json;
    const pnlNow = (await report('profit-loss', '?startDate=1900-01-01&endDate=2026-12-31')).json;
    const earnings = d.equity.rows.find((row) => row.code === 'NET-INCOME');
    if (pnlNow.netProfit !== 0) {
      assert.ok(earnings, 'the period result must appear in equity');
      assert.ok(Math.abs(earnings.amount - pnlNow.netProfit) < 0.02,
        'the equity result must be the net profit of the same period');
    }
  });

  await check('a period with no entries produces an empty report, not a broken one', async () => {
    const d = (await report('balance-sheet', '?asOfDate=2019-12-31')).json;
    assert.strictEqual(d.assets.total, 0);
    assert.deepStrictEqual(d.equity.rows, []);
    assert.strictEqual(d.isBalanced, true);
    assert.strictEqual(shapes.payloadBelongsTo(d, 'balance_sheet'), true);
    const p = (await report('profit-loss', '?startDate=2019-01-01&endDate=2019-12-31')).json;
    assert.strictEqual(p.netProfit, 0);
    assert.deepStrictEqual(p.revenueRows, []);
  });

  await check('the reports refuse an unauthorised caller instead of answering', async () => {
    const res = await fetch(`${base}/api/reports/profit-loss`);
    assert.strictEqual(res.status, 401, 'an anonymous caller must not receive the figures');
  });

  await check('a report answer is never drawn as another report', async () => {
    const answers = {
      trial_balance: (await report('trial-balance')).json,
      pnl: (await report('profit-loss')).json,
      balance_sheet: (await report('balance-sheet')).json,
      cash_flow: (await report('cash-flow')).json,
      tax: (await report('tax-report')).json
    };
    for (const [own, payload] of Object.entries(answers)) {
      for (const id of shapes.REPORT_IDS) {
        if (id === own) continue;
        assert.strictEqual(shapes.payloadBelongsTo(payload, id), false,
          `a real ${own} answer must not be drawn as ${id}`);
      }
      // And the screen block that would have crashed reads an empty list.
      assert.deepStrictEqual(shapes.rowsOf(payload, 'pnl', 'revenueRows'),
        own === 'pnl' ? payload.revenueRows : [],
        'the Profit & Loss block only reads revenue rows from a Profit & Loss answer');
    }
  });

  started.close();
}

main()
  .then(() => {
    console.log(`--- ${passed} passed, ${failed} failed ---`);
    try { db().close(); } catch (_) { /* already closed */ }
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.log(`  ✗ the reports suite could not run\n      ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  });
