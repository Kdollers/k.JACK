# JEN 0.5.5 — release notes

**JENESIS 0.5.5** — desktop business and accounting software by
KAYIGANWA JACQUES.

Installer: `JEN 0.5.5 Setup.exe` · Portable: `JEN 0.5.5 Portable.zip` ·
Source: `JEN 0.5.5.zip`

Built by GitHub Actions, run **42442343837**, commit **`7036c5d`**.

---

## The four applications

One installation, four programs, **one shared database**. Each has its own
name, colour, icon, window title, Desktop shortcut and Start-menu entry, and
each remembers its own Light/Dark theme.

| # | Application | Colour | Opens on | What it is for |
|---|---|---|---|---|
| 1 | **JENESIS Seller** | Red | Dashboard | Selling: the day's takings, new sale, sales history, customers, product search, stock (read-only), receipts and the cash register. |
| 2 | **JENESIS Network & Maintenance** | Green | Network & Maintenance | The network between JENESIS computers, the service, verified backups, integrity checks and logs. |
| 3 | **JENESIS Accounting & Business** | Blue | Dashboard | The whole program: sales, purchases, inventory, banking, accounting and every report. |
| 4 | **JENESIS Settings & Access Point** | Yellow | Settings | The company, user accounts and passwords, access to the four applications, roles and permissions, taxes, currencies, language, theme and backups. Administrators and managers. |

These four names are used **exactly** in the window titles, the desktop
shortcuts, the Start-menu entries, the installer, the uninstaller and this
documentation. Inside the interface, where the language has been switched to
French or Kinyarwanda, the same four applications are shown under their
translated names (`JENESIS Vendeur`, `JENESIS Réseau & Maintenance`,
`JENESIS Comptabilité & Gestion`, `JENESIS Paramètres & Point d'accès`;
`JENESIS Umucuruzi`, `JENESIS Umuyoboro & Kubungabunga`,
`JENESIS Ibaruramari & Ubucuruzi`, `JENESIS Igenamiterere & Ahantu ho
Kwinjirira`).

---

## What is new in 0.5.5

### 1. Right-click now works, everywhere

Right-click did nothing anywhere in JENESIS. It now opens a menu with **Copy,
Cut, Paste, Edit, Delete, Deactivate, Activate and Select All** — showing only
the ones that make sense for the row under the cursor — in all four
applications: on customers, suppliers, products, sales, purchases, banking,
accounting, the audit trail, the other-computer list and the settings panels.

* **Only what is relevant.** A deactivated row offers Activate, not
  Deactivate. A trial-balance figure or an audit entry offers Copy and nothing
  else: they are history, not records.
* **Roles decide what you see**, and the server decides what you get. The menu
  is never the only gate.
* **Destructive actions always ask first**, and the question names the record.
* **An accounting record is never destroyed.** A record carrying accounting
  history answers `409` with the reason, and the menu offers deactivation
  instead. Journal entries, accounts, audit rows and trial-balance figures are
  marked protected and say so.
* **The menu wears the colour of the application it opens in** — red, green,
  blue or yellow, in Light and Dark.
* **Keyboard shortcuts and ordinary left-click are untouched**, and a shortcut
  does not fire while the menu is open.

### 2. JENESIS Seller has its own dashboard

A screen built around the day at the counter:

| | |
|---|---|
| **New Sale** / **New Receipt** | Opens the sales form with the intent carried over. |
| **Sales History** | The recent documents with numbers, customers and balances, and a print button on each. |
| **Customer Management** | The people who buy. |
| **Product Search** | By name or SKU: the price and whether it is on the shelf. **No cost price.** |
| **Available Stock** | Read-only, with what needs restocking. |
| **Receipt Printing** | From the sales history. |
| **Daily Sales Summary** | How many, how much, how much cash, how much on credit — and the week behind it. |
| **Cash Register Information** | Which till accounts there are and what is in them. |

**What Seller no longer shows:** the accounting dashboard, the profit and
loss, the balance sheet, the trial balance, the general ledger, payables,
receivables, administrative reports, company configuration, user management
and admin settings.

And it is not only hidden. `GET /reports/dashboard` used to answer on a
permission **every role holds** — which is precisely how the accounting figures
could still be read from a Seller window after its menu entry was taken away.
A test found it by asking the server; the route now requires an accounting
permission, the menu entry follows the application, and the accounting
dashboard says so plainly when the figures are not yours to read.

**One database, as before.** A sale written in JENESIS Seller is posted by the
same engine, moves the same stock, writes the same journal entries and takes
the same money into the same till. A test writes a sale from a Seller window
and reads it back as the accountant.

### 3. JENESIS Settings & Access Point owns the settings

All of it in the yellow application, and **removed from Accounting & Business
rather than copied** — there is exactly one settings screen in the project, and
every existing configuration was preserved.

* **User accounts.** Create, rename, deactivate, reactivate, delete; set your
  own password; an administrator resets a forgotten one. An account that is
  part of the company's history cannot be deleted — it is deactivated instead.
  An administrator cannot delete themselves.
* **The Access Point.** Which of the four applications each user may open, and
  which permissions they hold beyond their role or lose from it. Enforced on
  the very next request, and closing an application signs its open windows out.
* **Tax rates.** Create, edit, delete, deactivate, reactivate, with active and
  inactive listed separately — and the safeguards:

  | | |
  |---|---|
  | A rate used in transactions **cannot be deleted** | `409 TAX_IN_USE`, naming where it is used |
  | Deactivation **changes nothing** in documents already raised | Only `is_active` flips |
  | Inactive rates are **not offered** for new transactions | The active list is the default |
  | Historical invoices and reports **keep their original rates** | The rate is stored on the document |
  | Reactivation **makes it available again** | Immediately |
  | Every change is **written to the audit trail** | Against the `TAXES` module |

* **Company settings** — information, identification, currency.
* **General settings** — language (en/fr/rw), Light/Dark/System theme,
  application preferences.
* **Centralized synchronization.** Every configuration change bumps a number,
  and an already-open window notices it move and reads its permissions again —
  so a permission withdrawn here takes effect in the other applications
  without a restart.

---

## What was tested, and what passed

| | |
|---|---|
| Whole automated suite | **595 checks, 0 failed, 34 suites** |
| Right-click suite | 28 checks |
| Seller dashboard suite | 9 checks |
| Settings & Access Point suite | 17 checks |
| Installed-application smoke test | **30/30 PASS** on a Windows runner |
| `npx vite build` | clean |
| Translation parity en/fr/rw | 1,167 keys per language, 0 missing |

The three new suites run against a **real server on a real copy of the
accounting database** and check the database afterwards. `genesis.db` is hashed
before and after every suite and must come out unchanged.

**The tests found real defects, and finding them is the point:**

* the accounting dashboard still answering a Seller window,
* a used tax rate still answering `200` to `DELETE`,
* closing an application not taking effect until the next sign-in.

All three are fixed and all three now have a test that fails if they come back.

---

## What is in the release

```
JEN 0.5.5 Setup.exe        Windows installer (NSIS), four desktop shortcuts
JEN 0.5.5 Portable.zip     The same application without installing
JEN 0.5.5.zip              Source-code backup of the finished project
```

Each is published with a `.sha256` next to it. Verify with
`certutil -hashfile <file> SHA256`.

---

## What has NOT been verified — please read

Stated plainly, because a release that hides its own limits is worse than one
that admits them.

1. **No human being has looked at these screens.** Every screen is rendered by
   React in a test and photographed by the Windows runner, but there is no
   browser in the build environment. The pictures attached to the release are a
   machine's picture of a window; **please be the first person to look at
   them.**
2. **The two themes have never been seen.** Dark and Light are both drawn and
   both tested for contrast, but nobody has looked at either.
3. **Signing in by typing is NOT confirmed — and on this build it was not.**
   The smoke test types the password into the window and the interface
   *sometimes* reports the signed-in screen; on this run it did **not**, so
   `JENESIS-Seller-Dashboard.bmp` and `JENESIS-Settings-Signed-In.bmp` are
   photographs of the **sign-in screen**, not of the dashboard and the
   settings. They are published because they are what the machine really
   showed; the run records the outcome in `release/interface-signin.txt`. The
   four ordinary screenshots are unaffected — they show the sign-in screen by
   design.
4. **Messenger between two separate physical computers is not proven.** Two
   real services on one machine is not two computers.
5. **The installer is unsigned.** Windows SmartScreen will warn (More info →
   Run anyway).
6. **Nothing has been run on a physical PC** — only on GitHub-hosted Windows
   runners. Antivirus, SmartScreen, graphics drivers and user account control
   are all things this runner does not have.
7. **Printing is untested.** No printer.
8. **No live Windows database migration test.** Migration 6 was applied to a
   copy and every migration from 1 to 6 replays cleanly, but a real company
   database upgrading in place has not been watched.
9. **Right-click was never clicked by a person.** Every action is exercised in
   code and over HTTP; whether the menu lands where the cursor is on a real
   screen is unverified.

---

## Upgrading from 0.5.4

Install over the top. **Your database is not touched** — no data is deleted,
replaced or re-created, and nothing is re-seeded. Migration 6 adds one small
`system_config` table; it runs once, automatically, on first start.

Back up first anyway: *Settings & Access Point → Backups*.
