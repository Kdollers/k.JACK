"""End-to-end business flow through the HTTP dispatch layer, plus costing end to end."""

import unittest

from genesis import api, exporters, ledger, reports
from genesis.api import Binary, Html
from tests.helpers import ADMIN_PASSWORD, Env

START, END = "2026-01-01", "2026-12-31"


def call(env, method, path, body=None, query=None, token=None, lang=None):
    status, payload = api.dispatch(env.app, method, path, body=body, query=query, token=token or "",
                                   lang=lang)
    return status, payload


def must(result, expected=200):
    status, payload = result
    if status != expected:
        raise AssertionError(f"expected {expected}, got {status}: {payload}")
    return payload


def find_id(rows, **match):
    for row in rows:
        if all(row.get(k) == v for k, v in match.items()):
            return row["id"]
    raise AssertionError(f"no row matching {match}")


class BusinessFlowSmoke(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env(costing_method="fifo")
        env = cls.env
        login = must(call(env, "POST", "/api/login",
                          body={"company": env.slug, "username": "admin", "password": ADMIN_PASSWORD}))
        # Each test method gets its own instance, so the flow's state lives on the class.
        cls.state = {"token": login["token"], "session": login}

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def req(self, method, path, body=None, query=None, expected=200):
        return must(call(self.env, method, path, body=body, query=query, token=self.state["token"]), expected)

    def test_01_session_reports_permissions(self):
        self.assertIn("reports.view", self.state["session"]["permissions"])
        self.assertEqual(self.state["session"]["user"]["role"], "administrator")

    def test_02_master_data(self):
        self.state["customer"] = self.req("POST", "/api/customers", {"name": "Smoke Customer"})["id"]
        self.state["supplier"] = self.req("POST", "/api/suppliers", {"name": "Smoke Supplier"})["id"]
        self.state["product"] = self.req("POST", "/api/products", {
            "sku": "SMK-1", "name": "Smoke Item", "cost_price": "1000", "selling_price": "1500",
            "track_stock": True})["id"]
        self.assertTrue(self.state["customer"] and self.state["supplier"] and self.state["product"])
        names = [row["name"] for row in self.req("GET", "/api/customers")]
        self.assertIn("Smoke Customer", names)

    def test_03_stock_receipts_at_two_costs(self):
        warehouse = find_id(self.req("GET", "/api/warehouses"), code="MAIN")
        offset = self.env.account_id("opening_equity")
        self.req("POST", "/api/stock/receipts", {"product_id": self.state["product"], "warehouse_id": warehouse,
                                                 "quantity": "10", "unit_cost": "1000",
                                                 "offset_account_id": offset, "date": "2026-02-01"})
        self.req("POST", "/api/stock/receipts", {"product_id": self.state["product"], "warehouse_id": warehouse,
                                                 "quantity": "10", "unit_cost": "1200",
                                                 "offset_account_id": offset, "date": "2026-02-02"})
        stock = self.req("GET", "/api/stock")
        level = [row for row in stock if row["product_id"] == self.state["product"]][0]
        self.assertEqual(level["value_minor"], 22000)

    def test_04_invoice_post_and_payment(self):
        invoice = self.req("POST", "/api/documents", {
            "doc_type": "sales_invoice", "customer_id": self.state["customer"], "doc_date": "2026-03-01",
            "lines": [{"product_id": self.state["product"], "quantity": "15", "unit_price": "1500"}]})
        self.state["invoice"] = invoice["id"]
        posted = self.req("POST", f"/api/documents/{self.state['invoice']}/post")
        self.assertEqual(posted["status"], "posted")
        # FIFO: 10 @ 1000 + 5 @ 1200 = 16000 cost of goods sold, leaving 5 @ 1200 = 6000 in stock.
        self.assertEqual(ledger.account_balance(self.env.db, self.env.account_id("cogs")), 16000)
        level = [r for r in self.req("GET", "/api/stock") if r["product_id"] == self.state["product"]][0]
        self.assertEqual(level["value_minor"], 6000)
        method = find_id(self.req("GET", "/api/payment-methods"), kind="cash")
        self.req("POST", "/api/payments", {"party_type": "customer", "party_id": self.state["customer"],
                                          "payment_method_id": method, "amount": "10000",
                                          "payment_date": "2026-03-05"})
        self.assertEqual(self.req("GET", f"/api/documents/{self.state['invoice']}")["balance_minor"],
                         self.req("GET", f"/api/documents/{self.state['invoice']}")["total_minor"] - 10000)

    def test_05_every_report_builds_and_balances(self):
        query = {"start": START, "end": END, "as_of": END, "partner_id": str(self.state["customer"]),
                 "customer_id": str(self.state["customer"])}
        for name in reports.BUILDERS:
            report = self.req("GET", f"/api/reports/{name}", query=query)
            self.assertIn("rows", report, name)
            self.assertIn("title_key", report, name)
        trial = self.req("GET", "/api/reports/trial_balance", query=query)
        self.assertTrue(trial["checks"]["balanced"])
        cash_flow = self.req("GET", "/api/reports/cash_flow", query=query)
        self.assertTrue(cash_flow["checks"]["reconciled"])
        self.assertEqual(self.req("GET", "/api/reports/ar_ageing", query=query)["checks"]["total"],
                         self.req("GET", "/api/reports/ar_ageing", query=query)["checks"]["control"])

    def test_06_every_export_format_is_valid(self):
        query = {"start": START, "end": END}
        for fmt in exporters.EXPORTERS:
            status, payload = call(self.env, "GET", "/api/reports/trial_balance/export",
                                   query={**query, "format": fmt}, token=self.state["token"], lang="fr")
            self.assertEqual(status, 200, fmt)
            self.assertIsInstance(payload, Binary)
            self.assertTrue(payload.content)
            self.assertEqual(payload.content_type, exporters.EXPORTERS[fmt][0])
        status, payload = call(self.env, "GET", "/api/reports/profit_loss/print",
                               query=query, token=self.state["token"])
        self.assertEqual(status, 200)
        self.assertIsInstance(payload, Html)
        self.assertIn("<html", payload.content.lower())

    def test_07_export_rejects_unknown_format(self):
        status, payload = call(self.env, "GET", "/api/reports/trial_balance/export",
                               query={"format": "exe"}, token=self.state["token"])
        self.assertEqual(status, 422)
        self.assertEqual(payload["error"], "invalid_export_format")

    def test_08_backup_create_verify_and_restore(self):
        manifest = self.req("POST", "/api/backups")
        listed = self.req("GET", "/api/backups")
        self.assertIn(manifest["file"], [item["file"] for item in listed["items"]])
        verified = self.req("POST", "/api/backups/verify", {"file": manifest["file"]})
        self.assertTrue(verified["ok"], verified)
        # Restore needs the exact confirmation word.
        self.req("POST", "/api/backups/restore", {"file": manifest["file"], "confirm": "yes"}, expected=422)
        result = self.req("POST", "/api/backups/restore", {"file": manifest["file"], "confirm": "RESTORE"})
        self.assertTrue(result["safety_copy"])
        # Restore ends open sessions for this company, so the old token is no longer valid.
        self.assertEqual(call(self.env, "GET", "/api/me", token=self.state["token"])[0], 401)
        self.state["token"] = must(call(self.env, "POST", "/api/login",
                               body={"company": self.env.slug, "username": "admin",
                                     "password": ADMIN_PASSWORD}))["token"]
        names = [row["name"] for row in self.req("GET", "/api/customers")]
        self.assertIn("Smoke Customer", names)
        self.assertEqual(ledger.verify_ledger(self.env.app.open_company(self.env.slug)), [])

    def test_09_language_switch_keeps_data(self):
        before = [row["name"] for row in self.req("GET", "/api/customers")]
        self.req("PUT", "/api/me/language", {"language": "fr"})
        self.req("PUT", "/api/me/language", {"language": "rw"})
        self.req("PUT", "/api/me/language", {"language": "en"})
        self.assertEqual([row["name"] for row in self.req("GET", "/api/customers")], before)

    def test_10_integrity_endpoint_is_clean(self):
        result = self.req("GET", "/api/integrity")
        self.assertTrue(result["ok"], result)


class CostingEndToEnd(unittest.TestCase):
    """The same purchases and sale give different COGS under FIFO and weighted average."""

    def cogs_for(self, method):
        env = Env(costing_method=method)
        try:
            from genesis import catalog, documents, inventory
            cust = catalog.save_partner(env.ctx, "customer", {"name": "Cost Customer"})["id"]
            product = catalog_product(env)
            warehouse = env.db.one("SELECT id FROM warehouses WHERE code = 'MAIN'")["id"]
            offset = env.account_id("opening_equity")
            inventory.stock_receipt(env.ctx, {"product_id": product, "warehouse_id": warehouse,
                                              "quantity": "10", "unit_cost": "1000",
                                              "offset_account_id": offset, "date": "2026-02-01"})
            inventory.stock_receipt(env.ctx, {"product_id": product, "warehouse_id": warehouse,
                                              "quantity": "10", "unit_cost": "1200",
                                              "offset_account_id": offset, "date": "2026-02-02"})
            doc = documents.save_document(env.ctx, {
                "doc_type": "sales_invoice", "customer_id": cust, "doc_date": "2026-03-01",
                "lines": [{"product_id": product, "quantity": "15", "unit_price": "1500"}]})
            documents.post_document(env.ctx, doc["id"])
            self.assertEqual(ledger.verify_ledger(env.db), [])
            return ledger.account_balance(env.db, env.account_id("cogs"))
        finally:
            env.close()

    def test_fifo_and_weighted_average_cogs_differ(self):
        fifo = self.cogs_for("fifo")
        average = self.cogs_for("weighted_average")
        self.assertEqual(fifo, 16000)          # 10 @ 1000 + 5 @ 1200
        self.assertEqual(average, 16500)       # 15 @ 1100 average
        self.assertNotEqual(fifo, average)


def catalog_product(env):
    from genesis import catalog
    return catalog.save_product(env.ctx, {"sku": "COST-1", "name": "Costed item",
                                          "cost_price": "1000", "selling_price": "1500",
                                          "track_stock": True})["id"]


if __name__ == "__main__":
    unittest.main()
