# JEN 0.5 — Release notes

**Release name:** JEN 0.5 &nbsp;·&nbsp; **Version:** 0.5.0 &nbsp;·&nbsp; **Git tag:** `v0.5.0`
**Branch:** `arena/a2c625e8-k-jack` &nbsp;·&nbsp; **Built by:** GitHub Actions
(Ubuntu 22.04 and Windows Server 2022 runners)
**Provenance of the file you download:** the release page and the `.sha256`
file beside each download name the exact workflow run and commit it was built
from.
**Date:** 30 October 2026

JEN 0.5 is the same JENESIS program built up from JEN 0.2 — no rewrite, no new
project, no replacement of the database. It is now **three applications**
sharing one set of records, with the **JENESIS J identity** everywhere.

---

## 1. What you can download

| File | Size | What it is | SHA-256 |
|---|---|---|---|
| `JEN 0.5 Setup.exe` | 92,723,860 bytes (88.4 MB) | **Windows installer** — installs JENESIS and creates the three desktop shortcuts | in `JEN 0.5 Setup.exe.sha256`, next to the download |
| `JEN 0.5 Portable.zip` | 133,341,677 bytes (127.2 MB) | **Portable build** — unzip and double-click `JENESIS.exe`, nothing installed | in `JEN 0.5 Portable.zip.sha256`, next to the download |
| `JEN 0.5.zip` | 5,593,714 bytes (5.3 MB) | **Source-code backup** — every tracked file of the final project | in `JEN 0.5.zip.sha256`, next to the download |

Direct links (GitHub writes the download name with dots instead of spaces — it
is the same file):

- Installer — <https://github.com/Kdollers/k.JACK/releases/download/v0.5.0/JEN.0.5.Setup.exe>
- Portable — <https://github.com/Kdollers/k.JACK/releases/download/v0.5.0/JEN.0.5.Portable.zip>
- Source backup — <https://github.com/Kdollers/k.JACK/releases/download/v0.5.0/JEN.0.5.zip>
- All files of this release — <https://github.com/Kdollers/k.JACK/releases/tag/v0.5.0>

Check a download on Windows with:

```
certutil -hashfile "JEN 0.5 Setup.exe" SHA256
```

and compare with the `.sha256` file shipped beside it.

---

## 2. Installing on Windows (no command prompt, no code)

1. Download **`JEN 0.5 Setup.exe`**.
2. Double-click it.
3. Windows SmartScreen may say *“Windows protected your PC”*, because the
   installer is not code-signed. Click **More info → Run anyway**.
4. Follow the wizard (accept the licence, keep the suggested folder, Next …).
5. When it finishes, three shortcuts are on the **Desktop** and in the **Start
   menu** folder *JENESIS*: **JENESIS Seller**, **JENESIS Maintenance**,
   **JENESIS Admin**.
6. Double-click the one you want. Nothing else to start, no terminal.

First launch asks you once to create the company and the first administrator
account (there are no default accounts and no default passwords). Afterwards,
**Settings** is where you set the company details, chart of accounts, taxes,
users, roles and currencies.

---

## 3. The three applications

| Shortcut | Colour | Opens on | What it is for |
|---|---|---|---|
| **JENESIS Seller** | red | Sales | selling: sales, receipts, customers, stock levels |
| **JENESIS Maintenance** | green | Maintenance | upkeep: stock, the connection between the computers, verified backups, integrity check, logs |
| **JENESIS Admin** | blue | Dashboard | administration: accounting, purchases, reports, settings, users and permissions |

- Each shortcut carries **its own J logo** in its own colour and opens directly
  into its own environment — its own menu, its own landing screen, its own
  window title and its own Windows taskbar identity (pinning Seller does not
  pin Admin).
- Each one remembers **its own theme** (Light / Dark / System). Changing the
  theme in Seller does not change Maintenance or Admin. `Alt + T` cycles the
  theme; Settings → Appearance offers all three.
- **They share one database.** A sale recorded in Seller appears at once in the
  Admin reports; no records are duplicated and no figures conflict.
- Your permissions still apply inside every application: a user who may not
  post an entry sees the same refusal everywhere.

---

## 4. What is new in JEN 0.5

1. **Three applications, three shortcuts** (Seller red / Maintenance green /
   Admin blue) instead of one program with modes — each with its own icon,
   title, menu, landing screen, Windows identity and remembered theme.
2. **The J identity everywhere.** The JENESIS **J** logo is in the windows, on
   the sign-in screen, on printed invoices, bills and report letterheads, on
   the three desktop shortcuts and in the installer. The old **G** logo is
   gone, and a test now fails the build if a G mark or a user-facing
   “Genesis” string comes back. Internal names that existing installations
   depend on were deliberately **not** renamed: the database file
   `genesis.db`, the desktop/backend handshake id `genesis-accounting`, the
   `GENESIS_*` environment variables, the saved language and session keys, the
   company id `comp-genesis-01`, the password salt and the backup file field
   name.
3. **Light / Dark / System, per application**, painted before the first frame
   (no flash), remembered separately per application, with the old single
   preference still honoured.
4. **JENESIS Maintenance is a real application**: service and database
   information, the opt-in *“Allow other computers on this network to
   connect”* switch (off by default: the service only answers this computer),
   connecting to another computer (Test, then Apply), verified backups, an
   integrity check and a log viewer — plus a restart-service action in the
   desktop shell so the network switch can take effect.
5. **The complete keyboard shortcut table** — 31 shortcuts, exactly as
   specified: `F1` help, `F2` settle, `F3` print, `F5` refresh, `Esc` close,
   `Ctrl+S` save, `Ctrl+N` new, `Ctrl+E` edit, `Ctrl+F` search, `Ctrl+P`
   print, `Ctrl+D` duplicate, `Ctrl+Enter` submit, `Alt+←/→` previous/next
   screen, `Ctrl+Shift+S` Sales, `+R` new receipt, `+C` customers, `+P`
   purchases, `+V` suppliers, `+N` new purchase document, `+I` inventory, `+F`
   product search, `+T` stock transfers, `+A` accounting, `+B` banking, `+L`
   general ledger, `+G` reports, `Ctrl+Shift+K` calculator, `Ctrl+Shift+M`
   Messenger, `Ctrl+/` shortcut reference, `Alt+T` theme, `Alt+L` language.
   Plain shortcuts stay suspended while you type, each one respects your
   permissions, and every one is documented in the guide in **English,
   French and Kinyarwanda**.
6. **Help & User Guide**: new chapters for the three applications, banking and
   cash, and maintenance; the full shortcut table; and the credit
   *Created and developed by KAYIGANWA JACQUES.*
7. **More verification**: 293 automated checks (was 270), including new suites
   for the three applications, the release naming and the packaging contents.

---

## 5. Your data: safe by design

- The installer contains **no database**. Your records are never reset,
  replaced or seeded with demo data.
- Data lives in `%APPDATA%\JENESIS` (outside the installation folder), so
  uninstalling the program **keeps** your business data.
- Every schema upgrade takes a `pre-migration` backup first; restoring a
  backup keeps a copy of the current database, so a restore can be undone.
- Upgrading from an older **GENESIS** installation copies
  `%APPDATA%\GENESIS\genesis.db` into `%APPDATA%\JENESIS\genesis.db` on first
  launch and verifies the copy; the old file is left untouched.
- Daily backups: **Settings → Backup → Download backup** (a complete, verified
  copy) or the verified copy button in **JENESIS Maintenance**.

---

## 6. What was tested on this build

Measured on GitHub Actions (latest completed run of the *Windows installer*
workflow):

| Check | Result |
|---|---|
| Full automated suite (Linux, real SQLite driver) | **293 checks, 0 failed** |
| Three applications (identity, colours, menus, landing screens, per-app themes, one database, installer shortcuts, packaging) | **12 checks passed** |
| Branding and the J identity (no G logo, no stale GENESIS text, three distinct icons) | **12 checks passed** |
| Themes (Light/Dark/System, instant switching, persistence, first paint, contrast, per-app keys) | **34 checks passed** |
| Theme UI rendered with React (options, icons, accessible names, en/fr/rw) | **6 checks passed** |
| Documents created PAID (settlement, idempotent F2, no duplicate payments) | **20 checks passed** |
| Keyboard shortcuts (single listener, typing safety, Escape layering, the shortcut table, destinations) | **24 checks passed** |
| Messenger (delivery, receipts, permissions, company isolation, live push, no message text in logs) | **18 checks passed** |
| User guide (en/fr/rw parity, completeness, agreement with the code) | **14 checks passed** |
| Accounting engine, security, migrations, data location, i18n (832 keys × 3 languages), operations | remainder of the 293 |
| Production build (Vite) | **success** |
| Packaged-application verification (no test code, no bundled database, SQLite driver present) | **success** |
| Installed-application smoke test on Windows Server 2022 | **18/18 PASS** |

The 18 installed-application checks: silent install → desktop and Start-menu
shortcuts → starts from the executable with no manual server or terminal →
backend on loopback only → no external browser → unauthenticated requests
refused → first-run setup → sign-in → balanced journal entry → trial balance
balanced → backup export → graceful shutdown (all processes exit) → relaunch,
data persists → backup restore keeps a pre-restore copy → clean close → the
installed build ships both themes → **silent uninstall keeps the business
database**.

---

## 7. What is NOT verified — please read

- **The installer has never been run on a physical Windows PC.** It was
  installed, launched and used by an automated script on a GitHub-hosted
  Windows Server 2022 virtual machine. Real PCs differ (antivirus, SmartScreen,
  drivers, user account control).
- **The installer is unsigned.** Windows SmartScreen will warn until a code
  signing certificate is configured.
- **No screenshots, no human visual review.** The build environment has no
  display and no browser, so themes, colours and logos were verified by
  measurement and by source assertions (contrast ratios, token parity, colour
  classes, icon hashes, the J geometry shared by the interface mark and the
  icon files) — never by eye. Please spend two minutes in both themes after
  installing; a live preview of the three applications is available during
  development, but the *installed* application has not been looked at by a
  person.
- **Messenger has not been proven between two physical computers.** It was
  proven between two independent signed-in sessions over HTTP
  (`scripts/messenger-two-computers.cjs`: 8 steps, 0 failures), but both
  sessions ran on one machine. Run that script from a second computer (after
  switching on network access in JENESIS Maintenance) for the real proof.
- **Printing on a physical printer** has not been exercised; print output was
  verified structurally (the document carries the J logo and the company
  details).
- **No end-to-end browser tests** (the environment has no browser), and no
  live upgrade of a database produced by an installed GENESIS build on
  Windows — that path is covered by 11 unit tests on copies.

---

## 8. How to rebuild this installer

Every push to the branch runs the workflow
`.github/workflows/windows-installer.yml`:

1. **Test suite (Linux)** — `npm ci`, `npm run test:all`, `npm run build`.
2. **Windows installer** — `npm ci`, the full suite again, `npm run
   desktop:dist` (Vite build + `electron-builder --win nsis`), then:
   - `node scripts/verify-package.cjs release/win-unpacked`
   - `pwsh scripts/smoke-test-installed.ps1 -InstallerPath "release\JEN 0.5 Setup.exe"`
   - portable ZIP, source backup (`git archive`) and SHA-256 files
   - publish everything to the GitHub release **v0.5.0** (“JEN 0.5”).

On a Windows PC with Node 20 and Python 3.11:

```
npm ci
npm run test:all
npm run build
npm run desktop:dist
```

which produces `release\JEN 0.5 Setup.exe`.

**Why it was not built inside the development sandbox:** electron-builder’s
`app-builder` cannot download the Windows Electron binary there (the sandbox
only reaches github.com, npm and PyPI) and `node-gyp` cannot cross-compile the
native `better-sqlite3` driver for Windows from Linux — so a locally built
installer would have shipped without a working database driver. The build is
therefore produced and verified on GitHub’s Windows runner, which is also the
only place it can be smoke-tested by installing it.

---

*Created and developed by KAYIGANWA JACQUES.*
