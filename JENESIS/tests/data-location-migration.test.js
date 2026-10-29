'use strict';
/**
 * Data-location tests for the GENESIS -> JENESIS rename.
 *
 * The product used to store its database in %APPDATA%\GENESIS and now uses
 * %APPDATA%\JENESIS. These checks prove that an existing accounting database is
 * adopted safely: it is COPIED (never moved or overwritten), verified, and the
 * old file is left in place as a second safety copy.
 *
 * Everything runs on temporary directories; the shipped genesis.db is only read.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const {
  prepareDataDirectory,
  migrateLegacyDatabase,
  legacyDataDirectories,
  DB_FILE_NAME,
  LEGACY_APP_DIR_NAME
} = require('../electron/data-location.cjs');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push({ name, fn });
}

function tmpDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `jenesis-dataloc-${label}-`));
}

function md5(file) {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
}

/** A JENESIS data directory with its sibling legacy GENESIS folder. */
function scenario(label, { withLegacy = true, withSidecars = false, corruptLegacy = false } = {}) {
  const parent = tmpDir(label);
  const dataDir = path.join(parent, 'JENESIS');
  const legacyDir = path.join(parent, LEGACY_APP_DIR_NAME);
  fs.mkdirSync(dataDir, { recursive: true });
  if (withLegacy) {
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.copyFileSync(SOURCE_DB, path.join(legacyDir, DB_FILE_NAME));
    if (withSidecars) {
      fs.writeFileSync(path.join(legacyDir, DB_FILE_NAME) + '-wal', 'wal-data');
      fs.writeFileSync(path.join(legacyDir, DB_FILE_NAME) + '-shm', 'shm-data');
    }
    if (corruptLegacy) {
      fs.writeFileSync(path.join(legacyDir, DB_FILE_NAME), 'this is not a sqlite database at all');
    }
  }
  return { parent, dataDir, legacyDir, legacyDb: path.join(legacyDir, DB_FILE_NAME) };
}

// ---------------------------------------------------------------------------
test('legacyDataDirectories only proposes the sibling GENESIS folder of a JENESIS data directory', () => {
  assert.deepStrictEqual(legacyDataDirectories(path.join('C:', 'Users', 'me', 'AppData', 'Roaming', 'JENESIS')), [
    path.join('C:', 'Users', 'me', 'AppData', 'Roaming', LEGACY_APP_DIR_NAME)
  ]);
  assert.deepStrictEqual(legacyDataDirectories(path.join('C:', 'Users', 'me', 'AppData', 'Roaming', 'GENESIS')), []);
  assert.deepStrictEqual(legacyDataDirectories(tmpDir('other')), []);
});

test('an existing GENESIS database is adopted into an empty JENESIS data directory', () => {
  const s = scenario('adopt');
  const r = migrateLegacyDatabase({ dataDir: s.dataDir });
  assert.strictEqual(r.migrated, true, `expected adoption, got ${r.reason}`);
  assert.strictEqual(r.sourcePath, s.legacyDb);
  assert.strictEqual(r.bytes, fs.statSync(s.legacyDb).size);
  assert.strictEqual(md5(path.join(s.dataDir, DB_FILE_NAME)), md5(s.legacyDb), 'copy must be byte-identical');
});

test('the original GENESIS database is left untouched (copied, never moved or deleted)', () => {
  const s = scenario('keep-source');
  const before = md5(s.legacyDb);
  migrateLegacyDatabase({ dataDir: s.dataDir });
  assert.ok(fs.existsSync(s.legacyDb), 'the source database must still exist');
  assert.strictEqual(md5(s.legacyDb), before, 'the source database must not be modified');
});

test('WAL and SHM sidecars are copied with the database', () => {
  const s = scenario('sidecars', { withSidecars: true });
  const r = migrateLegacyDatabase({ dataDir: s.dataDir });
  assert.strictEqual(r.migrated, true, r.reason);
  for (const suffix of ['-wal', '-shm']) {
    assert.ok(fs.existsSync(path.join(s.dataDir, DB_FILE_NAME) + suffix), `${suffix} must be copied`);
    assert.ok(fs.existsSync(s.legacyDb + suffix), `${suffix} must remain in the legacy folder`);
  }
});

test('an existing JENESIS database is never overwritten by the legacy one', () => {
  const s = scenario('no-overwrite');
  fs.writeFileSync(path.join(s.dataDir, DB_FILE_NAME), 'EXISTING PRODUCTION DATABASE');
  const r = migrateLegacyDatabase({ dataDir: s.dataDir });
  assert.strictEqual(r.migrated, false);
  assert.strictEqual(r.reason, 'target-exists');
  assert.strictEqual(fs.readFileSync(path.join(s.dataDir, DB_FILE_NAME), 'utf8'), 'EXISTING PRODUCTION DATABASE');
});

test('a legacy database that fails verification is not adopted and leaves no partial file', () => {
  const s = scenario('corrupt', { corruptLegacy: true });
  const r = migrateLegacyDatabase({ dataDir: s.dataDir });
  assert.strictEqual(r.migrated, false);
  assert.strictEqual(r.reason, 'verification-failed');
  assert.strictEqual(fs.existsSync(path.join(s.dataDir, DB_FILE_NAME)), false, 'no partial database may remain');
});

test('without a legacy installation nothing is migrated', () => {
  const s = scenario('no-legacy', { withLegacy: false });
  const r = migrateLegacyDatabase({ dataDir: s.dataDir });
  assert.strictEqual(r.migrated, false);
  assert.strictEqual(r.reason, 'no-legacy-database');
  assert.strictEqual(fs.existsSync(path.join(s.dataDir, DB_FILE_NAME)), false);
});

test('prepareDataDirectory adopts the legacy database instead of seeding the starter copy', () => {
  const s = scenario('prepare');
  const prepared = prepareDataDirectory({ dataDir: s.dataDir, seedPath: SOURCE_DB });
  assert.strictEqual(prepared.seeded, false, 'the starter copy must not be used when real data exists');
  assert.strictEqual(prepared.migration.migrated, true, prepared.migration.reason);
  assert.strictEqual(md5(prepared.dbPath), md5(s.legacyDb));
});

test('prepareDataDirectory still seeds a starter database for a brand-new installation', () => {
  const s = scenario('seed', { withLegacy: false });
  const prepared = prepareDataDirectory({ dataDir: s.dataDir, seedPath: SOURCE_DB });
  assert.strictEqual(prepared.seeded, true);
  assert.strictEqual(prepared.migration.migrated, false);
  assert.strictEqual(md5(prepared.dbPath), md5(SOURCE_DB));
});

test('the adopted database opens and still contains its accounting data', () => {
  const s = scenario('integrity');
  migrateLegacyDatabase({ dataDir: s.dataDir });
  const db = new Database(path.join(s.dataDir, DB_FILE_NAME), { readonly: true, fileMustExist: true });
  try {
    const companies = db.prepare('SELECT COUNT(*) AS n FROM companies').get().n;
    const accounts = db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n;
    assert.ok(companies >= 1, 'companies preserved');
    assert.ok(accounts >= 10, 'chart of accounts preserved');
    assert.strictEqual(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally {
    db.close();
  }
});

test('the legacy database is adopted only once (a second launch is a normal launch backup)', () => {
  const s = scenario('once');
  assert.strictEqual(migrateLegacyDatabase({ dataDir: s.dataDir }).migrated, true);
  const second = prepareDataDirectory({ dataDir: s.dataDir, seedPath: SOURCE_DB });
  assert.strictEqual(second.migration.migrated, false);
  assert.strictEqual(second.migration.reason, 'target-exists');
  assert.ok(second.backupPath && fs.existsSync(second.backupPath), 'the adopted database is backed up at launch');
});

// ---------------------------------------------------------------------------
(async () => {
  console.log('--- DATA LOCATION / GENESIS->JENESIS MIGRATION TESTS ---');
  for (const { name, fn } of pending) {
    try {
      await fn();
      passed++;
      console.log(`  \u2713 ${name}`);
    } catch (err) {
      failed++;
      console.log(`  \u2717 ${name}\n      ${err.message}`);
    }
  }
  console.log(`--- ${passed} passed, ${failed} failed ---`);
  process.exit(failed === 0 ? 0 : 1);
})();
