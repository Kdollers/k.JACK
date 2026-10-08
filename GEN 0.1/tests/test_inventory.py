"""Stock: FIFO and weighted average costing, receipts, issues, transfers, adjustments and counts."""

import unittest

from tests.helpers import Env
from genesis import catalog, company, inventory, ledger
from genesis.errors import AccountingError, PermissionDenied, ValidationError


def make_product(env, sku, track_stock=True, cost=0):
    category = env.db.one("SELECT id FROM categories WHERE is_active = 1 ORDER BY id LIMIT 1")
    product = catalog.save_product(env.ctx, {
        "sku": sku, "name": f"Product {sku}", "category_id": category["id"],
        "cost_price": cost, "selling_price": cost * 2, "track_stock": track_stock,
    })
    return product["id"]


def main_warehouse(env):
    return env.db.one("SELECT id FROM warehouses WHERE code = 'MAIN'")["id"]


def offset_account(env, code="6010"):
    return env.db.one("SELECT id FROM accounts WHERE code = ?", (code,))["id"]


def receive(env, product_id, qty, unit_cost, warehouse_id=None, date="2026-02-01"):
    return inventory.stock_receipt(env.ctx, {
        "product_id": product_id, "warehouse_id": warehouse_id or main_warehouse(env),
        "quantity": str(qty), "unit_cost": str(unit_cost),
        "offset_account_id": env.account_id("opening_equity"), "date": date, "note": "test receipt",
    })


def issue(env, product_id, qty, warehouse_id=None, date="2026-02-10"):
    return inventory.stock_issue(env.ctx, {
        "product_id": product_id, "warehouse_id": warehouse_id or main_warehouse(env),
        "quantity": str(qty), "offset_account_id": offset_account(env), "date": date,
    })


def stock_value(env):
    return sum(level["value_minor"] for level in env.db.query("SELECT value_minor FROM stock_levels"))


def gl_inventory(env):
    return ledger.account_balance(env.db, env.account_id("inventory"))


class CostingTests(unittest.TestCase):
    """The same movements under each costing method must give different, correct costs."""

    def _scenario(self, method):
        env = Env(costing_method=method)
        try:
            product = make_product(env, "WIDGET")
            receive(env, product, 10, 100)
            receive(env, product, 10, 200)
            result = issue(env, product, 15)
            return result["cost_minor"], inventory.on_hand(env.db, product), inventory.verify_inventory(env.db)
        finally:
            env.close()

    def test_fifo_consumes_oldest_layers_first(self):
        cost, (qty, value), problems = self._scenario("fifo")
        self.assertEqual(cost, 10 * 100 + 5 * 200)  # 2000: ten at 100, five at 200
        self.assertEqual((qty, value), (5 * 10000, 1000))  # remaining five at 200
        self.assertEqual(problems, [])

    def test_weighted_average_uses_blended_cost(self):
        cost, (qty, value), problems = self._scenario("weighted_average")
        self.assertEqual(cost, 2250)  # 15 * (3000 / 20)
        self.assertEqual((qty, value), (5 * 10000, 750))
        self.assertEqual(problems, [])

    def test_costing_method_is_read_from_company_setting(self):
        env = Env(costing_method="fifo")
        try:
            self.assertEqual(inventory.costing_method(env.db), "fifo")
        finally:
            env.close()


class MovementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env(costing_method="fifo")

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_receipt_posts_inventory_journal_and_reconciles(self):
        env = self.env
        product = make_product(env, "REC-1")
        before_entries = env.db.scalar("SELECT COUNT(*) FROM journal_entries")
        result = receive(env, product, 5, 300)
        self.assertEqual(result["value_minor"], 1500)
        self.assertEqual(env.db.scalar("SELECT COUNT(*) FROM journal_entries"), before_entries + 1)
        self.assertEqual(ledger.verify_ledger(env.db), [])
        self.assertEqual(inventory.verify_inventory(env.db), [])
        self.assertEqual(gl_inventory(env), stock_value(env))

    def test_fractional_quantities_are_exact(self):
        env = self.env
        product = make_product(env, "FRAC-1")
        receive(env, product, "2.5", 400)
        self.assertEqual(inventory.on_hand(env.db, product), (25000, 1000))

    def test_insufficient_stock_is_rejected_without_side_effects(self):
        env = self.env
        product = make_product(env, "SHORT-1")
        receive(env, product, 3, 50)
        levels_before = env.db.query("SELECT * FROM stock_levels WHERE product_id = ?", (product,))
        entries_before = env.db.scalar("SELECT COUNT(*) FROM journal_entries")
        with self.assertRaises(AccountingError) as ctx:
            issue(env, product, 5)
        self.assertEqual(ctx.exception.key, "insufficient_stock")
        self.assertEqual(ctx.exception.params["available"], "3")
        self.assertEqual(ctx.exception.params["requested"], "5")
        self.assertEqual(env.db.query("SELECT * FROM stock_levels WHERE product_id = ?", (product,)), levels_before)
        self.assertEqual(env.db.scalar("SELECT COUNT(*) FROM journal_entries"), entries_before)
        self.assertEqual(inventory.verify_inventory(env.db), [])

    def test_issue_consumes_layers_once_and_ledger_reconciles(self):
        """Regression: layers used to be consumed twice when the journal was posted before the issue."""
        env = self.env
        product = make_product(env, "ISS-1")
        receive(env, product, 4, 100)
        receive(env, product, 4, 150)
        result = issue(env, product, 6)
        self.assertEqual(result["cost_minor"], 4 * 100 + 2 * 150)
        self.assertEqual(inventory.on_hand(env.db, product), (2 * 10000, 300))
        self.assertEqual(inventory.verify_inventory(env.db), [])
        self.assertEqual(gl_inventory(env), stock_value(env))

    def test_service_products_cannot_hold_stock(self):
        service = make_product(self.env, "SERV-1", track_stock=False)
        with self.assertRaises(AccountingError) as ctx:
            receive(self.env, service, 1, 10)
        self.assertEqual(ctx.exception.key, "product_is_service")

    def test_transfer_moves_stock_without_ledger_change(self):
        env = self.env
        product = make_product(env, "XFER-1")
        receive(env, product, 10, 80)
        source = main_warehouse(env)
        env.db.insert("warehouses", {"code": "SEC", "name": "Secondary", "address": None, "is_active": 1})
        target = env.db.one("SELECT id FROM warehouses WHERE code = 'SEC'")["id"]
        entries_before = env.db.scalar("SELECT COUNT(*) FROM journal_entries")
        inventory_before = gl_inventory(env)
        result = inventory.stock_transfer(env.ctx, {
            "product_id": product, "from_warehouse_id": source, "to_warehouse_id": target,
            "quantity": "4", "date": "2026-02-12"})
        self.assertEqual(result["value_minor"], 320)
        self.assertEqual(env.db.scalar("SELECT COUNT(*) FROM journal_entries"), entries_before)
        self.assertEqual(gl_inventory(env), inventory_before)
        self.assertEqual(inventory.on_hand(env.db, product, source), (6 * 10000, 480))
        self.assertEqual(inventory.on_hand(env.db, product, target), (4 * 10000, 320))
        self.assertEqual(inventory.verify_inventory(env.db), [])

    def test_transfer_to_same_warehouse_rejected(self):
        product = make_product(self.env, "XFER-2")
        receive(self.env, product, 2, 10)
        wh = main_warehouse(self.env)
        with self.assertRaises(ValidationError) as ctx:
            inventory.stock_transfer(self.env.ctx, {"product_id": product, "from_warehouse_id": wh,
                                                    "to_warehouse_id": wh, "quantity": "1"})
        self.assertEqual(ctx.exception.key, "transfer_same_warehouse")

    def test_adjustment_decrease_posts_loss_and_reconciles(self):
        env = self.env
        product = make_product(env, "ADJ-1")
        receive(env, product, 10, 70)
        result = inventory.stock_adjustment(env.ctx, {
            "product_id": product, "warehouse_id": main_warehouse(env), "direction": "decrease",
            "quantity": "3", "reason": "Breakage", "date": "2026-02-15"})
        self.assertEqual(result["value_minor"], 210)
        self.assertEqual(inventory.on_hand(env.db, product), (7 * 10000, 490))
        self.assertEqual(inventory.verify_inventory(env.db), [])
        self.assertEqual(ledger.verify_ledger(env.db), [])
        self.assertEqual(gl_inventory(env), stock_value(env))

    def test_adjustment_requires_reason(self):
        product = make_product(self.env, "ADJ-2")
        receive(self.env, product, 1, 10)
        with self.assertRaises(ValidationError) as ctx:
            inventory.stock_adjustment(self.env.ctx, {"product_id": product,
                                                      "warehouse_id": main_warehouse(self.env),
                                                      "direction": "increase", "quantity": "1", "reason": " "})
        self.assertEqual(ctx.exception.key, "field_required")

    def test_count_with_shortage_posts_once_and_cannot_be_reposted(self):
        env = self.env
        product = make_product(env, "CNT-1")
        receive(env, product, 10, 100)
        count = inventory.create_count(env.ctx, {"warehouse_id": main_warehouse(env), "count_date": "2026-02-20"})
        inventory.update_count_lines(env.ctx, count["id"], [{"product_id": product, "physical_quantity": "8"}])
        posted = inventory.post_count(env.ctx, count["id"])
        self.assertEqual(posted["status"], "posted")
        self.assertEqual(inventory.on_hand(env.db, product), (8 * 10000, 800))
        self.assertEqual(inventory.verify_inventory(env.db), [])
        self.assertEqual(ledger.verify_ledger(env.db), [])
        self.assertEqual(gl_inventory(env), stock_value(env))
        with self.assertRaises(AccountingError) as ctx:
            inventory.post_count(env.ctx, count["id"])
        self.assertEqual(ctx.exception.key, "count_already_posted")

    def test_count_gain_is_received_at_unit_cost(self):
        env = self.env
        product = make_product(env, "CNT-2")
        receive(env, product, 4, 25)
        count = inventory.create_count(env.ctx, {"warehouse_id": main_warehouse(env)})
        inventory.update_count_lines(env.ctx, count["id"], [{"product_id": product, "physical_quantity": "6"}])
        inventory.post_count(env.ctx, count["id"])
        self.assertEqual(inventory.on_hand(env.db, product), (6 * 10000, 150))
        self.assertEqual(inventory.verify_inventory(env.db), [])
        self.assertEqual(gl_inventory(env), stock_value(env))

    def test_sales_role_cannot_move_stock(self):
        env = self.env
        product = make_product(env, "PERM-1")
        with env.db.transaction():
            company.create_user(env.ctx, {"username": "sales2", "full_name": "Sales Two",
                                          "role": "sales", "password": "Sales-pass-123"})
        sales_ctx = env.sign_in("sales2", "Sales-pass-123")
        with self.assertRaises(PermissionDenied):
            inventory.stock_receipt(sales_ctx, {"product_id": product, "warehouse_id": main_warehouse(env),
                                                "quantity": "1", "unit_cost": "1",
                                                "offset_account_id": env.account_id("opening_equity")})


if __name__ == "__main__":
    unittest.main()
