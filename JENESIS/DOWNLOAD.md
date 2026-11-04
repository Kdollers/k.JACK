# Downloading and installing JENESIS on Windows

Everything you need to run JENESIS on a Windows PC, with direct download links.

**Application:** JENESIS 0.5.4 — double-entry accounting for SMEs
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
| `JEN 0.5.4 Setup.exe` | **Windows installer** (NSIS). Installs JENESIS and creates **four desktop shortcuts** — JENESIS Seller (red), JENESIS Network & Maintenance (green), JENESIS Accounting & Business (blue), JENESIS Settings & Access Point (yellow) — each with its own J logo, plus a JENESIS folder in the Start menu and an uninstaller. | _measured on the built file — see the release page_ | _measured on the built file — see the release page_ |
| `JEN 0.5.4 Portable.zip` | **Portable package** — the same application, no installation needed. Unzip and double-click `JENESIS.exe`. Useful on a locked-down PC or a USB stick. | _measured on the built file — see the release page_ | _measured on the built file — see the release page_ |
| `JEN 0.5.4.zip` | **Source-code backup** of the finished project (every tracked file of the repository). | _measured on the built file — see the release page_ | _measured on the built file — see the release page_ |
| `*.sha256` | Checksum for each file above, so you can prove the download is intact. | — | — |

> GitHub shows the download name with dots instead of spaces
> (`JEN.0.5.4.Setup.exe`). It is the same file; rename it after downloading if
> you prefer spaces.

Both files are built by GitHub Actions from this exact commit and are the same
build that was smoke-tested (see §6). Neither contains tests, source maps,
development tooling or the sandbox-only database adapter — the packaged
application is checked for that on every build (`scripts/verify-package.cjs`).

---

## What is new in JEN 0.5.4

### A. JENESIS is now four separate applications

One installer, four programs, **one shared database**. Each has its own colour,
its own name, its own icon, its own window title and its own Desktop and
Start-menu shortcut:

| Shortcut | Colour | What it is for | Who may open it |
|---|---|---|---|
| **JENESIS Seller** | red | Sell: dashboard, sales, customers, stock, help. Opens on Sales. | Any signed-in user |
| **JENESIS Network & Maintenance** | green | Connections between JENESIS computers and database care — nothing else. | Any signed-in user |
| **JENESIS Accounting & Business** | blue | The full business: purchases, suppliers, banking, accounting, reports, settings. | Any signed-in user |
| **JENESIS Settings & Access Point** | yellow | Company settings and users. | Needs the *Settings access* permission |

The separation is **enforced, not cosmetic**. The backend refuses, per
application, the screens and the API routes that do not belong to it, and the
refusal is written to the audit trail. A Seller user who calls the ledger, the
payroll of users, or the reports API gets a refusal, not a screen: **18
separation checks**, each proved by asking for something that must be denied.

Each application also remembers **its own** theme, and its identity colour does
not change when you switch between Light and Dark.

### B. Network & Maintenance now really manages the network

The green application has become what its name promises. It finds the other
JENESIS computers on the same network (UDP broadcast on port 41235), lists them
with their status, and lets you **connect, disconnect, reconnect and forget**
one. Every action explains itself in plain language — *"the other computer did
not answer"*, *"that address is not a JENESIS computer"*, *"the connection is
switched off on this computer"* — and the explanation never contains a
password, a token or a session id.

Discovery is **opt-in**: nothing is broadcast until you switch on *Allow other
computers on this network to connect* in the green application.

It contains **no** accounting, sales, purchase, customer, supplier, product,
inventory or reporting screen, and its backend refuses all of them.

**16 network checks** exercise this with two real services running on separate
temporary databases, discovering each other over real UDP sockets: discovery,
connect, disconnect, reconnect, refusing a second connection, forgetting a
computer, a bad address, an imposter that is not JENESIS, a computer that has
stopped, and proof that the announcement carries no secret.

### C. Complete translation — English, Français, Ikinyarwanda

Every string a user can see now exists in all three languages: **1,030 keys per
language, 28 namespaces, nothing left untranslated**, checked by a scanner that
fails the build on any missing key. Switching language updates the screen
immediately and is remembered. Financial terms use the established terminology
in each language rather than word-for-word translation.

### D. One currency format, everywhere

Amounts are formatted by a single function, so the same number looks the same
on every screen and in every report: **`1,400.00 XFA`** — thin-space grouping,
two decimals, the currency code after the amount. It is strictly a display
rule; the numbers stored in the database are untouched.

### E. Delete, deactivate, reactivate — with an audit trail

Customers, suppliers, products, stores and users can now be deactivated and
reactivated, and records that carry no history can be deleted. The rules:

- only an **Administrator** or a **Manager** may do it, and the API enforces it
  — hiding the button is not the protection;
- a record that is referenced by accounting history is **deactivated, never
  deleted**: historical transactions are permanent;
- you cannot deactivate yourself, and the last active Administrator cannot be
  deactivated;
- every action is written to the audit trail with **who, when, what and which
  record**.

**47 checks** cover the rules, the guards and the audit entries.

### F. Renaming

**JENESIS Admin is now JENESIS Accounting & Business** — in the window titles,
the shortcuts, the Start menu, the installer, the help chapters and every
translated string. **JENESIS Maintenance is now JENESIS Network &
Maintenance.** Only the visible names changed; internal identifiers, the
database and existing installations are untouched.

---

## 2. Direct download links

### Recommended — GitHub release (permanent, no sign-in needed)

- **Installer:**
  <https://github.com/Kdollers/k.JACK/releases/download/v0.5.4/JEN.0.5.4.Setup.exe>
- **Portable ZIP:**
  <https://github.com/Kdollers/k.JACK/releases/download/v0.5.4/JEN.0.5.4.Portable.zip>
- **Source backup:**
  <https://github.com/Kdollers/k.JACK/releases/download/v0.5.4/JEN.0.5.4.zip>
- **All files for this version:**
  <https://github.com/Kdollers/k.JACK/releases/tag/v0.5.4>

### Alternative — build artifacts of the workflow run

If you prefer the files exactly as the build job produced them:

1. Open <https://github.com/Kdollers/k.JACK/actions/workflows/windows-installer.yml>
2. Click the **most recent completed (green) run** at the top of the list, then
   scroll to the bottom, **Artifacts** section
3. Download **`JENESIS-Windows-installer`** (the `.exe` and its `.sha256`),
   **`JEN 0.5.4 Portable`** (the portable `.zip` and its `.sha256`),
   **`JEN 0.5.4 source backup`** (the source `.zip` and its `.sha256`) or
   **`JENESIS-screenshots`** (pictures of the four installed applications,
   taken during the smoke test)

Artifacts require being signed in to GitHub and are kept for 90 days; the
release above does not expire.

---

## 3. Verify what you downloaded (optional but recommended)

The exact checksums of this build are printed in the table in §7 and are also
attached to the release as `JEN 0.5.4 Setup.exe.sha256`. To check a file on
Windows, open the folder in File Explorer, type `cmd` in the address bar… — or
simply use PowerShell from the folder's context menu:

```powershell
certutil -hashfile "JEN 0.5.4 Setup.exe" SHA256
```

The value must match the SHA-256 in §7 / in the `.sha256` file.

---

## 4. Installing on Windows (no command prompt, no code)

1. Download `JEN 0.5.4 Setup.exe` from the link above.
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

1. Download `JEN 0.5.4 Portable.zip` and **unzip** it anywhere (Desktop,
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
| **Test-suite portability** | **34** |
| Theme rules | 34 |
| Theme UI | 6 |
| Interface import gate | 7 |
| **Total** | **524 checks, 0 failed, 31 suites** |

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
| `JEN 0.5.4 Setup.exe` | _see the release page_ | _see the release page_ |
| `JEN 0.5.4 Portable.zip` | _see the release page_ | _see the release page_ |
| `JEN 0.5.4.zip` | _see the release page_ | _see the release page_ |

Built by GitHub Actions on branch `arena/a2c625e8-k-jack`, from the commit
named on the release page (**524 automated checks** on that build, and the
installed-application smoke test recorded on the release page).

Every push rebuilds and republishes these files, so a later build carries a
different SHA-256. The numbers printed on
<https://github.com/Kdollers/k.JACK/releases/tag/v0.5.4> are always the ones
that belong to the file you are downloading now, and each `.sha256` file sits
next to its download — compare with `certutil -hashfile <file> SHA256` (§3).
