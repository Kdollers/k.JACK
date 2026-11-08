# JENESIS 0.5.5 — implementation progress

Target: **0.5.5** (from 0.5.4). Developer: KAYIGANWA JACQUES.
Branch: `arena/a2c625e8-k-jack`.

Status: **all three modifications are complete, and JEN 0.5.5 is built and
published.** The installer has been installed and used on a Windows Server 2022
runner, all four shortcuts have been launched, and the smoke test of the
installed applications passes 30/30.

Test bar: **595 checks passed, 0 failed, 34 suites**
(`NODE_OPTIONS=--experimental-sqlite npm run test:all`, run from `JENESIS/`,
and the same figure reported by the Windows runner).
It was 531 at the start of 0.5.5. Anything that drops below 595 is a regression.

Version is **0.5.5** (`package.json`, and the installer filename with it).

---

## Where things stand

| # | Modification | State |
|---|--------------|-------|
| 1 | Complete right-click (context menu) | **DONE** — all four applications, permissions, confirmations, accounting records protected |
| 2 | JENESIS Seller has its own dashboard | **DONE** — new screen, admin figures removed AND refused by the server, one shared database |
| 3 | JENESIS Settings & Access Point | **DONE** — users, access point, tax rates with safeguards, company, general, synchronization |
| — | The bar: 595 checks, 34 suites | **DONE** — three new suites (right-click 28, Seller dashboard 9, Settings & Access Point 17) |
| — | Windows installer, smoke test, delivery | **DONE** — published as **JEN 0.5.5** |

---

## Modification 1 — Complete right-click

Right-click did nothing anywhere in JENESIS. It now works in all four
applications.

### What was built

| File | What it is |
|---|---|
| `src/contextmenu/items.js` | The eight actions and the rules that decide, for the thing under the cursor, which of them are relevant. |
| `src/contextmenu/useRecordMenu.js` | The hook a row calls. Edit, Deactivate and Delete go through the **same server rules as the row buttons**, implemented once here so the guarantees hold everywhere. |
| `src/contextmenu/clipboard.js` | Copy, Cut and Paste, including inside a text field, where they drive the field itself. |
| `src/context/ContextMenuContext.jsx` | One menu, opened from anywhere, closed by Escape or a click away. |
| `src/components/ContextMenu.jsx` | The menu itself, drawn in the colour of the application it opens in. |

### Wired on the rows of

Customers, Suppliers, Inventory (products), Sales, Purchases, Banking,
Accounting (accounts and journal entries), Settings (users, taxes, audit),
Network & Maintenance (the other computers), the four panels of the Settings &
Access Point.

### The eight requirements, one by one

1. **The eight actions.** Copy, Cut, Paste, Edit, Delete, Deactivate, Activate,
   Select All.
2. **Only what is relevant.** A row that is already deactivated offers
   Activate, not Deactivate. A row with no editor offers no Edit. A trial
   balance figure and an audit entry offer Copy and nothing else — they are
   history, not records.
3. **All four applications**, on tables, lists, records, products, customers,
   suppliers and the other-computer list.
4. **Roles and permissions.** Deactivate needs `records:deactivate`, Delete
   needs `records:delete`, and the server asks the same question — the menu is
   never the only gate.
5. **Confirmation for anything destructive.** Deleting always asks, and the
   question names the record.
6. **Accounting records are never destroyed.** A record carrying accounting
   history cannot be deleted: the server answers `409` with the reason, and the
   menu offers deactivation instead. Journal entries, accounts, audit rows and
   trial-balance figures are marked protected and say so.
7. **The colour of the application.** The menu uses the same `.j-*` tokens as
   the rest of the interface, so it is red in Seller, green in Maintenance,
   blue in Accounting & Business and yellow in Settings & Access Point — in
   Light and Dark.
8. **Keyboard shortcuts and left-click are untouched.** Ctrl+C, Ctrl+X,
   Ctrl+V, Ctrl+A still do what they did; the menu registers itself as an
   escape layer *above* the shortcuts so a shortcut does not fire while the
   menu is open.

---

## Modification 2 — JENESIS Seller has its own dashboard

### The new screen

`src/views/SellerDashboardView.jsx` is a screen about the day at the counter:

* **New Sale** and **New Receipt** (they hand the sale over to the sales
  screen, which is where the till is),
* **Sales History** — the recent documents with their numbers, customers and
  balances, and a print button on each,
* **Customer Management** — the people who buy,
* **Product Search** — by name or SKU, answering with a price and whether it is
  on the shelf (`IN STOCK`, `LOW`, `OUT`) and **no cost price**,
* **Available Stock**, read-only, with what needs restocking,
* **Receipt Printing**,
* **Daily Sales Summary** — how many, how much, how much cash, how much on
  credit, and the week behind it,
* **Cash Register Information** — which till accounts there are and what is in
  them.

`src/sellerIntents.js` carries the hand-over from the dashboard to the sales
screen, so "New Sale" opens the form rather than only changing the menu.

### What Seller no longer shows

The accounting dashboard, the profit and loss, the balance sheet, the trial
balance, the general ledger, payables, receivables, administrative reports,
company configuration, user management and admin settings.

**The important part is the second half.** Hiding a menu is not a defence, so
the server was changed too:

| Change | Why |
|---|---|
| `GET /reports/dashboard` now requires `reports:read` or `accounting:read` | It used to answer on `dashboard:read`, a permission every role holds — which is *exactly* how the accounting figures could still be read from a Seller window after its menu entry was taken away. Found by a test, not by reading the code. |
| The dashboard menu entry follows the application | In Seller it needs only `sales:read`; in Accounting & Business it needs an accounting permission, so nobody is shown a screen they cannot read. |
| The accounting dashboard says so when refused | A screen full of zeros looks like a company with no trade. It now names the reason instead. |

`server/routes/seller.js` was written for this screen and answers only the
counter's questions — it never asks the database for a profit figure, which is
why one cannot leak by accident.

### The database

**One database.** No second one, no copy. A sale written in JENESIS Seller is
posted by the same sales engine, moves the same stock, writes the same journal
entries and takes the same money into the same till. A test writes a sale from a
Seller window and then **reads it back as the accountant**, through
`/api/dashboard/recent-transactions` and out of `sales_invoices` directly.

### Security

`server/appScope.js` keeps the per-application denylist, and
`enforceApplicationAccess` (new) refuses a request from an application that has
been closed to that user. Two different refusals, honestly named:

* `APP_SCOPE_FORBIDDEN` — this screen does not belong to the application you
  are in;
* `APP_ACCESS_DENIED` — this application is closed to you.

---

## Modification 3 — JENESIS Settings & Access Point

All of it in the yellow application, and **removed from Accounting & Business
rather than copied** — there is exactly one settings screen in the project.

### (A) User accounts

Create, rename, deactivate, reactivate and delete; usernames; a user setting
their own password and an administrator resetting a forgotten one
(`POST /auth/users/:id/reset-password`, which also ends that user's sessions).

* An account that is part of the company's history is refused deletion with
  `409 USER_HAS_HISTORY` — it is deactivated instead.
* An administrator cannot delete themselves (`SELF_LOCKOUT`).
* The password policy still applies to a reset.

### (B) The Access Point

`GET /auth/access-catalogue` serves the four applications, the roles and every
permission. `PUT /auth/users/:id/access` sets, for one person:

* which of the four applications they may open,
* permissions **granted** beyond their role and permissions **revoked** from
  it,
* and `clearOverrides` to return them to their role.

`server/appScope.js` then enforces it on the very next request, and closing an
application also signs its open windows out.

### (C) Tax rates

Create, edit, delete, deactivate and reactivate, with active and inactive
listed separately.

| Safeguard | How it is held |
|---|---|
| A rate used in transactions cannot be permanently deleted | `DELETE` answers `409 TAX_IN_USE` and names where it is used, checked against six reference tables. |
| Deactivation must not modify historical documents | Deactivation flips `is_active` on `tax_rates` and **touches nothing else**. A test raises an invoice at 19 %, retires the rate, tries to delete it, and reads the line back: same `tax_rate_id`, same 19 %, same tax amount. |
| Inactive rates are not offered for new transactions | `listTaxRates` returns active rates unless it is asked for `all` or `inactive`. |
| Historical invoices and reports keep their original rates | The rate is stored on the document line, not looked up at read time. |
| Reactivation makes it available again | `POST /taxes/:id/reactivate`. |
| All tax changes recorded in the audit trail | Every write calls `logAudit` against the `TAXES` module. |

### (D) Company settings and (E) general settings

The company record, identification and currency configuration; language
(en/fr/rw), Light/Dark/System theme and application preferences. All of it was
already on the settings screen and moved with it, unchanged.

### (F) Centralized synchronization

Every configuration change bumps a number served by
`GET /system/config-version` (new table `system_config`). `AppContext` polls it
every 20 seconds while signed in and, when it moves, re-reads `/auth/me` and
takes the new user, company, permissions and applications without a restart. So
a permission withdrawn in the yellow application takes effect in an
already-open window; a company name changed there appears in the others, and a
deactivated user's own windows sign out.

### (G) Security

Settings & Access Point requires `settings:access` or `users:manage`. Passwords
are hashed (never stored, never logged). Sensitive actions are re-checked
against permissions server-side. Every refusal and every configuration change
is written to the audit trail. Direct navigation and hand-written requests meet
the same guard as the interface.

### (H) Removal from Admin

`src/appIdentity.js` no longer lists `settings` among Accounting & Business's
screens. Only Settings & Access Point does. One settings screen, one
implementation, no duplicate, and every existing configuration is preserved —
nothing was re-created, only moved.

---

## Files added and changed

**Added**

```
server/taxRates.js                          tax rates, usage and safeguards
server/accessPoint.js                       applications, roles, permissions
server/routes/seller.js                     the Seller's own endpoints
src/contextmenu/items.js                    the eight actions and their rules
src/contextmenu/useRecordMenu.js            one lifecycle implementation
src/contextmenu/clipboard.js                copy / cut / paste
src/context/ContextMenuContext.jsx          one menu, opened from anywhere
src/components/ContextMenu.jsx              the menu, in the app's colour
src/components/settings/UsersPanel.jsx      user accounts
src/components/settings/TaxesPanel.jsx      tax rates
src/components/settings/AccessEditor.jsx    applications and permissions
src/views/SellerDashboardView.jsx           the Seller's own dashboard
src/sellerIntents.js                        dashboard -> sales screen
tests/context-menu.test.js                  28 checks
tests/seller-dashboard.test.js              9 checks
tests/access-point.test.js                  17 checks
```

**Changed**

```
server/auth.js             rolePermissions, effectivePermissions, appAccess
server/appScope.js         enforceApplicationAccess (403 APP_ACCESS_DENIED)
server/routes/api.js       tax routes, the access point, /system/config-version
server/migrations.js       migration 6: system_config
src/appIdentity.js         Seller opens on its dashboard; Admin loses settings
src/App.jsx                the context-menu provider, the Seller's dashboard
src/components/Sidebar.jsx the dashboard entry follows the application
src/context/AppContext.jsx watches the configuration number
src/views/SettingsView.jsx users and taxes are now their own panels
src/views/DashboardView.jsx says so when the figures are not yours to read
src/views/ReportsView.jsx  the trial balance can be copied, never edited
src/i18n/{en,fr,rw}.json   1,167 keys per language, 0 missing
```

---

## Testing

| Suite | Checks | Result |
|---|---:|---|
| Whole suite | **595** | **0 failed**, 34 suites |
| Right-click (`test:contextmenu`) | 28 | pass |
| Seller dashboard (`test:seller`) | 9 | pass |
| Settings & Access Point (`test:accesspoint`) | 17 | pass |
| Installed-application smoke test | 30 | pass (Windows runner) |
| `npx vite build` | — | clean |
| i18n parity en/fr/rw | 1,167 keys | 0 missing |

The three new suites run against a **real server on a temporary copy of
`genesis.db`** and check the database afterwards. `genesis.db` itself is hashed
before and after every suite and must be unchanged.

### What the tests caught, and what that proves

* The accounting dashboard being readable from a Seller window. This was the
  user's own report, and it was still true after the menu entry was hidden —
  only a test that *asked the server* found it.
* A tax rate that had been used still answering `200` to `DELETE`.
* Closing an application not taking effect until the next sign-in.

Every one of these was a real defect, not a test that was written to pass.

---

## Signing in through the interface — now proven

This was the one thing the release had to keep admitting it could not show.
A Windows runner has no display and therefore no keyboard, so `SendKeys` had
nothing to type into and messages posted straight into the window were ignored
by Chromium's input pipeline. Both routes were tried and both failed, and the
build said so.

Electron speaks the **Chromium DevTools Protocol**, so the credentials are now
delivered the way a browser automation tool delivers them: find the page, focus
the first text field, then send real events with `Input.insertText` and
`Input.dispatchKeyEvent`. React sees genuine key and input events — which is
the point, because setting `input.value` in the DOM would change the box
without telling React anything.

What run 42452429402 recorded on the installed application:

| Check | Result |
|---|---|
| Credentials delivered, field focused (`INPUT:text`) | PASS |
| The interface reported the signed-in shell | PASS — via the DevTools Protocol |
| `renderer: signed-in` in the application's own log | 3 times, one per application |
| Window photographed after signing in | 473 distinct colours before → **1,955 after** |
| `release/interface-signin.txt` | `confirmed via the DevTools Protocol` |

Both pictures — `JENESIS-Seller-Dashboard.bmp` and
`JENESIS-Settings-Signed-In.bmp` — are therefore the signed-in screens they
claim to be, not the sign-in screen.

Held back honestly: this is a machine driving a window on a **runner**. No
human has typed into the application on a real computer, and item 5 below is
unchanged by it.

---

## Not verified — read before trusting this release

Stated plainly, because a release that hides its own limits is worse than one
that admits them.

1. **No human being has looked at these screens.** Every screen is rendered by
   React in a test and photographed by the Windows runner, but there is no
   browser in the build environment and no vision here. The pictures attached
   to the release are a machine's picture of a window.
2. **The two themes have never been seen.** Dark and Light are both drawn and
   both tested for contrast, but nobody has looked at either.
3. **Messenger between two separate physical computers is not proven.** Two
   real services on one machine is not two computers.
4. **The installer is unsigned.** Windows SmartScreen will warn (More info →
   Run anyway).
5. **Nothing has been run on a physical PC.** Only on GitHub-hosted Windows
   runners.
6. **Printing is untested.** No printer.
7. **No live Windows database migration test.** Migration 6 was applied to a
   copy of `genesis.db` and every migration from 1 to 6 replays cleanly, but a
   real company database upgrading in place has not been watched.
8. **Right-click was never clicked by a person.** Every action is exercised in
   code and over HTTP; whether the menu lands where the cursor is on a real
   screen is unverified.

---

## Build

Run **42455521036**, commit `eb1c2d1`.
Published as **JEN 0.5.5** with `JEN 0.5.5 Setup.exe`,
`JEN 0.5.5 Portable.zip` and `JEN 0.5.5.zip`, each with a `.sha256` next to it.
