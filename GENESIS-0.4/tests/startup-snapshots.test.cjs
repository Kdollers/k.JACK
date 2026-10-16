'use strict';
// Use disposable DBs ONLY. Exercise WAL snapshots before a real legacy schema
// migration and fail-closed startup on an unreadable database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const { writeLegacyFixture } = require('./fixture-db.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jenesis-startup-snapshot-'));
const root = path.join(__dirname, '..');
function migrate(dbPath) {
  return spawnSync(process.execPath, ['-e', "const {getDb,closeDb}=require('./server/db');getDb();closeDb()"], {
    cwd: root, env: { ...process.env, GENESIS_DB_PATH: dbPath }, encoding: 'utf8', timeout: 30000
  });
}
try {
  const source = path.join(dir, 'genesis.db');
  writeLegacyFixture(source);
  const writer = new Database(source);
  try {
    writer.pragma('journal_mode = WAL');
    writer.prepare("UPDATE companies SET name = ? WHERE id = 'comp-genesis-01'").run('COMMITTED-WAL-BEFORE-MIGRATION');
    // Keep the original writer connected: the latest change remains in the WAL,
    // not necessarily in the main .db file when the second connection starts.
    assert.ok(fs.existsSync(source + '-wal'));
    const result = migrate(source);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const backupDir = path.join(dir, 'backups');
    const files = fs.readdirSync(backupDir);
    for (const prefix of ['pre-start-', 'pre-migration-']) {
      const file = files.find((f) => f.startsWith(prefix) && f.endsWith('.db'));
      assert.ok(file, `missing ${prefix} SQLite snapshot`);
      const copy = new Database(path.join(backupDir, file), { readonly: true });
      try {
        assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
        assert.equal(copy.prepare("SELECT name FROM companies WHERE id = 'comp-genesis-01'").get().name,
          'COMMITTED-WAL-BEFORE-MIGRATION', `missing committed WAL transaction in ${prefix}`);
        assert.ok(copy.prepare("SELECT * FROM users WHERE username = 'admin'").get());
      } finally { copy.close(); }
    }
    const live = new Database(source, { readonly: true });
    try {
      assert.equal(live.prepare('SELECT COUNT(*) AS n FROM company_memberships').get().n >= 6, true);
      assert.ok(live.pragma('table_info(sessions)').find((column) => column.name === 'app_mode'));
      assert.equal(live.prepare("SELECT name FROM companies WHERE id = 'comp-genesis-01'").get().name,
        'COMMITTED-WAL-BEFORE-MIGRATION');
    } finally { live.close(); }
    console.log('  ✓ verified pre-start and pre-migration copies preserve committed WAL data');
  } finally { writer.close(); }

  const damaged = path.join(dir, 'corrupt.db');
  const bytes = Buffer.from('not a SQLite database — do not alter business data');
  fs.writeFileSync(damaged, bytes);
  const refused = migrate(damaged);
  assert.notEqual(refused.status, 0, 'corrupted DB must not be migrated or recreated');
  assert.deepEqual(fs.readFileSync(damaged), bytes);
  console.log('  ✓ unreadable DB fails closed without being changed or replaced');
  console.log('--- STARTUP SNAPSHOT CHECKS PASSED ---');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
