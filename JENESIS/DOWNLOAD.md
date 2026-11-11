# Downloading and installing JENESIS on Windows

Everything you need to run JENESIS on a Windows PC, with direct download links.

**Application:** JENESIS 0.5.5 — double-entry accounting for SMEs
(double-entry journals, GL, sales/purchase invoices, receipts, payments, credit
notes, inventory, customers/suppliers, cash/bank/mobile money, AR/AP, trial
balance, P&L, balance sheet, cash flow, multi-company, multi-currency with
period-end FX revaluation, audit trail, backup/restore, English / Français /
Ikinyarwanda) **plus the Light / Dark / System theme system, documents that are
created PAID, a full keyboard layer (F1–F5, Ctrl/Alt shortcuts, layered Esc),
a keyboard-driven calculator, JENESIS Messenger, and an in-app user guide in
English, French and Kinyarwanda (F1)**.

---

## 1. What you get

| File | What it is | Size | SHA-256 |
|---|---|---|---|
| `JENESIS 1.0.2 Setup.exe` | **Windows installer** (NSIS). Installs JENESIS and creates **four desktop shortcuts** — JENESIS Seller (red), JENESIS Network & Maintenance (green), JENESIS Accounting & Business (blue), JENESIS Settings & Access Point (yellow) — each with its own J logo, plus a JENESIS folder in the Start menu and an uninstaller. | see [section 7](#7-files-and-checksums-of-this-build) | see [section 7](#7-files-and-checksums-of-this-build) |
| `JENESIS 1.0.2 Portable.zip` | **Portable package** — the same application, no installation needed. Unzip and double-click `JENESIS.exe`. Useful on a locked-down PC or a USB stick. | see [section 7](#7-files-and-checksums-of-this-build) | see [section 7](#7-files-and-checksums-of-this-build) |
| `JENESIS 1.0.2.zip` | **Source-code backup** of the finished project (every tracked file of the repository). | see [section 7](#7-files-and-checksums-of-this-build) | see [section 7](#7-files-and-checksums-of-this-build) |
| `*.sha256` | Checksum for each file above, so you can prove the download is intact. | — | — |

> GitHub shows the download name with dots instead of spaces
> (`JEN.0.5.5.Setup.exe`). It is the same file; rename it after downloading if
> you prefer spaces.

Both files are built by GitHub Actions from this exact commit and are the same
build that was smoke-tested (see §6). Neither contains tests, source maps,
development tooling or the sandbox-only database adapter — the packaged
application is checked for that on every build (`scripts/verify-package.cjs`).

---

## What is new in JENESIS 1.0.2

### A. Right-click now works, everywhere

Right-click did nothing anywhere in JENESIS. It now opens a menu with **Copy,
Cut, Paste, Edit, Delete, Deactivate, Activate and Select All**, showing only
the ones that make sense for the row under the cursor, in **all four
applications** — on customers, suppliers, products, sales, purchases, banking,
accounting, the audit trail, the other-computer list and the settings panels.

- **Only what is relevant.** A deactivated row offers Activate, not
  Deactivate. A trial-balance figure or an audit entry offers Copy and nothing
  else: they are history, not records.
- **Roles decide what you see, and the server decides what you get.** The menu
  is never the only gate.
- **Destructive actions always ask first**, and the question names the record.
- **An accounting record is never destroyed.** A record carrying accounting
  history is refused deletion with the reason, and the menu offers deactivation
  instead. Journal entries, accounts, audit rows and trial-balance figures are
  marked protected and say so.
- **The menu wears the colour of the application it opens in** — red, green,
  blue or yellow, in Light and Dark.
- **Keyboard shortcuts and ordinary left-click are untouched**, and a shortcut
  does not fire while the menu is open.

**28 checks** cover the actions, the rules, the confirmations, the guard on
accounting records and the colour of every application.

### B. JENESIS Seller has its own dashboard

A screen built around the day at the counter:

| | |
|---|---|
| **New Sale** / **New Receipt** | Opens the sales form with the intent carried over |
| **Sales History** | Recent documents with numbers, customers, balances and a print button |
| **Customer Management** | The people who buy |
| **Product Search** | By name or SKU: the price and whether it is on the shelf — **no cost price** |
| **Available Stock** | Read-only, with what needs restocking |
| **Receipt Printing** | From the sales history |
| **Daily Sales Summary** | How many, how much, how much cash, how much on credit, and the week behind it |
| **Cash Register Information** | Which till accounts there are and what is in them |

**Seller no longer shows** the accounting dashboard, the profit and loss, the
balance sheet, the trial balance, the general ledger, payables, receivables,
administrative reports, company configuration, user management or admin
settings.

And it is **not only hidden**. Hiding a menu is not a defence: the
accounting dashboard used to answer on a permission every role holds, which is
exactly how the accounting figures could still be read from a Seller window
after its menu entry was taken away. A test found it by asking the server. The
route now requires an accounting permission, the menu entry follows the
application, and the accounting dashboard says so plainly when the figures are
not yours to read.

**One database, as before.** A sale written in JENESIS Seller is posted by the
same engine, moves the same stock, writes the same journal entries and takes
the same money into the same till. A test writes a sale from a Seller window
and reads it back as the accountant.

**9 checks**, plus the 24 separation checks, plus a render test that reads the
dashboard's markup and fails on the words *net profit*, *gross margin*,
*balance sheet*, *trial balance*, *general ledger*, *accounts payable*,
*accounts receivable*, *cost of goods* or *profit and loss*.

### C. JENESIS Settings & Access Point owns the settings

All of it in the yellow application, and **removed from Accounting & Business
rather than copied** — there is exactly one settings screen in the project, and
every existing configuration was preserved.

- **User accounts.** Create, rename, deactivate, reactivate, delete; set your
  own password; an administrator resets a forgotten one. An account that is
  part of the company's history cannot be deleted, only deactivated. An
  administrator cannot delete themselves.
- **The Access Point.** Which of the four applications each user may open, and
  which permissions they hold beyond their role or lose from it. Enforced on
  the very next request; closing an application also signs its open windows
  out.
- **Tax rates.** Create, edit, delete, deactivate, reactivate, active and
  inactive listed separately, with these safeguards:

  | | |
  |---|---|
  | A rate used in transactions **cannot be deleted** | refused with `TAX_IN_USE`, naming where it is used |
  | Deactivation **changes nothing** in documents already raised | only the active flag flips |
  | Inactive rates are **not offered** for new transactions | the active list is the default |
  | Historical invoices and reports **keep their original rates** | the rate is stored on the document itself |
  | Reactivation **makes it available again** | immediately |
  | Every change is **written to the audit trail** | against the `TAXES` module |

- **Company settings** — information, identification, currency.
- **General settings** — language (English / Français / Ikinyarwanda),
  Light/Dark/System theme, application preferences.
- **Centralized synchronization.** Every configuration change bumps a number,
  and an already-open window notices it move and reads its permissions again,
  so a permission withdrawn here takes effect in the other applications without
  a restart.

**17 checks** prove the safeguards, the accounts, the access point and the
synchronization against a real server on a real copy of the database.

---

## 2. Direct download links

### Recommended — GitHub release (permanent, no sign-in needed)

- **Installer:**
  <https://github.com/Kdollers/k.JACK/releases/download/v0.5.5/JEN.0.5.5.Setup.exe>
- **Portable ZIP:**
  <https://github.com/Kdollers/k.JACK/releases/download/v0.5.5/JEN.0.5.5.Portable.zip>
- **Source backup:**
  <https://github.com/Kdollers/k.JACK/releases/download/v0.5.5/JEN.0.5.5.zip>
- **All files for this version:**
  <https://github.com/Kdollers/k.JACK/releases/tag/v0.5.5>

### Alternative — build artifacts of the workflow run

If you prefer the files exactly as the build job produced them:

1. Open <https://github.com/Kdollers/k.JACK/actions/workflows/windows-installer.yml>
2. Click the **most recent completed (green) run** at the top of the list, then
   scroll to the bottom, **Artifacts** section
3. Download **`JENESIS-Windows-installer`** (the `.exe` and its `.sha256`),
   **`JENESIS 1.0.2 Portable`** (the portable `.zip` and its `.sha256`),
   **`JENESIS 1.0.2 source backup`** (the source `.zip` and its `.sha256`) or
   **`JENESIS-screenshots`** (pictures of the four installed applications,
   taken during the smoke test)

Artifacts require being signed in to GitHub and are kept for 90 days; the
release above does not expire.

---

## 3. Verify what you downloaded (optional but recommended)

The exact checksums of this build are printed in the table in §7 and are also
attached to the release as `JENESIS 1.0.2 Setup.exe.sha256`. To check a file on
Windows, open the folder in File Explorer, type `cmd` in the address bar… — or
simply use PowerShell from the folder's context menu:

```powershell
certutil -hashfile "JENESIS 1.0.2 Setup.exe" SHA256
```

The value must match the SHA-256 in §7 / in the `.sha256` file.

---

## 4. Installing on Windows (no command prompt, no code)

1. Download `JENESIS 1.0.2 Setup.exe` from the link above.
2. **Double-click** the downloaded file.
3. Windows SmartScreen may say *"Windows protected your PC"* because the
   installer is not code-signed. Click **More info → Run anyway**.
   (Nothing is wrong with the file; signing certificates are not configured for
   this project yet.)
4. The JENESIS setup wizard opens:
   - accept the license,
   - keep the proposed folder, or choose another one,
   - click through the remaining screens.
5. When it finishes, four shortcuts are on your Desktop and in the Start menu:
   **JENESIS Seller**, **JENESIS Network & Maintenance**, **JENESIS Accounting
   & Business** and **JENESIS Settings & Access Point**.
6. Double-click the one you want. The first launch asks you to create the
   administrator account; after that, sign in.

### If you would rather not install: the portable package

1. Download `JENESIS 1.0.2 Portable.zip` and **unzip** it anywhere (Desktop,
   Documents, a USB stick — it is self-contained).
2. Open the folder and double-click `JENESIS.exe`. That opens the application
   chooser; to start one application directly, make your own shortcut to
   `JENESIS.exe --app=seller` (or `--app=maintenance` / `--app=admin` /
   `--app=settings`).
Nothing is written to Program Files; your data still goes to
`%APPDATA%\JENESIS` (see §5), so the portable build and the installed build
share the same company data. To "uninstall", delete the folder.

### Requirements

Windows 10 or Windows 11, 64-bit. About 400 MB of disk space. No other software
is needed — the accounting service, the database and the interface are all
included and run locally; JENESIS works without an internet connection.

---

## 5. Where your data lives, and how to back it up

| What | Where |
|---|---|
| **Database** (shared by all four applications) | `C:\Users\<you>\AppData\Roaming\JENESIS\genesis.db` |
| Automatic and manual backups | `C:\Users\<you>\AppData\Roaming\JENESIS\backups\` |
| Application log | `C:\Users\<you>\AppData\Roaming\JENESIS\logs\desktop.log` |
| Known computers on the network | `C:\Users\<you>\AppData\Roaming\JENESIS\computers.json` |

(`AppData` is a hidden folder: paste `%APPDATA%\JENESIS` into the File Explorer
address bar to open it.)

**Backing up — the easy way (recommended):** in JENESIS open
**Settings → Backup**, and use **Download backup**. That writes a complete,
verified copy of the database. **Restore backup** asks for your password and
first keeps a copy of the current database, so a restore can be undone.

**Backing up — the manual way:** close JENESIS, then copy the whole
`%APPDATA%\JENESIS` folder to an external drive or cloud folder. Copying
`genesis.db` while JENESIS is running can catch a half-written file — use the
in-app backup for daily use, and the folder copy for a full snapshot.

**Your data is safe with this build:**
- Installing never deletes or resets an existing database.
- Updating (installing a new version over an old one) keeps
  `%APPDATA%\JENESIS\genesis.db`; every schema upgrade takes a `pre-migration`
  backup first.
- **Uninstalling keeps your business data**: the program is removed, the
  database folder is not (verified by the smoke test).
- **Deactivating or deleting a record never removes your accounting history**
  (§1E).
- Upgrading from an older **GENESIS** installation: JENESIS **copies**
  `%APPDATA%\GENESIS\genesis.db` into `%APPDATA%\JENESIS\genesis.db` on first
  launch and verifies the copy. The old file is left untouched. It looks for
  `Adopted the existing database from …` in `desktop.log`.

---

## 6. What was tested on this build — and what was not

**Executed and passed** on GitHub Actions (Ubuntu 22.04 and Windows Server
2022 runners, latest completed run of the *Windows installer* workflow):

| Suite | Checks |
|---|---|
| Accounting engine integrity (real database, posted entries) | 10 |
| Authentication & authorization (two scenarios: fresh and legacy upgrade) | 27 |
| Security hardening | 8 |
| Desktop backend | 10 |
| Operations | 36 |
| Database migrations | 9 |
| i18n parity | 10 |
| Foreign exchange | 17 |
| FX revaluation | 15 |
| Documents created PAID | 20 |
| Keyboard shortcuts | 25 |
| **Four applications** (identity, colours, menus, landing screens, per-application themes, one shared database, installer shortcuts, packaging) | **16** |
| Production start-up | 21 |
| Messenger | 18 |
| User guide | 15 |
| Reports screens | 13 |
| **Every screen drawn with React** (all screens, header, sidebar, calculator, network list) | **26** |
| Currency formatting | 9 |
| Translation coverage | 7 |
| Translation scope | 3 |
| **Delete / deactivate / reactivate and the audit trail** | **47** |
| Data location migration | 11 |
| Branding and the J identity | 13 |
| **Application gate** (who may open which application) | **6** |
| **Four applications rendered** | **17** |
| **Strict separation between the applications** | **18** |
| **Network & Maintenance** (two real services, real UDP discovery) | **16** |
| **Test-suite portability** | **37** |
| Theme rules | 34 |
| Theme UI | 6 |
| Interface import gate | 7 |
| **Total** | **531 checks, 0 failed, 31 suites** |

Plus, on the Windows runner:

| Check | Result |
|---|---|
| Production build (Vite) | success |
| Packaged-application verification (no test code, no bundled database, SQLite binary present, interface present as a real directory and complete) | success |
| Installed-application smoke test on a clean Windows Server 2022 VM | see the release page |

The installed-application smoke test: silent install → four shortcuts → starts
from the executable with no manual server or terminal → backend on loopback
only → no external browser → the installed application serves its start page and
every file it references → unauthenticated requests refused → first-run setup →
sign-in → **the window shows real content and not a blank screen (its pixels
are captured and counted)** → the interface reports a successful start and no
start-up error is logged → balanced journal entry → trial balance balanced →
backup export → graceful shutdown (all processes exit) → relaunch, data
persists → backup restore keeps a pre-restore copy → clean close → the installed
build ships both themes → **four desktop shortcuts, each named for its
application, each carrying its own `--app=` argument and its own icon** → the
same four entries in the Start menu → **all four applications opened from their
own shortcut, each showing a real interface** → **all four running side by side
on one shared company** → the credentials are typed into the window with the
keyboard, the way a user signs in, and any error the interface reports fails
the run → silent uninstall keeps the business database.

Every window the smoke test verifies is **photographed**: the runner has no
display, but the windows are still rendered into bitmaps, so the four
applications in the release are shown by real pictures of the installed build,
not by mock-ups. They are attached to the release and published in the
`JENESIS-screenshots` artefact.

> **What the typed sign-in does and does not prove.** The step opens JENESIS
> Accounting & Business, types the username, the password and `Enter` into the
> window, then fails on any `renderer: render-error`, `ReferenceError` or
> `is not defined` line in `desktop.log`. Whether the keys actually reach the
> interface depends on the machine, so every build prints the value its own run
> recorded (`confirmed` / `NOT confirmed`) in the release notes.

**Not executed — please read:**

- **The installer has never been run on a physical Windows PC.** It was
  installed, launched and used by an automated script on a GitHub-hosted
  Windows Server 2022 virtual machine. Real PCs differ (antivirus, SmartScreen,
  GPU/driver behaviour, user account control). The white screen reported on a
  real HP computer could not be reproduced there, which is why the application
  now checks itself at start-up and shows a diagnosis instead of a blank
  window.
- **Two computers on a real network have not been tested.** Every network
  function was tested between two real JENESIS services on the same machine,
  talking over real UDP and HTTP sockets — but on one machine. Discovery
  depends on your network allowing UDP broadcast on port 41235; some routers,
  guest Wi-Fi networks and corporate switches block it. **To prove it on your
  own two computers:** switch on *Allow other computers on this network to
  connect* in JENESIS Network & Maintenance on both, then look for each other
  in the computer list. If a computer is not found, the *Diagnose* button says
  which of the eight known causes applies.
- **Neither theme has been looked at by a human or a browser.** The build
  environment has no display, so the themes were verified by measurement
  (128 text/background pairs, all ≥ 4.5:1 contrast in both themes; every colour
  class in the interface audited) and by checking that the installed package
  really contains the theme code — not by eye. Spend two minutes in both
  themes after installing. The screenshots do show both.
- **The installer is unsigned**, so Windows SmartScreen will warn until a code
  signing certificate is configured.
- **The keyboard layer, the Messenger panel and the user guide have not been
  clicked through by a human in the installed application**; they are verified
  by tests, source assertions and a production build. A short hands-on pass is
  recommended.
- **Messenger has not been proven between two physical computers.** Live
  delivery, receipts, permissions and company isolation are tested against one
  service with two independent sessions (18 checks), and
  `scripts/messenger-two-computers.cjs` repeats the whole exchange over HTTP
  with two signed-in accounts — but both sessions run on the same machine. To
  prove the network: run
  `node scripts\messenger-two-computers.cjs --server http://<that PC>:3000
  --user <name> --peer <name> --password <pw>` from a second computer.
- **Two areas were repaired after the first build of this version, and both are
  covered by tests now.** The sales invoice reads the list of tax rates from a
  route that was guarded by an accounting permission alone, so a clerk in
  JENESIS Seller was refused the rates their own screen asked for; reading is
  now allowed to either role while defining a rate stays with accounting (4
  checks). And the test suite required `node:sqlite` in one file, which exists
  only from Node 22.5 onwards, so it crashed on a Node 20 runner — and because
  the crash came before the suite printed a total, the run still looked clean.
  Both are in `tests/test-suite-portability.test.js` and the separation suite.
- Not covered: printing on a physical printer, Playwright end-to-end tests (no
  browser is installable in the build environment — see §1), and a live upgrade
  of a database created by an installed GENESIS build on Windows (covered by
  unit tests on copies instead).

If anything looks wrong after installing, `%APPDATA%\JENESIS\logs\desktop.log`
is the first place to look.

---

## 7. Files and checksums of this build

| File | Size (bytes) | SHA-256 |
|---|---|---|
These are the files published by the build this page describes — GitHub Actions
run 42933650015, commit `c566e25`. A later build carries different numbers; the
ones on the release page always belong to the file you are downloading.

| File | Size (bytes) | SHA-256 |
|---|---|---|
| `JENESIS 1.0.2 Setup.exe` | 93,144,646 bytes (88.8 MB) | `8fcc2cdfef56157e940d55ab330a09f0fb5d543fab8ed191d44d15277642ad41` |
| `JENESIS 1.0.2 Portable.zip` | 133,859,414 bytes (127.7 MB) | `15571760a597f7fa2c8c2989ef04d416ea4adf85f8c4fb7991cfaf8125e00664` |
| `JENESIS 1.0.2.zip` | 6,546,939 bytes (6.2 MB) | `c0836a9eee5001f62e20c522e53ad45fef531a647800b4632eb48ad04cefad8f` |

Built by GitHub Actions on branch `arena/a2c625e8-k-jack`, from the commit
named on the release page (**713 automated checks** on that build, and the
installed-application smoke test recorded on the release page, 30/30 PASS).

Every push rebuilds and republishes these files, so a later build carries a
different SHA-256. The numbers printed on
<https://github.com/Kdollers/k.JACK/releases/tag/v0.5.5> are always the ones
that belong to the file you are downloading now, and each `.sha256` file sits
next to its download — compare with `certutil -hashfile <file> SHA256` (§3).
