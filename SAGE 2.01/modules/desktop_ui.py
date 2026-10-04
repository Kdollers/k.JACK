"""Sage-inspired desktop ERP workspace for KoraLedger.

The navigation follows the SAGE module set: accounting, trade (gestion
commerciale), payroll & HR (paie & GRH), fixed assets (immobilisations),
treasury (trésorerie), bank reconciliation (rapprochement), and the cash
office (moyens de paiement), plus reports and administration.
"""

import csv
from datetime import date
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from languages import LANGUAGE_NAMES
from languages.ui import ui_t
from modules.accounting_repository import ACCOUNT_TYPES, AccountingRepository
from modules.desktop_dialogs import (
    DetailDialog,
    InventoryCountDialog,
    InvoiceDialog,
    JournalEntryDialog,
    PaymentDialog,
    SimpleFormDialog,
)


C = {
    "navy": "#132c3b",
    "navy_2": "#1d3a49",
    "sidebar": "#173747",
    "sidebar_hover": "#234b5c",
    "teal": "#087f8c",
    "teal_dark": "#086872",
    "teal_light": "#e6f2f3",
    "canvas": "#f1f4f6",
    "white": "#ffffff",
    "text": "#1c2b36",
    "muted": "#71808b",
    "line": "#dbe2e6",
    "green": "#28785f",
    "green_light": "#eaf5ef",
    "amber": "#a86a12",
    "amber_light": "#fff4df",
    "red": "#b84c55",
    "red_light": "#fff0f1",
}


LANGUAGE_CODES = ("en", "fr", "rw", "es", "pt")
LANGUAGE_SHORT = {"en": "EN", "fr": "FR", "rw": "RW", "es": "ES", "pt": "PT"}


def money(value, currency="XAF"):
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0.0
    return f"{currency} {amount:,.2f}"


def short_date(value):
    return str(value or "")[:10]


class PayslipDialog(tk.Toplevel):
    """Payslips of one payroll run."""

    def __init__(self, parent, title, summary, rows, currency, label):
        super().__init__(parent)
        self.title(title)
        self.configure(bg=C["canvas"])
        self.geometry("860x560")
        self.minsize(640, 420)
        self.transient(parent)
        outer = tk.Frame(self, bg=C["white"], padx=24, pady=20)
        outer.pack(fill="both", expand=True, padx=16, pady=16)
        tk.Label(outer, text=title, bg=C["white"], fg=C["text"], font=("Segoe UI", 18, "bold")).pack(anchor="w")
        summary_text = "    ·    ".join(f"{key}: {value}" for key, value in summary.items())
        tk.Label(outer, text=summary_text, bg=C["white"], fg=C["muted"], font=("Segoe UI", 9), wraplength=780, justify="left").pack(anchor="w", pady=(7, 16))
        frame = tk.Frame(outer, bg=C["white"])
        frame.pack(fill="both", expand=True)
        columns = (
            ("code", label("col_emp_code"), 110, "w"),
            ("name", label("col_emp_name"), 240, "w"),
            ("base", label("col_ps_base"), 140, "e"),
            ("allow", label("col_ps_allow"), 130, "e"),
            ("ded", label("col_ps_ded"), 130, "e"),
            ("net", label("col_ps_net"), 140, "e"),
        )
        tree = ttk.Treeview(frame, columns=[column[0] for column in columns], show="headings")
        for key, caption, width, anchor in columns:
            tree.heading(key, text=caption)
            tree.column(key, width=width, anchor=anchor)
        for index, row in enumerate(rows):
            tree.insert(
                "", "end",
                values=(
                    row.get("employee_code") or "—",
                    row.get("name") or "—",
                    money(row.get("base_salary"), currency),
                    money(row.get("allowances"), currency),
                    money(row.get("deductions"), currency),
                    money(row.get("net_salary"), currency),
                ),
                tags=("odd" if index % 2 else "",),
            )
        tree.tag_configure("odd", background="#f7f9fa")
        tree.pack(fill="both", expand=True, side="left")
        scrollbar = ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
        scrollbar.pack(side="right", fill="y")
        tree.configure(yscrollcommand=scrollbar.set)


class AccountingDesktop:
    NAVIGATION = [
        ("nav_group_portal", [("dashboard", "nav_portal", "⌂")]),
        ("nav_group_accounting", [("accounts", "nav_accounts", "CO"), ("journals", "nav_journals", "JE"), ("ledger", "nav_ledger", "GL")]),
        ("nav_group_trade", [("customers", "nav_customers", "CU"), ("sales", "nav_sales", "SI"), ("payments", "nav_payments", "PY"), ("suppliers", "nav_suppliers", "SU"), ("purchases", "nav_purchases", "PI"), ("inventory", "nav_inventory", "ST"), ("adjustments", "nav_adjustments", "AD")]),
        ("nav_group_payroll", [("employees", "nav_employees", "EM"), ("payroll_runs", "nav_payroll_runs", "PR")]),
        ("nav_group_assets", [("fixed_assets", "nav_fixed_assets", "FA"), ("depreciation", "nav_depreciation", "DP")]),
        ("nav_group_treasury", [("bank_accounts", "nav_bank_accounts", "BA"), ("treasury_movements", "nav_treasury_movements", "TM")]),
        ("nav_group_reconciliation", [("reconciliation", "nav_reconciliation", "RC")]),
        ("nav_group_cash_office", [("registers", "nav_registers", "RG"), ("register_movements", "nav_register_movements", "RM"), ("register_closings", "nav_register_closings", "CL")]),
        ("nav_group_reports", [("trial_balance", "nav_trial_balance", "TB"), ("income_statement", "nav_income_statement", "IS"), ("balance_sheet", "nav_balance_sheet", "BS"), ("reports", "nav_reports", "RP")]),
        ("nav_group_administration", [("settings", "nav_settings", "⚙")]),
    ]

    PAGE_META = {
        "dashboard": ("page_title_portal", "page_sub_portal"),
        "accounts": ("page_title_accounts", "page_sub_accounts"),
        "journals": ("page_title_journals", "page_sub_journals"),
        "ledger": ("page_title_ledger", "page_sub_ledger"),
        "customers": ("page_title_customers", "page_sub_customers"),
        "sales": ("page_title_sales", "page_sub_sales"),
        "payments": ("page_title_payments", "page_sub_payments"),
        "suppliers": ("page_title_suppliers", "page_sub_suppliers"),
        "purchases": ("page_title_purchases", "page_sub_purchases"),
        "inventory": ("page_title_inventory", "page_sub_inventory"),
        "adjustments": ("page_title_adjustments", "page_sub_adjustments"),
        "employees": ("page_title_employees", "page_sub_employees"),
        "payroll_runs": ("page_title_payroll_runs", "page_sub_payroll_runs"),
        "fixed_assets": ("page_title_fixed_assets", "page_sub_fixed_assets"),
        "depreciation": ("page_title_depreciation", "page_sub_depreciation"),
        "bank_accounts": ("page_title_bank_accounts", "page_sub_bank_accounts"),
        "treasury_movements": ("page_title_treasury_movements", "page_sub_treasury_movements"),
        "reconciliation": ("page_title_reconciliation", "page_sub_reconciliation"),
        "registers": ("page_title_registers", "page_sub_registers"),
        "register_movements": ("page_title_register_movements", "page_sub_register_movements"),
        "register_closings": ("page_title_register_closings", "page_sub_register_closings"),
        "trial_balance": ("page_title_trial_balance", "page_sub_trial_balance"),
        "income_statement": ("page_title_income_statement", "page_sub_income_statement"),
        "balance_sheet": ("page_title_balance_sheet", "page_sub_balance_sheet"),
        "reports": ("page_title_reports", "page_sub_reports"),
        "search": ("page_title_search", "page_sub_search"),
        "settings": ("page_title_settings", "page_sub_settings"),
    }

    def __init__(self, root, repository, close_database):
        self.root = root
        self.repository = repository
        self.close_database = close_database
        self.currency = repository.get_setting("currency_code", "XAF")
        self.company = repository.get_setting("company_name", "My Company")
        self.lang = repository.get_setting("ui_language", "en") or "en"
        if self.lang not in LANGUAGE_CODES:
            self.lang = "en"
        self.active_page = "dashboard"
        self._record_map = {}
        self._table = None
        self._table_columns = []
        self._page_title = ""
        self._new_action = None
        self._sidebar_buttons = {}
        self.status_var = tk.StringVar(value=self._t("chrome_ready"))
        self.company_var = tk.StringVar(value=self.company)
        self.search_var = tk.StringVar()
        self.app_icon = None
        self.brand_icon = None
        icon_path = Path(__file__).resolve().parents[1] / "assets" / "koraledger_icon.png"
        if icon_path.is_file():
            try:
                self.app_icon = tk.PhotoImage(file=str(icon_path))
                self.root.iconphoto(True, self.app_icon)
                self.brand_icon = self.app_icon.subsample(
                    max(1, (self.app_icon.width() + 31) // 32),
                    max(1, (self.app_icon.height() + 31) // 32),
                )
            except tk.TclError:
                self.app_icon = None
                self.brand_icon = None

        self.root.title("KoraLedger · SAGE-style Accounting Suite")
        self.root.geometry("1460x920")
        self.root.minsize(1100, 700)
        self.root.configure(bg=C["canvas"])
        self._configure_styles()
        self._build_shell()
        self.root.bind("<F5>", lambda _event: self.refresh_page())
        self.root.bind("<Control-f>", lambda _event: self.search_entry.focus_set())
        self.root.bind("<Control-n>", lambda _event: self._new_action() if self._new_action else None)
        self.root.bind("<F1>", lambda _event: self._show_about())
        self.root.protocol("WM_DELETE_WINDOW", self._close)
        self.show_page("dashboard")

    def _t(self, key, fallback=None):
        return ui_t(self.lang, key, fallback)

    def _page_meta(self, page):
        title_key, subtitle_key = self.PAGE_META.get(page, (None, None))
        title = self._t(title_key, page.replace("_", " ").title()) if title_key else page.replace("_", " ").title()
        subtitle = self._t(subtitle_key, "") if subtitle_key else ""
        return title, subtitle

    def _configure_styles(self):
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("TFrame", background=C["canvas"])
        style.configure("Panel.TFrame", background=C["white"])
        style.configure("TLabel", background=C["canvas"], foreground=C["text"], font=("Segoe UI", 9))
        style.configure("Title.TLabel", background=C["canvas"], foreground=C["text"], font=("Segoe UI", 21, "bold"))
        style.configure("Subtitle.TLabel", background=C["canvas"], foreground=C["muted"], font=("Segoe UI", 9))
        style.configure("Muted.TLabel", background=C["white"], foreground=C["muted"], font=("Segoe UI", 9))
        style.configure("Primary.TButton", background=C["teal"], foreground=C["white"], padding=(14, 8), font=("Segoe UI", 9, "bold"), borderwidth=0)
        style.map("Primary.TButton", background=[("active", C["teal_dark"]), ("disabled", "#aab8bd")], foreground=[("disabled", "#f4f6f7")])
        style.configure("TButton", padding=(10, 7), font=("Segoe UI", 9), borderwidth=0)
        style.map("TButton", background=[("active", "#e3eaed")])
        style.configure("Danger.TButton", background=C["red_light"], foreground=C["red"], padding=(10, 7), font=("Segoe UI", 9, "bold"))
        style.configure("TEntry", padding=(7, 7), fieldbackground=C["white"], bordercolor=C["line"], font=("Segoe UI", 10))
        style.configure("TCombobox", padding=(6, 6), fieldbackground=C["white"], bordercolor=C["line"], font=("Segoe UI", 10))
        style.configure("Treeview", background=C["white"], fieldbackground=C["white"], foreground=C["text"], rowheight=31, font=("Segoe UI", 9), borderwidth=0)
        style.configure("Treeview.Heading", background="#edf1f3", foreground="#4e606b", font=("Segoe UI", 8, "bold"), padding=(9, 9), relief="flat")
        style.map("Treeview", background=[("selected", "#d8eff0")], foreground=[("selected", C["text"])])
        style.configure("TScrollbar", background="#e3e8eb", troughcolor=C["canvas"], borderwidth=0)

    def _build_shell(self):
        header = tk.Frame(self.root, bg=C["navy"], height=68)
        header.pack(side="top", fill="x")
        header.pack_propagate(False)

        brand = tk.Frame(header, bg=C["navy"], padx=22)
        brand.pack(side="left", fill="y")
        if self.brand_icon:
            mark = tk.Label(brand, image=self.brand_icon, bg=C["navy"], bd=0)
            mark.pack(side="left", pady=17)
        else:
            mark = tk.Label(brand, text="K", bg=C["teal"], fg=C["white"], font=("Segoe UI", 17, "bold"), width=2, height=1)
            mark.pack(side="left", pady=15)
        brand_copy = tk.Frame(brand, bg=C["navy"])
        brand_copy.pack(side="left", padx=11)
        tk.Label(brand_copy, text="KORALEDGER", bg=C["navy"], fg=C["white"], font=("Segoe UI", 11, "bold")).pack(anchor="w", pady=(14, 0))
        tk.Label(brand_copy, text=self._t("chrome_brand_line", "SAGE-STYLE ACCOUNTING SUITE"), bg=C["navy"], fg="#a9bbc3", font=("Segoe UI", 7, "bold")).pack(anchor="w", pady=(1, 0))

        right = tk.Frame(header, bg=C["navy"], padx=22)
        right.pack(side="right", fill="y")
        self.search_entry = ttk.Entry(right, textvariable=self.search_var, width=30)
        self.search_entry.pack(side="left", pady=17, padx=(0, 18))
        self.search_entry.insert(0, self._t("chrome_search_placeholder"))
        self.search_entry.bind("<FocusIn>", self._clear_search_placeholder)
        self.search_entry.bind("<Return>", lambda _event: self.global_search())
        lang_box = tk.Frame(right, bg=C["navy"])
        lang_box.pack(side="left", pady=17, padx=(0, 18))
        tk.Label(lang_box, text=self._t("chrome_language", "Langue"), bg=C["navy"], fg="#b8c8cf", font=("Segoe UI", 8, "bold")).pack(side="left", padx=(0, 5))
        self.lang_var = tk.StringVar(value=LANGUAGE_SHORT.get(self.lang, "EN"))
        self.lang_combo = ttk.Combobox(
            lang_box, textvariable=self.lang_var,
            values=[LANGUAGE_SHORT[code] for code in LANGUAGE_CODES],
            state="readonly", width=3,
        )
        self.lang_combo.pack(side="left")
        self.lang_combo.bind("<<ComboboxSelected>>", lambda _event: self._change_language(self.lang_var.get()))
        tk.Label(right, textvariable=self.company_var, bg=C["navy"], fg=C["white"], font=("Segoe UI", 9, "bold")).pack(side="left", padx=(0, 18))
        tk.Label(right, text=date.today().strftime("%d %b %Y"), bg=C["navy"], fg="#b8c8cf", font=("Segoe UI", 9)).pack(side="left")

        self.ribbon = tk.Frame(self.root, bg="#e7edef", height=48)
        self.ribbon.pack(side="top", fill="x")
        self.ribbon.pack_propagate(False)
        tk.Label(self.ribbon, text=self._t("chrome_tasks"), bg="#e7edef", fg=C["muted"], font=("Segoe UI", 8, "bold")).pack(side="left", padx=(22, 14))
        for caption_key, page in (
            ("chrome_new_sale", "sales"),
            ("chrome_new_purchase", "purchases"),
            ("chrome_receive_payment", "payments"),
            ("chrome_physical_count", "adjustments"),
            ("chrome_financial_reports", "reports"),
        ):
            ttk.Button(self.ribbon, text=self._t(caption_key), command=lambda key=page: self._quick_action(key)).pack(side="left", padx=4, pady=6)

        body = tk.Frame(self.root, bg=C["canvas"])
        body.pack(fill="both", expand=True)
        self.sidebar = tk.Frame(body, bg=C["sidebar"], width=250)
        self.sidebar.pack(side="left", fill="y")
        self.sidebar.pack_propagate(False)
        self._build_sidebar()
        self.workspace = tk.Frame(body, bg=C["canvas"])
        self.workspace.pack(side="left", fill="both", expand=True)

        footer = tk.Frame(self.root, bg="#e7edef", height=28)
        footer.pack(side="bottom", fill="x")
        footer.pack_propagate(False)
        tk.Label(footer, textvariable=self.status_var, bg="#e7edef", fg=C["muted"], font=("Segoe UI", 8), anchor="w").pack(side="left", padx=14, fill="y")
        tk.Label(footer, text=self._t("chrome_footer_local"), bg="#e7edef", fg=C["muted"], font=("Segoe UI", 8), anchor="e").pack(side="right", padx=14, fill="y")

    def _build_sidebar(self):
        navigation = tk.Frame(self.sidebar, bg=C["sidebar"])
        navigation.pack(side="top", fill="both", expand=True)
        canvas = tk.Canvas(navigation, bg=C["sidebar"], highlightthickness=0, bd=0)
        scrollbar = ttk.Scrollbar(navigation, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)

        contents = tk.Frame(canvas, bg=C["sidebar"])
        window = canvas.create_window((0, 0), window=contents, anchor="nw")
        contents.bind(
            "<Configure>",
            lambda _event: canvas.configure(scrollregion=canvas.bbox("all")),
        )
        canvas.bind(
            "<Configure>",
            lambda event: canvas.itemconfigure(window, width=event.width),
        )

        tk.Label(contents, text=self._t("chrome_company_workspace"), bg=C["sidebar"], fg="#9db2bc", font=("Segoe UI", 8, "bold"), anchor="w").pack(fill="x", padx=20, pady=(21, 10))
        for heading_key, entries in self.NAVIGATION:
            tk.Label(contents, text=self._t(heading_key), bg=C["sidebar"], fg="#87a0ab", font=("Segoe UI", 7, "bold"), anchor="w").pack(fill="x", padx=20, pady=(15, 5))
            for page, label_key, icon in entries:
                button = tk.Button(
                    contents, text=f"{icon:<3}  {self._t(label_key)}", anchor="w",
                    bg=C["sidebar"], fg="#e1e9ec", activebackground=C["sidebar_hover"],
                    activeforeground=C["white"], relief="flat", bd=0,
                    padx=18, pady=8, font=("Segoe UI", 9), cursor="hand2",
                    command=lambda target=page: self.show_page(target),
                )
                button.pack(fill="x", padx=10)
                self._sidebar_buttons[page] = button
                button.bind("<Enter>", lambda _event, widget=button, target=page: self._nav_hover(widget, target, True))
                button.bind("<Leave>", lambda _event, widget=button, target=page: self._nav_hover(widget, target, False))
        divider = tk.Frame(contents, bg="#345260", height=1)
        divider.pack(fill="x", padx=18, pady=(20, 12))
        tk.Label(contents, text="Local, auditable, double-entry accounting", bg=C["sidebar"], fg="#9db2bc", font=("Segoe UI", 8), wraplength=205, justify="left").pack(anchor="w", padx=20)
        tk.Button(self.sidebar, text=self._t("chrome_about_button"), bg=C["sidebar"], fg="#d4e0e4", activebackground=C["sidebar_hover"], activeforeground=C["white"], relief="flat", anchor="w", padx=18, pady=12, command=self._show_about).pack(side="bottom", fill="x", padx=10, pady=8)

    def _nav_hover(self, widget, page, active):
        if page == self.active_page:
            return
        widget.configure(bg=C["sidebar_hover"] if active else C["sidebar"])

    def _highlight_nav(self, page):
        for key, button in self._sidebar_buttons.items():
            selected = key == page
            button.configure(
                bg=C["teal"] if selected else C["sidebar"],
                fg=C["white"] if selected else "#e1e9ec",
                font=("Segoe UI", 9, "bold" if selected else "normal"),
            )

    def _clear_search_placeholder(self, _event=None):
        if self.search_var.get() == self._t("chrome_search_placeholder"):
            self.search_var.set("")

    def _close(self):
        try:
            self.close_database()
        except Exception:
            pass
        self.root.destroy()

    def _show_about(self):
        messagebox.showinfo(self._t("chrome_about_title"), self._t("chrome_about_body"), parent=self.root)

    def _set_status(self, message):
        self.status_var.set(f"{message}   ·   {date.today().strftime('%d %b %Y')}")

    def _change_language(self, short_code):
        code = next((key for key, value in LANGUAGE_SHORT.items() if value == short_code), "en")
        try:
            self.repository.save_settings(
                self.repository.get_setting("company_name", "My Company"),
                self.repository.get_setting("currency_code", "XAF"),
                self.repository.get_setting("tax_id", ""),
                self.repository.get_setting("address", ""),
                code,
            )
        except Exception as error:
            messagebox.showerror(self._t("set_save_error"), str(error), parent=self.root)
        self.lang = code
        self.show_page(self.active_page)
        self._set_status(f"{LANGUAGE_NAMES.get(code, code)} · UI")

    def _quick_action(self, page):
        if page == "sales":
            self._new_sale()
        elif page == "purchases":
            self._new_purchase()
        elif page == "payments":
            self._new_payment("customer")
        elif page == "adjustments":
            self._new_inventory_adjustment()
        else:
            self.show_page(page)

    def _start_page(self, page, actions=()):
        self.active_page = page
        self._highlight_nav(page)
        title, subtitle = self._page_meta(page)
        self._page_title = title
        self._new_action = None
        for child in self.workspace.winfo_children():
            child.destroy()
        header = tk.Frame(self.workspace, bg=C["canvas"], padx=28, pady=22)
        header.pack(fill="x")
        left = tk.Frame(header, bg=C["canvas"])
        left.pack(side="left", fill="x", expand=True)
        tk.Label(left, text=title, bg=C["canvas"], fg=C["text"], font=("Segoe UI", 21, "bold"), anchor="w").pack(anchor="w")
        if subtitle:
            tk.Label(left, text=subtitle, bg=C["canvas"], fg=C["muted"], font=("Segoe UI", 9), anchor="w", wraplength=760).pack(anchor="w", pady=(4, 0))
        right = tk.Frame(header, bg=C["canvas"])
        right.pack(side="right", padx=(16, 0))
        for caption, command, style in actions:
            ttk.Button(right, text=caption, command=command, style=style or "TButton").pack(side="left", padx=(7, 0))
        content = tk.Frame(self.workspace, bg=C["canvas"], padx=28, pady=0)
        content.pack(fill="both", expand=True, pady=(0, 20))
        return content

    def show_page(self, page):
        renderers = {
            "dashboard": self._render_dashboard,
            "customers": self._render_customers,
            "suppliers": self._render_suppliers,
            "inventory": self._render_inventory,
            "adjustments": self._render_adjustments,
            "sales": self._render_sales,
            "purchases": self._render_purchases,
            "payments": self._render_payments,
            "accounts": self._render_accounts,
            "journals": self._render_journals,
            "ledger": self._render_ledger,
            "employees": self._render_employees,
            "payroll_runs": self._render_payroll_runs,
            "fixed_assets": self._render_fixed_assets,
            "depreciation": self._render_depreciation,
            "bank_accounts": self._render_bank_accounts,
            "treasury_movements": self._render_treasury_movements,
            "reconciliation": self._render_reconciliation,
            "registers": self._render_registers,
            "register_movements": self._render_register_movements,
            "register_closings": self._render_register_closings,
            "trial_balance": self._render_trial_balance,
            "income_statement": self._render_income_statement,
            "balance_sheet": self._render_balance_sheet,
            "reports": self._render_reports,
            "settings": self._render_settings,
            "search": self._render_search,
        }
        renderer = renderers.get(page, self._render_dashboard)
        try:
            renderer()
        except Exception as error:
            self._start_page(page)
            tk.Label(self.workspace, text=f"{self._t('chrome_workspace_error')}\n\n{error}", bg=C["canvas"], fg=C["red"], font=("Segoe UI", 11), justify="left").pack(anchor="w", padx=32, pady=28)
            self._set_status("Workspace error")

    def refresh_page(self):
        if self.active_page:
            self.show_page(self.active_page)

    def _card(self, parent, label, value, note, accent=C["teal"], column=0):
        frame = tk.Frame(parent, bg=C["white"], highlightbackground=C["line"], highlightthickness=1, padx=17, pady=14)
        frame.grid(row=0, column=column, sticky="nsew", padx=(0 if column == 0 else 10, 0), pady=3)
        tk.Frame(frame, bg=accent, height=3).pack(fill="x", side="top")
        tk.Label(frame, text=label.upper(), bg=C["white"], fg=C["muted"], font=("Segoe UI", 8, "bold")).pack(anchor="w", pady=(11, 3))
        tk.Label(frame, text=value, bg=C["white"], fg=C["text"], font=("Segoe UI", 17, "bold")).pack(anchor="w")
        tk.Label(frame, text=note, bg=C["white"], fg=C["muted"], font=("Segoe UI", 8)).pack(anchor="w", pady=(3, 0))

    def _render_dashboard(self):
        data = self.repository.dashboard()
        self.company = data["company"]
        self.company_var.set(self.company)
        self.currency = data["currency"]
        actions = [
            (self._t("chrome_new_sale"), self._new_sale, "Primary.TButton"),
            (self._t("chrome_new_purchase"), self._new_purchase, "TButton"),
        ]
        content = self._start_page("dashboard", actions)
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=2)
        content.rowconfigure(2, weight=3)

        # KPI strip
        cards = tk.Frame(content, bg=C["canvas"])
        cards.grid(row=0, column=0, sticky="ew", pady=(0, 14))
        for column in range(4):
            cards.columnconfigure(column, weight=1)
        values = [
            (self._t("dash_card_cash"), money(data["cash_bank"], self.currency), self._t("dash_card_cash_note"), C["green"]),
            (self._t("dash_card_receivables"), money(data["receivables"], self.currency), self._t("dash_card_receivables_note"), "#527b9c"),
            (self._t("dash_card_payables"), money(data["payables"], self.currency), self._t("dash_card_payables_note"), "#947849"),
            (self._t("dash_card_income"), money(data["net_profit"], self.currency), self._t("dash_card_income_note"), C["teal"]),
        ]
        for column, values_row in enumerate(values):
            self._card(cards, *values_row, column=column)

        # SAGE module tiles
        tiles_frame = tk.Frame(content, bg=C["canvas"])
        tiles_frame.grid(row=1, column=0, sticky="nsew", pady=(0, 14))
        title_row = tk.Frame(tiles_frame, bg=C["canvas"])
        title_row.pack(fill="x")
        tk.Label(title_row, text=self._t("dash_module_title"), bg=C["canvas"], fg=C["muted"], font=("Segoe UI", 8, "bold")).pack(side="left")
        tk.Label(title_row, text=self._t("dash_module_sub"), bg=C["canvas"], fg=C["muted"], font=("Segoe UI", 8)).pack(side="left", padx=12)
        tiles_grid = tk.Frame(tiles_frame, bg=C["canvas"])
        tiles_grid.pack(fill="both", expand=True)
        for column in range(4):
            tiles_grid.columnconfigure(column, weight=1)
        tiles = [
            ("tile_accounting", "GL", "journals"),
            ("tile_trade", "CO", "sales"),
            ("tile_payroll", "PR", "payroll_runs"),
            ("tile_assets", "FA", "fixed_assets"),
            ("tile_treasury", "TR", "treasury_movements"),
            ("tile_reconciliation", "RC", "reconciliation"),
            ("tile_cash_office", "CA", "registers"),
            ("tile_reports", "RP", "reports"),
        ]
        for index, (title_key, icon, page) in enumerate(tiles):
            card = tk.Frame(tiles_grid, bg=C["white"], highlightbackground=C["line"], highlightthickness=1, padx=16, pady=13, cursor="hand2")
            card.grid(row=index // 4, column=index % 4, sticky="nsew", padx=(0 if index % 4 == 0 else 9, 0), pady=5)
            tk.Label(card, text=icon, bg=C["teal_light"], fg=C["teal_dark"], font=("Segoe UI", 9, "bold"), padx=8, pady=5).pack(anchor="w")
            tk.Label(card, text=self._t(title_key), bg=C["white"], fg=C["text"], font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(10, 3))
            tk.Label(card, text=self._t(f"{title_key}_desc"), bg=C["white"], fg=C["muted"], font=("Segoe UI", 8), wraplength=230, justify="left").pack(anchor="w")
            tk.Label(card, text=self._t("tile_open"), bg=C["white"], fg=C["teal"], font=("Segoe UI", 8, "bold")).pack(anchor="w", pady=(10, 0))
            for widget in (card, *card.winfo_children()):
                widget.bind("<Button-1>", lambda _event, target=page: self.show_page(target))

        # stat strip
        stats = tk.Frame(content, bg=C["navy_2"], padx=18, pady=12)
        stats.grid(row=2, column=0, sticky="ew", pady=(0, 14))
        stat_items = [
            (self._t("dash_stat_headcount"), str(data.get("headcount", 0))),
            (self._t("dash_stat_assets"), money(data.get("asset_net_value", 0), self.currency)),
            (self._t("dash_stat_treasury"), money(data.get("treasury_net_mtd", 0), self.currency)),
            (self._t("dash_stat_unreconciled"), str(data.get("unreconciled_lines", 0))),
        ]
        for label, value in stat_items:
            box = tk.Frame(stats, bg=C["navy_2"])
            box.pack(side="left", padx=(0, 34))
            tk.Label(box, text=label, bg=C["navy_2"], fg="#b4c5cc", font=("Segoe UI", 8, "bold")).pack(anchor="w")
            tk.Label(box, text=value, bg=C["navy_2"], fg=C["white"], font=("Segoe UI", 12, "bold")).pack(anchor="w", pady=(2, 0))

        bottom = tk.Frame(content, bg=C["canvas"])
        bottom.grid(row=3, column=0, sticky="nsew")
        bottom.columnconfigure(0, weight=3)
        bottom.columnconfigure(1, weight=2)
        bottom.rowconfigure(0, weight=1)
        recent_panel = self._panel(bottom, self._t("dash_recent_title"), self._t("dash_recent_sub"), column=0)
        recent_columns = [
            ("posted_on", self._t("col_date"), 100, "w", short_date),
            ("reference", self._t("col_reference"), 120, "w", None),
            ("activity", self._t("col_activity"), 160, "w", None),
            ("party", self._t("col_party"), 220, "w", None),
            ("amount", self._t("col_amount"), 130, "e", lambda value: money(value, self.currency)),
        ]
        self._small_table(recent_panel, recent_columns, data["recent"], height=7)
        stock_panel = self._panel(bottom, self._t("dash_reorder_title"), self._t("dash_reorder_sub"), column=1, left_pad=14)
        stock_rows = data["low_stock_items"]
        stock_columns = [
            ("code", self._t("col_item"), 90, "w", None),
            ("name", self._t("col_description"), 180, "w", None),
            ("quantity", self._t("col_onhand"), 75, "e", None),
        ]
        self._small_table(stock_panel, stock_columns, stock_rows, height=7)
        if data["low_stock"]:
            tk.Label(stock_panel, text=self._t("dash_reorder_note", "{n} item(s) need a stock review.").format(n=data["low_stock"]), bg=C["white"], fg=C["amber"], font=("Segoe UI", 8, "bold")).pack(anchor="w", padx=15, pady=(0, 10))
        self._set_status(f"{data['customer_count']} {self._t('nav_customers').lower()}  ·  {data.get('headcount', 0)} {self._t('nav_employees').lower()}  ·  {self.currency}")

    def _panel(self, parent, title, subtitle, column=0, left_pad=0):
        panel = tk.Frame(parent, bg=C["white"], highlightbackground=C["line"], highlightthickness=1)
        panel.grid(row=0, column=column, sticky="nsew", padx=(left_pad, 0))
        tk.Label(panel, text=title, bg=C["white"], fg=C["text"], font=("Segoe UI", 11, "bold")).pack(anchor="w", padx=15, pady=(13, 0))
        tk.Label(panel, text=subtitle, bg=C["white"], fg=C["muted"], font=("Segoe UI", 8)).pack(anchor="w", padx=15, pady=(2, 10))
        return panel

    def _small_table(self, parent, columns, rows, height=6):
        frame = tk.Frame(parent, bg=C["white"])
        frame.pack(fill="both", expand=True, padx=12, pady=(0, 12))
        tree = ttk.Treeview(frame, columns=[col[0] for col in columns], show="headings", height=height)
        for key, title, width, anchor, _formatter in columns:
            tree.heading(key, text=title)
            tree.column(key, width=width, anchor=anchor, stretch=True)
        for index, row in enumerate(rows):
            values = []
            for key, _title, _width, _anchor, formatter in columns:
                value = row.get(key, "")
                values.append(formatter(value) if formatter else value)
            tree.insert("", "end", values=values, tags=("low" if row.get("quantity", 100) <= 5 else "",))
        tree.tag_configure("low", foreground=C["amber"])
        tree.pack(fill="both", expand=True)
        return tree

    def _table_page(self, page, columns, fetch, id_key="id", actions=(), on_open=None, row_tag=None, subtitle=None):
        title, default_subtitle = self._page_meta(page)
        content = self._start_page(page, actions)
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=1)
        searchbar = tk.Frame(content, bg=C["white"], padx=14, pady=12, highlightbackground=C["line"], highlightthickness=1)
        searchbar.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        tk.Label(searchbar, text=self._t("chrome_filter"), bg=C["white"], fg=C["muted"], font=("Segoe UI", 8, "bold")).pack(side="left", padx=(0, 10))
        search_var = tk.StringVar()
        entry = ttk.Entry(searchbar, textvariable=search_var, width=36)
        entry.pack(side="left")
        tk.Label(searchbar, text=self._t("chrome_filter_hint"), bg=C["white"], fg=C["muted"], font=("Segoe UI", 8)).pack(side="left", padx=12)
        self._count_var = tk.StringVar(value="")
        tk.Label(searchbar, textvariable=self._count_var, bg=C["white"], fg=C["muted"], font=("Segoe UI", 8, "bold")).pack(side="right")

        table_frame = tk.Frame(content, bg=C["white"], highlightbackground=C["line"], highlightthickness=1)
        table_frame.grid(row=1, column=0, sticky="nsew")
        table_frame.rowconfigure(0, weight=1)
        table_frame.columnconfigure(0, weight=1)
        tree = ttk.Treeview(table_frame, columns=[col[0] for col in columns], show="headings", selectmode="browse")
        for key, caption, width, anchor, formatter in columns:
            tree.heading(key, text=caption, command=lambda column=key: self._sort_tree(tree, column, False))
            tree.column(key, width=width, anchor=anchor, minwidth=60)
        tree.grid(row=0, column=0, sticky="nsew")
        yscroll = ttk.Scrollbar(table_frame, orient="vertical", command=tree.yview)
        yscroll.grid(row=0, column=1, sticky="ns")
        xscroll = ttk.Scrollbar(table_frame, orient="horizontal", command=tree.xview)
        xscroll.grid(row=1, column=0, sticky="ew")
        tree.configure(yscrollcommand=yscroll.set, xscrollcommand=xscroll.set)
        tree.tag_configure("odd", background="#f7f9fa")
        tree.tag_configure("warning", foreground=C["amber"])
        tree.tag_configure("inactive", foreground="#9aa6ac")
        tree.tag_configure("ok", foreground=C["green"])

        self._table = tree
        self._table_columns = columns
        self._table_title = title
        self._page_records = {}

        def reload(_value=None):
            try:
                records = fetch(search_var.get())
                self._page_records = {str(row.get(id_key, index)): row for index, row in enumerate(records)}
                tree.delete(*tree.get_children())
                for index, record in enumerate(records):
                    values = []
                    for key, _caption, _width, _anchor, formatter in columns:
                        value = record.get(key, "")
                        values.append(formatter(value) if formatter else ("—" if value is None else value))
                    tags = ["odd"] if index % 2 else []
                    if row_tag:
                        tag = row_tag(record)
                        if tag:
                            tags.append(tag)
                    iid = str(record.get(id_key, index))
                    tree.insert("", "end", iid=iid, values=values, tags=tuple(tags))
                self._count_var.set(f"{len(records)} record(s)")
                self._visible_records = records
            except Exception as error:
                self._set_status(f"Could not refresh {title.lower()}: {error}")
                messagebox.showerror(self._t("chrome_could_not_load"), str(error), parent=self.root)
        search_var.trace_add("write", reload)
        reload()
        tree.bind("<Double-1>", lambda _event: on_open(self._selected_record()) if on_open and self._selected_record() else None)
        self._new_action = next((command for label, command, _style in actions if label.lower().startswith(("new", "add", "enter", "receive", "post"))), None)
        self._set_status(default_subtitle if subtitle is None else subtitle)
        return tree

    def _sort_tree(self, tree, column, reverse):
        data = [(tree.set(item, column), item) for item in tree.get_children("")]
        def key(item):
            value = item[0]
            try:
                return (0, float(str(value).replace(",", "").replace(self.currency, "").strip()))
            except ValueError:
                return (1, str(value).casefold())
        for index, (_value, item) in enumerate(sorted(data, key=key, reverse=reverse)):
            tree.move(item, "", index)
        tree.heading(column, command=lambda: self._sort_tree(tree, column, not reverse))

    def _selected_record(self):
        if not self._table:
            return None
        selected = self._table.selection()
        if not selected:
            return None
        return self._page_records.get(selected[0])

    def _require_selection(self, label="record"):
        record = self._selected_record()
        if not record:
            messagebox.showinfo(self._t("chrome_select_row_title"), self._t("chrome_select_row_body", "Select a {label} from the table first.").format(label=label), parent=self.root)
        return record

    def _export_table(self):
        if not self._table:
            return
        path = filedialog.asksaveasfilename(
            parent=self.root, title=self._t("chrome_export_title"), defaultextension=".csv",
            filetypes=(("CSV files", "*.csv"), ("All files", "*.*")),
            initialfile=f"{self._table_title.lower().replace(' ', '_')}.csv",
        )
        if not path:
            return
        try:
            with open(path, "w", newline="", encoding="utf-8-sig") as output:
                writer = csv.writer(output)
                writer.writerow([column[1] for column in self._table_columns])
                for item in self._table.get_children(""):
                    writer.writerow(self._table.item(item, "values"))
            self._set_status(self._t("chrome_exported", "Exported {title} to CSV").format(title=self._table_title))
        except OSError as error:
            messagebox.showerror("Export failed", str(error), parent=self.root)

    def _render_customers(self):
        actions = [
            ("New customer", self._new_customer, "Primary.TButton"),
            (self._t("chrome_edit"), self._edit_customer, "TButton"),
            (self._t("chrome_delete"), self._delete_customer, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("id", self._t("col_cust_id"), 90, "e", lambda value: f"CUS-{int(value):05d}"),
            ("name", self._t("col_cust_name"), 270, "w", None),
            ("phone", self._t("col_cust_phone"), 170, "w", None),
            ("invoice_count", self._t("col_cust_invoices"), 100, "e", None),
            ("lifetime_sales", self._t("col_cust_sales"), 160, "e", lambda value: money(value, self.currency)),
        ]
        self._table_page("customers", columns, self.repository.list_customers, actions=actions, on_open=lambda _row: self._edit_customer())
        self._new_action = self._new_customer

    def _render_suppliers(self):
        actions = [
            ("New supplier", self._new_supplier, "Primary.TButton"),
            (self._t("chrome_edit"), self._edit_supplier, "TButton"),
            (self._t("chrome_delete"), self._delete_supplier, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("id", self._t("col_sup_id"), 90, "e", lambda value: f"SUP-{int(value):05d}"),
            ("name", self._t("col_sup_name"), 280, "w", None),
            ("phone", self._t("col_sup_phone"), 170, "w", None),
            ("invoice_count", self._t("col_sup_invoices"), 100, "e", None),
            ("lifetime_purchases", self._t("col_sup_purchases"), 170, "e", lambda value: money(value, self.currency)),
        ]
        self._table_page("suppliers", columns, self.repository.list_suppliers, actions=actions, on_open=lambda _row: self._edit_supplier())
        self._new_action = self._new_supplier

    def _render_inventory(self):
        actions = [
            ("New item", self._new_product, "Primary.TButton"),
            (self._t("chrome_edit"), self._edit_product, "TButton"),
            (self._t("chrome_physical_count"), self._new_inventory_adjustment, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("code", self._t("col_inv_code"), 125, "w", None),
            ("name", self._t("col_inv_desc"), 260, "w", None),
            ("cost_price", self._t("col_inv_cost"), 130, "e", lambda value: money(value, self.currency)),
            ("price", self._t("col_inv_price"), 130, "e", lambda value: money(value, self.currency)),
            ("unit_margin", self._t("col_inv_margin"), 130, "e", lambda value: money(value, self.currency)),
            ("quantity", self._t("col_inv_qty"), 90, "e", None),
            ("stock_status", self._t("col_inv_status"), 110, "w", None),
        ]
        self._table_page("inventory", columns, self.repository.list_products, actions=actions, on_open=lambda _row: self._edit_product(), row_tag=lambda row: "warning" if int(row["quantity"] or 0) <= 5 else None)
        self._new_action = self._new_product

    def _render_adjustments(self):
        actions = [
            (self._t("chrome_physical_count"), self._new_inventory_adjustment, "Primary.TButton"),
            (self._t("chrome_refresh"), self.refresh_page, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("id", self._t("col_adj_id"), 110, "e", lambda value: f"ADJ-{int(value):05d}"),
            ("adjustment_date", self._t("col_adj_date"), 160, "w", None),
            ("product_code", self._t("col_adj_code"), 120, "w", None),
            ("product_name", self._t("col_adj_name"), 230, "w", None),
            ("old_quantity", self._t("col_adj_old"), 100, "e", None),
            ("new_quantity", self._t("col_adj_new"), 100, "e", None),
            ("difference", self._t("col_adj_diff"), 95, "e", lambda value: f"{int(value):+d}"),
            ("value_difference", self._t("col_adj_value"), 145, "e", lambda value: money(value, self.currency)),
        ]
        self._table_page("adjustments", columns, lambda _search: self.repository.list_inventory_adjustments(), actions=actions)
        self._new_action = self._new_inventory_adjustment

    def _render_sales(self):
        actions = [
            (self._t("chrome_new_sale"), self._new_sale, "Primary.TButton"),
            (self._t("chrome_view"), self._view_sale, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("invoice", self._t("col_doc_inv"), 130, "w", None),
            ("sale_date", self._t("col_doc_date"), 155, "w", short_date),
            ("customer", self._t("col_doc_counterparty"), 240, "w", None),
            ("payment_method", self._t("col_doc_method"), 175, "w", None),
            ("total", self._t("col_doc_total"), 150, "e", lambda value: money(value, self.currency)),
            ("status", self._t("col_doc_status"), 110, "w", None),
        ]
        self._table_page("sales", columns, self.repository.list_sales, actions=actions, on_open=lambda _row: self._view_sale())
        self._new_action = self._new_sale

    def _render_purchases(self):
        actions = [
            (self._t("chrome_new_purchase"), self._new_purchase, "Primary.TButton"),
            (self._t("chrome_view"), self._view_purchase, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("invoice", self._t("col_doc_inv"), 130, "w", None),
            ("purchase_date", self._t("col_doc_date"), 155, "w", short_date),
            ("supplier", self._t("col_doc_counterparty"), 240, "w", None),
            ("payment_method", self._t("col_doc_method"), 175, "w", None),
            ("total", self._t("col_doc_total"), 150, "e", lambda value: money(value, self.currency)),
            ("status", self._t("col_doc_status"), 110, "w", None),
        ]
        self._table_page("purchases", columns, self.repository.list_purchases, actions=actions, on_open=lambda _row: self._view_purchase())
        self._new_action = self._new_purchase

    def _render_payments(self):
        actions = [
            (self._t("dash_quick_payment"), lambda: self._new_payment("customer"), "Primary.TButton"),
            (self._t("dash_quick_supplier"), lambda: self._new_payment("supplier"), "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("reference", self._t("col_reference"), 125, "w", None),
            ("payment_date", self._t("col_pay_date"), 150, "w", short_date),
            ("payment_type", self._t("col_pay_type"), 155, "w", lambda value: self._t("dash_quick_payment") if value == "customer" else self._t("dash_quick_supplier")),
            ("party", self._t("col_party"), 230, "w", None),
            ("payment_method", self._t("col_pay_method"), 140, "w", None),
            ("amount", self._t("col_amount"), 150, "e", lambda value: money(value, self.currency)),
            ("description", self._t("col_pay_memo"), 220, "w", None),
        ]
        self._table_page("payments", columns, self.repository.list_payments, actions=actions)
        self._new_action = lambda: self._new_payment("customer")

    def _render_accounts(self):
        actions = [
            (self._t("chrome_add_account"), self._new_account, "Primary.TButton"),
            (self._t("chrome_toggle_account"), self._toggle_account, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("account_code", self._t("col_acct_code"), 125, "w", None),
            ("account_name", self._t("col_acct_name"), 260, "w", None),
            ("account_type", self._t("col_acct_type"), 130, "w", None),
            ("total_debit", self._t("col_acct_debit"), 150, "e", lambda value: money(value, self.currency)),
            ("total_credit", self._t("col_acct_credit"), 150, "e", lambda value: money(value, self.currency)),
            ("is_active", self._t("col_acct_status"), 110, "w", lambda value: self._t("status_active") if value else self._t("status_inactive")),
        ]
        self._table_page("accounts", columns, lambda search: self.repository.list_accounts(search), id_key="id", actions=actions, row_tag=lambda row: None if row["is_active"] else "inactive")
        self._new_action = self._new_account

    def _render_journals(self):
        actions = [
            (self._t("chrome_new_journal"), self._new_journal, "Primary.TButton"),
            (self._t("chrome_view_entry"), self._view_journal, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("entry_date", self._t("col_date"), 140, "w", None),
            ("reference", self._t("col_je_ref"), 150, "w", None),
            ("description", self._t("col_description"), 320, "w", None),
            ("total_debit", self._t("col_je_debit"), 150, "e", lambda value: money(value, self.currency)),
            ("total_credit", self._t("col_je_credit"), 150, "e", lambda value: money(value, self.currency)),
        ]
        self._table_page("journals", columns, self.repository.list_journal_entries, actions=actions, on_open=lambda _row: self._view_journal())
        self._new_action = self._new_journal

    def _render_ledger(self):
        content = self._start_page("ledger", [(self._t("chrome_export_csv"), self._export_table, "TButton")])
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=1)
        filters = tk.Frame(content, bg=C["white"], padx=14, pady=12, highlightbackground=C["line"], highlightthickness=1)
        filters.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        accounts = self.repository.list_accounts()
        self._account_map = {f"{row['account_code']} · {row['account_name']}": row["account_code"] for row in accounts}
        self.ledger_account_var = tk.StringVar(value=next(iter(self._account_map), ""))
        ttk.Label(filters, text=self._t("chrome_account")).pack(side="left", padx=(0, 7))
        account_combo = ttk.Combobox(filters, textvariable=self.ledger_account_var, values=list(self._account_map), state="readonly", width=37)
        account_combo.pack(side="left", padx=(0, 16))
        self.ledger_start_var = tk.StringVar(value=date.today().replace(day=1).isoformat())
        self.ledger_end_var = tk.StringVar(value=date.today().isoformat())
        ttk.Label(filters, text=self._t("chrome_from")).pack(side="left", padx=(0, 7))
        ttk.Entry(filters, textvariable=self.ledger_start_var, width=13).pack(side="left", padx=(0, 14))
        ttk.Label(filters, text=self._t("chrome_through")).pack(side="left", padx=(0, 7))
        ttk.Entry(filters, textvariable=self.ledger_end_var, width=13).pack(side="left", padx=(0, 14))
        ttk.Button(filters, text=self._t("chrome_ledger_inquiry"), style="Primary.TButton", command=self._load_ledger).pack(side="left")
        self.ledger_summary_var = tk.StringVar(value="")
        ttk.Label(filters, textvariable=self.ledger_summary_var, style="Muted.TLabel").pack(side="right", padx=(12, 0))
        frame = tk.Frame(content, bg=C["white"], highlightbackground=C["line"], highlightthickness=1)
        frame.grid(row=1, column=0, sticky="nsew")
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)
        columns = [
            ("entry_date", self._t("col_date"), 135, "w", None),
            ("reference", self._t("col_reference"), 160, "w", None),
            ("description", self._t("col_description"), 320, "w", None),
            ("debit", self._t("col_gl_debit"), 145, "e", lambda value: money(value, self.currency)),
            ("credit", self._t("col_gl_credit"), 145, "e", lambda value: money(value, self.currency)),
            ("balance", self._t("col_gl_balance"), 160, "e", lambda value: money(value, self.currency)),
        ]
        self.ledger_tree = self._create_tree(frame, columns)
        self._table_columns = columns
        self._table_title = self._page_title
        self._table = self.ledger_tree
        account_combo.bind("<<ComboboxSelected>>", lambda _event: self._load_ledger())
        if self.ledger_account_var.get():
            self._load_ledger()
        self._new_action = None

    def _create_tree(self, frame, columns, height=18):
        tree = ttk.Treeview(frame, columns=[col[0] for col in columns], show="headings", height=height)
        for key, caption, width, anchor, _formatter in columns:
            tree.heading(key, text=caption, command=lambda column=key: self._sort_tree(tree, column, False))
            tree.column(key, width=width, anchor=anchor, minwidth=60)
        tree.grid(row=0, column=0, sticky="nsew")
        scrollbar = ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        xscroll = ttk.Scrollbar(frame, orient="horizontal", command=tree.xview)
        xscroll.grid(row=1, column=0, sticky="ew")
        tree.configure(yscrollcommand=scrollbar.set, xscrollcommand=xscroll.set)
        return tree

    def _load_ledger(self):
        if not self.ledger_account_var.get():
            return
        code = self._account_map.get(self.ledger_account_var.get())
        try:
            account, opening, rows = self.repository.general_ledger(code, self.ledger_start_var.get(), self.ledger_end_var.get())
            if not account:
                return
            self.ledger_tree.delete(*self.ledger_tree.get_children())
            for index, row in enumerate(rows):
                values = [row["entry_date"], row["reference"] or "—", row["description"] or row["journal_description"] or "—", money(row["debit"], self.currency) if row["debit"] else "—", money(row["credit"], self.currency) if row["credit"] else "—", money(row["balance"], self.currency)]
                self.ledger_tree.insert("", "end", values=values, tags=("odd" if index % 2 else "",))
            ending = rows[-1]["balance"] if rows else opening
            self.ledger_summary_var.set(f"Opening {money(opening, self.currency)}   ·   Ending {money(ending, self.currency)}   ·   {len(rows)} lines")
            self._visible_records = rows
        except Exception as error:
            messagebox.showerror("Ledger inquiry failed", str(error), parent=self.root)

    # -------------------------
    # Payroll & HR (Paie & GRH)
    # -------------------------
    def _render_employees(self):
        actions = [
            (self._t("chrome_new_employee"), self._new_employee, "Primary.TButton"),
            (self._t("chrome_edit_employee"), self._edit_employee, "TButton"),
            (self._t("chrome_toggle_employee"), self._toggle_employee, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("employee_code", self._t("col_emp_code"), 110, "w", None),
            ("name", self._t("col_emp_name"), 250, "w", None),
            ("role", self._t("col_emp_role"), 200, "w", None),
            ("base_salary", self._t("col_emp_salary"), 150, "e", lambda value: money(value, self.currency)),
            ("hire_date", self._t("col_emp_hire"), 120, "w", None),
            ("payslip_count", self._t("col_emp_payslips"), 100, "e", None),
            ("is_active", self._t("col_emp_status"), 100, "w", lambda value: self._t("status_active") if value else self._t("status_inactive")),
        ]
        self._table_page("employees", columns, self.repository.list_employees, id_key="id", actions=actions, row_tag=lambda row: None if row["is_active"] else "inactive")
        self._new_action = self._new_employee

    def _render_payroll_runs(self):
        actions = [
            (self._t("chrome_run_payroll"), self._run_payroll, "Primary.TButton"),
            (self._t("chrome_view_payslips"), self._view_payslips, "TButton"),
            (self._t("chrome_refresh"), self.refresh_page, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("id", self._t("col_pr_id"), 90, "e", lambda value: f"PR-{int(value):05d}"),
            ("period_start", self._t("col_pr_start"), 125, "w", None),
            ("period_end", self._t("col_pr_end"), 125, "w", None),
            ("run_date", self._t("col_pr_run"), 120, "w", None),
            ("employee_count", self._t("col_pr_count"), 100, "e", None),
            ("total_base", self._t("col_pr_base"), 150, "e", lambda value: money(value, self.currency)),
            ("total_allowances", self._t("col_pr_allow"), 135, "e", lambda value: money(value, self.currency)),
            ("total_deductions", self._t("col_pr_ded"), 135, "e", lambda value: money(value, self.currency)),
            ("total_net", self._t("col_pr_net"), 150, "e", lambda value: money(value, self.currency)),
        ]
        self._table_page("payroll_runs", columns, lambda _search: self.repository.list_payroll_runs(), actions=actions, on_open=lambda _row: self._view_payslips())
        self._new_action = self._run_payroll

    # -------------------------
    # Fixed assets (Immobilisations)
    # -------------------------
    def _render_fixed_assets(self):
        actions = [
            (self._t("chrome_new_asset"), self._new_asset, "Primary.TButton"),
            (self._t("chrome_edit_asset"), self._edit_asset, "TButton"),
            (self._t("chrome_post_depreciation"), self._post_depreciation, "TButton"),
            (self._t("chrome_toggle_asset"), self._toggle_asset, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("asset_code", self._t("col_fa_code"), 110, "w", None),
            ("name", self._t("col_fa_name"), 240, "w", None),
            ("category", self._t("col_fa_cat"), 140, "w", None),
            ("acquisition_date", self._t("col_fa_date"), 120, "w", None),
            ("acquisition_cost", self._t("col_fa_cost"), 145, "e", lambda value: money(value, self.currency)),
            ("accumulated_depreciation", self._t("col_fa_acc"), 145, "e", lambda value: money(value, self.currency)),
            ("net_book_value", self._t("col_fa_nbv"), 150, "e", lambda value: money(value, self.currency)),
            ("is_active", self._t("col_fa_status"), 100, "w", lambda value: self._t("status_active") if value else self._t("status_inactive")),
        ]
        self._table_page("fixed_assets", columns, self.repository.list_assets, id_key="id", actions=actions, row_tag=lambda row: None if row["is_active"] else "inactive")
        self._new_action = self._new_asset

    def _render_depreciation(self):
        actions = [
            (self._t("chrome_refresh"), self.refresh_page, "Primary.TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("asset_code", self._t("col_dp_asset"), 110, "w", None),
            ("asset_name", self._t("col_dp_name"), 260, "w", None),
            ("period_year", self._t("col_dp_year"), 90, "e", None),
            ("posted_date", self._t("col_dp_posted"), 130, "w", None),
            ("amount", self._t("col_dp_amount"), 150, "e", lambda value: money(value, self.currency)),
            ("cumulative", self._t("col_dp_cum"), 150, "e", lambda value: money(value, self.currency)),
        ]
        self._table_page("depreciation", columns, self.repository.list_depreciation)
        self._new_action = None

    # -------------------------
    # Treasury (Trésorerie)
    # -------------------------
    def _render_bank_accounts(self):
        actions = [
            (self._t("chrome_new_bank_account"), self._new_bank_account, "Primary.TButton"),
            (self._t("chrome_edit_bank_account"), self._edit_bank_account, "TButton"),
            (self._t("chrome_toggle_bank_account"), self._toggle_bank_account, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("id", self._t("col_ba_id"), 90, "e", None),
            ("account_name", self._t("col_ba_name"), 240, "w", None),
            ("bank_name", self._t("col_ba_bank"), 200, "w", None),
            ("account_number", self._t("col_ba_number"), 180, "w", None),
            ("opening_balance", self._t("col_ba_open"), 145, "e", lambda value: money(value, self.currency)),
            ("net_movements", self._t("col_ba_net"), 145, "e", lambda value: money(value, self.currency)),
            ("current_balance", self._t("col_ba_cur"), 150, "e", lambda value: money(value, self.currency)),
            ("is_active", self._t("col_ba_status"), 100, "w", lambda value: self._t("status_active") if value else self._t("status_inactive")),
        ]
        self._table_page("bank_accounts", columns, self.repository.list_bank_accounts, id_key="id", actions=actions, row_tag=lambda row: None if row["is_active"] else "inactive")
        self._new_action = self._new_bank_account

    def _render_treasury_movements(self):
        actions = [
            (self._t("chrome_new_movement"), self._new_treasury_movement, "Primary.TButton"),
            (self._t("chrome_refresh"), self.refresh_page, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("reference", self._t("col_reference"), 125, "w", None),
            ("movement_date", self._t("col_date"), 130, "w", short_date),
            ("account_name", self._t("col_tm_account"), 220, "w", None),
            ("direction", self._t("col_tm_dir"), 110, "w", lambda value: self._t("value_in") if value == "in" else self._t("value_out")),
            ("amount", self._t("col_amount"), 150, "e", lambda value: money(value, self.currency)),
            ("description", self._t("col_description"), 260, "w", None),
        ]
        self._table_page("treasury_movements", columns, self.repository.list_cash_movements, actions=actions)
        self._new_action = self._new_treasury_movement

    # -------------------------
    # Bank reconciliation (Rapprochement)
    # -------------------------
    def _render_reconciliation(self):
        actions = [
            (self._t("chrome_add_line"), self._new_statement_line, "Primary.TButton"),
            (self._t("chrome_reconcile"), self._reconcile_line, "TButton"),
            (self._t("chrome_unreconcile"), self._unreconcile_line, "TButton"),
            (self._t("chrome_delete"), self._delete_statement_line, "TButton"),
            (self._t("view_reconciliation_summary", "Reconciliation summary"), self._view_reconciliation_summary, "TButton"),
            (self._t("chrome_refresh"), self.refresh_page, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("id", self._t("col_rc_id"), 80, "e", None),
            ("statement_date", self._t("col_date"), 125, "w", None),
            ("account_name", self._t("col_tm_account"), 200, "w", None),
            ("reference", self._t("col_rc_ref"), 200, "w", None),
            ("description", self._t("col_description"), 220, "w", None),
            ("direction", self._t("col_tm_dir"), 105, "w", lambda value: self._t("value_in") if value == "in" else self._t("value_out")),
            ("amount", self._t("col_amount"), 145, "e", lambda value: money(value, self.currency)),
            ("is_reconciled", self._t("col_rc_status"), 115, "w", lambda value: self._t("status_reconciled") if value else self._t("status_unreconciled")),
            ("matched_reference", self._t("col_rc_matched"), 125, "w", None),
        ]
        self._table_page("reconciliation", columns, lambda search: self.repository.list_statement_lines(search), actions=actions, row_tag=lambda row: "ok" if row["is_reconciled"] else None)
        self._new_action = self._new_statement_line

    def _view_reconciliation_summary(self):
        try:
            summary = self.repository.reconciliation_summary()
        except Exception as error:
            messagebox.showerror(self._t("view_reconciliation_summary", "Reconciliation summary"), str(error), parent=self.root)
            return
        lines = [
            (self._t("rc_book"), money(summary["book_balance"], self.currency)),
            (self._t("rc_statement"), money(summary["statement_balance"], self.currency)),
            (self._t("rc_diff"), money(summary["difference"], self.currency)),
            (self._t("rc_recon_count"), str(summary["reconciled_count"])),
            (self._t("reconciled_amount", "Reconciled amount"), money(summary["reconciled_amount"], self.currency)),
        ]
        text = "\n".join(f"{label:<24} {value}" for label, value in lines)
        messagebox.showinfo(self._t("view_reconciliation_summary", "Reconciliation summary"), text, parent=self.root)

    # -------------------------
    # Cash office (Moyens de paiement)
    # -------------------------
    def _render_registers(self):
        actions = [
            (self._t("chrome_new_register"), self._new_register, "Primary.TButton"),
            (self._t("chrome_edit_register"), self._edit_register, "TButton"),
            (self._t("chrome_close_register"), self._close_register, "TButton"),
            (self._t("chrome_toggle_register"), self._toggle_register, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("id", self._t("col_rg_id"), 90, "e", None),
            ("register_name", self._t("col_rg_name"), 260, "w", None),
            ("opening_balance", self._t("col_rg_float"), 150, "e", lambda value: money(value, self.currency)),
            ("expected_cash", self._t("col_rg_expected"), 160, "e", lambda value: money(value, self.currency)),
            ("is_active", self._t("col_rg_status"), 100, "w", lambda value: self._t("status_active") if value else self._t("status_inactive")),
        ]
        self._table_page("registers", columns, self.repository.list_registers, id_key="id", actions=actions, row_tag=lambda row: None if row["is_active"] else "inactive")
        self._new_action = self._new_register

    def _render_register_movements(self):
        actions = [
            (self._t("chrome_new_movement"), self._new_register_movement, "Primary.TButton"),
            (self._t("chrome_refresh"), self.refresh_page, "TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("id", self._t("col_rm_id"), 90, "e", None),
            ("movement_date", self._t("col_date"), 130, "w", short_date),
            ("register_name", self._t("col_rm_register"), 220, "w", None),
            ("direction", self._t("col_rm_dir"), 110, "w", lambda value: self._t("value_in") if value == "in" else self._t("value_out")),
            ("amount", self._t("col_amount"), 150, "e", lambda value: money(value, self.currency)),
            ("description", self._t("col_description"), 280, "w", None),
        ]
        self._table_page("register_movements", columns, self.repository.list_register_movements)
        self._new_action = self._new_register_movement

    def _render_register_closings(self):
        actions = [
            (self._t("chrome_refresh"), self.refresh_page, "Primary.TButton"),
            (self._t("chrome_export_csv"), self._export_table, "TButton"),
        ]
        columns = [
            ("id", self._t("col_rcl_id"), 90, "e", None),
            ("closing_date", self._t("col_date"), 130, "w", None),
            ("register_name", self._t("col_rcl_register"), 240, "w", None),
            ("expected_amount", self._t("col_rcl_expected"), 160, "e", lambda value: money(value, self.currency)),
            ("actual_amount", self._t("col_rcl_actual"), 160, "e", lambda value: money(value, self.currency)),
            ("difference", self._t("col_rcl_diff"), 140, "e", lambda value: f"{float(value or 0):+,.2f}"),
        ]
        self._table_page("register_closings", columns, self.repository.list_register_closings, row_tag=lambda row: "warning" if abs(float(row.get("difference") or 0)) >= 0.005 else None)
        self._new_action = None

    # -------------------------
    # Reports & statements (unchanged logic, translated chrome)
    # -------------------------
    def _render_trial_balance(self):
        actions = [(self._t("chrome_export_csv"), self._export_table, "TButton")]
        content = self._start_page("trial_balance", actions)
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=1)
        control = tk.Frame(content, bg=C["white"], padx=14, pady=12, highlightbackground=C["line"], highlightthickness=1)
        control.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        ttk.Label(control, text=self._t("chrome_as_of_date")).pack(side="left", padx=(0, 10))
        self.trial_date_var = tk.StringVar(value=date.today().isoformat())
        ttk.Entry(control, textvariable=self.trial_date_var, width=16).pack(side="left", padx=(0, 12))
        ttk.Button(control, text=self._t("chrome_refresh_statement"), style="Primary.TButton", command=self._load_trial_balance).pack(side="left")
        self.trial_totals_var = tk.StringVar(value="")
        ttk.Label(control, textvariable=self.trial_totals_var, style="Muted.TLabel").pack(side="right")
        table = tk.Frame(content, bg=C["white"], highlightbackground=C["line"], highlightthickness=1)
        table.grid(row=1, column=0, sticky="nsew")
        table.rowconfigure(0, weight=1)
        table.columnconfigure(0, weight=1)
        columns = [
            ("account_code", self._t("col_acct_code"), 125, "w", None),
            ("account_name", self._t("col_acct_name"), 260, "w", None),
            ("account_type", self._t("col_acct_type"), 130, "w", None),
            ("debit", self._t("col_je_debit"), 170, "e", lambda value: money(value, self.currency)),
            ("credit", self._t("col_je_credit"), 170, "e", lambda value: money(value, self.currency)),
            ("balance", self._t("col_tb_balance"), 170, "e", lambda value: money(value, self.currency)),
        ]
        self.trial_tree = self._create_tree(table, columns)
        self._table_columns, self._table, self._table_title = columns, self.trial_tree, self._page_title
        self.trial_tree.tag_configure("total", background=C["teal_light"], font=("Segoe UI", 9, "bold"))
        self._load_trial_balance()

    def _load_trial_balance(self):
        try:
            rows = self.repository.trial_balance(self.trial_date_var.get())
            self.trial_tree.delete(*self.trial_tree.get_children())
            debit_total = sum(float(row["debit"] or 0) for row in rows)
            credit_total = sum(float(row["credit"] or 0) for row in rows)
            for index, row in enumerate(rows):
                values = [row["account_code"], row["account_name"], row["account_type"], money(row["debit"], self.currency), money(row["credit"], self.currency), money(row["balance"], self.currency)]
                self.trial_tree.insert("", "end", iid=f"row-{index}", values=values, tags=("odd" if index % 2 else "",))
            balanced = abs(debit_total - credit_total) < 0.01
            self.trial_tree.insert("", "end", iid="total-row", values=("", "TOTAL", "Balanced" if balanced else "Out of balance", money(debit_total, self.currency), money(credit_total, self.currency), ""), tags=("total",))
            self.trial_totals_var.set(f"{len(rows)} accounts   ·   {'Debits equal credits' if balanced else 'Difference ' + money(debit_total - credit_total, self.currency)}")
            self._visible_records = rows
            self._set_status(self._t("chrome_refresh", "Refresh") + " ✓")
        except Exception as error:
            messagebox.showerror("Trial balance failed", str(error), parent=self.root)

    def _render_income_statement(self):
        actions = [(self._t("chrome_export_csv"), self._export_table, "TButton")]
        content = self._start_page("income_statement", actions)
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=1)
        control = tk.Frame(content, bg=C["white"], padx=14, pady=12, highlightbackground=C["line"], highlightthickness=1)
        control.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        start = date.today().replace(month=1, day=1).isoformat()
        self.pl_start_var, self.pl_end_var = tk.StringVar(value=start), tk.StringVar(value=date.today().isoformat())
        ttk.Label(control, text=self._t("chrome_from")).pack(side="left", padx=(0, 7))
        ttk.Entry(control, textvariable=self.pl_start_var, width=14).pack(side="left", padx=(0, 15))
        ttk.Label(control, text=self._t("chrome_through")).pack(side="left", padx=(0, 7))
        ttk.Entry(control, textvariable=self.pl_end_var, width=14).pack(side="left", padx=(0, 15))
        ttk.Button(control, text=self._t("chrome_run_statement"), style="Primary.TButton", command=self._load_income_statement).pack(side="left")
        self.pl_summary_var = tk.StringVar()
        ttk.Label(control, textvariable=self.pl_summary_var, style="Muted.TLabel").pack(side="right")
        table = tk.Frame(content, bg=C["white"], highlightbackground=C["line"], highlightthickness=1)
        table.grid(row=1, column=0, sticky="nsew")
        table.rowconfigure(0, weight=1)
        table.columnconfigure(0, weight=1)
        columns = [("account_code", self._t("col_acct_code"), 130, "w", None), ("account_name", self._t("col_acct_name"), 300, "w", None), ("account_type", self._t("col_pl_class"), 160, "w", None), ("amount", self._t("col_pl_amount"), 190, "e", lambda value: money(value, self.currency))]
        self.pl_tree = self._create_tree(table, columns)
        self._table_columns, self._table, self._table_title = columns, self.pl_tree, self._page_title
        self._load_income_statement()

    def _load_income_statement(self):
        try:
            rows, revenue, expenses, net = self.repository.profit_loss(self.pl_start_var.get(), self.pl_end_var.get())
            rows = [row for row in rows if abs(row["amount"]) > 0.0001]
            self.pl_tree.delete(*self.pl_tree.get_children())
            for index, row in enumerate(rows):
                self.pl_tree.insert("", "end", values=(row["account_code"], row["account_name"], row["account_type"], money(row["amount"], self.currency)), tags=("odd" if index % 2 else "",))
            result_label = "Net income" if net >= 0 else "Net loss"
            self.pl_summary_var.set(f"Revenue {money(revenue, self.currency)}   ·   Expenses {money(expenses, self.currency)}   ·   {result_label} {money(abs(net), self.currency)}")
            self._visible_records = rows
            self._set_status(self._t("chrome_refresh", "Refresh") + " ✓")
        except Exception as error:
            messagebox.showerror("Income statement failed", str(error), parent=self.root)

    def _render_balance_sheet(self):
        actions = [(self._t("chrome_export_csv"), self._export_table, "TButton")]
        content = self._start_page("balance_sheet", actions)
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=1)
        control = tk.Frame(content, bg=C["white"], padx=14, pady=12, highlightbackground=C["line"], highlightthickness=1)
        control.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        ttk.Label(control, text=self._t("chrome_as_of_date")).pack(side="left", padx=(0, 10))
        self.bs_date_var = tk.StringVar(value=date.today().isoformat())
        ttk.Entry(control, textvariable=self.bs_date_var, width=16).pack(side="left", padx=(0, 12))
        ttk.Button(control, text=self._t("chrome_refresh_statement"), style="Primary.TButton", command=self._load_balance_sheet).pack(side="left")
        self.bs_summary_var = tk.StringVar()
        ttk.Label(control, textvariable=self.bs_summary_var, style="Muted.TLabel").pack(side="right")
        table = tk.Frame(content, bg=C["white"], highlightbackground=C["line"], highlightthickness=1)
        table.grid(row=1, column=0, sticky="nsew")
        table.rowconfigure(0, weight=1)
        table.columnconfigure(0, weight=1)
        columns = [("account_type", self._t("col_bs_section"), 145, "w", None), ("account_code", self._t("col_acct_code"), 130, "w", None), ("account_name", self._t("col_acct_name"), 340, "w", None), ("amount", self._t("col_bs_balance"), 190, "e", lambda value: money(value, self.currency))]
        self.bs_tree = self._create_tree(table, columns)
        self._table_columns, self._table, self._table_title = columns, self.bs_tree, self._page_title
        self._load_balance_sheet()

    def _load_balance_sheet(self):
        try:
            rows, totals = self.repository.balance_sheet(self.bs_date_var.get())
            self.bs_tree.delete(*self.bs_tree.get_children())
            for index, row in enumerate(rows):
                self.bs_tree.insert("", "end", values=(row["account_type"], row["account_code"], row["account_name"], money(row["amount"], self.currency)), tags=("odd" if index % 2 else "",))
            for label, account_type, amount in (
                ("Total assets", "Asset", totals["Asset"]),
                ("Total liabilities", "Liability", totals["Liability"]),
                ("Equity + current earnings", "Equity", totals["Liabilities and equity"] - totals["Liability"]),
            ):
                self.bs_tree.insert("", "end", values=(account_type.upper(), "", label, money(amount, self.currency)), tags=("total",))
            difference = totals["Asset"] - totals["Liabilities and equity"]
            self.bs_summary_var.set(f"Assets {money(totals['Asset'], self.currency)}   ·   Liabilities & equity {money(totals['Liabilities and equity'], self.currency)}   ·   {'Balanced' if abs(difference) < 0.01 else 'Difference ' + money(difference, self.currency)}")
            self._visible_records = rows
            self._set_status(self._t("chrome_refresh", "Refresh") + " ✓")
        except Exception as error:
            messagebox.showerror("Balance sheet failed", str(error), parent=self.root)

    def _render_reports(self):
        data = self.repository.dashboard()
        content = self._start_page("reports")
        content.columnconfigure(0, weight=1)
        for column in range(3):
            content.columnconfigure(column, weight=1)
        tiles = [
            (self._t("nav_ledger"), self._t("page_sub_ledger"), "ledger", "GL"),
            (self._t("nav_trial_balance"), self._t("page_sub_trial_balance"), "trial_balance", "TB"),
            (self._t("nav_income_statement"), self._t("page_sub_income_statement"), "income_statement", "IS"),
            (self._t("nav_balance_sheet"), self._t("page_sub_balance_sheet"), "balance_sheet", "BS"),
            (self._t("nav_sales"), self._t("page_sub_sales"), "sales", "AR"),
            (self._t("nav_purchases"), self._t("page_sub_purchases"), "purchases", "AP"),
            (self._t("nav_payments"), self._t("page_sub_payments"), "payments", "CM"),
            (self._t("nav_inventory"), self._t("page_sub_inventory"), "inventory", "IV"),
            (self._t("nav_adjustments"), self._t("page_sub_adjustments"), "adjustments", "AD"),
        ]
        for index, (title, detail, page, icon) in enumerate(tiles):
            card = tk.Frame(content, bg=C["white"], highlightbackground=C["line"], highlightthickness=1, padx=18, pady=16, cursor="hand2")
            card.grid(row=index // 3, column=index % 3, sticky="nsew", padx=(0 if index % 3 == 0 else 10, 0), pady=(0, 11))
            tk.Label(card, text=icon, bg=C["teal_light"], fg=C["teal_dark"], font=("Segoe UI", 9, "bold"), padx=8, pady=6).pack(anchor="w")
            tk.Label(card, text=title, bg=C["white"], fg=C["text"], font=("Segoe UI", 11, "bold")).pack(anchor="w", pady=(12, 4))
            tk.Label(card, text=detail, bg=C["white"], fg=C["muted"], font=("Segoe UI", 8), wraplength=250, justify="left").pack(anchor="w")
            tk.Label(card, text=self._t("tile_open").replace("module", "report"), bg=C["white"], fg=C["teal"], font=("Segoe UI", 8, "bold")).pack(anchor="w", pady=(13, 0))
            for widget in (card, *card.winfo_children()):
                widget.bind("<Button-1>", lambda _event, target=page: self.show_page(target))
        summary = tk.Frame(content, bg=C["navy_2"], padx=20, pady=17)
        summary.grid(row=3, column=0, columnspan=3, sticky="ew", pady=(5, 0))
        tk.Label(summary, text="PERIOD SNAPSHOT", bg=C["navy_2"], fg="#b4c5cc", font=("Segoe UI", 8, "bold")).pack(anchor="w")
        tk.Label(summary, text=f"{self._t('dash_sales_mtd')}  {money(data['sales_mtd'], self.currency)}      {self._t('dash_purchases_mtd')}  {money(data['purchases_mtd'], self.currency)}      {self._t('dash_card_income').title()}  {money(data['net_profit'], self.currency)}", bg=C["navy_2"], fg=C["white"], font=("Segoe UI", 11, "bold")).pack(anchor="w", pady=(8, 0))

    def _render_settings(self):
        content = self._start_page("settings")
        content.columnconfigure(0, weight=1)
        panel = tk.Frame(content, bg=C["white"], padx=25, pady=24, highlightbackground=C["line"], highlightthickness=1)
        panel.pack(fill="x", anchor="n")
        tk.Label(panel, text=self._t("set_title_identity"), bg=C["white"], fg=C["text"], font=("Segoe UI", 14, "bold")).grid(row=0, column=0, columnspan=2, sticky="w")
        tk.Label(panel, text=self._t("set_identity_sub"), bg=C["white"], fg=C["muted"], font=("Segoe UI", 9)).grid(row=1, column=0, columnspan=2, sticky="w", pady=(4, 18))
        company_var = tk.StringVar(value=self.repository.get_setting("company_name", "My Company"))
        currency_var = tk.StringVar(value=self.repository.get_setting("currency_code", "XAF"))
        tax_id_var = tk.StringVar(value=self.repository.get_setting("tax_id", ""))
        address_var = tk.StringVar(value=self.repository.get_setting("address", ""))
        for row, (label, variable) in enumerate((
            (self._t("set_company"), company_var),
            (self._t("set_currency"), currency_var),
            (self._t("set_taxid"), tax_id_var),
            (self._t("set_address"), address_var),
        ), start=2):
            tk.Label(panel, text=label, bg=C["white"], fg=C["text"], font=("Segoe UI", 9, "bold")).grid(row=row, column=0, sticky="w", padx=(0, 20), pady=8)
            ttk.Entry(panel, textvariable=variable, width=42).grid(row=row, column=1, sticky="ew", pady=8)
        tk.Label(panel, text=self._t("set_language"), bg=C["white"], fg=C["text"], font=("Segoe UI", 9, "bold")).grid(row=6, column=0, sticky="w", padx=(0, 20), pady=8)
        self.settings_lang_var = tk.StringVar(value=LANGUAGE_NAMES.get(self.lang, "English"))
        lang_combo = ttk.Combobox(
            panel, textvariable=self.settings_lang_var,
            values=[LANGUAGE_NAMES.get(code, code) for code in LANGUAGE_CODES],
            state="readonly", width=39,
        )
        lang_combo.grid(row=6, column=1, sticky="ew", pady=8)
        panel.columnconfigure(1, weight=1)

        def save():
            try:
                code = next((key for key in LANGUAGE_CODES if LANGUAGE_NAMES.get(key, key) == self.settings_lang_var.get()), self.lang)
                self.repository.save_settings(
                    company_var.get(), currency_var.get(), tax_id_var.get(), address_var.get(), code,
                )
                self.lang = code
                self.company = self.repository.get_setting("company_name", "My Company")
                self.currency = self.repository.get_setting("currency_code", "XAF")
                self.company_var.set(self.company)
                self.lang_var.set(LANGUAGE_SHORT.get(code, "EN"))
                self._set_status(self._t("set_saved_title"))
                messagebox.showinfo(self._t("set_saved_title"), self._t("set_saved_body"), parent=self.root)
                self.show_page("settings")
            except Exception as error:
                messagebox.showerror(self._t("set_save_error"), str(error), parent=self.root)

        ttk.Button(panel, text=self._t("set_save"), style="Primary.TButton", command=save).grid(row=7, column=1, sticky="e", pady=(18, 0))

        note = tk.Frame(content, bg=C["teal_light"], padx=18, pady=15)
        note.pack(fill="x", pady=(14, 0))
        tk.Label(note, text=self._t("set_file_title"), bg=C["teal_light"], fg=C["teal_dark"], font=("Segoe UI", 9, "bold")).pack(anchor="w")
        tk.Label(note, text=self._t("set_file_body"), bg=C["teal_light"], fg=C["text"], font=("Segoe UI", 9), wraplength=820, justify="left").pack(anchor="w", pady=(5, 0))

    def _render_search(self):
        query = self.search_var.get().strip()
        actions = [("Clear search", lambda: (self.search_var.set(""), self.show_page("dashboard")), "TButton"), (self._t("chrome_export_csv"), self._export_table, "TButton")]
        columns = [("kind", self._t("col_se_kind"), 145, "w", None), ("label", self._t("col_se_label"), 280, "w", None), ("detail", self._t("col_se_detail"), 230, "w", None)]
        self._table_page("search", columns, lambda search: self.repository.global_search(search or query), id_key="result_id", actions=actions, subtitle=f'Matches for "{query}"')

    # -------------------------
    # Dialog actions (existing)
    # -------------------------
    def _new_customer(self):
        self._party_form("customer")

    def _new_supplier(self):
        self._party_form("supplier")

    def _party_form(self, kind, record=None):
        is_customer = kind == "customer"
        label = "Customer" if is_customer else "Supplier"
        def submit(values):
            save = self.repository.save_customer if is_customer else self.repository.save_supplier
            save(values["name"], values["phone"], record["id"] if record else None)
            self._set_status(f"{label} {'updated' if record else 'added'}")
            self.show_page(kind + "s")
        SimpleFormDialog(
            self.root, f"{'Edit' if record else 'New'} {label.lower()}",
            [{"key": "name", "label": f"{label} name"}, {"key": "phone", "label": "Telephone / mobile", "required": False}],
            {"name": record["name"], "phone": record["phone"]} if record else {},
            submit,
        )

    def _new_product(self):
        self._product_form()

    def _edit_product(self):
        record = self._require_selection("item")
        if record:
            self._product_form(record)

    def _product_form(self, record=None):
        fields = [
            {"key": "code", "label": "Item / SKU code"},
            {"key": "name", "label": "Item description"},
            {"key": "cost_price", "label": "Current weighted-average unit cost", "readonly": bool(record)},
            {"key": "selling_price", "label": "Sales price"},
            {"key": "opening_quantity", "label": "Opening on-hand quantity", "readonly": bool(record)},
        ]
        initial = {
            "code": record["code"], "name": record["name"],
            "cost_price": record["cost_price"], "selling_price": record["price"],
            "opening_quantity": record["quantity"],
        } if record else {"cost_price": "0.00", "selling_price": "0.00", "opening_quantity": "0"}
        def submit(values):
            self.repository.save_product(
                values["code"], values["name"], values["cost_price"],
                values["selling_price"], values["opening_quantity"],
                record["id"] if record else None,
            )
            self._set_status("Item master saved")
            self.show_page("inventory")
        SimpleFormDialog(
            self.root, "Edit item master" if record else "Create inventory item", fields,
            initial, submit, width=580,
        )

    def _delete_customer(self):
        self._delete_person("customers", "customer")

    def _delete_supplier(self):
        self._delete_person("suppliers", "supplier")

    def _delete_person(self, table, label):
        record = self._require_selection(label)
        if not record or not messagebox.askyesno("Confirm deletion", f"Delete {record['name']}? Historical documents remain protected by the company file.", parent=self.root):
            return
        try:
            self.repository.delete_person(table, record["id"])
            self._set_status(f"{label.title()} deleted")
            self.refresh_page()
        except Exception as error:
            messagebox.showerror("Record cannot be deleted", f"{error}\n\nIf this party has posted documents, keep the historical record and update its details instead.", parent=self.root)

    def _delete_product(self):
        record = self._require_selection("item")
        if not record or not messagebox.askyesno("Delete item", f"Delete {record['code']} · {record['name']}? Items on posted documents cannot be deleted.", parent=self.root):
            return
        try:
            self.repository.delete_product(record["id"])
            self.refresh_page()
            self._set_status("Item deleted")
        except Exception as error:
            messagebox.showerror("Item cannot be deleted", f"{error}\n\nUse an inventory adjustment to correct stock instead of deleting a posted item.", parent=self.root)

    def _edit_customer(self):
        record = self._require_selection("customer")
        if record:
            self._party_form("customer", record)

    def _edit_supplier(self):
        record = self._require_selection("supplier")
        if record:
            self._party_form("supplier", record)

    def _new_sale(self):
        if not self.repository.list_products():
            messagebox.showinfo("No inventory items", "Add inventory items before creating an invoice.", parent=self.root)
            self.show_page("inventory")
            return
        dialog = InvoiceDialog(self.root, self.repository, "sale", self.currency, self._document_saved)

    def _new_purchase(self):
        if not self.repository.list_suppliers():
            messagebox.showinfo("No suppliers", "Add a supplier before entering a purchase invoice.", parent=self.root)
            self.show_page("suppliers")
            return
        if not self.repository.list_products():
            messagebox.showinfo("No inventory items", "Add inventory items before entering a purchase invoice.", parent=self.root)
            self.show_page("inventory")
            return
        InvoiceDialog(self.root, self.repository, "purchase", self.currency, self._document_saved)

    def _document_saved(self, result):
        self.show_page(self.active_page if self.active_page in ("sales", "purchases") else "dashboard")
        self._set_status(f"Posted {result.get('invoice')} · {money(result.get('total'), self.currency)}")
        messagebox.showinfo("Document posted", f"{result.get('invoice')} was posted successfully.\n\nTotal: {money(result.get('total'), self.currency)}", parent=self.root)

    def _new_payment(self, payment_type):
        listing = self.repository.list_customers() if payment_type == "customer" else self.repository.list_suppliers()
        if not listing:
            label = "customer" if payment_type == "customer" else "supplier"
            messagebox.showinfo(f"No {label}s", f"Add a {label} before posting a payment.", parent=self.root)
            self.show_page("customers" if payment_type == "customer" else "suppliers")
            return
        PaymentDialog(self.root, self.repository, payment_type, self.currency, self._payment_saved)

    def _payment_saved(self, result):
        self.show_page("payments" if self.active_page == "payments" else "dashboard")
        self._set_status(f"Payment {result['reference']} posted")
        messagebox.showinfo("Payment posted", f"{result['reference']} · {money(result['amount'], self.currency)}", parent=self.root)

    def _new_inventory_adjustment(self):
        if not self.repository.list_products():
            messagebox.showinfo("No inventory items", "Create an item before entering a physical count.", parent=self.root)
            self.show_page("inventory")
            return
        InventoryCountDialog(self.root, self.repository, self.currency, self._adjustment_saved)

    def _adjustment_saved(self, result):
        self.show_page("adjustments" if self.active_page == "adjustments" else "inventory")
        self._set_status(f"Stock variance posted: {result['difference']:+d} units")

    def _new_journal(self):
        JournalEntryDialog(self.root, self.repository, self._journal_saved)

    def _journal_saved(self, journal_id):
        self.show_page("journals")
        self._set_status(f"Journal entry #{journal_id} posted")
        messagebox.showinfo("Journal posted", f"General journal entry #{journal_id} was posted.", parent=self.root)

    def _new_account(self):
        fields = [
            {"key": "account_code", "label": "Account number"},
            {"key": "account_name", "label": "Account name"},
            {"key": "account_type", "label": "Account classification", "kind": "combo", "values": ACCOUNT_TYPES},
        ]
        def submit(values):
            self.repository.create_account(values["account_code"], values["account_name"], values["account_type"])
            self.show_page("accounts")
            self._set_status("General ledger account added")
        SimpleFormDialog(self.root, self._t("chrome_new_account"), fields, {"account_type": "Asset"}, submit)

    def _toggle_account(self):
        record = self._require_selection("account")
        if not record:
            return
        activate = not bool(record["is_active"])
        action = "activate" if activate else "deactivate"
        if not messagebox.askyesno("Confirm account status", f"{action.title()} account {record['account_code']} · {record['account_name']}?", parent=self.root):
            return
        try:
            self.repository.set_account_active(record["id"], activate)
            self.refresh_page()
            self._set_status(f"Account {action}d")
        except Exception as error:
            messagebox.showerror("Account status not changed", str(error), parent=self.root)

    def _view_sale(self):
        record = self._require_selection("invoice")
        if not record:
            return
        header, lines = self.repository.sale_details(record["id"])
        if header:
            summary = {"Invoice": f"INV-{header['id']:06d}", "Date": header["sale_date"], "Customer": header["customer"], "Method": header["payment_method"], "Total": money(header["total"], self.currency)}
            DetailDialog(self.root, "Sales invoice detail", summary, lines, self.currency)

    def _view_purchase(self):
        record = self._require_selection("purchase invoice")
        if not record:
            return
        header, lines = self.repository.purchase_details(record["id"])
        if header:
            summary = {"Invoice": f"PUR-{header['id']:06d}", "Date": header["purchase_date"], "Supplier": header["supplier"], "Method": header["payment_method"], "Total": money(header["total"], self.currency)}
            DetailDialog(self.root, "Purchase invoice detail", summary, lines, self.currency)

    def _view_journal(self):
        record = self._require_selection("journal entry")
        if not record:
            return
        header, lines = self.repository.journal_details(record["id"])
        if header:
            summary = {"Date": header["entry_date"], "Reference": header["reference"] or "—", "Description": header["description"]}
            DetailDialog(self.root, f"Journal entry #{header['id']}", summary, lines, self.currency)

    # -------------------------
    # Dialog actions (Payroll & HR)
    # -------------------------
    def _new_employee(self):
        self._employee_form()

    def _edit_employee(self):
        record = self._require_selection("employee")
        if record:
            self._employee_form(record)

    def _employee_form(self, record=None):
        fields = [
            {"key": "code", "label": self._t("dlg_emp_code")},
            {"key": "name", "label": self._t("dlg_emp_name")},
            {"key": "role", "label": self._t("dlg_emp_role"), "required": False},
            {"key": "base_salary", "label": self._t("dlg_emp_salary")},
            {"key": "hire_date", "label": self._t("dlg_emp_hire")},
        ]
        initial = {}
        if record:
            initial = {
                "code": record["employee_code"],
                "name": record["name"],
                "role": record["role"] or "",
                "base_salary": record["base_salary"],
                "hire_date": record["hire_date"] or "",
            }
        else:
            initial = {"base_salary": "0.00", "hire_date": date.today().isoformat()}
        def submit(values):
            try:
                self.repository.save_employee(
                    values["name"], values.get("role", ""), values["base_salary"],
                    values.get("hire_date") or date.today().isoformat(),
                    values.get("code", ""), record["id"] if record else None,
                )
                self._set_status(self._t("chrome_edit_employee") if record else self._t("chrome_new_employee"))
                self.show_page("employees")
            except Exception as error:
                messagebox.showerror(self._t("chrome_could_not_load"), str(error), parent=self.root)
        SimpleFormDialog(
            self.root,
            self._t("dlg_employee_edit") if record else self._t("dlg_employee_new"),
            fields, initial, submit,
        )

    def _toggle_employee(self):
        record = self._require_selection("employee")
        if not record:
            return
        activate = not bool(record["is_active"])
        if not messagebox.askyesno(self._t("chrome_toggle_employee"), f"{record['employee_code']} · {record['name']}?", parent=self.root):
            return
        try:
            self.repository.set_employee_active(record["id"], activate)
            self.refresh_page()
            self._set_status(self._t("status_active") if activate else self._t("status_inactive"))
        except Exception as error:
            messagebox.showerror(self._t("chrome_could_not_load"), str(error), parent=self.root)

    def _run_payroll(self):
        employees = [row for row in self.repository.list_employees() if row["is_active"]]
        if not employees:
            messagebox.showinfo(self._t("nav_employees"), self._t("no_active_employees", "No active employees found."), parent=self.root)
            self.show_page("employees")
            return
        first_of_month = date.today().replace(day=1).isoformat()
        today = date.today().isoformat()
        fields = [
            {"key": "period_start", "label": self._t("dlg_pr_start"), "default": first_of_month},
            {"key": "period_end", "label": self._t("dlg_pr_end"), "default": today},
        ]
        def submit(values):
            try:
                result = self.repository.run_payroll(values["period_start"], values["period_end"])
                self.show_page("payroll_runs")
                self._set_status(f"{result['reference']} · {money(result['total_net'], self.currency)}")
                messagebox.showinfo(
                    self._t("dlg_payroll_title"),
                    f"{result['reference']}\n\n{result['employee_count']} {self._t('col_pr_count').lower()}   ·   {self._t('col_pr_net')} {money(result['total_net'], self.currency)}",
                    parent=self.root,
                )
            except Exception as error:
                messagebox.showerror(self._t("dlg_payroll_title"), str(error), parent=self.root)
        SimpleFormDialog(
            self.root,
            self._t("dlg_payroll_title"),
            fields + [{"key": "note", "label": " ", "kind": "text", "default": self._t("dlg_payroll_note", "Every active employee is paid their base salary.")}],
            None,
            submit,
        )

    def _view_payslips(self):
        record = self._require_selection("payroll run")
        if not record:
            return
        header, lines = self.repository.payroll_run_details(record["id"])
        if not header:
            return
        summary = {
            "Period": f"{short_date(header['period_start'])} → {short_date(header['period_end'])}",
            self._t("col_pr_count"): header["employee_count"],
            self._t("col_pr_base"): money(header["total_base"], self.currency),
            self._t("col_pr_net"): money(header["total_net"], self.currency),
        }
        PayslipDialog(self.root, f"{self._t('nav_payroll_runs')} · PR-{int(record['id']):05d}", summary, lines, self.currency, self._t)

    # -------------------------
    # Dialog actions (Fixed assets)
    # -------------------------
    def _new_asset(self):
        self._asset_form()

    def _edit_asset(self):
        record = self._require_selection("fixed asset")
        if record:
            self._asset_form(record)

    def _asset_form(self, record=None):
        fields = [
            {"key": "code", "label": self._t("dlg_fa_code")},
            {"key": "name", "label": self._t("dlg_fa_name")},
            {"key": "category", "label": self._t("dlg_fa_cat"), "kind": "combo", "values": self.repository.ASSET_CATEGORIES},
            {"key": "acquisition_date", "label": self._t("dlg_fa_date")},
            {"key": "acquisition_cost", "label": self._t("dlg_fa_cost")},
            {"key": "salvage_value", "label": self._t("dlg_fa_salvage"), "required": False},
            {"key": "useful_life_years", "label": self._t("dlg_fa_life")},
            {"key": "notes", "label": self._t("dlg_fa_notes"), "kind": "text", "required": False},
        ]
        initial = {}
        if record:
            initial = {
                "code": record["asset_code"],
                "name": record["name"],
                "category": record["category"] or "Other",
                "acquisition_date": record["acquisition_date"],
                "acquisition_cost": record["acquisition_cost"],
                "salvage_value": record["salvage_value"] or "0.00",
                "useful_life_years": record["useful_life_years"],
                "notes": record["notes"] or "",
            }
        else:
            initial = {
                "category": "Equipment",
                "acquisition_date": date.today().isoformat(),
                "salvage_value": "0.00",
                "useful_life_years": "5",
                "acquisition_cost": "0.00",
            }
        def submit(values):
            try:
                self.repository.save_asset(
                    values["code"], values["name"], values["category"],
                    values["acquisition_date"], values["acquisition_cost"],
                    values.get("salvage_value") or "0.00", values["useful_life_years"],
                    values.get("notes", ""), record["id"] if record else None,
                )
                self._set_status(self._t("chrome_edit_asset") if record else self._t("asset_acquisition_posted", "Asset acquisition posted."))
                self.show_page("fixed_assets")
            except Exception as error:
                messagebox.showerror(self._t("chrome_could_not_load"), str(error), parent=self.root)
        SimpleFormDialog(
            self.root,
            self._t("dlg_asset_edit") if record else self._t("dlg_asset_new"),
            fields, initial, submit, width=580,
        )

    def _toggle_asset(self):
        record = self._require_selection("fixed asset")
        if not record:
            return
        activate = not bool(record["is_active"])
        if not messagebox.askyesno(self._t("chrome_toggle_asset"), f"{record['asset_code']} · {record['name']}?", parent=self.root):
            return
        try:
            self.repository.set_asset_active(record["id"], activate)
            self.refresh_page()
            self._set_status(self._t("status_active") if activate else self._t("status_inactive"))
        except Exception as error:
            messagebox.showerror(self._t("chrome_could_not_load"), str(error), parent=self.root)

    def _post_depreciation(self):
        record = self._require_selection("fixed asset")
        if not record:
            return
        if not record["is_active"]:
            messagebox.showinfo(self._t("nav_fixed_assets"), self._t("status_inactive"), parent=self.root)
            return
        today = date.today().isoformat()[:4]
        fields = [
            {"key": "asset", "label": self._t("col_fa_name"), "default": f"{record['asset_code']} · {record['name']}", "disabled": True},
            {"key": "period_year", "label": self._t("dlg_depr_year"), "default": today},
        ]
        def submit(values):
            try:
                self.repository.post_depreciation(record["id"], values["period_year"])
                self.refresh_page()
                self._set_status(self._t("depreciation_posted", "Depreciation posted."))
                messagebox.showinfo(self._t("dlg_depr_title"), self._t("depreciation_posted", "Depreciation posted."), parent=self.root)
            except Exception as error:
                messagebox.showerror(self._t("dlg_depr_title"), str(error), parent=self.root)
        SimpleFormDialog(self.root, self._t("dlg_depr_title"), fields, None, submit)

    # -------------------------
    # Dialog actions (Treasury)
    # -------------------------
    def _new_bank_account(self):
        self._bank_account_form()

    def _edit_bank_account(self):
        record = self._require_selection("bank account")
        if record:
            self._bank_account_form(record)

    def _bank_account_form(self, record=None):
        fields = [
            {"key": "account_name", "label": self._t("dlg_ba_name")},
            {"key": "bank_name", "label": self._t("dlg_ba_bank"), "required": False},
            {"key": "account_number", "label": self._t("dlg_ba_number"), "required": False},
            {"key": "opening_balance", "label": self._t("dlg_ba_open"), "required": False},
        ]
        initial = {}
        if record:
            initial = {
                "account_name": record["account_name"],
                "bank_name": record["bank_name"] or "",
                "account_number": record["account_number"] or "",
                "opening_balance": record["opening_balance"],
            }
        else:
            initial = {"opening_balance": "0.00"}
        def submit(values):
            try:
                self.repository.save_bank_account(
                    values["account_name"], values.get("bank_name", ""),
                    values.get("account_number", ""), values.get("opening_balance") or "0.00",
                    record["id"] if record else None,
                )
                self._set_status(self._t("chrome_edit_bank_account") if record else self._t("chrome_new_bank_account"))
                self.show_page("bank_accounts")
            except Exception as error:
                messagebox.showerror(self._t("chrome_could_not_load"), str(error), parent=self.root)
        SimpleFormDialog(
            self.root,
            self._t("dlg_ba_edit") if record else self._t("dlg_ba_new"),
            fields, initial, submit,
        )

    def _toggle_bank_account(self):
        record = self._require_selection("bank account")
        if not record:
            return
        activate = not bool(record["is_active"])
        if not messagebox.askyesno(self._t("chrome_toggle_bank_account"), f"{record['account_name']}?", parent=self.root):
            return
        try:
            self.repository.set_bank_account_active(record["id"], activate)
            self.refresh_page()
            self._set_status(self._t("status_active") if activate else self._t("status_inactive"))
        except Exception as error:
            messagebox.showerror(self._t("chrome_could_not_load"), str(error), parent=self.root)

    def _new_treasury_movement(self):
        accounts = [row for row in self.repository.list_bank_accounts() if row["is_active"]]
        if not accounts:
            messagebox.showinfo(self._t("nav_bank_accounts"), self._t("no_bank_accounts", "No active bank accounts. Add one first."), parent=self.root)
            self.show_page("bank_accounts")
            return
        account_labels = [f"{row['account_name']} (#{row['id']})" for row in accounts]
        fields = [
            {"key": "account", "label": self._t("dlg_tm_account"), "kind": "combo", "values": account_labels, "default": account_labels[0]},
            {"key": "movement_date", "label": self._t("dlg_tm_date"), "default": date.today().isoformat()},
            {"key": "direction", "label": self._t("dlg_tm_dir"), "kind": "combo", "values": ["in", "out"], "default": "in"},
            {"key": "amount", "label": self._t("dlg_tm_amount")},
            {"key": "description", "label": self._t("dlg_tm_desc"), "required": False},
        ]
        def submit(values):
            try:
                account = accounts[next(i for i, label in enumerate(account_labels) if label == values["account"])]
                result = self.repository.create_cash_movement(
                    account["id"], values["movement_date"], values["direction"],
                    values["amount"], values.get("description", ""),
                )
                self.show_page("treasury_movements")
                self._set_status(f"{result['reference']} · {self._t('movement_posted', 'Movement posted.')}")
            except Exception as error:
                messagebox.showerror(self._t("dlg_tm_new"), str(error), parent=self.root)
        SimpleFormDialog(self.root, self._t("dlg_tm_new"), fields, None, submit)

    # -------------------------
    # Dialog actions (Reconciliation)
    # -------------------------
    def _new_statement_line(self):
        accounts = [row for row in self.repository.list_bank_accounts() if row["is_active"]]
        if not accounts:
            messagebox.showinfo(self._t("nav_bank_accounts"), self._t("no_bank_accounts", "No active bank accounts. Add one first."), parent=self.root)
            self.show_page("bank_accounts")
            return
        account_labels = [f"{row['account_name']} (#{row['id']})" for row in accounts]
        fields = [
            {"key": "account", "label": self._t("dlg_tm_account"), "kind": "combo", "values": account_labels, "default": account_labels[0]},
            {"key": "statement_date", "label": self._t("dlg_rc_date"), "default": date.today().isoformat()},
            {"key": "direction", "label": self._t("dlg_rc_dir"), "kind": "combo", "values": ["in", "out"], "default": "in"},
            {"key": "amount", "label": self._t("dlg_rc_amount")},
            {"key": "reference", "label": self._t("dlg_rc_ref"), "required": False},
            {"key": "description", "label": self._t("dlg_rc_desc"), "required": False},
        ]
        def submit(values):
            try:
                account = accounts[next(i for i, label in enumerate(account_labels) if label == values["account"])]
                self.repository.add_statement_line(
                    account["id"], values["statement_date"], values["direction"],
                    values["amount"], values.get("reference", ""), values.get("description", ""),
                )
                self.refresh_page()
                self._set_status(self._t("chrome_add_line"))
            except Exception as error:
                messagebox.showerror(self._t("dlg_rc_new"), str(error), parent=self.root)
        SimpleFormDialog(self.root, self._t("dlg_rc_new"), fields, None, submit)

    def _reconcile_line(self):
        record = self._require_selection("statement line")
        if not record:
            return
        if record["is_reconciled"]:
            messagebox.showinfo(self._t("chrome_reconcile"), self._t("status_reconciled"), parent=self.root)
            return
        movements = self.repository.list_reconcilable_movements(record["bank_account_id"])
        if not movements:
            messagebox.showinfo(self._t("chrome_reconcile"), self._t("no_reconcilable_movements", "No unmatched treasury movements available."), parent=self.root)
            self.show_page("treasury_movements")
            return
        movement_labels = []
        for row in movements:
            movement_labels.append(f"{row['reference']} · {short_date(row['movement_date'])} · {row['direction']} · {float(row['amount']):,.2f} · {row['description'] or '—'}")
        fields = [
            {"key": "line", "label": self._t("col_rc_ref"), "default": f"#{record['id']} · {short_date(record['statement_date'])} · {float(record['amount']):,.2f} {record['direction']}", "disabled": True},
            {"key": "movement", "label": self._t("dlg_recon_pick"), "kind": "combo", "values": movement_labels, "default": movement_labels[0]},
        ]
        def submit(values):
            try:
                movement = movements[next(i for i, label in enumerate(movement_labels) if label == values["movement"])]
                self.repository.reconcile_statement_line(record["id"], movement["id"])
                self.refresh_page()
                self._set_status(self._t("line_reconciled", "Statement line reconciled."))
            except Exception as error:
                messagebox.showerror(self._t("dlg_recon_title"), str(error), parent=self.root)
        SimpleFormDialog(self.root, self._t("dlg_recon_title"), fields, None, submit, width=640)

    def _unreconcile_line(self):
        record = self._require_selection("statement line")
        if not record:
            return
        if not record["is_reconciled"]:
            messagebox.showinfo(self._t("chrome_unreconcile"), self._t("status_unreconciled"), parent=self.root)
            return
        try:
            self.repository.unreconcile_statement_line(record["id"])
            self.refresh_page()
            self._set_status(self._t("line_unreconciled", "Statement line unreconciled."))
        except Exception as error:
            messagebox.showerror(self._t("chrome_unreconcile"), str(error), parent=self.root)

    def _delete_statement_line(self):
        record = self._require_selection("statement line")
        if not record:
            return
        if not messagebox.askyesno(self._t("chrome_delete"), f"#{record['id']} · {short_date(record['statement_date'])} · {float(record['amount']):,.2f}?", parent=self.root):
            return
        try:
            self.repository.delete_statement_line(record["id"])
            self.refresh_page()
            self._set_status(self._t("chrome_delete"))
        except Exception as error:
            messagebox.showerror(self._t("chrome_delete"), str(error), parent=self.root)

    # -------------------------
    # Dialog actions (Cash office)
    # -------------------------
    def _new_register(self):
        self._register_form()

    def _edit_register(self):
        record = self._require_selection("cash register")
        if record:
            self._register_form(record)

    def _register_form(self, record=None):
        fields = [
            {"key": "name", "label": self._t("dlg_rg_name")},
            {"key": "opening_balance", "label": self._t("dlg_rg_float"), "required": False},
        ]
        initial = {}
        if record:
            initial = {"name": record["register_name"], "opening_balance": record["opening_balance"]}
        else:
            initial = {"opening_balance": "0.00"}
        def submit(values):
            try:
                self.repository.save_register(values["name"], values.get("opening_balance") or "0.00", record["id"] if record else None)
                self._set_status(self._t("chrome_edit_register") if record else self._t("chrome_new_register"))
                self.show_page("registers")
            except Exception as error:
                messagebox.showerror(self._t("chrome_could_not_load"), str(error), parent=self.root)
        SimpleFormDialog(
            self.root,
            self._t("dlg_rg_edit") if record else self._t("dlg_rg_new"),
            fields, initial, submit,
        )

    def _toggle_register(self):
        record = self._require_selection("cash register")
        if not record:
            return
        activate = not bool(record["is_active"])
        if not messagebox.askyesno(self._t("chrome_toggle_register"), f"{record['register_name']}?", parent=self.root):
            return
        try:
            self.repository.set_register_active(record["id"], activate)
            self.refresh_page()
            self._set_status(self._t("status_active") if activate else self._t("status_inactive"))
        except Exception as error:
            messagebox.showerror(self._t("chrome_could_not_load"), str(error), parent=self.root)

    def _new_register_movement(self):
        registers = [row for row in self.repository.list_registers() if row["is_active"]]
        if not registers:
            messagebox.showinfo(self._t("nav_registers"), self._t("no_registers", "No active registers found."), parent=self.root)
            self.show_page("registers")
            return
        register_labels = [f"{row['register_name']} (#{row['id']})" for row in registers]
        fields = [
            {"key": "register", "label": self._t("dlg_rm_register"), "kind": "combo", "values": register_labels, "default": register_labels[0]},
            {"key": "movement_date", "label": self._t("dlg_rm_date"), "default": date.today().isoformat()},
            {"key": "direction", "label": self._t("dlg_rm_dir"), "kind": "combo", "values": ["in", "out"], "default": "in"},
            {"key": "amount", "label": self._t("dlg_rm_amount")},
            {"key": "description", "label": self._t("dlg_rm_desc"), "required": False},
        ]
        def submit(values):
            try:
                register = registers[next(i for i, label in enumerate(register_labels) if label == values["register"])]
                self.repository.add_register_movement(
                    register["id"], values["movement_date"], values["direction"],
                    values["amount"], values.get("description", ""),
                )
                self.show_page("register_movements")
                self._set_status(self._t("chrome_new_movement"))
            except Exception as error:
                messagebox.showerror(self._t("dlg_rm_new"), str(error), parent=self.root)
        SimpleFormDialog(self.root, self._t("dlg_rm_new"), fields, None, submit)

    def _close_register(self):
        record = self._require_selection("cash register")
        if not record:
            return
        expected = float(record["expected_cash"] or 0)
        fields = [
            {"key": "register", "label": self._t("dlg_close_register"), "default": record["register_name"], "disabled": True},
            {"key": "closing_date", "label": self._t("dlg_close_date"), "default": date.today().isoformat()},
            {"key": "actual_amount", "label": self._t("dlg_close_actual"), "default": f"{expected:,.2f}"},
        ]
        def submit(values):
            try:
                result = self.repository.close_register(record["id"], values["closing_date"], values["actual_amount"])
                self.refresh_page()
                self._set_status(self._t("register_closed", "Register closed."))
                messagebox.showinfo(
                    self._t("dlg_close_title"),
                    f"{self._t('col_rcl_expected')}  {money(result['expected'], self.currency)}\n"
                    f"{self._t('col_rcl_actual')}  {money(result['actual'], self.currency)}\n"
                    f"{self._t('col_rcl_diff')}  {money(result['difference'], self.currency)}",
                    parent=self.root,
                )
            except Exception as error:
                messagebox.showerror(self._t("dlg_close_title"), str(error), parent=self.root)
        SimpleFormDialog(self.root, self._t("dlg_close_title"), fields, None, submit)

    def _load_dashboard_summary(self):
        self.show_page("dashboard")

    def global_search(self):
        query = self.search_var.get().strip()
        if not query or query == self._t("chrome_search_placeholder"):
            return
        self.show_page("search")


def run_desktop():
    root = tk.Tk()
    # Database initialization is intentionally deferred until the visible UI has
    # successfully created a window; this keeps CLI and headless imports safe.
    from database import close_database, connection, cursor

    repository = AccountingRepository(connection, cursor)
    AccountingDesktop(root, repository, close_database)
    root.mainloop()
