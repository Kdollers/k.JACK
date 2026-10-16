#!/usr/bin/env node
'use strict';
/** Offline, explicitly authorized recovery for an EXISTING installation.
 * Close JENESIS first. Never exposed over HTTP or included in the installer.
 * Preserves all business data and old users; optionally deactivates only the
 * six exact demo identities from the historical archived database.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { hashPassword } = require('../server/passwords');
const { checkPasswordPolicy } = require('../server/auth');
const { normalizeUser, userConflict } = require('../server/user-validation');
const { setupStatus } = require('../server/setup-state');

const ARCHIVED_DEMO = new Map([
  ['usr-admin', 'admin'], ['usr-accountant', 'accountant'], ['usr-sales', 'sales'],
  ['usr-purchases', 'purchases'], ['usr-inventory', 'inventory'], ['usr-manager', 'manager']
]);

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--db') {
    throw new Error('Usage: node scripts/recover-administrator.cjs --db <path-to-existing-genesis.db>');
  }
  const dbPath = path.resolve(args[1]);
  if (!fs.existsSync(dbPath)) throw new Error('Database does not exist. No new database was created.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  let silent = false;
  const originalOutput = rl._writeToOutput.bind(rl);
  rl._writeToOutput = (value) => { if (!silent) originalOutput(value); };
  const ask = (prompt, hide = false) => new Promise((resolve) => {
    silent = hide;
    if (hide) process.stdout.write(prompt);
    rl.question(hide ? '' : prompt, (answer) => {
      if (hide) process.stdout.write('\n');
      silent = false;
      resolve(answer);
    });
  });
  const db = new Database(dbPath, { fileMustExist: true, timeout: 1000 });
  try {
    db.pragma('foreign_keys = ON');
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Database integrity check failed. No changes made.');
    const companies = db.prepare('SELECT id, name FROM companies ORDER BY created_at').all();
    if (!companies.length) throw new Error('No company exists; restore a verified database backup.');
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='installation_state'").get()) {
      throw new Error('Start JENESIS once to apply migrations, then close it before recovery.');
    }
    if (setupStatus(db).needsSetup) throw new Error('This installation is new. Use the first-run setup screen instead.');
    const users = db.prepare('SELECT id, username, role, active FROM users').all();
    console.log(`\nExisting installation: ${companies.length} company/companies, ${users.length} user(s). No account will be deleted.`);
    companies.forEach((c, i) => console.log(`  ${i + 1}. ${c.name} [${c.id}]`));
    const choice = companies.length === 1 ? '1' : await ask('Company number to recover: ');
    const company = companies[Number(choice) - 1];
    if (!company) throw new Error('Invalid company selection. No changes made.');
    const full_name = await ask('Your full name: ');
    const username = await ask('New administrator username: ');
    const email = await ask('Email (optional): ');
    const person = normalizeUser({ username, full_name, email });
    if (person.code) throw new Error(`Invalid account details: ${person.code}. No changes made.`);
    const password = await ask('New password (at least 10 characters): ', true);
    const confirm = await ask('Confirm password: ', true);
    const policy = checkPasswordPolicy(password, person.username);
    if (policy) throw new Error(`${policy.error} No changes made.`);
    if (password !== confirm) throw new Error('Passwords do not match. No changes made.');

    const matches = users.filter((u) => ARCHIVED_DEMO.get(u.id) === u.username && u.active);
    if (matches.length) {
      console.log('\nHistorical demo identities found: ' + matches.map((u) => u.username).join(', '));
      console.log('If these are real users in your installation, do NOT deactivate them.');
    }
    const disable = matches.length > 0 &&
      (await ask('To deactivate these exact accounts, type DISABLE DEMO USERS; otherwise press Enter: ')) === 'DISABLE DEMO USERS';
    console.log('\nA verified backup will be saved before any change.');
    if ((await ask('Type RECOVER to create this administrator (and apply your demo-account choice): ')) !== 'RECOVER') {
      console.log('Cancelled. No changes made.');
      return;
    }
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `pre-admin-recovery-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}.db`);
    await db.backup(backupPath);
    const check = new Database(backupPath, { readonly: true, fileMustExist: true });
    try {
      if (check.pragma('integrity_check', { simple: true }) !== 'ok' ||
        check.prepare('SELECT COUNT(*) AS n FROM users').get().n !== users.length) {
        throw new Error('Safety copy verification failed. No changes made.');
      }
    } finally { check.close(); }
    const id = `usr-${crypto.randomUUID()}`;
    const passwordHash = hashPassword(password);
    const recover = db.transaction(() => {
      if (userConflict(db, person)) throw new Error('Username or email is already in use. No changes made.');
      db.prepare(`INSERT INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
        VALUES (?, ?, ?, ?, ?, 'admin', ?, 1, datetime('now'), 0)`)
        .run(id, person.username, passwordHash, person.full_name, person.email, company.id);
      db.prepare('INSERT INTO company_memberships (user_id, company_id, role) VALUES (?, ?, ?)')
        .run(id, company.id, 'admin');
      db.prepare('UPDATE installation_state SET completed_at = COALESCE(completed_at, ?) WHERE id = 1')
        .run(new Date().toISOString());
      if (disable) {
        const stmt = db.prepare('UPDATE users SET active = 0 WHERE id = ? AND username = ? AND active = 1');
        for (const u of matches) stmt.run(u.id, u.username);
        db.prepare(`UPDATE sessions SET revoked_at = ? WHERE user_id IN (${matches.map(() => '?').join(',')}) AND revoked_at IS NULL`)
          .run(new Date().toISOString(), ...matches.map((u) => u.id));
      }
      db.prepare(`INSERT INTO audit_logs
        (id, company_id, user_id, user_name, timestamp, module, action, record_id, description)
        VALUES (?, ?, ?, ?, datetime('now'), 'AUTH', 'RECOVERY', ?, ?)`)
        .run(`audit-${crypto.randomUUID()}`, company.id, id, person.full_name, id,
          `Offline administrator recovery${disable ? '; archived demo users deactivated' : ''}`);
    });
    recover.immediate();
    console.log(`Administrator created for ${company.name}. Sign in as ${person.username}.`);
    if (disable) console.log(`${matches.length} archived demo account(s) deactivated (not deleted).`);
    console.log(`Verified safety copy: ${backupPath}`);
  } finally {
    db.close();
    rl.close();
  }
}

main().catch((err) => { console.error(`Recovery aborted: ${err.message}`); process.exitCode = 1; });
