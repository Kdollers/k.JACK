from database import cursor, connection
from languages import t
from modules.accounting_engine import (
    record_inventory_adjustment,
    record_inventory_value_adjustment,
    record_opening_inventory,
)
from modules.validation import parse_money


# ============================================================
# STOCK INVENTORY / PHYSICAL STOCK COUNT
# ============================================================

def stock_inventory():

    while True:

        print()
        print("================================")
        print(t("stock_inventory").upper())
        print("================================")

        print("1.", t("start_physical_inventory"))
        print("2.", t("back"))

        choice = input(
            t("choose_option") + " "
        ).strip()

        if choice == "2":
            return

        if choice != "1":
            print(t("invalid_option"))
            continue

        try:

            cursor.execute(
                """
                SELECT id, code, name, cost_price, quantity
                FROM products
                ORDER BY name
                """
            )

            products = cursor.fetchall()

            if not products:
                print()
                print(t("not_found"))
                continue

            print()
            print("================================")
            print(t("physical_stock_count").upper())
            print("================================")
            print(t("enter_physical_quantity"))
            print(t("keep_system_quantity"))
            print()

            adjustments = []

            for product in products:

                product_id = product[0]
                code = product[1]
                name = product[2]
                cost_price = parse_money(product[3] or 0)
                system_quantity = int(product[4] or 0)

                print("--------------------------------")
                print(f"{t('code')}: {code}")
                print(f"{t('name')}: {name}")
                print(
                    f"{t('system_stock')}: "
                    f"{system_quantity}"
                )

                physical_input = input(
                    t("physical_stock") + ": "
                ).strip()

                if physical_input == "":
                    physical_quantity = system_quantity

                else:

                    try:
                        physical_quantity = int(
                            physical_input
                        )

                    except ValueError:

                        print(
                            t("invalid_quantity")
                            + " "
                            + t("item_skipped")
                        )

                        continue

                    if physical_quantity < 0:

                        print(
                            t("negative_quantity")
                            + " "
                            + t("item_skipped")
                        )

                        continue

                difference = (
                    physical_quantity
                    - system_quantity
                )

                adjustments.append(
                    (
                        product_id,
                        code,
                        name,
                        cost_price,
                        system_quantity,
                        physical_quantity,
                        difference
                    )
                )

            if not adjustments:

                print()
                print(t("no_inventory_changes"))
                continue

            print()
            print("================================")
            print(t("inventory_summary").upper())
            print("================================")

            has_difference = False

            for item in adjustments:

                (
                    product_id,
                    code,
                    name,
                    cost_price,
                    system_quantity,
                    physical_quantity,
                    difference
                ) = item

                if difference != 0:
                    has_difference = True

                value_difference = (
                    difference * cost_price
                )

                print(
                    f"{name} | "
                    f"{t('system_stock')}: "
                    f"{system_quantity} | "
                    f"{t('physical_stock')}: "
                    f"{physical_quantity} | "
                    f"{t('difference')}: "
                    f"{difference} | "
                    f"{t('value_difference')}: "
                    f"{value_difference:.2f}"
                )

            if not has_difference:

                print()
                print(t("no_stock_differences"))
                continue

            print()

            confirm = input(
                t("confirm_adjustment")
            ).strip().lower()

            if confirm != t("yes").lower():

                print(
                    t("inventory_adjustment_cancelled")
                )

                continue

            for item in adjustments:

                (
                    product_id,
                    code,
                    name,
                    cost_price,
                    system_quantity,
                    physical_quantity,
                    difference
                ) = item

                if difference == 0:
                    continue

                value_difference = (
                    difference * cost_price
                )

                cursor.execute(
                    """
                    UPDATE products
                    SET quantity = ?
                    WHERE id = ?
                    """,
                    (
                        physical_quantity,
                        product_id
                    )
                )

                cursor.execute(
                    """
                    INSERT INTO inventory_adjustments
                    (
                        product_id,
                        product_code,
                        product_name,
                        old_quantity,
                        new_quantity,
                        difference,
                        cost_price,
                        value_difference
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        product_id,
                        code,
                        name,
                        system_quantity,
                        physical_quantity,
                        difference,
                        cost_price,
                        value_difference
                    )
                )

                record_inventory_adjustment(
                    cursor.lastrowid,
                    difference,
                    abs(value_difference)
                )

            connection.commit()

            print()
            print(
                t("inventory_adjustment_saved")
            )

        except Exception as error:

            connection.rollback()

            print()
            print(
                t("inventory_failed")
            )
            print(
                t("reason") + ":",
                error
            )


# ============================================================
# PRODUCT MENU
# ============================================================

def product_menu():

    while True:

        print()
        print("================================")
        print(t("products_inventory").upper())
        print("================================")

        print("1.", t("add_product"))
        print("2.", t("view_products"))
        print("3.", t("search_product"))
        print("4.", t("edit_product"))
        print("5.", t("delete_product"))
        print("6.", t("stock_inventory"))
        print("7.", t("back"))

        choice = input(
            t("choose_option") + " "
        ).strip()

        # ====================================================
        # ADD PRODUCT
        # ====================================================

        if choice == "1":

            print()
            print(t("add_product").upper())

            code = input(
                t("enter_code") + " "
            ).strip()

            if not code:
                print(t("invalid_option"))
                continue

            name = input(
                t("enter_name") + " "
            ).strip()

            if not name:
                print(t("name_empty"))
                continue

            try:

                buying_price = parse_money(
                    input(t("enter_buying_price") + " ")
                )

            except ValueError:

                print(t("invalid_price"))
                continue

            if buying_price < 0:

                print(t("negative_price"))
                continue

            try:

                selling_price = parse_money(
                    input(t("enter_selling_price") + " ")
                )

            except ValueError:

                print(t("invalid_price"))
                continue

            if selling_price < 0:

                print(t("negative_price"))
                continue

            try:

                quantity = int(
                    input(
                        t("enter_quantity") + " "
                    )
                )

            except ValueError:

                print(t("invalid_quantity"))
                continue

            if quantity < 0:

                print(t("invalid_quantity"))
                continue

            try:

                cursor.execute(
                    """
                    INSERT INTO products
                    (
                        code,
                        name,
                        price,
                        quantity,
                        cost_price
                    )
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        code,
                        name,
                        selling_price,
                        quantity,
                        buying_price
                    )
                )

                product_id = cursor.lastrowid
                record_opening_inventory(
                    product_id,
                    quantity,
                    buying_price
                )
                connection.commit()

                print()
                print(
                    t("added_successfully")
                )

            except Exception as error:

                connection.rollback()

                print(
                    t("product_add_failed")
                )

                print(
                    t("reason") + ":",
                    error
                )

        # ====================================================
        # VIEW PRODUCTS
        # ====================================================

        elif choice == "2":

            try:

                cursor.execute(
                    """
                    SELECT
                        id,
                        code,
                        name,
                        cost_price,
                        price,
                        quantity
                    FROM products
                    ORDER BY id
                    """
                )

                products = cursor.fetchall()

                print()
                print(
                    "========== "
                    + t("view_products").upper()
                    + " =========="
                )

                if not products:

                    print(t("not_found"))

                else:

                    for product in products:

                        buying_price = float(
                            product[3] or 0
                        )

                        selling_price = float(
                            product[4] or 0
                        )

                        profit = (
                            selling_price
                            - buying_price
                        )

                        print(
                            f"{t('id')}: {product[0]} | "
                            f"{t('code')}: {product[1]} | "
                            f"{t('name')}: {product[2]} | "
                            f"{t('buying_price')}: "
                            f"{buying_price:.2f} | "
                            f"{t('selling_price')}: "
                            f"{selling_price:.2f} | "
                            f"{t('profit_per_unit')}: "
                            f"{profit:.2f} | "
                            f"{t('quantity')}: "
                            f"{product[5]}"
                        )

            except Exception as error:

                print()
                print(
                    t("products_display_failed")
                )

                print(
                    t("reason") + ":",
                    error
                )

        # ====================================================
        # SEARCH PRODUCT
        # ====================================================

        elif choice == "3":

            search = input(
                t("enter_name") + " "
            ).strip()

            cursor.execute(
                """
                SELECT
                    id,
                    code,
                    name,
                    cost_price,
                    price,
                    quantity
                FROM products
                WHERE name LIKE ?
                   OR code LIKE ?
                ORDER BY name
                """,
                (
                    f"%{search}%",
                    f"%{search}%"
                )
            )

            products = cursor.fetchall()

            print()
            print(
                "========== "
                + t("search_product").upper()
                + " =========="
            )

            if not products:

                print(
                    t("product_not_found")
                )

            else:

                for product in products:

                    buying_price = float(
                        product[3] or 0
                    )

                    selling_price = float(
                        product[4] or 0
                    )

                    profit = (
                        selling_price
                        - buying_price
                    )

                    print(
                        f"{t('id')}: {product[0]} | "
                        f"{t('code')}: {product[1]} | "
                        f"{t('name')}: {product[2]} | "
                        f"{t('buying_price')}: "
                        f"{buying_price:.2f} | "
                        f"{t('selling_price')}: "
                        f"{selling_price:.2f} | "
                        f"{t('profit_per_unit')}: "
                        f"{profit:.2f} | "
                        f"{t('quantity')}: "
                        f"{product[5]}"
                    )

        # ====================================================
        # EDIT PRODUCT
        # ====================================================

        elif choice == "4":

            product_id = input(
                t("enter_id") + " "
            ).strip()

            cursor.execute(
                """
                SELECT
                    id,
                    code,
                    name,
                    cost_price,
                    price,
                    quantity
                FROM products
                WHERE id = ?
                """,
                (product_id,)
            )

            product = cursor.fetchone()

            if product is None:

                print(
                    t("product_not_found")
                )

                continue

            print()
            print(
                f"{t('code')}:",
                product[1]
            )

            new_code = input(
                t("enter_code")
                + " "
                + t("keep_current")
                + ": "
            ).strip()

            print(
                f"{t('name')}:",
                product[2]
            )

            new_name = input(
                t("enter_name")
                + " "
                + t("keep_current")
                + ": "
            ).strip()

            print(
                f"{t('buying_price')}:",
                float(product[3] or 0)
            )

            new_buying_price = input(
                t("enter_buying_price")
                + " "
                + t("keep_current")
                + ": "
            ).strip()

            print(
                f"{t('selling_price')}:",
                float(product[4] or 0)
            )

            new_selling_price = input(
                t("enter_selling_price")
                + " "
                + t("keep_current")
                + ": "
            ).strip()

            print(
                f"{t('quantity')}:",
                product[5]
            )

            new_quantity = input(
                t("enter_quantity")
                + " "
                + t("keep_current")
                + ": "
            ).strip()

            if not new_code:
                new_code = product[1]

            if not new_name:
                new_name = product[2]

            if not new_buying_price:

                new_buying_price = float(
                    product[3] or 0
                )

            else:

                try:

                    new_buying_price = parse_money(new_buying_price)

                except ValueError:

                    print(
                        t("invalid_price")
                    )

                    continue

            if not new_selling_price:

                new_selling_price = float(
                    product[4] or 0
                )

            else:

                try:

                    new_selling_price = parse_money(new_selling_price)

                except ValueError:

                    print(
                        t("invalid_price")
                    )

                    continue

            if not new_quantity:

                new_quantity = product[5]

            else:

                try:

                    new_quantity = int(
                        new_quantity
                    )

                except ValueError:

                    print(
                        t("invalid_quantity")
                    )

                    continue

            if new_buying_price < 0:

                print(
                    t("negative_price")
                )

                continue

            if new_selling_price < 0:

                print(
                    t("negative_price")
                )

                continue

            if new_quantity < 0:

                print(
                    t("invalid_quantity")
                )

                continue

            old_quantity = int(product[5] or 0)
            old_buying_price = float(product[3] or 0)
            quantity_difference = new_quantity - old_quantity
            inventory_value_difference = (
                new_quantity * new_buying_price
                - old_quantity * old_buying_price
            )

            try:

                cursor.execute(
                    """
                    UPDATE products
                    SET
                        code = ?,
                        name = ?,
                        cost_price = ?,
                        price = ?,
                        quantity = ?
                    WHERE id = ?
                    """,
                    (
                        new_code,
                        new_name,
                        new_buying_price,
                        new_selling_price,
                        new_quantity,
                        product_id
                    )
                )

                if quantity_difference != 0 or inventory_value_difference != 0:
                    cursor.execute(
                        """
                        INSERT INTO inventory_adjustments
                        (
                            product_id,
                            product_code,
                            product_name,
                            old_quantity,
                            new_quantity,
                            difference,
                            cost_price,
                            value_difference
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            product_id,
                            new_code,
                            new_name,
                            old_quantity,
                            new_quantity,
                            quantity_difference,
                            new_buying_price,
                            inventory_value_difference
                        )
                    )
                    record_inventory_value_adjustment(
                        cursor.lastrowid,
                        inventory_value_difference,
                        description=(
                            f"Manual product stock/value update #{product_id}"
                        )
                    )

                connection.commit()

                print(
                    t("updated_successfully")
                )

            except Exception as error:

                connection.rollback()

                print(
                    t("product_update_failed")
                )

                print(
                    t("reason") + ":",
                    error
                )

        # ====================================================
        # DELETE PRODUCT
        # ====================================================

        elif choice == "5":

            product_id = input(
                t("enter_id") + " "
            ).strip()

            cursor.execute(
                """
                SELECT id, name
                FROM products
                WHERE id = ?
                """,
                (product_id,)
            )

            product = cursor.fetchone()

            if product is None:

                print(
                    t("product_not_found")
                )

                continue

            print(
                f"{t('name')}:",
                product[1]
            )

            confirm = input(
                t("delete_confirmation") + " "
            ).strip().lower()

            if confirm != t("yes").lower():

                print(
                    t("operation_cancelled")
                )

                continue

            try:

                cursor.execute(
                    """
                    DELETE FROM products
                    WHERE id = ?
                    """,
                    (product_id,)
                )

                connection.commit()

                print(
                    t("deleted_successfully")
                )

            except Exception as error:

                connection.rollback()

                print(
                    t("product_delete_failed")
                )

                print(
                    t("reason") + ":",
                    error
                )

        # ====================================================
        # STOCK INVENTORY
        # ====================================================

        elif choice == "6":

            stock_inventory()

        # ====================================================
        # BACK
        # ====================================================

        elif choice == "7":

            return

        else:

            print(
                t("invalid_option")
            )