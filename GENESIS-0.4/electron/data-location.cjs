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
const crypto = require('crypto');

const DB_FILE_NAME = 'genesis.db';
const BACKUP_DIR_NAME = 'backups';
const MAX_BACKUPS = 20;

/** The choice contains NO secrets and lives outside the legacy database directory.
 * It is written only after local, explicit confirmation in the desktop app. */
const CHOICE_FILE_NAME = 'installation-choice.json';

function dataDirectories(appDataRoot) {
  if (!appDataRoot) throw new Error('App data directory is required.');
  return {
    legacy: path.join(appDataRoot, 'GENESIS'),
    current: path.join(appDataRoot, 'JENESIS')
  };
}

function readInstallationRecord(appDataRoot) {
  const choiceFile = path.join(dataDirectories(appDataRoot).current, CHOICE_FILE_NAME);
  if (!fs.existsSync(choiceFile)) return null;
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(choiceFile, 'utf8'));
  } catch {
    throw new Error('JENESIS installation choice cannot be read. No database was selected; inspect installation-choice.json.');
  }
  if (saved?.version !== 1 || !['legacy', 'current'].includes(saved.selected) ||
      typeof saved.currentInitialized !== 'boolean') {
    throw new Error('JENESIS installation choice is invalid. No database was selected; inspect installation-choice.json.');
  }
  return saved;
}

function readInstallationChoice(appDataRoot) {
  return readInstallationRecord(appDataRoot)?.selected ?? null;
}

function writeInstallationRecord(appDataRoot, record) {
  const choiceFile = path.join(dataDirectories(appDataRoot).current, CHOICE_FILE_NAME);
  fs.mkdirSync(path.dirname(choiceFile), { recursive: true });
  const temporary = `${choiceFile}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, choiceFile);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

/** Never infer a preference when both databases exist. A previously recorded
 * choice is explicit, and does not copy or merge either database. */
function chooseDataDirectory(appDataRoot) {
  const { legacy, current } = dataDirectories(appDataRoot);
  const record = readInstallationRecord(appDataRoot);
  const selected = record?.selected;
  const hasLegacy = fs.existsSync(path.join(legacy, DB_FILE_NAME));
  const hasCurrent = fs.existsSync(path.join(current, DB_FILE_NAME));
  if (selected === 'legacy') {
    // A missing selected ledger is an error, not a reason to create a new one.
    if (!hasLegacy) throw new Error('The selected GENESIS database is missing. No new database was created; restore it from a verified backup.');
    return legacy;
  }
  if (selected === 'current') {
    if (record.currentInitialized && !hasCurrent) {
      throw new Error('The selected JENESIS database is missing. No new database was created; restore it from a verified backup.');
    }
    return current;
  }
  if (hasLegacy && hasCurrent) {
    throw new Error('Both GENESIS and JENESIS data directories contain a database. No database was selected or changed.');
  }
  return hasLegacy ? legacy : current;
}

function shouldOfferInstallationChoice(appDataRoot) {
  const { legacy, current } = dataDirectories(appDataRoot);
  return readInstallationChoice(appDataRoot) === null &&
    fs.existsSync(path.join(legacy, DB_FILE_NAME)) &&
    !fs.existsSync(path.join(current, DB_FILE_NAME));
}

function alternativeInstallation(appDataRoot, activeDirectory) {
  const { legacy, current } = dataDirectories(appDataRoot);
  if (!fs.existsSync(path.join(legacy, DB_FILE_NAME))) return null;
  if (path.resolve(activeDirectory) === path.resolve(legacy)) {
    const hasCurrent = fs.existsSync(path.join(current, DB_FILE_NAME));
    if (!hasCurrent && readInstallationRecord(appDataRoot)?.currentInitialized) return null;
    return { target: 'current', newDatabase: !hasCurrent };
  }
  if (path.resolve(activeDirectory) === path.resolve(current)) {
    return { target: 'legacy', newDatabase: false };
  }
  return null;
}

/** Atomic preference save. This never opens, deletes, or overwrites a database.
 * If two databases already exist, only a previously recorded choice may be
 * changed; we cannot guess which existing ledger belongs to the owner. */
function saveInstallationChoice(appDataRoot, selected) {
  if (!['legacy', 'current'].includes(selected)) throw new Error('Invalid installation choice');
  const { legacy, current } = dataDirectories(appDataRoot);
  const hasLegacy = fs.existsSync(path.join(legacy, DB_FILE_NAME));
  const hasCurrent = fs.existsSync(path.join(current, DB_FILE_NAME));
  const previous = readInstallationRecord(appDataRoot);
  if ((selected === 'legacy' && !hasLegacy) ||
      (selected === 'current' && !hasLegacy && !hasCurrent) ||
      (selected === 'current' && !hasCurrent && previous?.currentInitialized) ||
      (hasLegacy && hasCurrent && !previous)) {
    throw new Error('Installation choice changed while confirming. No database was modified.');
  }
  writeInstallationRecord(appDataRoot, {
    version: 1, selected, currentInitialized: Boolean(previous?.currentInitialized || hasCurrent)
  });
  return selected;
}

/** Call only after the backend has successfully opened the selected database,
 * before showing its UI. A missing DB on any later start must fail closed. */
function markInstallationInitialized(appDataRoot, activeDirectory) {
  const { legacy, current } = dataDirectories(appDataRoot);
  const record = readInstallationRecord(appDataRoot);
  if (path.resolve(activeDirectory) !== path.resolve(current)) return;
  if (!fs.existsSync(path.join(current, DB_FILE_NAME))) {
    throw new Error('Cannot record an installation without an initialized database.');
  }
  if (record?.selected === 'legacy') throw new Error('Installation changed while starting.');
  if (record?.currentInitialized) return;
  if (!record && fs.existsSync(path.join(legacy, DB_FILE_NAME))) {
    throw new Error('Both databases exist without an explicit installation choice.');
  }
  writeInstallationRecord(appDataRoot, { version: 1, selected: 'current', currentInitialized: true });
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

module.exports = {
  prepareDataDirectory, backupDatabase, chooseDataDirectory, readInstallationChoice,
  readInstallationRecord, shouldOfferInstallationChoice, alternativeInstallation,
  saveInstallationChoice, markInstallationInitialized,
  dataDirectories, DB_FILE_NAME, CHOICE_FILE_NAME, BACKUP_DIR_NAME, MAX_BACKUPS
};
