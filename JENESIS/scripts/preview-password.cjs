#!/usr/bin/env node
'use strict';
/**
 * preview-password.cjs — sets a known password on every preview user.
 *
 * The preview runs against a throwaway copy of the database, so the passwords
 * in it are whatever the real file happens to hold. Signing in through the
 * interface — the one thing worth proving on a preview — needs a password
 * somebody knows.
 *
 * This writes only to the preview database, never to JENESIS/genesis.db. It
 * refuses to run if pointed at the committed baseline.
 *
 * Usage:  node scripts/preview-password.cjs <path-to-preview-db> [password]
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('../server/passwords');

const target = process.argv[2];
const password = process.argv[3] || 'Jenesis-2026';

if (!target) {
  console.error('usage: node scripts/preview-password.cjs <preview-db> [password]');
  process.exit(2);
}

const resolved = path.resolve(target);
const baseline = path.resolve(__dirname, '..', 'genesis.db');

// Setting a password on the baseline would change the file every test copies.
if (resolved === baseline) {
  console.error('refusing to change the password of the committed baseline database.');
  console.error('the preview must run against a copy.');
  process.exit(2);
}
if (!fs.existsSync(resolved)) {
  console.error('no such database: ' + resolved);
  process.exit(2);
}

const db = new DatabaseSync(resolved);
const users = db.prepare('SELECT id, username FROM users').all();
const hash = hashPassword(password);
const update = db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?');
for (const u of users) update.run(hash, u.id);

const stillLegacy = db
  .prepare(`SELECT COUNT(*) AS c FROM users WHERE password_hash NOT LIKE 'scrypt$%'`)
  .get().c;

console.log('preview database: ' + resolved);
console.log('  ' + users.length + ' users, password set to ' + JSON.stringify(password));
console.log('  ' + users.map((u) => u.username).join(', '));
console.log('  still on a legacy hash: ' + stillLegacy + ' (must be 0)');
db.close();
if (stillLegacy !== 0) process.exit(1);
