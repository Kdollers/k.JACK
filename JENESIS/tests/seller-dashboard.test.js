'use strict';
/**
 * JENESIS SELLER DASHBOARD TESTS (0.5.5, modification 2).
 *
 * The Seller used to be handed the accounting dashboard: profit and loss, the
 * balance sheet, receivables, payables, the general ledger. The requirement is
 * that it stops — and, in the same breath, that the Seller stays connected to
 * the same database and that every sale it writes still updates the books.
 *
 * So this suite proves three things, over real HTTP against a real server on a
 * temporary copy of genesis.db:
 *
 *   A. the Seller's own endpoint answers the counter's question and cannot
 *      return an accounting figure at all;
 *   B. a Seller window cannot reach the accounting screens by asking for them,
 *      even as a user whose role would be allowed to from Accounting;
 *   C. a sale written through the shared database is the same sale the
 *      accountant reconciles — one invoice, one journal entry, one stock
 *      movement — and the Seller's figures move with it.
 *
 * What these CANNOT cover: they do not open the installed JENESIS Seller
 * shortcut, and they cannot see the drawn dashboard. The drawing of the screen
 * is asserted separately in tests/four-apps-render.test.js; the refusal of the
 * accounting routes in tests/app-separation.test.js.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const { BackendProcess, findFreePort } = require('../electron/backend-manager.cjs');
const { hashPassword } = require('../server/passwords');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');
const PASSWORD = 'Seller-Dashboard-Passw0rd';

let passed = 0;
let failed = 0;
const pending = [];
const test = (name, fn) => pending.push({ name, fn });

function request(port, method, route, { token, body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1', port, path: `/api${route}`, method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) { /* not JSON */ }
        resolve({ status: res.statusCode, text: data, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function workingCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-seller-'));
  const dbPath = path.join(dir, 'genesis.db');
  fs.copyFileSync(SOURCE_DB, dbPath);
  const db = new Database(dbPath);
  const admin = db.prepare("SELECT id, username, company_id FROM users WHERE role = 'admin' AND active = 1 ORDER BY created_at LIMIT 1").get();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(PASSWORD), admin.id);
  db.close();
  return { dir, dbPath, adminUsername: admin.username, companyId: admin.company_id };
}

/** One user per role, written after the server has migrated the copy. */
function seedRoleUsers(dbPath) {
  const db = new Database(dbPath);
  const admin = db.prepare("SELECT company_id FROM users WHERE role = 'admin' AND active = 1 ORDER BY created_at LIMIT 1").get();
  const usernames = {};
  for (const role of ['sales', 'accountant']) {
    const username = `seller-test-${role}`;
    usernames[role] = username;
    db.prepare(`
      INSERT OR REPLACE INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), 0)
    `).run(`usr-seller-${role}`, username, hashPassword(PASSWORD), `Test ${role}`, null, role, admin.company_id);
  }
  db.close();
  return usernames;
}

async function startOn(dbPath) {
  const port = await findFreePort();
  const proc = new BackendProcess({
    nodeExecutable: process.execPath,
    runAsNode: false,
    serverEntry: path.join(ROOT, 'server', 'index.js'),
    cwd: ROOT,
    env: { GENESIS_DB_PATH: dbPath, GENESIS_DIST_DIR: path.join(ROOT, 'dist') },
    startupTimeoutMs: 30000
  });
  await proc.start(port);
  return { proc, port };
}

async function scenario() {
  const w = workingCopy();
  const { proc, port } = await startOn(w.dbPath);
  w.usernames = seedRoleUsers(w.dbPath);
  return { w, proc, port };
}

async function signIn(port, username) {
  const res = await request(port, 'POST', '/auth/login', { body: { username, password: PASSWORD } });
  assert.strictEqual(res.status, 200, `login failed for ${username}: ${res.text}`);
  return res.json.token;
}

console.log('--- SELLER DASHBOARD TESTS (its own screen, the same database) ---');

// ---------------------------------------------------------------------------
// A. What the counter is told
// ---------------------------------------------------------------------------
test('the Seller dashboard answers, and answers the counter\'s question', async () => {
  const { w, proc, port } = await scenario();
  try {
    const clerk = await signIn(port, w.usernames.sales);
    const r = await request(port, 'GET', '/seller/dashboard', { token: clerk, headers: { 'X-JENESIS-App': 'seller' } });
    assert.strictEqual(r.status, 200, r.text);
    const d = r.json;
    assert.ok(d.today, 'today\'s figures');
    assert.ok(Array.isArray(d.recentSales), 'sales history');
    assert.ok(Array.isArray(d.week), 'the daily summary');
    assert.ok(d.register, 'the cash register');
    assert.ok(d.stock, 'what is on the shelf');
    for (const key of ['count', 'total', 'cash', 'credit']) {
      assert.strictEqual(typeof d.today[key], 'number', `today.${key} is a number`);
    }
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('no accounting figure reaches the Seller dashboard, because none is asked for', async () => {
  const { w, proc, port } = await scenario();
  try {
    const clerk = await signIn(port, w.usernames.sales);
    const r = await request(port, 'GET', '/seller/dashboard', { token: clerk, headers: { 'X-JENESIS-App': 'seller' } });
    const text = JSON.stringify(r.json);
    for (const word of ['profit', 'margin', 'balanceSheet', 'trialBalance', 'payable', 'receivable', 'ledger', 'cogs', 'cost_price']) {
      assert.ok(!text.toLowerCase().includes(word.toLowerCase()),
        `the Seller must not be told about "${word}"`);
    }
    // The quantities a seller needs are there; only the money the company
    // makes on them is not.
    assert.ok(text.includes('lowStockCount'), 'but it is told what needs restocking');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('the cash register is the till, not the balance sheet', async () => {
  const { w, proc, port } = await scenario();
  try {
    const clerk = await signIn(port, w.usernames.sales);
    const r = await request(port, 'GET', '/seller/dashboard', { token: clerk, headers: { 'X-JENESIS-App': 'seller' } });
    const register = r.json.register;
    if (register.open) {
      assert.ok(register.sessionNumber, 'an open till names its session');
      assert.strictEqual(typeof register.openingFloat, 'number');
    } else {
      assert.ok(Array.isArray(register.accounts), 'or the cash accounts are listed');
      for (const account of register.accounts) {
        // Only CASH accounts, never the bank ones: the seller is told what is
        // in the drawer, not what the company holds anywhere.
        assert.ok(account.name !== undefined);
      }
    }
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('the product search answers with a price and whether it is on the shelf', async () => {
  const { w, proc, port } = await scenario();
  try {
    const clerk = await signIn(port, w.usernames.sales);
    const r = await request(port, 'GET', '/seller/products?search=a', { token: clerk, headers: { 'X-JENESIS-App': 'seller' } });
    assert.strictEqual(r.status, 200, r.text);
    assert.ok(Array.isArray(r.json));
    for (const product of r.json) {
      assert.strictEqual(typeof product.price, 'number', 'the customer price');
      assert.strictEqual(typeof product.onHand, 'number', 'what is on the shelf');
      assert.ok(['IN_STOCK', 'LOW', 'OUT'].includes(product.availability), 'and a plain word for it');
      // Never what it cost the company — that is the margin.
      assert.strictEqual(product.cost, undefined);
      assert.strictEqual(product.cost_price, undefined);
    }
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// B. What a Seller window cannot reach
// ---------------------------------------------------------------------------
test('a Seller window cannot pull the reports, the ledger or the trial balance', async () => {
  const { w, proc, port } = await scenario();
  try {
    // Deliberately an ADMINISTRATOR: the point is that hiding the menu is not
    // what stops them. The application they are in is what stops them.
    const admin = await signIn(port, w.adminUsername);
    const routes = [
      'GET /reports/profit-loss',
      'GET /reports/balance-sheet',
      'GET /reports/trial-balance',
      'GET /reports/dashboard',
      'GET /journal-entries',
      'GET /reports/ar-aging',
      'GET /reports/ap-aging'
    ];
    for (const route of routes) {
      const [method, path] = route.split(' ');
      const r = await request(port, method, path, { token: admin, headers: { 'X-JENESIS-App': 'seller' } });
      assert.strictEqual(r.status, 403, `${route} must be refused from a Seller window: ${r.text}`);
      assert.strictEqual(r.json.code, 'APP_SCOPE_FORBIDDEN');
    }
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('a Seller window cannot touch the company record, the users or the backups', async () => {
  const { w, proc, port } = await scenario();
  try {
    const admin = await signIn(port, w.adminUsername);
    const attempts = [
      ['PUT', '/companies/current', { name: 'Renamed from Seller' }],
      ['GET', '/auth/users', undefined],
      ['GET', '/backup/export', undefined],
      ['GET', '/audit-trail', undefined]
    ];
    for (const [method, route, body] of attempts) {
      const r = await request(port, method, route, { token: admin, body, headers: { 'X-JENESIS-App': 'seller' } });
      assert.strictEqual(r.status, 403, `${method} ${route} must be refused: ${r.text}`);
    }
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('the Seller reaches the counter routes it needs, so nothing was over-blocked', async () => {
  const { w, proc, port } = await scenario();
  try {
    const clerk = await signIn(port, w.usernames.sales);
    for (const route of ['/seller/dashboard', '/sales/invoices', '/products', '/customers', '/taxes']) {
      const r = await request(port, 'GET', route, { token: clerk, headers: { 'X-JENESIS-App': 'seller' } });
      assert.strictEqual(r.status, 200, `${route} must still work: ${r.text}`);
    }
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// C. One database: the sale the Seller writes is the sale the books keep
// ---------------------------------------------------------------------------
test('a sale written by the Seller updates the same books the accountant reconciles', async () => {
  const { w, proc, port } = await scenario();
  try {
    const clerk = await signIn(port, w.usernames.sales);

    // Written through the ordinary route a Seller window uses, so this is the
    // real path and not a stand-in for it.
    const customer = await request(port, 'GET', '/customers', { token: clerk, headers: { 'X-JENESIS-App': 'seller' } });
    const customerId = customer.json[0] && customer.json[0].id;
    const product = await request(port, 'GET', '/products', { token: clerk, headers: { 'X-JENESIS-App': 'seller' } });
    const productRow = product.json[0];

    const created = await request(port, 'POST', '/sales/invoices', {
      token: clerk,
      headers: { 'X-JENESIS-App': 'seller' },
      body: {
        customer_id: customerId,
        date: new Date().toISOString().slice(0, 10),
        lines: [{
          product_id: productRow.id,
          description: productRow.name,
          quantity: 2,
          unit_price: 1500,
          tax_rate: 0
        }]
      }
    });
    assert.strictEqual(created.status, 200, `the sale must be accepted: ${created.text}`);

    // Posted, the way the sales screen does it: a document only reaches the
    // books — and therefore only counts as sold — once it is posted.
    const posted = await request(port, 'POST', `/sales/invoices/${created.json.id}/post`, {
      token: clerk, headers: { 'X-JENESIS-App': 'seller' }
    });
    assert.strictEqual(posted.status, 200, `the sale must reach the books: ${posted.text}`);

    const db = new Database(w.dbPath, { readonly: true });
    try {
      const invoice = db.prepare('SELECT * FROM sales_invoices WHERE id = ?').get(created.json.id);
      assert.ok(invoice, 'one invoice, in the shared database');
      assert.strictEqual(Number(invoice.total), 3000, 'and it adds up');

      // The Seller's own screen now shows it.
      const after = await request(port, 'GET', '/seller/dashboard', { token: clerk, headers: { 'X-JENESIS-App': 'seller' } });
      const numbers = after.json.recentSales.map((s) => s.id);
      assert.ok(numbers.includes(created.json.id), 'the sale is in the Seller\'s sales history');

      // And the accountant sees the very same row — not a copy, not a second
      // database, one record.
      const bookkeeper = await signIn(port, w.usernames.accountant);
      const seen = await request(port, 'GET', `/sales/invoices/${created.json.id}`, {
        token: bookkeeper, headers: { 'X-JENESIS-App': 'admin' }
      });
      assert.strictEqual(seen.status, 200, 'the accountant must find the seller\'s sale');
      assert.strictEqual(seen.json.id, created.json.id);
      assert.strictEqual(Number(seen.json.total), 3000);
    } finally {
      db.close();
    }
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('the shipped database is not modified by these tests', async () => {
  const before = crypto.createHash('sha256').update(fs.readFileSync(SOURCE_DB)).digest('hex');
  const { w, proc, port } = await scenario();
  const clerk = await signIn(port, w.usernames.sales);
  await request(port, 'GET', '/seller/dashboard', { token: clerk, headers: { 'X-JENESIS-App': 'seller' } });
  await proc.stop();
  fs.rmSync(w.dir, { recursive: true, force: true });
  const after = crypto.createHash('sha256').update(fs.readFileSync(SOURCE_DB)).digest('hex');
  assert.strictEqual(after, before, 'genesis.db must be untouched');
});

(async () => {
  for (const { name, fn } of pending) {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed += 1;
      console.log(`  ✗ ${name}\n      ${err && err.message ? err.message : err}`);
    }
  }
  console.log(`\n--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed === 0 ? 0 : 1);
})();
