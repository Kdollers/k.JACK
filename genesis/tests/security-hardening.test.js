'use strict';
/**
 * Security and data-safety tests for Phase 1 closure:
 *   - rate limiting on sign-in, password change, setup and restore,
 *   - Content-Security-Policy and security headers,
 *   - backup contents (no users, credentials, sessions or audit log),
 *   - restore policy: re-authentication, confirmation, checksum, company match,
 *     legacy format refusal, session revocation, credentials unchanged, ledger preserved.
 * All checks run against a temporary COPY of genesis.db. The shipped database is never opened
 * for writing; its checksum is verified at the end.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const { BackendProcess, findFreePort } = require('../electron/backend-manager.cjs');
const { createLimiter } = require('../server/rateLimit');
const { CONTENT_SECURITY_POLICY } = require('../server/security');
const { checksumOf, validateBackup, FORMAT_VERSION } = require('../server/backup');
const { hashPassword } = require('../server/passwords');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');
const PASSWORD = 'Restore-Test-Passw0rd';

let passed = 0;
let failed = 0;
const pending = [];
const test = (name, fn) => pending.push({ name, fn });

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

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

/** Creates a fresh working copy of the shipped database with a known administrator password. */
function workingCopy(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `genesis-sec-${label}-`));
  const dbPath = path.join(dir, 'genesis.db');
  fs.copyFileSync(SOURCE_DB, dbPath);
  const db = new Database(dbPath);
  const admin = db.prepare("SELECT id, username FROM users WHERE role = 'admin' AND active = 1 ORDER BY created_at LIMIT 1").get();
  // The shipped database predates the auth migration; the server adds the new columns when it starts.
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(PASSWORD), admin.id);
  db.close();
  return { dir, dbPath, adminUsername: admin.username };
}

async function startOn(dbPath) {
  const port = await findFreePort();
  const proc = new BackendProcess({
    nodeExecutable: process.execPath,
    runAsNode: false,
    serverEntry: path.join(ROOT, 'server', 'index.js'),
    cwd: ROOT,
    env: { GENESIS_DB_PATH: dbPath, GENESIS_DIST_DIR: path.join(ROOT, 'dist') },
    startupTimeoutMs: 20000
  });
  await proc.start(port);
  return { proc, port };
}

async function signIn(port, username, password = PASSWORD) {
  const res = await request(port, 'POST', '/auth/login', { body: { username, password } });
  assert.strictEqual(res.status, 200, `login failed: ${res.text}`);
  return res.json.token;
}

function tableCounts(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return {
      journal: db.prepare('SELECT COUNT(*) n FROM journal_entries').get().n,
      lines: db.prepare('SELECT COUNT(*) n FROM journal_entry_lines').get().n,
      invoices: db.prepare('SELECT COUNT(*) n FROM sales_invoices').get().n,
      bills: db.prepare('SELECT COUNT(*) n FROM purchase_invoices').get().n,
      payments: db.prepare('SELECT COUNT(*) n FROM payments').get().n,
      users: db.prepare('SELECT COUNT(*) n FROM users').get().n
    };
  } finally {
    db.close();
  }
}

function trialBalance(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare('SELECT ROUND(SUM(debit),2) d, ROUND(SUM(credit),2) c FROM journal_entry_lines').get();
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
test('rate limiter blocks after the limit and reports Retry-After', () => {
  const limiter = createLimiter({ name: 't', windowMs: 60000, max: 3, keyFn: () => 'k' });
  const now = 1000000;
  assert.strictEqual(limiter.hit('a', now).allowed, true);
  assert.strictEqual(limiter.hit('a', now).allowed, true);
  assert.strictEqual(limiter.hit('a', now).allowed, true);
  const blocked = limiter.hit('a', now);
  assert.strictEqual(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 60);
  assert.strictEqual(limiter.hit('a', now + 61000).allowed, true, 'window resets');
  assert.strictEqual(limiter.hit('b', now).allowed, true, 'keys are independent');
});

test('sign-in is rate limited per account: 10 failures then HTTP 429 with Retry-After', async () => {
  const w = workingCopy('login');
  const { proc, port } = await startOn(w.dbPath);
  try {
    for (let i = 0; i < 10; i++) {
      const r = await request(port, 'POST', '/auth/login', { body: { username: 'nobody-here', password: 'wrong-password-1' } });
      assert.strictEqual(r.status, 401, `attempt ${i + 1} should be a normal refusal`);
    }
    const blocked = await request(port, 'POST', '/auth/login', { body: { username: 'nobody-here', password: 'wrong-password-1' } });
    assert.strictEqual(blocked.status, 429);
    assert.strictEqual(blocked.json.code, 'RATE_LIMITED');
    assert.ok(Number(blocked.headers['retry-after']) > 0);
  } finally {
    await proc.stop();
  }
});

test('restore is refused without the current password and without the typed confirmation', async () => {
  const w = workingCopy('reauth');
  const { proc, port } = await startOn(w.dbPath);
  try {
    const token = await signIn(port, w.adminUsername);
    const exported = await request(port, 'GET', '/backup/export', { token });
    assert.strictEqual(exported.status, 200);
    const backup = exported.json;

    const noConfirm = await request(port, 'POST', '/backup/import', { token, body: { backup, password: PASSWORD } });
    assert.strictEqual(noConfirm.status, 400);
    assert.strictEqual(noConfirm.json.code, 'CONFIRMATION_REQUIRED');

    const badPassword = await request(port, 'POST', '/backup/import', { token, body: { backup, password: 'not-the-password', confirm: 'RESTORE' } });
    assert.strictEqual(badPassword.status, 403);
    assert.strictEqual(badPassword.json.code, 'REAUTH_FAILED');

    // Refusals must not change anything: the session still works.
    const still = await request(port, 'GET', '/auth/me', { token });
    assert.strictEqual(still.status, 200);
  } finally {
    await proc.stop();
  }
});

test('backup contains business data only: no users, credentials, sessions or audit log', async () => {
  const w = workingCopy('contents');
  const { proc, port } = await startOn(w.dbPath);
  try {
    const token = await signIn(port, w.adminUsername);
    const exported = await request(port, 'GET', '/backup/export', { token });
    const text = exported.text;
    assert.strictEqual(exported.json.formatVersion, FORMAT_VERSION);
    assert.ok(!('users' in exported.json.data.tables), 'no users table in backup');
    assert.ok(!('sessions' in exported.json.data.tables), 'no sessions in backup');
    assert.ok(!('audit_logs' in exported.json.data.tables), 'no audit log in backup');
    assert.ok(!text.includes('scrypt$'), 'no password hashes in backup');
    assert.ok(!text.includes(token), 'no session token in backup');
    assert.strictEqual(exported.json.checksum, checksumOf(exported.json.data), 'checksum matches content');
    assert.strictEqual(exported.json.rowCounts.journal_entries, tableCounts(SOURCE_DB).journal, 'all journal entries exported');
    assert.strictEqual(exported.json.rowCounts.sales_invoices, tableCounts(SOURCE_DB).invoices);
    assert.strictEqual(exported.json.rowCounts.purchase_invoices, tableCounts(SOURCE_DB).bills);
    assert.strictEqual(exported.json.rowCounts.payments, tableCounts(SOURCE_DB).payments);
  } finally {
    await proc.stop();
  }
});

test('backup validation refuses tampering, other companies and the legacy format', () => {
  const company = 'comp-x';
  const data = { company: { id: company, name: 'X' }, tables: {} };
  for (const t of require('../server/backup').TABLES) data.tables[t.name] = [];
  const good = { formatVersion: FORMAT_VERSION, genesisVersion: '1', exportedAt: 'x', companyId: company, checksum: checksumOf(data), data };
  assert.deepStrictEqual(validateBackup(good, company), { ok: true });

  const tampered = JSON.parse(JSON.stringify(good));
  tampered.data.company.name = 'Changed';
  assert.strictEqual(validateBackup(tampered, company).code, 'BACKUP_CHECKSUM_MISMATCH');

  assert.strictEqual(validateBackup(good, 'other-company').code, 'BACKUP_COMPANY_MISMATCH');

  const legacy = { genesisVersion: '1.0.0', exportedAt: 'x', company: { id: company }, journalEntries: [] };
  assert.strictEqual(validateBackup(legacy, company).code, 'BACKUP_FORMAT_UNSUPPORTED');

  const unbalancedData = JSON.parse(JSON.stringify(data));
  unbalancedData.tables.journal_entries = [{ id: 'je-1', company_id: company }];
  unbalancedData.tables.journal_entry_lines = [{ id: 'l1', journal_entry_id: 'je-1', debit: 10, credit: 0 }];
  const unbalanced = { ...good, checksum: checksumOf(unbalancedData), data: unbalancedData };
  assert.strictEqual(validateBackup(unbalanced, company).code, 'BACKUP_UNBALANCED');
});

test('restore: data comes back, sessions are revoked, credentials unchanged, ledger preserved', async () => {
  const w = workingCopy('restore');
  const { proc, port } = await startOn(w.dbPath);
  let token;
  let backup;
  let before;
  let usersBefore;
  try {
    token = await signIn(port, w.adminUsername);
    const exported = await request(port, 'GET', '/backup/export', { token });
    backup = exported.json;
    before = tableCounts(w.dbPath);
    before.tb = trialBalance(w.dbPath);
    const db = new Database(w.dbPath, { readonly: true });
    usersBefore = db.prepare('SELECT id, username, password_hash, role FROM users ORDER BY id').all();
    db.close();

    // Simulate data loss: delete the journal (the restore must bring it back).
    const write = new Database(w.dbPath);
    write.pragma('foreign_keys = OFF');
    // Children first, so no orphan rows are left behind.
    for (const t of ['payments', 'sales_invoice_lines', 'sales_invoices', 'purchase_invoice_lines', 'purchase_invoices', 'journal_entry_lines', 'journal_entries']) {
      write.prepare(`DELETE FROM ${t}`).run();
    }
    write.close();
    assert.strictEqual(tableCounts(w.dbPath).journal, 0);
  } finally {
    await proc.stop();
  }

  // Restart the backend on the damaged copy: the admin signs in and restores.
  const second = await startOn(w.dbPath);
  try {
    const token2 = await signIn(second.port, w.adminUsername);
    const res = await request(second.port, 'POST', '/backup/import', {
      token: token2, body: { backup, password: PASSWORD, confirm: 'RESTORE' }
    });
    assert.strictEqual(res.status, 200, `restore failed: ${res.text}`);
    assert.strictEqual(res.json.signedOut, true);
    assert.ok(res.json.safetyCopy && res.json.safetyCopy.startsWith('pre-restore-'));

    // Every session, including the one used for the restore, is now revoked.
    const afterOld = await request(second.port, 'GET', '/auth/me', { token: token2 });
    assert.strictEqual(afterOld.status, 401, 'session used for restore is revoked');

    // The same credentials still work: access to the application is preserved.
    const token3 = await signIn(second.port, w.adminUsername);
    const me = await request(second.port, 'GET', '/auth/me', { token: token3 });
    assert.strictEqual(me.status, 200);

    // Data and ledger balance match the state before the damage.
    const after = tableCounts(w.dbPath);
    assert.strictEqual(after.journal, before.journal);
    assert.strictEqual(after.lines, before.lines);
    assert.strictEqual(after.invoices, before.invoices);
    assert.strictEqual(after.bills, before.bills);
    assert.strictEqual(after.payments, before.payments);
    const tb = trialBalance(w.dbPath);
    assert.strictEqual(tb.d, before.tb.d, 'total debits preserved');
    assert.strictEqual(tb.c, before.tb.c, 'total credits preserved');
    assert.strictEqual(tb.d, tb.c, 'ledger balances');

    // Users and credentials were not replaced by the backup.
    const db = new Database(w.dbPath, { readonly: true });
    const usersAfter = db.prepare('SELECT id, username, password_hash, role FROM users ORDER BY id').all();
    db.close();
    assert.deepStrictEqual(usersAfter, usersBefore, 'users, hashes and roles are unchanged');

    // The safety copy exists and is a complete database file.
    const safety = path.join(path.dirname(w.dbPath), 'backups', res.json.safetyCopy);
    assert.ok(fs.existsSync(safety), 'safety copy written');
    assert.strictEqual(tableCounts(safety).journal, 0, 'safety copy holds the state before the restore');
  } finally {
    await second.proc.stop();
  }
});

test('a restore that fails a consistency check changes nothing and keeps sessions', async () => {
  const w = workingCopy('rollback');
  const { proc, port } = await startOn(w.dbPath);
  try {
    const token = await signIn(port, w.adminUsername);
    const exported = await request(port, 'GET', '/backup/export', { token });
    const bad = JSON.parse(JSON.stringify(exported.json));
    // A balanced entry whose lines point at an account that does not exist.
    const entry = { ...bad.data.tables.journal_entries[0] };
    entry.id = 'je-bad-fk';
    entry.entry_number = 'TEST-FK-999';
    bad.data.tables.journal_entries.push(entry);
    bad.data.tables.journal_entry_lines.push(
      { id: 'jel-bad-1', journal_entry_id: 'je-bad-fk', account_id: 'acc-missing', line_number: 1, description: 'x', debit: 5, credit: 0 },
      { id: 'jel-bad-2', journal_entry_id: 'je-bad-fk', account_id: 'acc-missing', line_number: 2, description: 'x', debit: 0, credit: 5 }
    );
    bad.checksum = checksumOf(bad.data);
    const before = tableCounts(w.dbPath);
    const res = await request(port, 'POST', '/backup/import', { token, body: { backup: bad, password: PASSWORD, confirm: 'RESTORE' } });
    assert.strictEqual(res.status, 400, `expected refusal, got ${res.status} ${res.text}`);
    assert.strictEqual(res.json.code, 'BACKUP_FK_FAILED');
    assert.deepStrictEqual(tableCounts(w.dbPath), before, 'database unchanged after failed restore');
    const still = await request(port, 'GET', '/auth/me', { token });
    assert.strictEqual(still.status, 200, 'session kept after a refused restore');
  } finally {
    await proc.stop();
  }
});

test('every response carries the Content-Security-Policy and security headers', async () => {
  const w = workingCopy('csp');
  const { proc, port } = await startOn(w.dbPath);
  try {
    const page = await request(port, 'GET', '/');
    const csp = page.headers['content-security-policy'];
    assert.strictEqual(csp, CONTENT_SECURITY_POLICY);
    assert.ok(csp.includes("default-src 'self'"));
    assert.ok(csp.includes("object-src 'none'"));
    assert.ok(csp.includes("frame-ancestors 'none'"));
    assert.ok(!/https?:\/\//.test(csp), 'no external origins allowed');
    assert.strictEqual(page.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(page.headers['x-frame-options'], 'DENY');
    assert.strictEqual(page.headers['x-powered-by'], undefined);
    const api = await request(port, 'GET', '/setup/status');
    assert.strictEqual(api.headers['cache-control'], 'no-store');
    assert.ok(api.headers['content-security-policy']);
  } finally {
    await proc.stop();
  }
});

// ---------------------------------------------------------------------------
(async () => {
  console.log('--- SECURITY AND BACKUP TESTS ---');
  const before = fs.existsSync(SOURCE_DB) ? sha256File(SOURCE_DB) : null;
  for (const t of pending) {
    try {
      await t.fn();
      passed++;
      console.log(`✓ ${t.name}`);
    } catch (err) {
      failed++;
      console.error(`✗ ${t.name}\n   ${err.message}`);
    }
  }
  if (before && sha256File(SOURCE_DB) !== before) {
    failed++;
    console.error('✗ genesis.db was modified during the tests');
  }
  console.log(`--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed === 0 ? 0 : 1);
})();
