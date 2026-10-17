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
  },
  {
    version: 2,
    name: 'operations: stores, transfers, goods receipts, cash sessions, multi-currency, count workflow, FIFO layers',
    up(db) {
      // ---------------- new tables (idempotent, additive only) ----------------
      db.exec(`
        CREATE TABLE IF NOT EXISTS warehouses (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL REFERENCES companies(id),
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          address TEXT,
          is_default INTEGER NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(company_id, code)
        );

        CREATE TABLE IF NOT EXISTS stock_levels (
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
          quantity REAL NOT NULL DEFAULT 0,
          updated_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY (product_id, warehouse_id)
        );

        CREATE TABLE IF NOT EXISTS stock_transfers (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL REFERENCES companies(id),
          transfer_number TEXT NOT NULL,
          date TEXT NOT NULL,
          from_warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
          to_warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
          status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT, DISPATCHED, COMPLETED, CANCELLED
          total_quantity REAL NOT NULL DEFAULT 0,
          received_quantity REAL NOT NULL DEFAULT 0,
          notes TEXT,
          dispatched_by TEXT,
          dispatched_at TEXT,
          completed_by TEXT,
          completed_at TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(company_id, transfer_number)
        );

        CREATE TABLE IF NOT EXISTS stock_transfer_lines (
          id TEXT PRIMARY KEY,
          transfer_id TEXT NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
          product_id TEXT NOT NULL REFERENCES products(id),
          quantity REAL NOT NULL,
          received_quantity REAL NOT NULL DEFAULT 0,
          unit_cost REAL NOT NULL DEFAULT 0,
          notes TEXT
        );

        CREATE TABLE IF NOT EXISTS goods_receipts (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL REFERENCES companies(id),
          receipt_number TEXT NOT NULL,
          purchase_order_id TEXT REFERENCES purchase_orders(id),
          supplier_id TEXT NOT NULL REFERENCES suppliers(id),
          warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
          date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT, POSTED
          total_quantity REAL NOT NULL DEFAULT 0,
          total_value REAL NOT NULL DEFAULT 0,
          notes TEXT,
          journal_entry_id TEXT REFERENCES journal_entries(id),
          created_by TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(company_id, receipt_number)
        );

        CREATE TABLE IF NOT EXISTS goods_receipt_lines (
          id TEXT PRIMARY KEY,
          receipt_id TEXT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
          po_line_id TEXT REFERENCES purchase_order_lines(id),
          product_id TEXT NOT NULL REFERENCES products(id),
          quantity_received REAL NOT NULL,
          unit_cost REAL NOT NULL DEFAULT 0,
          line_total REAL NOT NULL DEFAULT 0,
          notes TEXT
        );

        CREATE TABLE IF NOT EXISTS currencies (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL REFERENCES companies(id),
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          symbol TEXT NOT NULL DEFAULT '',
          decimals INTEGER NOT NULL DEFAULT 2,
          is_base INTEGER NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(company_id, code)
        );

        CREATE TABLE IF NOT EXISTS exchange_rates (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL REFERENCES companies(id),
          from_code TEXT NOT NULL,
          to_code TEXT NOT NULL,
          rate REAL NOT NULL,
          effective_date TEXT NOT NULL,
          notes TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(company_id, from_code, to_code, effective_date)
        );

        CREATE TABLE IF NOT EXISTS cash_sessions (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL REFERENCES companies(id),
          session_number TEXT NOT NULL,
          bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
          opened_by TEXT,
          opened_at TEXT,
          opening_amount REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, CLOSED, APPROVED
          closed_by TEXT,
          closed_at TEXT,
          expected_amount REAL,
          counted_amount REAL,
          variance_amount REAL,
          explanation TEXT,
          approved_by TEXT,
          approved_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(company_id, session_number)
        );

        CREATE TABLE IF NOT EXISTS cash_count_lines (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
          count_phase TEXT NOT NULL DEFAULT 'OPENING', -- OPENING, CLOSING
          denomination TEXT NOT NULL,
          unit_value REAL NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 0,
          subtotal REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS fifo_stock_layers (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL REFERENCES companies(id),
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          warehouse_id TEXT REFERENCES warehouses(id),
          quantity_remaining REAL NOT NULL DEFAULT 0,
          unit_cost REAL NOT NULL DEFAULT 0,
          received_date TEXT NOT NULL,
          source_type TEXT NOT NULL DEFAULT 'OPENING', -- OPENING, PURCHASE_INVOICE, GOODS_RECEIPT, SALES_RETURN, COUNT_VARIANCE
          source_id TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_fifo_layers_product ON fifo_stock_layers(company_id, product_id, received_date);
        CREATE INDEX IF NOT EXISTS idx_stock_levels_wh ON stock_levels(warehouse_id);
        CREATE INDEX IF NOT EXISTS idx_transfers_company ON stock_transfers(company_id, status);
        CREATE INDEX IF NOT EXISTS idx_cash_sessions_company ON cash_sessions(company_id, status);
      `);

      // ---------------- additive columns on existing tables ----------------
      addColumn(db, 'companies', 'require_goods_receipt', 'INTEGER NOT NULL DEFAULT 0');
      addColumn(db, 'customers', 'is_walk_in', 'INTEGER NOT NULL DEFAULT 0');
      addColumn(db, 'physical_inventory_counts', 'warehouse_id', 'TEXT REFERENCES warehouses(id)');
      addColumn(db, 'physical_inventory_counts', 'submitted_by', 'TEXT');
      addColumn(db, 'physical_inventory_counts', 'submitted_at', 'TEXT');
      addColumn(db, 'physical_inventory_counts', 'reviewed_by', 'TEXT');
      addColumn(db, 'physical_inventory_counts', 'reviewed_at', 'TEXT');
      addColumn(db, 'physical_inventory_counts', 'approved_by', 'TEXT');
      addColumn(db, 'physical_inventory_counts', 'approved_at', 'TEXT');
      addColumn(db, 'physical_inventory_counts', 'rejection_reason', 'TEXT');
      addColumn(db, 'physical_inventory_lines', 'variance_reason', 'TEXT');
      addColumn(db, 'inventory_movements', 'warehouse_id', 'TEXT REFERENCES warehouses(id)');
      addColumn(db, 'sales_invoices', 'walk_in', 'INTEGER NOT NULL DEFAULT 0');
      addColumn(db, 'sales_invoices', 'warehouse_id', 'TEXT REFERENCES warehouses(id)');
      addColumn(db, 'sales_invoices', 'currency_code', 'TEXT');
      addColumn(db, 'sales_invoices', 'exchange_rate', 'REAL NOT NULL DEFAULT 1');
      addColumn(db, 'sales_invoices', 'foreign_total', 'REAL');
      addColumn(db, 'purchase_invoices', 'goods_receipt_id', 'TEXT REFERENCES goods_receipts(id)');
      addColumn(db, 'purchase_invoices', 'currency_code', 'TEXT');
      addColumn(db, 'purchase_invoices', 'exchange_rate', 'REAL NOT NULL DEFAULT 1');
      addColumn(db, 'purchase_invoices', 'foreign_total', 'REAL');
      addColumn(db, 'purchase_order_lines', 'received_qty', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'payments', 'currency_code', 'TEXT');
      addColumn(db, 'payments', 'exchange_rate', 'REAL NOT NULL DEFAULT 1');
      addColumn(db, 'payments', 'foreign_amount', 'REAL');
      addColumn(db, 'payments', 'status', "TEXT NOT NULL DEFAULT 'POSTED'");
      addColumn(db, 'payments', 'reversal_of_payment_id', 'TEXT');
      addColumn(db, 'payments', 'reversed_by_payment_id', 'TEXT');
      addColumn(db, 'payments', 'credit_note_id', 'TEXT REFERENCES credit_notes(id)');

      // ---------------- safe backfill (never deletes or rewrites business data) ----------------
      const companies = db.prepare('SELECT id, currency_code, currency_symbol, currency_decimals FROM companies').all();
      const insertWarehouse = db.prepare(`
        INSERT OR IGNORE INTO warehouses (id, company_id, code, name, is_default, active, created_at)
        VALUES (?, ?, 'WH-MAIN', 'Main Store', 1, 1, datetime('now'))
      `);
      const insertCurrency = db.prepare(`
        INSERT OR IGNORE INTO currencies (id, company_id, code, name, symbol, decimals, is_base, active)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1)
      `);
      const insertGrni = db.prepare(`
        INSERT OR IGNORE INTO accounts (id, company_id, code, name, type, subtype, normal_balance, is_system, active)
        VALUES (?, ?, '2120', 'Goods Received Not Invoiced (GRNI)', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', 1, 1)
      `);
      const insertWalkIn = db.prepare(`
        INSERT OR IGNORE INTO customers (id, company_id, code, name, is_walk_in, credit_limit, payment_terms, opening_balance, current_balance, active, created_at)
        VALUES (?, ?, 'WALK-IN', 'Walk-in Customer', 1, 0, 'IMMEDIATE', 0, 0, 1, datetime('now'))
      `);
      for (const c of companies) {
        const whId = `wh-main-${c.id}`;
        insertWarehouse.run(whId, c.id);
        insertCurrency.run(
          `cur-${c.id}-${c.currency_code || 'USD'}`, c.id,
          c.currency_code || 'USD', c.currency_code || 'USD',
          c.currency_symbol || '$', c.currency_decimals == null ? 2 : c.currency_decimals
        );
        insertGrni.run(`acc-2120-${c.id}`, c.id);
        insertWalkIn.run(`cust-walkin-${c.id}`, c.id);

        // Per-store stock starts as a mirror of the existing company-wide stock.
        db.prepare(`
          INSERT OR IGNORE INTO stock_levels (product_id, warehouse_id, quantity, updated_at)
          SELECT id, ?, COALESCE(current_stock, 0), datetime('now')
          FROM products WHERE company_id = ?
        `).run(whId, c.id);

        // Existing documents get the default warehouse / base currency where the new
        // columns are still NULL. Historic amounts are never recalculated.
        db.prepare(`UPDATE physical_inventory_counts SET warehouse_id = ? WHERE company_id = ? AND warehouse_id IS NULL`).run(whId, c.id);
        db.prepare(`UPDATE sales_invoices SET warehouse_id = ?, currency_code = ?, exchange_rate = 1 WHERE company_id = ? AND warehouse_id IS NULL`).run(whId, c.currency_code || 'USD', c.id);
        db.prepare(`UPDATE purchase_invoices SET currency_code = ?, exchange_rate = 1 WHERE company_id = ? AND currency_code IS NULL`).run(c.currency_code || 'USD', c.id);
        db.prepare(`UPDATE payments SET currency_code = ?, exchange_rate = 1 WHERE company_id = ? AND currency_code IS NULL`).run(c.currency_code || 'USD', c.id);

        // One opening FIFO layer per product so FIFO costing starts from the current state.
        db.prepare(`
          INSERT OR IGNORE INTO fifo_stock_layers (id, company_id, product_id, warehouse_id, quantity_remaining, unit_cost, received_date, source_type, source_id, created_at)
          SELECT 'fifo-open-' || p.id, p.company_id, p.id, ?, MAX(0, COALESCE(p.current_stock, 0)), COALESCE(p.cost_price, 0), date('now'), 'OPENING', p.id, datetime('now')
          FROM products p WHERE p.company_id = ? AND p.type = 'GOODS'
        `).run(whId, c.id);
      }
    }
  },
  {
    version: 3,
    name: 'fx: settlement gain/loss accounts (4800/5900)',
    up(db) {
      const companies = db.prepare('SELECT id FROM companies').all();
      const insert = db.prepare(`
        INSERT INTO accounts (id, company_id, code, name, type, subtype, normal_balance, is_system, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
      `);
      const has = db.prepare('SELECT id FROM accounts WHERE company_id = ? AND code = ?');
      for (const c of companies) {
        if (!has.get(c.id, '4800')) insert.run(`acc-4800-${c.id}`, c.id, '4800', 'Foreign Exchange Gain', 'REVENUE', 'OTHER_REVENUE', 'CREDIT');
        if (!has.get(c.id, '5900')) insert.run(`acc-5900-${c.id}`, c.id, '5900', 'Foreign Exchange Loss', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT');
      }
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
