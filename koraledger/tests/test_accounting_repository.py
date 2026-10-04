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

    def _assert_gl_balanced(self):
        row = self.repository._one(
            "SELECT COALESCE(SUM(debit), 0) AS d, COALESCE(SUM(credit), 0) AS c FROM journal_lines"
        )
        self.assertAlmostEqual(row["d"], row["c"], places=5)

    def test_payroll_run_posts_payslips_and_balanced_gl(self):
        employee_id = self.repository.save_employee(
            "Payroll Test Clerk", "Test role", 150000, "2024-05-01", "PT-001"
        )
        before = self.repository._one("SELECT COUNT(*) AS count FROM journal_entries")["count"]
        run = self.repository.run_payroll(
            "2026-01-01", "2026-01-31",
            {str(employee_id): {"allowances": 25000, "deductions": 10000}},
        )
        self.assertEqual(run["employee_count"], 1)
        self.assertEqual(run["total_net"], 165000)
        header, payslips = self.repository.payroll_run_details(run["id"])
        self.assertEqual(len(payslips), 1)
        self.assertEqual(payslips[0]["net_salary"], 165000)
        after = self.repository._one("SELECT COUNT(*) AS count FROM journal_entries")["count"]
        self.assertEqual(after, before + 1)
        self._assert_gl_balanced()
        # duplicate run for a new period is allowed; run totals reflect both periods
        second = self.repository.run_payroll("2026-02-01", "2026-02-28")
        self.assertEqual(second["total_net"], 150000)
        # deactivated employees are excluded from future runs
        self.repository.set_employee_active(employee_id, False)
        with self.assertRaisesRegex(ValueError, "no active employees"):
            self.repository.run_payroll("2026-03-01", "2026-03-31")
        self.repository.set_employee_active(employee_id, True)

    def test_fixed_asset_acquisition_and_depreciation_post_gl(self):
        asset_id = self.repository.save_asset(
            "PT-A01", "Test machine", "Equipment", "2026-02-01", 4000000,
            0, 4, "unit test asset",
        )
        self.assertTrue(asset_id)
        asset = next(row for row in self.repository.list_assets() if row["id"] == asset_id)
        self.assertAlmostEqual(asset["net_book_value"], 4000000)
        result = self.repository.post_depreciation(asset_id, "2026")
        self.assertEqual(result["amount"], 1000000)
        with self.assertRaisesRegex(ValueError, "already posted"):
            self.repository.post_depreciation(asset_id, "2026")
        asset = next(row for row in self.repository.list_assets() if row["id"] == asset_id)
        self.assertAlmostEqual(asset["accumulated_depreciation"], 1000000)
        self.assertAlmostEqual(asset["net_book_value"], 3000000)
        self._assert_gl_balanced()

    def test_treasury_movements_post_gl_and_track_positions(self):
        account_id = self.repository.save_bank_account(
            "Test current account", "Test Bank", "PT-123", 1000000
        )
        movement = self.repository.create_cash_movement(
            account_id, "2026-02-10", "in", 750000, "Test receipt"
        )
        self.assertEqual(movement["reference"], f"TREAS-{movement['id']:06d}")
        positions, totals = self.repository.treasury_positions()
        account = next(row for row in positions if row["id"] == account_id)
        self.assertAlmostEqual(account["current_balance"], 1750000)
        self.assertGreaterEqual(totals["net"], 750000)
        movements = self.repository.list_cash_movements("Test receipt")
        self.assertEqual(len(movements), 1)
        self._assert_gl_balanced()

    def test_bank_reconciliation_matching_and_protection(self):
        account_id = self.repository.save_bank_account(
            "Test reconciliation account", "Test Bank 2", "PT-456", 0
        )
        movement = self.repository.create_cash_movement(
            account_id, "2026-02-11", "in", 420000, "Test payment to reconcile"
        )
        line = self.repository.add_statement_line(
            account_id, "2026-02-11", "in", 420000, "VIR TEST", "Matching entry"
        )
        candidates = self.repository.list_reconcilable_movements(account_id)
        self.assertEqual([row["id"] for row in candidates], [movement["id"]])
        self.repository.reconcile_statement_line(line, movement["id"])
        line_row = self.repository._one(
            "SELECT is_reconciled, matched_movement_id FROM bank_statement_lines WHERE id = ?",
            (line,),
        )
        self.assertTrue(line_row["is_reconciled"])
        self.assertEqual(line_row["matched_movement_id"], movement["id"])
        with self.assertRaisesRegex(ValueError, "cannot be deleted"):
            self.repository.delete_statement_line(line)
        with self.assertRaisesRegex(ValueError, "already matched"):
            second_line = self.repository.add_statement_line(
                account_id, "2026-02-12", "in", 1, "VIR TEST 2", "Second entry"
            )
            self.repository.reconcile_statement_line(second_line, movement["id"])
        summary = self.repository.reconciliation_summary(account_id)
        self.assertGreaterEqual(summary["reconciled_count"], 1)
        self.assertAlmostEqual(summary["reconciled_amount"], 420000)
        self.repository.unreconcile_statement_line(line)
        self._assert_gl_balanced()

    def test_cash_register_movements_and_closing_variance_posts_gl(self):
        register_id = self.repository.save_register("Test register", 100000)
        self.repository.add_register_movement(
            register_id, "2026-02-12", "in", 300000, "Test intake"
        )
        self.repository.add_register_movement(
            register_id, "2026-02-12", "out", 50000, "Test spend"
        )
        register = next(row for row in self.repository.list_registers() if row["id"] == register_id)
        self.assertAlmostEqual(register["expected_cash"], 350000)
        closing = self.repository.close_register(register_id, "2026-02-12", 345000)
        self.assertAlmostEqual(closing["expected"], 350000)
        self.assertAlmostEqual(closing["difference"], -5000)
        closings = self.repository.list_register_closings()
        self.assertEqual(len(closings), 1)
        self._assert_gl_balanced()

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
