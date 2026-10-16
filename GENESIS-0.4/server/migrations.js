'use strict';
/**
 * Versioned, transactional schema migrations.
 *
 * Each migration runs once, inside a transaction, and is recorded in
 * schema_migrations. Migrations must only ADD structure or make safe, documented
 * data changes; they never delete business records.
 */
const { legacyHash } = require('./passwords');
const { hasBusinessData } = require('./setup-state');

function addUniqueIndexUnlessLegacyDuplicates(db, name, expression, predicate) {
  const duplicates = db.prepare(`SELECT ${expression} AS key FROM users WHERE ${predicate} GROUP BY ${expression} HAVING COUNT(*) > 1 LIMIT 1`).get();
  if (duplicates) {
    // Do not delete or rewrite historical user data to satisfy a new constraint.
    // The API rejects any further duplicates; an administrator can reconcile the
    // existing accounts before the index is created on a later startup.
    console.warn(`[GENESIS] Legacy duplicate user identifiers prevent index ${name}; reconcile them in User Management.`);
    return;
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${name} ON users(${expression}) WHERE ${predicate}`);
}

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function addColumn(db, table, column, definition) {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const MIGRATIONS = [
  {
    version: 1,
    name: 'authentication: sessions, password metadata, lockout',
    up(db) {
      addColumn(db, 'users', 'password_algo', "TEXT NOT NULL DEFAULT 'sha256-legacy'");
      addColumn(db, 'users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
      addColumn(db, 'users', 'failed_login_count', 'INTEGER NOT NULL DEFAULT 0');
      addColumn(db, 'users', 'locked_until', 'TEXT');
      addColumn(db, 'users', 'last_login_at', 'TEXT');
      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,               -- SHA-256 of the bearer token; the token itself is never stored
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          company_id TEXT,
          created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          idle_expires_at TEXT NOT NULL,
          absolute_expires_at TEXT NOT NULL,
          revoked_at TEXT,
          ip TEXT,
          user_agent TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      `);
      // Accounts still using the legacy hash must choose a new password at next login.
      // Their existing hashes remain valid for that one login so nobody is locked out.
      db.prepare(`UPDATE users SET must_change_password = 1 WHERE password_hash NOT LIKE 'scrypt$%'`).run();
    }
  },
  {
    version: 2,
    name: 'persist first-run setup state without discarding legacy data',
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS installation_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        completed_at TEXT
      )`);
      // This migration runs before the first-run chart/company are seeded. An
      // existing company/chart/bank/tax setup with NO users is still an old
      // installation requiring offline recovery, never a fresh public setup.
      const preExisting = ['users', 'companies', 'accounts', 'tax_rates', 'bank_accounts']
        .some((table) => !!db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get());
      db.prepare('INSERT INTO installation_state (id, completed_at) VALUES (1, ?)')
        .run(preExisting || hasBusinessData(db) ? new Date().toISOString() : null);
    }
  }
];

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  const appliedNow = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      m.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(m.version, m.name, new Date().toISOString());
    })();
    appliedNow.push(m.version);
  }
  // Legacy databases may contain duplicates. Preserve them rather than failing
  // startup; re-attempt the indexes after an administrator reconciles the rows.
  addUniqueIndexUnlessLegacyDuplicates(db, 'idx_users_username_ci', 'lower(trim(username))', "username IS NOT NULL");
  addUniqueIndexUnlessLegacyDuplicates(db, 'idx_users_email_ci', 'lower(trim(email))', "email IS NOT NULL AND trim(email) <> ''");
  return appliedNow;
}

module.exports = { runMigrations, MIGRATIONS, legacyHash };
