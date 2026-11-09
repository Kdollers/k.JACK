#!/usr/bin/env node
'use strict';
/**
 * Builds the database the live preview runs on:
 * JENESIS/.preview/genesis.db - a copy of the pristine baseline with a
 * password everybody can sign in with.
 *
 * The preview must never point the server at JENESIS/genesis.db. The server
 * migrates whatever database it opens, in place, so doing that would upgrade
 * the pre-migration baseline that the test suite is written against: every
 * later run of the suite then fails with count mismatches that look like bugs
 * and are not. A throwaway copy costs nothing and keeps the two apart.
 *
 * Usage:
 *   node scripts/preview-db.cjs [password]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PASSWORD = process.argv[2] || 'Jenesis-2026';
const target = path.join(ROOT, '.preview', 'genesis.db');

// better-sqlite3 cannot be compiled in every sandbox; where it is missing the
// tests and this script run on Node's built-in node:sqlite through a shim.
// Either way the module name is the same, so require it by name and let the
// sandbox decide which implementation answers.
const Database = require('better-sqlite3');
const { hashPassword } = require(path.join(ROOT, 'server', 'passwords.js'));

fs.mkdirSync(path.dirname(target), { recursive: true });
for (const f of [target, target + '-wal', target + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
fs.copyFileSync(path.join(ROOT, 'genesis.db'), target);

const db = new Database(target);
const users = db.prepare('SELECT id, username FROM users ORDER BY username').all();
const setPassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
db.transaction(() => {
  for (const user of users) setPassword.run(hashPassword(PASSWORD), user.id);
})();
const leftOnLegacyHash = db
  .prepare("SELECT count(*) AS n FROM users WHERE password_hash NOT LIKE 'scrypt$%'")
  .get().n;
db.close();

console.log(`preview database: ${target}`);
console.log(`  ${users.length} users, password '${PASSWORD}': ${users.map((u) => u.username).join(', ')}`);
console.log(`  still on a legacy hash: ${leftOnLegacyHash} (must be 0)`);
console.log(`  copied from: ${path.join(ROOT, 'genesis.db')} (left untouched)`);

if (leftOnLegacyHash !== 0) {
  console.error('preview-db: a user was not given a current-format hash.');
  process.exit(1);
}
