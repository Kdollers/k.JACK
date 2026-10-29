'use strict';
/**
 * MIGRATION v2 SAFETY TESTS
 *
 * Proves the inventory/cash/fx migration (a) never alters existing business
 * records on a legacy database copy, (b) is additive and idempotent,
 * (c) backfills warehouses/currencies/walk-in customer/stock levels/FIFO
 * opening layers correctly, and (d) seeds a fresh installation with the same
 * structural defaults and no demo data.
 *
 * Parent process: spawns one child per scenario (server/db.js captures
 * GENESIS_DB_PATH at require time) and verifies the repository genesis.db is
 * never written to (md5 before/after).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'genesis.db');
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

if (!process.argv[2]) {
  // ---- parent ----
  const before = fs.existsSync(SOURCE_DB) ? md5(SOURCE_DB) : null;
  let failed = 0;
  for (const scenario of ['legacy', 'fresh']) {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, [__filename, scenario], { encoding: 'utf8', timeout: 240000 });
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    if (r.status !== 0) failed++;
  }
  if (before) {
    const assert = require('assert');
    assert.strictEqual(md5(SOURCE_DB), before, 'repository genesis.db must not be modified by tests');
    console.log('  ✓ repository genesis.db unchanged');
  }
  console.log(failed === 0 ? '--- ALL MIGRATION TESTS PASSED ---' : `--- ${failed} MIGRATION SCENARIO(S) FAILED ---`);
  process.exit(failed === 0 ? 0 : 1);
}

// ---- child ----
const assert = require('assert');
const os = require('os');
const scenario = process.argv[2];

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `genesis-mig-${scenario}-`));
const dbPath = path.join(workDir, 'genesis.db');

if (scenario === 'legacy') {
  fs.copyFileSync(SOURCE_DB, dbPath);
  const Database = require('better-sqlite3');
  const pre = new Database(dbPath, { readonly: true });
  const preTables = pre.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name);
  const preCounts = {};
  for (const t of preTables) preCounts[t] = pre.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
  const preCompanyCount = pre.prepare('SELECT COUNT(*) AS n FROM companies').get().n;
  const preCustomerRows = pre.prepare('SELECT id, code, name, current_balance, credit_limit FROM customers').all();
  const preProductRows = pre.prepare('SELECT id, sku, name, current_stock, cost_price FROM products').all();
  const preJeCount = pre.prepare('SELECT COUNT(*) AS n FROM journal_entries').get().n;
  const preJeLines = pre.prepare('SELECT journal_entry_id, account_id, debit, credit FROM journal_entry_lines ORDER BY journal_entry_id, id').all();
  const preInvoiceRows = pre.prepare('SELECT id, invoice_number, customer_id, total, balance_due, status FROM sales_invoices').all();
  pre.close();

  process.env.GENESIS_DB_PATH = dbPath;
  const { getDb, closeDb } = require('../server/db');
  const db = getDb();

  console.log('--- MIGRATION v2 TESTS (scenario: legacy copy) ---');

  check('a pre-migration backup is taken automatically', () => {
    const backups = fs.readdirSync(path.join(workDir, 'backups')).filter((f) => f.startsWith('pre-migration'));
    assert.ok(backups.length >= 1, 'expected a pre-migration-* backup file next to the database');
  });

  check('migration versions 1 and 2 are recorded exactly once', () => {
    const applied = db.prepare('SELECT version, COUNT(*) AS n FROM schema_migrations GROUP BY version').all();
    const map = Object.fromEntries(applied.map((r) => [r.version, r.n]));
    assert.strictEqual(map[1], 1);
    assert.strictEqual(map[2], 1);
  });

  check('every pre-existing table keeps its exact row count (except documented system additions)', () => {
    for (const t of preTables) {
      const now = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
      if (t === 'customers') {
        assert.strictEqual(now, preCounts[t] + preCompanyCount, `${t}: +1 walk-in placeholder per company only`);
      } else if (t === 'accounts') {
        assert.ok(now >= preCounts[t], `${t}: GRNI account may be added`);
      } else if (t === 'schema_migrations') {
        assert.ok(now >= preCounts[t], `${t}: migration bookkeeping`);
      } else {
        assert.strictEqual(now, preCounts[t], `${t} row count preserved`);
      }
    }
  });

  check('business records keep identity, balances and amounts byte-for-byte', () => {
    for (const c of preCustomerRows) {
      const row = db.prepare('SELECT code, name, current_balance, credit_limit FROM customers WHERE id = ?').get(c.id);
      assert.ok(row, `customer ${c.id} still exists`);
      assert.deepStrictEqual(row, { code: c.code, name: c.name, current_balance: c.current_balance, credit_limit: c.credit_limit });
    }
    for (const p of preProductRows) {
      const row = db.prepare('SELECT sku, name, current_stock, cost_price FROM products WHERE id = ?').get(p.id);
      assert.deepStrictEqual(row, { sku: p.sku, name: p.name, current_stock: p.current_stock, cost_price: p.cost_price }, `product ${p.id} unchanged`);
    }
    for (const i of preInvoiceRows) {
      const row = db.prepare('SELECT invoice_number, customer_id, total, balance_due, status FROM sales_invoices WHERE id = ?').get(i.id);
      assert.deepStrictEqual(row, { invoice_number: i.invoice_number, customer_id: i.customer_id, total: i.total, balance_due: i.balance_due, status: i.status }, `invoice ${i.id} unchanged`);
    }
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM journal_entries').get().n, preJeCount, 'no journal entries added or removed');
    const jeLines = db.prepare('SELECT journal_entry_id, account_id, debit, credit FROM journal_entry_lines ORDER BY journal_entry_id, id').all();
    assert.deepStrictEqual(jeLines, preJeLines, 'every journal line identical');
  });

  check('new tables exist and structural defaults were backfilled per company', () => {
    for (const t of ['warehouses', 'stock_levels', 'stock_transfers', 'stock_transfer_lines', 'goods_receipts', 'goods_receipt_lines', 'currencies', 'exchange_rates', 'cash_sessions', 'cash_count_lines', 'fifo_stock_layers']) {
      const found = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(t);
      assert.ok(found, `table ${t} created`);
    }
    const companies = db.prepare('SELECT id, currency_code FROM companies').all();
    for (const c of companies) {
      const wh = db.prepare(`SELECT * FROM warehouses WHERE company_id = ?`).all(c.id);
      assert.ok(wh.length >= 1 && wh.some((w) => w.is_default === 1), 'default warehouse backfilled');
      const cur = db.prepare(`SELECT * FROM currencies WHERE company_id = ? AND code = ?`).get(c.id, c.currency_code);
      assert.ok(cur && cur.is_base === 1, 'base currency registered');
      const walkIn = db.prepare(`SELECT * FROM customers WHERE company_id = ? AND is_walk_in = 1`).all(c.id);
      assert.strictEqual(walkIn.length, 1, 'exactly one walk-in customer per company');
      const grni = db.prepare(`SELECT * FROM accounts WHERE company_id = ? AND code = '2120'`).get(c.id);
      assert.ok(grni, 'GRNI clearing account 2120 exists');
    }
  });

  check('stock_levels backfill mirrors product stock exactly (nothing created or lost)', () => {
    const diff = db.prepare(`
      SELECT p.id, p.current_stock,
        (SELECT COALESCE(SUM(sl.quantity), 0) FROM stock_levels sl JOIN warehouses w ON w.id = sl.warehouse_id WHERE sl.product_id = p.id) AS level_sum
      FROM products p
    `).all();
    for (const d of diff) {
      assert.ok(Math.abs((d.current_stock || 0) - (d.level_sum || 0)) < 0.0001, `product ${d.id}: levels ${d.level_sum} must equal stock ${d.current_stock}`);
    }
    const fifoRows = db.prepare(`
      SELECT f.product_id, SUM(f.quantity_remaining) AS fifo_sum, p.current_stock
      FROM fifo_stock_layers f JOIN products p ON p.id = f.product_id
      WHERE f.quantity_remaining > 0 GROUP BY f.product_id
    `).all();
    for (const f of fifoRows) {
      assert.ok(Math.abs(f.fifo_sum - f.current_stock) < 0.0001, `FIFO opening layer for ${f.product_id} equals current stock`);
    }
  });

  check('migrations are idempotent: reopening the database changes nothing', () => {
    const countsBefore = {};
    for (const t of preTables.concat(['warehouses', 'stock_levels', 'currencies', 'fifo_stock_layers'])) {
      countsBefore[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
    }
    closeDb();
    const db2 = getDb();
    for (const t of Object.keys(countsBefore)) {
      assert.strictEqual(db2.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n, countsBefore[t], `${t} stable after re-open`);
    }
    const applied = db2.prepare('SELECT version, COUNT(*) AS n FROM schema_migrations GROUP BY version').all();
    const map = Object.fromEntries(applied.map((r) => [r.version, r.n]));
    assert.strictEqual(map[2], 1, 'version 2 applied exactly once');
    closeDb();
  });
} else {
  process.env.GENESIS_DB_PATH = dbPath;
  delete process.env.GENESIS_SEED_DEMO;
  const { getDb, closeDb } = require('../server/db');
  const fresh = getDb();

  console.log('--- MIGRATION v2 TESTS (scenario: fresh production install) ---');

  check('a fresh (non-demo) database seeds company defaults without demo data', () => {
    const company = fresh.prepare('SELECT * FROM companies').get();
    assert.ok(company, 'the structural company shell is created (the setup wizard renames it)');
    assert.strictEqual(company.name, 'New Company');
    assert.strictEqual(fresh.prepare(`SELECT COUNT(*) AS n FROM users`).get().n, 0, 'no users exist before setup');
    assert.strictEqual(fresh.prepare(`SELECT COUNT(*) AS n FROM products`).get().n, 0, 'no demo products on a production install');
    assert.strictEqual(fresh.prepare(`SELECT COUNT(*) AS n FROM sales_invoices`).get().n, 0, 'no demo transactions');
    const wh = fresh.prepare('SELECT * FROM warehouses WHERE company_id = ?').all(company.id);
    assert.strictEqual(wh.length, 1, 'default store created');
    assert.strictEqual(wh[0].is_default, 1);
    const cur = fresh.prepare('SELECT * FROM currencies WHERE company_id = ?').get(company.id);
    assert.ok(cur && cur.is_base === 1 && cur.code === company.currency_code, 'base currency registered');
    const walkIn = fresh.prepare('SELECT * FROM customers WHERE company_id = ? AND is_walk_in = 1').all(company.id);
    assert.strictEqual(walkIn.length, 1, 'anonymous walk-in customer exists on fresh installs');
    const grni = fresh.prepare(`SELECT * FROM accounts WHERE company_id = ? AND code = '2120'`).get(company.id);
    assert.ok(grni, 'GRNI clearing account seeded on fresh installs');
    const phantom = fresh.prepare('SELECT COUNT(*) AS n FROM bank_accounts WHERE current_balance != 0').get().n;
    assert.strictEqual(phantom, 0, 'a production install starts with zero bank balances');
  });

  check('schema_migrations records both versions on a fresh database', () => {
    const applied = fresh.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((r) => r.version);
    assert.ok(applied.includes(1) && applied.includes(2));
    closeDb();
  });
}

fs.rmSync(workDir, { recursive: true, force: true });
console.log(failed === 0 ? `--- migration scenario '${scenario}': ${passed} passed, 0 failed ---` : `--- migration scenario '${scenario}': ${passed} passed, ${failed} FAILED ---`);
process.exit(failed === 0 ? 0 : 1);
