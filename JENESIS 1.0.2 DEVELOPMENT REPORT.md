# JENESIS 1.0.2 — Development report

**JENESIS** — desktop business and accounting software. Created and developed
by **KAYIGANWA JACQUES**.

This is the report for the development update that asked for three
modifications, plus the audit of them that followed. It states what was built,
what was tested, what passed, and — separately, because the two are not the
same thing — what has never been tested at all.

**Release: JENESIS 1.0.2.** The earlier **JENESIS 1.0.1** release remains
published and untouched; see §10.

---

## 1. The three modifications

### MOD 1 — Complete support for negative and decimal numbers

JENESIS accepts −1, −5, −0.5, 0.1, 0.25, 0.5, 1.25 and 10.75, and holds them
exactly.

**The rounding was wrong first, and everything else depended on it.** Every
money calculation went through one function that scaled by 100, rounded, and
scaled back. Two faults: `8.165 * 100` is `816.4999999999999` in IEEE-754, so
it rounded *down*; and for negative numbers it was not merely imprecise but
broken — `roundTo(-1.005, 2)` returned `-1`, discarding the cents. A debit of
−1.005 rounding to −1.00 while its matching credit of 1.005 rounded to 1.01
leaves the entry a cent out of balance, which is precisely what double-entry
accounting cannot survive. The function now rounds on the digits of the
number's shortest decimal representation, with ties going **away from zero**, so
a debit and its credit always round to equal and opposite values.

**(A) Inventory and stock.** Fractional quantities throughout: 0.5 kg, 1.25 L,
0.75 m, 2.5 units. Stock is held to four decimals, not rounded to whole units.

**(B) Sales and customer returns.** A negative quantity on a sale line is a
return: it brings the stock back, credits COGS, and debits the sales-returns
account. Under FIFO a return restores a *cost layer* — it previously posted
nothing. Refunds are recorded as negative receipts or payments and take money
out of cash, bank or mobile money. A refund cannot give back more than the
customer ever paid.

**(C) Purchases.** Decimal quantities and negative corrections. A correcting
bill line of −0.25 takes exactly 0.25 off the stock and does not touch
already-sold goods.

**(D) Receipts and payments.** Negative and decimal values for refunds,
returned payments, corrections and adjustments. A zero payment is refused.

**(E) Reports.** Audited in this release — see §1a below.

**(F) Accuracy.** No value is ever silently converted to a whole number. Money
is rounded to the currency's configured precision (0–4 decimals, set in
Settings); quantities to four. Historical values are untouched: no migration
rewrites a stored figure.

**A negative entry is not automatically a refund.** The program distinguishes a
returned product (stock comes back, revenue reverses), a financial refund
(money leaves the bank), and an accounting correction (the entry is restated).
Stock movements and accounting entries stay consistent for each.

### MOD 1a — The report audit (done in 1.0.2)

Every report was walked with negative and decimal values. Four defects were
found; all four are fixed.

1. **AR and AP ageing dropped every credit balance.** Both filtered
   `current_balance > 0` and `balance_due > 0`. Refund a customer more than
   they owed and the business owes *them* — and that customer vanished from the
   report an accountant reads to find out who is owed what. An overpaid
   supplier disappeared identically. Both now show every non-zero balance in
   either direction.
2. **Inventory valuation overstated total units by exactly two.**
   `roundTo(products.reduce((acc, p) => acc + (p.current_stock || 0), 2), 2)`
   passes `2` as the reduce's *initial value* instead of as `roundTo`'s
   decimals. Every stock total JENESIS has printed was two units high.
3. **Inventory valuation printed unrounded rows under a rounded total.** 1.25 kg
   at 10.3333 showed `12.916662500000001` in the row and `12.92` in the total.
   The column visibly failed to add up.
4. **Quantities were rounded to currency precision.** A 0.125 kg lot was
   rounded out of the stock total. Quantities are now summed to four decimals.

The remaining reports — general ledger, journal entries, trial balance, P&L,
balance sheet, cash flow, VAT — already handled negatives correctly and now
prove it: they balance, they net a refund against the sale it reverses, and
none emits `NaN`, `Infinity` or an unrounded figure.

### MOD 2 — Customisable receipt printing

**(A) Printer selection.** Windows printers are listed through Electron,
including ones that are offline or out of paper — a printer that has silently
vanished from the list is worse than one shown greyed out with a reason. A test
receipt can be printed. Nothing assumes every printer has the same
capabilities.

**(B) Paper sizes.** 58 mm, 80 mm, A4, and a custom width.

**(C) Appearance.** Font size and family, margins, line spacing, logo
visibility, business name, address, telephone, email, receipt title, footer
message, and which transaction details appear. Each is a switch, not a fixed
template.

**(D) Print preview.** The full receipt is rendered before printing, so
alignment and text size can be judged and the user can go back to settings.

**(E) Saved preferences, per computer and per application.** Stored in
`receipt-layouts.json` under the user-data folder, keyed by application. A
Seller setting a 58 mm roll at the till and an Admin setting an 80 mm layout in
the back office are two records, and neither can change the other. The file is
written to a temporary name and renamed, so an interrupted write cannot destroy
the layouts.

**(F) Integrated into Settings**, reached by authorised Seller and Admin users.
Existing receipt, invoice and document printing is unchanged.

**(G) Reliability.** The receipt document was built for every paper size, every
layout option and the hard cases: decimal quantities, returned items, French
and Kinyarwanda text, a 200-line receipt. **Printing provably does not modify,
duplicate or delete an accounting transaction** — the database is
byte-for-byte identical before and after.

### MOD 3 — Application-specific Help

Each application shows its own guide, chosen automatically from the application
the user opened. **Nobody is ever asked which guide they want.**

- **Seller** → the counter: interface, sales, product search, customers,
  receipts, printing, returns, stock availability, shortcuts, troubleshooting.
  **No accounting instructions** — a Seller cannot post a journal entry.
- **Admin** → dashboard, accounting operations, purchases and bills,
  customers and suppliers, taxes and VAT, financial reports, accounting
  records, permissions, admin functions, shortcuts.
- **Maintenance** → interface, network configuration, connecting computers,
  managing connections, troubleshooting, settings, shortcuts. No accounting,
  sales or stock instructions at all.
- **Settings** → overview, printers, receipt layouts, languages, dark and
  bright mode, preferences, options, troubleshooting.

Three languages — English, French, Kinyarwanda — with no untranslated English
left. Every guide ends with the credit: **Created and developed by KAYIGANWA
JACQUES.** The guides document only features that exist.

The guides are generated from data in `scripts/helpgen/content/`, with
`npm run help:build` to write them and `npm run help:check` to fail if the
committed module drifts from its sources.

---

## 2. Files created

| File | What it is |
|---|---|
| `JENESIS/src/receipt/receiptLayout.js` | The receipt document: paper sizes, layout defaults, normalisation |
| `JENESIS/src/receipt/buildReceiptHtml.js` | Renders a receipt to HTML for preview and printing |
| `JENESIS/src/receipt/useReceiptPrinting.js` | React hook: load, save, preview and print a layout for one app |
| `JENESIS/src/components/ReceiptPrintSettings.jsx` | The Printing screen in Settings |
| `JENESIS/electron/receiptPrinter.cjs` | Printer discovery, layout persistence, print jobs (main process) |
| `JENESIS/src/views/appHelpContent.js` | The four Help guides, 39 sections each, en/fr/rw |
| `JENESIS/tests/decimal-negative.test.js` | 25 checks: rounding, fractional stock, returns, refunds, form constraints |
| `JENESIS/tests/receipt-layout.test.js` | 27 checks on the receipt document |
| `JENESIS/tests/receipt-ui-render.test.js` | 16 checks that the Printing screen actually draws |
| `JENESIS/tests/app-help.test.js` | 27 checks on the four guides |
| `JENESIS/tests/report-audit.test.js` | 17 checks that reports process negatives and decimals |
| `JENESIS/scripts/helpgen/gen.cjs` | Builds `appHelpContent.js` from the guide sources |
| `JENESIS/scripts/helpgen/content/{en,fr,rw}.json` | The words, one file per language |
| `JENESIS/scripts/helpgen/README.md` | How to change a guide |
| `JENESIS/scripts/live-check.cjs` | 12 checks against a running server over HTTP |
| `JENESIS/scripts/preview-password.cjs` | Sets a known password on the throwaway preview database |
| `JENESIS 1.0.2 RELEASE NOTES.md` | Release notes (renamed from the 1.0.1 notes) |
| `JENESIS/dist/**` | Built interface bundle (regenerated each build) |

## 3. Files modified

| File | Why |
|---|---|
| `JENESIS/server/utils.js` | Exact, symmetric rounding (`roundTo`) |
| `JENESIS/server/accountingEngine.js` | Negative/decimal sales, purchases, refunds; FIFO return restores a layer; tax and COGS posted when a line is negative |
| `JENESIS/server/stockLedger.js` | Fractional stock movements |
| `JENESIS/server/reports.js` | The four report defects above |
| `JENESIS/electron/main.cjs` | Five IPC channels for printing |
| `JENESIS/electron/preload.cjs` | Exposes them to the interface |
| `JENESIS/src/views/SalesView.jsx` | Negative and decimal sale lines; fractional credit notes; money precision |
| `JENESIS/src/views/PurchasesView.jsx` | Negative purchase corrections; decimal quantities |
| `JENESIS/src/views/InventoryView.jsx` | Fractional adjustments, reorder points, costs and prices |
| `JENESIS/src/views/AccountingView.jsx` | Journal lines take any precision |
| `JENESIS/src/views/BankingView.jsx` | Payments and refunds take any precision |
| `JENESIS/src/views/CustomersView.jsx` | Credit limit takes any precision |
| `JENESIS/src/views/SettingsView.jsx` | The Printing tab |
| `JENESIS/src/views/HelpView.jsx` | Automatic application detection for the guides |
| `JENESIS/src/components/InvoicePrintModal.jsx` | Routes document printing through the new settings |
| `JENESIS/src/i18n/{en,fr,rw}.json` | New strings, 1,262 keys per language, 0 missing |
| `JENESIS/package.json` | Version 1.0.2; the five new test scripts |
| `JENESIS/DOWNLOAD.md` | Download page, re-stamped by each build |
| `JENESIS-1.0.1-PROGRESS.md` → `JENESIS-1.0.2-PROGRESS.md` | Progress report, renamed |
| `.github/workflows/windows-installer.yml` | Fails the build if the suite modifies the baseline database |

## 4. Database changes

**No schema changes. No migration was added. No existing row was rewritten.**

The three modifications were implemented in code. Columns that already held
`REAL` values — quantities, unit costs, prices, journal debits and credits,
balances — were always capable of holding −0.5 and 1.25; what was wrong was the
code that refused to accept or correctly process them.

The only new persistent data is **outside** the database: MOD 2 stores receipt
layouts in a JSON file, `receipt-layouts.json`, in the user-data folder
(`%APPDATA%\JENESIS\` on Windows), keyed per application. The accounting
database is never written to by printing — verified byte-for-byte.

Migrations 1 to 6 replay cleanly against a copy. See §7, limitation 7.

## 5. Tests performed

### Automated suite — 713 checks, 0 failed, 40 suites

Run on Linux (`node --experimental-sqlite`) and on a GitHub-hosted **Windows
runner**, the same figure on both. `NODE_OPTIONS=--experimental-sqlite npm run
test:all` from `JENESIS/`.

| Suite | Checks |
|---|---:|
| Report audit (new in 1.0.2) | 17 |
| Decimal & negative | 25 |
| Receipt layout | 27 |
| Receipt settings render | 16 |
| Application Help | 27 |
| Help generator check (new in 1.0.2) | 1 |
| Right-click | 28 |
| Seller dashboard | 9 |
| Settings & Access Point | 17 |
| …and 30 further suites | 546 |
| **Total** | **713** |

Notable individual checks:

- `roundTo(8.165, 2) === 8.17`, `roundTo(-1.005, 2) === -1.01`, and a debit and
  its credit rounding to equal and opposite values.
- Selling 1.25 removes exactly 1.25 from stock; returning −0.5 adds exactly 0.5.
- A refund of −10.75 takes exactly 10.75 off the bank; a refund of −0.25 takes a
  quarter, not a whole unit.
- A refund cannot exceed what the customer paid; a zero payment is refused.
- A purchase of 0.125 at a unit cost of 10.3333 lands on the stock and in the
  movement record exactly.
- Trial balance balanced after every posting: **204,902.93 debits = 204,902.93
  credits**.
- AR and AP ageing show credit balances and reconcile to their own rows.
- No report emits `NaN`, `Infinity` or an unrounded figure.
- The suite reads the JSX and pins the form constraints, so a `min="1"` cannot
  quietly return. **Verified by reintroducing one: the check failed, and passed
  again on restore.**

### Live HTTP checks — 12/12 against a running server

`scripts/live-check.cjs` signs in through the real API and reads the reports
back. It is the check that answers "does it work when somebody uses it".

Sign-in, product list, customer list, bank accounts, journal entries, trial
balance balanced, inventory valuation rounded and reconciling, AR and AP ageing
reconciling, and no `NaN`/`Infinity` from any report.

### Installed-application smoke test — 30/30 PASS on Windows

The installer is run on a GitHub-hosted Windows runner, all four shortcuts are
launched, and **sign-in is confirmed through the DevTools Protocol** — the
credentials typed into the window really reach the interface. This was the one
thing the previous release had to keep admitting it could not show.

### Translation parity — 1,262 keys per language, 0 missing

---

## 6. Results

| | |
|---|---|
| Automated suite | **713 passed, 0 failed** (40 suites), Linux and Windows |
| Live HTTP checks | **12 passed, 0 failed** |
| Installed-app smoke test | **30/30 PASS** on a Windows runner |
| Interface sign-in | **confirmed via the DevTools Protocol** |
| Translation parity | **1,262 keys** per language, 0 missing |
| Frontend build | clean |
| Baseline database | unchanged by the suite (now enforced in CI) |

**Defects this work found and fixed**, each now covered by a test that fails if
it returns:

1. Rounding that scaled by 100 and lost cents, and returned −1 for −1.005.
2. tax/COGS skipped entirely when a line was negative.
3. FIFO returns posting no COGS at all.
4. A refund impossible to record.
5. Seller Help carrying accounting instructions a Seller cannot carry out.
6. AR and AP ageing hiding every credit balance.
7. Inventory total units overstated by exactly two.
8. Unrounded inventory rows under a rounded total.

---

## 7. Known limitations

Stated plainly, because a release that hides its limits is worse than one that
admits them.

1. **No human being has looked at these screens.** Every screen is rendered by
   React in a test and photographed by the Windows runner, but there is no
   browser in the build environment. The attached pictures are a machine's
   picture of a window. **Please be the first person to look at them.**
2. **The two themes have never been seen.** Dark and Light are both drawn and
   both tested for contrast, but nobody has looked at either.
3. **Sign-in on a real computer, and communication between two separate
   physical computers, are unverified.** Two services on one machine is not two
   computers.
4. **The installer is unsigned.** Windows SmartScreen will warn
   (More info → Run anyway).
5. **Nothing has been run on a physical PC** — only on GitHub-hosted Windows
   runners. Antivirus, SmartScreen, graphics drivers and user account control
   are all things that runner does not have.
6. **Printing has never been tested against a real printer.** There is no
   printer in the build environment. *Tested:* building the receipt document
   for every paper size and layout option, and for the hard cases; that
   printing leaves the database byte-for-byte unchanged; that each application
   keeps its own layout. *Not tested:* discovering a real printer, sending a
   job to one, or whether a receipt emerges correctly from a thermal roll or an
   A4 sheet. **Please print a test receipt from Settings → Printing before
   relying on it.**
7. **No live Windows database migration test.** Migrations 1–6 replay cleanly
   against a copy, but a real company database upgrading in place has not been
   watched.
8. **Right-click was never clicked by a person.** Every action is exercised in
   code and over HTTP; whether the menu lands where the cursor is on a real
   screen is unverified.
9. **The four Help guides have never been read on a screen.** All 117 sections
   are proven to exist, to be complete, to be genuinely translated rather than
   English copied, and to render for the right application. Whether the prose
   reads well, and whether every instruction matches your business, only you
   can judge.
10. **Three form restrictions were left in place deliberately**: stock transfer
    lines, goods receipt lines, and the cash-count quantity. The first two are
    refused by the engine, so relaxing the form would only let the user type a
    value the engine then rejects — and a supplier return has its own
    instrument. The third counts banknotes, and half a banknote is not a thing.

### Development-preview tests vs. actual Windows installation tests

These are different things and are reported separately.

**Run in the development environment (Linux sandbox) — completed:** the full
713-check suite, the 12 live HTTP checks, the JSX form-constraint checks, the
translation parity checks, and the help-generator drift check.

**Run on a GitHub-hosted Windows runner — completed:** the full 713-check
suite, the frontend build, the NSIS installer, packaging verification, the
30/30 installed-application smoke test, sign-in through the DevTools Protocol,
screenshots, and the portable package.

**Never run anywhere — not claimed:** installation on a physical Windows
computer, sign-in on a real machine, two computers communicating over a LAN,
printing to real hardware, and any human looking at any screen.

---

## 8. Installer location

**`JENESIS 1.0.2 Setup.exe`** — Windows installer (NSIS).

Published on the GitHub release **v1.0.2**:

```
https://github.com/Kdollers/k.JACK/releases/tag/v1.0.2
```

It installs JENESIS and creates **four desktop shortcuts** — JENESIS Seller
(red), JENESIS Network & Maintenance (green), JENESIS Accounting & Business
(blue), JENESIS Settings & Access Point (yellow) — each with its own J logo,
plus a JENESIS folder in the Start menu and an uninstaller.

## 9. Portable ZIP location

**`JENESIS 1.0.2 Portable.zip`** — the same application with no installation.
Unzip and double-click `JENESIS.exe`. Also on release **v1.0.2**.

A third file, **`JENESIS 1.0.2.zip`**, is the source-code backup of the whole
project.

## 10. File sizes and SHA-256 checksums

### JENESIS 1.0.2 — this build

<!--BUILD_TABLE-->

### JENESIS 1.0.1 — published earlier, untouched

1.0.1 remains on its own release, `v1.0.1`, with these exact files. Nothing in
1.0.2 reuses that tag, so these numbers stay true for as long as the release
exists. Built by GitHub Actions (build 42921736471, from commit `fbe7d27`).
Smoke test of the installed application: **30/30 PASS**.

```
JENESIS 1.0.1 Setup.exe       93,144,759 bytes   d85f4db8d0e75012b5a224c7d496b6a6f792ecf2235352b84888196fa100a3de
JENESIS 1.0.1 Portable.zip   133,858,567 bytes   b394d480945fc3db045113c5448440a69a000f1738a9de30585f649024e507d7
JENESIS 1.0.1.zip              6,468,905 bytes   f1b82c94a6d21d778b52d309be646e6b503bd6ec8c46ca4e5b3c46bd727788c6
```

1.0.1 contained the three modifications. 1.0.2 contains the audit of them. If
you are already running 1.0.1, nothing you have recorded changes: no migration
touches existing rows, and the corrections only alter what the reports *show*,
not what was posted.

To verify a download on Windows:

```
certutil -hashfile "JENESIS 1.0.2 Setup.exe" SHA256
```

---

## What was asked for, and whether it is done

| Requirement | Status |
|---|---|
| MOD 1 — negative and decimal numbers everywhere | **Done**, and audited |
| MOD 1A–1F, each sub-requirement | **Done** |
| MOD 2 — customisable receipt printing | **Done**, except physical printing (§7.6) |
| MOD 3 — application-specific Help, auto-detected, en/fr/rw | **Done** |
| Help credits KAYIGANWA JACQUES | **Done**, in every guide and language |
| Help documents only features that exist | **Done**, tested |
| Test the actual functionality, not just the build | **Done** — 713 + 12 + 30 checks |
| Do not weaken existing tests | **None removed or weakened**; 684 → 713 |
| Windows installer and portable version built | **Done** |
| All four entry points functional | **Done**, 30/30 smoke, sign-in proven |
| Preserve the 1.0.1 release | **Done** — published as 1.0.2 under its own tag |
| Final report with all eleven items | **This document** |

**Not finished, and not claimed:** physical-printer testing, installation on a
real PC, sign-in on a real machine, two-computer LAN communication, and a human
looking at any screen. These are listed in §7 and are not presented as passing
anywhere in this report.

---

Created and developed by **KAYIGANWA JACQUES.**
