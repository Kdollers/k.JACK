from datetime import datetime

from database import cursor, connection

from modules.accounting_engine import (
    record_customer_payment,
    record_supplier_payment
)

from languages import t
from modules.validation import parse_money


def payment_menu():

    while True:

        print()
        print("================================")
        print(t("payments").upper())
        print("================================")

        print("1.", t("customer_payment"))
        print("2.", t("supplier_payment"))
        print("3.", t("view_payments"))
        print("4.", t("payment_details"))
        print("5.", t("back"))

        choice = input(
            t("choose_option") + " "
        ).strip()

        # ==========================================
        # CUSTOMER PAYMENT
        # ==========================================

        if choice == "1":

            cursor.execute(
                """
                SELECT id, name
                FROM customers
                ORDER BY name
                """
            )

            customers = cursor.fetchall()

            if not customers:

                print(t("not_found"))
                print(t("please_add_customer"))

                continue

            print()
            print(
                "========== "
                + t("customers").upper()
                + " =========="
            )

            for customer in customers:

                print(
                    f"{t('id')}: {customer[0]} | "
                    f"{t('name')}: {customer[1]}"
                )

            customer_id = input(
                t("enter_id") + " "
            ).strip()

            cursor.execute(
                """
                SELECT id, name
                FROM customers
                WHERE id = ?
                """,
                (customer_id,)
            )

            customer = cursor.fetchone()

            if customer is None:

                print(t("customer_not_found"))

                continue

            try:

                amount = parse_money(
                    input(t("enter_amount") + " "),
                    allow_zero=False
                )

            except ValueError:

                print(t("invalid_amount"))

                continue

            if amount <= 0:

                print(t("invalid_amount"))

                continue

            print()
            print(t("method") + ":")
            print(f"1. {t('cash')}")
            print(f"2. {t('bank')}")
            print(f"3. {t('mobile_money')}")

            method_choice = input(
                t("choose_option") + " "
            ).strip()

            payment_methods = {
                "1": "Cash",
                "2": "Bank",
                "3": "Mobile Money"
            }

            payment_method = payment_methods.get(
                method_choice
            )

            if payment_method is None:

                print(t("invalid_option"))

                continue

            description = input(
                t("enter_description") + " "
            ).strip()

            print()
            print("==============================")
            print(t("customer_payment").upper())
            print("==============================")

            print(
                f"{t('customers')}:",
                customer[1]
            )

            print(
                f"{t('amount')}: {amount:.2f}"
            )

            print(
                f"{t('method')}:",
                payment_method
            )

            print(
                f"{t('description')}:",
                description
            )

            confirm = input(
                t("record_payment") + " "
            ).strip().lower()

            if confirm not in (
                t("yes").lower(),
                "yes"
            ):

                print(t("operation_cancelled"))

                continue

            try:

                payment_date = datetime.now().strftime(
                    "%Y-%m-%d %H:%M:%S"
                )

                cursor.execute(
                    """
                    INSERT INTO payments
                    (
                        payment_type,
                        customer_id,
                        supplier_id,
                        amount,
                        payment_method,
                        payment_date,
                        description
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "customer",
                        customer_id,
                        None,
                        amount,
                        payment_method,
                        payment_date,
                        description
                    )
                )

                payment_id = cursor.lastrowid

                record_customer_payment(
                    payment_id,
                    amount,
                    payment_method
                )

                connection.commit()

                print()
                print("================================")
                print(t("saved_successfully").upper())
                print("================================")

                print(
                    f"{t('id')}:",
                    payment_id
                )

                print(
                    f"{t('amount')}: {amount:.2f}"
                )

                print(t("accounting_entry_created"))

            except Exception as error:

                connection.rollback()

                print()
                print(
                    "Payment could not be recorded."
                )

                print(
                    "Reason:",
                    error
                )

        # ==========================================
        # SUPPLIER PAYMENT
        # ==========================================

        elif choice == "2":

            cursor.execute(
                """
                SELECT id, name
                FROM suppliers
                ORDER BY name
                """
            )

            suppliers = cursor.fetchall()

            if not suppliers:

                print(t("not_found"))
                print(t("please_add_supplier"))

                continue

            print()
            print(
                "========== "
                + t("suppliers").upper()
                + " =========="
            )

            for supplier in suppliers:

                print(
                    f"{t('id')}: {supplier[0]} | "
                    f"{t('name')}: {supplier[1]}"
                )

            supplier_id = input(
                t("enter_id") + " "
            ).strip()

            cursor.execute(
                """
                SELECT id, name
                FROM suppliers
                WHERE id = ?
                """,
                (supplier_id,)
            )

            supplier = cursor.fetchone()

            if supplier is None:

                print(t("supplier_not_found"))

                continue

            try:

                amount = parse_money(
                    input(t("enter_amount") + " "),
                    allow_zero=False
                )

            except ValueError:

                print(t("invalid_amount"))

                continue

            if amount <= 0:

                print(t("invalid_amount"))

                continue

            print()
            print(t("method") + ":")
            print(f"1. {t('cash')}")
            print(f"2. {t('bank')}")
            print(f"3. {t('mobile_money')}")

            method_choice = input(
                t("choose_option") + " "
            ).strip()

            payment_methods = {
                "1": "Cash",
                "2": "Bank",
                "3": "Mobile Money"
            }

            payment_method = payment_methods.get(
                method_choice
            )

            if payment_method is None:

                print(t("invalid_option"))

                continue

            description = input(
                t("enter_description") + " "
            ).strip()

            print()
            print("==============================")
            print(t("supplier_payment").upper())
            print("==============================")

            print(
                f"{t('suppliers')}:",
                supplier[1]
            )

            print(
                f"{t('amount')}: {amount:.2f}"
            )

            print(
                f"{t('method')}:",
                payment_method
            )

            print(
                f"{t('description')}:",
                description
            )

            confirm = input(
                t("record_payment") + " "
            ).strip().lower()

            if confirm not in (
                t("yes").lower(),
                "yes"
            ):

                print(t("operation_cancelled"))

                continue

            try:

                payment_date = datetime.now().strftime(
                    "%Y-%m-%d %H:%M:%S"
                )

                cursor.execute(
                    """
                    INSERT INTO payments
                    (
                        payment_type,
                        customer_id,
                        supplier_id,
                        amount,
                        payment_method,
                        payment_date,
                        description
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "supplier",
                        None,
                        supplier_id,
                        amount,
                        payment_method,
                        payment_date,
                        description
                    )
                )

                payment_id = cursor.lastrowid

                record_supplier_payment(
                    payment_id,
                    amount,
                    payment_method
                )

                connection.commit()

                print()
                print("================================")
                print(t("saved_successfully").upper())
                print("================================")

                print(
                    f"{t('id')}:",
                    payment_id
                )

                print(
                    f"{t('amount')}: {amount:.2f}"
                )

                print(t("accounting_entry_created"))

            except Exception as error:

                connection.rollback()

                print()
                print(
                    "Payment could not be recorded."
                )

                print(
                    "Reason:",
                    error
                )

        # ==========================================
        # VIEW PAYMENTS
        # ==========================================

        elif choice == "3":

            cursor.execute(
                """
                SELECT
                    payments.id,
                    payments.payment_type,
                    COALESCE(
                        customers.name,
                        suppliers.name
                    ) AS party,
                    payments.amount,
                    payments.payment_method,
                    payments.payment_date,
                    payments.description
                FROM payments
                LEFT JOIN customers
                    ON payments.customer_id =
                       customers.id
                LEFT JOIN suppliers
                    ON payments.supplier_id =
                       suppliers.id
                ORDER BY payments.id DESC
                """
            )

            payments = cursor.fetchall()

            print()
            print(
                "========== "
                + t("view_payments").upper()
                + " =========="
            )

            if not payments:

                print(t("not_found"))

            else:

                for payment in payments:

                    print(
                        f"{t('id')}: {payment[0]} | "
                        f"{t('type')}: {payment[1]} | "
                        f"{t('name')}: "
                        f"{payment[2] or 'Unknown'} | "
                        f"{t('amount')}: {payment[3]:.2f} | "
                        f"{t('method')}: {payment[4]} | "
                        f"{t('date')}: {payment[5]}"
                    )

        # ==========================================
        # PAYMENT DETAILS
        # ==========================================

        elif choice == "4":

            payment_id = input(
                t("enter_id") + " "
            ).strip()

            cursor.execute(
                """
                SELECT
                    payments.id,
                    payments.payment_type,
                    COALESCE(
                        customers.name,
                        suppliers.name
                    ) AS party,
                    payments.amount,
                    payments.payment_method,
                    payments.payment_date,
                    payments.description
                FROM payments
                LEFT JOIN customers
                    ON payments.customer_id =
                       customers.id
                LEFT JOIN suppliers
                    ON payments.supplier_id =
                       suppliers.id
                WHERE payments.id = ?
                """,
                (payment_id,)
            )

            payment = cursor.fetchone()

            if payment is None:

                print(t("not_found"))

                continue

            print()
            print(
                "========== "
                + t("payment_details").upper()
                + " =========="
            )

            print(
                f"{t('id')}:",
                payment[0]
            )

            print(
                f"{t('type')}: {payment[1]}"
            )

            print(
                f"{t('name')}:",
                payment[2] or "Unknown"
            )

            print(
                f"{t('amount')}:",
                f"{payment[3]:.2f}"
            )

            print(
                f"{t('method')}:",
                payment[4]
            )

            print(
                f"{t('date')}:",
                payment[5]
            )

            print(
                f"{t('description')}:",
                payment[6] or ""
            )

        # ==========================================
        # BACK
        # ==========================================

        elif choice == "5":

            return

        else:

            print(t("invalid_option"))
