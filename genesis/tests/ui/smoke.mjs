// Headless smoke test for the browser client. It loads the real ES modules from web/js
// into a DOM (jsdom) and drives them against a running GENESIS server.
// Environment: GENESIS_URL, GENESIS_COMPANY, GENESIS_USER, GENESIS_PASSWORD.
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const BASE = process.env.GENESIS_URL || "http://127.0.0.1:8000/";
const MODE = process.env.GENESIS_MODE || "signin"; // "signin" or "setup" (first company)
const COMPANY = process.env.GENESIS_COMPANY;
const USER = process.env.GENESIS_USER;
const PASSWORD = process.env.GENESIS_PASSWORD;
if ((MODE === "signin" && !COMPANY) || !USER || !PASSWORD) {
  console.error("GENESIS_COMPANY (sign-in mode), GENESIS_USER and GENESIS_PASSWORD are required");
  process.exit(2);
}

const WEB = new URL("../../genesis/web/", import.meta.url);
const html = readFileSync(new URL("index.html", WEB), "utf8");
const dom = new JSDOM(html, { url: BASE, pretendToBeVisual: true });
const w = dom.window;
globalThis.window = w;
globalThis.document = w.document;
globalThis.sessionStorage = w.sessionStorage;
globalThis.localStorage = w.localStorage;
globalThis.Node = w.Node;
w.Element.prototype.scrollIntoView = function scrollIntoView() {};
// Browsers resolve relative fetch() URLs against the page; Node needs an absolute one.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (url, init) => nativeFetch(new URL(url, BASE), init);
globalThis.URL.createObjectURL = () => "blob:smoke";
globalThis.URL.revokeObjectURL = () => {};

const problems = [];
const results = [];
w.alert = (message) => problems.push(`alert: ${message}`);
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  if (!ok) problems.push(`${name}${detail ? ` :: ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const value = fn();
      if (value) return value;
    } catch (_error) {
      // element not ready yet
    }
    await sleep(50);
  }
  return null;
}
const text = (element) => (element ? element.textContent.replace(/\s+/g, " ").trim() : "");
const buttonByText = (label) => [...document.querySelectorAll("button")].find((b) => text(b) === label);
const fire = (element, type) => element.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));
const RAW_KEY = /\b[a-z]+(?:_[a-z0-9]+)+\b/g;
const rawKeys = (value) => (value.match(RAW_KEY) || []).filter((key) => key !== "wh_main");
const navLabels = () => [...document.querySelectorAll("nav.side button")].map(text);

await import(new URL("js/app.js", WEB).href);
try {

// 1. Sign in through the form, or create the first company when none exists
const form = await waitFor(() => document.querySelector("form"));
if (MODE === "setup") {
  check("first-run setup form rendered", !!form && text(document.querySelector(".login")).includes("Create your company"));
  const inputs = form.querySelectorAll("input");
  const selects = form.querySelectorAll("select");
  inputs[0].value = "Setup Ltd";
  check("setup offers RWF and the Rwanda tax profile",
    [...selects[0].options].some((o) => o.value === "RWF") && [...selects[1].options].some((o) => o.value === "RW"));
  inputs[1].value = "Setup Admin";
  inputs[2].value = USER;
  inputs[3].value = PASSWORD;
} else {
  check("login form rendered", !!form);
  const inputs = form.querySelectorAll("input");
  inputs[0].value = COMPANY;
  inputs[1].value = USER;
  inputs[2].value = PASSWORD;
}
form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
const header = await waitFor(() => document.querySelector("header.top"));
check("signed-in shell rendered", !!header);
if (MODE === "setup") check("new company name in header", text(header).includes("Setup Ltd"), text(header));

// 2. Every route renders without errors or untranslated keys (English)
const routes = ["dashboard", "customers", "suppliers", "products", "sales", "purchases",
  "payments", "reports", "backups", "settings"];
for (const route of routes) {
  window.location.hash = `#/${route}`;
  await sleep(300);
  await waitFor(() => !document.querySelector("main")?.textContent.includes("Loading…"), 5000);
  const main = document.querySelector("main");
  check(`route ${route} renders`, !!main && main.textContent.trim().length > 0);
  check(`route ${route} has no error notice`, !main?.querySelector(".notice.err"), text(main?.querySelector(".notice.err")));
  check(`route ${route} shows no raw keys`, rawKeys(text(main)).length === 0, rawKeys(text(main)).slice(0, 5).join(","));
}
check("admin navigation shows all ten sections", navLabels().length === 10, String(navLabels().length));

// 3. Reports: running a report renders its table and balance check
window.location.hash = "#/reports";
await waitFor(() => buttonByText("Show"));
buttonByText("Show")?.click();
const reportTitle = await waitFor(() => document.querySelector("main h3"));
check("trial balance renders a title", !!reportTitle && text(reportTitle).length > 0, text(reportTitle));
const balanced = await waitFor(() => [...document.querySelectorAll(".checks .badge")].find((b) => text(b).startsWith("Balanced")));
check("trial balance reports Balanced: Yes", !!balanced && text(balanced).endsWith("Yes"), text(balanced));

// 3b. Backups: "Check books and stock" runs the ledger and stock integrity check
window.location.hash = "#/backups";
await waitFor(() => buttonByText("Check books and stock"));
buttonByText("Check books and stock")?.click();
const booksNotice = await waitFor(() => document.querySelector("main .notice"));
check("check books shows a result", !!booksNotice, text(booksNotice));
check("check books reports the books agree", text(booksNotice) === "The books and stock agree.", text(booksNotice));

// 4. Language switch in the header, checked in French and Kinyarwanda
async function switchTo(code) {
  const select = document.querySelector("header select");
  select.value = code;
  fire(select, "change");
  await waitFor(() => document.documentElement.lang === code, 5000);
  await sleep(200);
}
await switchTo("fr");
window.location.hash = "#/settings";
await waitFor(() => document.querySelector("main")?.textContent.trim().length > 0);
await sleep(300);
check("French navigation labels", navLabels().includes("Tableau de bord") && navLabels().includes("Paramètres"), navLabels().join("|"));
check("French settings has no raw keys", rawKeys(text(document.querySelector("main"))).length === 0,
  rawKeys(text(document.querySelector("main"))).slice(0, 5).join(","));
await switchTo("rw");
window.location.hash = "#/customers";
await sleep(400);
check("Kinyarwanda navigation labels", navLabels().includes("Abakiriya") && navLabels().includes("Igenamiterere"), navLabels().join("|"));
check("Kinyarwanda customers page has no raw keys", rawKeys(text(document.querySelector("main"))).length === 0,
  rawKeys(text(document.querySelector("main"))).slice(0, 5).join(","));
await switchTo("en");

// 5. Create a customer through the form and see it in the list
window.location.hash = "#/customers";
await waitFor(() => buttonByText("New customer"));
buttonByText("New customer")?.click();
const nameInput = await waitFor(() => document.querySelector('input[name="name"]'));
check("customer editor opens", !!nameInput);
if (nameInput) {
  nameInput.value = "UI Smoke Customer";
  document.querySelector('input[name="code"]').value = "CUST-UI-SMOKE";
  (await waitFor(() => buttonByText("Save"))).click();
  const listed = await waitFor(() => [...document.querySelectorAll("td")].some((td) => text(td) === "UI Smoke Customer"), 6000);
  check("customer saved and listed", !!listed);
}

// 6. Sign out returns to the sign-in form
buttonByText("Sign out")?.click();
const back = await waitFor(() => document.querySelector("form") && !document.querySelector("header.top"), 5000);
check("sign out returns to login", !!back);

} catch (error) {
  problems.push(`harness stopped: ${error.message}`);
}

for (const result of results) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
console.log(`${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (problems.length) {
  console.log("PROBLEMS:");
  for (const problem of problems) console.log(`  - ${problem}`);
}
process.exit(problems.length ? 1 : 0);
