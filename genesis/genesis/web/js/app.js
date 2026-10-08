// Application bootstrap: language, sign-in, shell with navigation, and hash routing.
import { api, loadDictionary, session, setToken, ApiError } from "./api.js";
import { setDictionary, t } from "./i18n.js";
import { h, clear, field, notice, select } from "./dom.js";
import * as views from "./views.js";

const LANGUAGE_KEY = "genesis.lang";
const SUPPORTED = ["en", "fr", "rw"];

const ROUTES = [
  { id: "dashboard", permission: "dashboard.view", label: "nav_dashboard", run: (m, a) => views.dashboard(m, a) },
  { id: "customers", permission: "customers.view", label: "nav_customers", run: (m, a) => views.partners(m, a, "customer") },
  { id: "suppliers", permission: "suppliers.view", label: "nav_suppliers", run: (m, a) => views.partners(m, a, "supplier") },
  { id: "products", permission: "products.view", label: "nav_products", run: (m, a) => views.products(m, a) },
  { id: "sales", permission: "sales.view", label: "nav_sales", run: (m, a) => views.documents(m, a, "sales_invoice") },
  { id: "purchases", permission: "purchases.view", label: "nav_purchases", run: (m, a) => views.documents(m, a, "purchase_invoice") },
  { id: "payments", permission: "payments.view", label: "nav_payments", run: (m, a) => views.payments(m, a) },
  { id: "reports", permission: "reports.view", label: "nav_reports", run: (m, a) => views.reports(m, a) },
  { id: "backups", permission: "backup.manage", label: "nav_backups", run: (m, a) => views.backups(m, a) },
  { id: "settings", permission: null, label: "nav_settings", run: (m, a) => views.settings(m, a) },
];

const app = {
  meta: null,
  languages: [],
  get lang() { return session.lang; },
  get decimals() { return session.company?.currency_decimals ?? 0; },
  can(permission) { return !permission || session.permissions.includes(permission); },
  go(route) { window.location.hash = `#/${route}`; },
  async changeLanguage(code) {
    await setLanguage(code);
    if (session.token) {
      const response = await api("PUT", "/api/me/language", { language: code });
      session.user = { ...session.user, language: response.language };
    }
    render();
  },
};

function root() {
  return document.getElementById("app");
}

function storedLanguage() {
  const stored = window.localStorage.getItem(LANGUAGE_KEY);
  if (SUPPORTED.includes(stored)) return stored;
  const browser = (navigator.language || "en").slice(0, 2).toLowerCase();
  return SUPPORTED.includes(browser) ? browser : "en";
}

async function setLanguage(code) {
  const language = SUPPORTED.includes(code) ? code : "en";
  const data = await loadDictionary(language);
  setDictionary(data.dictionary);
  session.lang = language;
  app.languages = data.languages;
  window.localStorage.setItem(LANGUAGE_KEY, language);
  document.documentElement.lang = language;
}

function languageSwitcher() {
  return select(app.languages.map((l) => ({ value: l.code, label: l.name })), session.lang, {
    "aria-label": t("language"),
    onchange: async (event) => {
      try {
        await app.changeLanguage(event.target.value);
      } catch (error) {
        window.alert(error.message);
      }
    },
  });
}

function showSetup(message) {
  const setup = app.setup;
  const name = h("input", { autocomplete: "organization" });
  const currency = select(setup.currencies.map((c) => ({ value: c, label: c })), "RWF");
  const costing = select(setup.costing_methods.map((m) => ({ value: m, label: t(`costing_${m}`) })),
    "weighted_average");
  const tax = select(setup.tax_profiles.map((p) => ({ value: p, label: t(`tax_profile_${p.toLowerCase()}`) })), "RW");
  const fullName = h("input", { autocomplete: "name" });
  const username = h("input", { autocomplete: "username" });
  const password = h("input", { type: "password", autocomplete: "new-password" });
  const errorBox = h("div", null, message ? notice(message, "err") : "");
  const submit = async (event) => {
    event.preventDefault();
    try {
      const created = await api("POST", "/api/companies", {
        name: name.value.trim(), currency_code: currency.value, admin_full_name: fullName.value.trim(),
        admin_username: username.value.trim(), admin_password: password.value, country_profile: tax.value,
        costing_method: costing.value, default_language: session.lang,
      });
      const data = await api("POST", "/api/login", {
        company: created.slug, username: username.value.trim(), password: password.value,
      });
      window.localStorage.setItem("genesis.company", created.slug);
      setToken(data.token);
      app.setup = { ...app.setup, needs_setup: false };
      await applySession(data);
      render();
    } catch (error) {
      errorBox.replaceChildren(notice(error.message, "err"));
    }
  };
  clear(root());
  root().append(h("div", { class: "login" },
    h("h1", null, "GENESIS"),
    h("div", { class: "sub" }, t("setup_title")),
    h("div", { class: "login-lang" }, field(t("language"), languageSwitcher())),
    h("p", { class: "muted" }, t("setup_intro")),
    h("form", { onsubmit: submit },
      field(t("field_company_name"), name),
      h("div", { style: "height:8px" }),
      field(t("field_currency"), currency),
      h("div", { style: "height:8px" }),
      field(t("field_tax_profile"), tax),
      h("div", { style: "height:8px" }),
      field(t("field_costing_method"), costing),
      h("div", { style: "height:8px" }),
      field(t("field_full_name"), fullName),
      h("div", { style: "height:8px" }),
      field(t("username"), username),
      h("div", { style: "height:8px" }),
      field(t("password"), password),
      h("div", { class: "actions" }, h("button", { class: "primary", type: "submit" }, t("create_company")))),
    errorBox));
}

function showLogin(message) {
  const company = h("input", { value: window.localStorage.getItem("genesis.company") || "", autocomplete: "organization" });
  const username = h("input", { autocomplete: "username" });
  const password = h("input", { type: "password", autocomplete: "current-password" });
  const errorBox = h("div", null, message ? notice(message, "err") : "");
  const submit = async (event) => {
    event.preventDefault();
    try {
      const data = await api("POST", "/api/login", {
        company: company.value.trim(), username: username.value.trim(), password: password.value,
      });
      window.localStorage.setItem("genesis.company", company.value.trim());
      setToken(data.token);
      await applySession(data);
      render();
    } catch (error) {
      errorBox.replaceChildren(notice(error.message, "err"));
    }
  };
  clear(root());
  root().append(h("div", { class: "login" },
    h("h1", null, "GENESIS"),
    h("div", { class: "sub" }, t("app_tagline")),
    h("div", { class: "login-lang" }, field(t("language"), languageSwitcher())),
    h("form", { onsubmit: submit },
      field(t("company_code"), company),
      h("div", { style: "height:8px" }),
      field(t("username"), username),
      h("div", { style: "height:8px" }),
      field(t("password"), password),
      h("div", { class: "actions" }, h("button", { class: "primary", type: "submit" }, t("sign_in")))),
    errorBox));
}

async function applySession(data) {
  session.company = data.company;
  session.user = data.user;
  session.permissions = data.permissions;
  if (data.lang && data.lang !== session.lang) await setLanguage(data.lang);
  app.meta = await api("GET", "/api/meta");
}

function currentRoute() {
  const id = (window.location.hash || "#/dashboard").replace(/^#\/?/, "");
  const found = ROUTES.find((r) => r.id === id);
  if (found && app.can(found.permission)) return found;
  return ROUTES.find((r) => app.can(r.permission)) || ROUTES[ROUTES.length - 1];
}

async function render() {
  if (!session.token) {
    if (app.setup?.needs_setup) showSetup();
    else showLogin();
    return;
  }
  const route = currentRoute();
  const nav = h("nav", { class: "side" }, ROUTES.filter((r) => app.can(r.permission)).map((r) =>
    h("button", { class: r.id === route.id ? "active" : "", onclick: () => app.go(r.id) }, t(r.label))));
  const main = h("main", { id: "main" });
  const who = session.user ? `${session.user.full_name} (${t(`role_${session.user.role}`)})` : "";
  const signOut = h("button", { onclick: async () => {
    try { await api("POST", "/api/logout"); } catch (_error) { /* session already gone */ }
    setToken("");
    session.permissions = [];
    showLogin();
  } }, t("sign_out"));
  clear(root());
  root().append(h("header", { class: "top" },
    h("span", { class: "brand" }, "GENESIS"),
    h("span", { class: "muted", style: "color:#dfe8f3" }, session.company?.name || ""),
    h("span", { class: "spacer" }),
    h("span", { class: "who" }, who),
    languageSwitcher(), signOut),
    h("div", { class: "layout" }, nav, main));
  try {
    await route.run(main, app);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      setToken("");
      showLogin(t("session_expired"));
      return;
    }
    main.append(notice(error.message, "err"));
  }
}

async function boot() {
  await setLanguage(storedLanguage());
  try {
    app.setup = await api("GET", "/api/setup");
  } catch (_error) {
    app.setup = null;
  }
  if (session.token) {
    try {
      const me = await api("GET", "/api/me");
      await applySession(me);
    } catch (_error) {
      setToken("");
    }
  }
  window.addEventListener("hashchange", () => { if (session.token) render(); });
  render();
}

boot();
