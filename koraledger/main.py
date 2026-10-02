"""Launch the desktop accounting workspace, or retain the terminal menu with --cli."""

import sys


def run_cli():
    from database import close_database

    try:
        from languages import choose_language, t
        from modules.accounting import accounting_menu
        from modules.customers import customer_menu
        from modules.payments import payment_menu
        from modules.products import product_menu
        from modules.purchases import purchase_menu
        from modules.reports import reports_menu
        from modules.sales import sales_menu
        from modules.suppliers import supplier_menu

        choose_language()
        modules = {
            "1": customer_menu,
            "2": supplier_menu,
            "3": product_menu,
            "4": sales_menu,
            "5": purchase_menu,
            "6": payment_menu,
            "7": accounting_menu,
            "8": reports_menu,
        }
        while True:
            print()
            print("=" * 42)
            print(t("app_title"))
            print("=" * 42)
            for number, label in (
                ("1", "customers"),
                ("2", "suppliers"),
                ("3", "products_inventory"),
                ("4", "sales"),
                ("5", "purchases"),
                ("6", "payments"),
                ("7", "accounting"),
                ("8", "reports"),
                ("9", "exit"),
            ):
                print(f"{number}. {t(label)}")
            choice = input(f"\n{t('choose_option')} ").strip()
            if choice == "9":
                print(f"\n{t('exit')}")
                break
            action = modules.get(choice)
            if action:
                action()
            else:
                print(f"\n{t('invalid_option')}")
    except (KeyboardInterrupt, EOFError):
        print()
    finally:
        close_database()


def main():
    if "--cli" in sys.argv[1:]:
        run_cli()
        return
    if "--help" in sys.argv[1:] or "-h" in sys.argv[1:]:
        print("Usage: python main.py [--cli]\n\nOpen the desktop accounting workspace (default), or use --cli for the terminal menu.")
        return
    try:
        import tkinter as tk
    except ImportError as error:
        print(
            "The desktop interface requires Python's Tkinter module. "
            "Install Tkinter or run `python main.py --cli` instead.\n"
            f"Details: {error}",
            file=sys.stderr,
        )
        return
    try:
        from modules.desktop_ui import run_desktop
        run_desktop()
    except tk.TclError as error:
        print(
            "The desktop interface could not start in this environment. "
            "Run `python main.py --cli` in a terminal instead.\n"
            f"Details: {error}",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
