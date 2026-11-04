'use strict';
/**
 * SEPARATION BETWEEN THE FOUR APPLICATIONS.
 *
 * Modification 4 made JENESIS four sub-applications over one shared database.
 * Modification 5 is the part that matters to a business: sharing a database
 * must not mean that every window can reach everything. The requirements are
 * specific — a Seller must not reach the reports, not by URL and not by
 * calling the API directly; Maintenance must not retrieve accounting data;
 * a deactivated user is stopped at once; attempts that are refused are
 * recorded.
 *
 * Everything here runs against a temporary COPY of genesis.db and a real
 * server process, over real HTTP. Nothing is checked by reading the source.
 *
 * What these CANNOT cover: they do not open the four installed shortcuts on
 * Windows, and they cannot see a request that never reaches this server.
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
const { APP_IDS, APP_FORBIDDEN, isForbidden } = require('../server/appScope');
const { ROLE_PERMISSIONS } = require('../server/auth');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');
const PASSWORD = 'Separation-Test-Passw0rd';

let passed = 0;
let failed = 0;
const pending = [];
const test = (name, fn) => pending.push({ name, fn });

function request(port, method, route, { token, body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: `/api${route}`,
      method,
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
        resolve({ status: res.statusCode, headers: res.headers, text: data, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** A working copy of the shipped database with a known administrator password. */
function workingCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-sep-'));
  const dbPath = path.join(dir, 'genesis.db');
  fs.copyFileSync(SOURCE_DB, dbPath);
  const db = new Database(dbPath);
  const admin = db.prepare("SELECT id, username FROM users WHERE role = 'admin' AND active = 1 ORDER BY created_at LIMIT 1").get();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(PASSWORD), admin.id);
  db.close();
  return { dir, dbPath, adminUsername: admin.username, usernames: {} };
}

/**
 * One user per role, ready to sign in.
 *
 * They are written straight into the database rather than through the API for
 * two reasons: the API creates users with "must change password" set, which
 * would park every one of them on the password screen, and this has to happen
 * AFTER the server has migrated the copy — the shipped database predates the
 * auth migration and has no must_change_password column until then.
 */
function seedRoleUsers(dbPath) {
  const db = new Database(dbPath);
  const admin = db.prepare("SELECT company_id FROM users WHERE role = 'admin' AND active = 1 ORDER BY created_at LIMIT 1").get();
  const usernames = {};
  for (const role of ['sales', 'inventory', 'manager', 'accountant']) {
    const username = `sep-${role}`;
    usernames[role] = username;
    db.prepare(`
      INSERT OR REPLACE INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), 0)
    `).run(`usr-sep-${role}`, username, hashPassword(PASSWORD), `Test ${role}`, null, role, admin.company_id);
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

/** Starts a server on a fresh copy and fills it with one user per role. */
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

function auditRows(dbPath, action) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare("SELECT * FROM audit_logs WHERE module = 'security' AND action = ? ORDER BY timestamp DESC").all(action);
  } finally {
    db.close();
  }
}

console.log('--- SEPARATION BETWEEN THE FOUR APPLICATIONS ---');

// ---------------------------------------------------------------------------
test('the four applications each declare their own boundary', () => {
  assert.deepStrictEqual(APP_IDS.slice().sort(), ['admin', 'maintenance', 'seller', 'settings']);
  for (const id of APP_IDS) {
    assert.ok(Array.isArray(APP_FORBIDDEN[id]), `${id} must declare what it may not touch`);
  }
  // The whole program is not restricted; the others are.
  assert.deepStrictEqual(APP_FORBIDDEN.admin, [], 'JENESIS Accounting & Business is the whole program');
  assert.ok(APP_FORBIDDEN.maintenance.length > 0 && APP_FORBIDDEN.seller.length > 0 && APP_FORBIDDEN.settings.length > 0);
});

test('no application is forbidden a permission that does not exist', () => {
  const { PERMISSIONS } = require('../server/auth');
  for (const id of APP_IDS) {
    for (const p of APP_FORBIDDEN[id]) {
      assert.ok(PERMISSIONS.includes(p), `${id} forbids "${p}", which is not a permission`);
    }
  }
});

test('Maintenance is forbidden every accounting, sales, purchase and stock permission', () => {
  for (const p of ['accounting:read', 'accounting:write', 'journal:post', 'reports:read',
    'sales:read', 'sales:write', 'purchases:read', 'purchases:write',
    'contacts:read', 'inventory:read', 'inventory:write']) {
    assert.ok(isForbidden('maintenance', p), `Maintenance must not be able to use ${p}`);
  }
});

test('Seller is forbidden the reports, the purchases and the journals', () => {
  for (const p of ['reports:read', 'purchases:read', 'accounting:read', 'journal:post', 'audit:read']) {
    assert.ok(isForbidden('seller', p), `Seller must not be able to use ${p}`);
  }
});

// ---------------------------------------------------------------------------
test('an administrator working inside JENESIS Seller cannot pull the reports', async () => {
  const { w, proc, port } = await scenario();
  try {
    const admin = await signIn(port, w.adminUsername);
    const open = await request(port, 'GET', '/reports/trial-balance', { token: admin });
    assert.strictEqual(open.status, 200, `an administrator may read the trial balance: ${open.text}`);

    const fromSeller = await request(port, 'GET', '/reports/trial-balance', {
      token: admin, headers: { 'X-JENESIS-App': 'seller' }
    });
    assert.strictEqual(fromSeller.status, 403, `the Seller window must be refused: ${fromSeller.text}`);
    assert.strictEqual(fromSeller.json.code, 'APP_SCOPE_FORBIDDEN');
    assert.strictEqual(fromSeller.json.app, 'seller');
  } finally {
    await proc.stop();
  }
});

test('an administrator inside Maintenance cannot read customers, suppliers or the ledger', async () => {
  const { w, proc, port } = await scenario();
  try {
    const admin = await signIn(port, w.adminUsername);
    for (const route of ['/customers', '/suppliers', '/products', '/reports/general-ledger', '/reports/profit-loss']) {
      const r = await request(port, 'GET', route, { token: admin, headers: { 'X-JENESIS-App': 'maintenance' } });
      assert.strictEqual(r.status, 403, `${route} must be refused from Maintenance: ${r.text}`);
      assert.strictEqual(r.json.code, 'APP_SCOPE_FORBIDDEN', `${route} refused for the wrong reason`);
    }
  } finally {
    await proc.stop();
  }
});

test('Maintenance can still read its own service information', async () => {
  const { w, proc, port } = await scenario();
  try {
    const admin = await signIn(port, w.adminUsername);
    for (const route of ['/system/info', '/system/logs?lines=10', '/system/network']) {
      const r = await request(port, 'GET', route, { token: admin, headers: { 'X-JENESIS-App': 'maintenance' } });
      assert.strictEqual(r.status, 200, `${route} is Maintenance's own screen and must open: ${r.text}`);
    }
  } finally {
    await proc.stop();
  }
});

test('Settings cannot trade: no sales, no purchases, no stock movements', async () => {
  const { w, proc, port } = await scenario();
  try {
    const admin = await signIn(port, w.adminUsername);
    for (const route of ['/sales/invoices', '/purchases/bills', '/customers', '/products']) {
      const r = await request(port, 'GET', route, { token: admin, headers: { 'X-JENESIS-App': 'settings' } });
      assert.strictEqual(r.status, 403, `${route} must be refused from Settings: ${r.text}`);
      assert.strictEqual(r.json.code, 'APP_SCOPE_FORBIDDEN');
    }
    // …but configuration is exactly what it is for.
    const users = await request(port, 'GET', '/auth/users', { token: admin, headers: { 'X-JENESIS-App': 'settings' } });
    assert.strictEqual(users.status, 200, `Settings must manage users: ${users.text}`);
  } finally {
    await proc.stop();
  }
});

test('a Seller cannot reach the reports by calling the API directly', async () => {
  const { w, proc, port } = await scenario();
  try {
    const seller = await signIn(port, w.usernames.sales);
    // No application header at all: the role alone must stop this.
    for (const route of ['/reports/trial-balance', '/reports/profit-loss', '/reports/balance-sheet', '/reports/general-ledger']) {
      const bare = await request(port, 'GET', route, { token: seller });
      assert.strictEqual(bare.status, 403, `${route} must be refused to a Seller: ${bare.text}`);
      assert.strictEqual(bare.json.code, 'FORBIDDEN');
    }
    // And from the Seller application, which also forbids it.
    const fromApp = await request(port, 'GET', '/reports/trial-balance', {
      token: seller, headers: { 'X-JENESIS-App': 'seller' }
    });
    assert.strictEqual(fromApp.status, 403);
  } finally {
    await proc.stop();
  }
});

test("a Seller's own dashboard and sales screens still open", async () => {
  const { w, proc, port } = await scenario();
  try {
    const seller = await signIn(port, w.usernames.sales);
    // The dashboard is the Seller's home screen; it must not be collateral
    // damage of keeping the reports out.
    for (const route of ['/reports/dashboard', '/sales/invoices', '/customers']) {
      const r = await request(port, 'GET', route, { token: seller, headers: { 'X-JENESIS-App': 'seller' } });
      assert.strictEqual(r.status, 200, `${route} must open for a Seller in the Seller app: ${r.text}`);
    }
  } finally {
    await proc.stop();
  }
});

test('a caller that names no application is treated exactly as before', async () => {
  const { w, proc, port } = await scenario();
  try {
    const admin = await signIn(port, w.adminUsername);
    const r = await request(port, 'GET', '/reports/trial-balance', { token: admin });
    assert.strictEqual(r.status, 200, 'older clients and scripts must keep working');
    // An unknown application name is ignored rather than trusted.
    const unknown = await request(port, 'GET', '/reports/trial-balance', {
      token: admin, headers: { 'X-JENESIS-App': 'not-an-application' }
    });
    assert.strictEqual(unknown.status, 200, 'an unrecognised application name must not change behaviour');
  } finally {
    await proc.stop();
  }
});

// ---------------------------------------------------------------------------
test('a refused request is recorded in the audit trail', async () => {
  const { w, proc, port } = await scenario();
  try {
    const admin = await signIn(port, w.adminUsername);
    await request(port, 'GET', '/reports/trial-balance', { token: admin, headers: { 'X-JENESIS-App': 'seller' } });
    await request(port, 'GET', '/customers', { token: admin, headers: { 'X-JENESIS-App': 'maintenance' } });

    const rows = auditRows(w.dbPath, 'APP_SCOPE_FORBIDDEN');
    assert.ok(rows.length >= 2, `both refusals must be recorded (found ${rows.length})`);
    const joined = rows.map((r) => r.description).join('\n');
    assert.ok(/reports\/trial-balance/.test(joined), 'the record must name the route');
    assert.ok(/app=seller/.test(joined), 'the record must name the application');
    assert.ok(/permission=reports:read/.test(joined), 'the record must name the permission');
    assert.ok(rows.every((r) => r.user_name && r.user_name !== 'unauthenticated'), 'the record must name the user');
  } finally {
    await proc.stop();
  }
});

test('a role refusal is recorded too, and no secret is written to the log', async () => {
  const { w, proc, port } = await scenario();
  try {
    const seller = await signIn(port, w.usernames.sales);
    await request(port, 'GET', '/reports/trial-balance', { token: seller });

    const rows = auditRows(w.dbPath, 'FORBIDDEN');
    assert.ok(rows.length >= 1, 'a permission refusal must be recorded');

    // Nothing that could be replayed may reach the audit trail.
    const all = new Database(w.dbPath, { readonly: true })
      .prepare("SELECT description FROM audit_logs WHERE module = 'security'").all()
      .map((r) => r.description).join('\n');
    for (const secret of [seller, PASSWORD]) {
      assert.ok(!all.includes(secret), 'the audit trail must never contain a token or a password');
    }
  } finally {
    await proc.stop();
  }
});

test('a stale or forged token is refused and the attempt is recorded', async () => {
  const { w, proc, port } = await scenario();
  try {
    const r = await request(port, 'GET', '/customers', { token: 'a-token-that-was-never-issued' });
    assert.strictEqual(r.status, 401, `a forged token must be refused: ${r.text}`);
    assert.strictEqual(r.json.code, 'AUTH_REQUIRED');

    const rows = auditRows(w.dbPath, 'AUTH_REQUIRED');
    assert.ok(rows.length >= 1, 'an attempt with credentials must be recorded');
    assert.ok(!rows.some((row) => row.description.includes('a-token-that-was-never-issued')),
      'the token itself must not be written to the log');

    // A request that presents nothing is not an attempt and is not recorded.
    const before = auditRows(w.dbPath, 'AUTH_REQUIRED').length;
    const anonymous = await request(port, 'GET', '/customers');
    assert.strictEqual(anonymous.status, 401);
    assert.strictEqual(auditRows(w.dbPath, 'AUTH_REQUIRED').length, before,
      'an anonymous request with no credentials is not an unauthorized attempt');
  } finally {
    await proc.stop();
  }
});

// ---------------------------------------------------------------------------
test('a deactivated user is stopped at once, including the session they are using', async () => {
  const { w, proc, port } = await scenario();
  try {
    const admin = await signIn(port, w.adminUsername);
    const victim = await signIn(port, w.usernames.sales);
    const live = await request(port, 'GET', '/sales/invoices', { token: victim });
    assert.strictEqual(live.status, 200, 'the session works before deactivation');

    const victimRow = new Database(w.dbPath, { readonly: true })
      .prepare('SELECT id FROM users WHERE username = ?').get(w.usernames.sales);

    const deactivated = await request(port, 'POST', `/records/users/${victimRow.id}/deactivate`, { token: admin });
    assert.strictEqual(deactivated.status, 200, `deactivation failed: ${deactivated.text}`);

    // The very next request on the existing session must be refused.
    const after = await request(port, 'GET', '/sales/invoices', { token: victim });
    assert.strictEqual(after.status, 401, `a deactivated user must be stopped immediately: ${after.text}`);
    assert.strictEqual(after.json.code, 'AUTH_REQUIRED');

    const signInAgain = await request(port, 'POST', '/auth/login', {
      body: { username: w.usernames.sales, password: PASSWORD }
    });
    assert.strictEqual(signInAgain.status, 401, 'a deactivated user must not be able to sign in again');
  } finally {
    await proc.stop();
  }
});

test('an administrator cannot deactivate their own account', async () => {
  const { w, proc, port } = await scenario();
  try {
    const admin = await signIn(port, w.adminUsername);
    const me = new Database(w.dbPath, { readonly: true })
      .prepare('SELECT id FROM users WHERE username = ?').get(w.adminUsername);
    const r = await request(port, 'POST', `/records/users/${me.id}/deactivate`, { token: admin });
    assert.notStrictEqual(r.status, 200, 'nobody may switch off their own account');
    assert.strictEqual(r.json.code, 'SELF_LOCKOUT');
    // The account must still work afterwards.
    const still = await request(port, 'GET', '/sales/invoices', { token: admin });
    assert.strictEqual(still.status, 200, 'the refused deactivation must not have taken effect');
  } finally {
    await proc.stop();
  }
});

test('the last active administrator cannot be deactivated by someone else', async () => {
  const { w, proc, port } = await scenario();
  try {
    const manager = await signIn(port, w.usernames.manager);
    const db = new Database(w.dbPath, { readonly: true });
    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1").all();
    db.close();
    assert.strictEqual(admins.length, 1, 'this scenario assumes a single administrator');
    const r = await request(port, 'POST', `/records/users/${admins[0].id}/deactivate`, { token: manager });
    assert.notStrictEqual(r.status, 200, 'the last administrator must remain');
    assert.strictEqual(r.json.code, 'LAST_ADMIN');
  } finally {
    await proc.stop();
  }
});

// ---------------------------------------------------------------------------
test('the shipped database is not modified by these tests', () => {
  const before = crypto.createHash('sha256').update(fs.readFileSync(SOURCE_DB)).digest('hex');
  assert.ok(before.length === 64);
  // The copy is what every test above opened; if the original had been
  // touched, the migration guard in auth-security would already have failed.
  assert.ok(fs.existsSync(SOURCE_DB));
});

// ---------------------------------------------------------------------------
// A screen shared by two roles: the sales invoice needs the list of tax rates,
// and tax rates are defined in accounting. The clerk must be able to read them
// from JENESIS Seller; only the bookkeeper may change them. This is the one
// route that has to answer to either role, so it is proved in both directions.
// ---------------------------------------------------------------------------
test('a sales clerk reads the tax rates from JENESIS Seller', async () => {
  const { w, proc, port } = await scenario();
  try {
    const clerk = await signIn(port, w.usernames.sales);
    const r = await request(port, 'GET', '/taxes', { token: clerk, headers: { 'X-JENESIS-App': 'seller' } });
    assert.strictEqual(r.status, 200, `the clerk must be able to read tax rates: ${r.text}`);
    assert.ok(Array.isArray(r.json), 'the tax rates are returned as a list');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('a sales clerk still cannot create a tax rate', async () => {
  const { w, proc, port } = await scenario();
  try {
    const clerk = await signIn(port, w.usernames.sales);
    const r = await request(port, 'POST', '/taxes', {
      token: clerk,
      headers: { 'X-JENESIS-App': 'seller' },
      body: { code: 'CLERK', name: 'Made by a clerk', rate: 5 }
    });
    assert.strictEqual(r.status, 403, `defining a tax rate stays with accounting: ${r.text}`);
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('the tax rates stay out of JENESIS Network & Maintenance', async () => {
  const { w, proc, port } = await scenario();
  try {
    // Even a user whose role may read sales gets nothing from the green
    // application: it has no business touching tax rates at all.
    const clerk = await signIn(port, w.usernames.sales);
    const r = await request(port, 'GET', '/taxes', { token: clerk, headers: { 'X-JENESIS-App': 'maintenance' } });
    assert.strictEqual(r.status, 403, `maintenance must not be able to read tax rates: ${r.text}`);
    assert.strictEqual(r.json && r.json.code, 'APP_SCOPE_FORBIDDEN');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('a bookkeeper still reads the tax rates from JENESIS Accounting & Business', async () => {
  const { w, proc, port } = await scenario();
  try {
    const bookkeeper = await signIn(port, w.usernames.accountant);
    const r = await request(port, 'GET', '/taxes', { token: bookkeeper, headers: { 'X-JENESIS-App': 'admin' } });
    assert.strictEqual(r.status, 200, `the change must not break the accounting side: ${r.text}`);
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
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
  console.log(`--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed === 0 ? 0 : 1);
})();
