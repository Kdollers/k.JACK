// Screens. Each view renders into the main area and calls the same API routes the tests use.
import { api, download, openPrint } from "./api.js";
import { cellText, t } from "./i18n.js";
import { money, percent, quantity, cleanDecimal } from "./format.js";
import { checkField, clear, field, h, notice, select, table } from "./dom.js";

// ---- shared helpers -------------------------------------------------------

function errorBox(error) {
  return notice(error.message || String(error), "err");
}

function statusBadge(status) {
  return h("span", { class: `badge ${status || ""}` }, t(`status_${status}`));
}

function todayIso(app) {
  return app.meta?.today || new Date().toISOString().slice(0, 10);
}

function yearStart(app) {
  return `${todayIso(app).slice(0, 4)}-01-01`;
}

async function loadList(path, query) {
  return api("GET", path, undefined, query);
}

function option(value, label) {
  return { value, label };
}

// Show a form inside a card and return the card so the caller can hide it.
function formCard(title, body, actions) {
  return h("div", { class: "card" }, h("div", { class: "panel-title" }, h("h3", null, title)),
    body, h("div", { class: "actions" }, actions));
}

// ---- dashboard ------------------------------------------------------------

export async function dashboard(main, app) {
  const start = h("input", { type: "date", value: yearStart(app) });
  const end = h("input", { type: "date", value: todayIso(app) });
  const out = h("div");
  async function show() {
    clear(out);
    try {
      const data = await loadList("/api/dashboard", { start: start.value, end: end.value });
      const d = data.decimals;
      const kpis = Object.entries(data.kpis).map(([key, value]) =>
        h("div", { class: "kpi" }, h("div", { class: "label" }, t(`kpi_${key}`)),
          h("div", { class: "value" }, money(value, d, app.lang))));
      out.append(h("div", { class: "kpis" }, kpis));
      out.append(h("h3", null, t("recent_documents")));
      out.append(table([
        { label: t("col_number"), key: "number" },
        { label: t("col_date"), key: "doc_date" },
        { label: t("col_party"), key: "party_name" },
        { label: t("col_total"), num: true, render: (r) => money(r.total_minor, d, app.lang) },
        { label: t("col_status"), render: (r) => statusBadge(r.status) },
      ], data.recent_documents, t("no_results")));
      out.append(h("h3", null, t("top_customers")));
      out.append(table([
        { label: t("col_party"), key: "name" },
        { label: t("col_balance"), num: true, render: (r) => money(r.balance_minor, d, app.lang) },
      ], data.top_customers, t("no_results")));
    } catch (error) {
      out.append(errorBox(error));
    }
  }
  main.append(h("h2", null, t("nav_dashboard")),
    h("div", { class: "toolbar" }, field(t("period_start"), start), field(t("period_end"), end),
      h("button", { class: "primary", onclick: show }, t("apply_period"))), out);
  await show();
}

// ---- customers and suppliers ---------------------------------------------

const PARTNER_FIELDS = {
  customer: ["name", "code", "phone", "email", "address", "tax_id", "credit_limit", "opening_balance", "opening_date"],
  supplier: ["name", "code", "phone", "email", "address", "tax_id", "opening_balance", "opening_date"],
};

export async function partners(main, app, kind) {
  const base = kind === "customer" ? "/api/customers" : "/api/suppliers";
  const title = kind === "customer" ? t("nav_customers") : t("nav_suppliers");
  const search = h("input", { type: "search", placeholder: t("search") });
  const includeInactive = h("input", { type: "checkbox" });
  const list = h("div");
  const editor = h("div", { class: "hidden" });
  let editing = null;

  async function refresh() {
    clear(list);
    try {
      const rows = await loadList(base, { q: search.value, active: includeInactive.checked ? "" : "1" });
      list.append(table([
        { label: t("col_code"), key: "code" },
        { label: t("col_name"), key: "name" },
        { label: t("col_phone"), key: "phone" },
        { label: t("col_balance"), num: true, render: (r) => money(r.balance_minor, app.decimals, app.lang) },
        { label: t("col_status"), render: (r) => h("span", { class: `badge ${r.is_active ? "active" : "inactive"}` },
          t(r.is_active ? "state_active" : "state_inactive")) },
        { label: "", render: (r) => h("span", null,
          h("button", { class: "link", onclick: () => openEditor(r.id) }, t("edit")), " ",
          h("button", { class: "link", onclick: () => toggleActive(r) },
            t(r.is_active ? "deactivate" : "activate"))) },
      ], rows, t("no_results")));
    } catch (error) {
      list.append(errorBox(error));
    }
  }

  async function toggleActive(row) {
    try {
      await api("POST", `${base}/${row.id}/active`, { active: !row.is_active });
      await refresh();
    } catch (error) {
      list.prepend(errorBox(error));
    }
  }

  function fieldInput(name, value) {
    const attrs = { value: value ?? "" };
    if (name.endsWith("_date")) return h("input", { type: "date", name, ...attrs });
    if (name === "email") return h("input", { type: "email", name, ...attrs });
    return h("input", { name, ...attrs });
  }

  function buildEditor(data) {
    editing = data?.id ?? null;
    clear(editor);
    const inputs = {};
    const grid = h("div", { class: "form-grid" });
    for (const name of PARTNER_FIELDS[kind]) {
      const current = data ? data[name] ?? data[`${name}_minor`] : "";
      let value = current;
      if (name === "credit_limit") value = data ? toDecimal(data.credit_limit_minor, app.decimals) : "";
      if (name === "opening_balance") value = data ? toDecimal(data.opening_balance_minor, app.decimals) : "";
      if (name === "opening_date") value = data?.opening_date || todayIso(app);
      const input = fieldInput(name, value);
      inputs[name] = input;
      grid.append(field(t(`field_${name}`), input));
    }
    const message = h("div");
    const save = h("button", { class: "primary", onclick: async () => {
      const body = {};
      for (const [name, input] of Object.entries(inputs)) {
        if (name === "opening_balance" || name === "credit_limit") body[name] = cleanDecimal(input.value) || "0";
        else body[name] = input.value.trim();
      }
      try {
        if (editing) await api("PUT", `${base}/${editing}`, body);
        else await api("POST", base, body);
        editor.classList.add("hidden");
        await refresh();
      } catch (error) {
        message.replaceChildren(errorBox(error));
      }
    } }, t("save"));
    const cancel = h("button", { class: "secondary", onclick: () => editor.classList.add("hidden") }, t("cancel"));
    editor.append(formCard(editing ? t("edit_partner") : t("new_partner"), grid, [save, cancel]), message);
    editor.classList.remove("hidden");
    editor.scrollIntoView({ block: "nearest" });
  }

  async function openEditor(id) {
    try {
      buildEditor(await loadList(`${base}/${id}`));
    } catch (error) {
      list.prepend(errorBox(error));
    }
  }

  search.addEventListener("input", () => refresh());
  includeInactive.addEventListener("change", () => refresh());
  main.append(h("h2", null, title),
    h("div", { class: "toolbar" }, search,
      checkField(t("show_inactive"), includeInactive), h("span", { class: "grow" }),
      h("button", { class: "primary", onclick: () => buildEditor(null) },
        kind === "customer" ? t("new_customer") : t("new_supplier"))),
    editor, list);
  await refresh();
}

function toDecimal(minor, decimals) {
  const value = Number(minor || 0);
  const negative = value < 0;
  const absolute = Math.abs(value);
  const scale = 10 ** (decimals || 0);
  const whole = Math.floor(absolute / scale);
  const fraction = absolute % scale;
  const text = decimals ? `${whole}.${String(fraction).padStart(decimals, "0")}` : String(whole);
  return (negative ? "-" : "") + text;
}

// ---- products -------------------------------------------------------------

export async function products(main, app) {
  const search = h("input", { type: "search", placeholder: t("search") });
  const list = h("div");
  const editor = h("div", { class: "hidden" });
  let editing = null;
  let taxes = [];
  let categories = [];

  async function refresh() {
    clear(list);
    try {
      const rows = await loadList("/api/products", { q: search.value });
      list.append(table([
        { label: t("col_sku"), key: "sku" },
        { label: t("col_name"), key: "name" },
        { label: t("col_unit"), key: "unit" },
        { label: t("col_unit_cost"), num: true, render: (r) => money(r.cost_price_minor, app.decimals, app.lang) },
        { label: t("col_price"), num: true, render: (r) => money(r.selling_price_minor, app.decimals, app.lang) },
        { label: t("col_qty"), num: true, render: (r) => quantity(r.qty_scaled) },
        { label: t("col_status"), render: (r) => h("span", { class: `badge ${r.is_active ? "active" : "inactive"}` },
          t(r.is_active ? "state_active" : "state_inactive")) },
        { label: "", render: (r) => h("button", { class: "link", onclick: () => openEditor(r.id) }, t("edit")) },
      ], rows, t("no_results")));
    } catch (error) {
      list.append(errorBox(error));
    }
  }

  async function openEditor(id) {
    try {
      const product = id ? await loadList(`/api/products/${id}`) : null;
      await buildEditor(product);
    } catch (error) {
      list.prepend(errorBox(error));
    }
  }

  async function buildEditor(product) {
    editing = product?.id ?? null;
    taxes = await loadList("/api/tax-rates");
    categories = await loadList("/api/categories");
    clear(editor);
    const sku = h("input", { value: product?.sku ?? "" });
    const name = h("input", { value: product?.name ?? "" });
    const unit = h("input", { value: product?.unit ?? "pcs" });
    const cost = h("input", { value: product ? toDecimal(product.cost_price_minor, app.decimals) : "0" });
    const price = h("input", { value: product ? toDecimal(product.selling_price_minor, app.decimals) : "0" });
    const minStock = h("input", { value: product ? quantity(product.min_stock_scaled ?? 0) : "0" });
    const track = h("input", { type: "checkbox", checked: product ? product.track_stock : true });
    const tax = select([option("", t("none"))].concat(taxes.filter((r) => r.is_active)
      .map((r) => option(r.id, `${r.name} (${percent(r.rate_bps)}%)`))), product?.tax_rate_id ?? "");
    const category = select(categories.filter((r) => r.is_active).map((r) => option(r.id, r.name)),
      product?.category_id ?? "");
    const message = h("div");
    const save = h("button", { class: "primary", onclick: async () => {
      const body = {
        sku: sku.value.trim(), name: name.value.trim(), unit: unit.value.trim() || "pcs",
        cost_price: cleanDecimal(cost.value) || "0", selling_price: cleanDecimal(price.value) || "0",
        min_stock: cleanDecimal(minStock.value) || "0", track_stock: track.checked,
        category_id: category.value || null, tax_rate_id: tax.value || null,
      };
      try {
        if (editing) await api("PUT", `/api/products/${editing}`, body);
        else await api("POST", "/api/products", body);
        editor.classList.add("hidden");
        await refresh();
      } catch (error) {
        message.replaceChildren(errorBox(error));
      }
    } }, t("save"));
    editor.append(formCard(editing ? t("edit_product") : t("new_product"),
      h("div", { class: "form-grid" },
        field(t("field_sku"), sku), field(t("field_name"), name), field(t("field_unit"), unit),
        field(t("field_category"), category), field(t("field_cost_price"), cost),
        field(t("field_selling_price"), price), field(t("field_min_stock"), minStock),
        field(t("field_tax_rate"), tax), checkField(t("field_track_stock"), track)),
      [save, h("button", { class: "secondary", onclick: () => editor.classList.add("hidden") }, t("cancel"))]),
      message);
    editor.classList.remove("hidden");
  }

  search.addEventListener("input", () => refresh());
  main.append(h("h2", null, t("nav_products")),
    h("div", { class: "toolbar" }, search, h("span", { class: "grow" }),
      h("button", { class: "primary", onclick: () => openEditor(null) }, t("new_product"))),
    editor, list);
  await refresh();
}

// ---- sales and purchase invoices -----------------------------------------

export async function documents(main, app, docType) {
  const isSales = docType === "sales_invoice";
  const search = h("input", { type: "search", placeholder: t("search") });
  const status = select([option("", t("all_statuses")), option("draft", t("status_draft")),
    option("posted", t("status_posted")), option("cancelled", t("status_cancelled"))], "");
  const list = h("div");
  const editor = h("div", { class: "hidden" });
  const detail = h("div");

  async function refresh() {
    clear(list);
    try {
      const rows = await loadList("/api/documents", { types: docType, q: search.value, status: status.value });
      list.append(table([
        { label: t("col_number"), key: "number" },
        { label: t("col_date"), key: "doc_date" },
        { label: t("col_party"), key: "party_name" },
        { label: t("col_total"), num: true, render: (r) => money(r.total_minor, app.decimals, app.lang) },
        { label: t("col_balance"), num: true, render: (r) => money(
          r.status === "posted" ? r.total_minor - (r.settled_minor || 0) - (r.applied_minor || 0) : 0,
          app.decimals, app.lang) },
        { label: t("col_status"), render: (r) => statusBadge(r.status) },
        { label: "", render: (r) => h("span", null,
          h("button", { class: "link", onclick: () => showDetail(r.id) }, t("view")), " ",
          r.status === "draft" ? h("button", { class: "link", onclick: () => postDocument(r.id) }, t("post")) : "") },
      ], rows, t("no_results")));
    } catch (error) {
      list.append(errorBox(error));
    }
  }

  async function postDocument(id) {
    try {
      await api("POST", `/api/documents/${id}/post`);
      detail.replaceChildren();
      await refresh();
    } catch (error) {
      list.prepend(errorBox(error));
    }
  }

  async function showDetail(id) {
    try {
      const doc = await loadList(`/api/documents/${id}`);
      const lines = doc.lines || [];
      clear(detail);
      detail.append(formCard(`${doc.number} — ${t(`doctype_${doc.doc_type}`)}`,
        h("div", { class: "form-grid" },
          field(t("col_party"), h("span", null, doc.customer_name || doc.supplier_name || "")),
          field(t("col_date"), h("span", null, doc.doc_date)),
          field(t("col_status"), statusBadge(doc.status)),
          field(t("col_total"), h("span", null, money(doc.total_minor, app.decimals, app.lang)))),
        table([
          { label: t("col_product"), key: "description" },
          { label: t("col_qty"), num: true, render: (r) => quantity(r.quantity_scaled) },
          { label: t("col_unit_price"), num: true, render: (r) => money(r.unit_price_minor, app.decimals, app.lang) },
          { label: t("col_net"), num: true, render: (r) => money(r.net_minor, app.decimals, app.lang) },
          { label: t("col_tax"), num: true, render: (r) => money(r.tax_minor, app.decimals, app.lang) },
          { label: t("col_total"), num: true, render: (r) => money(r.total_minor, app.decimals, app.lang) },
        ], lines, t("no_results")),
        doc.status === "draft" ? h("div", { class: "actions" },
          h("button", { class: "primary", onclick: () => postDocument(doc.id) }, t("post"))) : ""));
    } catch (error) {
      detail.replaceChildren(errorBox(error));
    }
  }

  async function openEditor() {
    clear(editor);
    const partners = await loadList(isSales ? "/api/customers" : "/api/suppliers", { active: "1" });
    const products = await loadList("/api/products", { active: "1" });
    const taxes = (await loadList("/api/tax-rates")).filter((r) => r.is_active);
    const defaultTax = taxes.find((r) => r.rate_bps > 0);
    const party = select(partners.map((p) => option(p.id, `${p.code} — ${p.name}`)), "");
    const docDate = h("input", { type: "date", value: todayIso(app) });
    const dueDate = h("input", { type: "date" });
    const linesBody = h("tbody");
    const productOptions = products.map((p) => option(p.id, `${p.sku} — ${p.name}`));
    const taxOptions = [option("", t("none"))].concat(taxes.map((r) => option(r.id, `${r.name} (${percent(r.rate_bps)}%)`)));

    function addLine() {
      const product = select(productOptions, "");
      const qty = h("input", { value: "1" });
      const unitPrice = h("input", { value: "0" });
      const tax = select(taxOptions, defaultTax ? defaultTax.id : "");
      product.addEventListener("change", () => {
        const chosen = products.find((p) => String(p.id) === product.value);
        if (chosen) unitPrice.value = toDecimal(isSales ? chosen.selling_price_minor : chosen.cost_price_minor, app.decimals);
      });
      const row = h("tr", null,
        h("td", null, product), h("td", null, qty), h("td", null, unitPrice), h("td", null, tax),
        h("td", null, h("button", { class: "link", onclick: () => row.remove() }, t("remove"))));
      row.__inputs = { product, qty, unitPrice, tax };
      linesBody.append(row);
    }
    addLine();
    const message = h("div");
    const readLines = () => [...linesBody.children].map((row) => {
      const { product, qty, unitPrice, tax } = row.__inputs;
      const line = { product_id: Number(product.value), quantity: cleanDecimal(qty.value),
        unit_price: cleanDecimal(unitPrice.value) };
      if (tax.value) line.tax_rate_id = Number(tax.value);
      return line;
    });
    const buildBody = () => {
      const body = { doc_type: docType, doc_date: docDate.value, due_date: dueDate.value || null,
        lines: readLines() };
      body[isSales ? "customer_id" : "supplier_id"] = Number(party.value);
      return body;
    };
    const saveDraft = async (postAfter) => {
      try {
        const created = await api("POST", "/api/documents", buildBody());
        if (postAfter) await api("POST", `/api/documents/${created.id}/post`);
        editor.classList.add("hidden");
        await refresh();
        await showDetail(created.id);
      } catch (error) {
        message.replaceChildren(errorBox(error));
      }
    };
    editor.append(formCard(isSales ? t("new_sales_invoice") : t("new_purchase_invoice"),
      h("div", { class: "form-grid" },
        field(isSales ? t("col_customer") : t("col_supplier"), party),
        field(t("col_date"), docDate), field(t("field_due_date"), dueDate)),
      h("h3", null, t("lines")),
      h("table", { class: "lines" },
        h("thead", null, h("tr", null, h("th", null, t("col_product")), h("th", null, t("col_qty")),
          h("th", null, t("col_unit_price")), h("th", null, t("col_tax")), h("th", null, ""))),
        linesBody),
      h("div", { class: "actions" },
        h("button", { class: "secondary", onclick: addLine }, t("add_line")),
        h("button", { class: "secondary", onclick: () => saveDraft(false) }, t("save_draft")),
        h("button", { class: "primary", onclick: () => saveDraft(true) }, t("save_and_post")),
        h("button", { class: "secondary", onclick: () => editor.classList.add("hidden") }, t("cancel")))),
      message);
    editor.classList.remove("hidden");
  }

  search.addEventListener("input", () => refresh());
  status.addEventListener("change", () => refresh());
  main.append(h("h2", null, isSales ? t("nav_sales") : t("nav_purchases")),
    h("div", { class: "toolbar" }, search, status, h("span", { class: "grow" }),
      h("button", { class: "primary", onclick: openEditor }, isSales ? t("new_sales_invoice") : t("new_purchase_invoice"))),
    editor, detail, list);
  await refresh();
}

// ---- payments -------------------------------------------------------------

export async function payments(main, app) {
  const list = h("div");
  const editor = h("div", { class: "hidden" });
  const reverseBox = h("div");

  async function refresh() {
    clear(list);
    try {
      const rows = await loadList("/api/payments");
      list.append(table([
        { label: t("col_number"), key: "payment_no" },
        { label: t("col_date"), key: "payment_date" },
        { label: t("col_party"), key: "party_name" },
        { label: t("col_method"), key: "method_name" },
        { label: t("col_amount"), num: true, render: (r) => money(r.amount_minor, app.decimals, app.lang) },
        { label: t("col_status"), render: (r) => statusBadge(r.status) },
        { label: "", render: (r) => r.status === "posted" && app.can("payments.reverse")
          ? h("button", { class: "link danger", onclick: () => askReverse(r) }, t("reverse")) : "" },
      ], rows, t("no_results")));
    } catch (error) {
      list.append(errorBox(error));
    }
  }

  function askReverse(row) {
    const reason = h("input", { placeholder: t("reason") });
    const message = h("div");
    reverseBox.replaceChildren(formCard(`${t("reverse")} ${row.payment_no}`,
      h("div", { class: "form-grid" }, field(t("reason"), reason)),
      [h("button", { class: "danger", onclick: async () => {
        try {
          await api("POST", `/api/payments/${row.id}/reverse`, { reason: reason.value.trim() });
          reverseBox.replaceChildren();
          await refresh();
        } catch (error) {
          message.replaceChildren(errorBox(error));
        }
      } }, t("confirm_reverse")),
      h("button", { class: "secondary", onclick: () => reverseBox.replaceChildren() }, t("cancel"))]), message);
  }

  async function openEditor() {
    clear(editor);
    const customers = await loadList("/api/customers", { active: "1" });
    const suppliers = await loadList("/api/suppliers", { active: "1" });
    const methods = (await loadList("/api/payment-methods")).filter((m) => m.is_active);
    const partyType = select([option("customer", t("nav_customers")), option("supplier", t("nav_suppliers"))], "customer");
    const party = select(customers.map((c) => option(c.id, `${c.code} — ${c.name}`)), "");
    const refreshParties = () => {
      const source = partyType.value === "customer" ? customers : suppliers;
      party.replaceChildren(...source.map((c) => h("option", { value: c.id }, `${c.code} — ${c.name}`)));
    };
    partyType.addEventListener("change", refreshParties);
    const method = select(methods.map((m) => option(m.id, m.name)), "");
    const amount = h("input", { value: "" });
    const date = h("input", { type: "date", value: todayIso(app) });
    const reference = h("input", { value: "" });
    const message = h("div");
    editor.append(formCard(t("new_payment"),
      h("div", { class: "form-grid" },
        field(t("field_party_type"), partyType), field(t("col_party"), party),
        field(t("col_method"), method), field(t("col_amount"), amount),
        field(t("col_date"), date), field(t("field_reference"), reference)),
      [h("button", { class: "primary", onclick: async () => {
        try {
          await api("POST", "/api/payments", {
            party_type: partyType.value, party_id: Number(party.value),
            payment_method_id: Number(method.value), amount: cleanDecimal(amount.value),
            payment_date: date.value, reference: reference.value.trim() || null,
          });
          editor.classList.add("hidden");
          await refresh();
        } catch (error) {
          message.replaceChildren(errorBox(error));
        }
      } }, t("record_payment")),
      h("button", { class: "secondary", onclick: () => editor.classList.add("hidden") }, t("cancel"))]), message);
    editor.classList.remove("hidden");
  }

  main.append(h("h2", null, t("nav_payments")),
    h("div", { class: "toolbar" }, h("span", { class: "grow" }),
      app.can("payments.record") ? h("button", { class: "primary", onclick: openEditor }, t("new_payment")) : ""),
    editor, reverseBox, list);
  await refresh();
}

// ---- reports --------------------------------------------------------------

const REPORT_PARAMS = {
  trial_balance: ["start", "end"], general_ledger: ["start", "end"], profit_loss: ["start", "end"],
  balance_sheet: ["as_of"], cash_flow: ["start", "end"], cash_bank: ["start", "end"],
  sales_report: ["start", "end"], purchase_report: ["start", "end"], inventory_valuation: ["as_of"],
  inventory_movement: ["start", "end"], tax_report: ["start", "end"], ar_ageing: ["as_of"],
  ap_ageing: ["as_of"], customer_statement: ["start", "end", "partner"],
  supplier_statement: ["start", "end", "partner"],
};

export async function reports(main, app) {
  const names = app.meta.reports;
  const reportSelect = select(names.map((n) => option(n, t(`report_${n}`))), "trial_balance");
  const start = h("input", { type: "date", value: yearStart(app) });
  const end = h("input", { type: "date", value: todayIso(app) });
  const asOf = h("input", { type: "date", value: todayIso(app) });
  const partner = h("select");
  const output = h("div");
  const message = h("div");
  let partners = { customer: [], supplier: [] };

  partners = { customer: await loadList("/api/customers"), supplier: await loadList("/api/suppliers") };

  function currentQuery() {
    const name = reportSelect.value;
    const query = {};
    for (const param of REPORT_PARAMS[name] || []) {
      if (param === "partner") query.partner_id = partner.value;
      else if (param === "as_of") query.as_of = asOf.value;
      else if (param === "start") query.start = start.value;
      else if (param === "end") query.end = end.value;
    }
    return query;
  }

  function syncPartners() {
    const name = reportSelect.value;
    const kind = name.startsWith("supplier") ? "supplier" : "customer";
    partner.replaceChildren(...partners[kind].map((p) => h("option", { value: p.id }, `${p.code} — ${p.name}`)));
    const usesPartner = (REPORT_PARAMS[name] || []).includes("partner");
    partner.closest(".field")?.classList.toggle("hidden", !usesPartner);
  }

  function renderReport(report) {
    const d = report.decimals;
    const columns = report.columns;
    const cellValue = (row, column) => {
      const value = row[column.key];
      if (value === undefined || value === null) return "";
      if (column.type === "money") return money(value, d, app.lang);
      if (column.type === "qty") return quantity(value);
      if (column.type === "percent") return percent(value);
      return cellText(value);
    };
    const rows = report.rows.map((row) => {
      const tableRow = { ...row };
      tableRow.__class = row.kind === "grand" ? "grand" : row.kind === "total" ? "total" : row.kind === "section" ? "section" : "";
      return tableRow;
    });
    const summary = report.summary.map((item) => h("div", { class: "kpi" },
      h("div", { class: "label" }, t(item.label_key)),
      h("div", { class: "value" }, item.type === "money" ? money(item.value, d, app.lang) : String(item.value))));
    const checks = Object.entries(report.checks || {}).filter(([, v]) => typeof v === "boolean")
      .map(([key, value]) => h("span", { class: `badge ${value ? "active" : "inactive"}` },
        `${t(`check_${key}`)}: ${value ? t("yes") : t("no")}`));
    output.replaceChildren(
      h("h3", null, t(report.title_key)),
      summary.length ? h("div", { class: "kpis" }, summary) : "",
      table(columns.map((c) => ({ label: t(c.label_key), num: c.type === "money" || c.type === "qty" || c.type === "percent",
        render: (row) => cellValue(row, c) })), rows, t("no_results")),
      checks.length ? h("div", { class: "checks" }, checks) : "");
  }

  async function show() {
    message.replaceChildren();
    try {
      const report = await loadList(`/api/reports/${reportSelect.value}`, currentQuery());
      renderReport(report);
    } catch (error) {
      output.replaceChildren(errorBox(error));
    }
  }

  async function exportAs(format) {
    try {
      await download(`/api/reports/${reportSelect.value}/export`, { ...currentQuery(), format },
        `${reportSelect.value}.${format}`);
    } catch (error) {
      message.replaceChildren(errorBox(error));
    }
  }

  async function printReport() {
    try {
      await openPrint(`/api/reports/${reportSelect.value}/print`, currentQuery());
    } catch (error) {
      message.replaceChildren(errorBox(error));
    }
  }

  reportSelect.addEventListener("change", () => { syncPartners(); output.replaceChildren(); });
  main.append(h("h2", null, t("nav_reports")),
    h("div", { class: "toolbar" },
      field(t("report"), reportSelect), field(t("period_start"), start), field(t("period_end"), end),
      field(t("as_of"), asOf), field(t("col_party"), partner)),
    h("div", { class: "toolbar" },
      h("button", { class: "primary", onclick: show }, t("show")),
      app.can("reports.export") ? h("button", { class: "secondary", onclick: () => exportAs("csv") }, t("export_csv")) : "",
      app.can("reports.export") ? h("button", { class: "secondary", onclick: () => exportAs("xlsx") }, t("export_xlsx")) : "",
      app.can("reports.export") ? h("button", { class: "secondary", onclick: () => exportAs("pdf") }, t("export_pdf")) : "",
      h("button", { class: "secondary", onclick: printReport }, t("print"))),
    message, output);
  syncPartners();
  await show();
}

// ---- backups --------------------------------------------------------------

export async function backups(main, app) {
  const list = h("div");
  const message = h("div");
  let directory = "";

  async function refresh() {
    clear(list);
    try {
      const data = await loadList("/api/backups");
      directory = data.directory;
      list.append(h("p", { class: "muted" }, `${t("backup_folder")}: ${directory}`));
      list.append(table([
        { label: t("col_file"), key: "file" },
        { label: t("col_created"), key: "created_at" },
        { label: t("col_size"), num: true, render: (r) => String(r.size) },
        { label: "", render: (r) => h("span", null,
          h("button", { class: "link", onclick: () => verify(r) }, t("verify")), " ",
          h("button", { class: "link", onclick: () => download(`/api/backups/download`, { file: r.file }, r.file).catch((e) => message.replaceChildren(errorBox(e))) }, t("download")), " ",
          h("button", { class: "link danger", onclick: () => restore(r) }, t("restore"))) },
      ], data.items, t("no_results")));
    } catch (error) {
      list.append(errorBox(error));
    }
  }

  async function create() {
    try {
      const manifest = await api("POST", "/api/backups");
      message.replaceChildren(notice(`${t("backup_created")}: ${manifest.file}`, "ok"));
      await refresh();
    } catch (error) {
      message.replaceChildren(errorBox(error));
    }
  }

  async function verify(row) {
    try {
      const result = await api("POST", "/api/backups/verify", { file: row.file });
      const text = result.ok ? t("backup_verified") : `${t("backup_problems")}: ${result.messages.join("; ")}`;
      message.replaceChildren(notice(text, result.ok ? "ok" : "err"));
    } catch (error) {
      message.replaceChildren(errorBox(error));
    }
  }

  async function checkBooks() {
    try {
      const result = await loadList("/api/integrity");
      const text = result.ok ? t("books_ok") : `${t("books_problems")}: ${result.messages.join("; ")}`;
      message.replaceChildren(notice(text, result.ok ? "ok" : "err"));
    } catch (error) {
      message.replaceChildren(errorBox(error));
    }
  }

  function restore(row) {
    const typed = h("input", { placeholder: "RESTORE" });
    const box = formCard(`${t("restore")} — ${row.file}`,
      h("p", { class: "muted" }, t("restore_warning")),
      field(t("restore_type_word"), typed),
      [h("button", { class: "danger", onclick: async () => {
        try {
          const result = await api("POST", "/api/backups/restore", { file: row.file, confirm: typed.value.trim() });
          message.replaceChildren(notice(`${t("restore_done")}: ${result.safety_copy}`, "ok"));
          box.remove();
          await refresh();
        } catch (error) {
          message.replaceChildren(errorBox(error));
        }
      } }, t("restore")),
      h("button", { class: "secondary", onclick: () => box.remove() }, t("cancel"))]);
    main.insertBefore(box, list);
  }

  main.append(h("h2", null, t("nav_backups")),
    h("div", { class: "toolbar" }, h("span", { class: "grow" }),
      h("button", { class: "secondary", onclick: checkBooks }, t("check_books")),
      h("button", { class: "primary", onclick: create }, t("create_backup"))),
    message, list);
  await refresh();
}

// ---- settings -------------------------------------------------------------

export async function settings(main, app) {
  const message = h("div");
  const languageSelect = select(app.languages.map((l) => option(l.code, l.name)), app.lang);
  const saveLanguage = h("button", { class: "primary", onclick: async () => {
    try {
      await app.changeLanguage(languageSelect.value);
    } catch (error) {
      message.replaceChildren(errorBox(error));
    }
  } }, t("save"));

  const current = h("input", { type: "password", autocomplete: "current-password" });
  const next = h("input", { type: "password", autocomplete: "new-password" });
  const passwordMessage = h("div");
  const changePassword = h("button", { class: "secondary", onclick: async () => {
    try {
      await api("POST", "/api/me/password", { current_password: current.value, new_password: next.value });
      current.value = "";
      next.value = "";
      passwordMessage.replaceChildren(notice(t("password_changed"), "ok"));
    } catch (error) {
      passwordMessage.replaceChildren(errorBox(error));
    }
  } }, t("change_password"));

  main.append(h("h2", null, t("nav_settings")),
    h("div", { class: "card" }, h("h3", null, t("my_language")),
      h("div", { class: "toolbar" }, field(t("language"), languageSelect), saveLanguage)),
    h("div", { class: "card" }, h("h3", null, t("change_password")),
      h("div", { class: "form-grid" }, field(t("current_password"), current), field(t("new_password"), next)),
      h("div", { class: "actions" }, changePassword), passwordMessage));

  if (app.can("settings.manage")) {
    const profile = await loadList("/api/settings");
    const inputs = {};
    const fields = [["company_name", "text"], ["address", "text"], ["phone", "text"], ["email", "email"],
      ["tax_id", "text"], ["fiscal_year_start_month", "number"]];
    const grid = h("div", { class: "form-grid" });
    for (const [name, type] of fields) {
      inputs[name] = h("input", { type, value: profile[name] ?? "" });
      grid.append(field(t(`field_${name}`), inputs[name]));
    }
    inputs.prices_include_tax = h("input", { type: "checkbox", checked: profile.prices_include_tax });
    grid.append(checkField(t("field_prices_include_tax"), inputs.prices_include_tax));
    inputs.backup_schedule = select(["none", "daily", "weekly"].map((v) => option(v, t(`schedule_${v}`))),
      profile.backup_schedule);
    grid.append(field(t("field_backup_schedule"), inputs.backup_schedule));
    inputs.backup_time = h("input", { type: "time", value: profile.backup_time ?? "02:00" });
    grid.append(field(t("field_backup_time"), inputs.backup_time));
    inputs.backup_dir = h("input", { value: profile.backup_dir ?? "" });
    grid.append(field(t("field_backup_dir"), inputs.backup_dir));
    const companyMessage = h("div");
    main.append(h("div", { class: "card" }, h("h3", null, t("company_settings")), grid,
      h("div", { class: "actions" }, h("button", { class: "primary", onclick: async () => {
        const body = {};
        for (const [name, input] of Object.entries(inputs)) {
          body[name] = input.type === "checkbox" ? input.checked : input.value;
        }
        body.fiscal_year_start_month = Number(body.fiscal_year_start_month);
        try {
          await api("PUT", "/api/settings", body);
          companyMessage.replaceChildren(notice(t("saved"), "ok"));
        } catch (error) {
          companyMessage.replaceChildren(errorBox(error));
        }
      } }, t("save"))), companyMessage));
  }
  main.append(message);
}
