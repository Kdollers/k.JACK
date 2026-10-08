"""Chart of accounts, tax rates and payment methods."""

import re

from .errors import NotFound, ValidationError, AccountingError, Conflict
from .money import parse_percent_bps
from .timeutil import now_iso

ACCOUNT_TYPES = ("asset", "liability", "equity", "revenue", "cogs", "expense")
NORMAL_BALANCE = {
    "asset": "debit", "expense": "debit", "cogs": "debit",
    "liability": "credit", "equity": "credit", "revenue": "credit",
}
PAYMENT_KINDS = ("cash", "bank", "mobile", "other")
CODE_RE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z.\-]{1,19}$")

# Accounts that the posting engine relies on, keyed by a stable role name.
SYSTEM_ROLES = (
    "cash", "bank", "mobile_money", "ar", "tax_recoverable", "inventory",
    "ap", "tax_payable", "capital", "retained_earnings", "opening_equity",
    "sales_revenue", "other_income", "cogs", "general_expense", "stock_adjustment",
)

# Default chart: (code, name, type, is_header, parent_code, system_role).
DEFAULT_CHART = (
    ("1000", "coa_current_assets", "asset", 1, None, None),
    ("1010", "coa_cash_on_hand", "asset", 0, "1000", "cash"),
    ("1020", "coa_bank_account", "asset", 0, "1000", "bank"),
    ("1030", "coa_mobile_wallet", "asset", 0, "1000", "mobile_money"),
    ("1100", "coa_receivable", "asset", 0, "1000", "ar"),
    ("1150", "coa_tax_recoverable", "asset", 0, "1000", "tax_recoverable"),
    ("1200", "coa_inventory", "asset", 0, "1000", "inventory"),
    ("1500", "coa_fixed_assets", "asset", 0, "1000", None),
    ("2000", "coa_current_liabilities", "liability", 1, None, None),
    ("2010", "coa_payable", "liability", 0, "2000", "ap"),
    ("2100", "coa_tax_payable", "liability", 0, "2000", "tax_payable"),
    ("3000", "coa_equity", "equity", 1, None, None),
    ("3010", "coa_capital", "equity", 0, "3000", "capital"),
    ("3020", "coa_retained_earnings", "equity", 0, "3000", "retained_earnings"),
    ("3900", "coa_opening_equity", "equity", 0, "3000", "opening_equity"),
    ("4000", "coa_revenue", "revenue", 1, None, None),
    ("4010", "coa_sales_revenue", "revenue", 0, "4000", "sales_revenue"),
    ("4900", "coa_other_income", "revenue", 0, "4000", "other_income"),
    ("5000", "coa_cost_of_sales", "cogs", 1, None, None),
    ("5010", "coa_cogs", "cogs", 0, "5000", "cogs"),
    ("6000", "coa_operating_expenses", "expense", 1, None, None),
    ("6010", "coa_general_expenses", "expense", 0, "6000", "general_expense"),
    ("6900", "coa_inventory_adjustments", "expense", 0, "6000", "stock_adjustment"),
)

# Names in DEFAULT_CHART, TAX_PROFILES, and the seeded categories, warehouse
# and payment methods are translation keys. They are translated once, when the
# company is created, using the company's default language. Users may rename
# them afterwards; the system roles, not the names, drive posting.
# Tax profiles are starting points only; each company may edit its rates.
TAX_PROFILES = {
    "none": {"name": "tax_profile_none", "country": None, "rates": ()},
    "RW": {
        "name": "tax_profile_rw",
        "country": "RW",
        "rates": (
            {"code": "VAT18", "name": "tax_rate_vat18", "rate_bps": 1800},
            {"code": "EXEMPT", "name": "tax_rate_exempt", "rate_bps": 0},
        ),
    },
    "custom": {"name": "tax_profile_custom", "country": None, "rates": ()},
}


def _account_row(db, account_id):
    row = db.one("SELECT * FROM accounts WHERE id = ?", (account_id,))
    if row is None:
        raise NotFound("account_not_found", id=account_id)
    return row


def has_postings(db, account_id):
    return db.scalar("SELECT COUNT(*) FROM journal_lines WHERE account_id = ?", (account_id,), 0) > 0


def is_referenced(db, account_id):
    checks = (
        "SELECT 1 FROM tax_rates WHERE sales_account_id = ? OR purchase_account_id = ?",
        "SELECT 1 FROM payment_methods WHERE account_id = ?",
        "SELECT 1 FROM categories WHERE inventory_account_id = ? OR revenue_account_id = ? OR cogs_account_id = ?",
        "SELECT 1 FROM accounts WHERE parent_id = ?",
        "SELECT 1 FROM document_lines WHERE account_id = ?",
    )
    arity = (2, 1, 3, 1, 1)
    for sql, count in zip(checks, arity):
        if db.one(sql, (account_id,) * count):
            return True
    return False


def account_row_to_dict(db, row):
    from .ledger import account_balance

    data = dict(row)
    data["normal_balance"] = NORMAL_BALANCE[row["account_type"]]
    data["balance_minor"] = account_balance(db, row["id"])
    data["has_postings"] = has_postings(db, row["id"])
    return data


def list_accounts(db, q=None, account_type=None, active=None):
    sql = "SELECT * FROM accounts WHERE 1=1"
    params = []
    if q:
        sql += " AND (code LIKE ? OR name LIKE ?)"
        params += [f"%{q}%", f"%{q}%"]
    if account_type:
        sql += " AND account_type = ?"
        params.append(account_type)
    if active is not None:
        sql += " AND is_active = ?"
        params.append(1 if active else 0)
    sql += " ORDER BY code"
    return [account_row_to_dict(db, row) for row in db.query(sql, params)]


def get_account(db, account_id):
    return account_row_to_dict(db, _account_row(db, account_id))


def _validate_account_fields(db, data, current_id=None):
    code = str(data.get("code", "")).strip()
    if not CODE_RE.match(code):
        raise ValidationError("invalid_account_code")
    name = str(data.get("name", "")).strip()
    if not name or len(name) > 120:
        raise ValidationError("field_required", field="name")
    account_type = data.get("account_type")
    if account_type not in ACCOUNT_TYPES:
        raise ValidationError("invalid_account_type")
    duplicate = db.one(
        "SELECT id FROM accounts WHERE code = ? AND id IS NOT ?", (code, current_id)
    )
    if duplicate:
        raise Conflict("duplicate_code", code=code)
    is_header = 1 if data.get("is_header") else 0
    parent_id = data.get("parent_id") or None
    if parent_id is not None:
        parent = _account_row(db, int(parent_id))
        if not parent["is_header"]:
            raise ValidationError("parent_must_be_header")
        if parent["account_type"] != account_type:
            raise ValidationError("parent_type_mismatch")
        if current_id is not None and int(parent_id) == int(current_id):
            raise ValidationError("account_own_parent")
    return {
        "code": code,
        "name": name,
        "account_type": account_type,
        "parent_id": None if parent_id is None else int(parent_id),
        "is_header": is_header,
        "is_active": 0 if data.get("is_active") is False else 1,
    }


def create_account(ctx, data):
    ctx.require("accounting.manage_accounts")
    db = ctx.db
    with db.transaction():
        fields = _validate_account_fields(db, data)
        fields.update({"system_role": None, "created_at": now_iso(), "updated_at": now_iso()})
        account_id = db.insert("accounts", fields)
        ctx.audit("create", "accounting", "account", account_id, new_value=fields)
    return get_account(db, account_id)


def update_account(ctx, account_id, data):
    ctx.require("accounting.manage_accounts")
    db = ctx.db
    with db.transaction():
        current = _account_row(db, account_id)
        fields = _validate_account_fields(db, {**current, **data}, current_id=account_id)
        posted = has_postings(db, account_id)
        if posted and (fields["account_type"] != current["account_type"]
                       or fields["is_header"] != current["is_header"]):
            raise AccountingError("account_has_postings")
        if not fields["is_active"] and current["is_active"]:
            _assert_can_deactivate(db, current)
        if fields["is_header"] and db.one("SELECT 1 FROM journal_lines jl WHERE jl.account_id = ?", (account_id,)):
            raise AccountingError("account_has_postings")
        fields["updated_at"] = now_iso()
        before = dict(current)
        db.update("accounts", fields, "id = ?", (account_id,))
        ctx.audit("update", "accounting", "account", account_id,
                  old_value={k: before[k] for k in fields if k in before},
                  new_value={k: fields[k] for k in fields})
    return get_account(db, account_id)


def _assert_can_deactivate(db, account):
    if account["system_role"]:
        raise AccountingError("system_account_cannot_deactivate", code=account["code"])
    from .ledger import account_balance
    if account_balance(db, account["id"]) != 0:
        raise AccountingError("account_has_balance", code=account["code"])
    if is_referenced(db, account["id"]):
        raise AccountingError("account_in_use", code=account["code"])


def delete_account(ctx, account_id):
    ctx.require("accounting.manage_accounts")
    db = ctx.db
    with db.transaction():
        account = _account_row(db, account_id)
        if account["system_role"]:
            raise AccountingError("system_account_cannot_delete", code=account["code"])
        if has_postings(db, account_id) or is_referenced(db, account_id):
            raise AccountingError("account_has_postings")
        db.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        ctx.audit("delete", "accounting", "account", account_id, old_value=dict(account))


# ---------------------------------------------------------------------
# Tax rates
# ---------------------------------------------------------------------

def _account_must_be(db, account_id, types, field):
    if account_id is None:
        return None
    account = _account_row(db, int(account_id))
    if account["is_header"] or not account["is_active"]:
        raise AccountingError("account_not_postable", code=account["code"])
    if account["account_type"] not in types:
        raise ValidationError("account_type_not_allowed", field=field)
    return account["id"]


def list_tax_rates(db, active_only=False):
    sql = ("SELECT t.*, sa.code AS sales_account_code, pa.code AS purchase_account_code "
           "FROM tax_rates t LEFT JOIN accounts sa ON sa.id = t.sales_account_id "
           "LEFT JOIN accounts pa ON pa.id = t.purchase_account_id")
    if active_only:
        sql += " WHERE t.is_active = 1"
    sql += " ORDER BY t.rate_bps, t.name"
    return db.query(sql)


def save_tax_rate(ctx, data, tax_id=None):
    ctx.require("tax.manage")
    db = ctx.db
    name = str(data.get("name", "")).strip()
    code = str(data.get("code", "")).strip().upper()
    if not name:
        raise ValidationError("field_required", field="name")
    if not code or len(code) > 20:
        raise ValidationError("field_required", field="code")
    rate_bps = parse_percent_bps(data.get("rate_percent"), field="rate", allow_empty=False)
    with db.transaction():
        sales_id = _account_must_be(db, data.get("sales_account_id"), ("liability",), "sales_account_id")
        purchase_id = _account_must_be(db, data.get("purchase_account_id"), ("asset", "liability"), "purchase_account_id")
        if rate_bps > 0 and (sales_id is None or purchase_id is None):
            raise ValidationError("tax_accounts_required")
        fields = {
            "code": code,
            "name": name,
            "rate_bps": rate_bps,
            "sales_account_id": sales_id,
            "purchase_account_id": purchase_id,
            "is_active": 0 if data.get("is_active") is False else 1,
            "country_code": (str(data.get("country_code") or "").strip().upper() or None),
            "updated_at": now_iso(),
        }
        if tax_id is None:
            fields["created_at"] = now_iso()
            if db.one("SELECT 1 FROM tax_rates WHERE code = ? OR name = ?", (code, name)):
                raise Conflict("duplicate_code", code=code)
            tax_id = db.insert("tax_rates", fields)
            ctx.audit("create", "tax", "tax_rate", tax_id, new_value=fields)
        else:
            before = db.one("SELECT * FROM tax_rates WHERE id = ?", (tax_id,))
            if before is None:
                raise NotFound("tax_rate_not_found", id=tax_id)
            if db.one("SELECT 1 FROM tax_rates WHERE (code = ? OR name = ?) AND id <> ?", (code, name, tax_id)):
                raise Conflict("duplicate_code", code=code)
            db.update("tax_rates", fields, "id = ?", (tax_id,))
            ctx.audit("update", "tax", "tax_rate", tax_id, old_value=before, new_value=fields)
    return db.one("SELECT * FROM tax_rates WHERE id = ?", (tax_id,))


def tax_rate_or_none(db, tax_rate_id):
    if tax_rate_id in (None, "", 0):
        return None
    row = db.one("SELECT * FROM tax_rates WHERE id = ?", (int(tax_rate_id),))
    if row is None:
        raise NotFound("tax_rate_not_found", id=tax_rate_id)
    return row


# ---------------------------------------------------------------------
# Payment methods
# ---------------------------------------------------------------------

def list_payment_methods(db, active_only=False):
    sql = ("SELECT p.*, a.code AS account_code, a.name AS account_name FROM payment_methods p "
           "JOIN accounts a ON a.id = p.account_id")
    if active_only:
        sql += " WHERE p.is_active = 1"
    return db.query(sql + " ORDER BY p.name")


def save_payment_method(ctx, data, method_id=None):
    ctx.require("settings.manage")
    db = ctx.db
    name = str(data.get("name", "")).strip()
    kind = data.get("kind")
    if not name:
        raise ValidationError("field_required", field="name")
    if kind not in PAYMENT_KINDS:
        raise ValidationError("invalid_payment_kind")
    with db.transaction():
        account_id = _account_must_be(db, data.get("account_id"), ("asset",), "account_id")
        if account_id is None:
            raise ValidationError("field_required", field="account_id")
        fields = {
            "name": name,
            "kind": kind,
            "account_id": account_id,
            "is_active": 0 if data.get("is_active") is False else 1,
        }
        if method_id is None:
            if db.one("SELECT 1 FROM payment_methods WHERE name = ?", (name,)):
                raise Conflict("duplicate_value", detail=name)
            method_id = db.insert("payment_methods", fields)
            ctx.audit("create", "payments", "payment_method", method_id, new_value=fields)
        else:
            before = db.one("SELECT * FROM payment_methods WHERE id = ?", (method_id,))
            if before is None:
                raise NotFound("payment_method_not_found", id=method_id)
            db.update("payment_methods", fields, "id = ?", (method_id,))
            ctx.audit("update", "payments", "payment_method", method_id, old_value=before, new_value=fields)
    return db.one("SELECT * FROM payment_methods WHERE id = ?", (method_id,))


def payment_method_or_raise(db, method_id):
    row = db.one(
        "SELECT p.*, a.code AS account_code FROM payment_methods p JOIN accounts a ON a.id = p.account_id "
        "WHERE p.id = ?", (method_id,))
    if row is None:
        raise NotFound("payment_method_not_found", id=method_id)
    if not row["is_active"]:
        raise AccountingError("payment_method_inactive", name=row["name"])
    return row
