"""Read-only sales, purchasing, payment, inventory, and financial reports."""

from database import cursor
from languages import t


def _pause():
    input("\n" + t("press_enter"))


def reports_menu():
    while True:
        print()
        print(f"========== {t('reports').upper()} ==========")
        print(f"1. {t('sales_report')}")
        print(f"2. {t('purchases_report')}")
        print(f"3. {t('payments_report')}")
        print(f"4. {t('inventory_report')}")
        print(f"5. {t('financial_summary')}")
        print(f"6. {t('back')}")

        choice = input(t("choose_option") + " ").strip()
        reports = {
            "1": sales_report,
            "2": purchases_report,
            "3": payments_report,
            "4": inventory_report,
            "5": financial_summary,
        }
        if choice == "6":
            return
        report = reports.get(choice)
        if report is None:
            print(t("invalid_option"))
            continue
        report()


def sales_report():
    print()
    print(f"========== {t('sales_report').upper()} ==========")
    cursor.execute(
        "SELECT COUNT(*), COALESCE(SUM(total), 0) FROM sales"
    )
    count, amount = cursor.fetchone()
    print(f"{t('total_sales')}: {count}")
    print(f"{t('sales_amount')}: {amount:,.2f}")
    _pause()


def purchases_report():
    print()
    print(f"========== {t('purchases_report').upper()} ==========")
    cursor.execute(
        "SELECT COUNT(*), COALESCE(SUM(total), 0) FROM purchases"
    )
    count, amount = cursor.fetchone()
    print(f"{t('total_purchases')}: {count}")
    print(f"{t('purchases_amount')}: {amount:,.2f}")
    _pause()


def payments_report():
    print()
    print(f"========== {t('payments_report').upper()} ==========")
    cursor.execute(
        """
        SELECT payment_type, COUNT(*), COALESCE(SUM(amount), 0)
        FROM payments
        GROUP BY payment_type
        """
    )
    totals = {row[0]: (row[1], row[2]) for row in cursor.fetchall()}

    for payment_type, label in (
        ("customer", "customer_payments"),
        ("supplier", "supplier_payments"),
    ):
        count, amount = totals.get(payment_type, (0, 0))
        print(f"{t(label)}: {count} | {t('amount')}: {amount:,.2f}")
    _pause()


def inventory_report():
    print()
    print(f"========== {t('inventory_report').upper()} ==========")
    cursor.execute(
        """
        SELECT id, name, quantity, cost_price, price
        FROM products
        ORDER BY name
        """
    )
    products = cursor.fetchall()

    if not products:
        print(t("no_products_found"))
        _pause()
        return

    print()
    print(
        f"{t('id'):<6}{t('name'):<24}{t('quantity'):<12}"
        f"{t('buying_price'):<16}{t('selling_price'):<16}"
    )
    print("-" * 74)

    total_value = 0.0
    for product_id, name, quantity, cost_price, selling_price in products:
        cost_price = float(cost_price or 0)
        selling_price = float(selling_price or 0)
        total_value += quantity * cost_price
        print(
            f"{product_id:<6}{name:<24}{quantity:<12}"
            f"{cost_price:<16.2f}{selling_price:<16.2f}"
        )

    print("-" * 74)
    print(f"{t('total_inventory_value')}: {total_value:,.2f}")
    _pause()


def financial_summary():
    """Summarize operating totals and derive profit from posted ledger entries."""
    print()
    print(f"========== {t('financial_summary').upper()} ==========")

    cursor.execute("SELECT COALESCE(SUM(total), 0) FROM sales")
    sales = float(cursor.fetchone()[0] or 0)
    cursor.execute("SELECT COALESCE(SUM(total), 0) FROM purchases")
    purchases = float(cursor.fetchone()[0] or 0)

    cursor.execute(
        """
        SELECT payment_type, COALESCE(SUM(amount), 0)
        FROM payments
        GROUP BY payment_type
        """
    )
    payment_totals = {row[0]: float(row[1] or 0) for row in cursor.fetchall()}
    customer_payments = payment_totals.get("customer", 0.0)
    supplier_payments = payment_totals.get("supplier", 0.0)

    cursor.execute(
        """
        SELECT
            COALESCE(SUM(CASE
                WHEN accounts.account_type = 'Revenue'
                THEN journal_lines.credit - journal_lines.debit
                ELSE 0
            END), 0),
            COALESCE(SUM(CASE
                WHEN accounts.account_type = 'Expense'
                THEN journal_lines.debit - journal_lines.credit
                ELSE 0
            END), 0)
        FROM accounts
        LEFT JOIN journal_lines ON journal_lines.account_id = accounts.id
        WHERE accounts.is_active = 1
          AND accounts.account_type IN ('Revenue', 'Expense')
        """
    )
    revenue, expenses = (float(value or 0) for value in cursor.fetchone())
    net_profit = revenue - expenses

    print(f"{t('sales_amount')}: {sales:,.2f}")
    print(f"{t('purchases_amount')}: {purchases:,.2f}")
    print(f"{t('customer_payments')}: {customer_payments:,.2f}")
    print(f"{t('supplier_payments')}: {supplier_payments:,.2f}")
    print("-" * 40)
    print(f"{t('total_revenue')}: {revenue:,.2f}")
    print(f"{t('total_expenses')}: {expenses:,.2f}")
    if net_profit >= 0:
        print(f"{t('net_profit')}: {net_profit:,.2f}")
    else:
        print(f"{t('net_loss')}: {abs(net_profit):,.2f}")
    _pause()
