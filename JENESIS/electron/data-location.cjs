'use strict';
/**
 * Prepares the per-user data directory used by the desktop application.
 *
 * Safety rules:
 *   - The database lives in the per-user data directory, never in the install folder.
 *   - A bundled seed database is copied ONLY when no database exists yet.
 *     The copy uses COPYFILE_EXCL, so an existing database is never overwritten.
 *   - Before each launch an existing database is copied to backups/ so that a
 *     failed upgrade can always be rolled back by hand.
 */
const fs = require('fs');
const path = require('path');

const DB_FILE_NAME = 'genesis.db';
const BACKUP_DIR_NAME = 'backups';
const MAX_BACKUPS = 20;
// The application was branded GENESIS before it was branded JENESIS. An existing
// installation kept its database in %APPDATA%\GENESIS; the renamed product now
// uses %APPDATA%\JENESIS. The old database is adopted by COPYING it (never by
// moving or overwriting), so an upgrade can always be undone by hand.
const LEGACY_APP_DIR_NAME = 'GENESIS';
const SQLITE_MAGIC = Buffer.from('SQLite format 3\u0000', 'utf8');

/**
 * Directories that may still hold a database from the older GENESIS build.
 * Only the JENESIS data directory inherits from GENESIS, and only its sibling
 * folder is considered. Overridable for tests.
 */
function legacyDataDirectories(dataDir) {
  if (!dataDir) return [];
  if (path.basename(dataDir) !== 'JENESIS') return [];
  return [path.join(path.dirname(dataDir), LEGACY_APP_DIR_NAME)];
}

function looksLikeSqliteFile(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(SQLITE_MAGIC.length);
      const read = fs.readSync(fd, header, 0, SQLITE_MAGIC.length, 0);
      return read === SQLITE_MAGIC.length && header.equals(SQLITE_MAGIC);
    } finally {
      fs.closeSync(fd);
    }
  } catch (_) {
    return false;
  }
}

/**
 * One-time, non-destructive adoption of a database left behind by the older
 * GENESIS installation.
 *
 * Rules:
 *   - Runs only when the JENESIS database does not exist yet.
 *   - COPIES the old database (plus any -wal / -shm sidecars), never moves,
 *     renames or deletes it: the old folder stays as a second safety copy.
 *   - Verifies the copy (size + SQLite header) and removes the incomplete copy
 *     if verification fails, so a damaged file can never be adopted silently.
 *
 * @returns {{ migrated: boolean, reason: string, sourcePath: string|null,
 *             dbPath: string, bytes: number|null }}
 */
function migrateLegacyDatabase({ dataDir, legacyDirs = legacyDataDirectories(dataDir), now = new Date() } = {}) {
  if (!dataDir) throw new Error('A data directory is required.');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, DB_FILE_NAME);

  if (fs.existsSync(dbPath)) {
    return { migrated: false, reason: 'target-exists', sourcePath: null, dbPath, bytes: null };
  }

  for (const legacyDir of legacyDirs || []) {
    if (!legacyDir || legacyDir === dataDir) continue;
    const sourcePath = path.join(legacyDir, DB_FILE_NAME);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) continue;

    try {
      fs.copyFileSync(sourcePath, dbPath, fs.constants.COPYFILE_EXCL);
      for (const suffix of ['-wal', '-shm']) {
        if (fs.existsSync(sourcePath + suffix)) {
          fs.copyFileSync(sourcePath + suffix, dbPath + suffix, fs.constants.COPYFILE_EXCL);
        }
      }
    } catch (err) {
      // Never leave a half-written database behind.
      try { removeDatabaseFiles(dbPath); } catch (_) { /* ignore */ }
      return { migrated: false, reason: `copy-failed: ${err.message}`, sourcePath, dbPath, bytes: null };
    }

    const expected = fs.statSync(sourcePath).size;
    const actual = fs.statSync(dbPath).size;
    if (expected > 0 && actual === expected && looksLikeSqliteFile(dbPath)) {
      return { migrated: true, reason: 'migrated', sourcePath, dbPath, bytes: actual };
    }

    try { removeDatabaseFiles(dbPath); } catch (_) { /* ignore */ }
    return { migrated: false, reason: 'verification-failed', sourcePath, dbPath, bytes: null };
  }

  void now;
  return { migrated: false, reason: 'no-legacy-database', sourcePath: null, dbPath, bytes: null };
}

function removeDatabaseFiles(dbPath) {
  for (const f of [dbPath, dbPath + '-wal', dbPath + '-shm']) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

function timestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * Ensures the data directory exists and that a database is available.
 * @returns {{ dbPath: string, dataDir: string, seeded: boolean, backupPath: string|null }}
 */
function prepareDataDirectory({ dataDir, seedPath = null, now = new Date(), legacyDirs } = {}) {
  if (!dataDir) throw new Error('A data directory is required.');
  fs.mkdirSync(dataDir, { recursive: true });

  let seeded = false;
  let backupPath = null;

  // Adopt a database from the previous GENESIS installation before anything
  // else can create one, so a real accounting database is never replaced by
  // the bundled starter copy.
  const migration = migrateLegacyDatabase({
    dataDir,
    legacyDirs: legacyDirs === undefined ? legacyDataDirectories(dataDir) : legacyDirs,
    now
  });
  const dbPath = migration.dbPath;

  if (fs.existsSync(dbPath)) {
    backupPath = backupDatabase(dbPath, path.join(dataDir, BACKUP_DIR_NAME), now);
  } else if (seedPath && fs.existsSync(seedPath)) {
    // COPYFILE_EXCL: fails instead of overwriting if the file appeared meanwhile.
    fs.copyFileSync(seedPath, dbPath, fs.constants.COPYFILE_EXCL);
    seeded = true;
  }

  return { dbPath, dataDir, seeded, backupPath, migration };
}

/**
 * Copies a database (plus any WAL/SHM side files left by an unclean shutdown)
 * into the backup directory and prunes old copies.
 */
function backupDatabase(dbPath, backupDir, now = new Date()) {
  fs.mkdirSync(backupDir, { recursive: true });
  const base = `genesis-${timestamp(now)}`;
  let target = path.join(backupDir, `${base}.db`);
  for (let n = 2; fs.existsSync(target); n++) {
    target = path.join(backupDir, `${base}-${n}.db`);
  }
  fs.copyFileSync(dbPath, target, fs.constants.COPYFILE_EXCL);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(dbPath + suffix)) {
      fs.copyFileSync(dbPath + suffix, target + suffix, fs.constants.COPYFILE_EXCL);
    }
  }

  const backups = fs.readdirSync(backupDir)
    .filter((f) => /^genesis-\d{8}-\d{6}(-\d+)?\.db$/.test(f))
    .sort();
  while (backups.length > MAX_BACKUPS) {
    const oldest = backups.shift();
    for (const f of [oldest, oldest + '-wal', oldest + '-shm']) {
      try { fs.unlinkSync(path.join(backupDir, f)); } catch (_) { /* ignore */ }
    }
  }
  return target;
}

module.exports = {
  prepareDataDirectory,
  backupDatabase,
  migrateLegacyDatabase,
  legacyDataDirectories,
  DB_FILE_NAME,
  BACKUP_DIR_NAME,
  LEGACY_APP_DIR_NAME,
  MAX_BACKUPS
};
