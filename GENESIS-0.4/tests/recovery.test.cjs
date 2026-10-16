'use strict';
// Offline recovery tests. The historical DB is extracted from the tracked zip
// into /tmp, migrated there and NEVER run from the extracted project file.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const { writeLegacyFixture } = require('./fixture-db.cjs');
const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts/recover-administrator.cjs');
const PASSWORD = 'Offline-Recovery-Test-2026';
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function initializeDatabase(dbPath) {
  const proc = spawnSync(process.execPath, ['-e', "const {getDb,closeDb}=require('./server/db');getDb();closeDb()"], {
    cwd: ROOT, env: { ...process.env, GENESIS_DB_PATH: dbPath }, encoding: 'utf8', timeout: 20000
  });
  assert.equal(proc.status, 0, proc.stdout + proc.stderr);
}

async function runRecovery(dbPath, answers = [], timeoutMs = 15000) {
  const child = spawn(process.execPath, [SCRIPT, '--db', dbPath], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', consumed = 0, index = 0;
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
    // Wait for each individual prompt before answering. Pre-sending all lines
    // would lose input because readline is not asking the next question yet.
    while (index < answers.length) {
      const next = answers[index];
      const location = stdout.indexOf(next.prompt, consumed);
      if (location < 0) break;
      consumed = location + next.prompt.length;
      index++;
      child.stdin.write(next.value + '\n');
    }
  });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', resolve);
  });
  clearTimeout(timer);
  return { code, stdout, stderr, answered: index };
}

const commonAnswers = [
  { prompt: 'Your full name: ', value: 'Offline Recovery Test Admin' },
  { prompt: 'New administrator username: ', value: 'restored.admin' },
  { prompt: 'Email (optional): ', value: 'offline@example.test' },
  { prompt: 'New password (at least 10 characters): ', value: PASSWORD },
  { prompt: 'Confirm password: ', value: PASSWORD }
];

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-recovery-tests-'));
  try {
    const missing = path.join(temp, 'missing.db');
    const absent = await runRecovery(missing);
    check('nonexistent path is refused without creating a database', () => {
      assert.equal(absent.code, 1);
      assert.ok(!fs.existsSync(missing));
    });

    const freshPath = path.join(temp, 'fresh', 'genesis.db');
    fs.mkdirSync(path.dirname(freshPath));
    initializeDatabase(freshPath);
    const freshBefore = sha(freshPath);
    const fresh = await runRecovery(freshPath);
    check('a genuine first-run installation cannot use offline recovery', () => {
      assert.equal(fresh.code, 1);
      assert.match(fresh.stderr, /first-run setup/);
      assert.equal(sha(freshPath), freshBefore);
    });

    const legacyPath = path.join(temp, 'legacy', 'genesis.db');
    fs.mkdirSync(path.dirname(legacyPath));
    writeLegacyFixture(legacyPath);
    initializeDatabase(legacyPath);
    const before = new Database(legacyPath);
    const tables = ['users', 'companies', 'journal_entries', 'journal_entry_lines',
      'sales_invoices', 'purchase_invoices', 'payments', 'products', 'customers', 'suppliers'];
    const counts = Object.fromEntries(tables.map((table) => [table,
      before.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
    assert.equal(counts.users, 6, 'archived fixture contains exactly six demo identities');
    before.prepare(`INSERT INTO users
      (id, username, password_hash, full_name, role, company_id, active)
      VALUES ('usr-other-test', 'real.staff', 'test-hash', 'Real Staff', 'manager', 'comp-genesis-01', 1)`).run();
    before.prepare(`INSERT INTO sessions
      (id, user_id, company_id, created_at, last_seen_at, idle_expires_at, absolute_expires_at)
      VALUES (?, 'usr-admin', 'comp-genesis-01', datetime('now'), datetime('now'), datetime('now', '+1 hour'), datetime('now', '+1 hour'))`)
      .run('a'.repeat(64));
    before.close();
    const legacyBefore = sha(legacyPath);

    const cancel = await runRecovery(legacyPath, [...commonAnswers,
      { prompt: 'type DISABLE DEMO USERS; otherwise press Enter: ', value: '' },
      { prompt: 'Type RECOVER to create this administrator (and apply your demo-account choice): ', value: 'NO' }
    ]);
    check('typed confirmation is mandatory; cancellation preserves all data and makes no backup', () => {
      assert.equal(cancel.code, 0, cancel.stderr);
      assert.equal(cancel.answered, 7, cancel.stdout);
      assert.match(cancel.stdout, /Cancelled\. No changes made/);
      assert.equal(sha(legacyPath), legacyBefore);
      const backupFiles = fs.readdirSync(path.join(path.dirname(legacyPath), 'backups'));
      assert.ok(!backupFiles.some((f) => f.startsWith('pre-admin-recovery-')));
    });

    const recover = await runRecovery(legacyPath, [...commonAnswers,
      { prompt: 'type DISABLE DEMO USERS; otherwise press Enter: ', value: 'DISABLE DEMO USERS' },
      { prompt: 'Type RECOVER to create this administrator (and apply your demo-account choice): ', value: 'RECOVER' }
    ]);
    check('explicit recovery creates a new hashed admin without exposing the password', () => {
      assert.equal(recover.code, 0, recover.stderr + '\n' + recover.stdout);
      assert.equal(recover.answered, 7, recover.stdout);
      assert.match(recover.stdout, /Administrator created/);
      assert.ok(!recover.stdout.includes(PASSWORD));
      assert.ok(!recover.stderr.includes(PASSWORD));
    });

    const live = new Database(legacyPath, { readonly: true });
    try {
      check('business records, other user, and first-run lock remain intact', () => {
        for (const table of tables.filter((v) => v !== 'users')) {
          assert.equal(live.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, counts[table], table);
        }
        assert.equal(live.prepare('SELECT COUNT(*) AS n FROM users').get().n, counts.users + 2);
        const row = live.prepare("SELECT * FROM users WHERE username = 'restored.admin'").get();
        assert.equal(row.role, 'admin');
        assert.equal(row.active, 1);
        assert.match(row.password_hash, /^scrypt\$/);
        assert.equal(row.must_change_password, 0);
        assert.ok(live.prepare('SELECT completed_at FROM installation_state WHERE id = 1').get().completed_at);
        assert.equal(live.prepare("SELECT active FROM users WHERE username = 'real.staff'").get().active, 1);
        assert.ok(live.prepare("SELECT revoked_at FROM sessions WHERE id = ?").get('a'.repeat(64)).revoked_at);
      });
      check('only the six exact archived demo identities are deactivated, not deleted', () => {
        for (const username of ['admin', 'accountant', 'sales', 'purchases', 'inventory', 'manager']) {
          assert.equal(live.prepare('SELECT active FROM users WHERE username = ?').get(username).active, 0, username);
        }
      });
    } finally { live.close(); }
    const backups = fs.readdirSync(path.join(path.dirname(legacyPath), 'backups'))
      .filter((f) => f.startsWith('pre-admin-recovery-') && f.endsWith('.db'));
    check('a verified pre-change SQLite backup retains all original users and business rows', () => {
      assert.equal(backups.length, 1);
      const copy = new Database(path.join(path.dirname(legacyPath), 'backups', backups[0]), { readonly: true });
      try {
        assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
        assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM users').get().n, counts.users + 1);
        assert.equal(copy.prepare("SELECT active FROM users WHERE username = 'admin'").get().active, 1);
        assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM journal_entries').get().n, counts.journal_entries);
      } finally { copy.close(); }
    });
    console.log(`--- ${passed} RECOVERY CHECKS PASSED ---`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
