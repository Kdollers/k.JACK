"""Read and post accounting data for the desktop ERP interface.

The repository receives a SQLite connection instead of opening its own. That
keeps the interface on the application's existing company file and makes the
accounting rules testable against isolated temporary databases.
"""

from contextlib import contextmanager
from datetime import date, datetime, timedelta
import math

from modules.validation import parse_money


PAYMENT_METHODS = ("Cash", "Bank", "Mobile Money")
SALE_METHODS = PAYMENT_METHODS + ("Accounts Receivable",)
PURCHASE_METHODS = PAYMENT_METHODS + ("Accounts Payable",)
ACCOUNT_TYPES = ("Asset", "Liability", "Equity", "Revenue", "Expense")


class AccountingRepository:
    def __init__(self, connection, cursor):
        self.connection = connection
        self.cursor = cursor

    def _all(self, sql, params=()):
        self.cursor.execute(sql, params)
        columns = [column[0] for column in self.cursor.description or ()]
        return [dict(zip(columns, row)) for row in self.cursor.fetchall()]

    def _one(self, sql, params=()):
        rows = self._all(sql, params)
        return rows[0] if rows else None

    @contextmanager
    def _transaction(self):
        if self.connection.in_transaction:
            raise RuntimeError("A previous database operation is still open.")
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            yield self.cursor
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise

    @staticmethod
    def _text(value, label, maximum=160, required=True):
        value = str(value or "").strip()
        if required and not value:
            raise ValueError(f"{label} is required.")
        if len(value) > maximum:
            raise ValueError(f"{label} must be {maximum} characters or fewer.")
        return value or None

    @staticmethod
    def _integer(value, label, minimum=0):
        try:
            result = int(str(value).strip())
        except (TypeError, ValueError) as error:
            raise ValueError(f"{label} must be a whole number.") from error
        if result < minimum:
            raise ValueError(f"{label} must be at least {minimum}.")
        return result

    @staticmethod
    def _amount(value, label="Amount", allow_zero=True):
        try:
            return parse_money(str(value).replace(",", ""), allow_zero=allow_zero)
        except ValueError as error:
            raise ValueError(f"{label}: {error}") from error

    @staticmethod
    def _date(value, label="Date"):
        try:
            return date.fromisoformat(str(value).strip()).isoformat()
        except (TypeError, ValueError) as error:
            raise ValueError(f"{label} must use YYYY-MM-DD format.") from error

    def get_setting(self, name, default=""):
        row = self._one(
            "SELECT setting_value FROM accounting_settings WHERE setting_name = ?",
            (name,),
        )
        return row["setting_value"] if row and row["setting_value"] is not None else default

    def save_settings(self, company_name, currency_code, tax_id="", address="", ui_language="en"):
        company_name = self._text(company_name, "Company name", 120)
        currency_code = self._text(currency_code, "Currency code", 3).upper()
        if len(currency_code) != 3 or not currency_code.isalpha():
            raise ValueError("Currency code must be a three-letter code such as XAF.")
        tax_id = self._text(tax_id, "Tax identification", 60, required=False)
        address = self._text(address, "Address", 240, required=False)
        ui_language = self._text(ui_language, "Interface language", 5, required=False).lower() or "en"
        with self._transaction() as cursor:
            for name, value in (
                ("company_name", company_name),
                ("currency_code", currency_code),
                ("tax_id", tax_id),
                ("address", address),
                ("ui_language", ui_language),
            ):
                cursor.execute(
                    """
                    INSERT INTO accounting_settings (setting_name, setting_value)
                    VALUES (?, ?)
                    ON CONFLICT(setting_name) DO UPDATE
                    SET setting_value = excluded.setting_value
                    """,
                    (name, value),
                )

    # ---------------------------
    # Dashboard and work lists
    # ---------------------------
    def dashboard(self, today=None):
        today = today or date.today()
        month_start = today.replace(day=1).isoformat()
        currency = self.get_setting("currency_code", "XAF")
        company = self.get_setting("company_name", "My Company")

        def scalar(sql, params=()):
            row = self._one(sql, params)
            return row["value"] if row else 0

        today_iso = today.isoformat()
        sales_mtd = float(scalar(
            "SELECT COALESCE(SUM(total), 0) AS value FROM sales WHERE date(sale_date) BETWEEN date(?) AND date(?)",
            (month_start, today_iso),
        ) or 0)
        purchases_mtd = float(scalar(
            "SELECT COALESCE(SUM(total), 0) AS value FROM purchases WHERE date(purchase_date) BETWEEN date(?) AND date(?)",
            (month_start, today_iso),
        ) or 0)
        inventory_value = float(scalar(
            "SELECT COALESCE(SUM(quantity * cost_price), 0) AS value FROM products"
        ) or 0)
        low_stock = int(scalar(
            "SELECT COUNT(*) AS value FROM products WHERE quantity <= 5"
        ) or 0)
        active_products = int(scalar("SELECT COUNT(*) AS value FROM products") or 0)
        customer_count = int(scalar("SELECT COUNT(*) AS value FROM customers") or 0)

        account_balances = self._all(
            """
            SELECT a.account_code, a.account_name, a.account_type,
                   COALESCE(SUM(CASE WHEN je.entry_date <= ? THEN jl.debit ELSE 0 END), 0) AS debits,
                   COALESCE(SUM(CASE WHEN je.entry_date <= ? THEN jl.credit ELSE 0 END), 0) AS credits
            FROM accounts a
            LEFT JOIN journal_lines jl ON jl.account_id = a.id
            LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
            WHERE a.is_active = 1
            GROUP BY a.id, a.account_code, a.account_name, a.account_type
            """,
            (today_iso, today_iso),
        )
        balances = {}
        for row in account_balances:
            debit = float(row["debits"] or 0)
            credit = float(row["credits"] or 0)
            if row["account_code"] in ("1010", "1020", "1030"):
                balances[row["account_code"]] = debit - credit
            elif row["account_code"] == "1100":
                balances["receivables"] = debit - credit
            elif row["account_code"] == "2010":
                balances["payables"] = credit - debit

        net_profit = self.profit_loss(month_start, today_iso)[3]
        trend = self.monthly_trend(today)
        recent = self.recent_activity(8)
        headcount = int(scalar(
            "SELECT COUNT(*) AS value FROM employees WHERE is_active = 1"
        ) or 0)
        asset_net_value = float(scalar(
            """
            SELECT COALESCE(SUM(acquisition_cost - COALESCE(d.accumulated, 0)), 0) AS value
            FROM fixed_assets a
            LEFT JOIN (
                SELECT asset_id, SUM(amount) AS accumulated
                FROM depreciation_entries GROUP BY asset_id
            ) d ON d.asset_id = a.id
            WHERE a.is_active = 1
            """
        ) or 0)
        unreconciled_lines = int(scalar(
            "SELECT COUNT(*) AS value FROM bank_statement_lines WHERE is_reconciled = 0"
        ) or 0)
        treasury_net_mtd = float(scalar(
            """
            SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS value
            FROM cash_movements
            WHERE date(movement_date) BETWEEN date(?) AND date(?)
            """,
            (month_start, today_iso),
        ) or 0)
        return {
            "company": company,
            "currency": currency,
            "sales_mtd": sales_mtd,
            "purchases_mtd": purchases_mtd,
            "inventory_value": inventory_value,
            "low_stock": low_stock,
            "active_products": active_products,
            "customer_count": customer_count,
            "cash_bank": sum(balances.get(code, 0) for code in ("1010", "1020", "1030")),
            "receivables": balances.get("receivables", 0.0),
            "payables": balances.get("payables", 0.0),
            "net_profit": net_profit,
            "trend": trend,
            "recent": recent,
            "low_stock_items": self.list_low_stock(6),
            "headcount": headcount,
            "asset_net_value": asset_net_value,
            "unreconciled_lines": unreconciled_lines,
            "treasury_net_mtd": treasury_net_mtd,
            "tax_id": self.get_setting("tax_id", ""),
            "address": self.get_setting("address", ""),
        }

    def monthly_trend(self, today=None):
        today = today or date.today()
        months = []
        year, month = today.year, today.month
        for _ in range(6):
            months.append((year, month))
            month -= 1
            if month == 0:
                year -= 1
                month = 12
        result = []
        for year, month in reversed(months):
            start = date(year, month, 1).isoformat()
            if month == 12:
                end_date = date(year + 1, 1, 1)
            else:
                end_date = date(year, month + 1, 1)
            if (year, month) == (today.year, today.month):
                end_date = today + timedelta(days=1)
            end = end_date.isoformat()
            row = self._one(
                """
                SELECT COALESCE(SUM(total), 0) AS value
                FROM sales
                WHERE date(sale_date) >= date(?) AND date(sale_date) < date(?)
                """,
                (start, end),
            )
            result.append({"label": date(year, month, 1).strftime("%b"), "sales": float(row["value"] or 0)})
        return result

    def recent_activity(self, limit=10):
        return self._all(
            """
            SELECT posted_on, activity, reference, party, amount
            FROM (
                SELECT s.sale_date AS posted_on, 'Sales invoice' AS activity,
                       'INV-' || printf('%06d', s.id) AS reference,
                       COALESCE(c.name, 'Walk-in customer') AS party,
                       s.total AS amount
                FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
                UNION ALL
                SELECT p.purchase_date, 'Purchase invoice',
                       'PUR-' || printf('%06d', p.id),
                       COALESCE(s.name, 'Supplier'), p.total
                FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
                UNION ALL
                SELECT pay.payment_date,
                       CASE pay.payment_type WHEN 'customer' THEN 'Customer receipt' ELSE 'Supplier payment' END,
                       'PAY-' || printf('%06d', pay.id),
                       COALESCE(c.name, s.name, 'Payment'), pay.amount
                FROM payments pay
                LEFT JOIN customers c ON c.id = pay.customer_id
                LEFT JOIN suppliers s ON s.id = pay.supplier_id
            ) activity_rows
            ORDER BY posted_on DESC
            LIMIT ?
            """,
            (self._integer(limit, "Limit", 1),),
        )

    def list_low_stock(self, limit=50):
        return self._all(
            """
            SELECT id, code, name, quantity, cost_price, price
            FROM products WHERE quantity <= 5
            ORDER BY quantity, name LIMIT ?
            """,
            (self._integer(limit, "Limit", 1),),
        )

    def global_search(self, query, limit=80):
        query = str(query or "").strip()
        if not query:
            return []
        term = f"%{query}%"
        records = []
        for kind, sql, key, name in (
            ("Customer", "SELECT id, name AS label, phone AS detail FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT ?", "id", "label"),
            ("Supplier", "SELECT id, name AS label, phone AS detail FROM suppliers WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT ?", "id", "label"),
            ("Item", "SELECT id, name AS label, code AS detail FROM products WHERE name LIKE ? OR code LIKE ? ORDER BY name LIMIT ?", "id", "label"),
        ):
            for row in self._all(sql, (term, term, limit)):
                records.append({
                    "kind": kind,
                    "id": row[key],
                    "result_id": f"{kind.lower()}-{row[key]}",
                    "label": row[name],
                    "detail": row["detail"] or "",
                })
        return records

    # ---------------------------
    # Master files
    # ---------------------------
    def list_customers(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT c.id, c.name, c.phone,
                   COUNT(DISTINCT s.id) AS invoice_count,
                   COALESCE(SUM(s.total), 0) AS lifetime_sales
            FROM customers c
            LEFT JOIN sales s ON s.customer_id = c.id
            WHERE c.name LIKE ? OR COALESCE(c.phone, '') LIKE ?
            GROUP BY c.id, c.name, c.phone
            ORDER BY c.name COLLATE NOCASE
            """,
            (term, term),
        )

    def save_customer(self, name, phone="", customer_id=None):
        name = self._text(name, "Customer name", 120)
        phone = self._text(phone, "Phone", 40, required=False)
        with self._transaction() as cursor:
            if customer_id:
                cursor.execute("UPDATE customers SET name = ?, phone = ? WHERE id = ?", (name, phone, customer_id))
                if cursor.rowcount != 1:
                    raise ValueError("Customer was not found.")
                return customer_id
            cursor.execute("INSERT INTO customers (name, phone) VALUES (?, ?)", (name, phone))
            return cursor.lastrowid

    def list_suppliers(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT s.id, s.name, s.phone,
                   COUNT(DISTINCT p.id) AS invoice_count,
                   COALESCE(SUM(p.total), 0) AS lifetime_purchases
            FROM suppliers s
            LEFT JOIN purchases p ON p.supplier_id = s.id
            WHERE s.name LIKE ? OR COALESCE(s.phone, '') LIKE ?
            GROUP BY s.id, s.name, s.phone
            ORDER BY s.name COLLATE NOCASE
            """,
            (term, term),
        )

    def save_supplier(self, name, phone="", supplier_id=None):
        name = self._text(name, "Supplier name", 120)
        phone = self._text(phone, "Phone", 40, required=False)
        with self._transaction() as cursor:
            if supplier_id:
                cursor.execute("UPDATE suppliers SET name = ?, phone = ? WHERE id = ?", (name, phone, supplier_id))
                if cursor.rowcount != 1:
                    raise ValueError("Supplier was not found.")
                return supplier_id
            cursor.execute("INSERT INTO suppliers (name, phone) VALUES (?, ?)", (name, phone))
            return cursor.lastrowid

    def delete_person(self, table, record_id):
        tables = {"customers": "Customer", "suppliers": "Supplier"}
        if table not in tables:
            raise ValueError("Unsupported master record.")
        with self._transaction() as cursor:
            cursor.execute(f"DELETE FROM {table} WHERE id = ?", (record_id,))
            if cursor.rowcount != 1:
                raise ValueError(f"{tables[table]} was not found.")

    def list_products(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT id, code, name, cost_price, price, quantity,
                   (price - cost_price) AS unit_margin,
                   CASE WHEN quantity <= 5 THEN 'Reorder' ELSE 'In stock' END AS stock_status
            FROM products
            WHERE code LIKE ? OR name LIKE ?
            ORDER BY name COLLATE NOCASE
            """,
            (term, term),
        )

    def save_product(self, code, name, cost_price, selling_price, opening_quantity=0, product_id=None):
        code = self._text(code, "Item code", 50)
        name = self._text(name, "Item description", 160)
        cost_price = self._amount(cost_price, "Unit cost")
        selling_price = self._amount(selling_price, "Selling price")
        opening_quantity = self._integer(opening_quantity, "Opening quantity")
        with self._transaction() as cursor:
            if product_id:
                cursor.execute(
                    "UPDATE products SET code = ?, name = ?, price = ? WHERE id = ?",
                    (code, name, selling_price, product_id),
                )
                if cursor.rowcount != 1:
                    raise ValueError("Item was not found.")
                return product_id
            cursor.execute(
                """
                INSERT INTO products (code, name, price, quantity, cost_price)
                VALUES (?, ?, ?, ?, ?)
                """,
                (code, name, selling_price, opening_quantity, cost_price),
            )
            product_id = cursor.lastrowid
            from modules.accounting_engine import record_opening_inventory
            record_opening_inventory(
                product_id, opening_quantity, cost_price,
                cursor_obj=cursor, entry_date=date.today().isoformat(),
            )
            return product_id

    def delete_product(self, product_id):
        with self._transaction() as cursor:
            cursor.execute("DELETE FROM products WHERE id = ?", (product_id,))
            if cursor.rowcount != 1:
                raise ValueError("Item was not found.")

    def adjust_inventory(self, product_id, physical_quantity):
        physical_quantity = self._integer(physical_quantity, "Counted quantity")
        with self._transaction() as cursor:
            cursor.execute(
                "SELECT code, name, quantity, cost_price FROM products WHERE id = ?",
                (product_id,),
            )
            product = cursor.fetchone()
            if product is None:
                raise ValueError("Item was not found.")
            code, name, system_quantity, cost_price = product
            system_quantity = int(system_quantity or 0)
            cost_price = float(cost_price or 0)
            difference = physical_quantity - system_quantity
            if difference == 0:
                return {"difference": 0, "value": 0.0}
            value = difference * cost_price
            cursor.execute("UPDATE products SET quantity = ? WHERE id = ?", (physical_quantity, product_id))
            cursor.execute(
                """
                INSERT INTO inventory_adjustments
                    (product_id, product_code, product_name, old_quantity,
                     new_quantity, difference, cost_price, value_difference)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (product_id, code, name, system_quantity, physical_quantity, difference, cost_price, value),
            )
            adjustment_id = cursor.lastrowid
            from modules.accounting_engine import record_inventory_adjustment
            record_inventory_adjustment(
                adjustment_id, difference, abs(value), cursor_obj=cursor,
                entry_date=date.today().isoformat(),
            )
            return {"difference": difference, "value": value}

    # ---------------------------
    # Sales and purchasing
    # ---------------------------
    def list_sales(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT s.id, s.sale_date, 'INV-' || printf('%06d', s.id) AS invoice,
                   COALESCE(c.name, 'Walk-in customer') AS customer,
                   s.payment_method, s.total,
                   CASE WHEN s.payment_method = 'Accounts Receivable' THEN 'On account' ELSE 'Paid' END AS status
            FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
            WHERE CAST(s.id AS TEXT) LIKE ?
               OR ('INV-' || printf('%06d', s.id)) LIKE ?
               OR COALESCE(c.name, 'Walk-in customer') LIKE ?
            ORDER BY s.id DESC
            """,
            (term, term, term),
        )

    def sale_details(self, sale_id):
        header = self._one(
            """
            SELECT s.id, s.sale_date, s.total, s.payment_method,
                   COALESCE(c.name, 'Walk-in customer') AS customer
            FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?
            """,
            (sale_id,),
        )
        if not header:
            return None, []
        lines = self._all(
            """
            SELECT p.code, p.name, si.quantity, si.price, si.subtotal, si.cost_price
            FROM sale_items si JOIN products p ON p.id = si.product_id
            WHERE si.sale_id = ? ORDER BY si.id
            """,
            (sale_id,),
        )
        return header, lines

    def create_sale(self, customer_id, payment_method, items, posted_date=None):
        if payment_method not in SALE_METHODS:
            raise ValueError("Choose a supported sales payment method.")
        posted_date = self._date(posted_date or date.today().isoformat()) + " " + datetime.now().strftime("%H:%M:%S")
        if not items:
            raise ValueError("Add at least one item to the invoice.")
        if payment_method == "Accounts Receivable" and not customer_id:
            raise ValueError("Select a customer for an on-account sale.")

        prepared = []
        selected = {}
        total = 0.0
        with self._transaction() as cursor:
            if customer_id:
                cursor.execute("SELECT id FROM customers WHERE id = ?", (customer_id,))
                if cursor.fetchone() is None:
                    raise ValueError("Customer was not found.")
            for item in items:
                product_id = self._integer(item.get("product_id"), "Item", 1)
                quantity = self._integer(item.get("quantity"), "Quantity", 1)
                unit_price = self._amount(item.get("unit_price"), "Unit price")
                cursor.execute(
                    "SELECT code, name, price, quantity, cost_price FROM products WHERE id = ?",
                    (product_id,),
                )
                product = cursor.fetchone()
                if product is None:
                    raise ValueError("An invoice item no longer exists.")
                selected[product_id] = selected.get(product_id, 0) + quantity
                if selected[product_id] > int(product[3] or 0):
                    raise ValueError(f"Not enough stock for {product[1]}.")
                subtotal = round(unit_price * quantity, 2)
                total += subtotal
                prepared.append({
                    "product_id": product_id,
                    "code": product[0],
                    "name": product[1],
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "cost_price": float(product[4] or 0),
                    "subtotal": subtotal,
                })

            cursor.execute(
                "INSERT INTO sales (customer_id, sale_date, total, payment_method) VALUES (?, ?, ?, ?)",
                (customer_id or None, posted_date, round(total, 2), payment_method),
            )
            sale_id = cursor.lastrowid
            posting_items = []
            for item in prepared:
                cursor.execute(
                    """
                    INSERT INTO sale_items
                        (sale_id, product_id, quantity, price, subtotal, cost_price)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (sale_id, item["product_id"], item["quantity"], item["unit_price"], item["subtotal"], item["cost_price"]),
                )
                cursor.execute(
                    "UPDATE products SET quantity = quantity - ? WHERE id = ? AND quantity >= ?",
                    (item["quantity"], item["product_id"], item["quantity"]),
                )
                if cursor.rowcount != 1:
                    raise ValueError(f"Stock changed while posting {item['name']}; refresh and try again.")
                posting_items.append((item["product_id"], item["quantity"], item["unit_price"], item["subtotal"], item["cost_price"]))
            from modules.accounting_engine import record_sale_accounting
            record_sale_accounting(
                sale_id, total, payment_method, posting_items,
                cursor_obj=cursor, entry_date=posted_date[:10],
            )
            return {"id": sale_id, "invoice": f"INV-{sale_id:06d}", "total": round(total, 2)}

    def list_purchases(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT p.id, p.purchase_date, 'PUR-' || printf('%06d', p.id) AS invoice,
                   COALESCE(s.name, 'Supplier') AS supplier,
                   p.payment_method, p.total,
                   CASE WHEN p.payment_method = 'Accounts Payable' THEN 'On account' ELSE 'Paid' END AS status
            FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
            WHERE CAST(p.id AS TEXT) LIKE ?
               OR ('PUR-' || printf('%06d', p.id)) LIKE ?
               OR COALESCE(s.name, 'Supplier') LIKE ?
            ORDER BY p.id DESC
            """,
            (term, term, term),
        )

    def purchase_details(self, purchase_id):
        header = self._one(
            """
            SELECT p.id, p.purchase_date, p.total, p.payment_method,
                   COALESCE(s.name, 'Supplier') AS supplier
            FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?
            """,
            (purchase_id,),
        )
        if not header:
            return None, []
        lines = self._all(
            """
            SELECT p.code, p.name, pi.quantity, pi.price, pi.subtotal
            FROM purchase_items pi JOIN products p ON p.id = pi.product_id
            WHERE pi.purchase_id = ? ORDER BY pi.id
            """,
            (purchase_id,),
        )
        return header, lines

    def create_purchase(self, supplier_id, payment_method, items, posted_date=None):
        if payment_method not in PURCHASE_METHODS:
            raise ValueError("Choose a supported purchase payment method.")
        supplier_id = self._integer(supplier_id, "Supplier", 1)
        posted_date = self._date(posted_date or date.today().isoformat()) + " " + datetime.now().strftime("%H:%M:%S")
        if not items:
            raise ValueError("Add at least one item to the purchase.")
        prepared = []
        total = 0.0
        with self._transaction() as cursor:
            cursor.execute("SELECT id FROM suppliers WHERE id = ?", (supplier_id,))
            if cursor.fetchone() is None:
                raise ValueError("Supplier was not found.")
            for item in items:
                product_id = self._integer(item.get("product_id"), "Item", 1)
                quantity = self._integer(item.get("quantity"), "Quantity", 1)
                unit_cost = self._amount(item.get("unit_cost"), "Unit cost")
                cursor.execute(
                    "SELECT code, name FROM products WHERE id = ?",
                    (product_id,),
                )
                product = cursor.fetchone()
                if product is None:
                    raise ValueError("A purchase item no longer exists.")
                subtotal = round(unit_cost * quantity, 2)
                total += subtotal
                prepared.append({
                    "product_id": product_id,
                    "code": product[0],
                    "name": product[1],
                    "quantity": quantity,
                    "unit_cost": unit_cost,
                    "subtotal": subtotal,
                })
            cursor.execute(
                "INSERT INTO purchases (supplier_id, purchase_date, total, payment_method) VALUES (?, ?, ?, ?)",
                (supplier_id, posted_date, round(total, 2), payment_method),
            )
            purchase_id = cursor.lastrowid
            for item in prepared:
                cursor.execute(
                    """
                    INSERT INTO purchase_items (purchase_id, product_id, quantity, price, subtotal)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (purchase_id, item["product_id"], item["quantity"], item["unit_cost"], item["subtotal"]),
                )
                cursor.execute(
                    "SELECT quantity, cost_price FROM products WHERE id = ?",
                    (item["product_id"],),
                )
                old_quantity, old_cost = cursor.fetchone()
                old_quantity = int(old_quantity or 0)
                new_quantity = old_quantity + item["quantity"]
                weighted_cost = (
                    old_quantity * float(old_cost or 0)
                    + item["quantity"] * item["unit_cost"]
                ) / new_quantity
                cursor.execute(
                    "UPDATE products SET quantity = ?, cost_price = ? WHERE id = ?",
                    (new_quantity, weighted_cost, item["product_id"]),
                )
            from modules.accounting_engine import record_purchase_accounting
            record_purchase_accounting(
                purchase_id, total, payment_method,
                cursor_obj=cursor, entry_date=posted_date[:10],
            )
            return {"id": purchase_id, "invoice": f"PUR-{purchase_id:06d}", "total": round(total, 2)}

    # ---------------------------
    # Receivables and payables
    # ---------------------------
    def list_payments(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT p.id, p.payment_date, 'PAY-' || printf('%06d', p.id) AS reference,
                   p.payment_type,
                   COALESCE(c.name, s.name, '—') AS party,
                   p.amount, p.payment_method, p.description
            FROM payments p
            LEFT JOIN customers c ON c.id = p.customer_id
            LEFT JOIN suppliers s ON s.id = p.supplier_id
            WHERE CAST(p.id AS TEXT) LIKE ?
               OR ('PAY-' || printf('%06d', p.id)) LIKE ?
               OR COALESCE(c.name, s.name, '') LIKE ?
               OR COALESCE(p.description, '') LIKE ?
            ORDER BY p.id DESC
            """,
            (term, term, term, term),
        )

    def create_payment(self, payment_type, party_id, amount, method, description="", posted_date=None):
        if payment_type not in ("customer", "supplier"):
            raise ValueError("Choose a customer receipt or supplier payment.")
        if method not in PAYMENT_METHODS:
            raise ValueError("Choose Cash, Bank, or Mobile Money.")
        party_id = self._integer(party_id, "Party", 1)
        amount = self._amount(amount, "Amount", allow_zero=False)
        description = self._text(description, "Memo", 240, required=False)
        posted_date = self._date(posted_date or date.today().isoformat()) + " " + datetime.now().strftime("%H:%M:%S")
        table = "customers" if payment_type == "customer" else "suppliers"
        party_label = "Customer" if payment_type == "customer" else "Supplier"
        with self._transaction() as cursor:
            cursor.execute(f"SELECT id FROM {table} WHERE id = ?", (party_id,))
            if cursor.fetchone() is None:
                raise ValueError(f"{party_label} was not found.")
            cursor.execute(
                """
                INSERT INTO payments
                    (payment_type, customer_id, supplier_id, amount, payment_method, payment_date, description)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (payment_type, party_id if payment_type == "customer" else None,
                 party_id if payment_type == "supplier" else None,
                 amount, method, posted_date, description),
            )
            payment_id = cursor.lastrowid
            from modules.accounting_engine import record_customer_payment, record_supplier_payment
            if payment_type == "customer":
                record_customer_payment(
                    payment_id, amount, method, cursor_obj=cursor,
                    entry_date=posted_date[:10],
                )
            else:
                record_supplier_payment(
                    payment_id, amount, method, cursor_obj=cursor,
                    entry_date=posted_date[:10],
                )
            return {"id": payment_id, "reference": f"PAY-{payment_id:06d}", "amount": amount}

    # ---------------------------
    # General ledger and reports
    # ---------------------------
    def list_accounts(self, search="", active_only=False):
        term = f"%{str(search or '').strip()}%"
        active = "AND a.is_active = 1" if active_only else ""
        return self._all(
            f"""
            SELECT a.id, a.account_code, a.account_name, a.account_type,
                   a.parent_id, a.is_active,
                   COALESCE(SUM(jl.debit), 0) AS total_debit,
                   COALESCE(SUM(jl.credit), 0) AS total_credit
            FROM accounts a
            LEFT JOIN journal_lines jl ON jl.account_id = a.id
            WHERE (a.account_code LIKE ? OR a.account_name LIKE ?) {active}
            GROUP BY a.id, a.account_code, a.account_name, a.account_type,
                     a.parent_id, a.is_active
            ORDER BY a.account_code
            """,
            (term, term),
        )

    def create_account(self, code, name, account_type, parent_id=None):
        code = self._text(code, "Account number", 24)
        name = self._text(name, "Account name", 120)
        if account_type not in ACCOUNT_TYPES:
            raise ValueError("Choose a valid account type.")
        with self._transaction() as cursor:
            cursor.execute(
                "INSERT INTO accounts (account_code, account_name, account_type, parent_id) VALUES (?, ?, ?, ?)",
                (code, name, account_type, parent_id or None),
            )
            return cursor.lastrowid

    def set_account_active(self, account_id, active):
        with self._transaction() as cursor:
            cursor.execute(
                "SELECT account_code, account_name, is_active FROM accounts WHERE id = ?",
                (account_id,),
            )
            account = cursor.fetchone()
            if account is None:
                raise ValueError("Account was not found.")
            if not active and account[0] in {
                "1010", "1020", "1030", "1100", "1200", "2010",
                "1250", "1260", "2020", "2030", "5100", "5200",
                "3010", "4010", "5010", "5020",
            }:
                raise ValueError(
                    f"{account[0]} is a core posting account and must remain active."
                )
            if not active:
                cursor.execute(
                    "SELECT 1 FROM journal_lines WHERE account_id = ? LIMIT 1",
                    (account_id,),
                )
                if cursor.fetchone():
                    raise ValueError(
                        "An account with posted ledger activity cannot be deactivated."
                    )
            cursor.execute(
                "UPDATE accounts SET is_active = ? WHERE id = ?",
                (int(bool(active)), account_id),
            )

    def list_journal_entries(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT je.id, je.entry_date, je.reference, je.description,
                   COALESCE(SUM(jl.debit), 0) AS total_debit,
                   COALESCE(SUM(jl.credit), 0) AS total_credit
            FROM journal_entries je
            LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
            WHERE CAST(je.id AS TEXT) LIKE ?
               OR COALESCE(je.reference, '') LIKE ?
               OR COALESCE(je.description, '') LIKE ?
            GROUP BY je.id, je.entry_date, je.reference, je.description
            ORDER BY je.entry_date DESC, je.id DESC
            """,
            (term, term, term),
        )

    def journal_details(self, journal_id):
        header = self._one("SELECT * FROM journal_entries WHERE id = ?", (journal_id,))
        lines = self._all(
            """
            SELECT a.account_code, a.account_name, jl.description, jl.debit, jl.credit
            FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
            WHERE jl.journal_entry_id = ? ORDER BY jl.id
            """,
            (journal_id,),
        )
        return header, lines

    def post_journal(self, description, reference, entry_date, lines):
        from modules.accounting_engine import create_journal_entry
        description = self._text(description, "Journal description", 240)
        reference = self._text(reference, "Reference", 60, required=False)
        entry_date = self._date(entry_date)
        with self._transaction() as cursor:
            journal_id = create_journal_entry(
                description, lines, reference=reference, cursor_obj=cursor,
                entry_date=entry_date,
            )
            return journal_id

    def trial_balance(self, as_of=None):
        as_of = self._date(as_of or date.today().isoformat())
        rows = self._all(
            """
            SELECT a.account_code, a.account_name, a.account_type,
                   COALESCE(SUM(CASE WHEN je.entry_date <= ? THEN jl.debit ELSE 0 END), 0) AS debit,
                   COALESCE(SUM(CASE WHEN je.entry_date <= ? THEN jl.credit ELSE 0 END), 0) AS credit
            FROM accounts a
            LEFT JOIN journal_lines jl ON jl.account_id = a.id
            LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
            GROUP BY a.id, a.account_code, a.account_name, a.account_type
            ORDER BY a.account_code
            """,
            (as_of, as_of),
        )
        for row in rows:
            debit, credit = float(row["debit"] or 0), float(row["credit"] or 0)
            row["balance"] = debit - credit if row["account_type"] in ("Asset", "Expense") else credit - debit
        return rows

    def general_ledger(self, account_code, start_date, end_date):
        start_date, end_date = self._date(start_date, "Start date"), self._date(end_date, "End date")
        if start_date > end_date:
            raise ValueError("Start date must be before end date.")
        account = self._one(
            "SELECT id, account_code, account_name, account_type FROM accounts WHERE account_code = ?",
            (account_code,),
        )
        if not account:
            return None, 0.0, []
        normal_debit = account["account_type"] in ("Asset", "Expense")
        opening_row = self._one(
            """
            SELECT COALESCE(SUM(jl.debit), 0) AS debit,
                   COALESCE(SUM(jl.credit), 0) AS credit
            FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
            WHERE jl.account_id = ? AND je.entry_date < ?
            """,
            (account["id"], start_date),
        )
        opening = float(opening_row["debit"] or 0) - float(opening_row["credit"] or 0)
        if not normal_debit:
            opening = -opening
        rows = self._all(
            """
            SELECT je.entry_date, je.reference, je.description AS journal_description,
                   jl.description, jl.debit, jl.credit
            FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
            WHERE jl.account_id = ? AND je.entry_date BETWEEN ? AND ?
            ORDER BY je.entry_date, je.id, jl.id
            """,
            (account["id"], start_date, end_date),
        )
        running = opening
        for row in rows:
            debit, credit = float(row["debit"] or 0), float(row["credit"] or 0)
            running += debit - credit if normal_debit else credit - debit
            row["balance"] = running
        return account, opening, rows

    def profit_loss(self, start_date, end_date):
        start_date, end_date = self._date(start_date, "Start date"), self._date(end_date, "End date")
        if start_date > end_date:
            raise ValueError("Start date must be before end date.")
        rows = self._all(
            """
            SELECT a.account_code, a.account_name, a.account_type,
                   COALESCE(SUM(jl.debit), 0) AS debit,
                   COALESCE(SUM(jl.credit), 0) AS credit
            FROM accounts a
            LEFT JOIN journal_lines jl ON jl.account_id = a.id
            LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
            WHERE a.account_type IN ('Revenue', 'Expense')
              AND (je.entry_date BETWEEN ? AND ? OR je.entry_date IS NULL)
            GROUP BY a.id, a.account_code, a.account_name, a.account_type
            ORDER BY a.account_code
            """,
            (start_date, end_date),
        )
        revenue = expenses = 0.0
        for row in rows:
            debit, credit = float(row["debit"] or 0), float(row["credit"] or 0)
            amount = credit - debit if row["account_type"] == "Revenue" else debit - credit
            row["amount"] = amount
            if row["account_type"] == "Revenue":
                revenue += amount
            else:
                expenses += amount
        return rows, revenue, expenses, revenue - expenses

    def balance_sheet(self, as_of=None):
        as_of = self._date(as_of or date.today().isoformat())
        rows = self._all(
            """
            SELECT a.account_code, a.account_name, a.account_type,
                   COALESCE(SUM(CASE WHEN je.entry_date <= ? THEN jl.debit ELSE 0 END), 0) AS debit,
                   COALESCE(SUM(CASE WHEN je.entry_date <= ? THEN jl.credit ELSE 0 END), 0) AS credit
            FROM accounts a
            LEFT JOIN journal_lines jl ON jl.account_id = a.id
            LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
            WHERE a.account_type IN ('Asset', 'Liability', 'Equity')
            GROUP BY a.id, a.account_code, a.account_name, a.account_type
            ORDER BY a.account_type, a.account_code
            """,
            (as_of, as_of),
        )
        totals = {"Asset": 0.0, "Liability": 0.0, "Equity": 0.0}
        for row in rows:
            debit, credit = float(row["debit"] or 0), float(row["credit"] or 0)
            normal_debit = row["account_type"] == "Asset"
            amount = debit - credit if normal_debit else credit - debit
            row["amount"] = amount
            totals[row["account_type"]] += amount
        pl_rows, revenue, expenses, net_income = self.profit_loss("1900-01-01", as_of)
        totals["Current earnings"] = net_income
        totals["Equity including current earnings"] = totals["Equity"] + net_income
        totals["Liabilities and equity"] = totals["Liability"] + totals["Equity"] + net_income
        totals["Net income"] = net_income
        return rows, totals

    def sales_summary(self, start_date=None, end_date=None):
        start_date = self._date(start_date or "1900-01-01", "Start date")
        end_date = self._date(end_date or date.today().isoformat(), "End date")
        return self._one(
            "SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total FROM sales WHERE date(sale_date) BETWEEN date(?) AND date(?)",
            (start_date, end_date),
        )

    def purchases_summary(self, start_date=None, end_date=None):
        start_date = self._date(start_date or "1900-01-01", "Start date")
        end_date = self._date(end_date or date.today().isoformat(), "End date")
        return self._one(
            "SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total FROM purchases WHERE date(purchase_date) BETWEEN date(?) AND date(?)",
            (start_date, end_date),
        )

    def list_inventory_adjustments(self, limit=100):
        return self._all(
            """
            SELECT id, adjustment_date, product_code, product_name,
                   old_quantity, new_quantity, difference, value_difference
            FROM inventory_adjustments ORDER BY id DESC LIMIT ?
            """,
            (self._integer(limit, "Limit", 1),),
        )

    # ---------------------------
    # Payroll & HR (Paie & GRH)
    # ---------------------------
    def list_employees(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT e.id, e.employee_code, e.name, e.role, e.base_salary,
                   e.hire_date, e.is_active,
                   COUNT(p.id) AS payslip_count
            FROM employees e
            LEFT JOIN payslips p ON p.employee_id = e.id
            WHERE e.employee_code LIKE ? OR e.name LIKE ? OR COALESCE(e.role, '') LIKE ?
            GROUP BY e.id, e.employee_code, e.name, e.role, e.base_salary, e.hire_date, e.is_active
            ORDER BY e.name COLLATE NOCASE
            """,
            (term, term, term),
        )

    def save_employee(self, name, role, base_salary, hire_date, employee_code="", employee_id=None):
        name = self._text(name, "Employee name", 120)
        role = self._text(role, "Role", 80, required=False)
        base_salary = self._amount(base_salary, "Base salary")
        hire_date = self._date(hire_date, "Hire date") if str(hire_date or "").strip() else None
        code = self._text(employee_code, "Employee code", 24, required=False)
        with self._transaction() as cursor:
            if not code:
                cursor.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM employees")
                code = f"EMP-{cursor.fetchone()['next']:04d}"
            if employee_id:
                cursor.execute(
                    "UPDATE employees SET employee_code = ?, name = ?, role = ?, base_salary = ?, hire_date = ? WHERE id = ?",
                    (code, name, role, base_salary, hire_date, employee_id),
                )
                if cursor.rowcount != 1:
                    raise ValueError("Employee was not found.")
                return employee_id
            cursor.execute(
                "INSERT INTO employees (employee_code, name, role, base_salary, hire_date) VALUES (?, ?, ?, ?, ?)",
                (code, name, role, base_salary, hire_date),
            )
            return cursor.lastrowid

    def set_employee_active(self, employee_id, active):
        employee_id = self._integer(employee_id, "Employee", 1)
        with self._transaction() as cursor:
            cursor.execute("UPDATE employees SET is_active = ? WHERE id = ?", (int(bool(active)), employee_id))
            if cursor.rowcount != 1:
                raise ValueError("Employee was not found.")

    def delete_employee(self, employee_id):
        employee_id = self._integer(employee_id, "Employee", 1)
        with self._transaction() as cursor:
            cursor.execute("SELECT id FROM employees WHERE id = ?", (employee_id,))
            if cursor.fetchone() is None:
                raise ValueError("Employee was not found.")
            cursor.execute("SELECT 1 FROM payslips WHERE employee_id = ? LIMIT 1", (employee_id,))
            if cursor.fetchone():
                raise ValueError("An employee with posted payslips cannot be deleted. Deactivate them instead.")
            cursor.execute("DELETE FROM employees WHERE id = ?", (employee_id,))

    def list_payroll_runs(self):
        return self._all(
            """
            SELECT r.id, r.period_start, r.period_end, r.run_date, r.employee_count,
                   r.total_base, r.total_allowances, r.total_deductions, r.total_net
            FROM payroll_runs r
            ORDER BY r.id DESC
            """
        )

    def run_payroll(self, period_start, period_end, employee_adjustments=None):
        period_start = self._date(period_start, "Period start")
        period_end = self._date(period_end, "Period end")
        if period_start > period_end:
            raise ValueError("Period start must be before period end.")
        adjustments = employee_adjustments or {}
        with self._transaction() as cursor:
            cursor.execute(
                "SELECT id, name, base_salary FROM employees WHERE is_active = 1 ORDER BY name COLLATE NOCASE"
            )
            employees = cursor.fetchall()
            if not employees:
                raise ValueError("There are no active employees. Add employees before running payroll.")
            base_total = allowance_total = deduction_total = net_total = 0.0
            payslips = []
            for employee in employees:
                base = float(employee[2] or 0)
                entry = adjustments.get(str(employee[0]), {})
                allowances = self._amount(entry.get("allowances", 0), "Allowances")
                deductions = self._amount(entry.get("deductions", 0), "Deductions")
                if base == 0 and allowances == 0 and deductions == 0:
                    continue
                net = round(base + allowances - deductions, 2)
                if net < 0:
                    raise ValueError(f"Net pay for {employee[1]} is negative; reduce deductions.")
                payslips.append((employee[0], base, allowances, deductions, net))
                base_total += base
                allowance_total += allowances
                deduction_total += deductions
                net_total += net
            if not payslips:
                raise ValueError("Every active employee has zero salary and no adjustments; nothing to post.")
            base_total = round(base_total, 2)
            allowance_total = round(allowance_total, 2)
            deduction_total = round(deduction_total, 2)
            net_total = round(net_total, 2)
            run_date = date.today().isoformat()
            cursor.execute(
                """
                INSERT INTO payroll_runs
                    (period_start, period_end, run_date, employee_count,
                     total_base, total_allowances, total_deductions, total_net)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (period_start, period_end, run_date, len(payslips),
                 base_total, allowance_total, deduction_total, net_total),
            )
            run_id = cursor.lastrowid
            cursor.executemany(
                """
                INSERT INTO payslips (payroll_run_id, employee_id, base_salary, allowances, deductions, net_salary)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [(run_id, employee_id, base, allowances, deductions, net)
                 for employee_id, base, allowances, deductions, net in payslips],
            )
            from modules.accounting_engine import record_payroll_run
            record_payroll_run(
                run_id, base_total, allowance_total, deduction_total, net_total,
                cursor_obj=cursor, entry_date=period_end,
            )
            return {
                "id": run_id,
                "reference": f"PAYROLL-{run_id}",
                "employee_count": len(payslips),
                "total_net": net_total,
            }

    def payroll_run_details(self, run_id):
        run_id = self._integer(run_id, "Payroll run", 1)
        header = self._one("SELECT * FROM payroll_runs WHERE id = ?", (run_id,))
        if not header:
            return None, []
        lines = self._all(
            """
            SELECT p.id, e.employee_code, e.name, e.role,
                   p.base_salary, p.allowances, p.deductions, p.net_salary
            FROM payslips p JOIN employees e ON e.id = p.employee_id
            WHERE p.payroll_run_id = ? ORDER BY e.name COLLATE NOCASE
            """,
            (run_id,),
        )
        return header, lines

    def list_payslips(self, run_id=None):
        if run_id is None:
            return self._all(
                """
                SELECT p.id, r.id AS run_id, r.period_start, r.period_end, e.name,
                       p.base_salary, p.allowances, p.deductions, p.net_salary
                FROM payslips p
                JOIN payroll_runs r ON r.id = p.payroll_run_id
                JOIN employees e ON e.id = p.employee_id
                ORDER BY r.id DESC, e.name COLLATE NOCASE
                """
            )
        run_id = self._integer(run_id, "Payroll run", 1)
        return self._all(
            """
            SELECT p.id, r.id AS run_id, r.period_start, r.period_end, e.name,
                   p.base_salary, p.allowances, p.deductions, p.net_salary
            FROM payslips p
            JOIN payroll_runs r ON r.id = p.payroll_run_id
            JOIN employees e ON e.id = p.employee_id
            WHERE r.id = ? ORDER BY e.name COLLATE NOCASE
            """,
            (run_id,),
        )

    # ---------------------------
    # Fixed assets (Immobilisations)
    # ---------------------------
    ASSET_CATEGORIES = ("Equipment", "Vehicle", "Furniture", "IT & Software", "Building", "Other")

    def list_assets(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT a.id, a.asset_code, a.name, a.category, a.acquisition_date,
                   a.acquisition_cost, a.salvage_value, a.useful_life_years, a.notes, a.is_active,
                   COALESCE(d.accumulated, 0) AS accumulated_depreciation,
                   a.acquisition_cost - COALESCE(d.accumulated, 0) AS net_book_value
            FROM fixed_assets a
            LEFT JOIN (
                SELECT asset_id, SUM(amount) AS accumulated
                FROM depreciation_entries GROUP BY asset_id
            ) d ON d.asset_id = a.id
            WHERE a.asset_code LIKE ? OR a.name LIKE ? OR COALESCE(a.category, '') LIKE ?
            ORDER BY a.asset_code
            """,
            (term, term, term),
        )

    def save_asset(
        self, asset_code, name, category, acquisition_date, acquisition_cost,
        salvage_value, useful_life_years, notes="", asset_id=None,
    ):
        asset_code = self._text(asset_code, "Asset code", 24)
        name = self._text(name, "Asset name", 160)
        if category not in self.ASSET_CATEGORIES:
            raise ValueError("Choose a valid asset category.")
        acquisition_date = self._date(acquisition_date, "Acquisition date")
        acquisition_cost = self._amount(acquisition_cost, "Acquisition cost", allow_zero=False)
        salvage_value = self._amount(salvage_value, "Salvage value")
        if salvage_value > acquisition_cost:
            raise ValueError("Salvage value cannot exceed the acquisition cost.")
        useful_life_years = self._integer(useful_life_years, "Useful life (years)", 1)
        notes = self._text(notes, "Notes", 240, required=False)
        with self._transaction() as cursor:
            if asset_id:
                cursor.execute(
                    """
                    UPDATE fixed_assets SET asset_code = ?, name = ?, category = ?,
                       acquisition_date = ?, acquisition_cost = ?, salvage_value = ?,
                       useful_life_years = ?, notes = ?
                    WHERE id = ?
                    """,
                    (asset_code, name, category, acquisition_date, acquisition_cost,
                     salvage_value, useful_life_years, notes, asset_id),
                )
                if cursor.rowcount != 1:
                    raise ValueError("Asset was not found.")
                return asset_id
            cursor.execute(
                """
                INSERT INTO fixed_assets
                    (asset_code, name, category, acquisition_date, acquisition_cost,
                     salvage_value, useful_life_years, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (asset_code, name, category, acquisition_date, acquisition_cost,
                 salvage_value, useful_life_years, notes),
            )
            asset_id = cursor.lastrowid
            from modules.accounting_engine import record_asset_acquisition
            record_asset_acquisition(
                asset_id, acquisition_cost, "Bank", cursor_obj=cursor, entry_date=acquisition_date,
            )
            return asset_id

    def delete_asset(self, asset_id):
        asset_id = self._integer(asset_id, "Asset", 1)
        with self._transaction() as cursor:
            cursor.execute("SELECT id FROM fixed_assets WHERE id = ?", (asset_id,))
            if cursor.fetchone() is None:
                raise ValueError("Asset was not found.")
            cursor.execute("SELECT 1 FROM depreciation_entries WHERE asset_id = ? LIMIT 1", (asset_id,))
            if cursor.fetchone():
                raise ValueError("An asset with posted depreciation cannot be deleted. Deactivate it instead.")
            cursor.execute("DELETE FROM fixed_assets WHERE id = ?", (asset_id,))

    def set_asset_active(self, asset_id, active):
        asset_id = self._integer(asset_id, "Asset", 1)
        with self._transaction() as cursor:
            cursor.execute("UPDATE fixed_assets SET is_active = ? WHERE id = ?", (int(bool(active)), asset_id))
            if cursor.rowcount != 1:
                raise ValueError("Asset was not found.")

    def list_depreciation(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT d.id, d.period_year, d.posted_date, d.amount, a.asset_code, a.name AS asset_name,
                   COALESCE(
                       (SELECT SUM(d2.amount) FROM depreciation_entries d2
                        WHERE d2.asset_id = d.asset_id AND d2.period_year <= d.period_year),
                       d.amount
                   ) AS cumulative
            FROM depreciation_entries d
            JOIN fixed_assets a ON a.id = d.asset_id
            WHERE a.asset_code LIKE ? OR a.name LIKE ? OR d.period_year LIKE ?
            ORDER BY d.period_year DESC, d.id DESC
            """,
            (term, term, term),
        )

    def post_depreciation(self, asset_id, period_year):
        asset_id = self._integer(asset_id, "Asset", 1)
        period_year = str(period_year).strip()
        try:
            int(period_year)
        except ValueError as error:
            raise ValueError("Period year must be a four-digit year such as 2026.") from error
        with self._transaction() as cursor:
            cursor.execute(
                """
                SELECT id, acquisition_cost, salvage_value, useful_life_years, is_active
                FROM fixed_assets WHERE id = ?
                """,
                (asset_id,),
            )
            asset = cursor.fetchone()
            if asset is None:
                raise ValueError("Asset was not found.")
            cost, salvage, life = float(asset[1] or 0), float(asset[2] or 0), int(asset[3] or 0)
            if not asset[4]:
                raise ValueError("The asset is deactivated; reactivate it before posting depreciation.")
            depreciable = round(cost - salvage, 2)
            if depreciable <= 0:
                raise ValueError("The asset has no depreciable amount.")
            cursor.execute(
                "SELECT COALESCE(SUM(amount), 0) FROM depreciation_entries WHERE asset_id = ?",
                (asset_id,),
            )
            accumulated = float(cursor.fetchone()[0] or 0)
            remaining = round(depreciable - accumulated, 2)
            if remaining <= 0:
                raise ValueError("The asset is fully depreciated.")
            cursor.execute(
                "SELECT 1 FROM depreciation_entries WHERE asset_id = ? AND period_year = ? LIMIT 1",
                (asset_id, period_year),
            )
            if cursor.fetchone():
                raise ValueError(f"Depreciation for {period_year} is already posted for this asset.")
            annual = round(depreciable / life, 2)
            amount = round(min(annual, remaining), 2)
            posted_date = date.today().isoformat()
            cursor.execute(
                "INSERT INTO depreciation_entries (asset_id, period_year, posted_date, amount) VALUES (?, ?, ?, ?)",
                (asset_id, period_year, posted_date, amount),
            )
            from modules.accounting_engine import record_depreciation
            record_depreciation(
                asset_id, amount, period_year, cursor_obj=cursor, entry_date=posted_date,
            )
            return {"amount": amount, "period_year": period_year, "annual": annual}

    # ---------------------------
    # Treasury (Trésorerie)
    # ---------------------------
    def list_bank_accounts(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT b.id, b.account_name, b.bank_name, b.account_number,
                   b.opening_balance, b.is_active,
                   COALESCE(m.net, 0) AS net_movements,
                   b.opening_balance + COALESCE(m.net, 0) AS current_balance
            FROM bank_accounts b
            LEFT JOIN (
                SELECT bank_account_id,
                       SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) AS net
                FROM cash_movements GROUP BY bank_account_id
            ) m ON m.bank_account_id = b.id
            WHERE b.account_name LIKE ? OR COALESCE(b.bank_name, '') LIKE ? OR COALESCE(b.account_number, '') LIKE ?
            ORDER BY b.account_name COLLATE NOCASE
            """,
            (term, term, term),
        )

    def save_bank_account(self, account_name, bank_name, account_number, opening_balance=0, account_id=None):
        account_name = self._text(account_name, "Account name", 120)
        bank_name = self._text(bank_name, "Bank name", 120, required=False)
        account_number = self._text(account_number, "Account number", 60, required=False)
        opening_balance = self._amount(opening_balance, "Opening balance")
        with self._transaction() as cursor:
            if account_id:
                cursor.execute(
                    """
                    UPDATE bank_accounts SET account_name = ?, bank_name = ?,
                       account_number = ?, opening_balance = ? WHERE id = ?
                    """,
                    (account_name, bank_name, account_number, opening_balance, account_id),
                )
                if cursor.rowcount != 1:
                    raise ValueError("Bank account was not found.")
                return account_id
            cursor.execute(
                "INSERT INTO bank_accounts (account_name, bank_name, account_number, opening_balance) VALUES (?, ?, ?, ?)",
                (account_name, bank_name, account_number, opening_balance),
            )
            return cursor.lastrowid

    def delete_bank_account(self, account_id):
        account_id = self._integer(account_id, "Bank account", 1)
        with self._transaction() as cursor:
            cursor.execute("SELECT id FROM bank_accounts WHERE id = ?", (account_id,))
            if cursor.fetchone() is None:
                raise ValueError("Bank account was not found.")
            cursor.execute("SELECT 1 FROM cash_movements WHERE bank_account_id = ? LIMIT 1", (account_id,))
            if cursor.fetchone():
                raise ValueError("A bank account with posted movements cannot be deleted. Deactivate it instead.")
            cursor.execute("DELETE FROM bank_accounts WHERE id = ?", (account_id,))

    def set_bank_account_active(self, account_id, active):
        account_id = self._integer(account_id, "Bank account", 1)
        with self._transaction() as cursor:
            cursor.execute("UPDATE bank_accounts SET is_active = ? WHERE id = ?", (int(bool(active)), account_id))
            if cursor.rowcount != 1:
                raise ValueError("Bank account was not found.")

    def list_cash_movements(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT m.id, m.movement_date, m.direction, m.amount, COALESCE(m.description, '') AS description,
                   b.account_name,
                   'TREAS-' || printf('%06d', m.id) AS reference
            FROM cash_movements m
            JOIN bank_accounts b ON b.id = m.bank_account_id
            WHERE m.movement_date LIKE ? OR m.description LIKE ? OR b.account_name LIKE ?
                 OR ('TREAS-' || printf('%06d', m.id)) LIKE ?
            ORDER BY m.id DESC
            """,
            (term, term, term, term),
        )

    def create_cash_movement(self, bank_account_id, movement_date, direction, amount, description=""):
        bank_account_id = self._integer(bank_account_id, "Bank account", 1)
        movement_date = self._date(movement_date, "Movement date")
        if direction not in ("in", "out"):
            raise ValueError("Choose a direction: money in or money out.")
        amount = self._amount(amount, "Amount", allow_zero=False)
        description = self._text(description, "Description", 240, required=False)
        with self._transaction() as cursor:
            cursor.execute("SELECT id, is_active FROM bank_accounts WHERE id = ?", (bank_account_id,))
            account = cursor.fetchone()
            if account is None:
                raise ValueError("Bank account was not found.")
            if not account[1]:
                raise ValueError("The bank account is deactivated.")
            cursor.execute(
                """
                INSERT INTO cash_movements (bank_account_id, movement_date, direction, amount, description)
                VALUES (?, ?, ?, ?, ?)
                """,
                (bank_account_id, movement_date, direction, amount, description),
            )
            movement_id = cursor.lastrowid
            from modules.accounting_engine import record_treasury_movement
            record_treasury_movement(
                movement_id, direction, amount, cursor_obj=cursor, entry_date=movement_date,
            )
            return {"id": movement_id, "reference": f"TREAS-{movement_id:06d}", "amount": amount}

    def treasury_positions(self):
        accounts = self.list_bank_accounts()
        total_opening = total_net = 0.0
        for account in accounts:
            account["net_movements"] = float(account["net_movements"] or 0)
            account["current_balance"] = float(account["current_balance"] or 0)
            total_opening += float(account["opening_balance"] or 0)
            total_net += account["net_movements"]
        return accounts, {
            "opening": round(total_opening, 2),
            "net": round(total_net, 2),
            "total": round(total_opening + total_net, 2),
        }

    # ---------------------------
    # Bank reconciliation (Rapprochement)
    # ---------------------------
    def list_statement_lines(self, search="", account_id=None):
        term = f"%{str(search or '').strip()}%"
        account_filter = "AND b.id = ?" if account_id else ""
        params = (term, term, term, term, term) + ((account_id,) if account_id else ())
        return self._all(
            f"""
            SELECT l.id, b.id AS bank_account_id, l.statement_date, COALESCE(l.reference, '') AS reference,
                   COALESCE(l.description, '') AS description, l.direction, l.amount,
                   l.is_reconciled, l.reconciled_date, l.matched_movement_id,
                   b.account_name,
                   COALESCE('TREAS-' || printf('%06d', l.matched_movement_id), '') AS matched_reference
            FROM bank_statement_lines l
            JOIN bank_accounts b ON b.id = l.bank_account_id
            WHERE l.statement_date LIKE ? OR l.reference LIKE ? OR l.description LIKE ?
                   OR b.account_name LIKE ?
                   {account_filter}
            ORDER BY l.id DESC
            """,
            params,
        )

    def add_statement_line(self, bank_account_id, statement_date, direction, amount, reference="", description=""):
        bank_account_id = self._integer(bank_account_id, "Bank account", 1)
        statement_date = self._date(statement_date, "Statement date")
        if direction not in ("in", "out"):
            raise ValueError("Choose a direction: money in or money out.")
        amount = self._amount(amount, "Amount", allow_zero=False)
        reference = self._text(reference, "Reference", 80, required=False)
        description = self._text(description, "Description", 240, required=False)
        with self._transaction() as cursor:
            cursor.execute("SELECT id FROM bank_accounts WHERE id = ?", (bank_account_id,))
            if cursor.fetchone() is None:
                raise ValueError("Bank account was not found.")
            cursor.execute(
                """
                INSERT INTO bank_statement_lines
                    (bank_account_id, statement_date, reference, description, direction, amount)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (bank_account_id, statement_date, reference, description, direction, amount),
            )
            return cursor.lastrowid

    def delete_statement_line(self, line_id):
        line_id = self._integer(line_id, "Statement line", 1)
        with self._transaction() as cursor:
            cursor.execute("SELECT is_reconciled FROM bank_statement_lines WHERE id = ?", (line_id,))
            line = cursor.fetchone()
            if line is None:
                raise ValueError("Statement line was not found.")
            if line[0]:
                raise ValueError("A reconciled line cannot be deleted. Unreconcile it first.")
            cursor.execute("DELETE FROM bank_statement_lines WHERE id = ?", (line_id,))

    def list_reconcilable_movements(self, bank_account_id):
        bank_account_id = self._integer(bank_account_id, "Bank account", 1)
        return self._all(
            """
            SELECT m.id, m.movement_date, m.direction, m.amount, COALESCE(m.description, '') AS description,
                   'TREAS-' || printf('%06d', m.id) AS reference
            FROM cash_movements m
            WHERE m.bank_account_id = ?
              AND NOT EXISTS (
                  SELECT 1 FROM bank_statement_lines l
                  WHERE l.matched_movement_id = m.id
              )
            ORDER BY m.movement_date DESC, m.id DESC
            """,
            (bank_account_id,),
        )

    def reconcile_statement_line(self, line_id, movement_id=None):
        line_id = self._integer(line_id, "Statement line", 1)
        with self._transaction() as cursor:
            cursor.execute(
                """
                SELECT l.id, l.bank_account_id, l.amount, l.is_reconciled
                FROM bank_statement_lines l WHERE l.id = ?
                """,
                (line_id,),
            )
            line = cursor.fetchone()
            if line is None:
                raise ValueError("Statement line was not found.")
            if line[3]:
                raise ValueError("This line is already reconciled.")
            if movement_id is None:
                raise ValueError("Select the treasury movement to match.")
            movement_id = self._integer(movement_id, "Movement", 1)
            cursor.execute(
                "SELECT id, bank_account_id FROM cash_movements WHERE id = ?",
                (movement_id,),
            )
            movement = cursor.fetchone()
            if movement is None:
                raise ValueError("Treasury movement was not found.")
            if movement[1] != line[1]:
                raise ValueError("The movement belongs to a different bank account.")
            cursor.execute(
                "SELECT 1 FROM bank_statement_lines WHERE matched_movement_id = ? LIMIT 1",
                (movement_id,),
            )
            if cursor.fetchone():
                raise ValueError("That movement is already matched to another statement line.")
            reconciled_date = date.today().isoformat()
            cursor.execute(
                """
                UPDATE bank_statement_lines
                SET is_reconciled = 1, reconciled_date = ?, matched_movement_id = ?
                WHERE id = ?
                """,
                (reconciled_date, movement_id, line_id),
            )
            return reconciled_date

    def unreconcile_statement_line(self, line_id):
        line_id = self._integer(line_id, "Statement line", 1)
        with self._transaction() as cursor:
            cursor.execute(
                """
                UPDATE bank_statement_lines
                SET is_reconciled = 0, reconciled_date = NULL, matched_movement_id = NULL
                WHERE id = ?
                """,
                (line_id,),
            )
            if cursor.rowcount != 1:
                raise ValueError("Statement line was not found.")

    def reconciliation_summary(self, account_id=None):
        if account_id:
            account_id = self._integer(account_id, "Bank account", 1)
            positions, totals = self.treasury_positions()
            account = next((row for row in positions if row["id"] == account_id), None)
            if account is None:
                raise ValueError("Bank account was not found.")
            book_balance = account["current_balance"]
            statement = self._one(
                """
                SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS net
                FROM bank_statement_lines WHERE bank_account_id = ?
                """,
                (account_id,),
            )
            reconciled = self._one(
                """
                SELECT COUNT(*) AS count,
                       COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS net
                FROM bank_statement_lines
                WHERE bank_account_id = ? AND is_reconciled = 1
                """,
                (account_id,),
            )
        else:
            _positions, totals = self.treasury_positions()
            book_balance = totals["total"]
            statement = self._one(
                "SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS net FROM bank_statement_lines"
            )
            reconciled = self._one(
                """
                SELECT COUNT(*) AS count,
                       COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS net
                FROM bank_statement_lines WHERE is_reconciled = 1
                """
            )
        statement_net = float(statement["net"] or 0)
        return {
            "book_balance": book_balance,
            "statement_balance": statement_net,
            "difference": round(book_balance - statement_net, 2),
            "reconciled_count": int(reconciled["count"] or 0),
            "reconciled_amount": float(reconciled["net"] or 0),
        }

    # ---------------------------
    # Cash office (Moyens de paiement)
    # ---------------------------
    def list_registers(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT r.id, r.register_name, r.opening_balance, r.is_active,
                   COALESCE(m.net, 0) AS net_movements,
                   r.opening_balance + COALESCE(m.net, 0) AS expected_cash
            FROM cash_registers r
            LEFT JOIN (
                SELECT register_id,
                       SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) AS net
                FROM register_movements GROUP BY register_id
            ) m ON m.register_id = r.id
            WHERE r.register_name LIKE ?
            ORDER BY r.register_name COLLATE NOCASE
            """,
            (term,),
        )

    def save_register(self, register_name, opening_balance=0, register_id=None):
        register_name = self._text(register_name, "Register name", 120)
        opening_balance = self._amount(opening_balance, "Opening float")
        with self._transaction() as cursor:
            if register_id:
                cursor.execute(
                    "UPDATE cash_registers SET register_name = ?, opening_balance = ? WHERE id = ?",
                    (register_name, opening_balance, register_id),
                )
                if cursor.rowcount != 1:
                    raise ValueError("Cash register was not found.")
                return register_id
            cursor.execute(
                "INSERT INTO cash_registers (register_name, opening_balance) VALUES (?, ?)",
                (register_name, opening_balance),
            )
            return cursor.lastrowid

    def delete_register(self, register_id):
        register_id = self._integer(register_id, "Cash register", 1)
        with self._transaction() as cursor:
            cursor.execute("SELECT id FROM cash_registers WHERE id = ?", (register_id,))
            if cursor.fetchone() is None:
                raise ValueError("Cash register was not found.")
            cursor.execute("SELECT 1 FROM register_movements WHERE register_id = ? LIMIT 1", (register_id,))
            if cursor.fetchone():
                raise ValueError("A register with recorded movements cannot be deleted. Deactivate it instead.")
            cursor.execute("DELETE FROM cash_registers WHERE id = ?", (register_id,))

    def set_register_active(self, register_id, active):
        register_id = self._integer(register_id, "Cash register", 1)
        with self._transaction() as cursor:
            cursor.execute("UPDATE cash_registers SET is_active = ? WHERE id = ?", (int(bool(active)), register_id))
            if cursor.rowcount != 1:
                raise ValueError("Cash register was not found.")

    def list_register_movements(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT m.id, m.movement_date, m.direction, m.amount, COALESCE(m.description, '') AS description,
                   r.register_name
            FROM register_movements m
            JOIN cash_registers r ON r.id = m.register_id
            WHERE m.movement_date LIKE ? OR m.description LIKE ? OR r.register_name LIKE ?
            ORDER BY m.id DESC
            """,
            (term, term, term),
        )

    def add_register_movement(self, register_id, movement_date, direction, amount, description=""):
        register_id = self._integer(register_id, "Cash register", 1)
        movement_date = self._date(movement_date, "Movement date")
        if direction not in ("in", "out"):
            raise ValueError("Choose a direction: money in or money out.")
        amount = self._amount(amount, "Amount", allow_zero=False)
        description = self._text(description, "Description", 240, required=False)
        with self._transaction() as cursor:
            cursor.execute("SELECT id, is_active FROM cash_registers WHERE id = ?", (register_id,))
            register = cursor.fetchone()
            if register is None:
                raise ValueError("Cash register was not found.")
            if not register[1]:
                raise ValueError("The cash register is deactivated.")
            cursor.execute(
                """
                INSERT INTO register_movements (register_id, movement_date, direction, amount, description)
                VALUES (?, ?, ?, ?, ?)
                """,
                (register_id, movement_date, direction, amount, description),
            )
            return cursor.lastrowid

    def list_register_closings(self, search=""):
        term = f"%{str(search or '').strip()}%"
        return self._all(
            """
            SELECT c.id, c.closing_date, c.expected_amount, c.actual_amount, c.difference, r.register_name
            FROM register_closings c
            JOIN cash_registers r ON r.id = c.register_id
            WHERE c.closing_date LIKE ? OR r.register_name LIKE ?
            ORDER BY c.id DESC
            """,
            (term, term),
        )

    def close_register(self, register_id, closing_date, actual_amount):
        register_id = self._integer(register_id, "Cash register", 1)
        closing_date = self._date(closing_date, "Closing date")
        actual_amount = self._amount(actual_amount, "Counted amount")
        with self._transaction() as cursor:
            cursor.execute("SELECT id, opening_balance FROM cash_registers WHERE id = ?", (register_id,))
            register = cursor.fetchone()
            if register is None:
                raise ValueError("Cash register was not found.")
            cursor.execute(
                """
                SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
                FROM register_movements WHERE register_id = ? AND movement_date <= ?
                """,
                (register_id, closing_date),
            )
            net = float(cursor.fetchone()[0] or 0)
            expected = round(float(register[1] or 0) + net, 2)
            difference = round(actual_amount - expected, 2)
            cursor.execute(
                """
                INSERT INTO register_closings (register_id, closing_date, expected_amount, actual_amount, difference)
                VALUES (?, ?, ?, ?, ?)
                """,
                (register_id, closing_date, expected, actual_amount, difference),
            )
            closing_id = cursor.lastrowid
            from modules.accounting_engine import record_register_variance
            record_register_variance(
                closing_id, difference, cursor_obj=cursor, entry_date=closing_date,
            )
            return {
                "id": closing_id,
                "expected": expected,
                "actual": actual_amount,
                "difference": difference,
            }
