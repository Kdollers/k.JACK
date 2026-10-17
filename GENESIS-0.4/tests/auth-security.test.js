'use strict';
/**
 * Authentication and authorization tests.
 *
 * The parent process runs two scenarios, each in a child process with its own
 * temporary copy of the database (the database module is a per-process singleton):
 *   - "fresh":  an empty installation that must go through the setup wizard.
 *   - "legacy": a copy of the existing genesis.db, whose users still have legacy
 *               password hashes and must change their password at first login.
 * The repository genesis.db is never opened by these tests.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');

// ---------------------------------------------------------------------------
// Parent: run scenarios in child processes
// ---------------------------------------------------------------------------
if (!process.argv[2]) {
  console.log('--- AUTHENTICATION & AUTHORIZATION TESTS ---');
  let failed = 0;
  const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
  const before = fs.existsSync(SOURCE_DB) ? md5(SOURCE_DB) : null;
  for (const scenario of ['fresh', 'legacy']) {
    const r = spawnSync(process.execPath, [__filename, scenario], { encoding: 'utf8', timeout: 240000 });
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    if (r.status !== 0) failed++;
  }
  if (before) {
    assert.strictEqual(md5(SOURCE_DB), before, 'repository genesis.db must not be modified by tests');
    console.log('✓ repository genesis.db unchanged');
  }
  console.log(failed === 0 ? '--- ALL AUTH TESTS PASSED ---' : `--- ${failed} AUTH SCENARIO(S) FAILED ---`);
  process.exit(failed === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Child: a single scenario
// ---------------------------------------------------------------------------
const scenario = process.argv[2];
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `genesis-auth-${scenario}-`));
const dbPath = path.join(workDir, 'genesis.db');
if (scenario === 'legacy') fs.copyFileSync(SOURCE_DB, dbPath);
process.env.GENESIS_DB_PATH = dbPath;
process.env.GENESIS_DIST_DIR = path.join(ROOT, 'dist');

const { startServer } = require('../server/index.js');
const { getDb } = require('../server/db');
const { hashPassword } = require('../server/passwords');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../server/auth');

let base;
let server;
const results = [];

function check(name, fn) { results.push({ name, fn }); }

async function api(method, route, { token, body, headers = {} } = {}) {
  const res = await fetch(`${base}/api${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* not json */ }
  return { status: res.status, json, text };
}

function insertUser(id, username, role, password = 'Test-Password-2026') {
  const db = getDb();
  const companyId = db.prepare('SELECT id FROM companies ORDER BY created_at LIMIT 1').get().id;
  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), 0)`).run(id, username, hashPassword(password), username, null, role, companyId);
  return password;
}

async function login(username, password) {
  return api('POST', '/auth/login', { body: { username, password } });
}

// ---------------------------------------------------------------------------
if (scenario === 'fresh') {
  let adminToken;
  const ADMIN = { username: 'chief.admin', password: 'Correct-Horse-2026', full_name: 'Chief Admin' };

  check('fresh database reports setup required and creates no demo accounts', async () => {
    const s = await api('GET', '/setup/status');
    assert.strictEqual(s.json.needsSetup, true);
    const count = getDb().prepare('SELECT COUNT(*) AS n FROM users').get().n;
    assert.strictEqual(count, 0, 'no users exist before setup');
    const demo = await login('admin', 'admin123');
    assert.strictEqual(demo.status, 401, 'demo credentials must not work on a fresh install');
  });

  check('every protected endpoint rejects anonymous requests', async () => {
    const routes = [...new Set(getDb() && require('../server/routes/api').stack
      .filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`))];
    const publicRoutes = new Set(['POST /auth/login', 'GET /setup/status', 'POST /setup/initialize']);
    for (const key of routes) {
      if (publicRoutes.has(key)) continue;
      const [method, rawPath] = key.split(' ');
      const p = rawPath.replace(/:[a-zA-Z]+/g, 'x1');
      const r = await api(method, p);
      assert.strictEqual(r.status, 401, `${key} must require authentication (got ${r.status})`);
    }
  });

  check('the x-user-id header does not grant access', async () => {
    const r = await api('GET', '/accounts', { headers: { 'x-user-id': 'usr-admin' } });
    assert.strictEqual(r.status, 401);
    const r2 = await api('GET', '/accounts', { headers: { authorization: 'Bearer not-a-real-token' } });
    assert.strictEqual(r2.status, 401);
  });

  check('setup rejects weak or invalid administrator details', async () => {
    const weak = await api('POST', '/setup/initialize', { body: { company_name: 'Acme', full_name: 'A', username: 'boss', password: 'short' } });
    assert.strictEqual(weak.json.code, 'PASSWORD_TOO_SHORT');
    const same = await api('POST', '/setup/initialize', { body: { company_name: 'Acme', full_name: 'A', username: 'administrator1', password: 'administrator1' } });
    assert.strictEqual(same.json.code, 'PASSWORD_MATCHES_USERNAME');
    const repeated = await api('POST', '/setup/initialize', { body: { company_name: 'Acme', full_name: 'A', username: 'boss', password: 'aaaaaaaaaaaa' } });
    assert.strictEqual(repeated.json.code, 'PASSWORD_TOO_SIMPLE');
    const badName = await api('POST', '/setup/initialize', { body: { company_name: 'Acme', full_name: 'A', username: 'b o s s', password: ADMIN.password } });
    assert.strictEqual(badName.json.code, 'USERNAME_INVALID');
    assert.strictEqual(getDb().prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
  });

  check('setup creates one administrator and cannot be repeated', async () => {
    const r = await api('POST', '/setup/initialize', { body: { company_name: 'Acme Trading', full_name: ADMIN.full_name, username: ADMIN.username, password: ADMIN.password } });
    assert.strictEqual(r.status, 200, r.text);
    const admins = getDb().prepare("SELECT role, password_hash FROM users").all();
    assert.strictEqual(admins.length, 1);
    assert.strictEqual(admins[0].role, 'admin');
    assert.ok(admins[0].password_hash.startsWith('scrypt$'), 'password stored with scrypt');
    assert.ok(!admins[0].password_hash.includes(ADMIN.password), 'plaintext password not stored');
    const again = await api('POST', '/setup/initialize', { body: { company_name: 'Evil', full_name: 'Evil', username: 'evil.user', password: 'Another-Password-1' } });
    assert.strictEqual(again.status, 409);
    assert.strictEqual(getDb().prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  });

  check('wrong passwords are rejected generically and lock the account after repeated failures', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await login(ADMIN.username, 'wrong-password-x');
      assert.strictEqual(r.status, 401);
      assert.strictEqual(r.json.code, 'INVALID_CREDENTIALS');
    }
    const fifth = await login(ADMIN.username, 'wrong-password-x');
    assert.strictEqual(fifth.status, 423);
    assert.strictEqual(fifth.json.code, 'ACCOUNT_LOCKED');
    const locked = await login(ADMIN.username, ADMIN.password);
    assert.strictEqual(locked.status, 423, 'correct password is refused while locked');
    // Simulate the lock period passing.
    getDb().prepare('UPDATE users SET locked_until = NULL WHERE username = ?').run(ADMIN.username);
  });

  check('unknown usernames get the same response as wrong passwords', async () => {
    const r = await login('nobody-here', 'whatever-password');
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.json.code, 'INVALID_CREDENTIALS');
  });

  check('login issues a session token; /auth/me returns identity and permissions', async () => {
    const r = await login(ADMIN.username, ADMIN.password);
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.token && r.json.token.length >= 40);
    adminToken = r.json.token;
    const me = await api('GET', '/auth/me', { token: adminToken });
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.json.user.role, 'admin');
    assert.ok(me.json.permissions.includes('users:manage'));
    assert.strictEqual(me.json.user.must_change_password, false);
  });

  check('session tokens are stored only as digests', async () => {
    const rows = getDb().prepare('SELECT id FROM sessions').all();
    assert.ok(rows.length >= 1);
    for (const row of rows) {
      assert.ok(!row.id.includes(adminToken), 'token is not stored in plaintext');
      assert.match(row.id, /^[0-9a-f]{64}$/);
    }
  });

  check('the company list is limited to the session company', async () => {
    const r = await api('GET', '/companies', { token: adminToken });
    assert.strictEqual(r.json.length, 1);
    const mismatch = await api('GET', '/accounts', { token: adminToken, headers: { 'x-company-id': 'comp-other' } });
    assert.strictEqual(mismatch.status, 403);
    assert.strictEqual(mismatch.json.code, 'COMPANY_FORBIDDEN');
  });

  check('logout revokes the session token', async () => {
    const r = await login(ADMIN.username, ADMIN.password);
    const token = r.json.token;
    assert.strictEqual((await api('GET', '/accounts', { token })).status, 200);
    assert.strictEqual((await api('POST', '/auth/logout', { token })).status, 200);
    assert.strictEqual((await api('GET', '/accounts', { token })).status, 401);
  });

  check('idle and absolute session expiry are enforced', async () => {
    const r = await login(ADMIN.username, ADMIN.password);
    const token = r.json.token;
    const digest = crypto.createHash('sha256').update(token).digest('hex');
    getDb().prepare('UPDATE sessions SET idle_expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), digest);
    assert.strictEqual((await api('GET', '/accounts', { token })).status, 401, 'idle timeout');

    const r2 = await login(ADMIN.username, ADMIN.password);
    const digest2 = crypto.createHash('sha256').update(r2.json.token).digest('hex');
    getDb().prepare('UPDATE sessions SET absolute_expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), digest2);
    assert.strictEqual((await api('GET', '/accounts', { token: r2.json.token })).status, 401, 'absolute lifetime');
  });

  check('every route is guarded by a permission or explicitly authenticated-only', async () => {
    const AUTH_ONLY = new Set(['GET /companies', 'GET /companies/current', 'GET /auth/me', 'POST /auth/logout', 'POST /auth/change-password']);
    const PUBLIC = new Set(['POST /auth/login', 'GET /setup/status', 'POST /setup/initialize']);
    const stack = require('../server/routes/api').stack.filter((l) => l.route);
    assert.ok(stack.length > 60);
    for (const layer of stack) {
      const method = Object.keys(layer.route.methods)[0].toUpperCase();
      const key = `${method} ${layer.route.path}`;
      if (PUBLIC.has(key) || AUTH_ONLY.has(key)) continue;
      const guards = layer.route.stack.map((h) => h.handle.permission).filter(Boolean);
      assert.strictEqual(guards.length, 1, `${key} has no permission guard`);
      assert.ok(PERMISSIONS.includes(guards[0]));
    }
  });

  check('role matrix: each role can do its job and nothing more', async () => {
    insertUser('usr-acc', 'acc.user', 'accountant');
    insertUser('usr-sales', 'sales.user', 'sales');
    insertUser('usr-purch', 'purch.user', 'purchases');
    insertUser('usr-inv', 'inv.user', 'inventory');
    insertUser('usr-mgr', 'mgr.user', 'manager');
    const tokens = {};
    for (const u of ['acc.user', 'sales.user', 'purch.user', 'inv.user', 'mgr.user']) {
      const r = await login(u, 'Test-Password-2026');
      assert.strictEqual(r.status, 200, `${u} logs in`);
      tokens[u] = r.json.token;
    }
    const forbidden = (r) => r.status === 403 && r.json && r.json.code === 'FORBIDDEN';
    const allowed = (r) => r.status !== 401 && r.status !== 403;

    // Journal posting: accountant yes, sales no.
    assert.ok(allowed(await api('POST', '/journal-entries', { token: tokens['acc.user'], body: {} })));
    assert.ok(forbidden(await api('POST', '/journal-entries', { token: tokens['sales.user'], body: {} })));
    assert.ok(forbidden(await api('POST', '/journal-entries/je-x/reverse', { token: tokens['sales.user'], body: {} })));
    assert.ok(forbidden(await api('POST', '/journal-entries/je-x/reverse', { token: tokens['mgr.user'], body: {} })));
    // Sales invoicing: sales yes, purchases no.
    assert.ok(allowed(await api('POST', '/sales/invoices', { token: tokens['sales.user'], body: {} })));
    assert.ok(forbidden(await api('POST', '/sales/invoices', { token: tokens['purch.user'], body: {} })));
    assert.ok(forbidden(await api('POST', '/sales/invoices/x/post', { token: tokens['purch.user'], body: {} })));
    // Purchases: purchases yes, inventory no.
    assert.ok(allowed(await api('POST', '/purchases/bills', { token: tokens['purch.user'], body: {} })));
    assert.ok(forbidden(await api('POST', '/purchases/bills', { token: tokens['inv.user'], body: {} })));
    // Inventory adjustments: inventory yes, sales no.
    assert.ok(allowed(await api('POST', '/inventory/adjustments', { token: tokens['inv.user'], body: {} })));
    assert.ok(forbidden(await api('POST', '/inventory/adjustments', { token: tokens['sales.user'], body: {} })));
    // Reports: accountant and manager yes, sales no.
    assert.strictEqual((await api('GET', '/reports/trial-balance', { token: tokens['mgr.user'] })).status, 200);
    assert.strictEqual((await api('GET', '/reports/trial-balance', { token: tokens['acc.user'] })).status, 200);
    assert.ok(forbidden(await api('GET', '/reports/trial-balance', { token: tokens['sales.user'] })));
    // Manager is read-only.
    assert.ok(forbidden(await api('POST', '/sales/invoices', { token: tokens['mgr.user'], body: {} })));
    assert.ok(forbidden(await api('POST', '/payments', { token: tokens['mgr.user'], body: {} })));
    // Audit trail: accountant and manager; not sales.
    assert.ok(forbidden(await api('GET', '/audit-trail', { token: tokens['sales.user'] })));
    // Users and backups: administrator only.
    assert.ok(forbidden(await api('GET', '/auth/users', { token: tokens['acc.user'] })));
    assert.ok(forbidden(await api('GET', '/auth/users', { token: tokens['mgr.user'] })));
    assert.ok(forbidden(await api('POST', '/auth/users', { token: tokens['acc.user'], body: {} })));
    assert.ok(forbidden(await api('PUT', '/auth/users/usr-mgr', { token: tokens['acc.user'], body: { role: 'admin' } })));
    assert.ok(forbidden(await api('POST', '/backup/import', { token: tokens['acc.user'], body: {} })));
    assert.ok(forbidden(await api('GET', '/backup/export', { token: tokens['mgr.user'] })));
    assert.ok(forbidden(await api('PUT', '/companies/current', { token: tokens['acc.user'], body: {} })));
    // Accounts/tax configuration: accountant yes.
    assert.ok(allowed(await api('POST', '/taxes', { token: tokens['acc.user'], body: {} })));
    assert.ok(forbidden(await api('POST', '/taxes', { token: tokens['sales.user'], body: {} })));
  });

  check('a user cannot impersonate the administrator by sending a different user id', async () => {
    const r = await login('sales.user', 'Test-Password-2026');
    const res = await api('GET', '/auth/users', { token: r.json.token, headers: { 'x-user-id': 'usr-admin' } });
    assert.strictEqual(res.status, 403);
    const me = await api('GET', '/auth/me', { token: r.json.token, headers: { 'x-user-id': 'usr-admin' } });
    assert.strictEqual(me.json.user.username, 'sales.user');
  });

  check('administrator cannot remove their own rights or disable themselves', async () => {
    const adminId = getDb().prepare("SELECT id FROM users WHERE role = 'admin'").get().id;
    const demote = await api('PUT', `/auth/users/${adminId}`, { token: adminToken, body: { role: 'manager' } });
    assert.strictEqual(demote.json.code, 'SELF_LOCKOUT');
    const disable = await api('PUT', `/auth/users/${adminId}`, { token: adminToken, body: { active: false } });
    assert.strictEqual(disable.json.code, 'SELF_LOCKOUT');
  });

  check('changing a user role revokes that user\'s sessions', async () => {
    const accLogin = await login('acc.user', 'Test-Password-2026');
    assert.strictEqual((await api('GET', '/reports/trial-balance', { token: accLogin.json.token })).status, 200);
    const uid = getDb().prepare("SELECT id FROM users WHERE username = 'acc.user'").get().id;
    const r = await api('PUT', `/auth/users/${uid}`, { token: adminToken, body: { role: 'sales' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await api('GET', '/accounts', { token: accLogin.json.token })).status, 401);
    const again = await login('acc.user', 'Test-Password-2026');
    assert.strictEqual((await api('GET', '/journal-entries', { token: again.json.token })).status, 403, 'new role is applied');
  });

  check('administrator-created users must change their password before using the system', async () => {
    const created = await api('POST', '/auth/users', { token: adminToken, body: { username: 'new.staff', password: 'Initial-Password-1', full_name: 'New Staff', role: 'sales' } });
    assert.strictEqual(created.status, 200);
    const r = await login('new.staff', 'Initial-Password-1');
    assert.strictEqual(r.json.mustChangePassword, true);
    const blocked = await api('GET', '/accounts', { token: r.json.token });
    assert.strictEqual(blocked.json.code, 'PASSWORD_CHANGE_REQUIRED');
    assert.strictEqual((await api('GET', '/auth/me', { token: r.json.token })).status, 200);
  });

  check('demo reset endpoint is disabled and cannot drop data', async () => {
    const before = getDb().prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const r = await api('POST', '/backup/reset-demo', { token: adminToken });
    assert.strictEqual(r.status, 410);
    assert.strictEqual(getDb().prepare('SELECT COUNT(*) AS n FROM users').get().n, before);
  });

  check('backup import rejects malformed input before changing data', async () => {
    const r = await api('POST', '/backup/import', { token: adminToken, body: {} });
    assert.strictEqual(r.status, 400);
  });

  check('the permission matrix covers every role without unknown permissions', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of perms) assert.ok(PERMISSIONS.includes(p), `${role} has unknown permission ${p}`);
    }
    assert.deepStrictEqual(ROLE_PERMISSIONS.manager.filter((p) => !p.endsWith(':read')), [], 'manager is read-only');
  });
}

// ---------------------------------------------------------------------------
if (scenario === 'legacy') {
  let legacyToken;
  let counts;

  check('copied legacy database is migrated with a pre-migration backup', async () => {
    const backups = fs.readdirSync(path.join(workDir, 'backups')).filter((f) => f.startsWith('pre-migration'));
    assert.ok(backups.length >= 1, 'pre-migration backup created');
    const applied = getDb().prepare('SELECT version FROM schema_migrations').all().map((r) => r.version);
    assert.ok(applied.includes(1));
  });

  check('business records are unchanged by the authentication migration', () => {
    const src = new (require('better-sqlite3'))(SOURCE_DB, { readonly: true, fileMustExist: true });
    const tables = ['journal_entries', 'journal_entry_lines', 'sales_invoices', 'purchase_invoices', 'customers', 'products', 'companies'];
    counts = {};
    for (const t of tables) {
      const expected = src.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
      const actual = getDb().prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
      assert.strictEqual(actual, expected, `${t} count preserved`);
      counts[t] = expected;
    }
    src.close();
  });

  check('legacy accounts can still sign in once, then must change password', async () => {
    const r = await login('admin', 'admin123');
    assert.strictEqual(r.status, 200, 'legacy password accepted for the first sign-in');
    assert.strictEqual(r.json.mustChangePassword, true);
    legacyToken = r.json.token;
    assert.strictEqual((await api('GET', '/accounts', { token: legacyToken })).json.code, 'PASSWORD_CHANGE_REQUIRED');
  });

  check('password change enforces policy and the current password', async () => {
    const wrong = await api('POST', '/auth/change-password', { token: legacyToken, body: { current_password: 'nope-nope', new_password: 'Brand-New-Pass-1' } });
    assert.strictEqual(wrong.json.code, 'CURRENT_PASSWORD_INCORRECT');
    const weak = await api('POST', '/auth/change-password', { token: legacyToken, body: { current_password: 'admin123', new_password: 'admin123' } });
    assert.strictEqual(weak.status, 400);
    const ok = await api('POST', '/auth/change-password', { token: legacyToken, body: { current_password: 'admin123', new_password: 'Brand-New-Pass-1' } });
    assert.strictEqual(ok.status, 200, ok.text);
    assert.strictEqual((await api('GET', '/accounts', { token: legacyToken })).status, 200);
  });

  check('after the change the old password fails and the hash is scrypt', async () => {
    assert.strictEqual((await login('admin', 'admin123')).status, 401);
    const row = getDb().prepare("SELECT password_hash, must_change_password FROM users WHERE username = 'admin'").get();
    assert.ok(row.password_hash.startsWith('scrypt$'));
    assert.strictEqual(row.must_change_password, 0);
    assert.strictEqual((await login('admin', 'Brand-New-Pass-1')).status, 200);
  });

  check('setup is not offered on an existing installation', async () => {
    assert.strictEqual((await api('GET', '/setup/status')).json.needsSetup, false);
    const r = await api('POST', '/setup/initialize', { body: { company_name: 'X', full_name: 'X', username: 'xxxx', password: 'Another-Password-1' } });
    assert.strictEqual(r.status, 409);
  });
}

// ---------------------------------------------------------------------------
(async () => {
  try {
    const started = await startServer({ port: 0, host: '127.0.0.1' });
    server = started;
    base = `http://127.0.0.1:${started.port}`;
  } catch (err) {
    console.error('Could not start server:', err);
    process.exit(1);
  }
  let failed = 0;
  console.log(`  scenario: ${scenario}`);
  for (const t of results) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${t.name}\n     ${err.message}`);
    }
  }
  await server.close();
  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  console.log(`  ${results.length - failed} passed, ${failed} failed (${scenario})`);
  process.exit(failed === 0 ? 0 : 1);
})();
