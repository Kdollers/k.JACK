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

    def save_settings(self, company_name, currency_code):
        company_name = self._text(company_name, "Company name", 120)
        currency_code = self._text(currency_code, "Currency code", 3).upper()
        if len(currency_code) != 3 or not currency_code.isalpha():
            raise ValueError("Currency code must be a three-letter code such as XAF.")
        with self._transaction() as cursor:
            for name, value in (
                ("company_name", company_name),
                ("currency_code", currency_code),
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
