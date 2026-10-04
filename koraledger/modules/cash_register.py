"""Cash office module (SAGE Moyens de paiement / Saisie de caisse)."""

from languages import t
from modules.cli_helpers import ask_amount, ask_date, error_or_none, find_by_id_or_code, repository


def _add_register(repo):
    name = input(t("register_name") + " ").strip()
    if not name:
        print(t("name_empty"))
        return
    opening = ask_amount(t("opening_float"))
    if error_or_none(repo.save_register, name, opening) is not None:
        print(t("added_successfully"))


def _view_registers(repo):
    registers = repo.list_registers()
    print()
    print("=" * 72)
    print(t("view_registers").upper())
    print("=" * 72)
    if not registers:
        print(t("not_found"))
        return
    for register in registers:
        status = t("active") if register["is_active"] else t("inactive")
        print(
            f"{register['id']} | {register['register_name']} | "
            f"{t('opening_float')} {register['opening_balance']:,.2f} | "
            f"{t('expected_amount')} {register['expected_cash']:,.2f} | {status}"
        )


def _edit_register(repo):
    term = input(t("enter_id") + " ").strip()
    match = find_by_id_or_code(repo.list_registers(), term, "register_name")
    if match is None:
        print(t("register_not_found"))
        return
    new_name = input(f"{t('register_name')}: {match['register_name']} {t('keep_current')} ").strip() or match["register_name"]
    new_opening = input(f"{t('opening_float')}: {match['opening_balance']:.2f} {t('keep_current')} ").strip().replace(",", "")
    opening = float(new_opening) if new_opening else match["opening_balance"]
    if error_or_none(repo.save_register, new_name, opening, match["id"]) is not None:
        print(t("updated_successfully"))


def _delete_register(repo):
    term = input(t("enter_id") + " ").strip()
    match = find_by_id_or_code(repo.list_registers(), term, "register_name")
    if match is None:
        print(t("register_not_found"))
        return
    confirm = input(t("delete_confirmation") + " ").strip().lower()
    if confirm != t("yes").lower():
        print(t("operation_cancelled"))
        return
    if error_or_none(repo.delete_register, match["id"]) is not None:
        print(t("deleted_successfully"))


def _record_movement(repo):
    registers = [row for row in repo.list_registers() if row["is_active"]]
    if not registers:
        print(t("no_registers"))
        return
    for row in registers:
        print(f"  {row['id']} · {row['register_name']}")
    term = input(f"{t('register_name')} (ID): ").strip()
    match = find_by_id_or_code(registers, term, "register_name")
    if match is None:
        print(t("register_not_found"))
        return
    movement_date = ask_date(t("movement_date"))
    direction = input(t("direction") + " (in/out) ").strip().lower()
    amount = ask_amount(t("amount"))
    description = input(t("description") + " ").strip()
    if error_or_none(repo.add_register_movement, match["id"], movement_date, direction, amount, description) is not None:
        print(t("added_successfully"))


def _view_movements(repo):
    movements = repo.list_register_movements()
    print()
    print("=" * 72)
    print(t("view_register_movements").upper())
    print("=" * 72)
    if not movements:
        print(t("not_found"))
        return
    for movement in movements:
        sign = "+" if movement["direction"] == "in" else "-"
        print(
            f"{movement['id']} | {movement['movement_date'][:10]} | {movement['register_name']} | "
            f"{sign}{movement['amount']:,.2f} | {movement['description'] or '—'}"
        )


def _close_register(repo):
    registers = [row for row in repo.list_registers() if row["is_active"]]
    if not registers:
        print(t("no_registers"))
        return
    for row in registers:
        print(f"  {row['id']} · {row['register_name']}")
    term = input(f"{t('register_name')} (ID): ").strip()
    match = find_by_id_or_code(registers, term, "register_name")
    if match is None:
        print(t("register_not_found"))
        return
    closing_date = ask_date(t("closing_date"))
    counted = ask_amount(t("counted_amount"))
    result = error_or_none(repo.close_register, match["id"], closing_date, counted)
    if result is not None:
        print(t("register_closed"))
        print(
            f"{t('expected_amount')} {result['expected']:,.2f} | "
            f"{t('actual_amount')} {result['actual']:,.2f} | "
            f"{t('variance')} {result['difference']:+,.2f}"
        )


def _view_closings(repo):
    closings = repo.list_register_closings()
    print()
    print("=" * 72)
    print(t("view_register_closings").upper())
    print("=" * 72)
    if not closings:
        print(t("not_found"))
        return
    for closing in closings:
        print(
            f"{closing['id']} | {closing['closing_date'][:10]} | {closing['register_name']} | "
            f"{t('expected_amount')} {closing['expected_amount']:,.2f} | "
            f"{t('actual_amount')} {closing['actual_amount']:,.2f} | "
            f"{t('variance')} {closing['difference']:+,.2f}"
        )


def cash_register_menu():
    repo = repository()
    while True:
        print()
        print("=" * 42)
        print(t("cash_office").upper())
        print("=" * 42)
        print("1.", t("add_register"))
        print("2.", t("view_registers"))
        print("3.", t("edit_register"))
        print("4.", t("delete_register"))
        print("5.", t("add_register_movement"))
        print("6.", t("view_register_movements"))
        print("7.", t("close_register"))
        print("8.", t("view_register_closings"))
        print("9.", t("back"))
        choice = input(t("choose_option") + " ").strip()
        if choice == "1":
            _add_register(repo)
        elif choice == "2":
            _view_registers(repo)
        elif choice == "3":
            _edit_register(repo)
        elif choice == "4":
            _delete_register(repo)
        elif choice == "5":
            _record_movement(repo)
        elif choice == "6":
            _view_movements(repo)
        elif choice == "7":
            _close_register(repo)
        elif choice == "8":
            _view_closings(repo)
        elif choice == "9":
            return
        else:
            print(t("invalid_option"))
