"""Fixed assets module (SAGE Immobilisations)."""

from languages import t
from modules.cli_helpers import ask_amount, ask_date, error_or_none, find_by_id_or_code, repository
from modules.accounting_repository import AccountingRepository


def _add_asset(repo):
    code = input(t("asset_code") + " ").strip()
    name = input(t("asset_name") + " ").strip()
    if not name:
        print(t("name_empty"))
        return
    print(t("asset_category") + ": " + " / ".join(AccountingRepository.ASSET_CATEGORIES))
    category = input(t("asset_category") + " ").strip()
    acquisition_date = ask_date(t("acquisition_date"))
    cost = ask_amount(t("acquisition_cost"))
    salvage = ask_amount(t("salvage_value"))
    life = int(input(t("useful_life_years") + " ").strip() or "0")
    notes = input(t("asset_notes") + " ").strip()
    result = error_or_none(
        repo.save_asset, code, name, category, acquisition_date, cost, salvage, life, notes,
    )
    if result is not None:
        print(t("added_successfully"))
        print(t("asset_acquisition_posted"))


def _view_assets(repo):
    assets = repo.list_assets()
    print()
    print("=" * 84)
    print(t("view_assets").upper())
    print("=" * 84)
    if not assets:
        print(t("not_found"))
        return
    for asset in assets:
        status = t("active") if asset["is_active"] else t("inactive")
        print(
            f"{asset['asset_code']} | {asset['name']} | {asset['category']} | "
            f"{asset['acquisition_cost']:,.2f} | {asset['accumulated_depreciation']:,.2f} | "
            f"{asset['net_book_value']:,.2f} | {status}"
        )


def _edit_asset(repo):
    term = input(t("enter_id") + " ").strip()
    match = find_by_id_or_code(repo.list_assets(), term, "asset_code")
    if match is None:
        print(t("asset_not_found"))
        return
    new_code = input(f"{t('asset_code')}: {match['asset_code']} {t('keep_current')} ").strip() or match["asset_code"]
    new_name = input(f"{t('asset_name')}: {match['name']} {t('keep_current')} ").strip() or match["name"]
    new_cost = input(f"{t('acquisition_cost')}: {match['acquisition_cost']:.2f} {t('keep_current')} ").strip().replace(",", "")
    cost = float(new_cost) if new_cost else match["acquisition_cost"]
    result = error_or_none(
        repo.save_asset, new_code, new_name, match["category"], match["acquisition_date"],
        cost, match["salvage_value"], match["useful_life_years"], match["notes"] or "", match["id"],
    )
    if result is not None:
        print(t("updated_successfully"))


def _delete_asset(repo):
    term = input(t("enter_id") + " ").strip()
    match = find_by_id_or_code(repo.list_assets(), term, "asset_code")
    if match is None:
        print(t("asset_not_found"))
        return
    confirm = input(t("delete_confirmation") + " ").strip().lower()
    if confirm != t("yes").lower():
        print(t("operation_cancelled"))
        return
    if error_or_none(repo.delete_asset, match["id"]) is not None:
        print(t("deleted_successfully"))


def _post_depreciation(repo):
    assets = [row for row in repo.list_assets() if row["is_active"]]
    if not assets:
        print(t("no_active_assets"))
        return
    for row in assets:
        print(
            f"  {row['asset_code']} · {row['name']} — "
            f"{t('net_book_value')} {row['net_book_value']:,.2f}"
        )
    term = input(f"{t('asset_code')} (ID): ").strip()
    match = find_by_id_or_code(assets, term, "asset_code")
    if match is None:
        print(t("asset_not_found"))
        return
    year = input(t("period_year") + " ").strip()
    result = error_or_none(repo.post_depreciation, match["id"], year)
    if result is not None:
        print(t("depreciation_posted"))
        print(f"{t('period_year')}: {result['period_year']} · {t('amount')}: {result['amount']:,.2f}")


def _view_depreciation(repo):
    entries = repo.list_depreciation()
    print()
    print("=" * 72)
    print(t("view_depreciation").upper())
    print("=" * 72)
    if not entries:
        print(t("not_found"))
        return
    for entry in entries:
        print(
            f"{entry['asset_code']} | {entry['asset_name']} | {entry['period_year']} | "
            f"{entry['amount']:,.2f} | {t('accumulated_depreciation')} {entry['cumulative']:,.2f}"
        )


def fixed_assets_menu():
    repo = repository()
    while True:
        print()
        print("=" * 42)
        print(t("fixed_assets").upper())
        print("=" * 42)
        print("1.", t("add_asset"))
        print("2.", t("view_assets"))
        print("3.", t("edit_asset"))
        print("4.", t("delete_asset"))
        print("5.", t("post_depreciation"))
        print("6.", t("view_depreciation"))
        print("7.", t("back"))
        choice = input(t("choose_option") + " ").strip()
        if choice == "1":
            _add_asset(repo)
        elif choice == "2":
            _view_assets(repo)
        elif choice == "3":
            _edit_asset(repo)
        elif choice == "4":
            _delete_asset(repo)
        elif choice == "5":
            _post_depreciation(repo)
        elif choice == "6":
            _view_depreciation(repo)
        elif choice == "7":
            return
        else:
            print(t("invalid_option"))
