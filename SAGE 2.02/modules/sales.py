
from datetime import datetime

from database import cursor, connection

from modules.accounting_engine import (
    record_sale_accounting
)

from languages import t


def sales_menu():

    while True:

        print()
        print("================================")
        print(t("sales").upper())
        print("================================")

        print("1.", t("create_sale"))
        print("2.", t("view_sales"))
        print("3.", t("sale_details"))
        print("4.", t("back"))

        choice = input(
            t("choose_option") + " "
        ).strip()

        # ====================================================
        # CREATE SALE
        # ====================================================

        if choice == "1":

            # ------------------------------------------------
            # GET CUSTOMERS
            # ------------------------------------------------

            cursor.execute(
                """
                SELECT id, name
                FROM customers
                ORDER BY name
                """
            )

            customers = cursor.fetchall()

            # ------------------------------------------------
            # SELECT A CUSTOMER OR RECORD A WALK-IN SALE
            # ------------------------------------------------

            print()
            print(
                "========== "
                + t("customers").upper()
                + " =========="
            )
            print(f"0. {t('walk_in_customer')}")

            for available_customer in customers:
                print(
                    f"{t('id')}: {available_customer[0]} | "
                    f"{t('name')}: {available_customer[1]}"
                )

            customer_choice = input(
                t("enter_id") + " "
            ).strip()

            if customer_choice == "0":
                customer_id = None
                customer = (None, t("walk_in_customer"))
            else:
                cursor.execute(
                    """
                    SELECT id, name
                    FROM customers
                    WHERE id = ?
                    """,
                    (customer_choice,)
                )
                customer = cursor.fetchone()

                if customer is None:
                    print(t("customer_not_found"))
                    continue

                customer_id = customer[0]

            # ------------------------------------------------
            # PAYMENT METHOD
            # ------------------------------------------------

            print()
            print(t("method") + ":")
            print(f"1. {t('cash')}")
            print(f"2. {t('bank')}")
            print(f"3. {t('mobile_money')}")
            print(f"4. {t('credit_sale')}")

            payment_choice = input(
                t("choose_option") + " "
            ).strip()

            payment_methods = {
                "1": "Cash",
                "2": "Bank",
                "3": "Mobile Money",
                "4": "Accounts Receivable"
            }

            payment_method = payment_methods.get(
                payment_choice
            )

            if payment_method is None:

                print(t("invalid_option"))

                continue

            # ------------------------------------------------
            # ADD SALE ITEMS
            # ------------------------------------------------

            sale_items = []
            selected_quantities = {}

            while True:

                cursor.execute(
                    """
                    SELECT
                        id,
                        code,
                        name,
                        price,
                        quantity,
                        cost_price
                    FROM products
                    ORDER BY name
                    """
                )

                products = cursor.fetchall()

                if not products:

                    print(t("not_found"))
                    print(t("please_add_product"))

                    break

                print()
                print(
                    "========== "
                    + t("products_inventory").upper()
                    + " =========="
                )

                for product in products:

                    selling_price = float(
                        product[3] or 0
                    )

                    buying_price = float(
                        product[5] or 0
                    )

                    print(
                        f"{t('id')}: {product[0]} | "
                        f"{t('code')}: {product[1]} | "
                        f"{t('name')}: {product[2]} | "
                        f"Selling: {selling_price:.2f} | "
                        f"Stock: {product[4]} | "
                        f"Buying: {buying_price:.2f}"
                    )

                product_id = input(
                    t("enter_id")
                    + " (or 'done'): "
                ).strip()

                if product_id.lower() == "done":

                    break

                cursor.execute(
                    """
                    SELECT
                        id,
                        code,
                        name,
                        price,
                        quantity,
                        cost_price
                    FROM products
                    WHERE id = ?
                    """,
                    (product_id,)
                )

                product = cursor.fetchone()

                if product is None:

                    print(t("product_not_found"))

                    continue

                selling_price = float(
                    product[3] or 0
                )

                buying_price = float(
                    product[5] or 0
                )

                print()
                print(
                    f"{t('name')}:",
                    product[2]
                )

                print(
                    "Buying Price:",
                    f"{buying_price:.2f}"
                )

                print(
                    "Selling Price:",
                    f"{selling_price:.2f}"
                )

                print(
                    f"{t('quantity')}:",
                    product[4]
                )

                try:

                    quantity = int(
                        input(
                            t("enter_quantity") + " "
                        )
                    )

                except ValueError:

                    print(t("invalid_quantity"))

                    continue

                if quantity <= 0:

                    print(t("invalid_quantity"))

                    continue

                already_selected = selected_quantities.get(
                    product[0], 0
                )
                available_quantity = product[4] - already_selected
                if quantity > available_quantity:
                    print(t("not_enough_stock"))
                    continue

                selected_quantities[product[0]] = (
                    already_selected + quantity
                )

                # ------------------------------------------------
                # SELLING PRICE IS USED HERE
                # ------------------------------------------------

                subtotal = (
                    selling_price * quantity
                )

                sale_items.append(
                    (
                        product[0],
                        quantity,
                        selling_price,
                        subtotal,
                        buying_price
                    )
                )

                print(
                    f"{t('added_successfully')} "
                    f"{product[2]} | "
                    f"Subtotal: {subtotal:.2f}"
                )

            # ------------------------------------------------
            # CHECK ITEMS
            # ------------------------------------------------

            if not sale_items:

                print(
                    "No products added. "
                    "Sale cancelled."
                )

                continue

            total = sum(
                item[3]
                for item in sale_items
            )

            # ------------------------------------------------
            # SALE SUMMARY
            # ------------------------------------------------

            print()
            print("==============================")
            print(
                t("sales").upper()
                + " SUMMARY"
            )
            print("==============================")

            print(
                f"{t('customers')}:",
                customer[1]
            )

            print(
                f"{t('method')}:",
                payment_method
            )

            print()

            total_cost = 0.0
            total_profit = 0.0

            for item in sale_items:

                product_id = item[0]
                quantity = item[1]
                selling_price = item[2]
                subtotal = item[3]

                buying_price = item[4]

                item_cost = (
                    buying_price * quantity
                )

                item_profit = (
                    subtotal - item_cost
                )

                total_cost += item_cost
                total_profit += item_profit

                print(
                    f"{t('id')}: {product_id} | "
                    f"{t('quantity')}: {quantity} | "
                    f"Selling: {selling_price:.2f} | "
                    f"Cost: {buying_price:.2f} | "
                    f"Total: {subtotal:.2f} | "
                    f"Profit: {item_profit:.2f}"
                )

            print("------------------------------")

            print(
                f"{t('total').upper()}: "
                f"{total:.2f}"
            )

            print(
                f"Total Cost: "
                f"{total_cost:.2f}"
            )

            print(
                f"Gross Profit: "
                f"{total_profit:.2f}"
            )

            print("==============================")

            confirm = input(
                t("confirm_sale") + " "
            ).strip().lower()

            if confirm not in (
                t("yes").lower(),
                "yes"
            ):

                print(t("operation_cancelled"))

                continue

            # =================================================
            # SAVE SALE + ACCOUNTING
            # =================================================

            try:

                sale_date = datetime.now().strftime(
                    "%Y-%m-%d %H:%M:%S"
                )

                # ---------------------------------------------
                # SAVE SALE
                # ---------------------------------------------

                cursor.execute(
                    """
                    INSERT INTO sales
                    (
                        customer_id,
                        sale_date,
                        total,
                        payment_method
                    )
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        customer_id,
                        sale_date,
                        total,
                        payment_method
                    )
                )

                sale_id = cursor.lastrowid

                # ---------------------------------------------
                # SAVE SALE ITEMS
                # ---------------------------------------------

                for item in sale_items:

                    product_id = item[0]
                    quantity = item[1]
                    selling_price = item[2]
                    subtotal = item[3]

                    cursor.execute(
                        """
                        INSERT INTO sale_items
                        (
                            sale_id,
                            product_id,
                            quantity,
                            price,
                            subtotal,
                            cost_price
                        )
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            sale_id,
                            product_id,
                            quantity,
                            selling_price,
                            subtotal,
                            item[4]
                        )
                    )

                    # -----------------------------------------
                    # REDUCE INVENTORY
                    # -----------------------------------------

                    cursor.execute(
                        """
                        UPDATE products
                        SET quantity = quantity - ?
                        WHERE id = ?
                        """,
                        (
                            quantity,
                            product_id
                        )
                    )

                # ---------------------------------------------
                # ACCOUNTING
                # ---------------------------------------------
                # Selling price -> Revenue
                # Buying price -> COGS
                # ---------------------------------------------

                record_sale_accounting(
                    sale_id,
                    total,
                    payment_method,
                    sale_items
                )

                # ---------------------------------------------
                # COMMIT EVERYTHING
                # ---------------------------------------------

                connection.commit()

                print()
                print("================================")
                print(
                    t("saved_successfully").upper()
                )
                print("================================")

                print(
                    f"{t('id')}:",
                    sale_id
                )

                print(
                    f"{t('total')}: {total:.2f}"
                )

                print(
                    f"Total Cost: {total_cost:.2f}"
                )

                print(
                    f"Gross Profit: {total_profit:.2f}"
                )

                print(
                    "Accounting entry created."
                )

            except Exception as error:

                connection.rollback()

                print()
                print(
                    "Sale could not be completed."
                )

                print(
                    "Reason:",
                    error
                )

        # ====================================================
        # VIEW SALES
        # ====================================================

        elif choice == "2":

            cursor.execute(
                """
                SELECT
                    sales.id,
                    customers.name,
                    sales.sale_date,
                    sales.total,
                    sales.payment_method
                FROM sales
                LEFT JOIN customers
                    ON sales.customer_id =
                       customers.id
                ORDER BY sales.id DESC
                """
            )

            sales = cursor.fetchall()

            print()
            print(
                "========== "
                + t("view_sales").upper()
                + " =========="
            )

            if not sales:

                print(t("not_found"))

            else:

                for sale in sales:

                    print(
                        f"{t('id')}: {sale[0]} | "
                        f"{t('customers')}: "
                        f"{sale[1] or t('walk_in_customer')} | "
                        f"{t('date')}: {sale[2]} | "
                        f"{t('total')}: {sale[3]:.2f} | "
                        f"{t('method')}: {sale[4] or '-'}"
                    )

        # ====================================================
        # VIEW SALE DETAILS
        # ====================================================

        elif choice == "3":

            sale_id = input(
                t("enter_id") + " "
            ).strip()

            cursor.execute(
                """
                SELECT
                    sales.id,
                    customers.name,
                    sales.sale_date,
                    sales.total,
                    sales.payment_method
                FROM sales
                LEFT JOIN customers
                    ON sales.customer_id =
                       customers.id
                WHERE sales.id = ?
                """,
                (sale_id,)
            )

            sale = cursor.fetchone()

            if sale is None:

                print(t("sale_not_found"))

                continue

            print()
            print(
                "========== "
                + t("sale_details").upper()
                + " =========="
            )

            print(
                f"{t('id')}:",
                sale[0]
            )

            print(
                f"{t('customers')}:",
                sale[1] or t("walk_in_customer")
            )

            print(
                f"{t('date')}:",
                sale[2]
            )

            print(
                f"{t('total')}: {sale[3]:.2f}"
            )
            print(
                f"{t('method')}: {sale[4] or '-'}"
            )

            cursor.execute(
                """
                SELECT
                    products.code,
                    products.name,
                    sale_items.quantity,
                    sale_items.price,
                    sale_items.subtotal,
                    sale_items.cost_price
                FROM sale_items
                JOIN products
                    ON sale_items.product_id =
                       products.id
                WHERE sale_items.sale_id = ?
                """,
                (sale_id,)
            )

            items = cursor.fetchall()

            print()
            print(
                t("products_inventory") + ":"
            )

            if not items:

                print(t("not_found"))

            else:

                for item in items:

                    selling_price = float(
                        item[3] or 0
                    )

                    buying_price = float(
                        item[5] or 0
                    )

                    quantity = item[2]

                    subtotal = float(
                        item[4] or 0
                    )

                    cost = (
                        buying_price * quantity
                    )

                    profit = (
                        subtotal - cost
                    )

                    print(
                        f"{t('code')}: {item[0]} | "
                        f"{t('name')}: {item[1]} | "
                        f"{t('quantity')}: {quantity} | "
                        f"Selling: {selling_price:.2f} | "
                        f"Buying: {buying_price:.2f} | "
                        f"Total: {subtotal:.2f} | "
                        f"Profit: {profit:.2f}"
                    )

        # ====================================================
        # BACK
        # ====================================================

        elif choice == "4":

            return

        else:

            print(
                t("invalid_option")
)

