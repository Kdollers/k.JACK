"""Web client checks: every translation key the browser code uses exists in en, fr and rw,
the static files are served with the right types, and the JavaScript parses."""

import re
import shutil
import subprocess
import threading
import unittest
import urllib.request

from genesis import api, catalog, reports, server
from genesis.config import WEB_ROOT
from genesis.locales import TRANSLATIONS
from tests.helpers import Env

WEB = WEB_ROOT
LANGS = ("en", "fr", "rw")

# Keys built at runtime from a value. Each family lists its members explicitly, so a new
# member without a translation fails here rather than showing raw text in the UI.
DYNAMIC_KEYS = {
    "kpi_": ["total_sales", "total_purchases", "cash_balance", "bank_balance", "mobile_balance",
             "accounts_receivable", "accounts_payable", "inventory_value", "gross_profit", "net_profit"],
    "status_": ["draft", "confirmed", "posted", "closed", "cancelled", "reversed"],
    "doctype_": ["sales_invoice", "purchase_invoice", "sales_credit", "purchase_return",
                 "sales_order", "purchase_order", "sales_quote"],
    "role_": ["administrator", "accountant", "sales", "purchases", "inventory", "manager"],
    "schedule_": ["none", "daily", "weekly"],
    "check_": ["balanced", "reconciled"],
    "state_": ["active", "inactive"],
    "report_": list(reports.BUILDERS),
    "costing_": ["fifo", "weighted_average"],
    "tax_profile_": ["rw", "none", "custom"],
    "field_": ["name", "code", "phone", "email", "address", "tax_id", "credit_limit",
               "opening_balance", "opening_date", "company_name", "fiscal_year_start_month"],
}

# Keys used directly in the JavaScript that are not written as literal t("...") calls.
EXTRA_KEYS = ["state_active", "state_inactive"]


def js_literal_keys():
    keys = set()
    for path in sorted(WEB.glob("js/*.js")):
        text = path.read_text(encoding="utf-8")
        keys.update(re.findall(r"""\bt\(\s*["']([a-z0-9_]+)["']""", text))
        keys.update(re.findall(r"""label:\s*["']([a-z0-9_]+)["']""", text))
    return keys


class TranslationCoverageTests(unittest.TestCase):
    def test_every_literal_key_used_by_the_browser_is_translated(self):
        keys = js_literal_keys() | set(EXTRA_KEYS)
        self.assertGreater(len(keys), 40, "the scanner found too few keys")
        for code in LANGS:
            missing = sorted(key for key in keys if key not in TRANSLATIONS[code] and key not in ("",))
            self.assertEqual(missing, [], f"missing in {code}")

    def test_dynamic_key_families_are_translated(self):
        for prefix, members in DYNAMIC_KEYS.items():
            for member in members:
                key = prefix + member
                for code in LANGS:
                    self.assertIn(key, TRANSLATIONS[code], f"{key} missing in {code}")

    def test_report_label_keys_from_the_builders_are_translated(self):
        env = Env()
        try:
            customer = catalog.save_partner(env.ctx, "customer", {"name": "Label Customer"})["id"]
            supplier = catalog.save_partner(env.ctx, "supplier", {"name": "Label Supplier"})["id"]
            partners = {"customer_statement": customer, "supplier_statement": supplier}
            dates = {"start": "2026-01-01", "end": "2026-12-31", "as_of": "2026-12-31"}
            labels = set()
            for name, builder in reports.BUILDERS.items():
                kwargs = {key: dates[key] for key in api.REPORT_FILTERS[name] if key in dates}
                if "partner_id" in api.REPORT_FILTERS[name]:
                    kwargs["partner_id"] = partners[name]
                report = builder(env.db, **kwargs)
                labels.add(report["title_key"])
                labels.update(column["label_key"] for column in report["columns"])
                labels.update(item["label_key"] for item in report["summary"])
            for code in LANGS:
                missing = sorted(k for k in labels if k not in TRANSLATIONS[code])
                self.assertEqual(missing, [], code)
        finally:
            env.close()


class StaticServingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env()
        cls.httpd = server.make_server(cls.env.app, "127.0.0.1", 0)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.env.close()

    def fetch(self, path):
        with urllib.request.urlopen(self.base + path, timeout=10) as response:
            return response.status, response.headers.get("Content-Type", ""), response.read()

    def test_index_and_assets_are_served(self):
        status, ctype, body = self.fetch("/")
        self.assertEqual(status, 200)
        self.assertTrue(ctype.startswith("text/html"))
        self.assertIn(b'src="/js/app.js"', body)
        status, ctype, _ = self.fetch("/js/app.js")
        self.assertEqual(status, 200)
        self.assertIn("javascript", ctype)
        status, ctype, _ = self.fetch("/css/app.css")
        self.assertEqual(status, 200)
        self.assertTrue(ctype.startswith("text/css"))

    def test_page_has_no_inline_script_for_the_csp(self):
        _s, _c, body = self.fetch("/")
        self.assertNotIn(b"<script>", body)
        self.assertNotRegex(body.decode("utf-8"), r"\son[a-z]+=")

    def test_javascript_modules_have_no_inline_event_attributes(self):
        for path in WEB.glob("js/*.js"):
            text = path.read_text(encoding="utf-8")
            self.assertNotIn("innerHTML", text, path.name)

    @unittest.skipUnless(shutil.which("node"), "node is not installed")
    def test_javascript_parses(self):
        for path in sorted(WEB.glob("js/*.js")):
            result = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True, timeout=60)
            self.assertEqual(result.returncode, 0, f"{path.name}: {result.stderr}")


if __name__ == "__main__":
    unittest.main()
