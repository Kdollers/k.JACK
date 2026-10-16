'use strict';
// A pre-existing installation with no accounts is not the same as a new one.
// Simulate a pre-migration installation using only a generated temporary DB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-setup-state-'));
const dbPath = path.join(dir, 'genesis.db');
function child(code) {
  const run = spawnSync(process.execPath, ['-e', code], {
    cwd: ROOT, env: { ...process.env, GENESIS_DB_PATH: dbPath },
    encoding: 'utf8', timeout: 20000
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return run.stdout;
}
try {
  const initial = child("const {getDb,closeDb}=require('./server/db');const {setupStatus}=require('./server/setup-state');console.log(JSON.stringify(setupStatus(getDb())));closeDb()");
  assert.equal(JSON.parse(initial).needsSetup, true);
  const db = new Database(dbPath);
  const accountsBefore = db.prepare('SELECT code, name FROM accounts ORDER BY code').all();
  const companyBefore = db.prepare('SELECT * FROM companies').all();
  assert.ok(accountsBefore.length > 20);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
  // Migration v2 had never run in the simulated old installation. The chart
  // and company continue to exist, and we do not delete any business rows.
  db.exec('DROP TABLE installation_state; DELETE FROM schema_migrations WHERE version = 2');
  db.close();
  const after = child("const {getDb,closeDb}=require('./server/db');const {setupStatus}=require('./server/setup-state');console.log(JSON.stringify(setupStatus(getDb())));closeDb()");
  assert.deepEqual(JSON.parse(after), { needsSetup: false, recoveryRequired: true, hasAdministrator: false });
  const db2 = new Database(dbPath, { readonly: true });
  try {
    assert.deepEqual(db2.prepare('SELECT code, name FROM accounts ORDER BY code').all(), accountsBefore);
    assert.deepEqual(db2.prepare('SELECT * FROM companies').all(), companyBefore);
    assert.ok(db2.prepare('SELECT completed_at FROM installation_state WHERE id = 1').get().completed_at);
  } finally { db2.close(); }
  console.log('  ✓ existing company/chart with no users cannot re-open first-run registration');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
