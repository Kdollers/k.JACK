"""Payroll & HR module (SAGE Paie & GRH)."""

from modules.cli_helpers import ask_amount, ask_date, error_or_none, find_by_id_or_code, repository
from languages import t


def _add_employee(repo):
    code = input(t("employee_code") + " ").strip()
    name = input(t("employee_name") + " ").strip()
    if not name:
        print(t("name_empty"))
        return
    role = input(t("employee_role") + " ").strip()
    base_salary = ask_amount(t("base_salary"))
    hire_date = ask_date(t("hire_date"), allow_empty=True)
    error_or_none(repo.save_employee, name, role, base_salary, hire_date, code)
    print(t("added_successfully"))


def _view_employees(repo):
    employees = repo.list_employees()
    print()
    print("=" * 64)
    print(t("view_employees").upper())
    print("=" * 64)
    if not employees:
        print(t("not_found"))
        return
    for employee in employees:
        status = t("active") if employee["is_active"] else t("inactive")
        print(
            f"{employee['employee_code']} | {employee['name']} | "
            f"{employee['role'] or '—'} | {employee['base_salary']:,.2f} | "
            f"{status} | {employee['payslip_count']} {t('payslip_count')}"
        )


def _edit_employee(repo):
    term = input(t("enter_id") + " ").strip()
    match = find_by_id_or_code(repo.list_employees(), term, "employee_code")
    if match is None:
        print(t("employee_not_found"))
        return
    new_name = input(f"{t('employee_name')}: {match['name']} {t('keep_current')} ").strip() or match["name"]
    new_role = input(f"{t('employee_role')}: {match['role'] or ''} {t('keep_current')} ").strip()
    new_salary = input(f"{t('base_salary')}: {match['base_salary']:.2f} {t('keep_current')} ").strip().replace(",", "")
    base_salary = float(new_salary) if new_salary else match["base_salary"]
    result = error_or_none(
        repo.save_employee, new_name, new_role, base_salary,
        match["hire_date"] or "", match["employee_code"], match["id"],
    )
    if result is not None:
        print(t("updated_successfully"))


def _toggle_employee(repo):
    term = input(t("enter_id") + " ").strip()
    match = find_by_id_or_code(repo.list_employees(), term, "employee_code")
    if match is None:
        print(t("employee_not_found"))
        return
    active = not bool(match["is_active"])
    if error_or_none(repo.set_employee_active, match["id"], active) is not None:
        print(t("employee_status_updated"))


def _run_payroll(repo):
    employees = [row for row in repo.list_employees() if row["is_active"]]
    if not employees:
        print(t("no_active_employees"))
        return
    print()
    print(t("run_payroll_for"))
    for row in employees:
        print(f"  {row['employee_code']} · {row['name']} — {row['base_salary']:,.2f}")
    period_start = ask_date(t("period_start"))
    period_end = ask_date(t("period_end"))
    adjustments = {}
    for row in employees:
        print()
        print(f"{row['name']} ({row['employee_code']})")
        allowances = ask_amount(t("enter_allowances"))
        deductions = ask_amount(t("enter_deductions"))
        if allowances or deductions:
            adjustments[str(row["id"])] = {"allowances": allowances, "deductions": deductions}
    result = error_or_none(repo.run_payroll, period_start, period_end, adjustments)
    if result is not None:
        print()
        print(t("payroll_posted"))
        print(f"{t('payroll_reference')}: {result['reference']}")
        print(f"{t('payslip_count')}: {result['employee_count']}")
        print(f"{t('total_net')}: {result['total_net']:,.2f}")


def _view_runs(repo):
    runs = repo.list_payroll_runs()
    print()
    print("=" * 78)
    print(t("view_payroll_runs").upper())
    print("=" * 78)
    if not runs:
        print(t("not_found"))
        return
    for run in runs:
        print(
            f"#{run['id']} | {run['period_start']} → {run['period_end']} | "
            f"{run['employee_count']} {t('payslip_count')} | "
            f"{t('total_base')} {run['total_base']:,.2f} | "
            f"{t('total_allowances')} {run['total_allowances']:,.2f} | "
            f"{t('total_deductions')} {run['total_deductions']:,.2f} | "
            f"{t('total_net')} {run['total_net']:,.2f}"
        )
    follow = input(f"{t('view_payslip_run')} (ID, Enter to skip)? ").strip()
    if not follow:
        return
    try:
        run_id = int(follow)
    except ValueError:
        print(t("invalid_option"))
        return
    header, payslips = repo.payroll_run_details(run_id)
    if not header:
        print(t("not_found"))
        return
    print()
    for slip in payslips:
        print(
            f"{slip['name']} | {t('base_salary')} {slip['base_salary']:,.2f} | "
            f"{t('allowances')} {slip['allowances']:,.2f} | "
            f"{t('deductions')} {slip['deductions']:,.2f} | "
            f"{t('net_salary')} {slip['net_salary']:,.2f}"
        )


def payroll_menu():
    repo = repository()
    while True:
        print()
        print("=" * 42)
        print(t("payroll").upper())
        print("=" * 42)
        print("1.", t("add_employee"))
        print("2.", t("view_employees"))
        print("3.", t("edit_employee"))
        print("4.", t("deactivate_employee"))
        print("5.", t("run_payroll"))
        print("6.", t("view_payroll_runs"))
        print("7.", t("back"))
        choice = input(t("choose_option") + " ").strip()
        if choice == "1":
            _add_employee(repo)
        elif choice == "2":
            _view_employees(repo)
        elif choice == "3":
            _edit_employee(repo)
        elif choice == "4":
            _toggle_employee(repo)
        elif choice == "5":
            _run_payroll(repo)
        elif choice == "6":
            _view_runs(repo)
        elif choice == "7":
            return
        else:
            print(t("invalid_option"))
