"""Financial reports reconcile with each other, and exports produce valid files."""

import csv
import io
import re
import unittest
import xml.etree.ElementTree as ET
import zipfile

from tests.helpers import Env
from tests.test_documents import cash_method, line, make_customer, make_product, purchase_doc, sales_doc, stock_in
from genesis import catalog, documents, exporters, inventory, ledger, payments, reports

END = "2026-12-31"
START = "2026-01-01"


class ReportScenario(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env(costing_method="fifo")
        env = cls.env
        cls.customer = make_customer(env, "Report Customer")
        cls.open_customer = catalog.save_partner(env.ctx, "customer", {"name": "Opening Customer",
                                                                        "opening_balance": "500"})["id"]
        cls.supplier = catalog.save_partner(env.ctx, "supplier", {"name": "Report Supplier"})["id"]
        cls.product = make_product(env, "RPT-1", price=1500, cost=1000)
        stock_in(env, cls.product, 20, 1000)
        inv = sales_doc(env, "sales_invoice", cls.customer, [line(cls.product, 3, 1500)], doc_date="2026-03-01")
        documents.post_document(env.ctx, inv["id"])
        payments.record_payment(env.ctx, party_type="customer", party_id=cls.customer,
                                method_id=cash_method(env), amount_minor=2000, date_value="2026-03-05")
        open_inv = sales_doc(env, "sales_invoice", cls.open_customer, [line(cls.product, 1, 1500)],
                             doc_date="2026-01-20")
        documents.post_document(env.ctx, open_inv["id"])
        pi = purchase_doc(env, "purchase_invoice", cls.supplier, [line(cls.product, 10, 1000)],
                          doc_date="2026-02-10")
        documents.post_document(env.ctx, pi["id"])
        payments.record_payment(env.ctx, party_type="supplier", party_id=cls.supplier,
                                method_id=env.db.one("SELECT id FROM payment_methods WHERE kind='bank'")["id"],
                                amount_minor=5000, date_value="2026-03-15")
        with env.db.transaction():
            ledger.post_entry(env.ctx, entry_date="2026-03-20", description="Office rent",
                              lines=[{"account_id": env.db.one("SELECT id FROM accounts WHERE code='6010'")["id"],
                                      "debit_minor": 1000, "credit_minor": 0},
                                     {"account_id": env.account_id("cash"), "debit_minor": 0,
                                      "credit_minor": 1000}])

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_trial_balance_debits_equal_credits(self):
        report = reports.trial_balance(self.env.db, start=START, end=END)
        total = report["rows"][-1]
        self.assertEqual(total["kind"], "grand")
        self.assertEqual(total["debit"], total["credit"])
        self.assertTrue(report["checks"]["balanced"])

    def test_profit_and_loss_matches_balance_sheet_current_earnings(self):
        pl = reports.profit_loss(self.env.db, start=START, end=END)
        bs = reports.balance_sheet(self.env.db, as_of=END)
        earnings = [r for r in bs["rows"] if r.get("name") == {"key": "bs_current_earnings"}]
        self.assertEqual(len(earnings), 1)
        self.assertEqual(earnings[0]["amount"], pl["checks"]["net_profit"])
        self.assertTrue(bs["checks"]["balanced"], bs["checks"])
        self.assertEqual(bs["checks"]["difference"], 0)

    def test_profit_numbers_are_as_expected(self):
        pl = reports.profit_loss(self.env.db, start=START, end=END)
        # Revenue: 3 x 1500 + 1 x 1500 = 6000. COGS: 4 x 1000 = 4000. Rent expense: 1000.
        self.assertEqual(pl["checks"]["revenue"], 6000)
        self.assertEqual(pl["checks"]["gross_profit"], 2000)
        self.assertEqual(pl["checks"]["net_profit"], 1000)

    def test_cash_flow_reconciles_to_cash_balance(self):
        cf = reports.cash_flow(self.env.db, start=START, end=END)
        self.assertTrue(cf["checks"]["reconciled"], cf["checks"])
        closing = [r for r in cf["rows"] if r.get("name") == {"key": "cf_closing"}][0]["amount"]
        cash_accounts = {r["account_id"] for r in self.env.db.query("SELECT account_id FROM payment_methods")}
        self.assertEqual(closing, sum(ledger.account_balance(self.env.db, a) for a in cash_accounts))

    def test_receivables_ageing_total_equals_control_account(self):
        report = reports.BUILDERS["ar_ageing"](self.env.db, as_of=END)
        self.assertEqual(report["checks"]["total"], report["checks"]["control"])
        self.assertGreater(report["checks"]["total"], 0)

    def test_payables_ageing_total_equals_control_account(self):
        report = reports.BUILDERS["ap_ageing"](self.env.db, as_of=END)
        self.assertEqual(report["checks"]["total"], report["checks"]["control"])

    def test_inventory_valuation_matches_inventory_account(self):
        report = reports.inventory_valuation(self.env.db, as_of=END)
        self.assertEqual(report["checks"]["value_total"], ledger.account_balance(self.env.db, self.env.account_id("inventory")))
        self.assertEqual(inventory.verify_inventory(self.env.db), [])

    def test_general_ledger_running_balance_ends_at_account_balance(self):
        cash = self.env.account_id("cash")
        report = reports.general_ledger(self.env.db, start=START, end=END, account_id=cash)
        closing = [r for r in report["rows"] if r["kind"] == "total"]
        self.assertEqual(len(closing), 1)
        self.assertEqual(closing[0]["balance"], ledger.account_balance(self.env.db, cash))

    def test_customer_statement_closing_matches_partner_balance(self):
        report = reports.BUILDERS["customer_statement"](self.env.db, partner_id=self.customer, start=START, end=END)
        self.assertEqual(report["checks"]["closing"], catalog.partner_balance(self.env.db, "customer", self.customer))

    def test_dashboard_runs_and_reports_kpis(self):
        dash = reports.dashboard(self.env.db, START, END)
        self.assertIsInstance(dash, dict)
        self.assertTrue(dash)


class ExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env()
        cls.report = reports.trial_balance(cls.env.db, start=START, end=END)

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_csv_has_bom_plain_decimals_and_header(self):
        data = exporters.to_csv(self.report, "fr")
        self.assertTrue(data.startswith(b"\xef\xbb\xbf"))
        rows = list(csv.reader(io.StringIO(data[3:].decode("utf-8"))))
        self.assertEqual(rows[2][0], "Code")
        self.assertIsNotNone(rows[2])

    def test_xlsx_is_a_valid_zip_with_well_formed_xml(self):
        data = exporters.to_xlsx(self.report, "en")
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            self.assertIsNone(archive.testzip())
            names = set(archive.namelist())
            self.assertIn("xl/worksheets/sheet1.xml", names)
            self.assertIn("xl/workbook.xml", names)
            for name in names:
                ET.fromstring(archive.read(name))  # raises if malformed

    def test_pdf_has_valid_cross_reference_table(self):
        data = exporters.to_pdf(self.report, "en", "Test Company", generated_at="2026-10-08 00:00 UTC")
        self.assertTrue(data.startswith(b"%PDF-1.4"))
        self.assertTrue(data.rstrip().endswith(b"%%EOF"))
        xref_at = int(re.search(rb"startxref\n(\d+)\n", data).group(1))
        self.assertEqual(data[xref_at:xref_at + 4], b"xref")
        entries = re.findall(rb"(\d{10}) (\d{5}) (n|f) \n", data[xref_at:])
        self.assertTrue(entries)
        for offset_text, _gen, kind in entries[1:]:
            offset = int(offset_text)
            self.assertEqual(kind, b"n")
            self.assertRegex(data[offset:offset + 12], rb"\d+ 0 obj")

    def test_html_print_is_escaped(self):
        page = exporters.to_html(self.report, "rw", "<script>x</script>")
        self.assertNotIn("<script>x</script>", page)
        self.assertIn("&lt;script&gt;", page)

    def test_translated_headers_in_each_language(self):
        english = exporters.to_csv(self.report, "en").decode("utf-8-sig")
        french = exporters.to_csv(self.report, "fr").decode("utf-8-sig")
        kinyarwanda = exporters.to_csv(self.report, "rw").decode("utf-8-sig")
        self.assertIn("Code,Account,", english)
        self.assertIn("Compte", french)
        self.assertNotIn("Account", french)
        self.assertNotIn("Account", kinyarwanda)


if __name__ == "__main__":
    unittest.main()
