"""Company creation, company settings, users and system-role mapping."""

import re
from . import audit
from .accounts import DEFAULT_CHART, SYSTEM_ROLES, TAX_PROFILES
from .i18n import translate
from .auth import (ROLES, authentication_failed, hash_password, validate_password,
                   validate_username, verify_password)
from .config import DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES
from .db import Database
from .errors import AccountingError, Conflict, NotFound, ValidationError
from .money import parse_iso_date
from .schema import SEQUENCES
from .timeutil import now_iso

CURRENCIES = {
    "RWF": (0, "FRw"), "USD": (2, "$"), "EUR": (2, "€"), "GBP": (2, "£"),
    "XAF": (0, "FCFA"), "KES": (2, "KSh"), "UGX": (0, "USh"), "TZS": (2, "TSh"),
    "CDF": (2, "FC"), "ZAR": (2, "R"), "XOF": (0, "F CFA"),
}
COSTING_METHODS = ("fifo", "weighted_average")
BACKUP_SCHEDULES = ("none", "daily", "weekly")
SETTING_KEYS = (
    "company_name", "address", "phone", "email", "tax_id",
    "currency_code", "currency_decimals", "currency_symbol",
    "fiscal_year_start_month", "default_language", "prices_include_tax",
    "costing_method", "country_profile", "backup_dir", "backup_schedule", "backup_time",
)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def read_settings(db):
    return {row["key"]: row["value"] for row in db.query("SELECT key, value FROM settings")}


def _set(db, key, value):
    db.execute("INSERT INTO settings (key, value) VALUES (?, ?) "
               "ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, str(value)))


def set_setting_internal(db, key, value):
    """Write a company setting without a permission check (system bookkeeping only)."""
    _set(db, key, value)


def get_setting(db, key, default=None):
    value = db.scalar("SELECT value FROM settings WHERE key = ?", (key,))
    return default if value is None else value


def currency_info(db):
    settings = read_settings(db)
    return int(settings.get("currency_decimals", 2)), settings.get("currency_symbol", "")


def create_company_database(path, *, name, currency_code, admin_username, admin_full_name,
                            admin_password, address="", phone="", email="", tax_id="",
                            country_profile="none", fiscal_year_start_month=1,
                            default_language=DEFAULT_LANGUAGE, prices_include_tax=False,
                            costing_method="weighted_average", currency_decimals=None,
                            currency_symbol=None):
    """Create a new, empty company database with its chart, sequences and admin user."""
    name = (name or "").strip()
    if not name or len(name) > 120:
        raise ValidationError("field_required", field="company_name")
    code = (currency_code or "").strip().upper()
    if not re.match(r"^[A-Z]{3}$", code):
        raise ValidationError("invalid_currency")
    if code in CURRENCIES:
        default_decimals, default_symbol = CURRENCIES[code]
    else:
        default_decimals, default_symbol = 2, code
    decimals = default_decimals if currency_decimals in (None, "") else int(currency_decimals)
    if decimals < 0 or decimals > 4:
        raise ValidationError("invalid_currency_decimals")
    symbol = currency_symbol if currency_symbol else default_symbol
    try:
        month = int(fiscal_year_start_month)
    except (TypeError, ValueError) as error:
        raise ValidationError("invalid_fiscal_month") from error
    if not 1 <= month <= 12:
        raise ValidationError("invalid_fiscal_month")
    if default_language not in SUPPORTED_LANGUAGES:
        raise ValidationError("invalid_language")
    if costing_method not in COSTING_METHODS:
        raise ValidationError("invalid_costing_method")
    if country_profile not in TAX_PROFILES:
        raise ValidationError("invalid_tax_profile")
    if email and not EMAIL_RE.match(email):
        raise ValidationError("invalid_email")
    username = validate_username(admin_username)
    validate_password(admin_password)

    db = Database(path)
    try:
        db.migrate()
        with db.transaction():
            stamp = now_iso()
            settings = {
                "company_name": name, "address": address or "", "phone": phone or "",
                "email": email or "", "tax_id": (tax_id or "").strip(),
                "currency_code": code, "currency_decimals": decimals,
                "currency_symbol": symbol, "fiscal_year_start_month": month,
                "default_language": default_language,
                "prices_include_tax": 1 if prices_include_tax else 0,
                "costing_method": costing_method, "country_profile": country_profile,
                "backup_dir": "", "backup_schedule": "none", "backup_time": "02:00",
                "created_at": stamp,
            }
            for key, value in settings.items():
                _set(db, key, value)
            for seq, prefix in SEQUENCES:
                db.execute("INSERT INTO sequences (name, prefix, next_value) VALUES (?, ?, 1)",
                           (seq, prefix))
            _create_default_chart(db, stamp, default_language)
            _create_default_categories_and_methods(db, stamp, default_language)
            _create_tax_profile(db, country_profile, stamp, default_language)
            db.insert("warehouses", {"code": "MAIN", "name": translate("wh_main", default_language),
                                     "address": address or "", "is_active": 1})
            admin_id = db.insert("users", {
                "username": username, "full_name": admin_full_name.strip() or username,
                "password_hash": hash_password(admin_password), "role": "administrator",
                "language": default_language, "is_active": 1,
                "created_at": stamp, "updated_at": stamp, "last_login_at": None,
            })
            audit.record(db, user_id=admin_id, username=username, action="create",
                         module="company", record_type="company", record_id=name,
                         new_value={"currency": code, "country_profile": country_profile})
    finally:
        db.close()
    return {"name": name, "path": str(path)}


def _create_default_chart(db, stamp, lang):
    ids = {}
    for code, name_key, account_type, is_header, parent_code, role in DEFAULT_CHART:
        account_id = db.insert("accounts", {
            "code": code, "name": translate(name_key, lang), "account_type": account_type,
            "parent_id": ids.get(parent_code), "is_header": is_header, "is_active": 1,
            "system_role": role, "created_at": stamp, "updated_at": stamp,
        })
        ids[code] = account_id
    return ids


def system_account_ids(db):
    return {row["system_role"]: row["id"] for row in db.query(
        "SELECT id, system_role FROM accounts WHERE system_role IS NOT NULL")}


def _create_default_categories_and_methods(db, stamp, lang):
    roles = system_account_ids(db)
    db.insert("categories", {
        "name": translate("cat_general", lang), "inventory_account_id": roles["inventory"],
        "revenue_account_id": roles["sales_revenue"], "cogs_account_id": roles["cogs"],
        "is_active": 1,
    })
    for name_key, kind, role in (("pm_cash", "cash", "cash"), ("pm_bank", "bank", "bank"),
                                 ("pm_mobile_money", "mobile", "mobile_money")):
        db.insert("payment_methods", {"name": translate(name_key, lang), "kind": kind,
                                      "account_id": roles[role], "is_active": 1})


def _create_tax_profile(db, profile, stamp, lang):
    rates = TAX_PROFILES[profile]["rates"]
    roles = system_account_ids(db)
    for rate in rates:
        db.insert("tax_rates", {
            "code": rate["code"], "name": translate(rate["name"], lang), "rate_bps": rate["rate_bps"],
            "sales_account_id": roles["tax_payable"] if rate["rate_bps"] else None,
            "purchase_account_id": roles["tax_recoverable"] if rate["rate_bps"] else None,
            "is_active": 1, "country_code": TAX_PROFILES[profile]["country"],
            "created_at": stamp, "updated_at": stamp,
        })


# ----------------------------------------------------------------------
# Settings
# ----------------------------------------------------------------------

def company_profile(db):
    settings = read_settings(db)
    return {
        "company_name": settings.get("company_name", ""),
        "address": settings.get("address", ""),
        "phone": settings.get("phone", ""),
        "email": settings.get("email", ""),
        "tax_id": settings.get("tax_id", ""),
        "currency_code": settings.get("currency_code", "USD"),
        "currency_decimals": int(settings.get("currency_decimals", 2)),
        "currency_symbol": settings.get("currency_symbol", ""),
        "fiscal_year_start_month": int(settings.get("fiscal_year_start_month", 1)),
        "default_language": settings.get("default_language", DEFAULT_LANGUAGE),
        "prices_include_tax": settings.get("prices_include_tax", "0") == "1",
        "costing_method": settings.get("costing_method", "weighted_average"),
        "country_profile": settings.get("country_profile", "none"),
        "lock_date": settings.get("lock_date") or None,
        "backup_dir": settings.get("backup_dir", ""),
        "backup_schedule": settings.get("backup_schedule", "none"),
        "backup_time": settings.get("backup_time", "02:00"),
        "last_backup_at": settings.get("last_backup_at") or None,
        "created_at": settings.get("created_at"),
    }


def update_company_profile(ctx, data):
    ctx.require("settings.manage")
    if "backup_dir" in data:
        # Changing where backups are written is an administrator task (backup.manage).
        ctx.require("backup.manage")
    db = ctx.db
    current = company_profile(db)
    with db.transaction():
        changes = {}
        text_fields = ("company_name", "address", "phone", "email", "tax_id")
        for key in text_fields:
            if key in data:
                value = str(data[key] or "").strip()
                if key == "company_name" and not value:
                    raise ValidationError("field_required", field=key)
                if key == "email" and value and not EMAIL_RE.match(value):
                    raise ValidationError("invalid_email")
                changes[key] = value
        if "fiscal_year_start_month" in data:
            month = int(data["fiscal_year_start_month"])
            if not 1 <= month <= 12:
                raise ValidationError("invalid_fiscal_month")
            changes["fiscal_year_start_month"] = month
        if "default_language" in data:
            if data["default_language"] not in SUPPORTED_LANGUAGES:
                raise ValidationError("invalid_language")
            changes["default_language"] = data["default_language"]
        if "prices_include_tax" in data:
            changes["prices_include_tax"] = 1 if data["prices_include_tax"] else 0
        if "currency_symbol" in data:
            changes["currency_symbol"] = str(data["currency_symbol"] or "").strip()[:8]
        if "costing_method" in data and data["costing_method"] != current["costing_method"]:
            if data["costing_method"] not in COSTING_METHODS:
                raise ValidationError("invalid_costing_method")
            if db.scalar("SELECT COUNT(*) FROM stock_movements", (), 0):
                raise AccountingError("costing_method_locked")
            changes["costing_method"] = data["costing_method"]
        if "backup_schedule" in data:
            if data["backup_schedule"] not in BACKUP_SCHEDULES:
                raise ValidationError("invalid_backup_schedule")
            changes["backup_schedule"] = data["backup_schedule"]
        if "backup_time" in data:
            value = str(data["backup_time"] or "")
            if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", value):
                raise ValidationError("invalid_time")
            changes["backup_time"] = value
        if "backup_dir" in data:
            value = str(data["backup_dir"] or "").strip()
            if value:
                from pathlib import Path
                path = Path(value)
                if not path.is_absolute():
                    raise ValidationError("backup_dir_must_be_absolute")
                if ".." in path.parts:
                    raise ValidationError("backup_dir_invalid")
            changes["backup_dir"] = value
        if not changes:
            return company_profile(db)
        for key, value in changes.items():
            _set(db, key, value)
        ctx.audit("update", "settings", "company", None,
                  old_value={k: current.get(k) for k in changes},
                  new_value=changes)
    return company_profile(db)


def set_lock_date(ctx, value):
    ctx.require("settings.manage")
    db = ctx.db
    new_value = None if not value else parse_iso_date(value, "lock_date").isoformat()
    with db.transaction():
        old = get_setting(db, "lock_date")
        if new_value is None:
            db.execute("DELETE FROM settings WHERE key = 'lock_date'")
        else:
            _set(db, "lock_date", new_value)
        ctx.audit("update", "settings", "lock_date", None, old_value=old, new_value=new_value)
    return new_value


def list_system_roles(db):
    mapping = {row["system_role"]: row for row in db.query(
        "SELECT id, code, name, account_type FROM accounts WHERE system_role IS NOT NULL")}
    return [{"role": role, "account": mapping.get(role)} for role in SYSTEM_ROLES]


def set_system_role(ctx, role, account_id):
    ctx.require("settings.manage")
    db = ctx.db
    if role not in SYSTEM_ROLES:
        raise ValidationError("invalid_system_role")
    with db.transaction():
        previous = db.one("SELECT id FROM accounts WHERE system_role = ?", (role,))
        if account_id in (None, ""):
            new_id = None
        else:
            account = db.one("SELECT * FROM accounts WHERE id = ?", (int(account_id),))
            if account is None:
                raise NotFound("account_not_found", id=account_id)
            if account["is_header"] or not account["is_active"]:
                raise AccountingError("account_not_postable", code=account["code"])
            new_id = account["id"]
        if previous and previous["id"] == new_id:
            return
        if previous:
            db.update("accounts", {"system_role": None, "updated_at": now_iso()},
                      "id = ?", (previous["id"],))
        if new_id is not None:
            db.update("accounts", {"system_role": role, "updated_at": now_iso()},
                      "id = ?", (new_id,))
        ctx.audit("update", "settings", "system_role", role,
                  old_value=previous and previous["id"], new_value=new_id)


# ----------------------------------------------------------------------
# Users
# ----------------------------------------------------------------------

def _user_view(row):
    return {k: row[k] for k in ("id", "username", "full_name", "role", "language",
                                "is_active", "created_at", "updated_at", "last_login_at")}


def list_users(db):
    return [_user_view(row) for row in db.query("SELECT * FROM users ORDER BY username")]


def authenticate(db, username, password):
    row = db.one("SELECT * FROM users WHERE username = ?", ((username or "").strip(),))
    if row is None or not verify_password(password or "", row["password_hash"]):
        raise authentication_failed()
    if not row["is_active"]:
        raise AccountingError("user_inactive")
    stamp = now_iso()
    db.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (stamp, row["id"]))
    audit.record(db, user_id=row["id"], username=row["username"], action="login",
                 module="security", record_type="user", record_id=row["id"])
    return _user_view({**row, "last_login_at": stamp})


def _active_admin_count(db, excluding_id=None):
    return db.scalar(
        "SELECT COUNT(*) FROM users WHERE role = 'administrator' AND is_active = 1 AND id IS NOT ?",
        (excluding_id,), 0)


def create_user(ctx, data):
    ctx.require("users.manage")
    db = ctx.db
    username = validate_username(data.get("username"))
    full_name = str(data.get("full_name", "")).strip()
    role = data.get("role")
    language = data.get("language") or DEFAULT_LANGUAGE
    if not full_name:
        raise ValidationError("field_required", field="full_name")
    if role not in ROLES:
        raise ValidationError("invalid_role")
    if language not in SUPPORTED_LANGUAGES:
        raise ValidationError("invalid_language")
    password = data.get("password") or ""
    validate_password(password)
    with db.transaction():
        if db.one("SELECT 1 FROM users WHERE username = ?", (username,)):
            raise Conflict("duplicate_value", detail=username)
        stamp = now_iso()
        user_id = db.insert("users", {
            "username": username, "full_name": full_name,
            "password_hash": hash_password(password), "role": role,
            "language": language, "is_active": 0 if data.get("is_active") is False else 1,
            "created_at": stamp, "updated_at": stamp, "last_login_at": None,
        })
        ctx.audit("create", "security", "user", user_id,
                  new_value={"username": username, "role": role})
    return _user_view(db.one("SELECT * FROM users WHERE id = ?", (user_id,)))


def update_user(ctx, user_id, data, session_store=None):
    ctx.require("users.manage")
    db = ctx.db
    with db.transaction():
        current = db.one("SELECT * FROM users WHERE id = ?", (user_id,))
        if current is None:
            raise NotFound("user_not_found", id=user_id)
        fields = {"updated_at": now_iso()}
        if "full_name" in data:
            name = str(data["full_name"] or "").strip()
            if not name:
                raise ValidationError("field_required", field="full_name")
            fields["full_name"] = name
        if "role" in data:
            if data["role"] not in ROLES:
                raise ValidationError("invalid_role")
            fields["role"] = data["role"]
        if "language" in data:
            if data["language"] not in SUPPORTED_LANGUAGES:
                raise ValidationError("invalid_language")
            fields["language"] = data["language"]
        if "is_active" in data:
            fields["is_active"] = 1 if data["is_active"] else 0
        demoting = (fields.get("role", current["role"]) != "administrator"
                    or fields.get("is_active", current["is_active"]) == 0)
        if current["role"] == "administrator" and demoting and _active_admin_count(db, user_id) == 0:
            raise AccountingError("last_administrator")
        if user_id == ctx.user_id and fields.get("is_active") == 0:
            raise AccountingError("cannot_deactivate_self")
        db.update("users", fields, "id = ?", (user_id,))
        ctx.audit("update", "security", "user", user_id,
                  old_value={k: current[k] for k in fields if k in current},
                  new_value={k: v for k, v in fields.items() if k != "updated_at"})
        if session_store is not None and fields.get("is_active") == 0:
            session_store.revoke_user(ctx.company_slug, user_id)
    return _user_view(db.one("SELECT * FROM users WHERE id = ?", (user_id,)))


def reset_password(ctx, user_id, new_password):
    ctx.require("users.manage")
    db = ctx.db
    with db.transaction():
        if db.one("SELECT 1 FROM users WHERE id = ?", (user_id,)) is None:
            raise NotFound("user_not_found", id=user_id)
        db.update("users", {"password_hash": hash_password(new_password),
                            "updated_at": now_iso()}, "id = ?", (user_id,))
        ctx.audit("password_reset", "security", "user", user_id)


def change_own_password(ctx, current_password, new_password):
    db = ctx.db
    row = db.one("SELECT * FROM users WHERE id = ?", (ctx.user_id,))
    if not verify_password(current_password or "", row["password_hash"]):
        raise authentication_failed()
    with db.transaction():
        db.update("users", {"password_hash": hash_password(new_password),
                            "updated_at": now_iso()}, "id = ?", (ctx.user_id,))
        ctx.audit("password_change", "security", "user", ctx.user_id)


def set_own_language(ctx, language):
    if language not in SUPPORTED_LANGUAGES:
        raise ValidationError("invalid_language")
    with ctx.db.transaction():
        ctx.db.update("users", {"language": language, "updated_at": now_iso()},
                      "id = ?", (ctx.user_id,))
    ctx.user["language"] = language
    ctx.lang = language
    return language
