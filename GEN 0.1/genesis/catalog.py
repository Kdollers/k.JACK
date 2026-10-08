"""Master data: warehouses, product categories, products, customers and suppliers."""

import re

from .accounts import _account_must_be
from .errors import AccountingError, Conflict, NotFound, ValidationError
from .ledger import post_entry
from .money import optional_iso_date, parse_money, parse_quantity
from .timeutil import now_iso, today_iso
from .company import currency_info

CODE_RE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._\-]{0,29}$")


def _text(data, key, required=False, field=None, max_len=200):
    value = data.get(key)
    value = "" if value is None else str(value).strip()
    if required and not value:
        raise ValidationError("field_required", field=field or key)
    if len(value) > max_len:
        raise ValidationError("text_too_long", field=field or key, max=max_len)
    return value or None


def _flag(data, key, default=True):
    if key not in data:
        return 1 if default else 0
    return 1 if data[key] else 0


# ----------------------------------------------------------------------
# Warehouses
# ----------------------------------------------------------------------

def list_warehouses(db, active_only=False):
    sql = "SELECT * FROM warehouses"
    if active_only:
        sql += " WHERE is_active = 1"
    return db.query(sql + " ORDER BY code")


def save_warehouse(ctx, data, warehouse_id=None):
    ctx.require("products.manage")
    db = ctx.db
    code = _text(data, "code", required=True, field="code", max_len=20)
    if not CODE_RE.match(code):
        raise ValidationError("invalid_code", field="code")
    fields = {
        "code": code.upper(),
        "name": _text(data, "name", required=True, field="name"),
        "address": _text(data, "address"),
        "is_active": _flag(data, "is_active"),
    }
    with db.transaction():
        clash = db.one("SELECT id FROM warehouses WHERE code = ? AND id IS NOT ?",
                       (fields["code"], warehouse_id))
        if clash:
            raise Conflict("duplicate_code", code=fields["code"])
        if warehouse_id is None:
            warehouse_id = db.insert("warehouses", fields)
            ctx.audit("create", "inventory", "warehouse", warehouse_id, new_value=fields)
        else:
            before = db.one("SELECT * FROM warehouses WHERE id = ?", (warehouse_id,))
            if before is None:
                raise NotFound("warehouse_not_found", id=warehouse_id)
            if not fields["is_active"] and db.scalar(
                    "SELECT COALESCE(SUM(qty_scaled), 0) FROM stock_levels WHERE warehouse_id = ?",
                    (warehouse_id,), 0):
                raise AccountingError("warehouse_has_stock")
            db.update("warehouses", fields, "id = ?", (warehouse_id,))
            ctx.audit("update", "inventory", "warehouse", warehouse_id, old_value=before, new_value=fields)
    return db.one("SELECT * FROM warehouses WHERE id = ?", (warehouse_id,))


# ----------------------------------------------------------------------
# Categories
# ----------------------------------------------------------------------

def list_categories(db, active_only=False):
    sql = ("SELECT c.*, ia.code AS inventory_code, ra.code AS revenue_code, ca.code AS cogs_code "
           "FROM categories c LEFT JOIN accounts ia ON ia.id = c.inventory_account_id "
           "LEFT JOIN accounts ra ON ra.id = c.revenue_account_id "
           "LEFT JOIN accounts ca ON ca.id = c.cogs_account_id")
    if active_only:
        sql += " WHERE c.is_active = 1"
    return db.query(sql + " ORDER BY c.name")


def save_category(ctx, data, category_id=None):
    ctx.require("products.manage")
    db = ctx.db
    name = _text(data, "name", required=True, field="name")
    with db.transaction():
        inventory_id = _account_must_be(db, data.get("inventory_account_id"), ("asset",), "inventory_account_id")
        revenue_id = _account_must_be(db, data.get("revenue_account_id"), ("revenue",), "revenue_account_id")
        cogs_id = _account_must_be(db, data.get("cogs_account_id"), ("cogs", "expense"), "cogs_account_id")
        fields = {
            "name": name,
            "inventory_account_id": inventory_id,
            "revenue_account_id": revenue_id,
            "cogs_account_id": cogs_id,
            "is_active": _flag(data, "is_active"),
        }
        if db.one("SELECT 1 FROM categories WHERE name = ? AND id IS NOT ?", (name, category_id)):
            raise Conflict("duplicate_value", detail=name)
        if category_id is None:
            category_id = db.insert("categories", fields)
            ctx.audit("create", "inventory", "category", category_id, new_value=fields)
        else:
            before = db.one("SELECT * FROM categories WHERE id = ?", (category_id,))
            if before is None:
                raise NotFound("category_not_found", id=category_id)
            db.update("categories", fields, "id = ?", (category_id,))
            ctx.audit("update", "inventory", "category", category_id, old_value=before, new_value=fields)
    return db.one("SELECT * FROM categories WHERE id = ?", (category_id,))


# ----------------------------------------------------------------------
# Products
# ----------------------------------------------------------------------

PRODUCT_SELECT = """
    SELECT p.*, c.name AS category_name, t.name AS tax_name, t.rate_bps AS tax_bps,
           COALESCE(s.qty, 0) AS qty_scaled, COALESCE(s.val, 0) AS value_minor
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN tax_rates t ON t.id = p.tax_rate_id
    LEFT JOIN (SELECT product_id, SUM(qty_scaled) AS qty, SUM(value_minor) AS val
               FROM stock_levels GROUP BY product_id) s ON s.product_id = p.id
"""


def list_products(db, q=None, category_id=None, active=None, low_stock=False, track_stock=None):
    sql = PRODUCT_SELECT + " WHERE 1=1"
    params = []
    if q:
        sql += " AND (p.sku LIKE ? OR p.name LIKE ? OR p.barcode LIKE ?)"
        params += [f"%{q}%"] * 3
    if category_id:
        sql += " AND p.category_id = ?"
        params.append(int(category_id))
    if active is not None:
        sql += " AND p.is_active = ?"
        params.append(1 if active else 0)
    if track_stock is not None:
        sql += " AND p.track_stock = ?"
        params.append(1 if track_stock else 0)
    if low_stock:
        sql += " AND p.track_stock = 1 AND p.min_stock_scaled > 0 AND COALESCE(s.qty, 0) <= p.min_stock_scaled"
    sql += " ORDER BY p.sku"
    return db.query(sql, params)


def get_product(db, product_id):
    row = db.one(PRODUCT_SELECT + " WHERE p.id = ?", (product_id,))
    if row is None:
        raise NotFound("product_not_found", id=product_id)
    return row


def product_stock_by_warehouse(db, product_id):
    return db.query(
        "SELECT w.id AS warehouse_id, w.code, w.name, COALESCE(sl.qty_scaled, 0) AS qty_scaled, "
        "COALESCE(sl.value_minor, 0) AS value_minor FROM warehouses w "
        "LEFT JOIN stock_levels sl ON sl.warehouse_id = w.id AND sl.product_id = ? ORDER BY w.code",
        (product_id,))


def save_product(ctx, data, product_id=None):
    ctx.require("products.manage")
    db = ctx.db
    decimals, _symbol = currency_info(db)
    sku = _text(data, "sku", required=True, field="sku", max_len=30)
    if not CODE_RE.match(sku):
        raise ValidationError("invalid_code", field="sku")
    barcode = _text(data, "barcode", max_len=60)
    name = _text(data, "name", required=True, field="name")
    unit = _text(data, "unit", max_len=20) or "pcs"
    cost = parse_money(data.get("cost_price", 0), decimals, field="cost_price")
    price = parse_money(data.get("selling_price", 0), decimals, field="selling_price")
    min_stock = parse_quantity(data.get("min_stock", 0), field="min_stock", allow_zero=True)
    with db.transaction():
        if data.get("category_id") in (None, ""):
            # No category chosen: use the company's first active category (General from setup).
            category = db.one("SELECT * FROM categories WHERE is_active = 1 ORDER BY id LIMIT 1")
        else:
            category = db.one("SELECT * FROM categories WHERE id = ?", (int(data["category_id"]),))
        if category is None or not category["is_active"]:
            raise ValidationError("invalid_reference", field="category_id")
        tax_id = data.get("tax_rate_id") or None
        if tax_id is not None:
            tax = db.one("SELECT * FROM tax_rates WHERE id = ?", (int(tax_id),))
            if tax is None or not tax["is_active"]:
                raise ValidationError("invalid_reference", field="tax_rate_id")
            tax_id = tax["id"]
        fields = {
            "sku": sku.upper(),
            "barcode": barcode,
            "name": name,
            "description": _text(data, "description", max_len=1000),
            "category_id": category["id"],
            "unit": unit,
            "cost_price_minor": cost,
            "selling_price_minor": price,
            "tax_rate_id": tax_id,
            "min_stock_scaled": min_stock,
            "location": _text(data, "location", max_len=60),
            "track_stock": _flag(data, "track_stock"),
            "is_active": _flag(data, "is_active"),
            "updated_at": now_iso(),
        }
        if db.one("SELECT 1 FROM products WHERE sku = ? COLLATE NOCASE AND id IS NOT ?",
                  (fields["sku"], product_id)):
            raise Conflict("duplicate_code", code=fields["sku"])
        if barcode and db.one("SELECT 1 FROM products WHERE barcode = ? AND id IS NOT ?",
                              (barcode, product_id)):
            raise Conflict("duplicate_code", code=barcode)
        if product_id is None:
            fields["created_at"] = now_iso()
            product_id = db.insert("products", fields)
            ctx.audit("create", "inventory", "product", product_id, new_value=fields)
        else:
            before = db.one("SELECT * FROM products WHERE id = ?", (product_id,))
            if before is None:
                raise NotFound("product_not_found", id=product_id)
            stock = db.scalar("SELECT COALESCE(SUM(qty_scaled), 0) FROM stock_levels WHERE product_id = ?",
                              (product_id,), 0)
            movements = db.scalar("SELECT COUNT(*) FROM stock_movements WHERE product_id = ?",
                                  (product_id,), 0)
            if before["track_stock"] != fields["track_stock"] and movements:
                raise AccountingError("product_stock_flag_locked")
            if stock and category["id"] != before["category_id"]:
                raise AccountingError("category_locked_with_stock")
            db.update("products", fields, "id = ?", (product_id,))
            ctx.audit("update", "inventory", "product", product_id, old_value=before, new_value=fields)
    return get_product(db, product_id)


# ----------------------------------------------------------------------
# Customers and suppliers
# ----------------------------------------------------------------------

PARTNER_KIND = {
    "customer": {"table": "customers", "role": "ar", "view": "customers.view",
                 "manage": "customers.manage", "not_found": "customer_not_found"},
    "supplier": {"table": "suppliers", "role": "ap", "view": "suppliers.view",
                 "manage": "suppliers.manage", "not_found": "supplier_not_found"},
}


def _partner_balance_expr(kind, ref):
    """Correlated SQL: outstanding amount for a partner, always positive when it is owed.

    Customers: AR debit minus credit (positive = the customer owes us).
    Suppliers: AP credit minus debit (positive = we owe the supplier).
    """
    role = PARTNER_KIND[kind]["role"]
    party = kind
    if kind == "customer":
        net = "COALESCE(SUM(jl.debit_minor), 0) - COALESCE(SUM(jl.credit_minor), 0)"
    else:
        net = "COALESCE(SUM(jl.credit_minor), 0) - COALESCE(SUM(jl.debit_minor), 0)"
    return (
        f"(SELECT {net} "
        "FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id "
        f"WHERE a.system_role = '{role}' AND jl.party_type = '{party}' AND jl.party_id = {ref})"
    )


def list_partners(db, kind, q=None, active=None):
    table = PARTNER_KIND[kind]["table"]
    sql = f"SELECT p.*, {_partner_balance_expr(kind, 'p.id')} AS balance_minor FROM {table} p WHERE 1=1"
    params = []
    if q:
        sql += " AND (p.code LIKE ? OR p.name LIKE ? OR p.phone LIKE ? OR p.email LIKE ?)"
        params += [f"%{q}%"] * 4
    if active is not None:
        sql += " AND p.is_active = ?"
        params.append(1 if active else 0)
    return db.query(sql + " ORDER BY p.name", params)


def get_partner(db, kind, partner_id):
    table = PARTNER_KIND[kind]["table"]
    row = db.one(f"SELECT p.*, {_partner_balance_expr(kind, '?')} AS balance_minor "
                 f"FROM {table} p WHERE p.id = ?", (partner_id, partner_id))
    if row is None:
        raise NotFound(PARTNER_KIND[kind]["not_found"], id=partner_id)
    return row


def partner_balance(db, kind, partner_id):
    """Outstanding balance from the ledger (see _partner_balance_expr for the sign convention)."""
    return get_partner(db, kind, partner_id)["balance_minor"]


def _partner_fields(db, data, kind):
    decimals, _ = currency_info(db)
    email = _text(data, "email", max_len=120)
    if email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise ValidationError("invalid_email")
    terms = data.get("payment_terms_days", 0)
    try:
        terms = int(terms or 0)
    except (TypeError, ValueError) as error:
        raise ValidationError("invalid_number", field="payment_terms_days") from error
    if not 0 <= terms <= 365:
        raise ValidationError("invalid_number", field="payment_terms_days")
    fields = {
        "name": _text(data, "name", required=True, field="name"),
        "address": _text(data, "address", max_len=300),
        "phone": _text(data, "phone", max_len=40),
        "email": email,
        "tax_number": _text(data, "tax_number", max_len=60),
        "payment_terms_days": terms,
        "is_active": _flag(data, "is_active"),
        "notes": _text(data, "notes", max_len=1000),
    }
    if kind == "customer":
        fields["credit_limit_minor"] = parse_money(
            data.get("credit_limit", 0), decimals, field="credit_limit")
    return fields, decimals


def _next_partner_code(db, kind):
    prefix = "C" if kind == "customer" else "S"
    table = PARTNER_KIND[kind]["table"]
    number = db.scalar(f"SELECT COUNT(*) FROM {table}", (), 0) + 1
    while db.one(f"SELECT 1 FROM {table} WHERE code = ?", (f"{prefix}{number:05d}",)):
        number += 1
    return f"{prefix}{number:05d}"


def _post_opening_balance(ctx, kind, partner_id, amount_minor, date_value):
    """Post an opening balance against the control account and opening-balance equity.

    Customers: a positive amount is owed to us (debit AR).
    Suppliers: a positive amount is owed by us (credit AP).
    """
    if amount_minor == 0:
        return None
    from .company import system_account_ids
    roles = system_account_ids(db=ctx.db)
    control = roles[PARTNER_KIND[kind]["role"]]
    amount = abs(amount_minor)
    control_is_debit = (amount_minor > 0) if kind == "customer" else (amount_minor < 0)
    control_line = {"account_id": control, "party_type": kind, "party_id": partner_id,
                    "description": "Opening balance",
                    "debit_minor": amount if control_is_debit else 0,
                    "credit_minor": 0 if control_is_debit else amount}
    equity_line = {"account_id": roles["opening_equity"], "party_type": None, "party_id": None,
                   "description": "Opening balance",
                   "debit_minor": 0 if control_is_debit else amount,
                   "credit_minor": amount if control_is_debit else 0}
    return post_entry(ctx, entry_date=date_value, description=f"Opening balance - {kind} {partner_id}",
                      lines=[control_line, equity_line], reference=None,
                      source_type="opening_balance", source_id=partner_id)


def _active_opening_entry(db, partner_id):
    return db.one("SELECT * FROM journal_entries WHERE source_type = 'opening_balance' "
                  "AND source_id = ? AND reversal_of_id IS NULL "
                  "AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reversal_of_id = journal_entries.id) "
                  "ORDER BY id DESC LIMIT 1", (partner_id,))


def _replace_opening_balance(ctx, kind, partner_id, new_amount, opening_date):
    """Replace an opening-balance entry. Allowed only while the partner has no other activity."""
    from .ledger import reverse_entry
    db = ctx.db
    other = db.scalar(
        "SELECT COUNT(*) FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id "
        "WHERE jl.party_type = ? AND jl.party_id = ? AND je.reversal_of_id IS NULL "
        "AND NOT (je.source_type = 'opening_balance' AND je.source_id = ?)",
        (kind, partner_id, partner_id), 0)
    if other:
        raise AccountingError("opening_balance_locked")
    active = _active_opening_entry(db, partner_id)
    if active is not None:
        reverse_entry(ctx, active["id"], reason="Opening balance corrected", allow_source=True)
    _post_opening_balance(ctx, kind, partner_id, new_amount, opening_date)


def save_partner(ctx, kind, data, partner_id=None):
    ctx.require(PARTNER_KIND[kind]["manage"])
    db = ctx.db
    table = PARTNER_KIND[kind]["table"]
    with db.transaction():
        fields, decimals = _partner_fields(db, data, kind)
        code = _text(data, "code", max_len=30)
        if code and not CODE_RE.match(code):
            raise ValidationError("invalid_code", field="code")
        has_opening = "opening_balance" in data
        opening = parse_money(data.get("opening_balance", 0), decimals,
                              field="opening_balance", allow_negative=True)
        opening_date = optional_iso_date(data.get("opening_date"), "opening_date") or today_iso()
        if opening_date > today_iso():
            raise ValidationError("date_in_future", field="opening_date")
        if partner_id is None:
            # An opening balance is a journal entry: only users who may post journals may set one.
            if opening != 0:
                ctx.require("accounting.journal")
            code = code or _next_partner_code(db, kind)
            if db.one(f"SELECT 1 FROM {table} WHERE code = ?", (code,)):
                raise Conflict("duplicate_code", code=code)
            stamp = now_iso()
            fields.update({"code": code, "opening_balance_minor": opening,
                           "created_at": stamp, "updated_at": stamp})
            partner_id = db.insert(table, fields)
            ctx.audit("create", "partners", kind, partner_id, new_value=fields)
            _post_opening_balance(ctx, kind, partner_id, opening, opening_date)
        else:
            before = db.one(f"SELECT * FROM {table} WHERE id = ?", (partner_id,))
            if before is None:
                raise NotFound(PARTNER_KIND[kind]["not_found"], id=partner_id)
            if code and code != before["code"]:
                if db.one(f"SELECT 1 FROM {table} WHERE code = ? AND id <> ?", (code, partner_id)):
                    raise Conflict("duplicate_code", code=code)
                fields["code"] = code
            current_entry = _active_opening_entry(db, partner_id)
            date_changed = (has_opening and current_entry is not None
                            and opening_date != current_entry["entry_date"])
            if (has_opening and opening != before["opening_balance_minor"]) or date_changed:
                ctx.require("accounting.journal")
                _replace_opening_balance(ctx, kind, partner_id, opening, opening_date)
                fields["opening_balance_minor"] = opening
            fields["updated_at"] = now_iso()
            db.update(table, fields, "id = ?", (partner_id,))
            ctx.audit("update", "partners", kind, partner_id, old_value=before, new_value=fields)
    return get_partner(db, kind, partner_id)


def set_partner_active(ctx, kind, partner_id, active):
    ctx.require(PARTNER_KIND[kind]["manage"])
    table = PARTNER_KIND[kind]["table"]
    db = ctx.db
    with db.transaction():
        before = db.one(f"SELECT * FROM {table} WHERE id = ?", (partner_id,))
        if before is None:
            raise NotFound(PARTNER_KIND[kind]["not_found"], id=partner_id)
        db.update(table, {"is_active": 1 if active else 0, "updated_at": now_iso()},
                  "id = ?", (partner_id,))
        ctx.audit("update", "partners", kind, partner_id,
                  old_value={"is_active": before["is_active"]},
                  new_value={"is_active": 1 if active else 0})
    return get_partner(db, kind, partner_id)
