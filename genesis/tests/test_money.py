import unittest

from tests import helpers
from genesis.errors import ValidationError
from genesis.money import div_round, format_money, format_qty, money_to_decimal_string, parse_money, parse_quantity


class MoneyTests(unittest.TestCase):
    def test_test_harness_points_at_package(self):
        self.assertTrue((helpers.ROOT / "genesis" / "money.py").exists())

    def test_parse_whole_and_decimal_amounts(self):
        self.assertEqual(parse_money("12.50", 2), 1250)
        self.assertEqual(parse_money("12", 2), 1200)
        self.assertEqual(parse_money("1 200.5", 2), 120050)
        self.assertEqual(parse_money("1500", 0), 1500)

    def test_parse_rejects_too_many_decimals(self):
        with self.assertRaises(ValidationError) as ctx:
            parse_money("1.234", 2, field="price")
        self.assertEqual(ctx.exception.key, "too_many_decimals")

    def test_parse_rejects_floats_and_garbage(self):
        for bad in ("abc", "1e5", "12.3.4", True):
            with self.assertRaises(ValidationError):
                parse_money(bad, 2)

    def test_parse_negative_only_when_allowed(self):
        with self.assertRaises(ValidationError):
            parse_money("-5", 2)
        self.assertEqual(parse_money("-5", 2, allow_negative=True), -500)

    def test_half_up_rounding(self):
        self.assertEqual(div_round(5, 2), 3)
        self.assertEqual(div_round(-5, 2), -3)
        self.assertEqual(div_round(4, 3), 1)
        self.assertEqual(div_round(7, 3), 2)
        with self.assertRaises(ZeroDivisionError):
            div_round(1, 0)

    def test_quantity_scale(self):
        self.assertEqual(parse_quantity("2.5"), 25000)
        self.assertEqual(format_qty(25000), "2.5")
        self.assertEqual(format_qty(17 * 10000), "17")

    def test_money_formatting_and_plain_decimal(self):
        self.assertEqual(money_to_decimal_string(-1205, 2), "-12.05")
        self.assertEqual(money_to_decimal_string(1500, 0), "1500")
        self.assertIn("1,234.50", format_money(123450, 2, "en"))


if __name__ == "__main__":
    unittest.main()


class MoneyEdgeCaseTests(unittest.TestCase):
    def test_div_round_is_half_away_from_zero(self):
        from genesis.money import div_round
        self.assertEqual(div_round(5, 2), 3)     # 2.5 -> 3
        self.assertEqual(div_round(-5, 2), -3)   # -2.5 -> -3
        self.assertEqual(div_round(7, 3), 2)     # 2.33 -> 2
        self.assertEqual(div_round(8, 3), 3)     # 2.67 -> 3
        self.assertEqual(div_round(5, -2), -3)
        self.assertEqual(div_round(0, 5), 0)
        with self.assertRaises(ZeroDivisionError):
            div_round(1, 0)

    def test_quantity_bounds(self):
        from genesis.errors import ValidationError
        from genesis.money import parse_quantity
        self.assertEqual(parse_quantity("0.0001"), 1)
        self.assertEqual(parse_quantity("12.5"), 125000)
        with self.assertRaises(ValidationError):
            parse_quantity("0.00001")      # five decimals
        with self.assertRaises(ValidationError):
            parse_quantity("0")            # zero not allowed by default
        self.assertEqual(parse_quantity("0", allow_zero=True), 0)
        with self.assertRaises(ValidationError):
            parse_quantity("-1")

    def test_percent_bounds(self):
        from genesis.errors import ValidationError
        from genesis.money import parse_percent_bps
        self.assertEqual(parse_percent_bps("18"), 1800)
        self.assertEqual(parse_percent_bps("0.5"), 50)
        self.assertEqual(parse_percent_bps("100"), 10000)
        with self.assertRaises(ValidationError):
            parse_percent_bps("100.01")
        with self.assertRaises(ValidationError):
            parse_percent_bps("-5")
        with self.assertRaises(ValidationError):
            parse_percent_bps("1.234")

    def test_iso_dates_are_strict(self):
        from genesis.errors import ValidationError
        from genesis.money import parse_iso_date
        self.assertEqual(parse_iso_date("2026-02-28").isoformat(), "2026-02-28")
        for bad in ("2026-02-30", "26-01-01", "2026/01/01", "01/02/2026", ""):
            with self.assertRaises(ValidationError, msg=bad):
                parse_iso_date(bad)

    def test_format_money_respects_language_and_decimals(self):
        from genesis.money import format_money
        self.assertEqual(format_money(1234567, 0, "en"), "1,234,567")
        self.assertEqual(format_money(1234567, 2, "en"), "12,345.67")
        self.assertEqual(format_money(-150, 2, "en"), "-1.50")
        self.assertEqual(format_money(1234567, 2, "fr").replace("\u202f", " "), "12 345,67")
        self.assertEqual(format_money(1234567, 0, "rw"), "1,234,567")
        self.assertEqual(format_money(100, 2, "en", "RWF"), "1.00 RWF")

    def test_plain_decimal_string_keeps_sign_and_leading_zero(self):
        from genesis.money import money_to_decimal_string
        self.assertEqual(money_to_decimal_string(-5, 2), "-0.05")
        self.assertEqual(money_to_decimal_string(123456, 2), "1234.56")
        self.assertEqual(money_to_decimal_string(-42, 0), "-42")

    def test_quantity_display_drops_trailing_zeros(self):
        from genesis.money import format_qty
        self.assertEqual(format_qty(125000), "12.5")
        self.assertEqual(format_qty(10000), "1")
        self.assertEqual(format_qty(1), "0.0001")
        self.assertEqual(format_qty(-15000), "-1.5")

    def test_booleans_are_not_numbers(self):
        from genesis.errors import ValidationError
        from genesis.money import parse_money
        with self.assertRaises(ValidationError):
            parse_money(True, 2)
