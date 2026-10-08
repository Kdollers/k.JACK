"""HTTP API: a route table that maps requests onto the service layer.

Handlers contain no business rules. They parse input, call a service
function (which enforces permissions and accounting rules), and shape the
response. Errors are GenesisError subclasses rendered as translated JSON.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path

from . import (accounts, auth, backup, catalog, company, config, documents, exporters,
               inventory, ledger, payments, reports)
from .auth import PERMISSIONS, ROLES, permissions_for
from .errors import AuthenticationError, GenesisError, MethodNotAllowed, NotFound, ValidationError
from .i18n import LANGUAGE_NAMES, dictionary, normalize_language
from .money import parse_iso_date
from .timeutil import today_iso


@dataclass
class Request:
    method: str
    path: str
    params: dict = field(default_factory=dict)
    query: dict = field(default_factory=dict)
    body: dict = field(default_factory=dict)
    ctx: object = None
    lang: str = "en"
    app: object = None
    token: str = ""


@dataclass
class Binary:
    content: bytes
    content_type: str
    filename: str = ""


@dataclass
class Html:
    content: str


ROUTES = []


def route(method, pattern, auth=True):
    regex = re.compile("^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", pattern) + "$")

    def decorator(function):
        ROUTES.append((method, regex, function, auth))
        return function
    return decorator


def match_route(method, path):
    path_matches = []
    for route_method, regex, function, auth_required in ROUTES:
        found = regex.match(path)
        if found is None:
            continue
        path_matches.append(route_method)
        if route_method == method:
            return function, found.groupdict(), auth_required
    if path_matches:
        raise MethodNotAllowed("method_not_allowed")
    raise NotFound("endpoint_not_found", path=path)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def _opt_int(value):
    if value in (None, "", "null"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise ValidationError("invalid_number") from error


def _flag(value):
    return str(value).lower() in ("1", "true", "yes", "on")


def _date_or_none(value, field_name):
    if value in (None, ""):
        return None
    return parse_iso_date(value, field_name).isoformat()


def _need(body, name):
    value = body.get(name)
    if value in (None, ""):
        raise ValidationError("field_required", field=name)
    return value


def _page(rows, query):
    limit = min(_opt_int(query.get("limit")) or 500, 2000)
    return rows[:limit]


# ----------------------------------------------------------------------
# Public endpoints
# ----------------------------------------------------------------------

@route("GET", "/api/health", auth=False)
def health(req):
    return {"ok": True}


@route("GET", "/api/setup", auth=False)
def setup_info(req):
    """Public. Tells the sign-in page whether the first company must be created, and which
    choices the creation form offers (the same lists the server validates against)."""
    return {"needs_setup": not req.app.has_companies(),
            "currencies": sorted(company.CURRENCIES),
            "costing_methods": list(company.COSTING_METHODS),
            "tax_profiles": list(accounts.TAX_PROFILES)}


@route("GET", "/api/i18n/{lang}", auth=False)
def get_dictionary(req):
    lang = normalize_language(req.params["lang"])
    return {"lang": lang, "dictionary": dictionary(lang),
            "languages": [{"code": code, "name": LANGUAGE_NAMES[code]} for code in config.SUPPORTED_LANGUAGES]}


@route("GET", "/api/companies")
def list_companies(req):
    req.ctx.require("companies.manage")
    return req.app.list_companies()


@route("POST", "/api/companies", auth=False)
def create_company(req):
    # The first company may be created without a session (initial setup). After that,
    # only a signed-in administrator (companies.manage) may create more companies.
    if req.app.has_companies():
        ctx = req.app.optional_context(req.token)
        if ctx is None:
            raise AuthenticationError("authentication_required")
        ctx.require("companies.manage")
    body = req.body
    result = req.app.create_company(
        name=body.get("name"), currency_code=body.get("currency_code", "RWF"),
        currency_decimals=body.get("currency_decimals"), currency_symbol=body.get("currency_symbol"),
        admin_username=body.get("admin_username"), admin_full_name=body.get("admin_full_name"),
        admin_password=body.get("admin_password"), address=body.get("address", ""),
        phone=body.get("phone", ""), email=body.get("email", ""), tax_id=body.get("tax_id", ""),
        country_profile=body.get("country_profile", "none"),
        fiscal_year_start_month=body.get("fiscal_year_start_month", 1),
        default_language=body.get("default_language", req.lang),
        prices_include_tax=_flag(body.get("prices_include_tax", False)),
        costing_method=body.get("costing_method", "weighted_average"))
    return result


@route("POST", "/api/login", auth=False)
def login(req):
    token, user = req.app.login(_need(req.body, "company"), req.body.get("username", ""),
                                req.body.get("password", ""))
    ctx = req.app.context_for(token)
    return _session_payload(req, token, ctx)


def _session_payload(req, token, ctx):
    profile = company.company_profile(ctx.db)
    return {
        "token": token,
        "company": {"slug": ctx.company_slug, "name": profile["company_name"],
                    "currency_code": profile["currency_code"], "currency_decimals": profile["currency_decimals"],
                    "currency_symbol": profile["currency_symbol"],
                    "prices_include_tax": profile["prices_include_tax"]},
        "user": {"id": ctx.user["id"], "username": ctx.user["username"], "full_name": ctx.user["full_name"],
                 "role": ctx.user["role"], "language": ctx.lang},
        "permissions": sorted(ctx.permissions),
        "lang": ctx.lang,
    }


@route("POST", "/api/logout")
def logout(req):
    req.app.logout(req.token)
    return {"ok": True}


@route("GET", "/api/me")
def me(req):
    return _session_payload(req, req.token, req.ctx)


@route("PUT", "/api/me/language")
def my_language(req):
    language = company.set_own_language(req.ctx, _need(req.body, "language"))
    return {"language": language}


@route("POST", "/api/me/password")
def my_password(req):
    company.change_own_password(req.ctx, req.body.get("current_password", ""),
                                req.body.get("new_password", ""))
    return {"ok": True}


@route("GET", "/api/meta")
def meta(req):
    return {
        "roles": [{"code": r, "label_key": auth.ROLE_LABEL_KEYS[r],
                   "permissions": sorted(permissions_for(r))} for r in ROLES],
        "permissions": list(PERMISSIONS),
        "account_types": list(accounts.ACCOUNT_TYPES),
        "payment_kinds": list(accounts.PAYMENT_KINDS),
        "system_roles": list(accounts.SYSTEM_ROLES),
        "currencies": {code: {"decimals": d, "symbol": s} for code, (d, s) in company.CURRENCIES.items()},
        "costing_methods": list(company.COSTING_METHODS),
        "backup_schedules": list(company.BACKUP_SCHEDULES),
        "tax_profiles": {k: {"name": v["name"], "country": v["country"],
                             "rates": list(v["rates"])} for k, v in accounts.TAX_PROFILES.items()},
        "reports": sorted(reports.BUILDERS),
        "languages": [{"code": code, "name": LANGUAGE_NAMES[code]} for code in config.SUPPORTED_LANGUAGES],
        "today": today_iso(),
    }


# ----------------------------------------------------------------------
# Settings
# ----------------------------------------------------------------------

@route("GET", "/api/settings")
def get_settings(req):
    req.ctx.require("settings.manage")
    return company.company_profile(req.ctx.db)


@route("PUT", "/api/settings")
def update_settings(req):
    return company.update_company_profile(req.ctx, req.body)


@route("PUT", "/api/settings/lock-date")
def set_lock_date(req):
    return {"lock_date": company.set_lock_date(req.ctx, req.body.get("lock_date"))}


@route("GET", "/api/settings/system-roles")
def list_system_roles(req):
    req.ctx.require("settings.manage")
    return company.list_system_roles(req.ctx.db)


@route("PUT", "/api/settings/system-roles/{role}")
def set_system_role(req):
    company.set_system_role(req.ctx, req.params["role"], req.body.get("account_id"))
    return {"ok": True}


@route("GET", "/api/tax-rates")
def get_tax_rates(req):
    req.ctx.require("tax.manage")
    return accounts.list_tax_rates(req.ctx.db)


@route("POST", "/api/tax-rates")
def create_tax_rate(req):
    return accounts.save_tax_rate(req.ctx, req.body)


@route("PUT", "/api/tax-rates/{id}")
def update_tax_rate(req):
    return accounts.save_tax_rate(req.ctx, req.body, int(req.params["id"]))


@route("GET", "/api/payment-methods")
def get_payment_methods(req):
    return accounts.list_payment_methods(req.ctx.db)


@route("POST", "/api/payment-methods")
def create_payment_method(req):
    return accounts.save_payment_method(req.ctx, req.body)


@route("PUT", "/api/payment-methods/{id}")
def update_payment_method(req):
    return accounts.save_payment_method(req.ctx, req.body, int(req.params["id"]))


@route("GET", "/api/warehouses")
def get_warehouses(req):
    return catalog.list_warehouses(req.ctx.db)


@route("POST", "/api/warehouses")
def create_warehouse(req):
    return catalog.save_warehouse(req.ctx, req.body)


@route("PUT", "/api/warehouses/{id}")
def update_warehouse(req):
    return catalog.save_warehouse(req.ctx, req.body, int(req.params["id"]))


@route("GET", "/api/categories")
def get_categories(req):
    return catalog.list_categories(req.ctx.db)


@route("POST", "/api/categories")
def create_category(req):
    return catalog.save_category(req.ctx, req.body)


@route("PUT", "/api/categories/{id}")
def update_category(req):
    return catalog.save_category(req.ctx, req.body, int(req.params["id"]))


# ----------------------------------------------------------------------
# Users
# ----------------------------------------------------------------------

@route("GET", "/api/users")
def get_users(req):
    req.ctx.require("users.manage")
    return company.list_users(req.ctx.db)


@route("POST", "/api/users")
def create_user(req):
    return company.create_user(req.ctx, req.body)


@route("PUT", "/api/users/{id}")
def update_user(req):
    return company.update_user(req.ctx, int(req.params["id"]), req.body, req.app.sessions)


@route("POST", "/api/users/{id}/password")
def reset_user_password(req):
    company.reset_password(req.ctx, int(req.params["id"]), req.body.get("password", ""))
    return {"ok": True}


# ----------------------------------------------------------------------
# Accounts
# ----------------------------------------------------------------------

@route("GET", "/api/accounts")
def get_accounts(req):
    req.ctx.require("accounting.view")
    active = None if req.query.get("active") in (None, "") else _flag(req.query.get("active"))
    return _page(accounts.list_accounts(req.ctx.db, req.query.get("q"), req.query.get("type") or None,
                                        active), req.query)


@route("POST", "/api/accounts")
def create_account(req):
    return accounts.create_account(req.ctx, req.body)


@route("GET", "/api/accounts/{id}")
def get_account(req):
    req.ctx.require("accounting.view")
    return accounts.get_account(req.ctx.db, int(req.params["id"]))


@route("PUT", "/api/accounts/{id}")
def update_account(req):
    return accounts.update_account(req.ctx, int(req.params["id"]), req.body)


@route("DELETE", "/api/accounts/{id}")
def delete_account(req):
    accounts.delete_account(req.ctx, int(req.params["id"]))
    return {"deleted": True}


# ----------------------------------------------------------------------
# Customers and suppliers
# ----------------------------------------------------------------------

def _partner_routes(kind, base):
    @route("GET", f"/api/{base}")
    def list_partners(req):
        req.ctx.require(catalog.PARTNER_KIND[kind]["view"])
        active = None if req.query.get("active") in (None, "") else _flag(req.query.get("active"))
        return _page(catalog.list_partners(req.ctx.db, kind, req.query.get("q"), active), req.query)

    @route("POST", f"/api/{base}")
    def create_partner(req):
        return catalog.save_partner(req.ctx, kind, req.body)

    @route("GET", f"/api/{base}/{{id}}")
    def get_partner(req):
        req.ctx.require(catalog.PARTNER_KIND[kind]["view"])
        return catalog.get_partner(req.ctx.db, kind, int(req.params["id"]))

    @route("PUT", f"/api/{base}/{{id}}")
    def update_partner(req):
        return catalog.save_partner(req.ctx, kind, req.body, int(req.params["id"]))

    @route("POST", f"/api/{base}/{{id}}/active")
    def set_active(req):
        return catalog.set_partner_active(req.ctx, kind, int(req.params["id"]), _flag(req.body.get("active")))

    @route("GET", f"/api/{base}/{{id}}/documents")
    def partner_documents(req):
        req.ctx.require("sales.view" if kind == "customer" else "purchases.view")
        types = ["sales_invoice", "sales_credit", "sales_order", "sales_quote"] if kind == "customer" \
            else ["purchase_invoice", "purchase_return", "purchase_order"]
        return documents.list_documents(req.ctx.db, doc_types=types, party_id=int(req.params["id"]))

    @route("GET", f"/api/{base}/{{id}}/payments")
    def partner_payments(req):
        req.ctx.require("payments.view")
        return payments.list_payments(req.ctx.db, party_type=kind, party_id=int(req.params["id"]))


_partner_routes("customer", "customers")
_partner_routes("supplier", "suppliers")


# ----------------------------------------------------------------------
# Products
# ----------------------------------------------------------------------

@route("GET", "/api/products")
def get_products(req):
    req.ctx.require("products.view")
    active = None if req.query.get("active") in (None, "") else _flag(req.query.get("active"))
    track = None if req.query.get("track_stock") in (None, "") else _flag(req.query.get("track_stock"))
    return _page(catalog.list_products(req.ctx.db, q=req.query.get("q"),
                                       category_id=_opt_int(req.query.get("category_id")),
                                       active=active, low_stock=_flag(req.query.get("low_stock")),
                                       track_stock=track), req.query)


@route("POST", "/api/products")
def create_product(req):
    return catalog.save_product(req.ctx, req.body)


@route("GET", "/api/products/{id}")
def get_product(req):
    req.ctx.require("products.view")
    return catalog.get_product(req.ctx.db, int(req.params["id"]))


@route("PUT", "/api/products/{id}")
def update_product(req):
    return catalog.save_product(req.ctx, req.body, int(req.params["id"]))


@route("GET", "/api/products/{id}/stock")
def product_stock(req):
    req.ctx.require("inventory.view")
    return catalog.product_stock_by_warehouse(req.ctx.db, int(req.params["id"]))


@route("GET", "/api/products/{id}/movements")
def product_movements(req):
    req.ctx.require("inventory.view")
    return _movements(req.ctx.db, {"product": req.params["id"], **req.query})


# ----------------------------------------------------------------------
# Inventory
# ----------------------------------------------------------------------

@route("GET", "/api/stock")
def get_stock(req):
    req.ctx.require("inventory.view")
    return inventory.stock_levels(req.ctx.db, warehouse_id=_opt_int(req.query.get("warehouse_id")),
                                  q=req.query.get("q"), low_only=_flag(req.query.get("low")))


@route("POST", "/api/stock/receipts")
def stock_receipt(req):
    return inventory.stock_receipt(req.ctx, req.body)


@route("POST", "/api/stock/issues")
def stock_issue(req):
    return inventory.stock_issue(req.ctx, req.body)


@route("POST", "/api/stock/transfers")
def stock_transfer(req):
    return inventory.stock_transfer(req.ctx, req.body)


@route("POST", "/api/stock/adjustments")
def stock_adjustment(req):
    return inventory.stock_adjustment(req.ctx, req.body)


@route("GET", "/api/stock/counts")
def list_counts(req):
    req.ctx.require("inventory.view")
    return inventory.list_counts(req.ctx.db)


@route("POST", "/api/stock/counts")
def create_count(req):
    return inventory.create_count(req.ctx, req.body)


@route("GET", "/api/stock/counts/{id}")
def get_count(req):
    req.ctx.require("inventory.view")
    return inventory.count_view(req.ctx.db, int(req.params["id"]))


@route("PUT", "/api/stock/counts/{id}/lines")
def update_count(req):
    return inventory.update_count_lines(req.ctx, int(req.params["id"]), req.body.get("lines") or [])


@route("POST", "/api/stock/counts/{id}/post")
def post_count(req):
    return inventory.post_count(req.ctx, int(req.params["id"]))


def _movements(db, query):
    sql = ("SELECT sm.*, p.sku, p.name AS product_name, w.code AS warehouse_code, u.username "
           "FROM stock_movements sm JOIN products p ON p.id = sm.product_id "
           "JOIN warehouses w ON w.id = sm.warehouse_id JOIN users u ON u.id = sm.created_by WHERE 1=1")
    params = []
    if query.get("product"):
        sql += " AND sm.product_id = ?"
        params.append(int(query["product"]))
    if query.get("warehouse_id"):
        sql += " AND sm.warehouse_id = ?"
        params.append(int(query["warehouse_id"]))
    if query.get("from"):
        sql += " AND sm.movement_date >= ?"
        params.append(parse_iso_date(query["from"]).isoformat())
    if query.get("to"):
        sql += " AND sm.movement_date <= ?"
        params.append(parse_iso_date(query["to"]).isoformat())
    if query.get("type"):
        sql += " AND sm.movement_type = ?"
        params.append(query["type"])
    sql += " ORDER BY sm.movement_date DESC, sm.id DESC LIMIT 1000"
    return db.query(sql, params)


@route("GET", "/api/stock/movements")
def stock_movements(req):
    req.ctx.require("inventory.view")
    return _movements(req.ctx.db, req.query)


# ----------------------------------------------------------------------
# Documents (sales and purchases)
# ----------------------------------------------------------------------

@route("GET", "/api/documents")
def list_documents(req):
    types = [t for t in (req.query.get("types") or "").split(",") if t] or None
    if types is None:
        raise ValidationError("field_required", field="types")
    for doc_type in types:
        if doc_type not in documents.ALL_TYPES:
            raise ValidationError("invalid_document_type")
        req.ctx.require(documents._view_permission(doc_type))
    return _page(documents.list_documents(
        req.ctx.db, doc_types=types, status=req.query.get("status") or None, q=req.query.get("q") or None,
        date_from=_date_or_none(req.query.get("from"), "from"), date_to=_date_or_none(req.query.get("to"), "to"),
        party_id=_opt_int(req.query.get("party_id")), open_only=_flag(req.query.get("open"))), req.query)


@route("POST", "/api/documents")
def create_document(req):
    return documents.save_document(req.ctx, req.body)


@route("GET", "/api/documents/{id}")
def get_document(req):
    doc = documents.document_view(req.ctx.db, int(req.params["id"]))
    req.ctx.require(documents._view_permission(doc["doc_type"]))
    return doc


@route("PUT", "/api/documents/{id}")
def update_document(req):
    return documents.save_document(req.ctx, req.body, int(req.params["id"]))


@route("DELETE", "/api/documents/{id}")
def delete_document(req):
    return documents.delete_draft(req.ctx, int(req.params["id"]))


@route("POST", "/api/documents/{id}/post")
def post_document(req):
    payment_body = req.body.get("payment") or None
    payment = None
    if payment_body and payment_body.get("amount"):
        payment = {
            "payment_method_id": _opt_int(payment_body.get("payment_method_id")),
            "amount_minor": _parse_amount(req, payment_body.get("amount")),
            "date": payment_body.get("date"),
        }
    return documents.post_document(req.ctx, int(req.params["id"]), payment=payment)


def _parse_amount(req, value):
    from .money import parse_money
    decimals = company.currency_info(req.ctx.db)[0]
    return parse_money(value, decimals, field="amount")


@route("POST", "/api/documents/{id}/confirm")
def confirm_document(req):
    return documents.confirm_document(req.ctx, int(req.params["id"]))


@route("POST", "/api/documents/{id}/cancel")
def cancel_document(req):
    return documents.cancel_document(req.ctx, int(req.params["id"]))


@route("POST", "/api/documents/{id}/convert")
def convert_document(req):
    return documents.convert_document(req.ctx, int(req.params["id"]), req.body.get("target_type") or None)


@route("POST", "/api/documents/{id}/apply-credit")
def apply_credit(req):
    amount = _parse_amount(req, _need(req.body, "amount"))
    payments.apply_credit_note(req.ctx, int(req.params["id"]), int(_need(req.body, "invoice_id")), amount)
    return documents.document_view(req.ctx.db, int(req.params["id"]))


# ----------------------------------------------------------------------
# Payments
# ----------------------------------------------------------------------

@route("GET", "/api/payments")
def list_payments(req):
    req.ctx.require("payments.view")
    return _page(payments.list_payments(
        req.ctx.db, party_type=req.query.get("party_type") or None, party_id=_opt_int(req.query.get("party_id")),
        date_from=_date_or_none(req.query.get("from"), "from"), date_to=_date_or_none(req.query.get("to"), "to"),
        q=req.query.get("q") or None, status=req.query.get("status") or None), req.query)


@route("POST", "/api/payments")
def record_payment(req):
    body = req.body
    amount = _parse_amount(req, _need(body, "amount"))
    allocations = None
    if body.get("allocations"):
        allocations = [{"document_id": int(a["document_id"]),
                        "amount_minor": _parse_amount(req, a["amount"])} for a in body["allocations"]]
    result = payments.record_payment(
        req.ctx, party_type=_need(body, "party_type"), party_id=int(_need(body, "party_id")),
        method_id=int(_need(body, "payment_method_id")), amount_minor=amount,
        date_value=body.get("payment_date") or today_iso(), reference=body.get("reference"),
        notes=body.get("notes"), allocations=allocations)
    return result


@route("GET", "/api/payments/{id}")
def get_payment(req):
    req.ctx.require("payments.view")
    return payments.payment_view(req.ctx.db, int(req.params["id"]))


@route("POST", "/api/payments/{id}/reverse")
def reverse_payment(req):
    return payments.reverse_payment(req.ctx, int(req.params["id"]), _need(req.body, "reason"))


# ----------------------------------------------------------------------
# Journal and ledger
# ----------------------------------------------------------------------

@route("GET", "/api/journal")
def list_journal(req):
    req.ctx.require("accounting.view")
    sql = ("SELECT je.id, je.entry_no, je.entry_date, je.reference, je.description, je.source_type, "
           "je.reversal_of_id, je.total_minor, je.created_at, u.username, "
           "(SELECT COUNT(*) FROM journal_entries r WHERE r.reversal_of_id = je.id) AS reversed_count "
           "FROM journal_entries je JOIN users u ON u.id = je.created_by WHERE 1=1")
    params = []
    if req.query.get("from"):
        sql += " AND je.entry_date >= ?"
        params.append(_date_or_none(req.query["from"], "from"))
    if req.query.get("to"):
        sql += " AND je.entry_date <= ?"
        params.append(_date_or_none(req.query["to"], "to"))
    if req.query.get("q"):
        sql += " AND (je.entry_no LIKE ? OR je.description LIKE ? OR je.reference LIKE ?)"
        params += [f"%{req.query['q']}%"] * 3
    if req.query.get("amount_min"):
        sql += " AND je.total_minor >= ?"
        params.append(int(req.query["amount_min"]))
    if req.query.get("amount_max"):
        sql += " AND je.total_minor <= ?"
        params.append(int(req.query["amount_max"]))
    if req.query.get("source") == "manual":
        sql += " AND je.source_type IS NULL"
    elif req.query.get("source") == "document":
        sql += " AND je.source_type IS NOT NULL"
    if req.query.get("user"):
        sql += " AND u.username = ?"
        params.append(req.query["user"])
    sql += " ORDER BY je.entry_date DESC, je.id DESC LIMIT 1000"
    return req.ctx.db.query(sql, params)


@route("GET", "/api/journal/{id}")
def get_journal(req):
    req.ctx.require("accounting.view")
    db = req.ctx.db
    entry = db.one("SELECT je.*, u.username FROM journal_entries je JOIN users u ON u.id = je.created_by "
                   "WHERE je.id = ?", (int(req.params["id"]),))
    if entry is None:
        raise NotFound("journal_entry_not_found", id=req.params["id"])
    entry["lines"] = db.query(
        "SELECT jl.*, a.code, a.name, c.name AS customer_name, s.name AS supplier_name FROM journal_lines jl "
        "JOIN accounts a ON a.id = jl.account_id "
        "LEFT JOIN customers c ON c.id = jl.party_id AND jl.party_type = 'customer' "
        "LEFT JOIN suppliers s ON s.id = jl.party_id AND jl.party_type = 'supplier' "
        "WHERE jl.entry_id = ? ORDER BY jl.line_no", (entry["id"],))
    entry["reversal_entry"] = db.one("SELECT id, entry_no FROM journal_entries WHERE reversal_of_id = ?",
                                     (entry["id"],))
    return entry


@route("POST", "/api/journal")
def post_journal(req):
    req.ctx.require("accounting.journal")
    body = req.body
    decimals = company.currency_info(req.ctx.db)[0]
    from .money import parse_money
    lines = []
    for raw in body.get("lines") or []:
        lines.append({
            "account_id": _opt_int(raw.get("account_id")),
            "debit_minor": parse_money(raw.get("debit") or 0, decimals, field="debit"),
            "credit_minor": parse_money(raw.get("credit") or 0, decimals, field="credit"),
            "party_type": raw.get("party_type") or None,
            "party_id": _opt_int(raw.get("party_id")),
            "description": raw.get("description"),
        })
    with req.ctx.db.transaction():
        result = ledger.post_entry(req.ctx, entry_date=_need(body, "entry_date"),
                                   description=_need(body, "description"), lines=lines,
                                   reference=body.get("reference"))
    return result


@route("POST", "/api/journal/{id}/reverse")
def reverse_journal(req):
    with req.ctx.db.transaction():
        return ledger.reverse_entry(req.ctx, int(req.params["id"]), reason=_need(req.body, "reason"),
                                    reversal_date=_date_or_none(req.body.get("date"), "date"))


@route("GET", "/api/ledger/accounts")
def ledger_accounts(req):
    req.ctx.require("accounting.view")
    return accounts.list_accounts(req.ctx.db, active=True)


# ----------------------------------------------------------------------
# Reports and dashboard
# ----------------------------------------------------------------------

REPORT_PERMISSION = "reports.view"

# Filters each report accepts. Anything else in the query string is ignored
# by design, so a report can never be filtered by a field it does not define.
REPORT_FILTERS = {
    "trial_balance": ("start", "end"),
    "general_ledger": ("start", "end", "account_id"),
    "profit_loss": ("start", "end"),
    "balance_sheet": ("as_of",),
    "cash_flow": ("start", "end"),
    "cash_bank": ("start", "end"),
    "sales_report": ("start", "end", "customer_id"),
    "purchase_report": ("start", "end", "supplier_id"),
    "inventory_valuation": ("as_of", "warehouse_id"),
    "inventory_movement": ("start", "end", "product_id", "warehouse_id"),
    "tax_report": ("start", "end"),
    "ar_ageing": ("as_of",),
    "ap_ageing": ("as_of",),
    "customer_statement": ("partner_id", "start", "end"),
    "supplier_statement": ("partner_id", "start", "end"),
}
REPORT_INT_FILTERS = ("account_id", "customer_id", "supplier_id", "partner_id", "product_id", "warehouse_id")
REPORT_DATE_FILTERS = ("start", "end", "as_of")
REQUIRED_PARTNER_REPORTS = ("customer_statement", "supplier_statement")


def _build_report(req, name):
    if name not in reports.BUILDERS:
        raise NotFound("report_not_found", name=name)
    req.ctx.require(REPORT_PERMISSION)
    kwargs = {}
    for key in REPORT_FILTERS[name]:
        raw = req.query.get(key)
        if raw in (None, ""):
            continue
        if key in REPORT_DATE_FILTERS:
            kwargs[key] = parse_iso_date(raw, key).isoformat()
        elif key in REPORT_INT_FILTERS:
            kwargs[key] = _opt_int(raw)
        else:
            kwargs[key] = raw
    if name in REQUIRED_PARTNER_REPORTS and "partner_id" not in kwargs:
        raise ValidationError("field_required", field="partner_id")
    return reports.BUILDERS[name](req.ctx.db, **kwargs)


@route("GET", "/api/reports/{name}")
def get_report(req):
    return _build_report(req, req.params["name"])


@route("GET", "/api/reports/{name}/export")
def export_report(req):
    name = req.params["name"]
    fmt = req.query.get("format", "csv")
    if fmt not in exporters.EXPORTERS:
        raise ValidationError("invalid_export_format")
    req.ctx.require("reports.export")
    report = _build_report(req, name)
    company_name = company.company_profile(req.ctx.db)["company_name"]
    content_type, extension, function = exporters.EXPORTERS[fmt]
    if fmt == "pdf":
        data = function(report, req.lang, company_name)
    else:
        data = function(report, req.lang)
    filename = f"{name}-{today_iso()}.{extension}"
    return Binary(data, content_type, filename)


@route("GET", "/api/reports/{name}/print")
def print_report(req):
    report = _build_report(req, req.params["name"])
    company_name = company.company_profile(req.ctx.db)["company_name"]
    return Html(exporters.to_html(report, req.lang, company_name))


@route("GET", "/api/dashboard")
def dashboard(req):
    req.ctx.require("dashboard.view")
    return reports.dashboard(req.ctx.db, _date_or_none(req.query.get("start"), "start"),
                             _date_or_none(req.query.get("end"), "end"))


@route("GET", "/api/search")
def search(req):
    q = (req.query.get("q") or "").strip()
    if len(q) < 2:
        return {"results": []}
    db = req.ctx.db
    results = []
    like = f"%{q}%"
    if req.ctx.has("customers.view"):
        for row in db.query("SELECT id, code, name FROM customers WHERE code LIKE ? OR name LIKE ? "
                            "OR phone LIKE ? ORDER BY name LIMIT 8", (like, like, like)):
            results.append({"type": "customer", "id": row["id"], "code": row["code"], "title": row["name"]})
    if req.ctx.has("suppliers.view"):
        for row in db.query("SELECT id, code, name FROM suppliers WHERE code LIKE ? OR name LIKE ? "
                            "ORDER BY name LIMIT 8", (like, like)):
            results.append({"type": "supplier", "id": row["id"], "code": row["code"], "title": row["name"]})
    if req.ctx.has("products.view"):
        for row in db.query("SELECT id, sku, name FROM products WHERE sku LIKE ? OR name LIKE ? "
                            "OR barcode LIKE ? ORDER BY name LIMIT 8", (like, like, like)):
            results.append({"type": "product", "id": row["id"], "code": row["sku"], "title": row["name"]})
    if req.ctx.has("sales.view") or req.ctx.has("purchases.view"):
        for row in documents.list_documents(db, doc_types=documents.ALL_TYPES, q=q)[:8]:
            results.append({"type": "document", "id": row["id"], "code": row["number"],
                            "title": row["party_name"] or "", "doc_type": row["doc_type"]})
    if req.ctx.has("payments.view"):
        for row in payments.list_payments(db, q=q)[:8]:
            results.append({"type": "payment", "id": row["id"], "code": row["payment_no"],
                            "title": row["party_name"] or ""})
    if req.ctx.has("accounting.view"):
        for row in db.query("SELECT id, code, name FROM accounts WHERE code LIKE ? OR name LIKE ? "
                            "ORDER BY code LIMIT 8", (like, like)):
            results.append({"type": "account", "id": row["id"], "code": row["code"], "title": row["name"]})
        for row in db.query("SELECT id, entry_no, description FROM journal_entries WHERE entry_no LIKE ? "
                            "OR description LIKE ? ORDER BY id DESC LIMIT 8", (like, like)):
            results.append({"type": "journal", "id": row["id"], "code": row["entry_no"],
                            "title": row["description"]})
    return {"results": results}


# ----------------------------------------------------------------------
# Audit, integrity and backups
# ----------------------------------------------------------------------

@route("GET", "/api/audit")
def get_audit(req):
    req.ctx.require("audit.view")
    sql = "SELECT * FROM audit_log WHERE 1=1"
    params = []
    for key, column in (("module", "module"), ("user", "username"), ("action", "action"),
                        ("record_type", "record_type")):
        if req.query.get(key):
            sql += f" AND {column} = ?"
            params.append(req.query[key])
    if req.query.get("q"):
        sql += " AND (details LIKE ? OR record_id LIKE ? OR new_value LIKE ? OR old_value LIKE ?)"
        params += [f"%{req.query['q']}%"] * 4
    if req.query.get("from"):
        sql += " AND created_at >= ?"
        params.append(parse_iso_date(req.query["from"], "from").isoformat())
    if req.query.get("to"):
        sql += " AND created_at < ?"
        from datetime import timedelta
        params.append((parse_iso_date(req.query["to"], "to") + timedelta(days=1)).isoformat())
    sql += " ORDER BY id DESC LIMIT 500"
    return req.ctx.db.query(sql, params)


@route("GET", "/api/integrity")
def integrity(req):
    req.ctx.require("accounting.view")
    ledger_problems = ledger.verify_ledger(req.ctx.db)
    inventory_problems = inventory.verify_inventory(req.ctx.db)
    codes = ["ledger:" + item["type"] for item in ledger_problems]
    codes += ["inventory:" + item["type"] for item in inventory_problems]
    return {"ok": not codes, "ledger": ledger_problems, "inventory": inventory_problems,
            "messages": backup.describe_problems(codes, req.lang)}


@route("GET", "/api/backups")
def get_backups(req):
    req.ctx.require("backup.manage")
    configured = company.get_setting(req.ctx.db, "backup_dir", "")
    return {"directory": str(backup.backup_directory(req.app, req.ctx.company_slug, configured)),
            "items": backup.list_backups(req.app, req.ctx.company_slug, configured)}


@route("POST", "/api/backups")
def create_backup(req):
    req.ctx.require("backup.manage")
    manifest = backup.create_backup(req.app, req.ctx.company_slug, user=req.ctx.username)
    req.ctx.audit(action="backup", module="backup", record_type="company", record_id=req.ctx.company_slug,
                  new_value={"file": manifest["file"]})
    return manifest


@route("POST", "/api/backups/verify")
def verify_backup(req):
    req.ctx.require("backup.manage")
    configured = company.get_setting(req.ctx.db, "backup_dir", "")
    path = backup.resolve_backup(req.app, req.ctx.company_slug, _need(req.body, "file"), configured)
    result = backup.verify_backup(path)
    return {**result, "messages": backup.describe_problems(result["problems"], req.lang)}


@route("POST", "/api/backups/restore")
def restore_backup(req):
    req.ctx.require("backup.manage")
    configured = company.get_setting(req.ctx.db, "backup_dir", "")
    path = backup.resolve_backup(req.app, req.ctx.company_slug, _need(req.body, "file"), configured)
    return backup.restore_backup(req.app, req.ctx.company_slug, path,
                                 confirmation=req.body.get("confirm", ""), user_ctx=req.ctx)


@route("GET", "/api/backups/download")
def download_backup(req):
    req.ctx.require("backup.manage")
    configured = company.get_setting(req.ctx.db, "backup_dir", "")
    path = backup.resolve_backup(req.app, req.ctx.company_slug, req.query.get("file", ""), configured)
    return Binary(Path(path).read_bytes(), "application/octet-stream", path.name)


# ----------------------------------------------------------------------
# Dispatch: the one entry point used by the HTTP server and by tests.
# ----------------------------------------------------------------------

def dispatch(app, method, path, *, body=None, query=None, token="", lang=None):
    """Route one request. Returns ``(status, payload)``.

    ``payload`` is JSON-able data, a ``Binary`` or an ``Html`` object for the server to send.
    Errors never escape: they become ``(status, {"error", "message", "status"})``.
    """
    from .i18n import translate
    requested_lang = normalize_language(lang or config.DEFAULT_LANGUAGE)
    try:
        handler, params, auth_required = match_route(method, path)
        if body is not None and not isinstance(body, dict):
            raise ValidationError("invalid_json")
        request = Request(method=method, path=path, params=params, query=dict(query or {}),
                          body=dict(body or {}), app=app, token=token or "", lang=requested_lang)
        if auth_required:
            if not token:
                raise AuthenticationError("authentication_required")
            request.ctx = app.context_for(token)
            request.lang = normalize_language(request.ctx.lang)
        return 200, handler(request)
    except GenesisError as error:
        message = translate(error.key, requested_lang, **error.params)
        return error.status, {"error": error.key, "message": message, "status": error.status}
    except Exception:  # noqa: BLE001 - last-resort guard: never leak a traceback to the client
        import sys
        import traceback
        traceback.print_exc(file=sys.stderr)
        return 500, {"error": "internal_error", "status": 500,
                     "message": translate("internal_error", requested_lang)}


__all__ = ["ROUTES", "match_route", "Request", "Binary", "Html", "dispatch"]
