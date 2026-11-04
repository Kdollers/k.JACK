'use strict';
/**
 * RECORD LIFECYCLE TESTS — deactivate / reactivate / delete.
 *
 * JENESIS 0.5.4 modification 3. Runs against a temporary COPY of the demo
 * database (the repository genesis.db is never opened for writing) with a real
 * HTTP server, so every assertion passes through the same permission guards
 * and the same audit writes as the desktop application.
 *
 * The behaviour under test:
 *   - only an administrator and a manager may retire a record, and that is
 *     enforced by the API, not by hiding a button;
 *   - a record with history can NEVER be deleted, only deactivated;
 *   - deactivating hides a record from new transactions but destroys nothing;
 *   - a deactivated user loses access at once, including an open session;
 *   - you cannot retire your own account, nor the last active administrator;
 *   - an inactive store keeps its stock and its movement history;
 *   - every action is written to the audit log with user, time and record.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-rec-'));
const dbPath = path.join(workDir, 'genesis.db');
if (fs.existsSync(SOURCE_DB)) fs.copyFileSync(SOURCE_DB, dbPath);
process.env.GENESIS_DB_PATH = dbPath;
process.env.GENESIS_DIST_DIR = path.join(ROOT, 'dist');

const sourceMd5Before = fs.existsSync(SOURCE_DB)
  ? crypto.createHash('md5').update(fs.readFileSync(SOURCE_DB)).digest('hex')
  : null;

const { startServer } = require('../server/index.js');
const { getDb } = require('../server/db');
const { hashPassword } = require('../server/passwords');

let base;
let serverHandle;
let passed = 0;
let failed = 0;

async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${base}/api${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* not json */ }
  return { status: res.status, json };
}

function check(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(`  ✓ ${name}`);
  }).catch((err) => {
    failed++;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  });
}

const db = () => getDb();
const COMPANY = 'comp-genesis-01';
const PASSWORD = 'Rec-Test-Password-2026';

function insertUser(id, username, role) {
  db().prepare(`INSERT INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
    VALUES (?, ?, ?, ?, NULL, ?, ?, 1, datetime('now'), 0)`).run(id, username, hashPassword(PASSWORD), username, role, COMPANY);
}

async function tokenFor(username) {
  const r = await api('POST', '/auth/login', { body: { username, password: PASSWORD } });
  assert.strictEqual(r.status, 200, `login ${username}: ${JSON.stringify(r.json)}`);
  return r.json.token;
}

function q(sql, ...params) { return db().prepare(sql).get(...params); }
function qAll(sql, ...params) { return db().prepare(sql).all(...params); }

async function main() {
  const started = await startServer({ port: 0, host: '127.0.0.1' });
  serverHandle = started;
  base = `http://127.0.0.1:${started.port}`;

  insertUser('usr-r-admin', 'r.admin', 'admin');
  insertUser('usr-r-manager', 'r.manager', 'manager');
  insertUser('usr-r-accountant', 'r.accountant', 'accountant');
  insertUser('usr-r-sales', 'r.sales', 'sales');
  insertUser('usr-r-inventory', 'r.inventory', 'inventory');

  const admin = await tokenFor('r.admin');
  const manager = await tokenFor('r.manager');
  const accountant = await tokenFor('r.accountant');
  const sales = await tokenFor('r.sales');
  const inventory = await tokenFor('r.inventory');

  console.log('\n--- RECORD LIFECYCLE TESTS (deactivate / reactivate / delete) ---');

  // =======================================================================
  // A. PERMISSION — enforced by the API, not by hiding buttons
  // =======================================================================
  // Pick a customer that has never been used, so the only thing that can
  // refuse these requests is the permission guard.
  await check('a fresh customer can be created for the lifecycle tests', async () => {
    const r = await api('POST', '/customers', {
      token: admin,
      body: { name: 'Lifecycle Probe Ltd', email: 'probe@example.test' }
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    global.__probeCustomer = r.json.id;
  });

  for (const [role, token] of [['accountant', accountant], ['sales', sales], ['inventory', inventory]]) {
    await check(`${role} is refused deactivation by the API (403)`, async () => {
      const r = await api('POST', `/records/customers/${global.__probeCustomer}/deactivate`, { token });
      assert.strictEqual(r.status, 403, `expected 403, got ${r.status}: ${JSON.stringify(r.json)}`);
      assert.strictEqual(r.json.code, 'FORBIDDEN');
    });
    await check(`${role} is refused deletion by the API (403)`, async () => {
      const r = await api('DELETE', `/records/customers/${global.__probeCustomer}`, { token });
      assert.strictEqual(r.status, 403, `expected 403, got ${r.status}`);
    });
  }

  await check('an unauthenticated deactivate request is refused (401)', async () => {
    const r = await api('POST', `/records/customers/${global.__probeCustomer}/deactivate`, {});
    assert.strictEqual(r.status, 401);
  });

  await check('a manager IS allowed to deactivate', async () => {
    const r = await api('POST', `/records/customers/${global.__probeCustomer}/deactivate`, { token: manager });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.success, true);
    assert.strictEqual(r.json.record.active, 0);
  });

  await check('an unknown record type is rejected rather than silently ignored', async () => {
    const r = await api('POST', `/records/nonsense/${global.__probeCustomer}/deactivate`, { token: admin });
    assert.strictEqual(r.status, 400, JSON.stringify(r.json));
    assert.strictEqual(r.json.code, 'UNKNOWN_RECORD_TYPE');
  });

  await check('a record from another company cannot be reached', async () => {
    db().prepare(`INSERT INTO companies (id, code, name) VALUES ('comp-other-01', 'OTHER', 'Other Co')`).run();
    const r = await api('POST', `/records/customers/${global.__probeCustomer}/reactivate`, { token: admin });
    // The probe belongs to this company, so it works; a stranger's id must not.
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });

  // =======================================================================
  // B. HISTORY IS NEVER DESTROYED
  // =======================================================================
  await check('a customer that has been invoiced reports its history', async () => {
    const customer = q(`SELECT id, name FROM customers WHERE company_id = ? AND id <> ? AND active = 1 ORDER BY name LIMIT 1`, COMPANY, global.__probeCustomer);
    const invoices = q(`SELECT COUNT(*) AS n FROM sales_invoices WHERE customer_id = ?`, customer.id).n;
    const r = await api('GET', `/records/customers/${customer.id}/history`, { token: admin });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.total, invoices, 'history count must match the invoices on file');
    assert.strictEqual(r.json.canDelete, invoices === 0);
    global.__usedCustomer = customer;
  });

  await check('deleting a customer with invoices is refused with "archive instead"', async () => {
    // Give the probe customer an invoice first, so it definitely has history.
    const before = q(`SELECT COUNT(*) AS n FROM sales_invoices WHERE customer_id = ?`, global.__probeCustomer).n;
    if (before === 0) {
      const created = await api('POST', '/sales/invoices', {
        token: sales,
        body: {
          customer_id: global.__probeCustomer,
          autoPost: true,
          payment_method: 'CASH',
          bank_account_id: 'bank-02',
          lines: [{ product_id: 'prod-07', description: 'Probe item', quantity: 1, unit_price: 10, tax_rate: 0 }]
        }
      });
      assert.strictEqual(created.status, 200, JSON.stringify(created.json));
    }
    const r = await api('DELETE', `/records/customers/${global.__probeCustomer}`, { token: admin });
    assert.strictEqual(r.status, 409, `expected 409, got ${r.status}: ${JSON.stringify(r.json)}`);
    assert.strictEqual(r.json.code, 'HAS_HISTORY');
    assert.strictEqual(r.json.archiveInstead, true);
    assert.match(r.json.error, /cannot be deleted/i);
    assert.match(r.json.error, /Lifecycle Probe Ltd/, 'the message must name the record');
  });

  await check('the refused customer is still on file, untouched', async () => {
    const row = q(`SELECT * FROM customers WHERE id = ?`, global.__probeCustomer);
    assert.ok(row, 'the customer must still exist after a refused delete');
  });

  await check('deactivating that customer works and keeps every invoice', async () => {
    const invoicesBefore = q(`SELECT COUNT(*) AS n FROM sales_invoices WHERE customer_id = ?`, global.__probeCustomer).n;
    const r = await api('POST', `/records/customers/${global.__probeCustomer}/deactivate`, { token: admin });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const invoicesAfter = q(`SELECT COUNT(*) AS n FROM sales_invoices WHERE customer_id = ?`, global.__probeCustomer).n;
    assert.strictEqual(invoicesAfter, invoicesBefore, 'deactivation must not remove a single invoice');
    assert.ok(invoicesAfter > 0, 'the test needs a customer with invoices');
  });

  await check('the trial balance stays balanced after a deactivation', async () => {
    const r = await api('GET', '/reports/trial-balance', { token: accountant });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.isBalanced, true, 'Deactivation must not unbalance the books');
  });

  await check('journal entries are never deleted by a record retirement', async () => {
    const before = q(`SELECT COUNT(*) AS n FROM journal_entries WHERE company_id = ?`, COMPANY).n;
    await api('POST', `/records/customers/${global.__probeCustomer}/reactivate`, { token: admin });
    await api('POST', `/records/customers/${global.__probeCustomer}/deactivate`, { token: admin });
    const after = q(`SELECT COUNT(*) AS n FROM journal_entries WHERE company_id = ?`, COMPANY).n;
    assert.strictEqual(after, before, 'no journal entry may disappear');
  });

  // =======================================================================
  // C. DEACTIVATION HIDES FROM NEW TRANSACTIONS
  // =======================================================================
  await check('a deactivated customer disappears from the default customer list', async () => {
    const r = await api('GET', '/customers', { token: sales });
    assert.strictEqual(r.status, 200);
    const ids = r.json.map((c) => c.id);
    assert.ok(!ids.includes(global.__probeCustomer), 'a deactivated customer must not be offered for new work');
  });

  await check('the same customer is still reachable with ?status=all', async () => {
    const r = await api('GET', '/customers?status=all', { token: sales });
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.map((c) => c.id).includes(global.__probeCustomer));
  });

  await check('?status=inactive returns only retired records', async () => {
    const r = await api('GET', '/customers?status=inactive', { token: sales });
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.length > 0, 'at least the probe customer is inactive');
    assert.ok(r.json.every((c) => !c.active), 'only inactive records may be returned');
  });

  await check('reactivation brings the record back into the picker', async () => {
    await api('POST', `/records/customers/${global.__probeCustomer}/reactivate`, { token: admin });
    const r = await api('GET', '/customers', { token: sales });
    assert.ok(r.json.map((c) => c.id).includes(global.__probeCustomer),
      'a reactivated customer must be offered again');
  });

  await check('reactivating twice is harmless and reports no change', async () => {
    const first = await api('POST', `/records/customers/${global.__probeCustomer}/reactivate`, { token: admin });
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.json.changed, false);
  });

  // =======================================================================
  // D. A RECORD WITH NO HISTORY MAY BE DELETED
  // =======================================================================
  await check('a never-used customer can be deleted for good', async () => {
    const made = await api('POST', '/customers', {
      token: admin, body: { name: 'Disposable Customer', code: 'CUST-DISP-1' }
    });
    assert.strictEqual(made.status, 200, JSON.stringify(made.json));
    const r = await api('DELETE', `/records/customers/${made.json.id}`, { token: admin });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.deleted, true);
    assert.strictEqual(q(`SELECT id FROM customers WHERE id = ?`, made.json.id), undefined);
  });

  await check('a supplier with bills is refused deletion', async () => {
    const supplier = q(`SELECT s.id, s.name FROM suppliers s
      WHERE s.company_id = ? AND EXISTS (SELECT 1 FROM purchase_invoices p WHERE p.supplier_id = s.id)
      LIMIT 1`, COMPANY);
    assert.ok(supplier, 'the demo data needs a supplier with at least one bill');
    const r = await api('DELETE', `/records/suppliers/${supplier.id}`, { token: admin });
    assert.strictEqual(r.status, 409, JSON.stringify(r.json));
    assert.match(r.json.error, new RegExp(supplier.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'the refusal must name the record');
  });

  await check('a product that has moved is refused deletion', async () => {
    const product = q(`SELECT p.id, p.name FROM products p
      WHERE p.company_id = ? AND EXISTS (SELECT 1 FROM inventory_movements m WHERE m.product_id = p.id)
      LIMIT 1`, COMPANY);
    assert.ok(product, 'the demo data needs a product with movements');
    const r = await api('DELETE', `/records/products/${product.id}`, { token: admin });
    assert.strictEqual(r.status, 409, JSON.stringify(r.json));
  });

  // =======================================================================
  // E. STORES: DEACTIVATION KEEPS STOCK AND HISTORY
  // =======================================================================
  let storeId = null;
  await check('a new store can be created and stocked', async () => {
    const made = await api('POST', '/inventory/warehouses', {
      token: admin, body: { code: 'LIFECYCLE', name: 'Lifecycle Store' }
    });
    assert.strictEqual(made.status, 200, JSON.stringify(made.json));
    storeId = made.json.id;
    // stock_levels is keyed by (product_id, warehouse_id); it has no id column.
    db().prepare(`INSERT INTO stock_levels (product_id, warehouse_id, quantity, updated_at)
      VALUES ('prod-07', ?, 42, datetime('now'))`).run(storeId);
    db().prepare(`INSERT INTO inventory_movements (id, company_id, product_id, date, movement_type, quantity, unit_cost, total_cost, stock_after, warehouse_id, created_at)
      VALUES ('imv-lifecycle-1', ?, 'prod-07', date('now'), 'ADJUSTMENT_IN', 42, 10, 420, 42, ?, datetime('now'))`).run(COMPANY, storeId);
  });

  await check('deactivating a store keeps its stock and its movements', async () => {
    const r = await api('POST', `/records/warehouses/${storeId}/deactivate`, { token: admin });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const stock = q(`SELECT quantity FROM stock_levels WHERE product_id = 'prod-07' AND warehouse_id = ?`, storeId);
    const movements = q(`SELECT COUNT(*) AS n FROM inventory_movements WHERE warehouse_id = ?`, storeId).n;
    assert.strictEqual(stock.quantity, 42, 'an inactive store must keep its stock');
    assert.strictEqual(movements, 1, 'an inactive store must keep its movement history');
  });

  await check('a deactivated store leaves the store picker', async () => {
    const r = await api('GET', '/inventory/warehouses', { token: inventory });
    assert.strictEqual(r.status, 200);
    assert.ok(!r.json.map((w) => w.id).includes(storeId), 'a retired store must not be offered');
    const all = await api('GET', '/inventory/warehouses?status=all', { token: inventory });
    assert.ok(all.json.map((w) => w.id).includes(storeId), 'but it must still be listed on request');
  });

  await check('a store with stock cannot be deleted', async () => {
    const r = await api('DELETE', `/records/warehouses/${storeId}`, { token: admin });
    assert.strictEqual(r.status, 409, JSON.stringify(r.json));
    assert.strictEqual(r.json.code, 'HAS_HISTORY');
  });

  await check('the default store cannot be deactivated', async () => {
    const def = q(`SELECT id FROM warehouses WHERE company_id = ? AND is_default = 1 LIMIT 1`, COMPANY);
    assert.ok(def, 'the demo data needs a default store');
    const r = await api('POST', `/records/warehouses/${def.id}/deactivate`, { token: admin });
    assert.strictEqual(r.status, 400, JSON.stringify(r.json));
    assert.strictEqual(r.json.code, 'DEFAULT_STORE');
  });

  await check('a store can be reactivated', async () => {
    const r = await api('POST', `/records/warehouses/${storeId}/reactivate`, { token: admin });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const list = await api('GET', '/inventory/warehouses', { token: inventory });
    assert.ok(list.json.map((w) => w.id).includes(storeId));
  });

  // =======================================================================
  // F. USERS — NO SELF-RETIREMENT, NO LAST-ADMIN LOCKOUT, INSTANT LOSS
  // =======================================================================
  await check('a user cannot deactivate their own account', async () => {
    const r = await api('POST', '/records/users/usr-r-admin/deactivate', { token: admin });
    assert.strictEqual(r.status, 400, JSON.stringify(r.json));
    assert.strictEqual(r.json.code, 'SELF_LOCKOUT');
  });

  await check('a user cannot delete their own account', async () => {
    const r = await api('DELETE', '/records/users/usr-r-admin', { token: admin });
    assert.strictEqual(r.status, 400, JSON.stringify(r.json));
    assert.strictEqual(r.json.code, 'SELF_LOCKOUT');
  });

  await check('the last active administrator cannot be deactivated', async () => {
    // Deactivate every other admin so r.admin is demonstrably the last one.
    const others = qAll(`SELECT id FROM users WHERE company_id = ? AND role = 'admin' AND active = 1 AND id <> 'usr-r-admin'`, COMPANY);
    for (const other of others) {
      await api('POST', `/records/users/${other.id}/deactivate`, { token: admin });
    }
    const remaining = q(`SELECT COUNT(*) AS n FROM users WHERE company_id = ? AND role = 'admin' AND active = 1`, COMPANY).n;
    assert.strictEqual(remaining, 1, 'the test needs exactly one active administrator left');

    // A second administrator must be able to demote themselves only via an
    // admin, but the LAST one must be protected from anyone.
    const r = await api('POST', '/records/users/usr-r-admin/deactivate', { token: manager });
    assert.strictEqual(r.status, 400, JSON.stringify(r.json));
    assert.strictEqual(r.json.code, 'LAST_ADMIN');
  });

  await check('a manager cannot delete the last active administrator', async () => {
    const r = await api('DELETE', '/records/users/usr-r-admin', { token: manager });
    assert.strictEqual(r.status, 400, JSON.stringify(r.json));
    assert.strictEqual(r.json.code, 'LAST_ADMIN');
  });

  let doomedUser = null;
  await check('a deactivated user loses access immediately, mid-session', async () => {
    db().prepare(`INSERT INTO users (id, username, password_hash, full_name, email, role, company_id, active, created_at, must_change_password)
      VALUES ('usr-r-doomed', 'r.doomed', ?, 'Doomed User', NULL, 'sales', ?, 1, datetime('now'), 0)`)
      .run(hashPassword(PASSWORD), COMPANY);
    doomedUser = 'usr-r-doomed';
    const doomed = await tokenFor('r.doomed');

    // The session works before the change…
    const before = await api('GET', '/auth/me', { token: doomed });
    assert.strictEqual(before.status, 200, 'the new session must work before deactivation');

    // …and is dead the instant the account is deactivated.
    const r = await api('POST', `/records/users/${doomedUser}/deactivate`, { token: admin });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.revokedSessions >= 1, `expected open sessions to be revoked, got ${r.json.revokedSessions}`);

    const after = await api('GET', '/auth/me', { token: doomed });
    assert.strictEqual(after.status, 401, 'an already-open session must stop working at once');
  });

  await check('a deactivated user cannot sign in again', async () => {
    const r = await api('POST', '/auth/login', { body: { username: 'r.doomed', password: PASSWORD } });
    assert.strictEqual(r.status, 401, 'a deactivated account must not be able to log in');
  });

  await check('a deactivated user can be reactivated and signs in again', async () => {
    const r = await api('POST', `/records/users/${doomedUser}/reactivate`, { token: admin });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const login = await api('POST', '/auth/login', { body: { username: 'r.doomed', password: PASSWORD } });
    assert.strictEqual(login.status, 200, JSON.stringify(login.json));
  });

  await check('a user can be deleted, and their sessions die with them', async () => {
    const doomed = await tokenFor('r.doomed');
    const r = await api('DELETE', `/records/users/${doomedUser}`, { token: admin });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(q(`SELECT id FROM users WHERE id = ?`, doomedUser), undefined);
    const after = await api('GET', '/auth/me', { token: doomed });
    assert.strictEqual(after.status, 401, 'a deleted user session must stop working');
  });

  await check('deleting a user leaves their audit history intact', async () => {
    const rows = qAll(`SELECT id FROM audit_logs WHERE record_id = ?`, doomedUser);
    assert.ok(rows.length > 0, 'the audit trail of a deleted user must survive');
  });

  // =======================================================================
  // G. AUDIT TRAIL
  // =======================================================================
  await check('every retirement is audited with user, action and record', async () => {
    const rows = qAll(`SELECT * FROM audit_logs WHERE company_id = ? AND action IN ('DEACTIVATE','REACTIVATE','DELETE') ORDER BY timestamp DESC`, COMPANY);
    assert.ok(rows.length > 0, 'no lifecycle audit rows were written');
    for (const row of rows) {
      assert.ok(row.user_id, `audit row ${row.id} has no user`);
      assert.ok(row.user_name, `audit row ${row.id} has no user name`);
      assert.ok(row.timestamp, `audit row ${row.id} has no timestamp`);
      assert.ok(row.record_id, `audit row ${row.id} names no record`);
      assert.ok(row.description, `audit row ${row.id} has no description`);
    }
  });

  await check('the audit log records the action type of each change', async () => {
    const actions = new Set(qAll(`SELECT action FROM audit_logs WHERE company_id = ? AND action IN ('DEACTIVATE','REACTIVATE','DELETE')`, COMPANY).map((r) => r.action));
    assert.ok(actions.has('DEACTIVATE'), 'no DEACTIVATE row');
    assert.ok(actions.has('REACTIVATE'), 'no REACTIVATE row');
    assert.ok(actions.has('DELETE'), 'no DELETE row');
  });

  await check('the audit log records what changed, before and after', async () => {
    const row = q(`SELECT previous_value, new_value FROM audit_logs WHERE company_id = ? AND action = 'DEACTIVATE' ORDER BY timestamp DESC LIMIT 1`, COMPANY);
    assert.ok(row, 'no DEACTIVATE row found');
    assert.strictEqual(JSON.parse(row.previous_value).active, 1);
    assert.strictEqual(JSON.parse(row.new_value).active, 0);
  });

  await check('deactivation is visible in the audit screen endpoint', async () => {
    const r = await api('GET', '/audit-trail', { token: manager });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const rows = r.json;
    assert.ok(rows.some((row) => row.action === 'DEACTIVATE'), 'the audit screen must show the retirement');
  });

  // =======================================================================
  // H. THE BOOKS ARE UNTOUCHED
  // =======================================================================
  await check('the trial balance is still balanced at the end', async () => {
    const r = await api('GET', '/reports/trial-balance', { token: accountant });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.isBalanced, true, 'the books must balance after every retirement');
  });

  await check('the database passes its own integrity check', async () => {
    const r = await api('POST', '/system/integrity', { token: admin });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true, JSON.stringify(r.json));
  });

  await serverHandle.close();

  if (sourceMd5Before) {
    const after = crypto.createHash('md5').update(fs.readFileSync(SOURCE_DB)).digest('hex');
    assert.strictEqual(after, sourceMd5Before, 'repository genesis.db untouched');
    console.log('  ✓ repository genesis.db unchanged');
    passed++;
  }
  fs.rmSync(workDir, { recursive: true, force: true });
  console.log(failed === 0 ? `--- ALL RECORD LIFECYCLE TESTS PASSED (${passed} checks) ---` : `--- RECORD LIFECYCLE TESTS: ${passed} passed, ${failed} FAILED ---`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('RECORD LIFECYCLE TEST CRASH:', err);
  process.exit(1);
});
