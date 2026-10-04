"""Modal transaction and master-file forms for the desktop accounting UI."""

import tkinter as tk
from tkinter import messagebox, ttk
from datetime import date


COLORS = {
    "navy": "#132c3b",
    "teal": "#087f8c",
    "teal_dark": "#086872",
    "canvas": "#f1f4f6",
    "line": "#dbe2e6",
    "text": "#1c2b36",
    "muted": "#71808b",
    "white": "#ffffff",
    "red": "#b84c55",
    "green": "#28785f",
}


def _drag_handle(window, caption):
    """Insert a thin draggable bar at the top of a dialog window.

    On Windows a tkinter global grab (grab_set) makes the OS title bar
    undraggable, so dialogs would otherwise sit frozen in the middle of
    the screen. This strip lets the user move any window at all times.
    """
    bar = tk.Frame(window, bg=COLORS["navy"], height=26)
    slaves = window.pack_slaves()
    if slaves:
        bar.pack(side="top", fill="x", before=slaves[0])
    else:
        bar.pack(side="top", fill="x")
    bar.pack_propagate(False)
    label = tk.Label(
        bar, text=f"  ⠿  {caption}  —  drag to move",
        bg=COLORS["navy"], fg="#b8c8cf", font=("Segoe UI", 8, "bold"), anchor="w",
    )
    label.pack(side="left", fill="y")
    bar.configure(cursor="fleur")
    label.configure(cursor="fleur")

    def _press(event):
        window._drag_offset = (event.x_root, event.y_root)

    def _drag(event):
        offset_x, offset_y = window._drag_offset
        window.geometry(f"+{event.x_root - offset_x}+{event.y_root - offset_y}")

    for widget in (bar, label):
        widget.bind("<ButtonPress-1>", _press)
        widget.bind("<B1-Motion>", _drag, add=True)
    return bar


class SimpleFormDialog(tk.Toplevel):
    def __init__(self, parent, title, fields, initial=None, on_submit=None, width=520):
        super().__init__(parent)
        self.parent = parent
        self.fields = fields
        self.initial = initial or {}
        self.on_submit = on_submit
        self.widgets = {}
        self.title(title)
        self.configure(bg=COLORS["canvas"])
        self.resizable(False, False)
        self.transient(parent)
        self._build(width)
        _drag_handle(self, title)
        self.update_idletasks()
        self.geometry(f"{width}x{max(250, self.winfo_reqheight())}")
        self.grab_set()
        self.bind("<Escape>", lambda _event: self.destroy())
        self.after(80, self._focus_first)

    def _build(self, width):
        outer = tk.Frame(self, bg=COLORS["white"], padx=26, pady=24)
        outer.pack(fill="both", expand=True, padx=16, pady=16)
        outer.columnconfigure(1, weight=1)
        for index, field in enumerate(self.fields):
            label = tk.Label(
                outer, text=field["label"], bg=COLORS["white"],
                fg=COLORS["text"], font=("Segoe UI", 9, "bold"), anchor="w",
            )
            label.grid(row=index, column=0, sticky="w", padx=(0, 18), pady=8)
            kind = field.get("kind", "entry")
            value = self.initial.get(field["key"], field.get("default", ""))
            if kind == "combo":
                variable = tk.StringVar(value=str(value))
                widget = ttk.Combobox(
                    outer, textvariable=variable, values=field.get("values", ()),
                    state="readonly", width=40,
                )
            elif kind == "text":
                widget = tk.Text(outer, height=3, width=42, wrap="word", font=("Segoe UI", 10))
                widget.insert("1.0", str(value or ""))
            else:
                widget = ttk.Entry(outer, width=44)
                widget.insert(0, str(value if value is not None else ""))
                if field.get("readonly"):
                    widget.configure(state="readonly")
                if field.get("disabled"):
                    widget.configure(state="disabled")
            widget.grid(row=index, column=1, sticky="ew", pady=7)
            self.widgets[field["key"]] = (kind, widget)

        footer = tk.Frame(outer, bg=COLORS["white"])
        footer.grid(row=len(self.fields), column=0, columnspan=2, sticky="e", pady=(22, 0))
        ttk.Button(footer, text="Cancel", command=self.destroy).pack(side="right", padx=(8, 0))
        ttk.Button(footer, text="Save record", style="Primary.TButton", command=self._submit).pack(side="right")
        self.update_idletasks()
        self.geometry(f"{width}x{max(250, self.winfo_reqheight())}")
        self._center()

    def _center(self):
        self.update_idletasks()
        x = self.parent.winfo_rootx() + max(0, (self.parent.winfo_width() - self.winfo_width()) // 2)
        y = self.parent.winfo_rooty() + max(0, (self.parent.winfo_height() - self.winfo_height()) // 2)
        self.geometry(f"+{x}+{y}")

    def _focus_first(self):
        for _kind, widget in self.widgets.values():
            if str(widget.cget("state")) not in ("disabled", "readonly"):
                widget.focus_set()
                break

    def _values(self):
        result = {}
        for key, (kind, widget) in self.widgets.items():
            if kind == "text":
                result[key] = widget.get("1.0", "end").strip()
            else:
                result[key] = widget.get().strip()
        return result

    def _submit(self):
        try:
            if self.on_submit:
                self.on_submit(self._values())
        except Exception as error:
            messagebox.showerror("Unable to save", str(error), parent=self)
            return
        self.destroy()


class InvoiceDialog(tk.Toplevel):
    def __init__(self, parent, repository, kind, currency, on_saved):
        super().__init__(parent)
        self.parent = parent
        self.repository = repository
        self.kind = kind
        self.currency = currency
        self.on_saved = on_saved
        self.lines = []
        self.product_records = repository.list_products()
        self.product_labels = {}
        self.title("Enter customer invoice" if kind == "sale" else "Enter purchase invoice")
        self.configure(bg=COLORS["canvas"])
        self.geometry("980x760")
        self.minsize(860, 660)
        self.transient(parent)
        self.grab_set()
        self._build()
        _drag_handle(self, self.title())
        self._center()
        self.bind("<Escape>", lambda _event: self.destroy())

    def _build(self):
        shell = tk.Frame(self, bg=COLORS["white"])
        shell.pack(fill="both", expand=True, padx=16, pady=16)
        shell.columnconfigure(0, weight=1)
        shell.rowconfigure(2, weight=1)

        top = tk.Frame(shell, bg=COLORS["white"], padx=22, pady=18)
        top.grid(row=0, column=0, sticky="ew")
        heading = "Sales invoice" if self.kind == "sale" else "Purchase invoice"
        tk.Label(top, text=heading, bg=COLORS["white"], fg=COLORS["text"], font=("Segoe UI", 18, "bold")).pack(anchor="w")
        tk.Label(top, text="Enter the document header, add line items, then review before posting to the ledger.", bg=COLORS["white"], fg=COLORS["muted"], font=("Segoe UI", 9)).pack(anchor="w", pady=(4, 0))

        header = tk.Frame(shell, bg="#f7f9fa", padx=22, pady=16)
        header.grid(row=1, column=0, sticky="ew", padx=18)
        for column in range(3):
            header.columnconfigure(column, weight=1)
        party_caption = "Customer" if self.kind == "sale" else "Supplier"
        tk.Label(header, text=party_caption.upper(), bg="#f7f9fa", fg=COLORS["muted"], font=("Segoe UI", 8, "bold")).grid(row=0, column=0, sticky="w")
        tk.Label(header, text="PAYMENT TERMS", bg="#f7f9fa", fg=COLORS["muted"], font=("Segoe UI", 8, "bold")).grid(row=0, column=1, sticky="w", padx=16)
        tk.Label(header, text="DOCUMENT DATE", bg="#f7f9fa", fg=COLORS["muted"], font=("Segoe UI", 8, "bold")).grid(row=0, column=2, sticky="w", padx=16)

        parties = repository.list_customers() if self.kind == "sale" else repository.list_suppliers()
        self.party_by_label = {}
        party_values = []
        if self.kind == "sale":
            self.party_by_label["Walk-in customer"] = None
            party_values.append("Walk-in customer")
        for record in parties:
            label = f"{record['name']}  ·  #{record['id']}"
            self.party_by_label[label] = record["id"]
            party_values.append(label)
        self.party_var = tk.StringVar(value=party_values[0] if party_values else "")
        self.party_combo = ttk.Combobox(header, textvariable=self.party_var, values=party_values, state="readonly")
        self.party_combo.grid(row=1, column=0, sticky="ew", pady=(7, 0))
        if not party_values:
            self.party_combo.configure(state="disabled")

        choices = ("Cash", "Bank", "Mobile Money", "Accounts Receivable") if self.kind == "sale" else ("Cash", "Bank", "Mobile Money", "Accounts Payable")
        self.method_var = tk.StringVar(value="Cash")
        ttk.Combobox(header, textvariable=self.method_var, values=choices, state="readonly").grid(row=1, column=1, sticky="ew", padx=16, pady=(7, 0))
        self.date_var = tk.StringVar(value=date.today().isoformat())
        ttk.Entry(header, textvariable=self.date_var).grid(row=1, column=2, sticky="ew", padx=16, pady=(7, 0))

        content = tk.Frame(shell, bg=COLORS["white"], padx=22, pady=18)
        content.grid(row=2, column=0, sticky="nsew")
        content.columnconfigure(0, weight=1)
        content.rowconfigure(2, weight=1)
        tk.Label(content, text="LINE ITEMS", bg=COLORS["white"], fg=COLORS["text"], font=("Segoe UI", 9, "bold")).grid(row=0, column=0, sticky="w", pady=(0, 10))

        line_controls = tk.Frame(content, bg=COLORS["white"])
        line_controls.grid(row=1, column=0, sticky="ew", pady=(0, 12))
        line_controls.columnconfigure(0, weight=1)
        self.product_var = tk.StringVar()
        labels = []
        for product in self.product_records:
            label = f"{product['code']}  ·  {product['name']}  ·  {product['quantity']} on hand  ·  #{product['id']}"
            labels.append(label)
            self.product_labels[label] = product
        self.product_combo = ttk.Combobox(line_controls, textvariable=self.product_var, values=labels, state="readonly")
        self.product_combo.grid(row=0, column=0, sticky="ew", padx=(0, 10))
        self.product_combo.bind("<<ComboboxSelected>>", self._product_selected)
        self.quantity_var = tk.StringVar(value="1")
        ttk.Entry(line_controls, textvariable=self.quantity_var, width=8).grid(row=0, column=1, padx=5)
        self.unit_price_var = tk.StringVar(value="0.00")
        ttk.Entry(line_controls, textvariable=self.unit_price_var, width=15).grid(row=0, column=2, padx=5)
        ttk.Button(line_controls, text="Add line", style="Primary.TButton", command=self._add_line).grid(row=0, column=3, padx=(8, 0))
        tk.Label(line_controls, text="Qty", bg=COLORS["white"], fg=COLORS["muted"], font=("Segoe UI", 8)).grid(row=1, column=1, sticky="w", padx=5, pady=(3, 0))
        tk.Label(line_controls, text="Unit price / cost", bg=COLORS["white"], fg=COLORS["muted"], font=("Segoe UI", 8)).grid(row=1, column=2, sticky="w", padx=5, pady=(3, 0))

        grid_frame = tk.Frame(content, bg=COLORS["white"])
        grid_frame.grid(row=2, column=0, sticky="nsew")
        grid_frame.rowconfigure(0, weight=1)
        grid_frame.columnconfigure(0, weight=1)
        columns = ("code", "description", "quantity", "unit", "amount")
        self.tree = ttk.Treeview(grid_frame, columns=columns, show="headings", height=12, selectmode="browse")
        headings = {"code": "Item code", "description": "Description", "quantity": "Quantity", "unit": "Unit price / cost", "amount": "Line total"}
        widths = {"code": 120, "description": 330, "quantity": 90, "unit": 140, "amount": 150}
        for key in columns:
            self.tree.heading(key, text=headings[key])
            self.tree.column(key, width=widths[key], anchor="e" if key in ("quantity", "unit", "amount") else "w")
        self.tree.grid(row=0, column=0, sticky="nsew")
        scrollbar = ttk.Scrollbar(grid_frame, orient="vertical", command=self.tree.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.tree.configure(yscrollcommand=scrollbar.set)
        self.tree.tag_configure("odd", background="#f7f9fa")

        line_footer = tk.Frame(content, bg=COLORS["white"])
        line_footer.grid(row=3, column=0, sticky="ew", pady=(10, 0))
        ttk.Button(line_footer, text="Remove selected line", command=self._remove_line).pack(side="left")
        self.total_var = tk.StringVar(value=self._money(0))
        total_box = tk.Frame(line_footer, bg="#f1f7f7", padx=18, pady=10)
        total_box.pack(side="right")
        tk.Label(total_box, text="DOCUMENT TOTAL", bg="#f1f7f7", fg=COLORS["muted"], font=("Segoe UI", 8, "bold")).pack(anchor="e")
        tk.Label(total_box, textvariable=self.total_var, bg="#f1f7f7", fg=COLORS["teal_dark"], font=("Segoe UI", 17, "bold")).pack(anchor="e")

        footer = tk.Frame(shell, bg=COLORS["white"], padx=22, pady=15)
        footer.grid(row=3, column=0, sticky="ew")
        tk.Label(footer, text="Posting creates the invoice and its double-entry ledger activity.", bg=COLORS["white"], fg=COLORS["muted"], font=("Segoe UI", 8)).pack(side="left")
        ttk.Button(footer, text="Cancel", command=self.destroy).pack(side="right", padx=(9, 0))
        ttk.Button(footer, text="Review & post", style="Primary.TButton", command=self._save).pack(side="right")

        if self.product_records:
            self.product_combo.current(0)
            self._product_selected()

    def _center(self):
        self.update_idletasks()
        x = self.parent.winfo_rootx() + max(0, (self.parent.winfo_width() - self.winfo_width()) // 2)
        y = self.parent.winfo_rooty() + max(0, (self.parent.winfo_height() - self.winfo_height()) // 2)
        self.geometry(f"+{x}+{y}")

    def _money(self, value):
        return f"{self.currency} {float(value or 0):,.2f}"

    def _product_selected(self, _event=None):
        product = self.product_labels.get(self.product_var.get())
        if not product:
            return
        price = product["price"] if self.kind == "sale" else product["cost_price"]
        self.unit_price_var.set(f"{float(price or 0):.2f}")

    def _add_line(self):
        product = self.product_labels.get(self.product_var.get())
        if not product:
            messagebox.showwarning("Choose an item", "Select an inventory item first.", parent=self)
            return
        try:
            quantity = int(self.quantity_var.get().strip())
            unit = float(self.unit_price_var.get().replace(",", "").strip())
            if quantity <= 0 or unit < 0:
                raise ValueError("Quantity must be positive and the unit price cannot be negative.")
        except ValueError as error:
            messagebox.showerror("Check the line item", str(error), parent=self)
            return
        if self.kind == "sale":
            already = sum(line["quantity"] for line in self.lines if line["product_id"] == product["id"])
            if already + quantity > int(product["quantity"] or 0):
                messagebox.showerror("Insufficient stock", f"Only {product['quantity'] - already} units of {product['name']} are available.", parent=self)
                return
        line = {
            "product_id": product["id"],
            "code": product["code"],
            "name": product["name"],
            "quantity": quantity,
            "unit_price" if self.kind == "sale" else "unit_cost": unit,
            "subtotal": round(quantity * unit, 2),
        }
        self.lines.append(line)
        self._refresh_lines()
        self.quantity_var.set("1")

    def _remove_line(self):
        selected = self.tree.selection()
        if not selected:
            return
        index = int(selected[0])
        self.lines.pop(index)
        self._refresh_lines()

    def _refresh_lines(self):
        self.tree.delete(*self.tree.get_children())
        total = 0.0
        for index, line in enumerate(self.lines):
            unit = line.get("unit_price", line.get("unit_cost", 0))
            total += line["subtotal"]
            self.tree.insert(
                "", "end", iid=str(index),
                values=(line["code"], line["name"], line["quantity"], f"{self._money(unit)}", f"{self._money(line['subtotal'])}"),
                tags=("odd" if index % 2 else "",),
            )
        self.total_var.set(self._money(total))

    def _save(self):
        if not self.lines:
            messagebox.showwarning("No line items", "Add at least one item before posting.", parent=self)
            return
        party_id = self.party_by_label.get(self.party_var.get())
        method = self.method_var.get()
        total = sum(line["subtotal"] for line in self.lines)
        if not messagebox.askyesno("Confirm posting", f"Post this document for {self._money(total)}?\n\nPosted documents update inventory and the general ledger.", parent=self):
            return
        try:
            if self.kind == "sale":
                result = self.repository.create_sale(party_id, method, self.lines, self.date_var.get())
            else:
                result = self.repository.create_purchase(party_id, method, self.lines, self.date_var.get())
            if self.on_saved:
                self.on_saved(result)
            self.destroy()
        except Exception as error:
            messagebox.showerror("Document not posted", str(error), parent=self)


class PaymentDialog(tk.Toplevel):
    def __init__(self, parent, repository, payment_type, currency, on_saved):
        super().__init__(parent)
        self.repository = repository
        self.payment_type = payment_type
        self.currency = currency
        self.on_saved = on_saved
        self.title("Receive customer payment" if payment_type == "customer" else "Pay supplier")
        self.configure(bg=COLORS["canvas"])
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()
        self._build()
        _drag_handle(self, self.title())
        self._center(parent)

    def _build(self):
        party_list = self.repository.list_customers() if self.payment_type == "customer" else self.repository.list_suppliers()
        label = "Customer" if self.payment_type == "customer" else "Supplier"
        outer = tk.Frame(self, bg=COLORS["white"], padx=26, pady=24)
        outer.pack(fill="both", expand=True, padx=16, pady=16)
        tk.Label(outer, text="Cash receipt" if self.payment_type == "customer" else "Supplier disbursement", bg=COLORS["white"], fg=COLORS["text"], font=("Segoe UI", 18, "bold")).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 5))
        tk.Label(outer, text="Post a payment against the selected control account.", bg=COLORS["white"], fg=COLORS["muted"], font=("Segoe UI", 9)).grid(row=1, column=0, columnspan=2, sticky="w", pady=(0, 18))
        self.party_by_label = {}
        choices = []
        for row in party_list:
            text = f"{row['name']}  ·  #{row['id']}"
            choices.append(text)
            self.party_by_label[text] = row["id"]
        self.party_var = tk.StringVar(value=choices[0] if choices else "")
        self.amount_var = tk.StringVar(value="")
        self.method_var = tk.StringVar(value="Cash")
        self.date_var = tk.StringVar(value=date.today().isoformat())
        self.memo_var = tk.StringVar()
        fields = [
            (label, "party", self.party_var, choices, "combo"),
            ("Amount", "amount", self.amount_var, (), "entry"),
            ("Deposit / payment method", "method", self.method_var, ("Cash", "Bank", "Mobile Money"), "combo"),
            ("Payment date (YYYY-MM-DD)", "date", self.date_var, (), "entry"),
            ("Memo", "memo", self.memo_var, (), "entry"),
        ]
        for row, (caption, key, variable, values, kind) in enumerate(fields, start=2):
            tk.Label(outer, text=caption, bg=COLORS["white"], fg=COLORS["text"], font=("Segoe UI", 9, "bold")).grid(row=row, column=0, sticky="w", padx=(0, 16), pady=8)
            if kind == "combo":
                widget = ttk.Combobox(outer, textvariable=variable, values=values, state="readonly", width=38)
            else:
                widget = ttk.Entry(outer, textvariable=variable, width=41)
            widget.grid(row=row, column=1, sticky="ew", pady=8)
        outer.columnconfigure(1, weight=1)
        footer = tk.Frame(outer, bg=COLORS["white"])
        footer.grid(row=len(fields) + 2, column=0, columnspan=2, sticky="e", pady=(18, 0))
        ttk.Button(footer, text="Cancel", command=self.destroy).pack(side="right", padx=(8, 0))
        ttk.Button(footer, text="Post payment", style="Primary.TButton", command=self._save).pack(side="right")
        if not choices:
            ttk.Label(outer, text=f"Add a {label.lower()} record before posting a payment.", foreground=COLORS["red"]).grid(row=7, column=0, columnspan=2, sticky="w", pady=(8, 0))

    def _center(self, parent):
        self.update_idletasks()
        x = parent.winfo_rootx() + max(0, (parent.winfo_width() - self.winfo_width()) // 2)
        y = parent.winfo_rooty() + max(0, (parent.winfo_height() - self.winfo_height()) // 2)
        self.geometry(f"+{x}+{y}")

    def _save(self):
        party_id = self.party_by_label.get(self.party_var.get())
        if party_id is None:
            messagebox.showerror("Party required", "Select a customer or supplier first.", parent=self)
            return
        try:
            amount = float(self.amount_var.get().replace(",", "").strip())
            if amount <= 0:
                raise ValueError("Enter a payment amount greater than zero.")
            result = self.repository.create_payment(
                self.payment_type, party_id, amount, self.method_var.get(),
                self.memo_var.get(), self.date_var.get(),
            )
            if self.on_saved:
                self.on_saved(result)
            self.destroy()
        except Exception as error:
            messagebox.showerror("Payment not posted", str(error), parent=self)


class InventoryCountDialog(tk.Toplevel):
    def __init__(self, parent, repository, currency, on_saved):
        super().__init__(parent)
        self.repository = repository
        self.currency = currency
        self.on_saved = on_saved
        self.products = repository.list_products()
        self.product_map = {}
        self.title("Physical inventory count")
        self.configure(bg=COLORS["canvas"])
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()
        self._build()
        _drag_handle(self, self.title())
        self._center(parent)

    def _build(self):
        outer = tk.Frame(self, bg=COLORS["white"], padx=26, pady=24)
        outer.pack(fill="both", expand=True, padx=16, pady=16)
        tk.Label(outer, text="Physical inventory count", bg=COLORS["white"], fg=COLORS["text"], font=("Segoe UI", 18, "bold")).pack(anchor="w")
        tk.Label(outer, text="Enter the counted on-hand quantity. A variance posts to inventory and the general ledger.", bg=COLORS["white"], fg=COLORS["muted"], font=("Segoe UI", 9), wraplength=500, justify="left").pack(anchor="w", pady=(5, 20))
        self.product_var = tk.StringVar()
        values = []
        for product in self.products:
            label = f"{product['code']}  ·  {product['name']}  ·  #{product['id']}"
            self.product_map[label] = product
            values.append(label)
        self.combo = ttk.Combobox(outer, textvariable=self.product_var, values=values, state="readonly", width=56)
        self.combo.pack(fill="x", pady=(0, 16))
        self.on_hand_var = tk.StringVar(value="Select an item")
        self.count_var = tk.StringVar(value="")
        ttk.Label(outer, text="System on hand", style="Muted.TLabel").pack(anchor="w")
        ttk.Label(outer, textvariable=self.on_hand_var, font=("Segoe UI", 14, "bold")).pack(anchor="w", pady=(2, 12))
        ttk.Label(outer, text="Physical count").pack(anchor="w")
        self.count_entry = ttk.Entry(outer, textvariable=self.count_var, width=24)
        self.count_entry.pack(anchor="w", pady=(6, 8))
        self.variance_var = tk.StringVar(value="Variance: —")
        ttk.Label(outer, textvariable=self.variance_var, style="Muted.TLabel").pack(anchor="w", pady=(0, 12))
        self.combo.bind("<<ComboboxSelected>>", self._select_product)
        self.count_var.trace_add("write", self._update_variance)
        footer = tk.Frame(outer, bg=COLORS["white"])
        footer.pack(fill="x", pady=(14, 0))
        ttk.Button(footer, text="Cancel", command=self.destroy).pack(side="right", padx=(8, 0))
        ttk.Button(footer, text="Post adjustment", style="Primary.TButton", command=self._save).pack(side="right")
        if values:
            self.combo.current(0)
            self._select_product()

    def _center(self, parent):
        self.update_idletasks()
        x = parent.winfo_rootx() + max(0, (parent.winfo_width() - self.winfo_width()) // 2)
        y = parent.winfo_rooty() + max(0, (parent.winfo_height() - self.winfo_height()) // 2)
        self.geometry(f"+{x}+{y}")

    def _select_product(self, _event=None):
        product = self.product_map.get(self.product_var.get())
        if not product:
            return
        self.on_hand_var.set(f"{product['quantity']} units at {self.currency} {float(product['cost_price'] or 0):,.2f} each")
        self.count_var.set(str(product["quantity"]))
        self._update_variance()

    def _update_variance(self, *_args):
        product = self.product_map.get(self.product_var.get())
        if not product:
            return
        try:
            difference = int(self.count_var.get()) - int(product["quantity"])
            value = difference * float(product["cost_price"] or 0)
            self.variance_var.set(f"Variance: {difference:+d} units  ·  {self.currency} {value:,.2f}")
        except ValueError:
            self.variance_var.set("Variance: enter a whole-number count")

    def _save(self):
        product = self.product_map.get(self.product_var.get())
        if not product:
            messagebox.showerror("Choose an item", "Select an inventory item.", parent=self)
            return
        try:
            counted = int(self.count_var.get().strip())
            difference = counted - int(product["quantity"])
            value = difference * float(product["cost_price"] or 0)
            if not difference:
                messagebox.showinfo("No variance", "The physical count matches the system quantity.", parent=self)
                return
            if not messagebox.askyesno("Confirm inventory adjustment", f"Post a {difference:+d} unit variance valued at {self.currency} {value:,.2f}?", parent=self):
                return
            result = self.repository.adjust_inventory(product["id"], counted)
            if self.on_saved:
                self.on_saved(result)
            self.destroy()
        except Exception as error:
            messagebox.showerror("Adjustment not posted", str(error), parent=self)


class JournalEntryDialog(tk.Toplevel):
    def __init__(self, parent, repository, on_saved):
        super().__init__(parent)
        self.repository = repository
        self.on_saved = on_saved
        self.accounts = repository.list_accounts(active_only=True)
        self.account_map = {}
        self.lines = []
        self.title("General journal entry")
        self.configure(bg=COLORS["canvas"])
        self.geometry("900x720")
        self.minsize(780, 640)
        self.transient(parent)
        self.grab_set()
        self._build()
        _drag_handle(self, self.title())
        self._center(parent)

    def _build(self):
        outer = tk.Frame(self, bg=COLORS["white"], padx=24, pady=20)
        outer.pack(fill="both", expand=True, padx=16, pady=16)
        outer.columnconfigure(0, weight=1)
        outer.rowconfigure(3, weight=1)
        tk.Label(outer, text="General journal entry", bg=COLORS["white"], fg=COLORS["text"], font=("Segoe UI", 18, "bold")).grid(row=0, column=0, sticky="w")
        tk.Label(outer, text="Debits must equal credits before the entry can be posted.", bg=COLORS["white"], fg=COLORS["muted"], font=("Segoe UI", 9)).grid(row=1, column=0, sticky="w", pady=(4, 17))
        header = tk.Frame(outer, bg="#f7f9fa", padx=15, pady=13)
        header.grid(row=2, column=0, sticky="ew", pady=(0, 16))
        header.columnconfigure(0, weight=2)
        header.columnconfigure(1, weight=1)
        header.columnconfigure(2, weight=1)
        self.description_var = tk.StringVar()
        self.reference_var = tk.StringVar()
        self.date_var = tk.StringVar(value=date.today().isoformat())
        self._field(header, 0, "Description", self.description_var)
        self._field(header, 1, "Reference", self.reference_var)
        self._field(header, 2, "Posting date", self.date_var)

        line_area = tk.Frame(outer, bg=COLORS["white"])
        line_area.grid(row=3, column=0, sticky="nsew")
        line_area.rowconfigure(1, weight=1)
        line_area.columnconfigure(0, weight=1)
        entry = tk.Frame(line_area, bg=COLORS["white"])
        entry.grid(row=0, column=0, sticky="ew", pady=(0, 10))
        entry.columnconfigure(0, weight=1)
        self.account_var = tk.StringVar()
        account_values = []
        for account in self.accounts:
            label = f"{account['account_code']}  ·  {account['account_name']}"
            self.account_map[label] = account
            account_values.append(label)
        ttk.Combobox(entry, textvariable=self.account_var, values=account_values, state="readonly").grid(row=0, column=0, sticky="ew", padx=(0, 8))
        self.debit_var = tk.StringVar()
        self.credit_var = tk.StringVar()
        ttk.Entry(entry, textvariable=self.debit_var, width=14).grid(row=0, column=1, padx=5)
        ttk.Entry(entry, textvariable=self.credit_var, width=14).grid(row=0, column=2, padx=5)
        ttk.Button(entry, text="Add line", style="Primary.TButton", command=self._add_line).grid(row=0, column=3, padx=(8, 0))
        tk.Label(entry, text="Account", bg=COLORS["white"], fg=COLORS["muted"], font=("Segoe UI", 8)).grid(row=1, column=0, sticky="w")
        tk.Label(entry, text="Debit", bg=COLORS["white"], fg=COLORS["muted"], font=("Segoe UI", 8)).grid(row=1, column=1, sticky="w", padx=5)
        tk.Label(entry, text="Credit", bg=COLORS["white"], fg=COLORS["muted"], font=("Segoe UI", 8)).grid(row=1, column=2, sticky="w", padx=5)

        grid = tk.Frame(line_area, bg=COLORS["white"])
        grid.grid(row=1, column=0, sticky="nsew")
        grid.rowconfigure(0, weight=1)
        grid.columnconfigure(0, weight=1)
        self.tree = ttk.Treeview(grid, columns=("account", "name", "debit", "credit"), show="headings", height=10)
        for key, title, width, anchor in (
            ("account", "Account", 120, "w"), ("name", "Description", 350, "w"),
            ("debit", "Debit", 145, "e"), ("credit", "Credit", 145, "e"),
        ):
            self.tree.heading(key, text=title)
            self.tree.column(key, width=width, anchor=anchor)
        self.tree.grid(row=0, column=0, sticky="nsew")
        scroll = ttk.Scrollbar(grid, orient="vertical", command=self.tree.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self.tree.configure(yscrollcommand=scroll.set)

        totals = tk.Frame(line_area, bg="#f7f9fa", padx=15, pady=12)
        totals.grid(row=2, column=0, sticky="ew", pady=(10, 0))
        self.debit_total_var = tk.StringVar(value="0.00")
        self.credit_total_var = tk.StringVar(value="0.00")
        self.balance_var = tk.StringVar(value="Not balanced")
        tk.Label(totals, text="Total debits", bg="#f7f9fa", fg=COLORS["muted"]).pack(side="left")
        tk.Label(totals, textvariable=self.debit_total_var, bg="#f7f9fa", fg=COLORS["text"], font=("Segoe UI", 10, "bold")).pack(side="left", padx=(7, 24))
        tk.Label(totals, text="Total credits", bg="#f7f9fa", fg=COLORS["muted"]).pack(side="left")
        tk.Label(totals, textvariable=self.credit_total_var, bg="#f7f9fa", fg=COLORS["text"], font=("Segoe UI", 10, "bold")).pack(side="left", padx=(7, 24))
        tk.Label(totals, textvariable=self.balance_var, bg="#f7f9fa", fg=COLORS["red"], font=("Segoe UI", 9, "bold")).pack(side="right")

        footer = tk.Frame(outer, bg=COLORS["white"])
        footer.grid(row=4, column=0, sticky="ew", pady=(15, 0))
        ttk.Button(footer, text="Remove line", command=self._remove_line).pack(side="left")
        ttk.Button(footer, text="Cancel", command=self.destroy).pack(side="right", padx=(8, 0))
        ttk.Button(footer, text="Post journal entry", style="Primary.TButton", command=self._save).pack(side="right")

    @staticmethod
    def _field(parent, column, label, variable):
        box = tk.Frame(parent, bg="#f7f9fa")
        box.grid(row=0, column=column, sticky="ew", padx=(0, 10))
        tk.Label(box, text=label.upper(), bg="#f7f9fa", fg=COLORS["muted"], font=("Segoe UI", 8, "bold")).pack(anchor="w")
        ttk.Entry(box, textvariable=variable).pack(fill="x", pady=(6, 0))

    def _center(self, parent):
        self.update_idletasks()
        x = parent.winfo_rootx() + max(0, (parent.winfo_width() - self.winfo_width()) // 2)
        y = parent.winfo_rooty() + max(0, (parent.winfo_height() - self.winfo_height()) // 2)
        self.geometry(f"+{x}+{y}")

    def _add_line(self):
        account = self.account_map.get(self.account_var.get())
        if not account:
            messagebox.showerror("Choose an account", "Select a general ledger account.", parent=self)
            return
        try:
            debit = float(self.debit_var.get().replace(",", "") or 0)
            credit = float(self.credit_var.get().replace(",", "") or 0)
            if debit < 0 or credit < 0 or (debit > 0 and credit > 0) or (debit == 0 and credit == 0):
                raise ValueError("Enter a positive debit or credit on each line, but not both.")
        except ValueError as error:
            messagebox.showerror("Invalid journal line", str(error), parent=self)
            return
        self.lines.append({"account_code": account["account_code"], "account_name": account["account_name"], "debit": debit, "credit": credit})
        self.debit_var.set("")
        self.credit_var.set("")
        self._refresh_lines()

    def _remove_line(self):
        selected = self.tree.selection()
        if selected:
            self.lines.pop(int(selected[0]))
            self._refresh_lines()

    def _refresh_lines(self):
        self.tree.delete(*self.tree.get_children())
        debit_total = sum(line["debit"] for line in self.lines)
        credit_total = sum(line["credit"] for line in self.lines)
        for index, line in enumerate(self.lines):
            self.tree.insert("", "end", iid=str(index), values=(line["account_code"], line["account_name"], f"{line['debit']:,.2f}" if line["debit"] else "—", f"{line['credit']:,.2f}" if line["credit"] else "—"))
        self.debit_total_var.set(f"{debit_total:,.2f}")
        self.credit_total_var.set(f"{credit_total:,.2f}")
        balanced = len(self.lines) >= 2 and abs(debit_total - credit_total) < 0.005
        self.balance_var.set("Balanced" if balanced else f"Difference: {debit_total - credit_total:,.2f}")
        self.balance_var.configure(fg=COLORS["green"] if balanced else COLORS["red"])

    def _save(self):
        debit_total = sum(line["debit"] for line in self.lines)
        credit_total = sum(line["credit"] for line in self.lines)
        if len(self.lines) < 2 or abs(debit_total - credit_total) >= 0.005:
            messagebox.showerror("Entry is out of balance", "Add at least two lines and make total debits equal total credits.", parent=self)
            return
        posting_lines = [
            {"account_code": line["account_code"], "debit": line["debit"], "credit": line["credit"]}
            for line in self.lines
        ]
        try:
            journal_id = self.repository.post_journal(
                self.description_var.get(), self.reference_var.get(),
                self.date_var.get(), posting_lines,
            )
            if self.on_saved:
                self.on_saved(journal_id)
            self.destroy()
        except Exception as error:
            messagebox.showerror("Journal entry not posted", str(error), parent=self)


class DetailDialog(tk.Toplevel):
    def __init__(self, parent, title, summary, lines, currency):
        super().__init__(parent)
        self.title(title)
        self.configure(bg=COLORS["canvas"])
        self.geometry("820x600")
        self.minsize(640, 440)
        self.transient(parent)
        outer = tk.Frame(self, bg=COLORS["white"], padx=24, pady=20)
        outer.pack(fill="both", expand=True, padx=16, pady=16)
        tk.Label(outer, text=title, bg=COLORS["white"], fg=COLORS["text"], font=("Segoe UI", 18, "bold")).pack(anchor="w")
        summary_text = "    ·    ".join(f"{key}: {value}" for key, value in summary.items())
        tk.Label(outer, text=summary_text, bg=COLORS["white"], fg=COLORS["muted"], font=("Segoe UI", 9), wraplength=740, justify="left").pack(anchor="w", pady=(7, 18))
        frame = tk.Frame(outer, bg=COLORS["white"])
        frame.pack(fill="both", expand=True)
        is_journal = bool(lines and "account_code" in lines[0])
        if is_journal:
            columns = (
                ("account", "Account #", 125, "w"),
                ("description", "Account / line description", 360, "w"),
                ("debit", "Debit", 145, "e"),
                ("credit", "Credit", 145, "e"),
            )
        else:
            columns = (
                ("code", "Item code", 140, "w"),
                ("description", "Description", 290, "w"),
                ("quantity", "Quantity", 85, "e"),
                ("unit", "Unit price / cost", 130, "e"),
                ("total", "Line total", 130, "e"),
            )
        tree = ttk.Treeview(frame, columns=[column[0] for column in columns], show="headings")
        for key, caption, width, anchor in columns:
            tree.heading(key, text=caption)
            tree.column(key, width=width, anchor=anchor)
        for row in lines:
            if is_journal:
                values = (
                    row.get("account_code", ""),
                    row.get("account_name", row.get("description", "")),
                    f"{currency} {float(row.get('debit') or 0):,.2f}" if row.get("debit") else "—",
                    f"{currency} {float(row.get('credit') or 0):,.2f}" if row.get("credit") else "—",
                )
            else:
                values = (
                    row.get("code", ""), row.get("name", ""),
                    row.get("quantity", "—"),
                    f"{currency} {float(row.get('price') or 0):,.2f}",
                    f"{currency} {float(row.get('subtotal') or 0):,.2f}",
                )
            tree.insert("", "end", values=values)
        tree.pack(side="left", fill="both", expand=True)
        scrollbar = ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
        scrollbar.pack(side="right", fill="y")
        tree.configure(yscrollcommand=scrollbar.set)
        ttk.Button(outer, text="Close", command=self.destroy).pack(anchor="e", pady=(14, 0))
        _drag_handle(self, title)
        self.update_idletasks()
        x = parent.winfo_rootx() + max(0, (parent.winfo_width() - self.winfo_width()) // 2)
        y = parent.winfo_rooty() + max(0, (parent.winfo_height() - self.winfo_height()) // 2)
        self.geometry(f"+{x}+{y}")
