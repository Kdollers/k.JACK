'use strict';
/**
 * Prepares the per-user data directory used by the desktop application.
 *
 * Safety rules:
 *   - The database lives in the per-user data directory, never in the install folder.
 *   - A bundled seed database is copied ONLY when no database exists yet.
 *     The copy uses COPYFILE_EXCL, so an existing database is never overwritten.
 *   - For a normal desktop launch, the backend creates a verified SQLite
 *     snapshot before changes. Raw backupDatabase is only for offline fixtures
 *     with no writers; do not use it for a running database.
 */
const fs = require('fs');
const path = require('path');

const DB_FILE_NAME = 'genesis.db';
const BACKUP_DIR_NAME = 'backups';
const MAX_BACKUPS = 20;

/** Preserve an existing GENESIS installation without silently starting a second,
 * empty JENESIS ledger. New installs use a separate JENESIS directory. If both
 * paths already contain different DBs, fail closed and ask the owner to inspect. */
function chooseDataDirectory(appDataRoot) {
  if (!appDataRoot) throw new Error('App data directory is required.');
  const legacyDir = path.join(appDataRoot, 'GENESIS');
  const jenesisDir = path.join(appDataRoot, 'JENESIS');
  const legacy = fs.existsSync(path.join(legacyDir, DB_FILE_NAME));
  const modern = fs.existsSync(path.join(jenesisDir, DB_FILE_NAME));
  if (legacy && modern) {
    throw new Error('Both GENESIS and JENESIS data directories contain a database. No database was selected or changed.');
  }
  return legacy ? legacyDir : jenesisDir;
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
function prepareDataDirectory({ dataDir, seedPath = null, now = new Date(), backupExisting = true }) {
  if (!dataDir) throw new Error('A data directory is required.');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, DB_FILE_NAME);

  let seeded = false;
  let backupPath = null;

  if (fs.existsSync(dbPath)) {
    if (backupExisting) backupPath = backupDatabase(dbPath, path.join(dataDir, BACKUP_DIR_NAME), now);
  } else if (seedPath && fs.existsSync(seedPath)) {
    // COPYFILE_EXCL: fails instead of overwriting if the file appeared meanwhile.
    fs.copyFileSync(seedPath, dbPath, fs.constants.COPYFILE_EXCL);
    seeded = true;
  }

  return { dbPath, dataDir, seeded, backupPath };
}

/**
 * Legacy offline-only file copy. No other process may write during this copy;
 * online/desktop safety copies use SQLite's transactionally consistent API.
 * Copy the WAL/SHM sidecars left by an unclean shutdown and prune old copies.
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

module.exports = { prepareDataDirectory, backupDatabase, chooseDataDirectory, DB_FILE_NAME, BACKUP_DIR_NAME, MAX_BACKUPS };
