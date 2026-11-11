# JENESIS 1.0.2 — release notes

**JENESIS 1.0.2** — desktop business and accounting software by
KAYIGANWA JACQUES.

Installer: `JENESIS 1.0.2 Setup.exe` · Portable: `JENESIS 1.0.2 Portable.zip` ·
Source: `JENESIS 1.0.2.zip`

Built by GitHub Actions, run **42921736471**, commit **`fbe7d27`**.

---

## The three modifications in this release

This release implements three modifications that were requested together.
Each is described below with what it does, how it was tested, and — where it
could not be tested here — what remains unverified.

### 1. Negative and decimal numbers, everywhere

JENESIS now accepts, stores, calculates, displays and reports negative and
decimal values: −1, −5, −0.5, 0.1, 0.25, 0.5, 1.25, 10.75.

**Rounding is now exact.** The old helper rounded by scaling the number up,
rounding, and scaling back. That is wrong for the values a business hits every
day: `8.165 × 100` is `816.4999999999999`, so it rounded *down* to 8.16. The
worse half was the sign — `-1.005` lost its cents entirely and became `-1`, so
a debit of 1.005 and the credit of −1.005 that is meant to balance it landed a
cent apart. In double-entry books that is not a rounding error, it is an
unbalanced entry. Rounding now works on the number's own decimal digits with
ties going away from zero, so every pair is equal and opposite. This helper is
used 311 times across ten modules, so it touches every figure the program
writes.

**Fractional quantities.** A sale can be for 1.25 kg or 0.5 L. Half a kilo
sold removes half a kilo from stock — not one kilo, and not two. Stored
quantities are never coerced to whole numbers.

**Negative lines and returns.** A negative quantity on a sale is a return: the
stock comes back and the cost of goods is credited. Under FIFO, a negative
quantity used to be discarded outright — the stock came back but the accounts
were never told — so a return now books a cost layer back the same way a
credit note does. Two guards also skipped their work when a value was
negative: tax and cost of goods were only posted when greater than zero, so a
return dropped them and the entry came out hundreds out of balance.

**Refunds.** A refund could not be recorded at all: payments refused any
amount that was not greater than zero, and the banking screen refused it twice
more. A negative amount is now a refund. Because every balance in the posting
is written as a signed addition of the amount, a negative runs the whole
posting in reverse on its own — the bank balance falls instead of rising, the
invoice becomes less paid, and the customer owes more. The entry reverses too:
a debit of a negative amount is recorded as a credit, which is what a refund
is. Three guards were added: a refund cannot exceed what was paid on an
invoice, a zero amount is refused, and a refund is labelled *Customer Refund*
or *Supplier Refund* so the ledger says what happened.

**The engine still refuses a negative debit or credit**, which is correct. A
correction written as a negative is recorded as a positive on the opposite
side — the way an accountant writes it — so every report, total and balance
stays meaningful.

**A negative entry is never automatically treated as a refund.** Returned
products, financial refunds and accounting corrections remain distinct: a
return has its own document (a credit note) which records the reason and can
restock; a refund is a negative payment; a correction is a negative on the
side being reduced. Stock movements and accounting entries stay consistent.

Deliberately **not** changed: goods receipts and stock transfers keep their
positive-only rule, because both have a dedicated return or reversal document;
and counting banknotes still rounds to whole notes, because half a banknote
does not exist.

### 2. Customisable receipt printing

A shop could print an invoice through the browser's print window and nothing
else: no choice of printer, no paper size, no way to shape the receipt, no way
to see it before printing, and no memory of any of it.

Receipts are now built from a layout the user sets, on the computer they are
using, for the application they are in.

- **Printer.** Every printer on the computer is listed, USB and network
  alike. One that is offline, out of paper or jammed is *shown*, greyed out
  with the reason, rather than hidden — a printer that has silently vanished
  is far more confusing than one that is visibly not ready. A test receipt can
  be printed to check alignment before a customer is waiting.
- **Paper.** 58 mm and 80 mm rolls, A4, or a custom width. A roll is
  continuous and gets a cut mark; a cut sheet is paginated and does not.
- **Appearance.** Text size, typeface, bold, line spacing, four margins,
  heading and logo alignment, the receipt title, the footer message, and a
  switch for each of seventeen pieces of information that can appear.
- **Preview.** The print document itself, painted at true millimetre size,
  with an estimate of whether the receipt fits the paper and a way back to the
  settings.
- **Memory.** Per computer **and** per application. A Seller who sets a 58 mm
  roll on the till cannot have it replaced by an Admin saving an 80 mm layout
  in the back office, because the application is part of every request.
- **Access.** In JENESIS Settings → Printing, and reachable from a sale via a
  new *Print receipt* button. Existing invoice and statement printing is
  untouched and still works.

Built to survive the cases that break naive receipt code: decimal quantities
print as written (1.25 stays 1.25, and 2 does not become 2.0000); a returned
item is a minus quantity marked as a return and named in words; French and
Kinyarwanda survive, because the encoding is declared before any text that
needs it and the font stack is one that actually contains those glyphs; and a
product name cannot inject markup into the receipt.

**Printing changes nothing.** It is tested: receipts are built against a copy
of the database and the file is asserted byte-for-byte unchanged afterwards,
with the journal entry count identical.

### 3. Help that belongs to the application you opened

The Seller, the accountant, the person who looks after the network and whoever
configures the program were all handed the same guide. Each had to read past a
great deal that had nothing to do with them — and worse, the Seller's guide
carried accounting instructions for work a Seller is not allowed to do.

Each application now has its own guide, chosen **automatically** from the
application the user opened. Nobody is ever asked which guide they want.

| Application | Sections |
|---|---|
| **Seller** | The screen, recording a sale, finding a product, customers, receipts and payment, printing a receipt, returns and refunds, checking stock, shortcuts, troubleshooting. **No accounting.** |
| **Accounting & Business** | Dashboard, accounting operations, purchases and bills, customers and suppliers, taxes and VAT, financial reports, accounting records, users roles and permissions, administrator functions, shortcuts. |
| **Network & Maintenance** | The screen, network configuration, connecting computers on the network, managing connections, network troubleshooting, settings, shortcuts. Deliberately no accounting, sales, purchase or stock instructions. |
| **Settings & Access Point** | Overview, printers, receipt layouts, language, light and dark appearance, preferences, configuration options, configuration troubleshooting. |

All four guides in **English, French and Kinyarwanda** — 36 sections each,
108 in all — using the same structure as the existing guide, so the design is
unchanged. Every guide ends with the same credit in every language: *JENESIS
is created and developed by KAYIGANWA JACQUES.*

Two leaks were found while testing and closed. The Help screen drew the live
shortcut catalogue, which lists every shortcut in the program including the
accounting ones — showing that to a Seller is handing them accounting
instructions, so the full catalogue is now drawn only for the general guide.
And the closing line told the reader to "print the Trial Balance"; each
application's guide now ends with its own translated note.

The guides are checked **against the program itself**, not only against each
other: every application named must be a real JENESIS application, every
shortcut promised must be one the program listens for, and every printing
setting the Settings guide offers must exist in the receipt layout module.

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

## What is new in 1.0.2

1.0.1 delivered the three modifications. 1.0.2 is the audit of them: every
report was walked with negative and decimal values, and every form was checked
against what the engine actually accepts. Four defects were found in the
reports and four in the forms. All eight are fixed, and each now has a test
that fails if it comes back.

### Reports: values that were hidden rather than processed

**AR and AP ageing dropped every credit balance.** Both filtered
`current_balance > 0` on the customer or supplier and `balance_due > 0` on the
invoice. Refund a customer more than they owed and the business owes *them* —
a negative balance — and that customer vanished from the very report an
accountant reads to find out who is owed what. An overpaid supplier
disappeared the same way. Both reports now show every non-zero balance in
either direction, and a negative total is printed as a negative.

**Inventory valuation overstated total units by exactly two.** The line

    roundTo(products.reduce((acc, p) => acc + (p.current_stock || 0), 2), 2)

passes `2` as the reduce's *initial value* rather than as `roundTo`'s
decimals, so every stock total started counting at 2. Every total units figure
JENESIS has ever printed was two too high.

**Inventory valuation printed unrounded rows under a rounded total.** 1.25 kg
at 10.3333 showed `12.916662500000001` in the row and `12.92` in the total
below it, so the column visibly failed to add up. Rows are now rounded to the
currency's decimals — and quantities to *four* decimals, because a business
selling 0.125 kg lots must not see them rounded out of its own stock total.

### Forms: numbers the engine stored but nobody could type

A **purchase bill line could not carry a negative correction** — the form
demanded `min="0.01"` while `postPurchaseInvoice` handles a negative line
correctly. A **credit note could not be raised for half a unit** — the field
demanded `min="1"` while the engine accepts any quantity above zero. A
**reorder point** could only be a whole number. And **nine money, cost and
price fields were locked to `step="0.01"`**, which makes the browser reject a
third decimal even though the company's currency is configurable to four.

Three restrictions were left in place on purpose, and the tests now say so out
loud instead of leaving someone to wonder: a stock transfer line and a goods
receipt line are refused by the engine, so relaxing the form would only let
the user type a value the engine then rejects (a supplier return has its own
instrument); and the cash-count quantity counts banknotes, and half a banknote
is not a thing.

### The Help guides are generated again

The four guides — 39 sections each, in English, French and Kinyarwanda — had
no way to be regenerated, because the scripts that produced them were outside
the repository and were lost. The sources are now data in
`scripts/helpgen/content/`, with `npm run help:build` to write the module and
`npm run help:check` to fail if the two drift apart. The generator reproduces
the committed module byte for byte, which is also the proof the recovered
sources are faithful.

### This release's own tests found all of it

Nothing above was found by reading code alone. `tests/report-audit.test.js`
(17 checks) walks every reporting function with a customer who was refunded
too much, a supplier who was overpaid, an overpaid invoice and a product held
at 1.25 kg. `tests/decimal-negative.test.js` gained 7 checks, including one
that reads the JSX and pins the form constraints down.

**Suite: 713 checks, 0 failed, 40 suites.** 1.0.1 shipped with 684.

---

## JENESIS 1.0.1 — the release this one supersedes

1.0.1 remains published and untouched. Its files and checksums are recorded
here because a later build gives the download page different numbers, and
anyone who already has 1.0.1 should still be able to prove what they have.

Built by GitHub Actions (build 42921736471, from commit `fbe7d27`).
Smoke test of the installed application: **30/30 PASS**.

The build reference is written out longhand on purpose. The release
notes are re-stamped with each build's run id and commit, and a line
reading `run <id>, commit <sha>` would be rewritten to name the *new*
build — which would leave this paragraph claiming 1.0.1 was built by
1.0.2. Phrasing it as `build 42921736471` keeps it out of that pattern.

```
JENESIS 1.0.1 Setup.exe       93,144,759 bytes   d85f4db8d0e75012b5a224c7d496b6a6f792ecf2235352b84888196fa100a3de
JENESIS 1.0.1 Portable.zip   133,858,567 bytes   b394d480945fc3db045113c5448440a69a000f1738a9de30585f649024e507d7
JENESIS 1.0.1.zip              6,468,905 bytes   f1b82c94a6d21d778b52d309be646e6b503bd6ec8c46ca4e5b3c46bd727788c6
```

1.0.1 contained the three modifications themselves. 1.0.2 contains the audit
of them. If you are already running 1.0.1, nothing you have recorded changes:
no migration touches existing rows, and the corrections above only alter what
the reports *show*, not what was posted.

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
| Whole automated suite | **713 checks, 0 failed, 40 suites** |
| Report audit suite (new in 1.0.2) | 17 checks |
| Decimal & negative suite | 25 checks (15 in 1.0.1) |
| Receipt layout suite | 27 checks |
| Receipt settings render suite | 16 checks |
| Application Help suite | 27 checks |
| Help generator check (new in 1.0.2) | 1 check |
| Right-click suite | 28 checks |
| Seller dashboard suite | 9 checks |
| Settings & Access Point suite | 17 checks |
| Installed-application smoke test | **30/30 PASS** on a Windows runner |
| `npx vite build` | clean |
| Translation parity en/fr/rw | 1,262 keys per language, 0 missing |

The three new suites run against a **real server on a real copy of the
accounting database** and check the database afterwards. `genesis.db` is hashed
before and after every suite and must come out unchanged.

The three new suites run against a **real server on a real copy of the
accounting database** and check the database afterwards. `genesis.db` is hashed
before and after every suite and must come out unchanged.

**The tests found real defects, and finding them is the point:**

* the accounting dashboard still answering a Seller window,
* a used tax rate still answering `200` to `DELETE`,
* closing an application not taking effect until the next sign-in.

All three are fixed and all three now have a test that fails if they come back.

This release's suites found real defects too:

* `roundTo` rounding `-1.005` to `-1`, discarding the cents, so a debit and
  its matching credit could not balance;
* a return under FIFO restoring the stock but posting no cost of goods;
* tax and cost of goods being skipped when the value was negative, leaving a
  return hundreds out of balance;
* a refund being impossible to record at all;
* the Seller's Help guide carrying accounting instructions — including a live
  shortcut catalogue listing the ledger shortcuts, and a closing line telling
  the reader to print the Trial Balance.

Each is fixed and each now has a test that fails if it comes back.

---

## What is in the release

```
JENESIS 1.0.2 Setup.exe        Windows installer (NSIS), four desktop shortcuts
JENESIS 1.0.2 Portable.zip     The same application without installing
JENESIS 1.0.2.zip              Source-code backup of the finished project
```

Each is published with a `.sha256` next to it. Verify with
`certutil -hashfile <file> SHA256`.

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
3. **Messenger between two separate physical computers is not proven.** Two
   real services on one machine is not two computers.
4. **The installer is unsigned.** Windows SmartScreen will warn (More info →
   Run anyway).
5. **Nothing has been run on a physical PC** — only on GitHub-hosted Windows
   runners. Antivirus, SmartScreen, graphics drivers and user account control
   are all things this runner does not have.
6. **Printing has never been tested against a real printer.** No printer
   exists in the build environment, and there is none here. What *was* tested:
   building the receipt document for every paper size, every layout option and
   the hard cases (decimal quantities, returned items, French and Kinyarwanda
   text, a 200-line receipt); that printing leaves the database byte-for-byte
   unchanged; that each application keeps its own saved layout. What was
   **not** tested: discovering a real printer, sending a job to one, or
   whether a receipt comes out of a thermal roll or an A4 sheet correctly.
   Please print a test receipt from Settings → Printing before relying on it.
7. **No live Windows database migration test.** Migration 6 was applied to a
   copy and every migration from 1 to 6 replays cleanly, but a real company
   database upgrading in place has not been watched.
8. **Right-click was never clicked by a person.** Every action is exercised in
   code and over HTTP; whether the menu lands where the cursor is on a real
   screen is unverified.
9. **The four Help guides have never been read on a screen.** All 108 sections
   are proven to exist, to be complete, to be genuinely translated rather than
   English copied, and to render for the right application. Whether the prose
   reads well, and whether every instruction matches your business, is
   something only you can judge.

---

## Upgrading from 0.5.4

Install over the top. **Your database is not touched** — no data is deleted,
replaced or re-created, and nothing is re-seeded. Migration 6 adds one small
`system_config` table; it runs once, automatically, on first start.

Back up first anyway: *Settings & Access Point → Backups*.
