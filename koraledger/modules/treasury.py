"""Treasury module (SAGE Trésorerie)."""

from languages import t
from modules.cli_helpers import ask_amount, ask_date, error_or_none, find_by_id_or_code, repository


def _add_account(repo):
    name = input(t("account_name") + " ").strip()
    if not name:
        print(t("name_empty"))
        return
    bank_name = input(t("bank_name") + " ").strip()
    number = input(t("account_number") + " ").strip()
    opening = ask_amount(t("opening_balance"))
    if error_or_none(repo.save_bank_account, name, bank_name, number, opening) is not None:
        print(t("added_successfully"))


def _view_accounts(repo):
    accounts, totals = repo.treasury_positions()
    print()
    print("=" * 78)
    print(t("view_bank_accounts").upper())
    print("=" * 78)
    if not accounts:
        print(t("not_found"))
    for account in accounts:
        status = t("active") if account["is_active"] else t("inactive")
        print(
            f"{account['id']} | {account['account_name']} | {account['bank_name'] or '—'} | "
            f"{account['account_number'] or '—'} | {t('opening_balance')} {account['opening_balance']:,.2f} | "
            f"{t('current_balance')} {account['current_balance']:,.2f} | {status}"
        )
    print("-" * 78)
    print(
        f"{t('opening_balance')} {totals['opening']:,.2f} | "
        f"{t('net_movements')} {totals['net']:,.2f} | "
        f"{t('total_treasury')} {totals['total']:,.2f}"
    )


def _edit_account(repo):
    term = input(t("enter_id") + " ").strip()
    match = find_by_id_or_code(repo.list_bank_accounts(), term, "account_number")
    if match is None:
        print(t("bank_account_not_found"))
        return
    new_name = input(f"{t('account_name')}: {match['account_name']} {t('keep_current')} ").strip() or match["account_name"]
    new_bank = input(f"{t('bank_name')}: {match['bank_name'] or ''} {t('keep_current')} ").strip()
    new_number = input(f"{t('account_number')}: {match['account_number'] or ''} {t('keep_current')} ").strip()
    new_opening = input(f"{t('opening_balance')}: {match['opening_balance']:.2f} {t('keep_current')} ").strip().replace(",", "")
    opening = float(new_opening) if new_opening else match["opening_balance"]
    if error_or_none(repo.save_bank_account, new_name, new_bank, new_number, opening, match["id"]) is not None:
        print(t("updated_successfully"))


def _delete_account(repo):
    term = input(t("enter_id") + " ").strip()
    match = find_by_id_or_code(repo.list_bank_accounts(), term, "account_number")
    if match is None:
        print(t("bank_account_not_found"))
        return
    confirm = input(t("delete_confirmation") + " ").strip().lower()
    if confirm != t("yes").lower():
        print(t("operation_cancelled"))
        return
    if error_or_none(repo.delete_bank_account, match["id"]) is not None:
        print(t("deleted_successfully"))


def _record_movement(repo):
    accounts = [row for row in repo.list_bank_accounts() if row["is_active"]]
    if not accounts:
        print(t("no_bank_accounts"))
        return
    for row in accounts:
        print(f"  {row['id']} · {row['account_name']} ({row['bank_name'] or '—'})")
    term = input(f"{t('account_name')} (ID): ").strip()
    match = find_by_id_or_code(accounts, term, "account_number")
    if match is None:
        print(t("bank_account_not_found"))
        return
    movement_date = ask_date(t("movement_date"))
    direction = input(t("direction") + " (in/out) ").strip().lower()
    amount = ask_amount(t("amount"))
    description = input(t("description") + " ").strip()
    result = error_or_none(repo.create_cash_movement, match["id"], movement_date, direction, amount, description)
    if result is not None:
        print(t("movement_posted"))
        print(f"{result['reference']} · {result['amount']:,.2f}")


def _view_movements(repo):
    movements = repo.list_cash_movements()
    print()
    print("=" * 72)
    print(t("view_treasury_movements").upper())
    print("=" * 72)
    if not movements:
        print(t("not_found"))
        return
    for movement in movements:
        sign = "+" if movement["direction"] == "in" else "-"
        print(
            f"{movement['reference']} | {movement['movement_date'][:10]} | {movement['account_name']} | "
            f"{sign}{movement['amount']:,.2f} | {movement['description'] or '—'}"
        )


def treasury_menu():
    repo = repository()
    while True:
        print()
        print("=" * 42)
        print(t("treasury").upper())
        print("=" * 42)
        print("1.", t("add_bank_account"))
        print("2.", t("view_bank_accounts"))
        print("3.", t("edit_bank_account"))
        print("4.", t("delete_bank_account"))
        print("5.", t("record_treasury_movement"))
        print("6.", t("view_treasury_movements"))
        print("7.", t("back"))
        choice = input(t("choose_option") + " ").strip()
        if choice == "1":
            _add_account(repo)
        elif choice == "2":
            _view_accounts(repo)
        elif choice == "3":
            _edit_account(repo)
        elif choice == "4":
            _delete_account(repo)
        elif choice == "5":
            _record_movement(repo)
        elif choice == "6":
            _view_movements(repo)
        elif choice == "7":
            return
        else:
            print(t("invalid_option"))
