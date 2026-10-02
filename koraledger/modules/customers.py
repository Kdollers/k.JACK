from database import cursor, connection
from languages import t

def customer_menu():

    while True:

        print()
        print("================================")
        print(t("customers").upper())
        print("================================")

        print("1.", t("add_customer"))
        print("2.", t("view_customers"))
        print("3.", t("search_customer"))
        print("4.", t("edit_customer"))
        print("5.", t("delete_customer"))
        print("6.", t("back"))

        choice = input(
            t("choose_option") + " "
        ).strip()

        # ==========================================
        # ADD CUSTOMER
        # ==========================================

        if choice == "1":

            print()
            print(t("add_customer").upper())

            name = input(
                t("enter_name") + " "
            ).strip()

            if not name:
                print(t("name_empty"))
                continue

            phone = input(
                t("enter_phone") + " "
            ).strip()

            cursor.execute(
                """
                INSERT INTO customers
                (name, phone)
                VALUES (?, ?)
                """,
                (name, phone)
            )

            connection.commit()

            print()
            print(t("added_successfully"))

        # ==========================================
        # VIEW CUSTOMERS
        # ==========================================

        elif choice == "2":

            cursor.execute(
                """
                SELECT id, name, phone
                FROM customers
                ORDER BY id
                """
            )

            customers = cursor.fetchall()

            print()
            print(
                "========== "
                + t("view_customers").upper()
                + " =========="
            )

            if not customers:

                print(t("not_found"))

            else:

                for customer in customers:

                    print(
                        f"{t('id')}: {customer[0]} | "
                        f"{t('name')}: {customer[1]} | "
                        f"{t('phone')}: "
                        f"{customer[2] or ''}"
                    )

        # ==========================================
        # SEARCH CUSTOMER
        # ==========================================

        elif choice == "3":

            search = input(
                t("enter_name") + " "
            ).strip()

            cursor.execute(
                """
                SELECT id, name, phone
                FROM customers
                WHERE name LIKE ?
                   OR phone LIKE ?
                ORDER BY name
                """,
                (
                    f"%{search}%",
                    f"%{search}%"
                )
            )

            customers = cursor.fetchall()

            print()
            print(
                "========== "
                + t("search_customer").upper()
                + " =========="
            )

            if not customers:

                print(t("customer_not_found"))

            else:

                for customer in customers:

                    print(
                        f"{t('id')}: {customer[0]} | "
                        f"{t('name')}: {customer[1]} | "
                        f"{t('phone')}: "
                        f"{customer[2] or ''}"
                    )

        # ==========================================
        # EDIT CUSTOMER
        # ==========================================

        elif choice == "4":

            customer_id = input(
                t("enter_id") + " "
            ).strip()

            cursor.execute(
                """
                SELECT id, name, phone
                FROM customers
                WHERE id = ?
                """,
                (customer_id,)
            )

            customer = cursor.fetchone()

            if customer is None:

                print(t("customer_not_found"))
                continue

            print()
            print(
                f"{t('name')}:",
                customer[1]
            )

            new_name = input(
                t("enter_name") + " "
                + t("keep_current") + " "
            ).strip()

            print(
                f"{t('phone')}:",
                customer[2] or ""
            )

            new_phone = input(
                t("enter_phone") + " "
                + t("keep_current") + " "
            ).strip()

            if not new_name:
                new_name = customer[1]

            if not new_phone:
                new_phone = customer[2]

            cursor.execute(
                """
                UPDATE customers
                SET name = ?,
                    phone = ?
                WHERE id = ?
                """,
                (
                    new_name,
                    new_phone,
                    customer_id
                )
            )

            connection.commit()

            print(t("updated_successfully"))

        # ==========================================
        # DELETE CUSTOMER
        # ==========================================

        elif choice == "5":

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

            print(
                f"{t('name')}:",
                customer[1]
            )

            confirm = input(
                t("delete_confirmation") + " "
            ).strip().lower()

            if confirm != t("yes").lower():

                print(t("operation_cancelled"))
                continue

            try:

                cursor.execute(
                    """
                    DELETE FROM customers
                    WHERE id = ?
                    """,
                    (customer_id,)
                )

                connection.commit()

                print(t("deleted_successfully"))

            except Exception as error:

                connection.rollback()

                print(t("customer_cannot_be_deleted"))
                print(f"{t('reason')}: {error}")

        # ==========================================
        # BACK
        # ==========================================

        elif choice == "6":

            return

        else:

            print(t("invalid_option"))