# GENESIS Desktop (Windows) — Developer and Build Guide

## What this is
GENESIS runs as an Electron desktop application. Electron starts the local
Express/SQLite backend on a loopback port (127.0.0.1 only), waits until it reports
itself healthy, and then opens the GENESIS window. The browser is not needed.

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
| Unpacked Windows build (test folder) | `npm run desktop:pack` → `release/win-unpacked/GENESIS.exe` |
| Windows installer (NSIS) | `npm run desktop:dist` → `release/GENESIS-Setup-1.0.0.exe` |

Run the Windows packaging commands on Windows 10/11 (x64) with Node.js 20 or newer.

## Where data lives
- Installed app data: `%APPDATA%\GENESIS\genesis.db` (Electron `app.getPath('userData')`).
- The installation folder is never used for business data.
- Before every launch the existing database is copied to `%APPDATA%\GENESIS\backups\`
  (the last 20 copies are kept).
- The starter database bundled with the installer is copied only on first run,
  and only when no database exists. An existing database is never overwritten.
- Logs: `%APPDATA%\GENESIS\logs\desktop.log`.

## Backup and restore
1. Close GENESIS completely.
2. Copy `%APPDATA%\GENESIS\genesis.db` (and any `genesis.db-wal` / `genesis.db-shm`
   files next to it) to a safe location.
3. To restore: close GENESIS, replace `genesis.db` (and remove the `-wal`/`-shm` files)
   with your backup copy, then start GENESIS.

The in-application JSON backup/restore is part of the existing Settings module.

## Uninstalling
Uninstall GENESIS from Windows Settings → Apps. The uninstaller removes the program
files only. `%APPDATA%\GENESIS` (your business data) is kept unless you delete it yourself.

## Security notes
- The backend binds to 127.0.0.1 only and checks its own identity before the window opens.
- The renderer runs with contextIsolation, sandbox and nodeIntegration disabled.
  Its only desktop API is `window.genesisDesktop.getAppInfo()` (read-only).
- Navigation is limited to the GENESIS origin, and browser permission prompts are denied.
- Every API route except sign-in, setup status and setup requires a valid session token.
  Permissions are enforced by the server for every route, not only by hiding menu items.
- The installer ships no database and no default accounts. The first run shows the setup screen.
- Before each launch the database is copied to `%APPDATA%\GENESIS\backups\`, and before any schema
  migration or backup restore a further copy is made (`pre-migration-*`, `pre-restore-*`).

## Build and verification status

### Automated in CI (GitHub Actions, `windows-2022`)
Workflow: `.github/workflows/windows-installer.yml` (repository root). It runs on pushes to `arena/**`
and on manual dispatch, and performs:
1. `npm ci` and `npm run test:all` (accounting, authentication, desktop backend lifecycle).
2. `npm run desktop:dist`: builds the frontend and the NSIS installer `release/GENESIS-Setup-<version>.exe`.
3. `node scripts/verify-package.cjs release/win-unpacked`: checks the packaged app contains the
   required files and the unpacked SQLite native binary, and contains no tests, no Electron dev
   package and no database.
4. `scripts/smoke-test-installed.ps1`: silently installs the installer and launches GENESIS.exe, then checks:
   backend ready on loopback, no external browser opened on the backend address, unauthenticated access refused,
   first-run setup, sign-in, a balanced journal entry, trial balance balanced, backup export containing the entry,
   graceful window close with all processes exiting, relaunch with the entry still present, backup restore with
   a pre-restore copy written, silent uninstall that keeps `%APPDATA%\GENESIS\genesis.db`.
5. Uploads the installer as the `GENESIS-Windows-installer` artifact.

### On a Windows machine
`scripts\build-windows.ps1` runs the same build steps locally (needs Node.js 22 on the build machine only).
`scripts\smoke-test-installed.ps1 -InstallerPath <installer>` runs the installed-application test. It refuses to run
if `%APPDATA%\GENESIS` already exists, so it cannot touch a real business database.

### Not yet verified
- Electron launch and the Windows installer have not been run in this development environment: Electron's
  Windows binary and the NSIS tools are downloaded from GitHub release assets, which the development sandbox
  cannot reach. They are verified only when the CI workflow (or the commands above) actually runs.
- The smoke-test script was written without being executed (PowerShell was not available in the sandbox).
- Code signing is not configured. Windows SmartScreen will warn about an unsigned installer until a
  code-signing certificate is added (`CSC_LINK` / `CSC_KEY_PASSWORD` in CI).
- Installer updates have not been tested. Updates must keep `%APPDATA%\GENESIS` untouched, which the
  current NSIS settings do (`deleteAppDataOnUninstall: false`), but an automatic updater is not implemented.

### Browser and Chromium
Electron embeds Chromium to render the interface. It runs inside the GENESIS.exe process and does not open
Chrome, Edge or any other browser. If a future requirement prohibits any embedded browser engine, GENESIS would
need its interface rebuilt with a native Windows UI toolkit (e.g. WinUI/WPF or Qt), keeping the Node-free
backend, the database and the accounting engine, which would be a separate project.
