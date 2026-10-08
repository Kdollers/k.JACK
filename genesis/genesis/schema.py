"""Relational schema for one company database.

Every accounting-relevant table has foreign keys, CHECK constraints and
unique indexes. Triggers make posted journal entries, posted documents,
stock movements, payments and the audit log append-only.
"""

SCHEMA_V1 = """
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE sequences (
    name TEXT PRIMARY KEY,
    prefix TEXT NOT NULL,
    next_value INTEGER NOT NULL CHECK (next_value > 0)
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE
        CHECK (length(username) BETWEEN 3 AND 40),
    full_name TEXT NOT NULL CHECK (length(trim(full_name)) > 0),
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN (
        'administrator', 'accountant', 'sales', 'purchases', 'inventory', 'manager')),
    language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'fr', 'rw')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
);

CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE CHECK (length(code) BETWEEN 2 AND 20),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    account_type TEXT NOT NULL CHECK (account_type IN (
        'asset', 'liability', 'equity', 'revenue', 'cogs', 'expense')),
    parent_id INTEGER REFERENCES accounts(id),
    is_header INTEGER NOT NULL DEFAULT 0 CHECK (is_header IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    system_role TEXT UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_accounts_parent ON accounts(parent_id);

CREATE TABLE tax_rates (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    rate_bps INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
    sales_account_id INTEGER REFERENCES accounts(id),
    purchase_account_id INTEGER REFERENCES accounts(id),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    country_code TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE payment_methods (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('cash', 'bank', 'mobile', 'other')),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE warehouses (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    address TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    inventory_account_id INTEGER REFERENCES accounts(id),
    revenue_account_id INTEGER REFERENCES accounts(id),
    cogs_account_id INTEGER REFERENCES accounts(id),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE COLLATE NOCASE,
    barcode TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    unit TEXT NOT NULL DEFAULT 'pcs',
    cost_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (cost_price_minor >= 0),
    selling_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (selling_price_minor >= 0),
    tax_rate_id INTEGER REFERENCES tax_rates(id),
    min_stock_scaled INTEGER NOT NULL DEFAULT 0 CHECK (min_stock_scaled >= 0),
    location TEXT,
    track_stock INTEGER NOT NULL DEFAULT 1 CHECK (track_stock IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_products_category ON products(category_id);

CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    tax_number TEXT,
    opening_balance_minor INTEGER NOT NULL DEFAULT 0,
    credit_limit_minor INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit_minor >= 0),
    payment_terms_days INTEGER NOT NULL DEFAULT 0 CHECK (payment_terms_days BETWEEN 0 AND 365),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    tax_number TEXT,
    opening_balance_minor INTEGER NOT NULL DEFAULT 0,
    payment_terms_days INTEGER NOT NULL DEFAULT 0 CHECK (payment_terms_days BETWEEN 0 AND 365),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE journal_entries (
    id INTEGER PRIMARY KEY,
    entry_no TEXT NOT NULL UNIQUE,
    entry_date TEXT NOT NULL,
    reference TEXT,
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    source_type TEXT,
    source_id INTEGER,
    reversal_of_id INTEGER REFERENCES journal_entries(id),
    total_minor INTEGER NOT NULL CHECK (total_minor > 0),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
);
CREATE INDEX idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX idx_journal_entries_source ON journal_entries(source_type, source_id);
CREATE UNIQUE INDEX idx_journal_entries_reversal ON journal_entries(reversal_of_id)
    WHERE reversal_of_id IS NOT NULL;

CREATE TABLE journal_lines (
    id INTEGER PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
    line_no INTEGER NOT NULL CHECK (line_no > 0),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    party_type TEXT CHECK (party_type IN ('customer', 'supplier')),
    party_id INTEGER,
    description TEXT,
    debit_minor INTEGER NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
    credit_minor INTEGER NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
    CHECK ((debit_minor = 0) <> (credit_minor = 0)),
    CHECK ((party_type IS NULL) = (party_id IS NULL)),
    UNIQUE (entry_id, line_no)
);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX idx_journal_lines_party ON journal_lines(party_type, party_id);

CREATE TABLE documents (
    id INTEGER PRIMARY KEY,
    doc_type TEXT NOT NULL CHECK (doc_type IN (
        'sales_quote', 'sales_order', 'sales_invoice', 'sales_credit',
        'purchase_order', 'purchase_invoice', 'purchase_return')),
    number TEXT NOT NULL UNIQUE,
    doc_date TEXT NOT NULL,
    due_date TEXT,
    customer_id INTEGER REFERENCES customers(id),
    supplier_id INTEGER REFERENCES suppliers(id),
    warehouse_id INTEGER REFERENCES warehouses(id),
    status TEXT NOT NULL CHECK (status IN ('draft', 'confirmed', 'posted', 'closed', 'cancelled')),
    reference TEXT,
    notes TEXT,
    subtotal_minor INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
    tax_minor INTEGER NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
    total_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
    payment_method_id INTEGER REFERENCES payment_methods(id),
    restock INTEGER NOT NULL DEFAULT 0 CHECK (restock IN (0, 1)),
    source_id INTEGER REFERENCES documents(id),
    journal_entry_id INTEGER REFERENCES journal_entries(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    posted_by INTEGER REFERENCES users(id),
    posted_at TEXT,
    CHECK (
        (doc_type LIKE 'sales_%' AND customer_id IS NOT NULL AND supplier_id IS NULL)
        OR (doc_type LIKE 'purchase_%' AND supplier_id IS NOT NULL AND customer_id IS NULL)
    ),
    CHECK (status <> 'posted' OR journal_entry_id IS NOT NULL
           OR doc_type IN ('sales_quote', 'sales_order', 'purchase_order'))
);
CREATE INDEX idx_documents_type_status ON documents(doc_type, status, doc_date);
CREATE INDEX idx_documents_customer ON documents(customer_id);
CREATE INDEX idx_documents_supplier ON documents(supplier_id);
CREATE INDEX idx_documents_source ON documents(source_id);

CREATE TABLE document_lines (
    id INTEGER PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id),
    line_no INTEGER NOT NULL CHECK (line_no > 0),
    product_id INTEGER REFERENCES products(id),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    quantity_scaled INTEGER NOT NULL CHECK (quantity_scaled > 0),
    unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
    discount_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_bps BETWEEN 0 AND 10000),
    tax_rate_id INTEGER REFERENCES tax_rates(id),
    tax_bps INTEGER NOT NULL DEFAULT 0 CHECK (tax_bps BETWEEN 0 AND 10000),
    net_minor INTEGER NOT NULL CHECK (net_minor >= 0),
    tax_minor INTEGER NOT NULL CHECK (tax_minor >= 0),
    total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
    source_line_id INTEGER REFERENCES document_lines(id),
    processed_qty_scaled INTEGER NOT NULL DEFAULT 0 CHECK (processed_qty_scaled >= 0),
    cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (cost_minor >= 0),
    processed_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (processed_cost_minor >= 0),
    UNIQUE (document_id, line_no)
);
CREATE INDEX idx_document_lines_doc ON document_lines(document_id);
CREATE INDEX idx_document_lines_source ON document_lines(source_line_id);

CREATE TABLE payments (
    id INTEGER PRIMARY KEY,
    payment_no TEXT NOT NULL UNIQUE,
    party_type TEXT NOT NULL CHECK (party_type IN ('customer', 'supplier')),
    customer_id INTEGER REFERENCES customers(id),
    supplier_id INTEGER REFERENCES suppliers(id),
    payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    payment_date TEXT NOT NULL,
    reference TEXT,
    notes TEXT,
    status TEXT NOT NULL CHECK (status IN ('posted', 'reversed')),
    journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
    reversal_entry_id INTEGER REFERENCES journal_entries(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    CHECK ((party_type = 'customer' AND customer_id IS NOT NULL AND supplier_id IS NULL)
        OR (party_type = 'supplier' AND supplier_id IS NOT NULL AND customer_id IS NULL))
);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_supplier ON payments(supplier_id);

CREATE TABLE allocations (
    id INTEGER PRIMARY KEY,
    payment_id INTEGER REFERENCES payments(id),
    credit_doc_id INTEGER REFERENCES documents(id),
    target_doc_id INTEGER NOT NULL REFERENCES documents(id),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    reversed INTEGER NOT NULL DEFAULT 0 CHECK (reversed IN (0, 1)),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    CHECK ((payment_id IS NULL) <> (credit_doc_id IS NULL))
);
CREATE INDEX idx_allocations_target ON allocations(target_doc_id);
CREATE INDEX idx_allocations_payment ON allocations(payment_id);
CREATE INDEX idx_allocations_credit ON allocations(credit_doc_id);

CREATE TABLE stock_levels (
    product_id INTEGER NOT NULL REFERENCES products(id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    qty_scaled INTEGER NOT NULL DEFAULT 0 CHECK (qty_scaled >= 0),
    value_minor INTEGER NOT NULL DEFAULT 0 CHECK (value_minor >= 0),
    PRIMARY KEY (product_id, warehouse_id)
);

CREATE TABLE stock_movements (
    id INTEGER PRIMARY KEY,
    movement_date TEXT NOT NULL,
    movement_type TEXT NOT NULL CHECK (movement_type IN (
        'receipt', 'issue', 'adjust_in', 'adjust_out', 'transfer_in', 'transfer_out',
        'sale', 'sale_return', 'purchase', 'purchase_return', 'count_in', 'count_out')),
    product_id INTEGER NOT NULL REFERENCES products(id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    qty_scaled INTEGER NOT NULL CHECK (qty_scaled <> 0),
    value_minor INTEGER NOT NULL,
    reference TEXT,
    note TEXT,
    document_id INTEGER REFERENCES documents(id),
    journal_entry_id INTEGER REFERENCES journal_entries(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    CHECK ((qty_scaled > 0 AND value_minor >= 0) OR (qty_scaled < 0 AND value_minor <= 0))
);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, warehouse_id, movement_date);
CREATE INDEX idx_stock_movements_document ON stock_movements(document_id);

CREATE TABLE stock_layers (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    movement_id INTEGER NOT NULL REFERENCES stock_movements(id),
    received_date TEXT NOT NULL,
    original_qty_scaled INTEGER NOT NULL CHECK (original_qty_scaled > 0),
    original_value_minor INTEGER NOT NULL CHECK (original_value_minor >= 0),
    qty_remaining_scaled INTEGER NOT NULL CHECK (qty_remaining_scaled >= 0),
    value_remaining_minor INTEGER NOT NULL CHECK (value_remaining_minor >= 0),
    CHECK (qty_remaining_scaled <= original_qty_scaled),
    CHECK (value_remaining_minor <= original_value_minor)
);
CREATE INDEX idx_stock_layers_fifo ON stock_layers(product_id, warehouse_id, id);

CREATE TABLE stock_counts (
    id INTEGER PRIMARY KEY,
    count_no TEXT NOT NULL UNIQUE,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    count_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'posted')),
    notes TEXT,
    journal_entry_id INTEGER REFERENCES journal_entries(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    posted_by INTEGER REFERENCES users(id),
    posted_at TEXT
);

CREATE TABLE stock_count_lines (
    id INTEGER PRIMARY KEY,
    count_id INTEGER NOT NULL REFERENCES stock_counts(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    system_qty_snapshot_scaled INTEGER NOT NULL,
    physical_qty_scaled INTEGER NOT NULL CHECK (physical_qty_scaled >= 0),
    system_qty_posted_scaled INTEGER,
    difference_scaled INTEGER,
    unit_cost_minor INTEGER,
    value_difference_minor INTEGER,
    UNIQUE (count_id, product_id)
);

CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    user_id INTEGER,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    record_type TEXT,
    record_id TEXT,
    old_value TEXT,
    new_value TEXT,
    details TEXT
);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_record ON audit_log(module, record_type, record_id);

-- ---------------------------------------------------------------
-- Immutability rules (enforced by the database itself)
-- ---------------------------------------------------------------
CREATE TRIGGER journal_entries_no_update BEFORE UPDATE ON journal_entries
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
CREATE TRIGGER journal_entries_no_delete BEFORE DELETE ON journal_entries
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
CREATE TRIGGER journal_lines_no_update BEFORE UPDATE ON journal_lines
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
CREATE TRIGGER journal_lines_no_delete BEFORE DELETE ON journal_lines
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
CREATE TRIGGER stock_movements_no_update BEFORE UPDATE ON stock_movements
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
CREATE TRIGGER stock_movements_no_delete BEFORE DELETE ON stock_movements
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_immutable'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_immutable'); END;

CREATE TRIGGER documents_no_delete_posted BEFORE DELETE ON documents
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
CREATE TRIGGER documents_locked_after_draft BEFORE UPDATE OF
    doc_type, number, doc_date, due_date, customer_id, supplier_id, warehouse_id,
    subtotal_minor, tax_minor, total_minor, reference, notes, restock, source_id
ON documents
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;

CREATE TRIGGER document_lines_no_insert_after_draft BEFORE INSERT ON document_lines
WHEN (SELECT status FROM documents WHERE id = NEW.document_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
CREATE TRIGGER document_lines_no_delete_after_draft BEFORE DELETE ON document_lines
WHEN (SELECT status FROM documents WHERE id = OLD.document_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
CREATE TRIGGER document_lines_locked_after_draft BEFORE UPDATE OF
    product_id, account_id, description, quantity_scaled, unit_price_minor, discount_bps,
    tax_rate_id, tax_bps, net_minor, tax_minor, total_minor, source_line_id, line_no
ON document_lines
WHEN (SELECT status FROM documents WHERE id = OLD.document_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;

CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
CREATE TRIGGER payments_immutable_core BEFORE UPDATE OF
    party_type, customer_id, supplier_id, payment_method_id, amount_minor, payment_date,
    journal_entry_id, payment_no
ON payments
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
CREATE TRIGGER allocations_no_delete BEFORE DELETE ON allocations
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
CREATE TRIGGER allocations_immutable_core BEFORE UPDATE OF
    payment_id, credit_doc_id, target_doc_id, amount_minor
ON allocations
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
CREATE TRIGGER stock_counts_locked_after_post BEFORE UPDATE OF
    warehouse_id, count_date, notes
ON stock_counts
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
CREATE TRIGGER stock_count_lines_locked BEFORE UPDATE ON stock_count_lines
WHEN (SELECT status FROM stock_counts WHERE id = OLD.count_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'posted_record_immutable'); END;
"""

# Unique lookups for the company-wide sequence names used by document numbering.
SEQUENCES = (
    ("journal", "JE"),
    ("payment_in", "RCT"),
    ("payment_out", "PMT"),
    ("sales_quote", "QUO"),
    ("sales_order", "SO"),
    ("sales_invoice", "INV"),
    ("sales_credit", "CN"),
    ("purchase_order", "PO"),
    ("purchase_invoice", "BILL"),
    ("purchase_return", "DN"),
    ("stock_count", "CNT"),
    ("stock_receipt", "RCV"),
    ("stock_issue", "ISS"),
    ("stock_transfer", "TRF"),
    ("stock_adjustment", "ADJ"),
    ("opening_balance", "OB"),
)

MIGRATIONS = {1: SCHEMA_V1}
