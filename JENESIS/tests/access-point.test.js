'use strict';
/**
 * JENESIS SETTINGS & ACCESS POINT TESTS (0.5.5, modification 3).
 *
 * The yellow application owns user accounts, passwords, permissions, tax rates
 * and the company record — and it moved the settings out of JENESIS Accounting
 * & Business rather than duplicating them.
 *
 * Six things are proved here, over real HTTP against a real server on a
 * temporary copy of genesis.db:
 *
 *   TAXES    create, edit, deactivate, reactivate, delete — and the safeguards:
 *            a rate that has been used is never destroyed, deactivation leaves
 *            every historical document exactly as it was, a retired rate stops
 *            being offered for new transactions, and every change is audited.
 *   USERS    create, rename, reset a forgotten password, deactivate, and delete
 *            (only an account nothing depends on).
 *   ACCESS   which of the four applications a user may open, and which
 *            permissions they hold beyond their role — enforced by the service,
 *            so a closed application stays closed on the very next request.
 *   SYNC     every change is given a number the other windows can compare, so
 *            an already-open window notices instead of working from a copy.
 *   REMOVAL  the settings screen is gone from JENESIS Accounting & Business.
 *
 * What these CANNOT cover: they do not open the installed yellow shortcut, and
 * they cannot see the Access Editor being clicked. The drawing of the screens
 * is asserted in tests/four-apps-render.test.js.
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
const ADMIN_PASSWORD = 'Access-Point-Admin-Passw0rd';

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-access-'));
  const dbPath = path.join(dir, 'genesis.db');
  fs.copyFileSync(SOURCE_DB, dbPath);
  const db = new Database(dbPath);
  const admin = db.prepare("SELECT id, username, company_id FROM users WHERE role = 'admin' AND active = 1 ORDER BY created_at LIMIT 1").get();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(ADMIN_PASSWORD), admin.id);
  db.close();
  return { dir, dbPath, adminUsername: admin.username, companyId: admin.company_id };
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
  return { w, proc, port };
}

async function adminToken(port, username) {
  const res = await request(port, 'POST', '/auth/login', { body: { username, password: ADMIN_PASSWORD } });
  assert.strictEqual(res.status, 200, `admin login failed: ${res.text}`);
  return res.json.token;
}

/** Creates a user straight in the database, bypassing "must change password". */
function seedUser(dbPath, { username, role = 'sales', password }) {
  const db = new Database(dbPath);
  const admin = db.prepare("SELECT company_id FROM users WHERE role = 'admin' AND active = 1 ORDER BY created_at LIMIT 1").get();
  db.prepare(`
    INSERT OR REPLACE INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), 0)
  `).run(`usr-ap-${username}`, username, hashPassword(password), `Test ${username}`, null, role, admin.company_id);
  db.close();
}

function auditCount(dbPath, moduleName) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare('SELECT COUNT(*) AS n FROM audit_logs WHERE module = ?').get(moduleName).n;
  } finally {
    db.close();
  }
}

console.log('--- SETTINGS & ACCESS POINT TESTS (one copy of the truth) ---');

// ---------------------------------------------------------------------------
// Tax rates
// ---------------------------------------------------------------------------
test('a tax rate can be created, and it appears on the list offered for new documents', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    const created = await request(port, 'POST', '/taxes', {
      token, headers: { 'X-JENESIS-App': 'settings' },
      body: { code: 'AP-TEST-5', name: 'Access point test rate', rate: 5 }
    });
    assert.strictEqual(created.status, 200, created.text);

    const active = await request(port, 'GET', '/taxes', { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.ok(active.json.some((r) => r.code === 'AP-TEST-5'),
      'a new rate is offered for new transactions by default');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('deactivating a rate takes it off new transactions and leaves history alone', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    const created = await request(port, 'POST', '/taxes', {
      token, headers: { 'X-JENESIS-App': 'settings' },
      body: { code: 'AP-OFF', name: 'To be retired', rate: 7 }
    });
    const id = created.json.id;

    // Used once, so it becomes part of the company's history. Products and
    // invoices are Accounting & Business screens — the settings application is
    // deliberately not allowed to touch them — so this half is done from there.
    const product = (await request(port, 'GET', '/products', { token, headers: { 'X-JENESIS-App': 'admin' } })).json[0];
    // The whole record is sent back: PUT /products/:id replaces the fields it
    // is given, so a partial update would blank the rest.
    const updated = await request(port, 'PUT', `/products/${product.id}`, {
      token, headers: { 'X-JENESIS-App': 'admin' },
      body: { ...product, active: 1, tax_rate_id: id }
    });
    assert.strictEqual(updated.status, 200, `the product must take the rate: ${updated.text}`);

    const before = await request(port, 'GET', `/taxes/${id}/usage`, { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.ok(before.json.total > 0, 'the rate is in use');

    const off = await request(port, 'POST', `/taxes/${id}/deactivate`, { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.strictEqual(off.status, 200, off.text);

    // Gone from the list a new invoice reads…
    const active = await request(port, 'GET', '/taxes', { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.ok(!active.json.some((r) => r.id === id), 'a retired rate is not offered for new transactions');
    // …still listed for the administrator, so it can be brought back.
    const all = await request(port, 'GET', '/taxes?status=all', { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.ok(all.json.some((r) => r.id === id), 'but it is not lost');
    const inactive = await request(port, 'GET', '/taxes?status=inactive', { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.ok(inactive.json.some((r) => r.id === id), 'and it is listed as inactive');

    // Deleting is refused, with the reason naming where it is used.
    const del = await request(port, 'DELETE', `/taxes/${id}`, { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.strictEqual(del.status, 409, 'a used rate must not be destroyed');
    assert.strictEqual(del.json.code, 'TAX_IN_USE');
    assert.ok(del.json.error.length > 40, 'and the reason is spelled out');

    // And the product that used it is untouched: deactivation changed nothing.
    const db = new Database(w.dbPath, { readonly: true });
    try {
      const row = db.prepare('SELECT tax_rate_id FROM products WHERE id = ?').get(product.id);
      assert.strictEqual(row.tax_rate_id, id, 'deactivation rewrites no document');
      const still = db.prepare('SELECT COUNT(*) AS n FROM tax_rates WHERE id = ?').get(id).n;
      assert.strictEqual(still, 1, 'and the rate itself is still there');
    } finally { db.close(); }
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('reactivating a rate puts it back on the list for new transactions', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    const created = await request(port, 'POST', '/taxes', {
      token, headers: { 'X-JENESIS-App': 'settings' },
      body: { code: 'AP-BACK', name: 'Retired then restored', rate: 3 }
    });
    const id = created.json.id;
    await request(port, 'POST', `/taxes/${id}/deactivate`, { token, headers: { 'X-JENESIS-App': 'settings' } });
    const back = await request(port, 'POST', `/taxes/${id}/reactivate`, { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.strictEqual(back.status, 200, back.text);
    const active = await request(port, 'GET', '/taxes', { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.ok(active.json.some((r) => r.id === id), 'reactivation makes it available again');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('a rate nothing has used can be deleted, and an unused one only', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    const created = await request(port, 'POST', '/taxes', {
      token, headers: { 'X-JENESIS-App': 'settings' },
      body: { code: 'AP-FRESH', name: 'Never used', rate: 2 }
    });
    const id = created.json.id;
    const usage = await request(port, 'GET', `/taxes/${id}/usage`, { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.strictEqual(usage.json.total, 0, 'nothing has used it yet');
    const del = await request(port, 'DELETE', `/taxes/${id}`, { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.strictEqual(del.status, 200, del.text);
    const all = await request(port, 'GET', '/taxes?status=all', { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.ok(!all.json.some((r) => r.id === id), 'it is gone');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('editing a rate changes it, and every change is written to the audit trail', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    const created = await request(port, 'POST', '/taxes', {
      token, headers: { 'X-JENESIS-App': 'settings' },
      body: { code: 'AP-EDIT', name: 'Before', rate: 4 }
    });
    const id = created.json.id;
    const edited = await request(port, 'PUT', `/taxes/${id}`, {
      token, headers: { 'X-JENESIS-App': 'settings' },
      body: { code: 'AP-EDIT2', name: 'After', rate: 6 }
    });
    assert.strictEqual(edited.status, 200, edited.text);
    const all = await request(port, 'GET', '/taxes?status=all', { token, headers: { 'X-JENESIS-App': 'settings' } });
    const row = all.json.find((r) => r.id === id);
    assert.strictEqual(row.code, 'AP-EDIT2');
    assert.strictEqual(Number(row.rate), 6);
    assert.ok(auditCount(w.dbPath, 'TAXES') >= 2, 'both the creation and the edit are recorded');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('an invoice keeps the rate it was raised with, whatever happens to the rate later', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    const created = await request(port, 'POST', '/taxes', {
      token, headers: { 'X-JENESIS-App': 'settings' }, body: { code: 'AP-HIST', name: 'Historical', rate: 19 }
    });
    const taxId = created.json.id;
    const customer = (await request(port, 'GET', '/customers', { token, headers: { 'X-JENESIS-App': 'admin' } })).json[0];

    const invoice = await request(port, 'POST', '/sales/invoices', {
      token, headers: { 'X-JENESIS-App': 'admin' },
      body: {
        customer_id: customer.id,
        date: new Date().toISOString().slice(0, 10),
        lines: [{ description: 'Kept for history', quantity: 1, unit_price: 1000, tax_rate_id: taxId, tax_rate: 19, tax_amount: 190 }]
      }
    });
    assert.strictEqual(invoice.status, 200, invoice.text);

    // Now retire the rate, and try very hard to destroy it.
    await request(port, 'POST', `/taxes/${taxId}/deactivate`, { token, headers: { 'X-JENESIS-App': 'settings' } });
    const del = await request(port, 'DELETE', `/taxes/${taxId}`, { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.strictEqual(del.status, 409, 'the invoice protects its own rate');

    const db = new Database(w.dbPath, { readonly: true });
    try {
      const line = db.prepare('SELECT tax_rate_id, tax_rate, tax_amount FROM sales_invoice_lines WHERE invoice_id = ?').get(invoice.json.id);
      assert.strictEqual(line.tax_rate_id, taxId, 'the document still points at the rate');
      assert.strictEqual(Number(line.tax_rate), 19, 'and still carries the rate that applied');
      assert.strictEqual(Number(line.tax_amount), 190);
    } finally { db.close(); }
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('a tax rate that is not ours cannot be touched, and the catalogue is served', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    const catalogue = await request(port, 'GET', '/auth/access-catalogue', { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.strictEqual(catalogue.status, 200, catalogue.text);
    assert.deepStrictEqual(catalogue.json.apps, ['seller', 'maintenance', 'admin', 'settings']);
    assert.ok(catalogue.json.roles.length > 0);
    assert.ok(catalogue.json.permissions.length > 0);

    // A clerk has no business creating a tax rate, from any application.
    seedUser(w.dbPath, { username: 'ap-clerk', role: 'sales', password: ADMIN_PASSWORD });
    const clerk = (await request(port, 'POST', '/auth/login', { body: { username: 'ap-clerk', password: ADMIN_PASSWORD } })).json.token;
    const forbidden = await request(port, 'POST', '/taxes', {
      token: clerk, headers: { 'X-JENESIS-App': 'settings' },
      body: { code: 'NOPE', name: 'Not allowed', rate: 1 }
    });
    assert.strictEqual(forbidden.status, 403, 'creating a tax rate is not for everyone');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// User accounts
// ---------------------------------------------------------------------------
test('an account is created, renamed, and given a new password when one is forgotten', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    const created = await request(port, 'POST', '/auth/users', {
      token, headers: { 'X-JENESIS-App': 'settings' },
      body: { username: 'ap-new', password: 'Original-Passw0rd', full_name: 'New Person', role: 'sales' }
    });
    assert.strictEqual(created.status, 200, created.text);

    const renamed = await request(port, 'PUT', `/auth/users/${created.json.id}`, {
      token, headers: { 'X-JENESIS-App': 'settings' }, body: { username: 'ap-renamed' }
    });
    assert.strictEqual(renamed.status, 200, renamed.text);
    assert.strictEqual(renamed.json.username, 'ap-renamed');

    // Forgotten password: an administrator sets a new one without the old.
    const reset = await request(port, 'POST', `/auth/users/${created.json.id}/reset-password`, {
      token, headers: { 'X-JENESIS-App': 'settings' },
      body: { password: 'Forgotten-Reset-Passw0rd' }
    });
    assert.strictEqual(reset.status, 200, reset.text);

    // The new password is the only way in from now on.
    const old = await request(port, 'POST', '/auth/login', { body: { username: 'ap-renamed', password: 'Original-Passw0rd' } });
    assert.strictEqual(old.status, 401, 'the old password no longer works');
    const fresh = await request(port, 'POST', '/auth/login', { body: { username: 'ap-renamed', password: 'Forgotten-Reset-Passw0rd' } });
    assert.strictEqual(fresh.status, 200, 'the new one does');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('a weak password is refused, even for an administrator resetting somebody else', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    const created = await request(port, 'POST', '/auth/users', {
      token, headers: { 'X-JENESIS-App': 'settings' },
      body: { username: 'ap-weak', password: 'Strong-Enough-Passw0rd', full_name: 'Weak Test', role: 'sales' }
    });
    const weak = await request(port, 'POST', `/auth/users/${created.json.id}/reset-password`, {
      token, headers: { 'X-JENESIS-App': 'settings' }, body: { password: 'short' }
    });
    assert.strictEqual(weak.status, 400, 'the password policy still applies');
    assert.strictEqual(weak.json.code, 'PASSWORD_TOO_SHORT');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('an account that is part of the company history cannot be deleted, only closed', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    const created = await request(port, 'POST', '/auth/users', {
      token, headers: { 'X-JENESIS-App': 'settings' },
      body: { username: 'ap-used', password: 'Used-Account-Passw0rd', full_name: 'Used Account', role: 'sales' }
    });
    const id = created.json.id;

    // Signed in once, so the account is now part of the record.
    await request(port, 'POST', '/auth/login', { body: { username: 'ap-used', password: 'Used-Account-Passw0rd' } });

    const del = await request(port, 'DELETE', `/auth/users/${id}`, { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.strictEqual(del.status, 409, 'the account must not be destroyed');
    assert.strictEqual(del.json.code, 'USER_HAS_HISTORY');

    // Deactivation works, and stops all access at once.
    const off = await request(port, 'POST', `/records/users/${id}/deactivate`, { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.strictEqual(off.status, 200, off.text);
    const signIn = await request(port, 'POST', '/auth/login', { body: { username: 'ap-used', password: 'Used-Account-Passw0rd' } });
    assert.notStrictEqual(signIn.status, 200, 'a deactivated account cannot sign in');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('an account nobody depends on can be removed for good', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    const created = await request(port, 'POST', '/auth/users', {
      token, headers: { 'X-JENESIS-App': 'settings' },
      body: { username: 'ap-fresh', password: 'Fresh-Account-Passw0rd', full_name: 'Fresh Account', role: 'sales' }
    });
    const del = await request(port, 'DELETE', `/auth/users/${created.json.id}`, { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.strictEqual(del.status, 200, del.text);
    const listed = await request(port, 'GET', '/auth/users?status=all', { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.ok(!listed.json.some((u) => u.username === 'ap-fresh'), 'the account is gone');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('an administrator cannot delete themselves, and never the last administrator', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    const me = (await request(port, 'GET', '/auth/me', { token })).json.user;
    const self = await request(port, 'DELETE', `/auth/users/${me.id}`, { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.strictEqual(self.status, 400, 'nobody locks themselves out');
    assert.strictEqual(self.json.code, 'SELF_LOCKOUT');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// The Access Point: applications and permissions
// ---------------------------------------------------------------------------
test('closing an application to a user takes effect on their very next request', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    seedUser(w.dbPath, { username: 'ap-closed', role: 'sales', password: ADMIN_PASSWORD });
    const clerk = (await request(port, 'POST', '/auth/login', { body: { username: 'ap-closed', password: ADMIN_PASSWORD } })).json.token;

    // Works before the change.
    const before = await request(port, 'GET', '/sales/invoices', { token: clerk, headers: { 'X-JENESIS-App': 'seller' } });
    assert.strictEqual(before.status, 200, 'a sales clerk uses JENESIS Seller');

    const users = (await request(port, 'GET', '/auth/users?status=all', { token, headers: { 'X-JENESIS-App': 'settings' } })).json;
    const target = users.find((u) => u.username === 'ap-closed');
    const closed = await request(port, 'PUT', `/auth/users/${target.id}/access`, {
      token, headers: { 'X-JENESIS-App': 'settings' },
      body: { apps: { seller: false }, grants: [], revokes: [], clearOverrides: true }
    });
    assert.strictEqual(closed.status, 200, closed.text);

    // Their open windows were signed out as well, so the very next request is
    // refused twice over: no session, and no access to the application.
    const after = await request(port, 'GET', '/sales/invoices', { token: clerk, headers: { 'X-JENESIS-App': 'seller' } });
    assert.ok(after.status === 401 || after.status === 403, `the next request is refused: ${after.text}`);
    assert.ok(closed.json.revokedSessions > 0, 'and their open windows were signed out');

    // Signing in again does not help: the service asks the same question of a
    // fresh session, so pointing a window at the application gets them nowhere.
    const again = (await request(port, 'POST', '/auth/login', { body: { username: 'ap-closed', password: ADMIN_PASSWORD } })).json.token;
    const refused = await request(port, 'GET', '/sales/invoices', { token: again, headers: { 'X-JENESIS-App': 'seller' } });
    assert.strictEqual(refused.status, 403, 'a closed application refuses a fresh session too');
    assert.strictEqual(refused.json.code, 'APP_ACCESS_DENIED');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('a permission granted to one person works, and one taken away stops working', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    seedUser(w.dbPath, { username: 'ap-grant', role: 'sales', password: ADMIN_PASSWORD });
    const clerk = (await request(port, 'POST', '/auth/login', { body: { username: 'ap-grant', password: ADMIN_PASSWORD } })).json.token;

    // A sales clerk may not read the audit trail — their role does not carry it.
    const denied = await request(port, 'GET', '/audit-trail', { token: clerk, headers: { 'X-JENESIS-App': 'admin' } });
    assert.strictEqual(denied.status, 403, 'the role does not carry audit:read');

    const users = (await request(port, 'GET', '/auth/users?status=all', { token, headers: { 'X-JENESIS-App': 'settings' } })).json;
    const target = users.find((u) => u.username === 'ap-grant');

    // Granted to this one person.
    await request(port, 'PUT', `/auth/users/${target.id}/access`, {
      token, headers: { 'X-JENESIS-App': 'settings' },
      body: { apps: { admin: true }, grants: ['audit:read'], revokes: [], clearOverrides: true }
    });
    const granted = (await request(port, 'POST', '/auth/login', { body: { username: 'ap-grant', password: ADMIN_PASSWORD } })).json.token;
    const allowed = await request(port, 'GET', '/audit-trail', { token: granted, headers: { 'X-JENESIS-App': 'admin' } });
    assert.strictEqual(allowed.status, 200, 'the grant takes effect on the next sign-in');

    // Taken away again.
    await request(port, 'PUT', `/auth/users/${target.id}/access`, {
      token, headers: { 'X-JENESIS-App': 'settings' },
      body: { apps: { admin: true }, grants: [], revokes: [], clearOverrides: true }
    });
    const revoked = (await request(port, 'POST', '/auth/login', { body: { username: 'ap-grant', password: ADMIN_PASSWORD } })).json.token;
    const back = await request(port, 'GET', '/audit-trail', { token: revoked, headers: { 'X-JENESIS-App': 'admin' } });
    assert.strictEqual(back.status, 403, 'clearing the grant returns them to their role');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Centralized synchronization
// ---------------------------------------------------------------------------
test('every configuration change is given a number the other windows can compare', async () => {
  const { w, proc, port } = await scenario();
  try {
    const token = await adminToken(port, w.adminUsername);
    const first = await request(port, 'GET', '/system/config-version', { token, headers: { 'X-JENESIS-App': 'settings' } });
    assert.strictEqual(first.status, 200, first.text);
    const v0 = first.json.version;

    await request(port, 'POST', '/taxes', {
      token, headers: { 'X-JENESIS-App': 'settings' }, body: { code: 'AP-SYNC', name: 'Sync test', rate: 1 }
    });
    const afterTax = (await request(port, 'GET', '/system/config-version', { token })).json.version;
    assert.ok(afterTax > v0, 'a tax change moves the number');

    await request(port, 'PUT', '/companies/current', {
      token, headers: { 'X-JENESIS-App': 'settings' }, body: { name: 'Renamed for the sync test' }
    });
    const afterCompany = (await request(port, 'GET', '/system/config-version', { token })).json.version;
    assert.ok(afterCompany > afterTax, 'so does a change to the company record');

    // And an already-open window notices without being restarted.
    const context = fs.readFileSync(path.join(ROOT, 'src/context/AppContext.jsx'), 'utf8');
    assert.ok(context.includes('/api/system/config-version'), 'the window watches the number');
    assert.ok(context.includes('setPermissions'), 'and re-reads its permissions when it moves');
  } finally {
    await proc.stop();
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});

test('the settings have left JENESIS Accounting & Business, not been copied', async () => {
  const identity = fs.readFileSync(path.join(ROOT, 'src/appIdentity.js'), 'utf8');
  const adminViews = identity.slice(identity.indexOf("  admin: {"), identity.indexOf("  settings: {"));
  assert.ok(!adminViews.includes("'settings'"), 'Accounting & Business no longer offers settings');
  const settingsViews = identity.slice(identity.indexOf("  settings: {"));
  assert.ok(settingsViews.includes("'settings'"), 'Settings & Access Point does');
  // One implementation of the settings screen, not two that can drift.
  assert.ok(fs.existsSync(path.join(ROOT, 'src/views/SettingsView.jsx')));
  assert.strictEqual(
    fs.readdirSync(path.join(ROOT, 'src/views')).filter((f) => f === 'SettingsView.jsx').length, 1,
    'there is exactly one settings screen'
  );
});

test('the shipped database is not modified by these tests', async () => {
  const before = crypto.createHash('sha256').update(fs.readFileSync(SOURCE_DB)).digest('hex');
  const { w, proc, port } = await scenario();
  const token = await adminToken(port, w.adminUsername);
  await request(port, 'GET', '/taxes', { token, headers: { 'X-JENESIS-App': 'settings' } });
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
