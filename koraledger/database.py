import os
import sqlite3
from pathlib import Path


# ============================================================
# DATABASE CONFIGURATION
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("ACCOUNTING_DB_PATH", BASE_DIR / "accounting.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

connection = sqlite3.connect(DB_PATH)
connection.execute("PRAGMA foreign_keys = ON")

cursor = connection.cursor()


# ============================================================
# DATABASE INITIALIZATION
# ============================================================

def initialize_database():

    # --------------------------------------------------------
    # CUSTOMERS
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT
        )
    """)

    # --------------------------------------------------------
    # SUPPLIERS
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS suppliers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT
        )
    """)

    # --------------------------------------------------------
    # PRODUCTS
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            price REAL NOT NULL DEFAULT 0,
            quantity INTEGER NOT NULL DEFAULT 0,
            cost_price REAL NOT NULL DEFAULT 0
        )
    """)

    # --------------------------------------------------------
    # SALES
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            sale_date TEXT NOT NULL,
            total REAL NOT NULL,
            payment_method TEXT,

            FOREIGN KEY (customer_id)
                REFERENCES customers(id)
        )
    """)

    # --------------------------------------------------------
    # SALE ITEMS
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sale_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            subtotal REAL NOT NULL,
            cost_price REAL NOT NULL DEFAULT 0,

            FOREIGN KEY (sale_id)
                REFERENCES sales(id),

            FOREIGN KEY (product_id)
                REFERENCES products(id)
        )
    """)

    # --------------------------------------------------------
    # PURCHASES
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id INTEGER,
            purchase_date TEXT NOT NULL,
            total REAL NOT NULL,
            payment_method TEXT,

            FOREIGN KEY (supplier_id)
                REFERENCES suppliers(id)
        )
    """)

    # --------------------------------------------------------
    # PURCHASE ITEMS
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS purchase_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            subtotal REAL NOT NULL,

            FOREIGN KEY (purchase_id)
                REFERENCES purchases(id),

            FOREIGN KEY (product_id)
                REFERENCES products(id)
        )
    """)

    # --------------------------------------------------------
    # PAYMENTS
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_type TEXT NOT NULL,
            customer_id INTEGER,
            supplier_id INTEGER,
            amount REAL NOT NULL,
            payment_method TEXT NOT NULL,
            payment_date TEXT NOT NULL,
            description TEXT,

            FOREIGN KEY (customer_id)
                REFERENCES customers(id),

            FOREIGN KEY (supplier_id)
                REFERENCES suppliers(id)
        )
    """)

    # ========================================================
    # ACCOUNTING TABLES
    # ========================================================

    # --------------------------------------------------------
    # CHART OF ACCOUNTS
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_code TEXT NOT NULL UNIQUE,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            parent_id INTEGER,
            is_active INTEGER NOT NULL DEFAULT 1,

            FOREIGN KEY (parent_id)
                REFERENCES accounts(id)
        )
    """)

    # --------------------------------------------------------
    # JOURNAL ENTRIES
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_date TEXT NOT NULL,
            reference TEXT,
            description TEXT,
            created_at TEXT NOT NULL
        )
    """)

    # --------------------------------------------------------
    # JOURNAL LINES
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS journal_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_entry_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            description TEXT,
            debit REAL NOT NULL DEFAULT 0,
            credit REAL NOT NULL DEFAULT 0,

            FOREIGN KEY (journal_entry_id)
                REFERENCES journal_entries(id),

            FOREIGN KEY (account_id)
                REFERENCES accounts(id)
        )
    """)

    # --------------------------------------------------------
    # ACCOUNTING SETTINGS
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS accounting_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_name TEXT NOT NULL UNIQUE,
            setting_value TEXT
        )
    """)

    # --------------------------------------------------------
    # INVENTORY ADJUSTMENTS
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inventory_adjustments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            product_code TEXT,
            product_name TEXT,
            old_quantity INTEGER NOT NULL,
            new_quantity INTEGER NOT NULL,
            difference INTEGER NOT NULL,
            cost_price REAL NOT NULL DEFAULT 0,
            value_difference REAL NOT NULL DEFAULT 0,
            adjustment_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # --------------------------------------------------------
    # DEFAULT ACCOUNTS
    # --------------------------------------------------------

    default_accounts = [

        ("1010", "Cash", "Asset"),
        ("1020", "Bank", "Asset"),
        ("1030", "Mobile Money", "Asset"),

        ("1100", "Accounts Receivable", "Asset"),
        ("1200", "Inventory", "Asset"),

        ("2010", "Accounts Payable", "Liability"),

        ("3010", "Owner's Capital", "Equity"),
        ("3020", "Retained Earnings", "Equity"),

        ("4010", "Sales Revenue", "Revenue"),

        ("5010", "Cost of Goods Sold", "Expense"),
        ("5020", "Operating Expenses", "Expense"),
    ]

    for code, name, account_type in default_accounts:

        cursor.execute(
            """
            INSERT OR IGNORE INTO accounts
            (
                account_code,
                account_name,
                account_type
            )
            VALUES (?, ?, ?)
            """,
            (
                code,
                name,
                account_type
            )
        )

    connection.commit()


# ============================================================
# DATABASE MIGRATIONS
# ============================================================

def migrate_database():
    """Add columns introduced after the original SQLite schema."""
    migrations = [
        ("sales", "payment_method", "TEXT", None),
        ("purchases", "payment_method", "TEXT", None),
        ("products", "cost_price", "REAL NOT NULL DEFAULT 0", None),
        (
            "sale_items",
            "cost_price",
            "REAL NOT NULL DEFAULT 0",
            """
            UPDATE sale_items
            SET cost_price = COALESCE(
                (
                    SELECT products.cost_price
                    FROM products
                    WHERE products.id = sale_items.product_id
                ),
                0
            )
            """,
        ),
    ]

    for table_name, column_name, column_definition, backfill_sql in migrations:
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = {column[1] for column in cursor.fetchall()}
        if column_name in columns:
            continue

        cursor.execute(
            f"ALTER TABLE {table_name} "
            f"ADD COLUMN {column_name} {column_definition}"
        )
        if backfill_sql:
            cursor.execute(backfill_sql)

    # Older versions recorded payment methods only in journal account lines.
    # Recover them where possible, while preserving any value already saved.
    cursor.execute(
        """
        UPDATE sales
        SET payment_method = (
            SELECT CASE accounts.account_code
                WHEN '1010' THEN 'Cash'
                WHEN '1020' THEN 'Bank'
                WHEN '1030' THEN 'Mobile Money'
                WHEN '1100' THEN 'Accounts Receivable'
            END
            FROM journal_entries
            JOIN journal_lines
                ON journal_lines.journal_entry_id = journal_entries.id
            JOIN accounts ON accounts.id = journal_lines.account_id
            WHERE journal_entries.reference = 'SALE-' || sales.id
              AND journal_lines.debit > 0
            ORDER BY journal_lines.id
            LIMIT 1
        )
        WHERE payment_method IS NULL
          AND EXISTS (
            SELECT 1
            FROM journal_entries
            JOIN journal_lines
                ON journal_lines.journal_entry_id = journal_entries.id
            JOIN accounts ON accounts.id = journal_lines.account_id
            WHERE journal_entries.reference = 'SALE-' || sales.id
              AND journal_lines.debit > 0
          )
        """
    )

    cursor.execute(
        """
        UPDATE purchases
        SET payment_method = (
            SELECT CASE accounts.account_code
                WHEN '1010' THEN 'Cash'
                WHEN '1020' THEN 'Bank'
                WHEN '1030' THEN 'Mobile Money'
                WHEN '2010' THEN 'Accounts Payable'
            END
            FROM journal_entries
            JOIN journal_lines
                ON journal_lines.journal_entry_id = journal_entries.id
            JOIN accounts ON accounts.id = journal_lines.account_id
            WHERE journal_entries.reference = 'PURCHASE-' || purchases.id
              AND journal_lines.credit > 0
            ORDER BY journal_lines.id
            LIMIT 1
        )
        WHERE payment_method IS NULL
          AND EXISTS (
            SELECT 1
            FROM journal_entries
            JOIN journal_lines
                ON journal_lines.journal_entry_id = journal_entries.id
            JOIN accounts ON accounts.id = journal_lines.account_id
            WHERE journal_entries.reference = 'PURCHASE-' || purchases.id
              AND journal_lines.credit > 0
          )
        """
    )

    connection.commit()


# ============================================================
# CLOSE DATABASE
# ============================================================

def close_database():

    connection.close()


# ============================================================
# INITIALIZE DATABASE
# ============================================================

initialize_database()
migrate_database()