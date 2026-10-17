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

function timestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * Ensures the data directory exists and that a database is available.
 * @returns {{ dbPath: string, dataDir: string, seeded: boolean, backupPath: string|null }}
 */
function prepareDataDirectory({ dataDir, seedPath = null, now = new Date() }) {
  if (!dataDir) throw new Error('A data directory is required.');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, DB_FILE_NAME);

  let seeded = false;
  let backupPath = null;

  if (fs.existsSync(dbPath)) {
    backupPath = backupDatabase(dbPath, path.join(dataDir, BACKUP_DIR_NAME), now);
  } else if (seedPath && fs.existsSync(seedPath)) {
    // COPYFILE_EXCL: fails instead of overwriting if the file appeared meanwhile.
    fs.copyFileSync(seedPath, dbPath, fs.constants.COPYFILE_EXCL);
    seeded = true;
  }

  return { dbPath, dataDir, seeded, backupPath };
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

module.exports = { prepareDataDirectory, backupDatabase, DB_FILE_NAME, BACKUP_DIR_NAME, MAX_BACKUPS };
