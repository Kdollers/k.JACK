"""Password hashing, roles and permissions, and login sessions."""

import hashlib
import hmac
import re
import secrets
import threading
from datetime import datetime, timedelta, timezone

from . import config
from .errors import AuthenticationError, ValidationError

USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,40}$")

ROLES = ("administrator", "accountant", "sales", "purchases", "inventory", "manager")

PERMISSIONS = (
    "dashboard.view",
    "customers.view", "customers.manage",
    "suppliers.view", "suppliers.manage",
    "products.view", "products.manage",
    "inventory.view", "inventory.move", "inventory.adjust",
    "sales.view", "sales.manage", "sales.post",
    "purchases.view", "purchases.manage", "purchases.post",
    "payments.view", "payments.record", "payments.reverse",
    "accounting.view", "accounting.manage_accounts", "accounting.journal", "accounting.reverse",
    "reports.view", "reports.export",
    "tax.manage",
    "settings.manage",
    "users.manage",
    "audit.view",
    "backup.manage",
    "companies.manage",
)

_VIEW_ALL = (
    "dashboard.view", "customers.view", "suppliers.view", "products.view",
    "inventory.view", "sales.view", "purchases.view", "payments.view",
    "accounting.view", "reports.view", "reports.export",
)

ROLE_PERMISSIONS = {
    "administrator": frozenset(PERMISSIONS),
    "accountant": frozenset(_VIEW_ALL + (
        "customers.manage", "suppliers.manage", "sales.post", "purchases.post",
        "payments.record", "payments.reverse", "accounting.manage_accounts",
        "accounting.journal", "accounting.reverse", "tax.manage", "audit.view",
    )),
    "sales": frozenset((
        "dashboard.view", "customers.view", "customers.manage", "products.view",
        "inventory.view", "sales.view", "sales.manage", "sales.post",
        "payments.view", "payments.record", "reports.view",
    )),
    "purchases": frozenset((
        "dashboard.view", "suppliers.view", "suppliers.manage", "products.view",
        "inventory.view", "purchases.view", "purchases.manage", "purchases.post",
        "payments.view", "payments.record", "reports.view",
    )),
    "inventory": frozenset((
        "dashboard.view", "products.view", "products.manage", "inventory.view",
        "inventory.move", "inventory.adjust", "sales.view", "purchases.view",
        "reports.view",
    )),
    "manager": frozenset(_VIEW_ALL + ("audit.view",)),
}

ROLE_LABEL_KEYS = {
    "administrator": "role_administrator",
    "accountant": "role_accountant",
    "sales": "role_sales",
    "purchases": "role_purchases",
    "inventory": "role_inventory",
    "manager": "role_manager",
}


def permissions_for(role):
    return ROLE_PERMISSIONS.get(role, frozenset())


def validate_password(password):
    if not isinstance(password, str) or len(password) < config.MIN_PASSWORD_LENGTH:
        raise ValidationError("password_too_short", minimum=config.MIN_PASSWORD_LENGTH)
    if password.strip() != password:
        raise ValidationError("password_spaces")


def validate_username(username):
    if not isinstance(username, str) or not USERNAME_RE.match(username.strip()):
        raise ValidationError("invalid_username")
    return username.strip()


def hash_password(password):
    validate_password(password)
    salt = secrets.token_bytes(16)
    iterations = config.PBKDF2_ITERATIONS
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def verify_password(password, stored):
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$")
    except (ValueError, AttributeError):
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
    )
    return hmac.compare_digest(digest.hex(), digest_hex)


class SessionStore:
    """In-memory bearer-token sessions. Tokens are never written to disk."""

    def __init__(self):
        self._sessions = {}
        self._lock = threading.Lock()

    def create(self, company_slug, user):
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(seconds=config.SESSION_TTL_SECONDS)
        with self._lock:
            self._purge_locked()
            self._sessions[token] = {
                "company": company_slug,
                "user_id": user["id"],
                "expires": expires,
            }
        return token

    def get(self, token):
        if not token:
            return None
        with self._lock:
            session = self._sessions.get(token)
            if session is None:
                return None
            if session["expires"] < datetime.now(timezone.utc):
                self._sessions.pop(token, None)
                return None
            session["expires"] = datetime.now(timezone.utc) + timedelta(
                seconds=config.SESSION_TTL_SECONDS
            )
            return dict(session)

    def revoke(self, token):
        with self._lock:
            self._sessions.pop(token, None)

    def revoke_user(self, company_slug, user_id):
        with self._lock:
            for token in [t for t, s in self._sessions.items()
                          if s["company"] == company_slug and s["user_id"] == user_id]:
                self._sessions.pop(token, None)

    def revoke_company(self, company_slug):
        with self._lock:
            for token in [t for t, s in self._sessions.items() if s["company"] == company_slug]:
                self._sessions.pop(token, None)

    def _purge_locked(self):
        now = datetime.now(timezone.utc)
        for token in [t for t, s in self._sessions.items() if s["expires"] < now]:
            self._sessions.pop(token, None)


def authentication_failed():
    return AuthenticationError("invalid_credentials")
