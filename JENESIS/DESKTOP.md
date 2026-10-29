# JENESIS Desktop (Windows) — Developer and Build Guide

## What this is
JENESIS runs as an Electron desktop application. Electron starts the local
Express/SQLite backend on a loopback port (127.0.0.1 only), waits until it reports
itself healthy, and then opens the JENESIS window. The browser is not needed.

## Commands
| Task | Command |
|---|---|
| Install dependencies | `npm install` |
| Accounting engine tests | `npm test` |
| Desktop backend lifecycle tests | `npm run test:desktop` |
| All tests | `npm run test:all` |
| Build the web interface (`dist/`) | `npm run build` |
| Browser development (existing workflow) | terminal 1: `npm run dev:server`; terminal 2: `npx vite` (open http://localhost:5173) |
| Authentication and permission tests | `npm run test:auth` |
| Run the desktop app from source | `npm run build` then `npm run desktop` |
| Unpacked Windows build (test folder) | `npm run desktop:pack` → `release/win-unpacked/JENESIS.exe` |
| Windows installer (NSIS) | `npm run desktop:dist` → `release/JENESIS-Setup-1.0.0.exe` |

Run the Windows packaging commands on Windows 10/11 (x64) with Node.js 20 or newer.

## Where data lives
- Installed app data: `%APPDATA%\JENESIS\genesis.db` (Electron `app.getPath('userData')`).
- The installation folder is never used for business data.
- Before every launch the existing database is copied to `%APPDATA%\JENESIS\backups\`
  (the last 20 copies are kept).
- The starter database bundled with the installer is copied only on first run,
  and only when no database exists. An existing database is never overwritten.
- Logs: `%APPDATA%\JENESIS\logs\desktop.log`.
- **Upgrading from the older GENESIS build:** on the first launch after the rename,
  if `%APPDATA%\JENESIS\genesis.db` does not exist but `%APPDATA%\GENESIS\genesis.db`
  does, the old database (and any `genesis.db-wal` / `genesis.db-shm` files) is
  **copied** into the JENESIS folder, then verified by size and SQLite header before
  it is opened. The original file is never moved, renamed or deleted, so the upgrade
  can always be undone by hand. A copy that fails verification is discarded rather
  than adopted. The log records `Adopted the existing database from …`.
  Covered by `npm run test:datadir` (11 checks).

## Backup and restore
1. Close JENESIS completely.
2. Copy `%APPDATA%\JENESIS\genesis.db` (and any `genesis.db-wal` / `genesis.db-shm`
   files next to it) to a safe location.
3. To restore: close JENESIS, replace `genesis.db` (and remove the `-wal`/`-shm` files)
   with your backup copy, then start JENESIS.

The in-application JSON backup/restore is part of the existing Settings module.

## Uninstalling
Uninstall JENESIS from Windows Settings → Apps. The uninstaller removes the program
files only. `%APPDATA%\JENESIS` (your business data) is kept unless you delete it yourself.

## Security notes
- The backend binds to 127.0.0.1 only and checks its own identity before the window opens.
- The renderer runs with contextIsolation, sandbox and nodeIntegration disabled.
  Its only desktop API is `window.genesisDesktop.getAppInfo()` (read-only).
- Navigation is limited to the JENESIS origin, and browser permission prompts are denied.
- Every API route except sign-in, setup status and setup requires a valid session token.
  Permissions are enforced by the server for every route, not only by hiding menu items.
- The installer ships no database and no default accounts. The first run shows the setup screen.
- Before each launch the database is copied to `%APPDATA%\JENESIS\backups\`, and before any schema
  migration or backup restore a further copy is made (`pre-migration-*`, `pre-restore-*`).

## Build and verification status

### Automated in CI (GitHub Actions, `windows-2022`)
Workflow: `.github/workflows/windows-installer.yml` (repository root). It runs on pushes to `arena/**`
and on manual dispatch, and performs:
1. `npm ci` and `npm run test:all` (accounting, authentication, desktop backend lifecycle).
2. `npm run desktop:dist`: builds the frontend and the NSIS installer `release/JENESIS-Setup-<version>.exe`.
3. `node scripts/verify-package.cjs release/win-unpacked`: checks the packaged app contains the
   required files and the unpacked SQLite native binary, and contains no tests, no Electron dev
   package and no database.
4. `scripts/smoke-test-installed.ps1`: silently installs the installer and launches JENESIS.exe, then checks:
   backend ready on loopback, no external browser opened on the backend address, unauthenticated access refused,
   first-run setup, sign-in, a balanced journal entry, trial balance balanced, backup export containing the entry,
   graceful window close with all processes exiting, relaunch with the entry still present, backup restore with
   a pre-restore copy written, silent uninstall that keeps `%APPDATA%\JENESIS\genesis.db`.
5. Uploads the installer as the `JENESIS-Windows-installer` artifact.

### On a Windows machine
The same steps can be run by hand on a Windows 10/11 x64 machine with Node.js 22 and Python 3.11 installed (build machine only).
`scripts\build-windows.ps1` runs the same build steps locally (needs Node.js 22 on the build machine only).
`scripts\smoke-test-installed.ps1 -InstallerPath <installer>` runs the installed-application test. It refuses to run
if `%APPDATA%\JENESIS` already exists, so it cannot touch a real business database. The script derives
the executable name, data folder, process name, shortcut names and uninstaller from its `-AppName`
parameter (default `JENESIS`), so `-AppName GENESIS` still smoke-tests an old build.

### Verified so far (this sandbox, 2026-10-29)

- `npm run test:all`: **165 checks, 0 failed** (accounting engine, authentication and
  authorisation, security hardening, desktop backend lifecycle, operations, migrations,
  i18n parity, FX settlement, FX revaluation integrity, data-directory migration, branding).
- `npm run build`: production frontend builds (only the pre-existing >500 kB chunk warning).
- Production server started from `dist/`: `/api/health` healthy, index served, protected
  routes refuse anonymous access.
- **The Windows installer has NOT been built or run.** The workflow above is committed
  but has never executed, and `electron-builder` cannot produce a Windows target in this
  Linux sandbox (no Electron/winCodeSign/nsis downloads, `better-sqlite3` cannot be
  cross-compiled). Nothing here should be read as "the installer works" until a Windows
  job has produced `release/JENESIS-Setup-1.0.0.exe` and the smoke test has passed.
- An earlier report referenced a green GitHub Actions run (38092287331) on branch
  `arena/f172e2ac-k-jack`. That branch is not part of this repository snapshot, so the
  claim could not be re-verified and is not repeated as a result here.

### Limits of that verification
- The runner is a fresh GitHub-hosted Windows Server 2022 VM, not a physical Windows 10/11 PC. Results on a
  consumer Windows machine (Defender, SmartScreen, user profile differences) are not yet confirmed.
- The smoke test does not check offline operation (network disabled) or installer updates.
- Installer updates are not implemented or tested. Updates must keep `%APPDATA%\JENESIS` untouched, which the
  NSIS settings do (`deleteAppDataOnUninstall: false`).
- Code signing is not configured. Windows SmartScreen will warn about an unsigned installer until a
  code-signing certificate is added (`CSC_LINK` / `CSC_KEY_PASSWORD` in CI).

### Diagnostics for failed CI runs
A failed Windows job uploads a `windows-installer-diagnostics` artifact containing the
electron-builder debug log and `%APPDATA%\JENESIS\logs\` (desktop and backend startup
logs). Locally, the same information is in `%APPDATA%\JENESIS\logs\desktop.log` and
`logs\backend-child.log`.

### Browser and Chromium
Electron embeds Chromium to render the interface. It runs inside the JENESIS.exe process and does not open
Chrome, Edge or any other browser. If a future requirement prohibits any embedded browser engine, JENESIS would
need its interface rebuilt with a native Windows UI toolkit (e.g. WinUI/WPF or Qt), keeping the Node-free
backend, the database and the accounting engine, which would be a separate project.

## Backup and restore policy
- **Contents:** a backup holds one company's business data (settings, chart of accounts, contacts, products,
  journals, sales, purchases, payments, inventory, counts). It never holds user accounts, password hashes,
  sessions or the audit log. Restoring therefore never brings back old credentials or permissions.
- **Export:** requires `backup:export`. Format version 2 with a SHA-256 checksum.
- **Restore:** requires `backup:restore`, the current administrator's password, and the typed word `RESTORE`.
  It is refused unless the checksum matches, the backup belongs to the signed-in company, every journal entry
  balances, and all foreign keys resolve. Restores are limited to 5 per hour per user.
- **Safety:** a verified copy of the live database is written to `backups/pre-restore-*.db` before any change.
  The restore runs in one transaction; a failure leaves the data untouched.
- **After restore:** every session is revoked. Users sign in again with their existing credentials.
- **Old backups:** files from the earlier export format (no checksum, incomplete tables) are refused, because
  restoring them would silently lose journal entries and invoices.

## Security controls (tested)
- Rate limits: sign-in (10 failures per account per 15 minutes, 100 per client per 15 minutes), password change
  (10 per 15 minutes), first-run setup (10 per 15 minutes), restore (5 per hour), and a general API limit
  (1200 per minute). Rejected requests get HTTP 429 with `Retry-After`.
- Content-Security-Policy: `default-src 'self'`, no external scripts, styles, fonts, frames or connections.
  `'unsafe-inline'` is allowed for styles only (React style attributes). Also sent: `X-Frame-Options: DENY`,
  `nosniff`, `no-referrer`, and `Cache-Control: no-store` on API responses.
- Electron: sandboxed renderer, context isolation, no Node integration, all permission requests denied, no
  `<webview>`, no pop-up windows, navigation limited to the backend origin.
- Limitation: Electron fuses (for example disabling inspect arguments) are not configured yet.
