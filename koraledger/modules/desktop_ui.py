"""Sage-inspired desktop ERP workspace for KoraLedger."""

import csv
from datetime import date
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

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


def money(value, currency="XAF"):
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0.0
    return f"{currency} {amount:,.2f}"


def short_date(value):
    return str(value or "")[:10]


class AccountingDesktop:
    NAVIGATION = [
        ("WORKSPACE", [("dashboard", "Dashboard", "⌂")]),
        ("RECEIVABLES", [("customers", "Customers", "CU"), ("sales", "Sales invoices", "SI"), ("payments", "Customer & supplier payments", "PY")]),
        ("PAYABLES", [("suppliers", "Suppliers", "SU"), ("purchases", "Purchase invoices", "PI")]),
        ("INVENTORY", [("inventory", "Items & stock", "ST"), ("adjustments", "Stock adjustments", "AD")]),
        ("GENERAL LEDGER", [("accounts", "Chart of accounts", "CO"), ("journals", "Journal entries", "JE"), ("ledger", "General ledger", "GL")]),
        ("REPORTS", [("trial_balance", "Trial balance", "TB"), ("income_statement", "Income statement", "IS"), ("balance_sheet", "Balance sheet", "BS"), ("reports", "Reports center", "RP")]),
        ("ADMINISTRATION", [("settings", "Company preferences", "⚙")]),
    ]

    PAGE_META = {
        "dashboard": ("Business overview", "A live view of cash flow, trading activity, inventory, and ledger health."),
        "customers": ("Customer maintenance", "Manage customer records and review their sales activity."),
        "suppliers": ("Supplier maintenance", "Maintain your vendor list and purchase history."),
        "inventory": ("Inventory management", "Item master, pricing, stock on hand, and reorder monitoring."),
        "adjustments": ("Inventory adjustments", "Review posted physical-count variances and their ledger values."),
        "sales": ("Accounts receivable · Sales invoices", "Enter and review customer invoices. Posted invoices update stock and the general ledger."),
        "purchases": ("Accounts payable · Purchase invoices", "Record supplier invoices and replenish stock at a weighted-average cost."),
        "payments": ("Cash receipts & disbursements", "Record customer receipts and supplier payments to the correct control accounts."),
        "accounts": ("Chart of accounts", "Review the general ledger structure and maintain active posting accounts."),
        "journals": ("Journal entry register", "Review posted batches and enter balanced general journal transactions."),
        "ledger": ("General ledger inquiry", "Trace account activity with a running balance and date range."),
        "trial_balance": ("Trial balance", "Verify debit and credit activity through a selected posting date."),
        "income_statement": ("Income statement", "Review revenue, expenses, and net income for a selected period."),
        "balance_sheet": ("Balance sheet", "Review assets, liabilities, equity, and current earnings at a point in time."),
        "reports": ("Reports center", "Quick access to operational, inventory, and financial statements."),
        "search": ("Search results", "Find customers, suppliers, and inventory items across the company file."),
        "settings": ("Company preferences", "Set the company display name and reporting currency."),
    }

    def __init__(self, root, repository, close_database):
        self.root = root
        self.repository = repository
        self.close_database = close_database
        self.currency = repository.get_setting("currency_code", "XAF")
        self.company = repository.get_setting("company_name", "My Company")
        self.active_page = "dashboard"
        self._record_map = {}
        self._table = None
        self._table_columns = []
        self._page_title = ""
        self._new_action = None
        self._sidebar_buttons = {}
        self.status_var = tk.StringVar(value="Ready")
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

        self.root.title("KoraLedger · Accounting and Distribution")
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
        tk.Label(brand_copy, text="ACCOUNTING & DISTRIBUTION", bg=C["navy"], fg="#a9bbc3", font=("Segoe UI", 7, "bold")).pack(anchor="w", pady=(1, 0))

        right = tk.Frame(header, bg=C["navy"], padx=22)
        right.pack(side="right", fill="y")
        self.search_entry = ttk.Entry(right, textvariable=self.search_var, width=30)
        self.search_entry.pack(side="left", pady=17, padx=(0, 18))
        self.search_entry.insert(0, "Search records…")
        self.search_entry.bind("<FocusIn>", self._clear_search_placeholder)
        self.search_entry.bind("<Return>", lambda _event: self.global_search())
        tk.Label(right, textvariable=self.company_var, bg=C["navy"], fg=C["white"], font=("Segoe UI", 9, "bold")).pack(side="left", padx=(0, 18))
        tk.Label(right, text=date.today().strftime("%d %b %Y"), bg=C["navy"], fg="#b8c8cf", font=("Segoe UI", 9)).pack(side="left")

        self.ribbon = tk.Frame(self.root, bg="#e7edef", height=48)
        self.ribbon.pack(side="top", fill="x")
        self.ribbon.pack_propagate(False)
        tk.Label(self.ribbon, text="TASKS", bg="#e7edef", fg=C["muted"], font=("Segoe UI", 8, "bold")).pack(side="left", padx=(22, 14))
        for caption, key in (("New sales invoice", "sales"), ("New purchase", "purchases"), ("Receive payment", "payments"), ("Physical count", "adjustments"), ("Financial reports", "reports")):
            ttk.Button(self.ribbon, text=caption, command=lambda page=key: self._quick_action(page)).pack(side="left", padx=4, pady=6)

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
        tk.Label(footer, text="LOCAL COMPANY FILE   ·   DOUBLE-ENTRY POSTING ENABLED", bg="#e7edef", fg=C["muted"], font=("Segoe UI", 8), anchor="e").pack(side="right", padx=14, fill="y")

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

        tk.Label(contents, text="COMPANY WORKSPACE", bg=C["sidebar"], fg="#9db2bc", font=("Segoe UI", 8, "bold"), anchor="w").pack(fill="x", padx=20, pady=(21, 10))
        for heading, entries in self.NAVIGATION:
            tk.Label(contents, text=heading, bg=C["sidebar"], fg="#87a0ab", font=("Segoe UI", 7, "bold"), anchor="w").pack(fill="x", padx=20, pady=(15, 5))
            for page, label, icon in entries:
                button = tk.Button(
                    contents, text=f"{icon:<3}  {label}", anchor="w",
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
        tk.Button(self.sidebar, text="About KoraLedger", bg=C["sidebar"], fg="#d4e0e4", activebackground=C["sidebar_hover"], activeforeground=C["white"], relief="flat", anchor="w", padx=18, pady=12, command=self._show_about).pack(side="bottom", fill="x", padx=10, pady=8)

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
        if self.search_var.get() == "Search records…":
            self.search_var.set("")

    def _close(self):
        try:
            self.close_database()
        except Exception:
            pass
        self.root.destroy()

    def _show_about(self):
        messagebox.showinfo(
            "About KoraLedger",
            "KoraLedger Accounting & Distribution\n\n"
            "A local business accounting workspace with customer and supplier subledgers, inventory, sales and purchasing, cash receipts, general ledger, and financial reports.\n\n"
            "Posted transactions create balanced journal entries. Keep regular backups of the company database.",
            parent=self.root,
        )

    def _set_status(self, message):
        self.status_var.set(f"{message}   ·   {date.today().strftime('%d %b %Y')}")

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
        title, subtitle = self.PAGE_META.get(page, (page.title(), "Company workspace"))
        self._page_title = title
        self._new_action = None
        for child in self.workspace.winfo_children():
            child.destroy()
        header = tk.Frame(self.workspace, bg=C["canvas"], padx=28, pady=22)
        header.pack(fill="x")
        left = tk.Frame(header, bg=C["canvas"])
        left.pack(side="left", fill="x", expand=True)
        tk.Label(left, text=title, bg=C["canvas"], fg=C["text"], font=("Segoe UI", 21, "bold"), anchor="w").pack(anchor="w")
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
            tk.Label(self.workspace, text=f"This workspace could not be loaded.\n\n{error}", bg=C["canvas"], fg=C["red"], font=("Segoe UI", 11), justify="left").pack(anchor="w", padx=32, pady=28)
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
            ("New sales invoice", self._new_sale, "Primary.TButton"),
            ("New purchase", self._new_purchase, "TButton"),
        ]
        content = self._start_page("dashboard", actions)
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=1)
        content.rowconfigure(2, weight=1)

        cards = tk.Frame(content, bg=C["canvas"])
        cards.grid(row=0, column=0, sticky="ew", pady=(0, 16))
        for column in range(4):
            cards.columnconfigure(column, weight=1)
        values = [
            ("Sales · month to date", money(data["sales_mtd"], self.currency), "Posted customer invoices", C["teal"]),
            ("Open receivables", money(data["receivables"], self.currency), "General ledger · 1100", "#527b9c"),
            ("Inventory at cost", money(data["inventory_value"], self.currency), f"{data['active_products']} active items", "#947849"),
            ("Cash & bank", money(data["cash_bank"], self.currency), "Cash, bank and mobile money", C["green"]),
        ]
        for column, values_row in enumerate(values):
            self._card(cards, *values_row, column=column)

        middle = tk.Frame(content, bg=C["canvas"])
        middle.grid(row=1, column=0, sticky="nsew", pady=(0, 16))
        middle.columnconfigure(0, weight=3)
        middle.columnconfigure(1, weight=2)
        middle.rowconfigure(0, weight=1)
        chart_panel = self._panel(middle, "Sales trend", "Six-month sales activity", column=0)
        chart = tk.Canvas(chart_panel, height=185, bg=C["white"], highlightthickness=0)
        chart.pack(fill="both", expand=True, padx=15, pady=(0, 14))
        chart.bind("<Configure>", lambda _event, widget=chart, trend=data["trend"]: self._draw_trend(widget, trend))
        self._draw_trend(chart, data["trend"])

        quick_panel = self._panel(middle, "Quick tasks", "Common accounting actions", column=1, left_pad=14)
        quicks = [
            ("Receive customer payment", lambda: self._new_payment("customer"), "AR · apply cash receipts"),
            ("Pay a supplier", lambda: self._new_payment("supplier"), "AP · record disbursements"),
            ("Post journal entry", self._new_journal, "GL · balanced debit / credit"),
            ("Physical stock count", self._new_inventory_adjustment, "Inventory · post variance"),
        ]
        for title, command, detail in quicks:
            row = tk.Frame(quick_panel, bg=C["white"], padx=16, pady=8)
            row.pack(fill="x")
            button = tk.Button(row, text=title, command=command, bg=C["white"], fg=C["teal_dark"], activebackground=C["white"], activeforeground=C["teal"], relief="flat", anchor="w", font=("Segoe UI", 9, "bold"), cursor="hand2")
            button.pack(anchor="w")
            tk.Label(row, text=detail, bg=C["white"], fg=C["muted"], font=("Segoe UI", 8)).pack(anchor="w", padx=1)

        bottom = tk.Frame(content, bg=C["canvas"])
        bottom.grid(row=2, column=0, sticky="nsew")
        bottom.columnconfigure(0, weight=3)
        bottom.columnconfigure(1, weight=2)
        bottom.rowconfigure(0, weight=1)
        recent_panel = self._panel(bottom, "Recent activity", "Latest posted documents", column=0)
        recent_columns = [
            ("posted_on", "Date", 100, "w", short_date),
            ("reference", "Reference", 120, "w", None),
            ("activity", "Type", 160, "w", None),
            ("party", "Customer / supplier", 220, "w", None),
            ("amount", "Amount", 130, "e", lambda value: money(value, self.currency)),
        ]
        self._small_table(recent_panel, recent_columns, data["recent"], height=7)
        stock_panel = self._panel(bottom, "Reorder watch", "Items at or below 5 units", column=1, left_pad=14)
        stock_rows = data["low_stock_items"]
        stock_columns = [
            ("code", "Item", 90, "w", None),
            ("name", "Description", 180, "w", None),
            ("quantity", "On hand", 75, "e", None),
        ]
        self._small_table(stock_panel, stock_columns, stock_rows, height=7)
        if data["low_stock"]:
            tk.Label(stock_panel, text=f"{data['low_stock']} item(s) need a stock review.", bg=C["white"], fg=C["amber"], font=("Segoe UI", 8, "bold")).pack(anchor="w", padx=15, pady=(0, 10))
        self._set_status(f"{data['customer_count']} customers  ·  {data['active_products']} inventory items  ·  {self.currency}")

    def _panel(self, parent, title, subtitle, column=0, left_pad=0):
        panel = tk.Frame(parent, bg=C["white"], highlightbackground=C["line"], highlightthickness=1)
        panel.grid(row=0, column=column, sticky="nsew", padx=(left_pad, 0))
        tk.Label(panel, text=title, bg=C["white"], fg=C["text"], font=("Segoe UI", 11, "bold")).pack(anchor="w", padx=15, pady=(13, 0))
        tk.Label(panel, text=subtitle, bg=C["white"], fg=C["muted"], font=("Segoe UI", 8)).pack(anchor="w", padx=15, pady=(2, 10))
        return panel

    def _draw_trend(self, canvas, trend):
        canvas.delete("all")
        width = max(canvas.winfo_width(), 320)
        height = max(canvas.winfo_height(), 150)
        left, right, top, bottom = 44, width - 18, 18, height - 34
        if not trend:
            canvas.create_text(width / 2, height / 2, text="No sales posted yet", fill=C["muted"], font=("Segoe UI", 10))
            return
        maximum = max((row["sales"] for row in trend), default=0) or 1
        canvas.create_line(left, top, left, bottom, fill=C["line"])
        canvas.create_line(left, bottom, right, bottom, fill=C["line"])
        slot = (right - left) / max(len(trend), 1)
        bar_width = min(42, slot * 0.58)
        for index, row in enumerate(trend):
            center = left + slot * (index + 0.5)
            bar_height = (bottom - top - 8) * row["sales"] / maximum
            x1, x2 = center - bar_width / 2, center + bar_width / 2
            y1 = bottom - bar_height
            canvas.create_rectangle(x1, y1, x2, bottom - 1, fill=C["teal"], outline="")
            canvas.create_text(center, bottom + 15, text=row["label"], fill=C["muted"], font=("Segoe UI", 8))
            if row["sales"] > 0:
                canvas.create_text(center, max(top + 5, y1 - 9), text=f"{row['sales']:,.0f}", fill=C["muted"], font=("Segoe UI", 7))

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
        title, default_subtitle = self.PAGE_META[page]
        content = self._start_page(page, actions)
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=1)
        searchbar = tk.Frame(content, bg=C["white"], padx=14, pady=12, highlightbackground=C["line"], highlightthickness=1)
        searchbar.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        tk.Label(searchbar, text="FILTER", bg=C["white"], fg=C["muted"], font=("Segoe UI", 8, "bold")).pack(side="left", padx=(0, 10))
        search_var = tk.StringVar()
        entry = ttk.Entry(searchbar, textvariable=search_var, width=36)
        entry.pack(side="left")
        tk.Label(searchbar, text="Filter by name, code, reference or description", bg=C["white"], fg=C["muted"], font=("Segoe UI", 8)).pack(side="left", padx=12)
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
                messagebox.showerror("Unable to load records", str(error), parent=self.root)
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
            messagebox.showinfo("Select a row", f"Select a {label} from the table first.", parent=self.root)
        return record

    def _export_table(self):
        if not self._table:
            return
        path = filedialog.asksaveasfilename(
            parent=self.root, title="Export current table", defaultextension=".csv",
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
            self._set_status(f"Exported {self._table_title} to CSV")
        except OSError as error:
            messagebox.showerror("Export failed", str(error), parent=self.root)

    def _render_customers(self):
        actions = [
            ("New customer", self._new_customer, "Primary.TButton"),
            ("Edit", self._edit_customer, "TButton"),
            ("Delete", self._delete_customer, "TButton"),
            ("Export CSV", self._export_table, "TButton"),
        ]
        columns = [
            ("id", "Customer #", 90, "e", lambda value: f"CUS-{int(value):05d}"),
            ("name", "Customer name", 270, "w", None),
            ("phone", "Telephone", 170, "w", None),
            ("invoice_count", "Invoices", 100, "e", None),
            ("lifetime_sales", "Sales to date", 160, "e", lambda value: money(value, self.currency)),
        ]
        tree = self._table_page("customers", columns, self.repository.list_customers, actions=actions, on_open=lambda _row: self._edit_customer())
        self._new_action = self._new_customer

    def _render_suppliers(self):
        actions = [
            ("New supplier", self._new_supplier, "Primary.TButton"),
            ("Edit", self._edit_supplier, "TButton"),
            ("Delete", self._delete_supplier, "TButton"),
            ("Export CSV", self._export_table, "TButton"),
        ]
        columns = [
            ("id", "Supplier #", 90, "e", lambda value: f"SUP-{int(value):05d}"),
            ("name", "Supplier name", 280, "w", None),
            ("phone", "Telephone", 170, "w", None),
            ("invoice_count", "Invoices", 100, "e", None),
            ("lifetime_purchases", "Purchases to date", 170, "e", lambda value: money(value, self.currency)),
        ]
        self._table_page("suppliers", columns, self.repository.list_suppliers, actions=actions, on_open=lambda _row: self._edit_supplier())
        self._new_action = self._new_supplier

    def _render_inventory(self):
        actions = [
            ("New item", self._new_product, "Primary.TButton"),
            ("Edit item", self._edit_product, "TButton"),
            ("Physical count", self._new_inventory_adjustment, "TButton"),
            ("Export CSV", self._export_table, "TButton"),
        ]
        columns = [
            ("code", "Item code", 125, "w", None),
            ("name", "Description", 260, "w", None),
            ("cost_price", "Unit cost", 130, "e", lambda value: money(value, self.currency)),
            ("price", "Unit price", 130, "e", lambda value: money(value, self.currency)),
            ("unit_margin", "Unit margin", 130, "e", lambda value: money(value, self.currency)),
            ("quantity", "On hand", 90, "e", None),
            ("stock_status", "Status", 110, "w", None),
        ]
        self._table_page("inventory", columns, self.repository.list_products, actions=actions, on_open=lambda _row: self._edit_product(), row_tag=lambda row: "warning" if int(row["quantity"] or 0) <= 5 else None)
        self._new_action = self._new_product

    def _render_adjustments(self):
        actions = [
            ("New physical count", self._new_inventory_adjustment, "Primary.TButton"),
            ("Refresh", self.refresh_page, "TButton"),
            ("Export CSV", self._export_table, "TButton"),
        ]
        columns = [
            ("id", "Adjustment #", 110, "e", lambda value: f"ADJ-{int(value):05d}"),
            ("adjustment_date", "Posted", 160, "w", None),
            ("product_code", "Item code", 120, "w", None),
            ("product_name", "Description", 230, "w", None),
            ("old_quantity", "System qty", 100, "e", None),
            ("new_quantity", "Counted qty", 100, "e", None),
            ("difference", "Variance", 95, "e", lambda value: f"{int(value):+d}"),
            ("value_difference", "Value impact", 145, "e", lambda value: money(value, self.currency)),
        ]
        self._table_page("adjustments", columns, lambda _search: self.repository.list_inventory_adjustments(), actions=actions)
        self._new_action = self._new_inventory_adjustment

    def _render_sales(self):
        actions = [
            ("New sales invoice", self._new_sale, "Primary.TButton"),
            ("View document", self._view_sale, "TButton"),
            ("Export CSV", self._export_table, "TButton"),
        ]
        columns = [
            ("invoice", "Invoice #", 130, "w", None),
            ("sale_date", "Posting date", 155, "w", short_date),
            ("customer", "Customer", 240, "w", None),
            ("payment_method", "Terms / method", 175, "w", None),
            ("total", "Document total", 150, "e", lambda value: money(value, self.currency)),
            ("status", "Status", 110, "w", None),
        ]
        self._table_page("sales", columns, self.repository.list_sales, actions=actions, on_open=lambda _row: self._view_sale())
        self._new_action = self._new_sale

    def _render_purchases(self):
        actions = [
            ("New purchase invoice", self._new_purchase, "Primary.TButton"),
            ("View document", self._view_purchase, "TButton"),
            ("Export CSV", self._export_table, "TButton"),
        ]
        columns = [
            ("invoice", "Invoice #", 130, "w", None),
            ("purchase_date", "Posting date", 155, "w", short_date),
            ("supplier", "Supplier", 240, "w", None),
            ("payment_method", "Terms / method", 175, "w", None),
            ("total", "Document total", 150, "e", lambda value: money(value, self.currency)),
            ("status", "Status", 110, "w", None),
        ]
        self._table_page("purchases", columns, self.repository.list_purchases, actions=actions, on_open=lambda _row: self._view_purchase())
        self._new_action = self._new_purchase

    def _render_payments(self):
        actions = [
            ("Receive customer payment", lambda: self._new_payment("customer"), "Primary.TButton"),
            ("Pay supplier", lambda: self._new_payment("supplier"), "TButton"),
            ("Export CSV", self._export_table, "TButton"),
        ]
        columns = [
            ("reference", "Reference", 125, "w", None),
            ("payment_date", "Payment date", 150, "w", short_date),
            ("payment_type", "Type", 155, "w", lambda value: "Customer receipt" if value == "customer" else "Supplier payment"),
            ("party", "Customer / supplier", 230, "w", None),
            ("payment_method", "Method", 140, "w", None),
            ("amount", "Amount", 150, "e", lambda value: money(value, self.currency)),
            ("description", "Memo", 220, "w", None),
        ]
        self._table_page("payments", columns, self.repository.list_payments, actions=actions)
        self._new_action = lambda: self._new_payment("customer")

    def _render_accounts(self):
        actions = [
            ("Add account", self._new_account, "Primary.TButton"),
            ("Activate / deactivate", self._toggle_account, "TButton"),
            ("Export CSV", self._export_table, "TButton"),
        ]
        columns = [
            ("account_code", "Account #", 125, "w", None),
            ("account_name", "Account name", 260, "w", None),
            ("account_type", "Type", 130, "w", None),
            ("total_debit", "Total debits", 150, "e", lambda value: money(value, self.currency)),
            ("total_credit", "Total credits", 150, "e", lambda value: money(value, self.currency)),
            ("is_active", "Status", 110, "w", lambda value: "Active" if value else "Inactive"),
        ]
        self._table_page("accounts", columns, lambda search: self.repository.list_accounts(search), id_key="id", actions=actions, row_tag=lambda row: None if row["is_active"] else "inactive")
        self._new_action = self._new_account

    def _render_journals(self):
        actions = [
            ("New journal entry", self._new_journal, "Primary.TButton"),
            ("View entry", self._view_journal, "TButton"),
            ("Export CSV", self._export_table, "TButton"),
        ]
        columns = [
            ("entry_date", "Posting date", 140, "w", None),
            ("reference", "Reference", 150, "w", None),
            ("description", "Description", 320, "w", None),
            ("total_debit", "Debits", 150, "e", lambda value: money(value, self.currency)),
            ("total_credit", "Credits", 150, "e", lambda value: money(value, self.currency)),
        ]
        self._table_page("journals", columns, self.repository.list_journal_entries, actions=actions, on_open=lambda _row: self._view_journal())
        self._new_action = self._new_journal

    def _render_ledger(self):
        content = self._start_page("ledger", [("Export CSV", self._export_table, "TButton")])
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=1)
        filters = tk.Frame(content, bg=C["white"], padx=14, pady=12, highlightbackground=C["line"], highlightthickness=1)
        filters.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        accounts = self.repository.list_accounts()
        self._account_map = {f"{row['account_code']} · {row['account_name']}": row["account_code"] for row in accounts}
        self.ledger_account_var = tk.StringVar(value=next(iter(self._account_map), ""))
        ttk.Label(filters, text="ACCOUNT").pack(side="left", padx=(0, 7))
        account_combo = ttk.Combobox(filters, textvariable=self.ledger_account_var, values=list(self._account_map), state="readonly", width=37)
        account_combo.pack(side="left", padx=(0, 16))
        self.ledger_start_var = tk.StringVar(value=date.today().replace(day=1).isoformat())
        self.ledger_end_var = tk.StringVar(value=date.today().isoformat())
        ttk.Label(filters, text="FROM").pack(side="left", padx=(0, 7))
        ttk.Entry(filters, textvariable=self.ledger_start_var, width=13).pack(side="left", padx=(0, 14))
        ttk.Label(filters, text="THROUGH").pack(side="left", padx=(0, 7))
        ttk.Entry(filters, textvariable=self.ledger_end_var, width=13).pack(side="left", padx=(0, 14))
        ttk.Button(filters, text="Run inquiry", style="Primary.TButton", command=self._load_ledger).pack(side="left")
        self.ledger_summary_var = tk.StringVar(value="Choose an account and date range.")
        ttk.Label(filters, textvariable=self.ledger_summary_var, style="Muted.TLabel").pack(side="right", padx=(12, 0))
        frame = tk.Frame(content, bg=C["white"], highlightbackground=C["line"], highlightthickness=1)
        frame.grid(row=1, column=0, sticky="nsew")
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)
        columns = [
            ("entry_date", "Date", 135, "w", None),
            ("reference", "Reference", 160, "w", None),
            ("description", "Description", 320, "w", None),
            ("debit", "Debit", 145, "e", lambda value: money(value, self.currency)),
            ("credit", "Credit", 145, "e", lambda value: money(value, self.currency)),
            ("balance", "Running balance", 160, "e", lambda value: money(value, self.currency)),
        ]
        self.ledger_tree = self._create_tree(frame, columns)
        self._table_columns = columns
        self._table_title = "General ledger"
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

    def _render_trial_balance(self):
        actions = [("Export CSV", self._export_table, "TButton")]
        content = self._start_page("trial_balance", actions)
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=1)
        control = tk.Frame(content, bg=C["white"], padx=14, pady=12, highlightbackground=C["line"], highlightthickness=1)
        control.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        ttk.Label(control, text="AS OF DATE").pack(side="left", padx=(0, 10))
        self.trial_date_var = tk.StringVar(value=date.today().isoformat())
        ttk.Entry(control, textvariable=self.trial_date_var, width=16).pack(side="left", padx=(0, 12))
        ttk.Button(control, text="Refresh statement", style="Primary.TButton", command=self._load_trial_balance).pack(side="left")
        self.trial_totals_var = tk.StringVar(value="")
        ttk.Label(control, textvariable=self.trial_totals_var, style="Muted.TLabel").pack(side="right")
        table = tk.Frame(content, bg=C["white"], highlightbackground=C["line"], highlightthickness=1)
        table.grid(row=1, column=0, sticky="nsew")
        table.rowconfigure(0, weight=1)
        table.columnconfigure(0, weight=1)
        columns = [
            ("account_code", "Account #", 125, "w", None),
            ("account_name", "Account name", 260, "w", None),
            ("account_type", "Type", 130, "w", None),
            ("debit", "Debits", 170, "e", lambda value: money(value, self.currency)),
            ("credit", "Credits", 170, "e", lambda value: money(value, self.currency)),
            ("balance", "Normal balance", 170, "e", lambda value: money(value, self.currency)),
        ]
        self.trial_tree = self._create_tree(table, columns)
        self._table_columns, self._table, self._table_title = columns, self.trial_tree, "Trial balance"
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
            self._set_status("Trial balance refreshed")
        except Exception as error:
            messagebox.showerror("Trial balance failed", str(error), parent=self.root)

    def _render_income_statement(self):
        actions = [("Export CSV", self._export_table, "TButton")]
        content = self._start_page("income_statement", actions)
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=1)
        control = tk.Frame(content, bg=C["white"], padx=14, pady=12, highlightbackground=C["line"], highlightthickness=1)
        control.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        start = date.today().replace(month=1, day=1).isoformat()
        self.pl_start_var, self.pl_end_var = tk.StringVar(value=start), tk.StringVar(value=date.today().isoformat())
        ttk.Label(control, text="FROM").pack(side="left", padx=(0, 7))
        ttk.Entry(control, textvariable=self.pl_start_var, width=14).pack(side="left", padx=(0, 15))
        ttk.Label(control, text="THROUGH").pack(side="left", padx=(0, 7))
        ttk.Entry(control, textvariable=self.pl_end_var, width=14).pack(side="left", padx=(0, 15))
        ttk.Button(control, text="Run statement", style="Primary.TButton", command=self._load_income_statement).pack(side="left")
        self.pl_summary_var = tk.StringVar()
        ttk.Label(control, textvariable=self.pl_summary_var, style="Muted.TLabel").pack(side="right")
        table = tk.Frame(content, bg=C["white"], highlightbackground=C["line"], highlightthickness=1)
        table.grid(row=1, column=0, sticky="nsew")
        table.rowconfigure(0, weight=1)
        table.columnconfigure(0, weight=1)
        columns = [("account_code", "Account #", 130, "w", None), ("account_name", "Account name", 300, "w", None), ("account_type", "Classification", 160, "w", None), ("amount", "Period amount", 190, "e", lambda value: money(value, self.currency))]
        self.pl_tree = self._create_tree(table, columns)
        self._table_columns, self._table, self._table_title = columns, self.pl_tree, "Income statement"
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
            self._set_status("Income statement refreshed")
        except Exception as error:
            messagebox.showerror("Income statement failed", str(error), parent=self.root)

    def _render_balance_sheet(self):
        actions = [("Export CSV", self._export_table, "TButton")]
        content = self._start_page("balance_sheet", actions)
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=1)
        control = tk.Frame(content, bg=C["white"], padx=14, pady=12, highlightbackground=C["line"], highlightthickness=1)
        control.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        ttk.Label(control, text="AS OF DATE").pack(side="left", padx=(0, 10))
        self.bs_date_var = tk.StringVar(value=date.today().isoformat())
        ttk.Entry(control, textvariable=self.bs_date_var, width=16).pack(side="left", padx=(0, 12))
        ttk.Button(control, text="Refresh statement", style="Primary.TButton", command=self._load_balance_sheet).pack(side="left")
        self.bs_summary_var = tk.StringVar()
        ttk.Label(control, textvariable=self.bs_summary_var, style="Muted.TLabel").pack(side="right")
        table = tk.Frame(content, bg=C["white"], highlightbackground=C["line"], highlightthickness=1)
        table.grid(row=1, column=0, sticky="nsew")
        table.rowconfigure(0, weight=1)
        table.columnconfigure(0, weight=1)
        columns = [("account_type", "Section", 145, "w", None), ("account_code", "Account #", 130, "w", None), ("account_name", "Account name", 340, "w", None), ("amount", "Balance", 190, "e", lambda value: money(value, self.currency))]
        self.bs_tree = self._create_tree(table, columns)
        self._table_columns, self._table, self._table_title = columns, self.bs_tree, "Balance sheet"
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
            self._set_status("Balance sheet refreshed")
        except Exception as error:
            messagebox.showerror("Balance sheet failed", str(error), parent=self.root)

    def _render_reports(self):
        data = self.repository.dashboard()
        content = self._start_page("reports")
        content.columnconfigure(0, weight=1)
        for column in range(3):
            content.columnconfigure(column, weight=1)
        tiles = [
            ("General ledger", "Account detail and running balances", "ledger", "GL"),
            ("Trial balance", "Debits, credits, and account balances", "trial_balance", "TB"),
            ("Income statement", "Revenue, expenses, and net income", "income_statement", "IS"),
            ("Balance sheet", "Assets, liabilities, and equity", "balance_sheet", "BS"),
            ("Sales invoices", "Customer invoices over time", "sales", "AR"),
            ("Purchases", "Supplier invoices and inventory spend", "purchases", "AP"),
            ("Cash activity", "Customer receipts and supplier payments", "payments", "CM"),
            ("Inventory valuation", "On-hand quantities at weighted cost", "inventory", "IV"),
            ("Stock adjustments", "Physical counts and posted variance history", "adjustments", "AD"),
        ]
        for index, (title, detail, page, icon) in enumerate(tiles):
            card = tk.Frame(content, bg=C["white"], highlightbackground=C["line"], highlightthickness=1, padx=18, pady=16, cursor="hand2")
            card.grid(row=index // 3, column=index % 3, sticky="nsew", padx=(0 if index % 3 == 0 else 10, 0), pady=(0, 11))
            tk.Label(card, text=icon, bg=C["teal_light"], fg=C["teal_dark"], font=("Segoe UI", 9, "bold"), padx=8, pady=6).pack(anchor="w")
            tk.Label(card, text=title, bg=C["white"], fg=C["text"], font=("Segoe UI", 11, "bold")).pack(anchor="w", pady=(12, 4))
            tk.Label(card, text=detail, bg=C["white"], fg=C["muted"], font=("Segoe UI", 8), wraplength=250, justify="left").pack(anchor="w")
            tk.Label(card, text="Open report  →", bg=C["white"], fg=C["teal"], font=("Segoe UI", 8, "bold")).pack(anchor="w", pady=(13, 0))
            for widget in (card, *card.winfo_children()):
                widget.bind("<Button-1>", lambda _event, target=page: self.show_page(target))
        summary = tk.Frame(content, bg=C["navy_2"], padx=20, pady=17)
        summary.grid(row=3, column=0, columnspan=3, sticky="ew", pady=(5, 0))
        tk.Label(summary, text="PERIOD SNAPSHOT", bg=C["navy_2"], fg="#b4c5cc", font=("Segoe UI", 8, "bold")).pack(anchor="w")
        tk.Label(summary, text=f"Sales MTD  {money(data['sales_mtd'], self.currency)}      Purchases MTD  {money(data['purchases_mtd'], self.currency)}      Net income  {money(data['net_profit'], self.currency)}", bg=C["navy_2"], fg=C["white"], font=("Segoe UI", 11, "bold")).pack(anchor="w", pady=(8, 0))

    def _render_settings(self):
        content = self._start_page("settings")
        content.columnconfigure(0, weight=1)
        panel = tk.Frame(content, bg=C["white"], padx=25, pady=24, highlightbackground=C["line"], highlightthickness=1)
        panel.pack(fill="x", anchor="n")
        tk.Label(panel, text="Company identity", bg=C["white"], fg=C["text"], font=("Segoe UI", 14, "bold")).grid(row=0, column=0, columnspan=2, sticky="w")
        tk.Label(panel, text="These settings affect the workspace header and financial statement display.", bg=C["white"], fg=C["muted"], font=("Segoe UI", 9)).grid(row=1, column=0, columnspan=2, sticky="w", pady=(4, 18))
        company_var = tk.StringVar(value=self.repository.get_setting("company_name", "My Company"))
        currency_var = tk.StringVar(value=self.repository.get_setting("currency_code", "XAF"))
        for row, (label, variable) in enumerate((("Company display name", company_var), ("Reporting currency (ISO code)", currency_var)), start=2):
            tk.Label(panel, text=label, bg=C["white"], fg=C["text"], font=("Segoe UI", 9, "bold")).grid(row=row, column=0, sticky="w", padx=(0, 20), pady=8)
            ttk.Entry(panel, textvariable=variable, width=42).grid(row=row, column=1, sticky="ew", pady=8)
        panel.columnconfigure(1, weight=1)
        def save():
            try:
                self.repository.save_settings(company_var.get(), currency_var.get())
                self.company = self.repository.get_setting("company_name", "My Company")
                self.currency = self.repository.get_setting("currency_code", "XAF")
                self.company_var.set(self.company)
                self._set_status("Company preferences saved")
                messagebox.showinfo("Preferences saved", "Company display and reporting currency were updated.", parent=self.root)
            except Exception as error:
                messagebox.showerror("Could not save preferences", str(error), parent=self.root)
        ttk.Button(panel, text="Save preferences", style="Primary.TButton", command=save).grid(row=4, column=1, sticky="e", pady=(18, 0))

        note = tk.Frame(content, bg=C["teal_light"], padx=18, pady=15)
        note.pack(fill="x", pady=(14, 0))
        tk.Label(note, text="Company file and data", bg=C["teal_light"], fg=C["teal_dark"], font=("Segoe UI", 9, "bold")).pack(anchor="w")
        tk.Label(note, text="The accounting records are stored locally in the company SQLite file. Back it up before maintenance, upgrades, or moving this workstation. Settings do not replace a backup.", bg=C["teal_light"], fg=C["text"], font=("Segoe UI", 9), wraplength=820, justify="left").pack(anchor="w", pady=(5, 0))

    def _render_search(self):
        query = self.search_var.get().strip()
        actions = [("Clear search", lambda: (self.search_var.set(""), self.show_page("dashboard")), "TButton"), ("Export CSV", self._export_table, "TButton")]
        columns = [("kind", "Record type", 145, "w", None), ("label", "Description", 280, "w", None), ("detail", "Code / telephone", 230, "w", None)]
        self._table_page("search", columns, lambda search: self.repository.global_search(search or query), id_key="result_id", actions=actions, subtitle=f"Matches for “{query}”")

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
        SimpleFormDialog(self.root, "Add general ledger account", fields, {"account_type": "Asset"}, submit)

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

    def _load_dashboard_summary(self):
        self.show_page("dashboard")

    def global_search(self):
        query = self.search_var.get().strip()
        if not query or query == "Search records…":
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
