const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { runMigrations } = require('./migrations');

// Source archives may contain historical databases. Never silently open one on a
// fresh install. Electron passes its own per-user path explicitly; npm start uses
// the same kind of persistent per-user location unless GENESIS_DB_PATH is set.
const APP_DATA_ROOT = process.platform === 'win32'
  ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  : process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
// A source-run service follows the same old-vs-new selection as the desktop.
// An explicit test/restore path wins and never inspects the user's data folder.
const DB_PATH = process.env.GENESIS_DB_PATH || path.join(
  require('../electron/data-location.cjs').chooseDataDirectory(APP_DATA_ROOT), 'genesis.db');

let db = null;

// Startup trace for the desktop shell (GENESIS_CHILD_LOG). No effect when unset.
function trace(msg) {
  if (!process.env.GENESIS_CHILD_LOG) return;
  try { fs.appendFileSync(process.env.GENESIS_CHILD_LOG, `${new Date().toISOString()} [db] ${msg}\n`); } catch (_) { /* ignore */ }
}

function getDb() {
  if (!db) {
    trace(`mkdir ${path.dirname(DB_PATH)}`);
    if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const wasPresent = DB_PATH !== ':memory:' && fs.existsSync(DB_PATH);
    trace(`open ${DB_PATH}`);
    db = new Database(DB_PATH);
    try {
      // SQLite itself takes a consistent snapshot including committed WAL pages.
      // Fail CLOSED if the source or the copy is unreadable: no schema or business
      // data is changed until this verified pre-start snapshot has succeeded.
      if (wasPresent) verifiedDatabaseCopy(db, 'pre-start');
      trace('opened; setting journal_mode');
      db.pragma('journal_mode = WAL');
      trace('journal_mode set; setting foreign_keys');
      db.pragma('foreign_keys = ON');
      trace('initSchema');
      initSchema(db);
      trace('backupBeforeMigrations');
      backupBeforeMigrations(db);
      trace('runMigrations');
      runMigrations(db);
      trace('seedDefaultData');
      seedDefaultData(db);
      trace('database ready');
    } catch (err) {
      db.close(); db = null;
      throw err;
    }
  }
  return db;
}

/** Take a complete SQLite-consistent, integrity-checked snapshot. VACUUM INTO is
 * synchronous (getDb must finish before it serves any requests) and reads committed
 * WAL transactions as a single snapshot, even when another connection writes.
 * Never overwrite an existing backup; on verification failure keep the live DB. */
function verifiedDatabaseCopy(database, label) {
  if (DB_PATH === ':memory:' || !fs.existsSync(DB_PATH)) return null;
  const dir = path.join(path.dirname(DB_PATH), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${label}-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${require('crypto').randomBytes(4).toString('hex')}.db`);
  try {
    database.prepare('VACUUM INTO ?').run(target);
    const backup = new Database(target, { readonly: true, fileMustExist: true });
    try {
      if (!fs.statSync(target).size || backup.pragma('integrity_check', { simple: true }) !== 'ok') {
        throw new Error('SQLite safety copy failed integrity verification.');
      }
    } finally { backup.close(); }
    return target;
  } catch (err) {
    try { fs.unlinkSync(target); } catch (_) { /* no incomplete copy is usable */ }
    throw err;
  }
}

/** Take an additional verified snapshot before each pending schema migration. */
function backupBeforeMigrations(database) {
  const { MIGRATIONS } = require('./migrations');
  if (DB_PATH === ':memory:' || !fs.existsSync(DB_PATH)) return null;
  const applied = new Set(
    database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
      ? database.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
      : []
  );
  const pending = MIGRATIONS.filter((m) => !applied.has(m.version));
  return pending.length ? verifiedDatabaseCopy(database, `pre-migration-v${pending[0].version}`) : null;
}

// Preserve the legacy helper's signature for explicit full-database backup callers.
function backupDatabaseFile(label) {
  return db ? verifiedDatabaseCopy(db, label) : null;
}

function closeDb() {
  if (db) {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) { /* ignore */ }
    db.close();
    db = null;
  }
}

function initSchema(database) {
  database.exec(`
    -- Companies Table
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      legal_name TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      tax_id TEXT,
      country_code TEXT,
      currency_code TEXT DEFAULT 'USD',
      currency_symbol TEXT DEFAULT '$',
      currency_decimals INTEGER DEFAULT 2,
      fiscal_year_start TEXT DEFAULT '01-01',
      fiscal_year_end TEXT DEFAULT '12-31',
      default_language TEXT DEFAULT 'en',
      tax_inclusive_pricing INTEGER DEFAULT 0,
      inventory_valuation_method TEXT DEFAULT 'WEIGHTED_AVERAGE',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Users Table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL, -- admin, accountant, sales, purchases, inventory, manager
      company_id TEXT REFERENCES companies(id),
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Chart of Accounts
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- ASSET, LIABILITY, EQUITY, REVENUE, COGS, EXPENSE
      subtype TEXT,       -- CASH, BANK, ACCOUNTS_RECEIVABLE, INVENTORY, CURRENT_ASSET, FIXED_ASSET, ACCOUNTS_PAYABLE, TAX_PAYABLE, etc.
      normal_balance TEXT NOT NULL, -- DEBIT, CREDIT
      parent_id TEXT REFERENCES accounts(id),
      is_system INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      notes TEXT,
      UNIQUE(company_id, code)
    );

    -- Tax Rates
    CREATE TABLE IF NOT EXISTS tax_rates (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      rate REAL NOT NULL,
      is_inclusive INTEGER DEFAULT 0,
      sales_tax_account_id TEXT REFERENCES accounts(id),
      purchase_tax_account_id TEXT REFERENCES accounts(id),
      active INTEGER DEFAULT 1,
      UNIQUE(company_id, code)
    );

    -- Cash & Bank Accounts
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      account_type TEXT NOT NULL, -- BANK, CASH, MOBILE_MONEY
      currency TEXT NOT NULL,
      current_balance REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      notes TEXT
    );

    -- Customers
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      contact_person TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      country TEXT,
      default_currency TEXT,
      tax_id TEXT,
      credit_limit REAL DEFAULT 0,
      payment_terms TEXT DEFAULT 'NET_30',
      opening_balance REAL DEFAULT 0,
      current_balance REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, code)
    );

    -- Suppliers
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      contact_person TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      country TEXT,
      default_currency TEXT,
      tax_id TEXT,
      lead_time_days INTEGER DEFAULT 0,
      rating INTEGER DEFAULT 0,
      payment_terms TEXT DEFAULT 'NET_30',
      opening_balance REAL DEFAULT 0,
      current_balance REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, code)
    );

    -- Products
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      sku TEXT NOT NULL,
      barcode TEXT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'General',
      type TEXT NOT NULL DEFAULT 'GOODS', -- GOODS, SERVICE
      unit TEXT NOT NULL DEFAULT 'pcs',
      cost_price REAL NOT NULL DEFAULT 0,
      selling_price REAL NOT NULL DEFAULT 0,
      tax_rate_id TEXT REFERENCES tax_rates(id),
      min_stock_level REAL DEFAULT 0,
      current_stock REAL DEFAULT 0,
      warehouse_location TEXT DEFAULT 'Main Store',
      sales_account_id TEXT REFERENCES accounts(id),
      cogs_account_id TEXT REFERENCES accounts(id),
      inventory_account_id TEXT REFERENCES accounts(id),
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, sku)
    );

    -- Journal Entries
    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      entry_number TEXT NOT NULL,
      date TEXT NOT NULL,
      reference TEXT,
      description TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'MANUAL',
      source_id TEXT,
      total_debit REAL NOT NULL,
      total_credit REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'POSTED', -- POSTED, REVERSED
      reversed_by_id TEXT REFERENCES journal_entries(id),
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, entry_number)
    );

    -- Journal Entry Lines
    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id TEXT PRIMARY KEY,
      journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      line_number INTEGER NOT NULL,
      description TEXT,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0
    );

    -- Inventory Movements
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      date TEXT NOT NULL,
      movement_type TEXT NOT NULL, -- OPENING, PURCHASE_IN, SALE_OUT, ADJUSTMENT_IN, ADJUSTMENT_OUT, TRANSFER, PHYSICAL_COUNT
      reference_type TEXT,
      reference_id TEXT,
      reference_number TEXT,
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL,
      stock_after REAL NOT NULL,
      notes TEXT,
      user_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Stock Adjustments
    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      adjustment_number TEXT NOT NULL,
      date TEXT NOT NULL,
      reason TEXT NOT NULL, -- DAMAGED, EXPIRED, FOUND, LOSS, INTERNAL_USE, CORRECTION
      status TEXT NOT NULL DEFAULT 'POSTED',
      total_value REAL NOT NULL DEFAULT 0,
      notes TEXT,
      journal_entry_id TEXT REFERENCES journal_entries(id),
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, adjustment_number)
    );

    -- Stock Adjustment Lines
    CREATE TABLE IF NOT EXISTS stock_adjustment_lines (
      id TEXT PRIMARY KEY,
      adjustment_id TEXT NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity_change REAL NOT NULL,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL,
      notes TEXT
    );

    -- Physical Inventory Counts
    CREATE TABLE IF NOT EXISTS physical_inventory_counts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      count_number TEXT NOT NULL,
      date TEXT NOT NULL,
      location TEXT DEFAULT 'Main Store',
      status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT, POSTED
      total_system_qty REAL DEFAULT 0,
      total_counted_qty REAL DEFAULT 0,
      total_variance_qty REAL DEFAULT 0,
      total_variance_value REAL DEFAULT 0,
      journal_entry_id TEXT REFERENCES journal_entries(id),
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, count_number)
    );

    -- Physical Inventory Lines
    CREATE TABLE IF NOT EXISTS physical_inventory_lines (
      id TEXT PRIMARY KEY,
      count_id TEXT NOT NULL REFERENCES physical_inventory_counts(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      system_qty REAL NOT NULL,
      counted_qty REAL NOT NULL,
      variance_qty REAL NOT NULL,
      unit_cost REAL NOT NULL,
      variance_value REAL NOT NULL,
      notes TEXT
    );

    -- Sales Quotes
    CREATE TABLE IF NOT EXISTS sales_quotes (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      quote_number TEXT NOT NULL,
      date TEXT NOT NULL,
      valid_until TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      subtotal REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      discount_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT, ACCEPTED, CONVERTED, REJECTED
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, quote_number)
    );

    CREATE TABLE IF NOT EXISTS sales_quote_lines (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL REFERENCES sales_quotes(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id),
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      discount_percent REAL DEFAULT 0,
      tax_rate_id TEXT REFERENCES tax_rates(id),
      tax_rate REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      line_total REAL NOT NULL
    );

    -- Sales Orders
    CREATE TABLE IF NOT EXISTS sales_orders (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      order_number TEXT NOT NULL,
      date TEXT NOT NULL,
      expected_delivery TEXT,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      quote_id TEXT REFERENCES sales_quotes(id),
      subtotal REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      discount_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, CONFIRMED, CONVERTED, CANCELLED
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, order_number)
    );

    CREATE TABLE IF NOT EXISTS sales_order_lines (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id),
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      discount_percent REAL DEFAULT 0,
      tax_rate_id TEXT REFERENCES tax_rates(id),
      tax_rate REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      line_total REAL NOT NULL
    );

    -- Sales Invoices
    CREATE TABLE IF NOT EXISTS sales_invoices (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      invoice_number TEXT NOT NULL,
      date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      order_id TEXT REFERENCES sales_orders(id),
      subtotal REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      discount_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      balance_due REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT, POSTED, PAID, PARTIALLY_PAID, CANCELLED
      payment_terms TEXT,
      journal_entry_id TEXT REFERENCES journal_entries(id),
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, invoice_number)
    );

    CREATE TABLE IF NOT EXISTS sales_invoice_lines (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id),
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      discount_percent REAL NOT NULL DEFAULT 0,
      tax_rate_id TEXT REFERENCES tax_rates(id),
      tax_rate REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL
    );

    -- Credit Notes
    CREATE TABLE IF NOT EXISTS credit_notes (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      credit_note_number TEXT NOT NULL,
      invoice_id TEXT REFERENCES sales_invoices(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      date TEXT NOT NULL,
      reason TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      restock_items INTEGER DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'POSTED',
      journal_entry_id TEXT REFERENCES journal_entries(id),
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, credit_note_number)
    );

    CREATE TABLE IF NOT EXISTS credit_note_lines (
      id TEXT PRIMARY KEY,
      credit_note_id TEXT NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id),
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      unit_cost REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      line_total REAL NOT NULL
    );

    -- Purchase Orders
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      po_number TEXT NOT NULL,
      date TEXT NOT NULL,
      expected_date TEXT,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      subtotal REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, CONFIRMED, RECEIVED, CONVERTED, CANCELLED
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, po_number)
    );

    CREATE TABLE IF NOT EXISTS purchase_order_lines (
      id TEXT PRIMARY KEY,
      po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id),
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL,
      tax_rate_id TEXT REFERENCES tax_rates(id),
      tax_rate REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      line_total REAL NOT NULL
    );

    -- Purchase Invoices (Bills)
    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      bill_number TEXT NOT NULL,
      vendor_invoice_number TEXT,
      date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      po_id TEXT REFERENCES purchase_orders(id),
      subtotal REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      balance_due REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT, POSTED, PAID, PARTIALLY_PAID, CANCELLED
      journal_entry_id TEXT REFERENCES journal_entries(id),
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, bill_number)
    );

    CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
      id TEXT PRIMARY KEY,
      bill_id TEXT NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id),
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL,
      tax_rate_id TEXT REFERENCES tax_rates(id),
      tax_rate REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      line_total REAL NOT NULL
    );

    -- Purchase Returns
    CREATE TABLE IF NOT EXISTS purchase_returns (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      return_number TEXT NOT NULL,
      bill_id TEXT REFERENCES purchase_invoices(id),
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      date TEXT NOT NULL,
      reason TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'POSTED',
      journal_entry_id TEXT REFERENCES journal_entries(id),
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, return_number)
    );

    CREATE TABLE IF NOT EXISTS purchase_return_lines (
      id TEXT PRIMARY KEY,
      return_id TEXT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id),
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL,
      tax_rate REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      line_total REAL NOT NULL
    );

    -- Payments (Cash / Bank / Mobile Money)
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      payment_number TEXT NOT NULL,
      date TEXT NOT NULL,
      payment_type TEXT NOT NULL, -- CUSTOMER_RECEIPT, SUPPLIER_PAYMENT, DIRECT_EXPENSE, DIRECT_INCOME, TRANSFER
      payment_method TEXT NOT NULL, -- CASH, BANK_TRANSFER, MOBILE_MONEY, CHECK, CARD
      bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
      to_bank_account_id TEXT REFERENCES bank_accounts(id),
      customer_id TEXT REFERENCES customers(id),
      supplier_id TEXT REFERENCES suppliers(id),
      sales_invoice_id TEXT REFERENCES sales_invoices(id),
      purchase_invoice_id TEXT REFERENCES purchase_invoices(id),
      expense_account_id TEXT REFERENCES accounts(id),
      income_account_id TEXT REFERENCES accounts(id),
      amount REAL NOT NULL,
      reference TEXT,
      notes TEXT,
      journal_entry_id TEXT REFERENCES journal_entries(id),
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, payment_number)
    );

    -- Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      company_id TEXT,
      user_id TEXT,
      user_name TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      record_id TEXT,
      description TEXT NOT NULL,
      previous_value TEXT,
      new_value TEXT
    );

    -- Indexes for high-speed queries
    CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(company_id, date);
    CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_entry_lines(account_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer ON sales_invoices(company_id, customer_id);
    CREATE INDEX IF NOT EXISTS idx_bills_supplier ON purchase_invoices(company_id, supplier_id);
    CREATE INDEX IF NOT EXISTS idx_movements_product ON inventory_movements(company_id, product_id, date);
    CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(company_id, date);
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(company_id, timestamp);
  `);
}

function seedDefaultData(database) {
  const companyCount = database.prepare('SELECT COUNT(*) as count FROM companies').get().count;
  if (companyCount > 0) return;

  const now = new Date().toISOString();
  const companyId = 'comp-genesis-01';

  // 1. Create the initial empty company. The administrator names it during setup.
  database.prepare(`
    INSERT INTO companies (
      id, code, name, legal_name, address, phone, email, tax_id,
      currency_code, currency_symbol, currency_decimals, fiscal_year_start, fiscal_year_end,
      default_language, tax_inclusive_pricing, inventory_valuation_method, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `).run(
    companyId,
    'GEN-001',
    'New Company',
    'New Company',
    null,
    null,
    null,
    null,
    'USD', '$', 2, '01-01', '12-31',
    'en', 0, 'WEIGHTED_AVERAGE', now, now
  );

  // No login accounts are ever seeded, even in development.

  // 3. Default Chart of Accounts
  const defaultAccounts = [
    // Assets (1000 - 1999)
    { id: 'acc-1010', code: '1010', name: 'Cash on Hand (Petty Cash)', type: 'ASSET', subtype: 'CASH', normal: 'DEBIT', is_system: 1 },
    { id: 'acc-1020', code: '1020', name: 'Bank Current Account (Main)', type: 'ASSET', subtype: 'BANK', normal: 'DEBIT', is_system: 1 },
    { id: 'acc-1030', code: '1030', name: 'Mobile Money Account (MoMo)', type: 'ASSET', subtype: 'BANK', normal: 'DEBIT', is_system: 1 },
    { id: 'acc-1100', code: '1100', name: 'Accounts Receivable (Trade Debtors)', type: 'ASSET', subtype: 'ACCOUNTS_RECEIVABLE', normal: 'DEBIT', is_system: 1 },
    { id: 'acc-1150', code: '1150', name: 'VAT Input Tax (Tax Receivable)', type: 'ASSET', subtype: 'CURRENT_ASSET', normal: 'DEBIT', is_system: 1 },
    { id: 'acc-1200', code: '1200', name: 'Merchandise Inventory', type: 'ASSET', subtype: 'INVENTORY', normal: 'DEBIT', is_system: 1 },
    { id: 'acc-1500', code: '1500', name: 'Office Furniture & Fixtures', type: 'ASSET', subtype: 'FIXED_ASSET', normal: 'DEBIT', is_system: 0 },
    { id: 'acc-1510', code: '1510', name: 'Computer & IT Equipment', type: 'ASSET', subtype: 'FIXED_ASSET', normal: 'DEBIT', is_system: 0 },
    { id: 'acc-1590', code: '1590', name: 'Accumulated Depreciation', type: 'ASSET', subtype: 'FIXED_ASSET', normal: 'CREDIT', is_system: 0 },

    // Liabilities (2000 - 2999)
    { id: 'acc-2010', code: '2010', name: 'Accounts Payable (Trade Creditors)', type: 'LIABILITY', subtype: 'ACCOUNTS_PAYABLE', normal: 'CREDIT', is_system: 1 },
    { id: 'acc-2110', code: '2110', name: 'VAT Output Tax (Tax Payable)', type: 'LIABILITY', subtype: 'TAX_PAYABLE', normal: 'CREDIT', is_system: 1 },
    { id: 'acc-2200', code: '2200', name: 'Accrued Salaries Payable', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normal: 'CREDIT', is_system: 0 },
    { id: 'acc-2500', code: '2500', name: 'Bank Business Loan', type: 'LIABILITY', subtype: 'LONG_TERM_LIABILITY', normal: 'CREDIT', is_system: 0 },

    // Equity (3000 - 3999)
    { id: 'acc-3010', code: '3010', name: "Owner's Capital", type: 'EQUITY', subtype: 'EQUITY', normal: 'CREDIT', is_system: 1 },
    { id: 'acc-3020', code: '3020', name: "Owner's Drawings", type: 'EQUITY', subtype: 'EQUITY', normal: 'DEBIT', is_system: 0 },
    { id: 'acc-3900', code: '3900', name: 'Retained Earnings', type: 'EQUITY', subtype: 'EQUITY', normal: 'CREDIT', is_system: 1 },

    // Revenue (4000 - 4999)
    { id: 'acc-4010', code: '4010', name: 'Sales Revenue - Products', type: 'REVENUE', subtype: 'OPERATING_REVENUE', normal: 'CREDIT', is_system: 1 },
    { id: 'acc-4020', code: '4020', name: 'Service & Consulting Revenue', type: 'REVENUE', subtype: 'OPERATING_REVENUE', normal: 'CREDIT', is_system: 1 },
    { id: 'acc-4090', code: '4090', name: 'Sales Discounts & Allowances', type: 'REVENUE', subtype: 'OPERATING_REVENUE', normal: 'DEBIT', is_system: 1 },
    { id: 'acc-4500', code: '4500', name: 'Other Income & Interest', type: 'REVENUE', subtype: 'OTHER_REVENUE', normal: 'CREDIT', is_system: 0 },

    // COGS (5000 - 5999)
    { id: 'acc-5010', code: '5010', name: 'Cost of Goods Sold - Products', type: 'COGS', subtype: 'COGS', normal: 'DEBIT', is_system: 1 },
    { id: 'acc-5020', code: '5020', name: 'Inventory Shrinkage & Loss', type: 'COGS', subtype: 'COGS', normal: 'DEBIT', is_system: 1 },

    // Expenses (6000 - 6999)
    { id: 'acc-6010', code: '6010', name: 'Staff Salaries & Benefits', type: 'EXPENSE', subtype: 'OPERATING_EXPENSE', normal: 'DEBIT', is_system: 0 },
    { id: 'acc-6020', code: '6020', name: 'Office Rent Expense', type: 'EXPENSE', subtype: 'OPERATING_EXPENSE', normal: 'DEBIT', is_system: 0 },
    { id: 'acc-6030', code: '6030', name: 'Electricity & Water Utilities', type: 'EXPENSE', subtype: 'OPERATING_EXPENSE', normal: 'DEBIT', is_system: 0 },
    { id: 'acc-6040', code: '6040', name: 'Internet & Communications', type: 'EXPENSE', subtype: 'OPERATING_EXPENSE', normal: 'DEBIT', is_system: 0 },
    { id: 'acc-6050', code: '6050', name: 'Marketing & Advertising', type: 'EXPENSE', subtype: 'OPERATING_EXPENSE', normal: 'DEBIT', is_system: 0 },
    { id: 'acc-6060', code: '6060', name: 'Office Supplies & Stationery', type: 'EXPENSE', subtype: 'ADMIN_EXPENSE', normal: 'DEBIT', is_system: 0 },
    { id: 'acc-6070', code: '6070', name: 'Bank Charges & Payment Fees', type: 'EXPENSE', subtype: 'ADMIN_EXPENSE', normal: 'DEBIT', is_system: 0 },
    { id: 'acc-6080', code: '6080', name: 'Repairs & Maintenance', type: 'EXPENSE', subtype: 'OPERATING_EXPENSE', normal: 'DEBIT', is_system: 0 },
    { id: 'acc-6090', code: '6090', name: 'Depreciation Expense', type: 'EXPENSE', subtype: 'ADMIN_EXPENSE', normal: 'DEBIT', is_system: 0 }
  ];

  const insertAccount = database.prepare(`
    INSERT INTO accounts (id, company_id, code, name, type, subtype, normal_balance, is_system, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  for (const acc of defaultAccounts) {
    insertAccount.run(acc.id, companyId, acc.code, acc.name, acc.type, acc.subtype, acc.normal, acc.is_system);
  }

  // 4. Default Taxes
  const taxRates = [
    { id: 'tax-vat-18', code: 'VAT18', name: 'Standard VAT 18%', rate: 18.0, sales: 'acc-2110', purchase: 'acc-1150' },
    { id: 'tax-vat-0', code: 'ZERO', name: 'Zero-Rated / Exempt (0%)', rate: 0.0, sales: 'acc-2110', purchase: 'acc-1150' },
    { id: 'tax-vat-10', code: 'RED10', name: 'Reduced VAT 10%', rate: 10.0, sales: 'acc-2110', purchase: 'acc-1150' }
  ];

  const insertTax = database.prepare(`
    INSERT INTO tax_rates (id, company_id, code, name, rate, sales_tax_account_id, purchase_tax_account_id, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  for (const t of taxRates) {
    insertTax.run(t.id, companyId, t.code, t.name, t.rate, t.sales, t.purchase);
  }

  // 5. Default Bank & Cash Accounts
  const bankAccounts = [
    { id: 'bank-01', account_id: 'acc-1020', name: 'Main Bank Account', num: 'BANK-MAIN', type: 'BANK', curr: 'USD', bal: 0 },
    { id: 'bank-02', account_id: 'acc-1010', name: 'Cash Register', num: 'CASH-MAIN', type: 'CASH', curr: 'USD', bal: 0 },
    { id: 'bank-03', account_id: 'acc-1030', name: 'Mobile Money Account', num: 'MOBILE-MAIN', type: 'MOBILE_MONEY', curr: 'USD', bal: 0 }
  ];

  const insertBank = database.prepare(`
    INSERT INTO bank_accounts (id, company_id, account_id, bank_name, account_number, account_type, currency, current_balance, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  for (const b of bankAccounts) {
    insertBank.run(b.id, companyId, b.account_id, b.name, b.num, b.type, b.curr, b.bal);
  }

}

module.exports = {
  getDb,
  closeDb,
  backupDatabaseFile,
  DB_PATH
};
