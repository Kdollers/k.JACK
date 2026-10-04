"""Bank reconciliation module (SAGE Rapprochement)."""

from languages import t
from modules.cli_helpers import ask_amount, ask_date, error_or_none, find_by_id_or_code, repository


def _add_line(repo):
    accounts = [row for row in repo.list_bank_accounts() if row["is_active"]]
    if not accounts:
        print(t("no_bank_accounts"))
        return
    for row in accounts:
        print(f"  {row['id']} · {row['account_name']}")
    term = input(f"{t('account_name')} (ID): ").strip()
    match = find_by_id_or_code(accounts, term, "account_number")
    if match is None:
        print(t("bank_account_not_found"))
        return
    statement_date = ask_date(t("statement_date"))
    reference = input(t("reference") + " ").strip()
    description = input(t("description") + " ").strip()
    direction = input(t("direction") + " (in/out) ").strip().lower()
    amount = ask_amount(t("amount"))
    line_id = error_or_none(
        repo.add_statement_line, match["id"], statement_date, direction, amount, reference, description,
    )
    if line_id is not None:
        print(t("added_successfully"))


def _view_lines(repo):
    lines = repo.list_statement_lines()
    print()
    print("=" * 78)
    print(t("view_statement_lines").upper())
    print("=" * 78)
    if not lines:
        print(t("not_found"))
        return
    for line in lines:
        status = t("reconciled") if line["is_reconciled"] else t("unreconciled")
        sign = "+" if line["direction"] == "in" else "-"
        print(
            f"{line['id']} | {line['statement_date'][:10]} | {line['account_name']} | "
            f"{sign}{line['amount']:,.2f} | {line['reference'] or line['description'] or '—'} | "
            f"{status}"
            + (f" · {line['matched_reference']}" if line["matched_reference"] else "")
        )


def _reconcile_line(repo):
    lines = [row for row in repo.list_statement_lines() if not row["is_reconciled"]]
    if not lines:
        print(t("no_unreconciled_lines"))
        return
    for row in lines:
        sign = "+" if row["direction"] == "in" else "-"
        print(f"  {row['id']} · {row['statement_date'][:10]} · {row['account_name']} · {sign}{row['amount']:,.2f} · {row['reference'] or row['description'] or '—'}")
    term = input(f"{t('enter_id')}: ").strip()
    match = find_by_id_or_code(lines, term, "")
    if match is None:
        print(t("statement_line_not_found"))
        return
    movements = repo.list_reconcilable_movements(match["bank_account_id"])
    if not movements:
        print(t("no_reconcilable_movements"))
        return
    for row in movements:
        sign = "+" if row["direction"] == "in" else "-"
        print(f"  {row['id']} · {row['movement_date'][:10]} · {sign}{row['amount']:,.2f} · {row['reference']} · {row['description'] or '—'}")
    movement_term = input(f"{t('enter_id')} (movement): ").strip()
    movement = find_by_id_or_code(movements, movement_term, "")
    if movement is None:
        print(t("operation_cancelled"))
        return
    if error_or_none(repo.reconcile_statement_line, match["id"], movement["id"]) is not None:
        print(t("line_reconciled"))


def _unreconcile_line(repo):
    term = input(t("enter_id") + " ").strip()
    match = find_by_id_or_code(repo.list_statement_lines(), term, "")
    if match is None:
        print(t("statement_line_not_found"))
        return
    if error_or_none(repo.unreconcile_statement_line, match["id"]) is not None:
        print(t("line_unreconciled"))


def _delete_line(repo):
    term = input(t("enter_id") + " ").strip()
    match = find_by_id_or_code(repo.list_statement_lines(), term, "")
    if match is None:
        print(t("statement_line_not_found"))
        return
    confirm = input(t("delete_confirmation") + " ").strip().lower()
    if confirm != t("yes").lower():
        print(t("operation_cancelled"))
        return
    if error_or_none(repo.delete_statement_line, match["id"]) is not None:
        print(t("deleted_successfully"))


def _summary(repo):
    summary = repo.reconciliation_summary()
    print()
    print("=" * 56)
    print(t("view_reconciliation_summary").upper())
    print("=" * 56)
    print(f"{t('book_balance')}: {summary['book_balance']:,.2f}")
    print(f"{t('statement_balance')}: {summary['statement_balance']:,.2f}")
    print(f"{t('reconciled_amount')} ({summary['reconciled_count']}): {summary['reconciled_amount']:,.2f}")
    print(f"{t('difference')}: {summary['difference']:,.2f}")


def reconciliation_menu():
    repo = repository()
    while True:
        print()
        print("=" * 42)
        print(t("reconciliation").upper())
        print("=" * 42)
        print("1.", t("add_statement_line"))
        print("2.", t("view_statement_lines"))
        print("3.", t("reconcile_line"))
        print("4.", t("unreconcile_line"))
        print("5.", t("delete_statement_line"))
        print("6.", t("view_reconciliation_summary"))
        print("7.", t("back"))
        choice = input(t("choose_option") + " ").strip()
        if choice == "1":
            _add_line(repo)
        elif choice == "2":
            _view_lines(repo)
        elif choice == "3":
            _reconcile_line(repo)
        elif choice == "4":
            _unreconcile_line(repo)
        elif choice == "5":
            _delete_line(repo)
        elif choice == "6":
            _summary(repo)
        elif choice == "7":
            return
        else:
            print(t("invalid_option"))
