from database import cursor, connection
from languages import t


def supplier_menu():

    while True:

        print()
        print("================================")
        print(t("suppliers").upper())
        print("================================")

        print("1.", t("add_supplier"))
        print("2.", t("view_suppliers"))
        print("3.", t("search_supplier"))
        print("4.", t("edit_supplier"))
        print("5.", t("delete_supplier"))
        print("6.", t("back"))

        choice = input(
            t("choose_option") + " "
        ).strip()

        # ==========================================
        # ADD SUPPLIER
        # ==========================================

        if choice == "1":

            print()
            print(t("add_supplier").upper())

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
                INSERT INTO suppliers
                (name, phone)
                VALUES (?, ?)
                """,
                (name, phone)
            )

            connection.commit()

            print()
            print(t("added_successfully"))

        # ==========================================
        # VIEW SUPPLIERS
        # ==========================================

        elif choice == "2":

            cursor.execute(
                """
                SELECT id, name, phone
                FROM suppliers
                ORDER BY id
                """
            )

            suppliers = cursor.fetchall()

            print()
            print(
                "========== "
                + t("view_suppliers").upper()
                + " =========="
            )

            if not suppliers:

                print(t("not_found"))

            else:

                for supplier in suppliers:

                    print(
                        f"{t('id')}: {supplier[0]} | "
                        f"{t('name')}: {supplier[1]} | "
                        f"{t('phone')}: "
                        f"{supplier[2] or ''}"
                    )

        # ==========================================
        # SEARCH SUPPLIER
        # ==========================================

        elif choice == "3":

            search = input(
                t("enter_name") + " "
            ).strip()

            cursor.execute(
                """
                SELECT id, name, phone
                FROM suppliers
                WHERE name LIKE ?
                   OR phone LIKE ?
                ORDER BY name
                """,
                (
                    f"%{search}%",
                    f"%{search}%"
                )
            )

            suppliers = cursor.fetchall()

            print()
            print(
                "========== "
                + t("search_supplier").upper()
                + " =========="
            )

            if not suppliers:

                print(t("supplier_not_found"))

            else:

                for supplier in suppliers:

                    print(
                        f"{t('id')}: {supplier[0]} | "
                        f"{t('name')}: {supplier[1]} | "
                        f"{t('phone')}: "
                        f"{supplier[2] or ''}"
                    )

        # ==========================================
        # EDIT SUPPLIER
        # ==========================================

        elif choice == "4":

            supplier_id = input(
                t("enter_id") + " "
            ).strip()

            cursor.execute(
                """
                SELECT id, name, phone
                FROM suppliers
                WHERE id = ?
                """,
                (supplier_id,)
            )

            supplier = cursor.fetchone()

            if supplier is None:

                print(t("supplier_not_found"))
                continue

            print()
            print(
                f"{t('name')}:",
                supplier[1]
            )

            new_name = input(
                t("enter_name") + " "
                "(press Enter to keep current): "
            ).strip()

            print(
                f"{t('phone')}:",
                supplier[2] or ""
            )

            new_phone = input(
                t("enter_phone") + " "
                "(press Enter to keep current): "
            ).strip()

            if not new_name:
                new_name = supplier[1]

            if not new_phone:
                new_phone = supplier[2]

            cursor.execute(
                """
                UPDATE suppliers
                SET name = ?,
                    phone = ?
                WHERE id = ?
                """,
                (
                    new_name,
                    new_phone,
                    supplier_id
                )
            )

            connection.commit()

            print(t("updated_successfully"))

        # ==========================================
        # DELETE SUPPLIER
        # ==========================================

        elif choice == "5":

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

            print(
                f"{t('name')}:",
                supplier[1]
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
                    DELETE FROM suppliers
                    WHERE id = ?
                    """,
                    (supplier_id,)
                )

                connection.commit()

                print(t("deleted_successfully"))

            except Exception as error:

                connection.rollback()

                print(
                    "Supplier cannot be deleted."
                )

                print(
                    "Reason:",
                    error
                )

        # ==========================================
        # BACK
        # ==========================================

        elif choice == "6":

            return

        else:

            print(t("invalid_option"))