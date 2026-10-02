import os
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path


TEMP_DIRECTORY = tempfile.TemporaryDirectory(prefix="ledger-ui-test-")
os.environ["ACCOUNTING_DB_PATH"] = str(Path(TEMP_DIRECTORY.name) / "test-company.db")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import connection, cursor  # noqa: E402
from modules.accounting_repository import AccountingRepository  # noqa: E402


class AccountingRepositoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repository = AccountingRepository(connection, cursor)

    @classmethod
    def tearDownClass(cls):
        connection.close()
        TEMP_DIRECTORY.cleanup()
        os.environ.pop("ACCOUNTING_DB_PATH", None)

    def test_sales_purchasing_receipts_inventory_and_reports_post_together(self):
        customer_id = self.repository.save_customer("Amina Demo", "+237 600 000 001")
        supplier_id = self.repository.save_supplier("Demo Supplier", "+237 600 000 002")
        product_id = self.repository.save_product(
            "DEMO-01", "Sample Item", 10, 15, opening_quantity=20
        )
        search_results = self.repository.global_search("Demo")
        result_ids = [row["result_id"] for row in search_results]
        self.assertEqual(len(result_ids), len(set(result_ids)))

        sale_date = date(date.today().year - 1, date.today().month, 1).isoformat()
        sale = self.repository.create_sale(
            customer_id,
            "Accounts Receivable",
            [{"product_id": product_id, "quantity": 2, "unit_price": 15}],
            posted_date=sale_date,
        )
        self.assertEqual(sale["total"], 30)
        sale_header, _sale_lines = self.repository.sale_details(sale["id"])
        self.assertTrue(sale_header["sale_date"].startswith(sale_date))
        posted_dates = self.repository._all(
            "SELECT entry_date FROM journal_entries WHERE reference IN (?, ?) ORDER BY reference",
            (f"SALE-{sale['id']}", f"COGS-SALE-{sale['id']}"),
        )
        self.assertEqual([row["entry_date"] for row in posted_dates], [sale_date, sale_date])

        receipt = self.repository.create_payment(
            "customer", customer_id, 5, "Cash", "Part payment"
        )
        self.assertEqual(receipt["amount"], 5)

        purchase = self.repository.create_purchase(
            supplier_id,
            "Accounts Payable",
            [{"product_id": product_id, "quantity": 4, "unit_cost": 12}],
        )
        self.assertEqual(purchase["total"], 48)

        supplier_payment = self.repository.create_payment(
            "supplier", supplier_id, 10, "Bank", "Supplier remittance"
        )
        self.assertEqual(supplier_payment["amount"], 10)

        adjustment = self.repository.adjust_inventory(product_id, 20)
        self.assertEqual(adjustment["difference"], -2)

        product = self.repository._one(
            "SELECT quantity, cost_price FROM products WHERE id = ?", (product_id,)
        )
        self.assertEqual(product["quantity"], 20)
        self.assertGreater(product["cost_price"], 10)

        trial_balance = self.repository.trial_balance(date.today().isoformat())
        debit_total = sum(row["debit"] for row in trial_balance)
        credit_total = sum(row["credit"] for row in trial_balance)
        self.assertAlmostEqual(debit_total, credit_total, places=5)

        account, opening, ledger_rows = self.repository.general_ledger(
            "1100", date.today().isoformat(), date.today().isoformat()
        )
        self.assertEqual(account["account_name"], "Accounts Receivable")
        self.assertAlmostEqual(opening, 30)
        self.assertTrue(ledger_rows)

        summary = self.repository.dashboard()
        self.assertEqual(summary["customer_count"], 1)
        self.assertEqual(summary["active_products"], 1)
        self.assertEqual(summary["sales_mtd"], 0)
        self.assertGreater(summary["inventory_value"], 0)
        self.assertTrue(summary["recent"])

    def test_manual_journal_rejects_unbalanced_entries_without_writing(self):
        before = self.repository._one("SELECT COUNT(*) AS count FROM journal_entries")["count"]
        with self.assertRaisesRegex(ValueError, "not balanced"):
            self.repository.post_journal(
                "Unbalanced test", "TEST-UNBALANCED", date.today().isoformat(),
                [
                    {"account_code": "1010", "debit": 25, "credit": 0},
                    {"account_code": "3010", "debit": 0, "credit": 20},
                ],
            )
        after = self.repository._one("SELECT COUNT(*) AS count FROM journal_entries")["count"]
        self.assertEqual(before, after)
        cash_account = self.repository._one(
            "SELECT id FROM accounts WHERE account_code = '1010'"
        )
        with self.assertRaisesRegex(ValueError, "core posting account"):
            self.repository.set_account_active(cash_account["id"], False)


if __name__ == "__main__":
    unittest.main()
