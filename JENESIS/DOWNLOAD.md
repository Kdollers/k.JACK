# Downloading and installing JENESIS on Windows

Everything you need to run JENESIS on a Windows PC, with direct download links.

**Application:** JENESIS 1.0.0 — double-entry accounting for SMEs
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
| `JEN 0.5.1 Setup.exe` | **Windows installer** (NSIS). Installs JENESIS and creates **three desktop shortcuts** — JENESIS Seller (red), JENESIS Maintenance (green), JENESIS Admin (blue) — each with its own J logo, plus a JENESIS folder in the Start menu and an uninstaller. | 92,919,376 bytes (88.6 MB) | in `JEN 0.5.1 Setup.exe.sha256` |
| `JEN 0.5.1 Portable.zip` | **Portable package** — the same application, no installation needed. Unzip and double-click `JENESIS.exe`. Useful on a locked-down PC or a USB stick. | 133,576,615 bytes (127.4 MB) | in `JEN 0.5.1 Portable.zip.sha256` |
| `JEN 0.5.1.zip` | **Source-code backup** of the finished project (every tracked file of the repository). | 5,630,489 bytes (5.4 MB) | in `JEN 0.5.1.zip.sha256` |
| `*.sha256` | Checksum for each file above, so you can prove the download is intact. | — | — |

> GitHub shows the download name with dots instead of spaces
> (`JEN.0.5.1.Setup.exe`). It is the same file; rename it after downloading if
> you prefer spaces.

Both files are built by GitHub Actions from this exact commit and are the same
build that was smoke-tested (see §6). Neither contains tests, source maps,
development tooling or the sandbox-only database adapter — the packaged
application is checked for that on every build (`scripts/verify-package.cjs`).

---

### Repaired in this build — JEN 0.5.1

**The white screen is fixed.** The previous build could install correctly,
start its service correctly and still open an **empty white window** in all
three applications, because the built interface was served from inside
`app.asar` only: when that copy could not be read, no HTML, JavaScript or CSS
reached the window and nothing was written to any log. This build:

- ships the interface **twice** — a real `resources\app-frontend` directory
  (preferred, readable by every process) and the copy inside `app.asar`
  (fallback) — and switches to the other one automatically if the first cannot
  be served;
- **verifies the interface before the window appears**: the start page and every
  file it references are fetched from the running application, and the log names
  any file that is missing (`%APPDATA%\JENESIS\logs\desktop.log`);
- **never leaves a blank window**: a start-up guard (`boot.js`) keeps a visible
  “Starting JENESIS…” card on screen, catches a file that fails to load, a
  script error and a stalled start, and shows a translated message with the
  reason, a *Try again* button and *Copy details*;
- **paints your saved Light/Dark theme again** — the bootstrap used to be an
  inline script, which the production Content-Security-Policy blocks, so it is
  now a file of its own;
- is **tested the way the failure looked**: the installed application is asked
  for its interface files, the window is captured and its pixels are inspected
  (a blank window has one colour, a real interface has thousands), and the
  interface must report a successful start in the log.

Nothing else was removed, renamed or replaced: the database, the internal
identifiers, the accounting engine and every existing feature are unchanged.

### New in JEN 0.5

- **Three applications, three shortcuts.** JENESIS Seller (red), JENESIS
  Maintenance (green) and JENESIS Admin (blue) each have their own desktop and
  Start-menu shortcut, with their own icon, title, menu and landing screen, all
  sharing one database — no duplicated and no conflicting records.
- **The J identity everywhere**: the JENESIS J logo in the windows, on printed
  invoices, bills and report letterheads, on the desktop shortcuts and in the
  installer. The old G logo is gone. Internal names that existing installations
  depend on (the database file, the desktop handshake id, the password salt and
  the storage keys) were deliberately left untouched.
- **Light / Dark / System per application.** Each application remembers its own
  theme; `Alt + T` cycles it and Settings → Appearance offers all three.
- **JENESIS Maintenance is a real application**: service and database
  information, the opt-in “allow other computers on this network to connect”
  switch, connecting to another computer (Test, then Apply), verified backups,
  an integrity check and a log viewer.
- **The complete keyboard shortcut table** (31 shortcuts): `F1` help, `F2`
  settle, `F3` print, `F5` refresh, `Esc` close, `Ctrl+S` save, `Ctrl+N` new,
  `Ctrl+E` edit, `Ctrl+F` search, `Ctrl+P` print, `Ctrl+D` duplicate,
  `Ctrl+Enter` submit, `Alt+←/→` previous/next screen, one `Ctrl+Shift+…` key
  per screen (Sales, Receipt, Customers, Purchases, Suppliers, Purchase
  document, Inventory, Product search, Transfers, Accounting, Banking, General
  Ledger, Reports), `Ctrl+Shift+K` calculator, `Ctrl+Shift+M` Messenger,
  `Ctrl+/` shortcut reference, `Alt+T` theme, `Alt+L` language. Plain
  shortcuts stay suspended while you type, and every one respects your
  permissions.
- **Help chapters** for the three applications, banking and cash, and
  maintenance — in English, French and Kinyarwanda, with the credit
  *Created and developed by KAYIGANWA JACQUES.*

---

## 2. Direct download links

### Recommended — GitHub release (permanent, no sign-in needed)

- **Installer:**
  <https://github.com/Kdollers/k.JACK/releases/download/v0.5.1/JEN.0.5.1.Setup.exe>
- **Portable ZIP:**
  <https://github.com/Kdollers/k.JACK/releases/download/v0.5.1/JEN.0.5.1.Portable.zip>
- **Source backup:**
  <https://github.com/Kdollers/k.JACK/releases/download/v0.5.1/JEN.0.5.1.zip>
- **All files for this version:**
  <https://github.com/Kdollers/k.JACK/releases/tag/v0.5.1>

### Alternative — build artifacts of the workflow run

If you prefer the files exactly as the build job produced them:

1. Open <https://github.com/Kdollers/k.JACK/actions/workflows/windows-installer.yml>
2. Click the **most recent completed (green) run** at the top of the list, then
   scroll to the bottom, **Artifacts** section
3. Download **`JENESIS-Windows-installer`** (the `.exe` and its `.sha256`),
   **`JEN 0.5.1 Portable`** (the portable `.zip` and its `.sha256`) or
   **`JEN 0.5.1 source backup`** (the source `.zip` and its `.sha256`)

Artifacts require being signed in to GitHub and are kept for 90 days; the
release above does not expire.

---

## 3. Verify what you downloaded (optional but recommended)

The exact checksums of this build are printed in the table in §7 and are also
attached to the release as `JEN 0.5.1 Setup.exe.sha256`. To check a file on
Windows, open the folder in File Explorer, type `cmd` in the address bar… — or
simply use PowerShell from the folder's context menu:

```powershell
certutil -hashfile "JEN 0.5.1 Setup.exe" SHA256
```

The value must match the SHA-256 in §7 / in the `.sha256` file.

---

## 4. Installing on Windows (no command prompt, no code)

1. Download `JEN 0.5.1 Setup.exe` from the link above.
2. **Double-click** the downloaded file.
3. Windows SmartScreen may say *"Windows protected your PC"* because the
   installer is not code-signed. Click **More info → Run anyway**.
   (Nothing is wrong with the file; signing certificates are not configured for
   this project yet.)
4. The JENESIS setup wizard opens:
   - accept the license,
   - keep the proposed folder, or choose another one,
   - click through the remaining screens.
5. When it finishes, three shortcuts are on your Desktop and in the Start menu:
   **JENESIS Seller**, **JENESIS Maintenance** and **JENESIS Admin**.
   Tick “Run JENESIS” if you want the chooser to start immediately.

### First launch

1. Start **JENESIS Admin** from its desktop shortcut (or open JENESIS and pick
   the application you want).
2. The **setup screen** appears once: company name, and the first
   administrator's name, username and password (at least 10 characters).
   There are no default accounts — the account you create is the only way in.
3. Sign in.
4. Set up the basics under **Settings**: company details, chart of accounts,
   taxes, users and roles, currencies (only if you trade in foreign currency).
5. Choose your language in the top bar (English / Français / Ikinyarwanda).
6. Choose **Settings → Appearance**: **Light Mode**, **Dark Mode** or
   **System Default** (follows Windows). The sun/moon switch in the header
   changes it at any time (`Alt + T` does the same); it applies everywhere
   instantly and is remembered **per application**, so Seller can stay Light
   while Admin is Dark.

### The three applications

| Shortcut | Colour | Opens on | What it is for |
|---|---|---|---|
| **JENESIS Seller** | red | Sales | selling: sales, receipts, customers, stock levels |
| **JENESIS Maintenance** | green | Maintenance | upkeep: stock, the connection between computers, verified backups, integrity check, logs |
| **JENESIS Admin** | blue | Dashboard | administration: accounting, purchases, reports, settings, users and permissions |

Each one opens directly in its own environment and reads the same company data,
so a sale recorded in Seller appears at once in the Admin reports.

### Portable package

Unzip `JEN 0.5.1 Portable.zip` and double-click **`JENESIS.exe`**. The portable
build opens the chooser; to start one application directly, make your own
shortcut to `JENESIS.exe --app=seller` (or `--app=maintenance` /
`--app=admin`).
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
| **Database** | `C:\Users\<you>\AppData\Roaming\JENESIS\genesis.db` |
| Automatic and manual backups | `C:\Users\<you>\AppData\Roaming\JENESIS\backups\` |
| Application log | `C:\Users\<you>\AppData\Roaming\JENESIS\logs\desktop.log` |

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
- Upgrading from an older **GENESIS** installation: JENESIS **copies**
  `%APPDATA%\GENESIS\genesis.db` into `%APPDATA%\JENESIS\genesis.db` on first
  launch and verifies the copy. The old file is left untouched. It looks for
  `Adopted the existing database from …` in `desktop.log`.

---

## 6. What was tested on this build — and what was not

**Executed and passed** on GitHub Actions (Ubuntu 22.04 and Windows Server
2022 runners, latest completed run of the *Windows installer* workflow):

| Check | Result |
|---|---|
| Full automated suite (Linux, real SQLite driver) | **312 checks, 0 failed** (counted by `scripts/count-checks.mjs` from the run transcript) |
| Three applications (identity, colours, menus, landing screens, per-application themes, one shared database, installer shortcuts, packaging) | **12 checks passed** |
| Branding and the J identity (no G logo anywhere, no stale GENESIS text, three different icons) | **12 checks passed** |
| Theme rules: Light/Dark/System, immediate switching, persistence, first paint, tokens, contrast, Electron bridge, per-application keys | **34 checks passed** |
| Theme UI rendered with React (options, icons, accessible names, en/fr/rw, stored preference, fallback) | **6 checks passed** |
| Documents created PAID (settlement, idempotent F2, no duplicate payments, no PAID/UNPAID choice in the forms) | **20 checks passed** |
| Keyboard shortcuts (single listener, typing safety, Escape layering, the user's table, destinations) | **24 checks passed** |
| Messenger (delivery, receipts, permissions, company isolation, live push, no text in logs) | **18 checks passed** |
| User guide (en/fr/rw parity, completeness, agreement with the code) | **14 checks passed** |
| Production build (Vite) | **success** |
| Packaged-application verification (no test code, no bundled database, SQLite binary present, **interface present as a real directory and complete**) | **success** |
| Production start-up (start-up guard, CSP, packaged interface location, shell verification, diagnostics) | **19 checks passed** |
| Installed-application smoke test on a clean Windows Server 2022 VM | **26/26 PASS** |

The 26 installed-application checks: silent install → shortcuts → starts from
the executable with no manual server or terminal → backend on loopback only →
no external browser → **the installed application serves its start page and
every file it references** → unauthenticated requests refused → first-run setup
→ sign-in → **the window shows real content and not a blank screen (its pixels
are captured and counted)** → **the interface reports a successful start and no
start-up error is logged** → balanced journal entry → trial balance balanced →
backup export → graceful shutdown (all processes exit) → relaunch, data
persists → backup restore keeps a pre-restore copy → clean close → **the
installed build ships both themes** → **three desktop shortcuts, each named for
its application, each carrying its own `--app=` argument and its own icon** →
**JENESIS Seller, JENESIS Maintenance and JENESIS Admin each opened from their
own shortcut, each showing a real interface and reporting a start** → **the
three running side by side on one shared company** → silent uninstall keeps the
business database.

**Not executed — please read:**

- **The installer has never been run on a physical Windows PC.** It was
  installed, launched and used by an automated script on a GitHub-hosted
  Windows Server 2022 virtual machine. Real PCs differ (antivirus, SmartScreen,
  GPU/driver behaviour, user account control). The white screen reported on a
  real HP computer could not be reproduced there, which is why the application
  now checks itself at start-up and shows a diagnosis instead of a blank
  window.
- **Neither theme has been looked at by a human or a browser.** The build
  environment has no display, so the themes were verified by measurement
  (128 text/background pairs, all ≥ 4.5:1 contrast in both themes; every colour
  class in the interface audited) and by checking that the installed package
  really contains the theme code — not by eye. Spend two minutes in both
  themes after installing.
- **The installer is unsigned**, so Windows SmartScreen will warn until a code
  signing certificate is configured.
- **Parts B–F were never used by a human on screen**: the keyboard shortcuts,
  the Messenger panel and the user guide are verified by tests, source
  assertions and a production build — not by clicking through them in the
  installed application. A short hands-on pass is recommended.
- **Messenger has not been proven between two physical computers.** Live
  delivery, receipts, permissions and company isolation are tested against one
  service with two independent sessions (18 checks), and
  `scripts/messenger-two-computers.cjs` repeated the whole exchange over HTTP
  with two signed-in accounts: 8 steps passed, 0 failed — but both sessions ran
  on the same machine. To prove the network: switch on "Allow other computers
  on this network to connect" in JENESIS Maintenance, then run
  `node scripts\messenger-two-computers.cjs --server http://<that PC>:3000
  --user <name> --peer <name> --password <pw>` from a second computer.
- Not covered: printing on a physical printer, Playwright end-to-end tests
  (no browser in the build environment), and a live upgrade of a database
  created by an installed GENESIS build on Windows (covered by 11 unit tests on
  copies instead).

If anything looks wrong after installing, `%APPDATA%\JENESIS\logs\desktop.log`
is the first place to look.

---

## 7. Files and checksums of this build

| File | Size (bytes) | SHA-256 |
|---|---|---|
| `JEN 0.5.1 Setup.exe` | 92,919,376 (88.6 MB) | in `JEN 0.5.1 Setup.exe.sha256`, next to the download |
| `JEN 0.5.1 Portable.zip` | 133,576,615 (127.4 MB) | in `JEN 0.5.1 Portable.zip.sha256`, next to the download |
| `JEN 0.5.1.zip` | 5,630,489 (5.4 MB) | in `JEN 0.5.1.zip.sha256`, next to the download |

Built by GitHub Actions on branch `arena/a2c625e8-k-jack`, from the commit
named on the release page (**312 automated checks** and **26/26
installed-application checks** on that build).

Every push rebuilds and republishes these files, so a later build carries a
different SHA-256. The numbers printed on
<https://github.com/Kdollers/k.JACK/releases/tag/v0.5.1> are always the ones
that belong to the file you are downloading now, and each `.sha256` file sits
next to its download — compare with `certutil -hashfile <file> SHA256` (§3).
