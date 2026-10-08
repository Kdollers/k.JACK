"""Application container: the company registry, open company databases and sessions."""

import re
import shutil
import threading
from pathlib import Path

from . import company as company_mod
from .auth import SessionStore
from .config import COMPANIES_SUBDIR, DATA_DIR, DEFAULT_BACKUP_SUBDIR, REGISTRY_FILENAME
from .context import Context
from .db import Database
from .errors import AuthenticationError, NotFound, ValidationError
from .timeutil import now_iso

REGISTRY_SCHEMA = """
CREATE TABLE companies (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    db_file TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);
"""


def slugify(name):
    base = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return (base or "company")[:40]


class Application:
    def __init__(self, data_dir=None):
        self.data_dir = Path(data_dir or DATA_DIR)
        self.companies_dir = self.data_dir / COMPANIES_SUBDIR
        self.backup_root = self.data_dir / DEFAULT_BACKUP_SUBDIR
        self.companies_dir.mkdir(parents=True, exist_ok=True)
        self.registry = Database(self.data_dir / REGISTRY_FILENAME)
        if self.registry.schema_version() == 0:
            with self.registry.transaction():
                self.registry.execute(REGISTRY_SCHEMA)
            self.registry.execute("PRAGMA user_version = 1")
        self.sessions = SessionStore()
        self.lock = threading.RLock()
        self._open = {}

    # -- companies --------------------------------------------------------
    def list_companies(self):
        return self.registry.query("SELECT slug, name, created_at FROM companies ORDER BY name")

    def company(self, slug):
        row = self.registry.one("SELECT * FROM companies WHERE slug = ?", (slug,))
        if row is None:
            raise NotFound("company_not_found", slug=slug)
        return row

    def has_companies(self):
        return bool(self.registry.scalar("SELECT COUNT(*) FROM companies", (), 0))

    def create_company(self, **fields):
        name = (fields.get("name") or "").strip()
        with self.lock:
            base = slugify(name)
            slug, counter = base, 1
            while self.registry.one("SELECT 1 FROM companies WHERE slug = ?", (slug,)):
                counter += 1
                slug = f"{base}-{counter}"
            db_file = f"{slug}.db"
            path = self.companies_dir / db_file
            if path.exists():
                raise ValidationError("company_file_exists")
            company_mod.create_company_database(path, name=name,
                                                **{k: v for k, v in fields.items() if k != "name"})
            try:
                self.registry.insert("companies", {"slug": slug, "name": name, "db_file": db_file,
                                                   "created_at": now_iso()})
            except Exception:
                # Do not leave an orphan company file that the registry does not know about.
                remove_quietly(path)
                raise
        return {"slug": slug, "name": name}

    def open_company(self, slug):
        with self.lock:
            if slug in self._open:
                return self._open[slug]
            row = self.company(slug)
            db = Database(self.companies_dir / row["db_file"])
            db.migrate()
            self._open[slug] = db
            return db

    def close_company(self, slug):
        with self.lock:
            db = self._open.pop(slug, None)
            if db is not None:
                db.close()

    def close(self):
        with self.lock:
            for slug in list(self._open):
                self.close_company(slug)
            self.registry.close()

    def company_path(self, slug):
        return self.companies_dir / self.company(slug)["db_file"]

    # -- sessions -------------------------------------------------------
    def login(self, slug, username, password):
        db = self.open_company(slug)
        with db.transaction():
            user = company_mod.authenticate(db, username, password)
        token = self.sessions.create(slug, user)
        return token, user

    def context_for(self, token):
        session = self.sessions.get(token)
        if session is None:
            raise AuthenticationError("session_expired")
        db = self.open_company(session["company"])
        row = db.one("SELECT id, username, full_name, role, language, is_active FROM users WHERE id = ?",
                     (session["user_id"],))
        if row is None or not row["is_active"]:
            self.sessions.revoke(token)
            raise AuthenticationError("session_expired")
        return Context(self, session["company"], db, row)

    def optional_context(self, token):
        """The caller's context when a token is supplied, otherwise None. Bad tokens still raise."""
        return self.context_for(token) if token else None

    def logout(self, token):
        self.sessions.revoke(token)


def ensure_backup_dir(path):
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def remove_quietly(path):
    try:
        Path(path).unlink()
    except FileNotFoundError:
        pass


__all__ = ["Application", "slugify", "ensure_backup_dir", "remove_quietly", "shutil"]
