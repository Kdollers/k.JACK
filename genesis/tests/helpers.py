"""Shared test harness: a temporary data directory, a company, and signed-in contexts."""

import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from genesis import config  # noqa: E402

# Keep password hashing fast in tests; production uses config.PBKDF2_ITERATIONS.
config.PBKDF2_ITERATIONS = 2000

from genesis.app import Application  # noqa: E402

ADMIN_PASSWORD = "Admin-pass-123"


class Env:
    """A fresh registry + one company, with an administrator context."""

    def __init__(self, costing_method="weighted_average", language="en", currency="RWF"):
        self.dir = Path(tempfile.mkdtemp(prefix="genesis-test-"))
        self.app = Application(self.dir)
        self.company = self.app.create_company(
            name="Test Company Ltd", currency_code=currency, admin_username="admin",
            admin_full_name="Admin User", admin_password=ADMIN_PASSWORD,
            country_profile="RW", costing_method=costing_method, default_language=language)
        self.slug = self.company["slug"]
        self.ctx = self.sign_in("admin", ADMIN_PASSWORD)
        self.db = self.ctx.db

    def sign_in(self, username, password):
        token, _user = self.app.login(self.slug, username, password)
        return self.app.context_for(token)

    def account_id(self, system_role):
        from genesis.company import system_account_ids
        return system_account_ids(self.db)[system_role]

    def close(self):
        self.app.close()
        shutil.rmtree(self.dir, ignore_errors=True)
