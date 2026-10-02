(() => {
  "use strict";

  const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
  const content = document.getElementById("page-content");
  const modal = document.getElementById("modal");
  const modalForm = document.getElementById("modal-form");
  const state = {
    page: "dashboard",
    currency: "XAF",
    company: "My Company",
    rows: [],
    selected: null,
    filterTimer: null,
    searchTimer: null,
    products: null,
    customers: null,
    suppliers: null,
    accounts: null,
  };

  const META = {
    dashboard: ["WORKSPACE", "Overview", "Your business at a glance"],
    sales: ["SALES & RECEIVABLES", "Sales invoices", "Create customer invoices and review posted sales."],
    customers: ["SALES & RECEIVABLES", "Customers", "Keep customer records and review their sales history."],
    payments: ["CASH & BANK", "Money in & out", "Record customer receipts and supplier payments."],
    purchases: ["PURCHASING & STOCK", "Purchase invoices", "Record supplier invoices and replenish inventory."],
    suppliers: ["PURCHASING & STOCK", "Suppliers", "Maintain your supplier list and purchasing history."],
    inventory: ["PURCHASING & STOCK", "Items & inventory", "Manage item codes, on-hand quantities, and weighted cost."],
    adjustments: ["PURCHASING & STOCK", "Stock adjustments", "Review posted physical-count variances."],
    accounts: ["ACCOUNTING", "Chart of accounts", "Maintain the accounts used by the general ledger."],
    journals: ["ACCOUNTING", "Journal entries", "Review posted batches and enter balanced general journals."],
    ledger: ["ACCOUNTING", "General ledger", "Trace account activity with opening and running balances."],
    reports: ["REPORTS", "Financial reports", "A clear view of performance, balances, and account activity."],
    trial_balance: ["REPORTS", "Trial balance", "Check account balances and confirm debits equal credits."],
    income_statement: ["REPORTS", "Income statement", "Review revenue, expenses, and net income for a period."],
    balance_sheet: ["REPORTS", "Balance sheet", "Review assets, liabilities, and equity at a point in time."],
    search: ["WORKSPACE", "Search results", "Find customers, suppliers, and inventory items."],
    settings: ["COMPANY", "Company settings", "Set your company name, reporting currency, and protect your company file."],
  };

  const LISTS = {
    sales: {
      endpoint: "/api/sales", noun: "sales invoice", newLabel: "New sales invoice", action: "sale",
      columns: [
        col("invoice", "Invoice #", "strong"),
        col("sale_date", "Posting date", "", row => shortDate(row.sale_date)),
        col("customer", "Customer"),
        col("payment_method", "Terms / method"),
        col("total", "Invoice total", "right", row => money(row.total)),
        col("status", "Status", "", row => pill(row.status, row.status === "On account" ? "warning" : "")),
        col("id", "", "right", row => `<button class="table-action" data-detail="sales" data-id="${esc(row.id)}">View</button>`),
      ],
    },
    purchases: {
      endpoint: "/api/purchases", noun: "purchase invoice", newLabel: "New purchase invoice", action: "purchase",
      columns: [
        col("invoice", "Invoice #", "strong"),
        col("purchase_date", "Posting date", "", row => shortDate(row.purchase_date)),
        col("supplier", "Supplier"),
        col("payment_method", "Terms / method"),
        col("total", "Invoice total", "right", row => money(row.total)),
        col("status", "Status", "", row => pill(row.status, row.status === "On account" ? "warning" : "")),
        col("id", "", "right", row => `<button class="table-action" data-detail="purchases" data-id="${esc(row.id)}">View</button>`),
      ],
    },
    customers: {
      endpoint: "/api/customers", noun: "customer", newLabel: "New customer", action: "customer", editable: true,
      columns: [
        col("id", "Customer #", "muted-cell", row => `CUS-${String(row.id).padStart(5, "0")}`),
        col("name", "Customer name", "strong"),
        col("phone", "Telephone", "", row => esc(row.phone || "—")),
        col("invoice_count", "Invoices", "right"),
        col("lifetime_sales", "Sales to date", "right", row => money(row.lifetime_sales)),
      ],
    },
    suppliers: {
      endpoint: "/api/suppliers", noun: "supplier", newLabel: "New supplier", action: "supplier", editable: true,
      columns: [
        col("id", "Supplier #", "muted-cell", row => `SUP-${String(row.id).padStart(5, "0")}`),
        col("name", "Supplier name", "strong"),
        col("phone", "Telephone", "", row => esc(row.phone || "—")),
        col("invoice_count", "Invoices", "right"),
        col("lifetime_purchases", "Purchases to date", "right", row => money(row.lifetime_purchases)),
      ],
    },
    inventory: {
      endpoint: "/api/products", noun: "inventory item", newLabel: "New item", action: "product", editable: true,
      columns: [
        col("code", "Item code", "strong"),
        col("name", "Description"),
        col("cost_price", "Unit cost", "right", row => money(row.cost_price)),
        col("price", "Selling price", "right", row => money(row.price)),
        col("unit_margin", "Margin", "right", row => money(row.unit_margin)),
        col("quantity", "On hand", "right", row => `<span class="${Number(row.quantity) <= 5 ? "warning-text" : ""}">${esc(row.quantity)}</span>`),
        col("stock_status", "Status", "", row => pill(row.stock_status, row.stock_status === "Reorder" ? "warning" : "")),
      ],
    },
    payments: {
      endpoint: "/api/payments", noun: "payment", newLabel: "Record a payment", action: "payment",
      columns: [
        col("reference", "Reference", "strong"),
        col("payment_date", "Date", "", row => shortDate(row.payment_date)),
        col("payment_type", "Type", "", row => esc(row.payment_type === "customer" ? "Customer receipt" : "Supplier payment")),
        col("party", "Customer / supplier"),
        col("payment_method", "Method"),
        col("amount", "Amount", "right", row => money(row.amount)),
        col("description", "Memo", "", row => esc(row.description || "—")),
      ],
    },
    accounts: {
      endpoint: "/api/accounts", noun: "account", newLabel: "Add account", action: "account",
      columns: [
        col("account_code", "Account #", "strong"),
        col("account_name", "Account name"),
        col("account_type", "Classification"),
        col("total_debit", "Total debits", "right", row => money(row.total_debit)),
        col("total_credit", "Total credits", "right", row => money(row.total_credit)),
        col("is_active", "Status", "", row => pill(row.is_active ? "Active" : "Inactive", row.is_active ? "" : "neutral")),
      ],
    },
    journals: {
      endpoint: "/api/journals", noun: "journal entry", newLabel: "New journal entry", action: "journal",
      columns: [
        col("entry_date", "Posting date", "", row => shortDate(row.entry_date)),
        col("reference", "Reference", "strong", row => esc(row.reference || "—")),
        col("description", "Description"),
        col("total_debit", "Debits", "right", row => money(row.total_debit)),
        col("total_credit", "Credits", "right", row => money(row.total_credit)),
        col("id", "", "right", row => `<button class="table-action" data-detail="journals" data-id="${esc(row.id)}">View</button>`),
      ],
    },
    adjustments: {
      endpoint: "/api/adjustments", noun: "stock adjustment", newLabel: "New physical count", action: "adjustment",
      columns: [
        col("id", "Adjustment #", "strong", row => `ADJ-${String(row.id).padStart(5, "0")}`),
        col("adjustment_date", "Posted", "", row => shortDate(row.adjustment_date)),
        col("product_code", "Item code"),
        col("product_name", "Description"),
        col("old_quantity", "System qty", "right"),
        col("new_quantity", "Counted qty", "right"),
        col("difference", "Variance", "right", row => signed(row.difference)),
        col("value_difference", "Value impact", "right", row => money(row.value_difference)),
      ],
    },
  };

  function col(key, label, className = "", formatter = null) {
    return { key, label, className, formatter };
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function money(value) {
    const amount = Number(value || 0);
    return `${esc(state.currency)} ${Number.isFinite(amount) ? amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
  }

  function shortDate(value) {
    if (!value) return "—";
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return esc(value);
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  }

  function signed(value) {
    const number = Number(value || 0);
    return `${number > 0 ? "+" : ""}${esc(number)}`;
  }

  function pill(label, kind = "") {
    return `<span class="status-pill ${kind}">${esc(label || "—")}</span>`;
  }

  function todayISO() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function monthStartISO() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }

  function request(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body) {
      headers.set("Content-Type", "application/json");
      headers.set("X-CSRF-Token", csrfToken);
    }
    return fetch(url, { ...options, headers, credentials: "same-origin" }).then(async response => {
      const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
      if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
      return data;
    });
  }

  function setHeader(page, overrideTitle = null) {
    const meta = META[page] || META.dashboard;
    const navPage = ["trial_balance", "income_statement", "balance_sheet"].includes(page) ? "reports" : page;
    document.getElementById("breadcrumb-section").textContent = meta[0];
    document.getElementById("breadcrumb-page").textContent = overrideTitle || meta[1];
    document.querySelectorAll(".nav-link[data-page]").forEach(button => {
      button.classList.toggle("active", button.dataset.page === navPage);
      button.setAttribute("aria-current", button.dataset.page === navPage ? "page" : "false");
    });
  }

  function pageHeading(page, actions = "") {
    const meta = META[page] || META.dashboard;
    return `<div class="page-heading"><div class="heading-copy"><p class="eyebrow">${esc(meta[0])}</p><h1>${esc(meta[1])}</h1><p class="subtitle">${esc(meta[2])}</p></div><div class="heading-actions">${actions}</div></div>`;
  }

  function button(label, action, primary = false, icon = "") {
    return `<button class="button ${primary ? "button-primary" : ""}" data-action="${esc(action)}">${icon ? `<span class="plus">${icon}</span>` : ""}${esc(label)}</button>`;
  }

  function statCard(label, value, note, icon, tone = "") {
    return `<article class="stat-card"><div class="stat-top"><span class="stat-label">${esc(label)}</span><span class="stat-icon ${tone}">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${note}</div></article>`;
  }

  async function navigate(page) {
    state.page = page;
    state.selected = null;
    closeSidebar();
    setHeader(page);
    content.innerHTML = `<div class="loading-state"><span class="spinner"></span><span>Loading ${esc((META[page] || META.dashboard)[1].toLowerCase())}…</span></div>`;
    try {
      if (page === "dashboard") await renderDashboard();
      else if (LISTS[page]) await renderList(page);
      else if (page === "reports") renderReports();
      else if (page === "trial_balance") await renderTrialBalance();
      else if (page === "income_statement") await renderIncomeStatement();
      else if (page === "balance_sheet") await renderBalanceSheet();
      else if (page === "ledger") await renderLedger();
      else if (page === "settings") await renderSettings();
      else if (page === "search") await renderSearch();
      else await renderDashboard();
    } catch (error) {
      content.innerHTML = `${pageHeading(page)}<div class="panel empty-state"><div class="empty-state-icon">!</div><h3>We couldn't open this page</h3><p>${esc(error.message)}</p><button class="button button-primary" data-action="refresh">Try again</button></div>`;
      toast(error.message, true);
    }
  }

  async function renderDashboard() {
    const data = await request("/api/dashboard");
    state.company = data.company || state.company;
    state.currency = data.currency || state.currency;
    document.getElementById("sidebar-company").textContent = state.company;
    document.getElementById("footer-currency").textContent = `${state.currency} · LOCAL COMPANY FILE · DOUBLE-ENTRY ACCOUNTING`;
    document.getElementById("top-date").textContent = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date());
    document.getElementById("nav-stock-count").textContent = Number(data.low_stock || 0) ? String(data.low_stock) : "";
    document.getElementById("nav-sales-count").textContent = Number(data.sales_mtd || 0) ? "" : "";

    const actions = `${button("New sales invoice", "sale", true, "+")}${button("New purchase", "purchase", false, "+")}`;
    const maxValue = Math.max(...(data.trend || []).map(row => Number(row.sales) || 0), 1);
    content.innerHTML = `${pageHeading("dashboard", actions)}
      <div class="stats-grid">
        ${statCard("Sales · month to date", money(data.sales_mtd), `<span class="stat-trend">${Number(data.customer_count || 0)} customers</span><span>· Posted invoices</span>`, "↗")}
        ${statCard("Cash & bank", money(data.cash_bank), `<span>Cash, bank & mobile money</span>`, "◉", "blue")}
        ${statCard("Accounts receivable", money(data.receivables), `<span>Outstanding customer balances</span>`, "↗", "gold")}
        ${statCard("Inventory at cost", money(data.inventory_value), `<span>${esc(data.active_products || 0)} items · ${esc(data.low_stock || 0)} low stock</span>`, "▤", Number(data.low_stock) ? "amber" : "")}
      </div>
      <div class="dashboard-main">
        <section class="panel chart-panel">
          <div class="panel-header"><div><h2 class="panel-title">Sales performance</h2><p class="panel-subtitle">Monthly posted sales · last six months</p></div><div class="chart-legend"><span class="legend-dot">Sales</span></div></div>
          <div class="chart-area">${trendChart(data.trend || [], maxValue)}</div>
        </section>
        <section class="panel quick-panel">
          <div class="panel-header"><div><h2 class="panel-title">Quick actions</h2><p class="panel-subtitle">Keep your day moving</p></div></div>
          <div class="quick-list">
            ${quickAction("↗", "Create a sales invoice", "Invoice a customer", "sale")}
            ${quickAction("↙", "Enter a purchase", "Record stock received", "purchase", "peach")}
            ${quickAction("⇄", "Record a payment", "Receive or pay money", "payment", "blue")}
            ${quickAction("⌁", "Count inventory", "Post a stock variance", "adjustment", "peach")}
          </div>
        </section>
      </div>
      <div class="dashboard-lower">
        <section class="panel table-panel"><div class="panel-header"><div><h2 class="panel-title">Recent activity</h2><p class="panel-subtitle">The latest documents posted to your books</p></div><button class="panel-link" data-page="sales">View sales →</button></div>
          ${activityTable(data.recent || [])}
        </section>
        <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Stock to review</h2><p class="panel-subtitle">Items at or below the reorder threshold</p></div><button class="panel-link" data-page="inventory">Inventory →</button></div>
          ${stockList(data.low_stock_items || [], data.low_stock || 0)}
        </section>
      </div>`;
  }

  function quickAction(icon, title, detail, action, tone = "") {
    return `<button class="quick-item" data-action="${esc(action)}"><span class="quick-icon ${tone}">${icon}</span><span class="quick-copy"><strong>${esc(title)}</strong><small>${esc(detail)}</small></span><span class="quick-arrow">›</span></button>`;
  }

  function trendChart(trend, maxValue) {
    const width = 650;
    const height = 166;
    const left = 42;
    const right = 635;
    const top = 12;
    const bottom = 132;
    const chartHeight = bottom - top;
    const slot = (right - left) / Math.max(trend.length, 1);
    const grid = [0, 1, 2, 3].map(index => {
      const y = top + chartHeight * index / 3;
      return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="chart-grid-line"/>`;
    }).join("");
    const bars = trend.map((row, index) => {
      const value = Number(row.sales) || 0;
      const barHeight = value ? Math.max(3, (chartHeight - 8) * value / maxValue) : 2;
      const x = left + slot * index + slot * .27;
      const y = bottom - barHeight;
      return `<rect x="${x}" y="${y}" width="${slot * .46}" height="${barHeight}" rx="4" class="chart-bar"/><text x="${left + slot * (index + .5)}" y="153" text-anchor="middle" class="chart-label">${esc(row.label)}</text>${value ? `<text x="${left + slot * (index + .5)}" y="${Math.max(9, y - 5)}" text-anchor="middle" class="chart-value">${esc(compact(value))}</text>` : ""}`;
    }).join("");
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly sales chart">${grid}${bars}</svg>`;
  }

  function compact(value) {
    const number = Number(value || 0);
    if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}m`;
    if (number >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
    return number.toFixed(0);
  }

  function activityTable(rows) {
    if (!rows.length) return `<div class="empty-inline">Your posted invoices and payments will appear here.</div>`;
    const body = rows.slice(0, 8).map(row => {
      const type = String(row.activity || "");
      const kind = type.toLowerCase().includes("purchase") ? "purchase" : type.toLowerCase().includes("payment") ? "payment" : "";
      const icon = kind === "purchase" ? "↙" : kind === "payment" ? "⇄" : "↗";
      return `<tr><td>${shortDate(row.posted_on)}</td><td><span class="activity-kind"><span class="kind-icon ${kind}">${icon}</span><span>${esc(row.reference)}</span></span></td><td>${esc(row.party)}</td><td>${esc(type)}</td><td class="align-right strong">${money(row.amount)}</td></tr>`;
    }).join("");
    return `<div class="table-scroll"><table class="data-table"><thead><tr><th>Date</th><th>Reference</th><th>Customer / supplier</th><th>Type</th><th class="align-right">Amount</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function stockList(items, lowCount) {
    if (!lowCount) return `<div class="empty-inline">Everything looks healthy. Items needing a reorder will appear here.</div>`;
    const rows = items.map(row => `<div class="stock-row"><span class="stock-flag">!</span><span class="stock-info"><strong>${esc(row.name)}</strong><small>${esc(row.code)} · ${money(row.cost_price)} per unit</small></span><span class="stock-quantity">${esc(row.quantity)} left</span></div>`).join("");
    return `<div class="low-stock-list">${rows}<button class="panel-link" data-page="inventory">${Number(lowCount) > items.length ? `See all ${esc(lowCount)} low-stock items` : "Review inventory"} →</button></div>`;
  }

  async function renderList(page) {
    const config = LISTS[page];
    const actions = `${config.editable ? button("Edit selected", "edit-selected") : ""}${button(config.newLabel, config.action, true, "+")}`;
    content.innerHTML = `${pageHeading(page, actions)}
      <div class="toolbar"><div class="toolbar-left"><label class="filter-field"><span>⌕</span><input id="list-filter" type="search" placeholder="Filter by name, code, reference…" autocomplete="off"></label><span class="record-count" id="record-count">Loading…</span></div><div class="toolbar-right"><button class="button" data-action="export">Export CSV</button><button class="button" data-action="refresh">↻ Refresh</button></div></div>
      <div class="list-shell" id="list-shell"><div class="loading-state"><span class="spinner"></span><span>Loading records…</span></div></div>`;
    const input = document.getElementById("list-filter");
    input.addEventListener("input", () => {
      clearTimeout(state.filterTimer);
      state.filterTimer = setTimeout(() => loadRows(page, input.value), 180);
    });
    await loadRows(page, "");
  }

  async function loadRows(page, query = "") {
    const config = LISTS[page];
    const queryString = query ? `?q=${encodeURIComponent(query)}` : "";
    const rows = await request(config.endpoint + queryString);
    if (state.page !== page) return;
    state.rows = rows;
    state.selected = null;
    const count = document.getElementById("record-count");
    if (count) count.textContent = `${rows.length} record${rows.length === 1 ? "" : "s"}`;
    const shell = document.getElementById("list-shell");
    if (!shell) return;
    if (!rows.length) {
      const copy = query ? `No records match “${esc(query)}”. Try a different search.` : `There are no ${esc(page === "sales" ? "sales invoices" : page === "purchases" ? "purchase invoices" : page)} yet. Create your first record to get started.`;
      shell.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${pageIcon(page)}</div><h3>${query ? "No matches found" : "Nothing here yet"}</h3><p>${copy}</p>${!query && config.action ? button(config.newLabel, config.action, true, "+") : ""}</div>`;
      return;
    }
    const heads = config.columns.map(column => `<th class="${column.className.includes("right") ? "align-right" : ""}">${esc(column.label)}</th>`).join("");
    const body = rows.map((row, index) => `<tr data-row-index="${index}">${config.columns.map(column => {
      let value;
      if (column.formatter) value = column.formatter(row);
      else value = esc(row[column.key] ?? "—");
      return `<td class="${column.className.includes("right") ? "align-right" : ""} ${column.className.includes("strong") ? "strong" : ""} ${column.className.includes("muted-cell") ? "muted-cell" : ""}">${value}</td>`;
    }).join("")}</tr>`).join("");
    shell.innerHTML = `<div class="table-scroll"><table class="data-table"><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function pageIcon(page) {
    return ({ sales: "↗", purchases: "↙", customers: "♙", suppliers: "♧", inventory: "▤", payments: "⇄", accounts: "▦", journals: "≡", adjustments: "⌁" })[page] || "＋";
  }

  function renderReports() {
    const cards = [
      ["▧", "General ledger", "Account detail and running balances", "ledger"],
      ["≡", "Trial balance", "Check debits, credits, and account totals", "trial_balance"],
      ["↗", "Income statement", "Revenue, expenses, and net income", "income_statement"],
      ["◫", "Balance sheet", "Assets, liabilities, and equity", "balance_sheet"],
      ["▤", "Sales invoices", "Review customer invoices and sales totals", "sales"],
      ["▣", "Purchases", "Review supplier invoices and spend", "purchases"],
      ["⇄", "Cash activity", "Receipts, payments, and money movement", "payments"],
      ["▥", "Inventory valuation", "On-hand units at weighted-average cost", "inventory"],
      ["⌁", "Stock adjustments", "Physical counts and inventory variances", "adjustments"],
    ];
    content.innerHTML = `${pageHeading("reports")}<div class="report-grid">${cards.map(([icon, title, description, page]) => `<button class="report-card" data-page="${page}"><span class="report-icon">${icon}</span><h3>${title}</h3><p>${description}</p><span class="open-report">Open report <span aria-hidden="true">→</span></span></button>`).join("")}</div><section class="panel" style="margin-top:15px"><div class="panel-header"><div><h2 class="panel-title">Accounting workspace</h2><p class="panel-subtitle">Every posted document flows through to the general ledger.</p></div><span class="status-pill">Double-entry enabled</span></div><div class="empty-inline" style="padding:4px 16px 18px;text-align:left">Sales, purchasing, payments, inventory, and manual journals are posted as balanced journal entries. Export any table to CSV for further analysis.</div></section>`;
  }

  async function renderTrialBalance() {
    const date = todayISO();
    content.innerHTML = `${pageHeading("trial_balance", `<button class="button" data-action="print">Print</button><button class="button" data-action="export-report">Export CSV</button>`)}<div class="toolbar"><div class="toolbar-left"><label class="field" style="flex-direction:row;align-items:center;gap:8px"><span class="record-count">AS OF DATE</span><input id="report-as-of" type="date" value="${date}" style="width:150px;height:31px"></label><button class="button button-primary" data-action="run-trial">Refresh statement</button></div><div class="toolbar-right record-count" id="report-status">Loading balances…</div></div><div id="report-body" class="list-shell"><div class="loading-state"><span class="spinner"></span></div></div>`;
    await loadTrialBalance(date);
  }

  async function loadTrialBalance(asOf) {
    const data = await request(`/api/reports/trial-balance?as_of=${encodeURIComponent(asOf)}`);
    const isBalanced = Math.abs(Number(data.debits) - Number(data.credits)) < 0.01;
    document.getElementById("report-status").textContent = isBalanced ? "Debits equal credits" : `Out of balance by ${money(Number(data.debits) - Number(data.credits))}`;
    const body = data.rows.map(row => `<tr><td class="strong">${esc(row.account_code)}</td><td>${esc(row.account_name)}</td><td>${esc(row.account_type)}</td><td class="align-right">${money(row.debit)}</td><td class="align-right">${money(row.credit)}</td><td class="align-right strong">${money(row.balance)}</td></tr>`).join("");
    document.getElementById("report-body").innerHTML = `<div class="statement-note ${isBalanced ? "" : "warn"}">${isBalanced ? "✓" : "!"} ${isBalanced ? "This trial balance is in balance." : "Debits and credits do not agree. Review the general ledger."} ${data.rows.length} accounts as of ${shortDate(asOf)}.</div><div class="table-scroll"><table class="data-table"><thead><tr><th>Account #</th><th>Account name</th><th>Type</th><th class="align-right">Debits</th><th class="align-right">Credits</th><th class="align-right">Balance</th></tr></thead><tbody>${body}<tr><td></td><td class="strong">TOTAL</td><td></td><td class="align-right strong">${money(data.debits)}</td><td class="align-right strong">${money(data.credits)}</td><td></td></tr></tbody></table></div>`;
    state.rows = data.rows;
    state.reportColumns = ["account_code", "account_name", "account_type", "debit", "credit", "balance"];
  }

  async function renderIncomeStatement() {
    content.innerHTML = `${pageHeading("income_statement", `<button class="button" data-action="print">Print</button><button class="button" data-action="export-report">Export CSV</button>`)}<div class="toolbar"><div class="toolbar-left"><label class="field" style="flex-direction:row;align-items:center;gap:7px"><span class="record-count">FROM</span><input id="report-start" type="date" value="${new Date().getFullYear()}-01-01" style="width:145px;height:31px"></label><label class="field" style="flex-direction:row;align-items:center;gap:7px"><span class="record-count">THROUGH</span><input id="report-end" type="date" value="${todayISO()}" style="width:145px;height:31px"></label><button class="button button-primary" data-action="run-income">Run statement</button></div></div><div id="report-body" style="margin-top:13px"><div class="loading-state"><span class="spinner"></span></div></div>`;
    await loadIncomeStatement(`${new Date().getFullYear()}-01-01`, todayISO());
  }

  async function loadIncomeStatement(start, end) {
    const data = await request(`/api/reports/income-statement?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    const rows = data.rows.filter(row => Math.abs(Number(row.amount)) > 0.0001);
    document.getElementById("report-body").innerHTML = `<div class="summary-row"><div class="summary-chip"><small>Revenue</small><strong>${money(data.revenue)}</strong></div><div class="summary-chip"><small>Expenses</small><strong>${money(data.expenses)}</strong></div><div class="summary-chip"><small>${Number(data.net_income) >= 0 ? "Net income" : "Net loss"}</small><strong>${money(Math.abs(data.net_income))}</strong></div></div><div class="list-shell"><div class="table-scroll"><table class="data-table"><thead><tr><th>Account #</th><th>Account name</th><th>Classification</th><th class="align-right">Period amount</th></tr></thead><tbody>${rows.map(row => `<tr><td class="strong">${esc(row.account_code)}</td><td>${esc(row.account_name)}</td><td>${esc(row.account_type)}</td><td class="align-right">${money(row.amount)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted-cell">No revenue or expense activity in this period.</td></tr>`}</tbody></table></div></div>`;
    state.rows = rows;
    state.reportColumns = ["account_code", "account_name", "account_type", "amount"];
    state.reportSummary = { revenue: data.revenue, expenses: data.expenses, net_income: data.net_income };
  }

  async function renderBalanceSheet() {
    content.innerHTML = `${pageHeading("balance_sheet", `<button class="button" data-action="print">Print</button><button class="button" data-action="export-report">Export CSV</button>`)}<div class="toolbar"><div class="toolbar-left"><label class="field" style="flex-direction:row;align-items:center;gap:8px"><span class="record-count">AS OF DATE</span><input id="report-as-of" type="date" value="${todayISO()}" style="width:150px;height:31px"></label><button class="button button-primary" data-action="run-balance">Refresh statement</button></div></div><div id="report-body" style="margin-top:13px"><div class="loading-state"><span class="spinner"></span></div></div>`;
    await loadBalanceSheet(todayISO());
  }

  async function loadBalanceSheet(asOf) {
    const data = await request(`/api/reports/balance-sheet?as_of=${encodeURIComponent(asOf)}`);
    const t = data.totals;
    const difference = Number(t.Asset) - Number(t["Liabilities and equity"]);
    const rows = data.rows;
    document.getElementById("report-body").innerHTML = `<div class="summary-row"><div class="summary-chip"><small>Total assets</small><strong>${money(t.Asset)}</strong></div><div class="summary-chip"><small>Total liabilities</small><strong>${money(t.Liability)}</strong></div><div class="summary-chip"><small>Equity + earnings</small><strong>${money(Number(t["Equity"]) + Number(t["Current earnings"]))}</strong></div></div><div class="statement-note ${Math.abs(difference) < .01 ? "" : "warn"}">${Math.abs(difference) < .01 ? "✓ The balance sheet balances." : `! Balance sheet difference: ${money(difference)}`} As of ${shortDate(asOf)}.</div><div class="list-shell"><div class="table-scroll"><table class="data-table"><thead><tr><th>Section</th><th>Account #</th><th>Account name</th><th class="align-right">Balance</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.account_type)}</td><td class="strong">${esc(row.account_code)}</td><td>${esc(row.account_name)}</td><td class="align-right">${money(row.amount)}</td></tr>`).join("")}<tr><td class="strong">TOTAL</td><td></td><td class="strong">Assets</td><td class="align-right strong">${money(t.Asset)}</td></tr><tr><td class="strong">TOTAL</td><td></td><td class="strong">Liabilities & equity</td><td class="align-right strong">${money(t["Liabilities and equity"])}</td></tr></tbody></table></div></div>`;
    state.rows = rows;
    state.reportColumns = ["account_type", "account_code", "account_name", "amount"];
  }

  async function renderLedger() {
    const accounts = await request("/api/accounts");
    state.accounts = accounts;
    const options = accounts.map(row => `<option value="${esc(row.account_code)}">${esc(row.account_code)} · ${esc(row.account_name)}</option>`).join("");
    content.innerHTML = `${pageHeading("ledger", `<button class="button" data-action="print">Print</button><button class="button" data-action="export-report">Export CSV</button>`)}<div class="toolbar"><div class="toolbar-left"><label class="field" style="flex-direction:row;align-items:center;gap:7px"><span class="record-count">ACCOUNT</span><select id="ledger-account" style="width:min(260px,40vw);height:31px">${options}</select></label><label class="field" style="flex-direction:row;align-items:center;gap:7px"><span class="record-count">FROM</span><input id="ledger-start" type="date" value="${monthStartISO()}" style="width:140px;height:31px"></label><label class="field" style="flex-direction:row;align-items:center;gap:7px"><span class="record-count">THROUGH</span><input id="ledger-end" type="date" value="${todayISO()}" style="width:140px;height:31px"></label><button class="button button-primary" data-action="run-ledger">Run inquiry</button></div></div><div id="report-body" style="margin-top:13px"><div class="loading-state"><span class="spinner"></span></div></div>`;
    if (accounts.length) await loadLedger(accounts[0].account_code, monthStartISO(), todayISO());
  }

  async function loadLedger(accountCode, start, end) {
    const data = await request(`/api/ledger?account_code=${encodeURIComponent(accountCode)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    if (!data.account) throw new Error("Account was not found.");
    const rows = data.rows;
    const ending = rows.length ? rows[rows.length - 1].balance : data.opening;
    document.getElementById("report-body").innerHTML = `<div class="summary-row"><div class="summary-chip"><small>Account</small><strong style="font-size:12px">${esc(data.account.account_code)} · ${esc(data.account.account_name)}</strong></div><div class="summary-chip"><small>Opening balance</small><strong>${money(data.opening)}</strong></div><div class="summary-chip"><small>Closing balance</small><strong>${money(ending)}</strong></div></div><div class="list-shell"><div class="table-scroll"><table class="data-table"><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th class="align-right">Debit</th><th class="align-right">Credit</th><th class="align-right">Running balance</th></tr></thead><tbody>${rows.map(row => `<tr><td>${shortDate(row.entry_date)}</td><td class="strong">${esc(row.reference || "—")}</td><td>${esc(row.description || row.journal_description || "—")}</td><td class="align-right">${Number(row.debit) ? money(row.debit) : "—"}</td><td class="align-right">${Number(row.credit) ? money(row.credit) : "—"}</td><td class="align-right strong">${money(row.balance)}</td></tr>`).join("") || `<tr><td colspan="6" class="muted-cell">No ledger activity in this date range.</td></tr>`}</tbody></table></div></div>`;
    state.rows = rows;
    state.reportColumns = ["entry_date", "reference", "description", "debit", "credit", "balance"];
  }

  async function renderSettings() {
    const settings = await request("/api/settings");
    state.company = settings.company_name || "My Company";
    state.currency = settings.currency_code || "XAF";
    document.getElementById("sidebar-company").textContent = state.company;
    document.getElementById("footer-currency").textContent = `${state.currency} · LOCAL COMPANY FILE · DOUBLE-ENTRY ACCOUNTING`;
    content.innerHTML = `${pageHeading("settings")}<div class="settings-grid"><section class="settings-card"><h2>Company identity</h2><p>These details appear across the company workspace and on financial reports.</p><form id="settings-form"><div class="form-grid"><div class="field span-2"><label for="company-name">Company display name</label><input id="company-name" name="company_name" required maxlength="120" value="${esc(settings.company_name)}" placeholder="e.g. Kora Retail & Supply"></div><div class="field"><label for="currency-code">Reporting currency</label><input id="currency-code" name="currency_code" required minlength="3" maxlength="3" pattern="[A-Za-z]{3}" value="${esc(settings.currency_code)}" placeholder="XAF"></div><div class="field"><label>Accounting method</label><input value="Double-entry" disabled></div></div><div class="form-actions"><button class="button button-primary" type="submit">Save company settings</button></div></form></section><section class="settings-card help-card"><h2>Protect your company file</h2><p>Your books are stored in a local SQLite company file. Keep a separate backup before moving this computer or making major changes.</p><button class="button button-soft" data-action="download-backup">↓ Download company backup</button><ul class="help-list"><li><span class="help-check">✓</span><span>Backups include customers, invoices, inventory, and ledger history.</span></li><li><span class="help-check">✓</span><span>The download is a portable SQLite database file.</span></li><li><span class="help-check">!</span><span>This local workspace is for one trusted operator at a time.</span></li></ul></section></div>`;
    document.getElementById("settings-form").addEventListener("submit", saveSettings);
  }

  async function renderSearch() {
    const query = document.getElementById("global-search").value.trim();
    const rows = await request(`/api/search?q=${encodeURIComponent(query)}`);
    const columns = [
      col("kind", "Record type", "", row => pill(row.kind)),
      col("label", "Description", "strong"),
      col("detail", "Code / telephone"),
      col("id", "", "right", row => row.kind === "Item" ? `<button class="table-action" data-page="inventory">Open inventory</button>` : row.kind === "Customer" ? `<button class="table-action" data-page="customers">Open customers</button>` : `<button class="table-action" data-page="suppliers">Open suppliers</button>`),
    ];
    state.rows = rows;
    content.innerHTML = `${pageHeading("search", `<button class="button" data-page="dashboard">Back to overview</button>`)}<div class="toolbar"><div class="toolbar-left"><span class="record-count">${rows.length} result${rows.length === 1 ? "" : "s"} for “${esc(query)}”</span></div></div><div class="list-shell">${rows.length ? `<div class="table-scroll"><table class="data-table"><thead><tr>${columns.map(item => `<th>${esc(item.label)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(item => `<td>${item.formatter ? item.formatter(row) : esc(row[item.key] || "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<div class="empty-state"><div class="empty-state-icon">⌕</div><h3>No records found</h3><p>Try a name, item code, or telephone number.</p></div>`}</div>`;
  }

  function openModal({ title, eyebrow = "NEW RECORD", description = "", body, submitLabel = "Save record", onSubmit, wide = false }) {
    document.getElementById("modal-eyebrow").textContent = eyebrow;
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-description").textContent = description;
    modal.querySelector(".modal-card").classList.toggle("modal-wide", wide);
    modalForm.innerHTML = `${body}<div class="modal-footer"><span class="modal-footer-note">Posted entries update your company records and general ledger.</span><span class="modal-footer-actions"><button class="button" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">${esc(submitLabel)}</button></span></div>`;
    modalForm.onsubmit = async event => {
      event.preventDefault();
      const submit = modalForm.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.textContent = "Saving…";
      try {
        const result = await onSubmit(new FormData(modalForm));
        modal.close();
        toast(result?.message || "Saved successfully.");
        if (result?.backup) return;
        const next = state.page;
        if (next === "settings") await renderSettings();
        else if (LISTS[next]) await renderList(next);
        else await navigate(next);
      } catch (error) {
        toast(error.message, true);
        submit.disabled = false;
        submit.textContent = submitLabel;
      }
    };
    modal.showModal();
    const first = modalForm.querySelector("input:not([type=hidden]):not([disabled]), select, textarea");
    if (first) first.focus({ preventScroll: true });
  }

  function field(label, name, type = "text", value = "", options = {}) {
    const id = `field-${name.replace(/[^a-z0-9_-]/gi, "-")}`;
    const span = options.span ? "span-2" : "";
    const required = options.required === false ? "" : "required";
    const extra = options.extra || "";
    let input;
    if (type === "select") {
      input = `<select id="${id}" name="${esc(name)}" ${required} ${extra}>${options.placeholder ? `<option value="">${esc(options.placeholder)}</option>` : ""}${options.options || ""}</select>`;
    } else if (type === "textarea") {
      input = `<textarea id="${id}" name="${esc(name)}" ${required} ${extra}>${esc(value)}</textarea>`;
    } else {
      input = `<input id="${id}" name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${required} ${extra}>`;
    }
    return `<div class="field ${span}"><label for="${id}">${esc(label)}</label>${input}${options.hint ? `<small class="hint">${esc(options.hint)}</small>` : ""}</div>`;
  }

  async function openCustomer(record = null) {
    openModal({
      title: record ? "Edit customer" : "New customer",
      eyebrow: "CUSTOMER RECORD",
      description: "Customer details are used on invoices and in account activity.",
      body: `<div class="modal-fields">${field("Customer name", "name", "text", record?.name || "", { extra: "maxlength=120" })}${field("Telephone / mobile", "phone", "tel", record?.phone || "", { required: false, extra: "maxlength=40" })}</div>`,
      submitLabel: record ? "Save changes" : "Create customer",
      onSubmit: async form => request("/api/customers", { method: "POST", body: JSON.stringify({ id: record?.id || null, name: form.get("name"), phone: form.get("phone") }) }),
    });
  }

  async function openSupplier(record = null) {
    openModal({
      title: record ? "Edit supplier" : "New supplier",
      eyebrow: "SUPPLIER RECORD",
      description: "Supplier details are used when recording purchases and payments.",
      body: `<div class="modal-fields">${field("Supplier name", "name", "text", record?.name || "", { extra: "maxlength=120" })}${field("Telephone / mobile", "phone", "tel", record?.phone || "", { required: false, extra: "maxlength=40" })}</div>`,
      submitLabel: record ? "Save changes" : "Create supplier",
      onSubmit: async form => request("/api/suppliers", { method: "POST", body: JSON.stringify({ id: record?.id || null, name: form.get("name"), phone: form.get("phone") }) }),
    });
  }

  async function openProduct(record = null) {
    openModal({
      title: record ? "Edit inventory item" : "Create inventory item",
      eyebrow: "ITEM MASTER",
      description: "Products use weighted-average cost. Opening inventory is posted to the ledger when created.",
      body: `<div class="modal-fields">${field("Item / SKU code", "code", "text", record?.code || "", { extra: "maxlength=50" })}${field("Item description", "name", "text", record?.name || "", { extra: "maxlength=160" })}${field("Weighted-average unit cost", "cost_price", "number", record ? Number(record.cost_price).toFixed(2) : "0.00", { extra: `min=0 step=0.01 ${record ? "readonly" : ""}`, hint: record ? "Cost is recalculated when purchases are posted." : "Used to value opening inventory." })}${field("Selling price", "selling_price", "number", record ? Number(record.price).toFixed(2) : "0.00", { extra: "min=0 step=0.01" })}${field("Opening quantity", "opening_quantity", "number", record ? String(record.quantity) : "0", { extra: `min=0 step=1 ${record ? "readonly" : ""}`, hint: record ? "Correct quantities using a physical count." : "Use zero if you will enter a purchase first." })}</div>`,
      submitLabel: record ? "Save item" : "Create item",
      onSubmit: async form => request("/api/products", { method: "POST", body: JSON.stringify({ id: record?.id || null, code: form.get("code"), name: form.get("name"), cost_price: form.get("cost_price"), selling_price: form.get("selling_price"), opening_quantity: form.get("opening_quantity") }) }),
    });
  }

  async function loadProductChoices() {
    if (!state.products) state.products = await request("/api/products");
    return state.products;
  }

  async function loadPartyChoices(kind) {
    const key = kind === "customer" ? "customers" : "suppliers";
    if (!state[key]) state[key] = await request(`/api/${key}`);
    return state[key];
  }

  async function openInvoice(kind) {
    const isSale = kind === "sale";
    const products = await loadProductChoices();
    if (!products.length) {
      toast("Add an inventory item before creating an invoice.", true);
      await navigate("inventory");
      return;
    }
    const parties = await loadPartyChoices(isSale ? "customer" : "supplier");
    if (!isSale && !parties.length) {
      toast("Add a supplier before entering a purchase invoice.", true);
      await navigate("suppliers");
      return;
    }
    const options = products.map(item => `<option value="${esc(item.id)}" data-selling="${esc(item.price)}" data-cost="${esc(item.cost_price)}" data-stock="${esc(item.quantity)}">${esc(item.code)} · ${esc(item.name)} (${esc(item.quantity)} on hand)</option>`).join("");
    const partyOptions = parties.map(party => `<option value="${esc(party.id)}">${esc(party.name)}</option>`).join("");
    const title = isSale ? "New sales invoice" : "New purchase invoice";
    const partyField = isSale
      ? field("Customer", "customer_id", "select", "", { required: false, placeholder: "Walk-in customer", options: partyOptions })
      : field("Supplier", "supplier_id", "select", "", { placeholder: "Choose a supplier", options: partyOptions });
    const methods = isSale
      ? `<option>Cash</option><option>Bank</option><option>Mobile Money</option><option>Accounts Receivable</option>`
      : `<option>Cash</option><option>Bank</option><option>Mobile Money</option><option>Accounts Payable</option>`;
    const row = `<tr class="invoice-line"><td><select class="line-product" required>${options}</select></td><td><input class="line-quantity" type="number" min="1" step="1" value="1" required></td><td><input class="line-price" type="number" min="0" step="0.01" value="0.00" required></td><td class="line-subtotal">${money(0)}</td><td><button type="button" class="remove-line" title="Remove line">×</button></td></tr>`;
    const body = `<div class="modal-fields">${partyField}${field("Posting date", "posted_date", "date", todayISO())}${field("Payment terms / method", "payment_method", "select", "", { options: methods })}</div><div class="field span-2" style="margin-top:16px"><label>Invoice items</label><table class="line-items"><thead><tr><th>Item</th><th>Qty</th><th>${isSale ? "Unit price" : "Unit cost"}</th><th>Line total</th><th></th></tr></thead><tbody id="invoice-lines">${row}</tbody></table><button type="button" class="button button-soft" data-action="add-invoice-line" style="margin-top:7px">+ Add another item</button><div class="line-total"><span>Invoice total</span><strong id="invoice-total">${money(0)}</strong></div></div>`;
    openModal({
      title,
      eyebrow: isSale ? "ACCOUNTS RECEIVABLE" : "ACCOUNTS PAYABLE",
      description: isSale ? "Posting updates stock on hand and creates the matching general ledger entries." : "Posting receives stock at a weighted-average cost and updates the general ledger.",
      body,
      submitLabel: isSale ? "Post sales invoice" : "Post purchase invoice",
      onSubmit: async form => {
        const items = [...modalForm.querySelectorAll(".invoice-line")].map(line => ({
          product_id: line.querySelector(".line-product").value,
          quantity: line.querySelector(".line-quantity").value,
          [isSale ? "unit_price" : "unit_cost"]: line.querySelector(".line-price").value,
        }));
        const payload = {
          payment_method: form.get("payment_method"),
          posted_date: form.get("posted_date"),
          items,
        };
        payload[isSale ? "customer_id" : "supplier_id"] = form.get(isSale ? "customer_id" : "supplier_id");
        return request(isSale ? "/api/sales" : "/api/purchases", { method: "POST", body: JSON.stringify(payload) });
      },
    });
    modal.dataset.invoiceKind = kind;
    modalForm.querySelectorAll(".invoice-line").forEach(bindInvoiceLine);
    modalForm.querySelector("[data-action=add-invoice-line]").addEventListener("click", () => {
      const bodyRows = modalForm.querySelector("#invoice-lines");
      const newRow = document.createElement("tr");
      newRow.className = "invoice-line";
      newRow.innerHTML = `<td><select class="line-product" required>${options}</select></td><td><input class="line-quantity" type="number" min="1" step="1" value="1" required></td><td><input class="line-price" type="number" min="0" step="0.01" value="0.00" required></td><td class="line-subtotal">${money(0)}</td><td><button type="button" class="remove-line" title="Remove line">×</button></td>`;
      bodyRows.appendChild(newRow);
      bindInvoiceLine(newRow);
    });
  }

  function bindInvoiceLine(row) {
    const isSale = modal.dataset.invoiceKind === "sale";
    const product = row.querySelector(".line-product");
    const quantity = row.querySelector(".line-quantity");
    const price = row.querySelector(".line-price");
    product.addEventListener("change", () => {
      const option = product.selectedOptions[0];
      const value = isSale ? option.dataset.selling : option.dataset.cost;
      price.value = Number(value || 0).toFixed(2);
      updateInvoiceTotal();
    });
    [quantity, price].forEach(input => input.addEventListener("input", updateInvoiceTotal));
    row.querySelector(".remove-line").addEventListener("click", () => {
      const rows = modalForm.querySelectorAll(".invoice-line");
      if (rows.length > 1) row.remove();
      updateInvoiceTotal();
    });
    product.dispatchEvent(new Event("change"));
  }

  function updateInvoiceTotal() {
    let total = 0;
    modalForm.querySelectorAll(".invoice-line").forEach(row => {
      const quantity = Number(row.querySelector(".line-quantity").value || 0);
      const price = Number(row.querySelector(".line-price").value || 0);
      const line = quantity * price;
      total += line;
      row.querySelector(".line-subtotal").textContent = money(line);
    });
    const element = modalForm.querySelector("#invoice-total");
    if (element) element.textContent = money(total);
  }

  async function openPayment() {
    const parties = await Promise.all([loadPartyChoices("customer"), loadPartyChoices("supplier")]);
    const body = `<div class="modal-fields">${field("Payment type", "payment_type", "select", "", { options: `<option value="customer">Customer receipt</option><option value="supplier">Supplier payment</option>` })}<div id="payment-party-wrap" class="field"><label for="payment-party">Customer</label><select id="payment-party" name="party_id" required></select></div>${field("Amount", "amount", "number", "", { extra: "min=0.01 step=0.01" })}${field("Payment method", "method", "select", "", { options: `<option>Cash</option><option>Bank</option><option>Mobile Money</option>` })}${field("Payment date", "posted_date", "date", todayISO())}${field("Memo / reference", "description", "text", "", { required: false, span: true, extra: "maxlength=240" })}</div>`;
    openModal({
      title: "Record a payment",
      eyebrow: "CASH & BANK",
      description: "Post a customer receipt or supplier payment to the selected cash or bank account.",
      body,
      submitLabel: "Post payment",
      onSubmit: async form => request("/api/payments", { method: "POST", body: JSON.stringify({ payment_type: form.get("payment_type"), party_id: form.get("party_id"), amount: form.get("amount"), method: form.get("method"), posted_date: form.get("posted_date"), description: form.get("description") }) }),
    });
    const kindSelect = modalForm.querySelector('[name="payment_type"]');
    const partySelect = modalForm.querySelector("#payment-party");
    const partyLabel = modalForm.querySelector("#payment-party-wrap label");
    const refreshPartyOptions = () => {
      const isCustomer = kindSelect.value === "customer";
      const rows = isCustomer ? parties[0] : parties[1];
      partyLabel.textContent = isCustomer ? "Customer" : "Supplier";
      partySelect.innerHTML = rows.map(row => `<option value="${esc(row.id)}">${esc(row.name)}</option>`).join("");
      if (!rows.length) toast(`Add a ${isCustomer ? "customer" : "supplier"} before posting this payment.`, true);
    };
    kindSelect.addEventListener("change", refreshPartyOptions);
    refreshPartyOptions();
  }

  async function openAdjustment() {
    const products = await loadProductChoices();
    if (!products.length) {
      toast("Create an item before entering a physical count.", true);
      await navigate("inventory");
      return;
    }
    const options = products.map(item => `<option value="${esc(item.id)}" data-quantity="${esc(item.quantity)}">${esc(item.code)} · ${esc(item.name)} (${esc(item.quantity)} on hand)</option>`).join("");
    const body = `<div class="modal-fields">${field("Inventory item", "product_id", "select", "", { options })}${field("Counted quantity", "physical_quantity", "number", "", { extra: "min=0 step=1" })}<div class="field span-2"><span class="hint" id="adjustment-current">Select an item to view the system quantity.</span></div></div>`;
    openModal({
      title: "Record a physical count",
      eyebrow: "INVENTORY CONTROL",
      description: "A variance is posted to inventory and the stock-adjustment account. Posted counts remain in the audit history.",
      body,
      submitLabel: "Post stock count",
      onSubmit: async form => request("/api/adjustments", { method: "POST", body: JSON.stringify({ product_id: form.get("product_id"), physical_quantity: form.get("physical_quantity") }) }),
    });
    const select = modalForm.querySelector('[name="product_id"]');
    const update = () => {
      const option = select.selectedOptions[0];
      document.getElementById("adjustment-current").textContent = `System quantity: ${option?.dataset.quantity || 0} units`;
    };
    select.addEventListener("change", update);
    update();
  }

  async function openJournal() {
    const accounts = state.accounts || await request("/api/accounts");
    state.accounts = accounts;
    const options = accounts.filter(row => row.is_active).map(row => `<option value="${esc(row.account_code)}">${esc(row.account_code)} · ${esc(row.account_name)}</option>`).join("");
    const body = `<div class="modal-fields">${field("Description", "description", "text", "", { span: true, extra: "maxlength=240" })}${field("Reference", "reference", "text", "", { required: false, extra: "maxlength=60" })}${field("Posting date", "entry_date", "date", todayISO())}</div><div class="field" style="margin-top:15px"><label>Journal lines · enter matching debit and credit totals</label><div class="journal-line-grid journal-labels"><span class="hint">Account</span><span class="hint">Debit</span><span class="hint">Credit</span><span></span></div><div id="journal-lines">${journalLine(options)}${journalLine(options)}</div><button type="button" class="button button-soft" data-action="add-journal-line" style="margin-top:8px">+ Add line</button><div id="journal-balance" class="journal-balance">Debits 0.00 · Credits 0.00 · Difference 0.00</div></div>`;
    openModal({
      title: "New journal entry",
      eyebrow: "GENERAL LEDGER",
      description: "Manual journal entries must balance before they can be posted.",
      body,
      submitLabel: "Post journal entry",
      onSubmit: async form => {
        const lines = [...modalForm.querySelectorAll(".journal-line-grid:not(.journal-labels)")].map(row => ({ account_code: row.querySelector("select").value, debit: row.querySelector("[data-side=debit]").value || 0, credit: row.querySelector("[data-side=credit]").value || 0 }));
        return request("/api/journals", { method: "POST", body: JSON.stringify({ description: form.get("description"), reference: form.get("reference"), entry_date: form.get("entry_date"), lines }) });
      },
    });
    const lines = modalForm.querySelector("#journal-lines");
    lines.querySelectorAll(".journal-line-grid:not(.journal-labels)").forEach(bindJournalLine);
    modalForm.querySelector("[data-action=add-journal-line]").addEventListener("click", () => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = journalLine(options);
      const row = wrapper.firstElementChild;
      lines.appendChild(row);
      bindJournalLine(row);
    });
    updateJournalBalance();
  }

  function journalLine(options) {
    return `<div class="journal-line-grid"> <select required>${options}</select><input data-side="debit" type="number" min="0" step="0.01" placeholder="0.00"><input data-side="credit" type="number" min="0" step="0.01" placeholder="0.00"><button class="remove-line" type="button" title="Remove line">×</button></div>`;
  }

  function bindJournalLine(row) {
    row.querySelectorAll("input").forEach(input => input.addEventListener("input", () => {
      const otherSide = row.querySelector(`[data-side="${input.dataset.side === "debit" ? "credit" : "debit"}"]`);
      if (Number(input.value) > 0) otherSide.value = "";
      updateJournalBalance();
    }));
    row.querySelector(".remove-line").addEventListener("click", () => {
      if (modalForm.querySelectorAll(".journal-line-grid:not(.journal-labels)").length > 2) row.remove();
      updateJournalBalance();
    });
  }

  function updateJournalBalance() {
    const rows = [...modalForm.querySelectorAll(".journal-line-grid:not(.journal-labels)")];
    const debit = rows.reduce((sum, row) => sum + Number(row.querySelector('[data-side="debit"]').value || 0), 0);
    const credit = rows.reduce((sum, row) => sum + Number(row.querySelector('[data-side="credit"]').value || 0), 0);
    const diff = debit - credit;
    const display = document.getElementById("journal-balance");
    if (display) display.textContent = `Debits ${debit.toFixed(2)} · Credits ${credit.toFixed(2)} · Difference ${diff.toFixed(2)}`;
  }

  async function openAccount() {
    const types = ["Asset", "Liability", "Equity", "Revenue", "Expense"].map(type => `<option>${type}</option>`).join("");
    openModal({
      title: "Add general ledger account",
      eyebrow: "CHART OF ACCOUNTS",
      description: "Create a new account for manual journal posting and financial reporting.",
      body: `<div class="modal-fields">${field("Account number", "account_code", "text", "", { extra: "maxlength=24" })}${field("Account name", "account_name", "text", "", { extra: "maxlength=120" })}${field("Classification", "account_type", "select", "", { options: types })}</div>`,
      submitLabel: "Create account",
      onSubmit: async form => request("/api/accounts", { method: "POST", body: JSON.stringify({ account_code: form.get("account_code"), account_name: form.get("account_name"), account_type: form.get("account_type") }) }),
    });
  }

  async function saveSettings(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await request("/api/settings", { method: "POST", body: JSON.stringify({ company_name: form.get("company_name"), currency_code: form.get("currency_code") }) });
      state.company = String(form.get("company_name")).trim();
      state.currency = String(form.get("currency_code")).trim().toUpperCase();
      document.getElementById("sidebar-company").textContent = state.company;
      document.getElementById("footer-currency").textContent = `${state.currency} · LOCAL COMPANY FILE · DOUBLE-ENTRY ACCOUNTING`;
      toast(result.message);
      await renderSettings();
    } catch (error) { toast(error.message, true); }
  }

  async function openDetail(resource, id) {
    const data = await request(`/api/${resource}/${encodeURIComponent(id)}`);
    const header = data.header;
    const isSale = resource === "sales";
    const isPurchase = resource === "purchases";
    const code = isSale ? `INV-${String(header.id).padStart(6, "0")}` : isPurchase ? `PUR-${String(header.id).padStart(6, "0")}` : `JE-${String(header.id).padStart(6, "0")}`;
    const title = isSale ? "Sales invoice" : isPurchase ? "Purchase invoice" : "Journal entry";
    const amount = header.total ?? data.lines.reduce((sum, row) => sum + Number(row.debit || row.subtotal || 0), 0);
    const party = isSale ? header.customer : isPurchase ? header.supplier : header.description;
    const date = header.sale_date || header.purchase_date || header.entry_date;
    const summary = `<div class="summary-row"><div class="summary-chip"><small>Reference</small><strong style="font-size:13px">${esc(code)}</strong></div><div class="summary-chip"><small>Date</small><strong style="font-size:13px">${shortDate(date)}</strong></div><div class="summary-chip"><small>${isSale ? "Customer" : isPurchase ? "Supplier" : "Description"}</small><strong style="font-size:12px">${esc(party || "—")}</strong></div></div>`;
    const columns = isSale || isPurchase
      ? `<thead><tr><th>Code</th><th>Description</th><th class="align-right">Qty</th><th class="align-right">Unit price</th><th class="align-right">Line total</th></tr></thead><tbody>${data.lines.map(row => `<tr><td class="strong">${esc(row.code)}</td><td>${esc(row.name)}</td><td class="align-right">${esc(row.quantity)}</td><td class="align-right">${money(row.price)}</td><td class="align-right">${money(row.subtotal)}</td></tr>`).join("")}<tr><td colspan="4" class="strong">Total · ${esc(header.payment_method || "")}</td><td class="align-right strong">${money(header.total)}</td></tr></tbody>`
      : `<thead><tr><th>Account</th><th>Description</th><th class="align-right">Debit</th><th class="align-right">Credit</th></tr></thead><tbody>${data.lines.map(row => `<tr><td class="strong">${esc(row.account_code)} · ${esc(row.account_name)}</td><td>${esc(row.description || "—")}</td><td class="align-right">${money(row.debit)}</td><td class="align-right">${money(row.credit)}</td></tr>`).join("")}</tbody>`;
    openModal({
      title: `${title} ${code}`,
      eyebrow: "POSTED DOCUMENT",
      description: "This posted document is part of the permanent company ledger.",
      body: `${summary}<div class="list-shell"><div class="table-scroll"><table class="data-table">${columns}</table></div></div>`,
      submitLabel: "Close",
      onSubmit: async () => ({ message: "" }),
    });
    const closeButton = modalForm.querySelector('[data-action="close-modal"]');
    closeButton.textContent = "Done";
    modalForm.querySelector('[type="submit"]').textContent = "Print";
    modalForm.querySelector('[type="submit"]').type = "button";
    modalForm.querySelector('[type="button"]:last-child')?.addEventListener("click", () => window.print());
    modalForm.onsubmit = event => event.preventDefault();
  }

  function closeModal() {
    if (modal.open) modal.close();
  }

  function toast(message, isError = false) {
    const region = document.getElementById("toast-region");
    const element = document.createElement("div");
    element.className = `toast ${isError ? "error" : ""}`;
    element.innerHTML = `<span class="toast-icon">${isError ? "!" : "✓"}</span><span>${esc(message)}</span>`;
    region.appendChild(element);
    setTimeout(() => element.remove(), 4200);
  }

  function closeSidebar() {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebar-scrim").classList.remove("open");
  }

  function exportCSV() {
    const config = LISTS[state.page];
    const columns = config ? config.columns.filter(item => item.label) : (state.reportColumns || []).map(key => ({ key, label: key }));
    const values = state.rows.map(row => columns.map(column => {
      const value = column.key ? row[column.key] : "";
      return String(value ?? "").replace(/"/g, '""');
    }));
    const csv = [columns.map(column => `"${String(column.label).replace(/"/g, '""')}"`).join(","), ...values.map(row => row.map(value => `"${value}"`).join(","))].join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${state.page.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${todayISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    toast("CSV export is ready.");
  }

  function exportReport() {
    const columns = (state.reportColumns || []).map(key => ({ key, label: key.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase()) }));
    const records = state.rows || [];
    const csv = [columns.map(col => `"${col.label}"`).join(","), ...records.map(row => columns.map(col => `"${String(row[col.key] ?? "").replace(/"/g, '""')}"`).join(","))].join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${state.page}_${todayISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    toast("CSV export is ready.");
  }

  function selectedRecord() {
    if (!state.selected) {
      toast("Select a row first.", true);
      return null;
    }
    return state.selected;
  }

  async function downloadBackup() {
    window.location.href = "/api/backup";
    toast("Preparing a verified company backup…");
  }

  async function handleAction(action) {
    if (action === "sale") return openInvoice("sale");
    if (action === "purchase") return openInvoice("purchase");
    if (action === "payment") return openPayment();
    if (action === "adjustment") return openAdjustment();
    if (action === "journal") return openJournal();
    if (action === "account") return openAccount();
    if (action === "customer") return openCustomer();
    if (action === "supplier") return openSupplier();
    if (action === "product") return openProduct();
    if (action === "edit-selected") {
      const row = selectedRecord();
      if (!row) return;
      if (state.page === "customers") return openCustomer(row);
      if (state.page === "suppliers") return openSupplier(row);
      if (state.page === "inventory") return openProduct(row);
    }
    if (action === "refresh") return navigate(state.page);
    if (action === "export") return exportCSV();
    if (action === "export-report") return exportReport();
    if (action === "print") return window.print();
    if (action === "download-backup") return downloadBackup();
    if (action === "close-modal") return closeModal();
    if (action === "add-invoice-line") return;
    if (action === "add-journal-line") return;
    if (action === "run-trial") return loadTrialBalance(document.getElementById("report-as-of").value);
    if (action === "run-income") return loadIncomeStatement(document.getElementById("report-start").value, document.getElementById("report-end").value);
    if (action === "run-balance") return loadBalanceSheet(document.getElementById("report-as-of").value);
    if (action === "run-ledger") return loadLedger(document.getElementById("ledger-account").value, document.getElementById("ledger-start").value, document.getElementById("ledger-end").value);
  }

  document.addEventListener("click", event => {
    const pageLink = event.target.closest("[data-page]");
    if (pageLink) {
      event.preventDefault();
      navigate(pageLink.dataset.page);
      return;
    }
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      event.preventDefault();
      handleAction(actionTarget.dataset.action).catch(error => toast(error.message, true));
      return;
    }
    const detailTarget = event.target.closest("[data-detail]");
    if (detailTarget) {
      event.preventDefault();
      openDetail(detailTarget.dataset.detail, detailTarget.dataset.id).catch(error => toast(error.message, true));
      return;
    }
    const rowTarget = event.target.closest("#list-shell tbody tr[data-row-index]");
    if (rowTarget) {
      document.querySelectorAll("#list-shell tbody tr.selected").forEach(row => row.classList.remove("selected"));
      rowTarget.classList.add("selected");
      state.selected = state.rows[Number(rowTarget.dataset.rowIndex)] || null;
    }
  });

  document.getElementById("menu-toggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("sidebar-scrim").classList.add("open");
  });
  document.getElementById("sidebar-close").addEventListener("click", closeSidebar);
  document.getElementById("sidebar-scrim").addEventListener("click", closeSidebar);
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("refresh-button").addEventListener("click", () => navigate(state.page));
  document.getElementById("global-search").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.currentTarget.value.trim()) navigate("search");
    }
    if (event.key === "Escape") event.currentTarget.value = "";
  });
  document.getElementById("global-search").addEventListener("input", event => {
    if (!event.currentTarget.value.trim()) return;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      if (state.page === "search") navigate("search");
    }, 350);
  });
  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      document.getElementById("global-search").focus();
    }
  });
  modal.addEventListener("click", event => {
    if (event.target === modal) closeModal();
  });

  request("/api/settings").then(settings => {
    state.company = settings.company_name || state.company;
    state.currency = settings.currency_code || state.currency;
    document.getElementById("sidebar-company").textContent = state.company;
    document.getElementById("footer-currency").textContent = `${state.currency} · LOCAL COMPANY FILE · DOUBLE-ENTRY ACCOUNTING`;
    navigate("dashboard");
  }).catch(error => {
    content.innerHTML = `<div class="panel empty-state"><div class="empty-state-icon">!</div><h3>Company workspace unavailable</h3><p>${esc(error.message)}</p><button class="button button-primary" data-action="refresh">Reconnect</button></div>`;
  });
})();
