'use strict';
/**
 * Versioned, transactional schema migrations.
 *
 * Each migration runs once, inside a transaction, and is recorded in
 * schema_migrations. Migrations must only ADD structure or make safe, documented
 * data changes; they never delete business records.
 */
const { legacyHash } = require('./passwords');

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
  return appliedNow;
}

module.exports = { runMigrations, MIGRATIONS, legacyHash };
