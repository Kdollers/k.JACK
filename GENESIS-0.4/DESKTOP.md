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
| Locale, setup/recovery, coded-error and payment tests | `npm run test:i18n`, `npm run test:setup`, `npm run test:recovery`, `npm run test:errors`, `npm run test:payments` |
| Run the desktop app from source | `npm run build` then `npm run desktop` |
| Unpacked Windows build (test folder) | `npm run desktop:pack` → `release/win-unpacked/GENESIS.exe` |
| Windows installer (NSIS) | `npm run desktop:dist` → `release/GENESIS-Setup-0.4.2.exe` |

Run the Windows packaging commands on Windows 10/11 (x64) with Node.js 20 or newer.

## Where data lives
- Installed app data: `%APPDATA%\GENESIS\genesis.db` (Electron `app.getPath('userData')`).
- The installation folder is never used for business data.
- On a new installation, the backend creates a database with a starter company, chart, tax rates
  and zero-balance cash/bank records—**no users, demo transactions or default passwords**. The
  first administrator is created once through the setup screen. No database is bundled in the installer.
- An existing database is never replaced at launch. The desktop copies it to
  `%APPDATA%\GENESIS\backups\` first (up to 20 `genesis-*` prelaunch copies retained).
  Backend `pre-start-*`, migration and recovery safety copies are separate; monitor available disk space.
- Source-run `npm start` uses the same per-user location by default; use `GENESIS_DB_PATH` only when
  intentionally targeting a different **test** installation. Opening an old database can migrate it.
- Logs: `%APPDATA%\GENESIS\logs\desktop.log` and `backend-child.log`.

## Backup and restore
1. Close GENESIS completely and confirm the backend has exited. For a **manual, full-database**
   backup, copy `genesis.db` **together with any matching** `genesis.db-wal` and `genesis.db-shm`
   files into one dated directory. Keep the original until the copy is verified.
2. Before a manual restore, make one more copy of the entire current database and its sidecar files.
   Restore the selected `.db` **with its matching sidecars, if present**, while GENESIS is closed.
   **Never discard a `-wal` file without verifying it has been checkpointed**; this can lose data.
   Have a technician verify the SQLite integrity and business balances before resuming work.
3. Alternatively, use the Settings JSON export/restore to transfer **business records within the
   current company**. It preserves existing local users, hashes and audit history; it does **not**
   recreate administrator credentials. Restore requires an authorized administrator, password
   recheck, confirmation and checksum validation. All sessions are revoked afterwards.

A manually restored full database can also restore older credentials or supersede newer
transactions. Choose the correct backup carefully and obtain the owner's authorization.

## Recovering access to an existing installation
First ask an active administrator to create an account in Settings. If none can sign in,
**do not** delete users or reinstall to reopen first-run setup. The owner/authorized technician
can use the offline recovery script from this source checkout, never via the HTTP API:

1. Close GENESIS and verify its backend process has stopped; make a SQLite-consistent copy of
   the database and any sidecars. Work with the live database only after the owner approves.
2. From this source project's directory, with dependencies installed, run on Windows:
   `node scripts/recover-administrator.cjs --db "%APPDATA%\GENESIS\genesis.db"`
3. Choose a new, unique username and password at the prompts. The script checks the database,
   creates and verifies a `backups/pre-admin-recovery-*.db` safety copy, and requires typing
   `RECOVER`. It keeps all accounting records and existing users. A separate **optional** typed
   `DISABLE DEMO USERS` choice deactivates only the six exact archived demo identities and
   revokes their sessions; it never deletes accounts and is not selected by default.
4. Sign in with the new credentials. Keep the backup until records and permissions are verified.
   For a fresh database, use the first-run setup screen instead: offline recovery refuses it.

The script is a maintenance tool in the **source project**, not a feature bundled with
`GENESIS.exe`; consult a trusted technician if only the installer is available. Do not paste
passwords, database contents, or backups into chat or issue trackers.

## Uninstalling
Uninstall GENESIS from Windows Settings → Apps. The uninstaller removes the program
files only. `%APPDATA%\GENESIS` (your business data) is kept unless you delete it yourself.

## Security notes
- The backend binds to 127.0.0.1 only and checks its own identity before the window opens.
- The renderer runs with context isolation and sandbox **enabled**, Node integration **disabled**.
  Its desktop bridge exposes only `getAppInfo()` and `setLanguage(en|fr|rw)`.
  The latter validates the window origin and saves a non-sensitive UI preference in
  `%APPDATA%\GENESIS\ui-language.json`, so native menus/startup dialogs follow the last choice.
- Navigation is limited to the GENESIS origin, and browser permission prompts are denied.
- Every data API route except sign-in, setup status and one-time setup requires a valid session
  token; the minimal health check is also public.
  Permissions are enforced by the server for every route, not only by hiding menu items.
- The installer ships no database and no default accounts. The first run shows the setup screen.
- Before each launch the database is copied to `%APPDATA%\GENESIS\backups\`, and before any schema
  migration or backup restore a further copy is made (`pre-migration-*`, `pre-restore-*`).

## Build and verification status

### Checks on this source revision
- `npm run test:all` passed on Node.js 22/Linux: accounting-engine, 23 fresh and 6 legacy
  authentication checks, 8 security, 10 desktop-backend lifecycle, setup-state, 7 offline
  recovery, 6 coded-error, payment-display and 10 localization checks. All databases used
  by tests are temporary; the extracted `genesis.db` is neither tested nor modified.
- `npm run build` passed. Vite reports a non-blocking warning for a JavaScript chunk over
  500 kB. `node scripts/check-i18n.cjs` found 0 issues across 908 matching dictionary keys.
- Electron's executable could not be downloaded in this Linux sandbox due to a certificate
  verification failure, so **native Electron launch was not tested locally**. The Windows CI
  verification described below built and exercised the actual installed application.
- The browser-driven `npm run test:e2e` was not run locally: Chromium/Playwright is not
  available here. The Windows smoke test checks the installed backend and accounting flow,
  not a visual translation review or every language-switch interaction.

### Windows packaging
`.github/workflows/windows-installer.yml` runs on pushes to this Arena branch. On a fresh
Windows Server 2022 VM it installs dependencies, runs all tests, builds an **unsigned**
Windows installer, verifies the unpacked package, then uses
`scripts/smoke-test-installed.ps1` to install, launch, test first setup/login/accounting,
close, reopen, restore and uninstall without using any existing customer database. The
installer is uploaded as a testing artifact; no release is published automatically.
**Version 0.4.2:** [Check the latest Windows installer run for this branch](https://github.com/Kdollers/k.JACK/actions?query=branch%3Aarena%2F0c8d3a58-k-jack)
before distributing. A successful run uploads a `GENESIS-Windows-installer` artifact
containing `GENESIS-Setup-0.4.2.exe` and checks installation on the CI runner.
The earlier [run 38831577866](https://github.com/Kdollers/k.JACK/actions/runs/38831577866)
passed for the prior 1.0.0 filename; it does **not** verify the 0.4.2 installer.
CI is on a hosted Windows VM, **not** a physical Windows 10/11 PC.

On a separate, clean Windows 10/11 x64 test machine (with Node.js 22 and Python 3.11
on the **build machine** only), run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
powershell -ExecutionPolicy Bypass -File scripts\smoke-test-installed.ps1 -InstallerPath release\GENESIS-Setup-1.0.0.exe
```

The smoke test intentionally refuses to run when `%APPDATA%\GENESIS` exists. Never use
someone's business installation as a test database. A hosted Windows Server VM is not a
physical Windows 10/11 PC. Offline operation, consumer antivirus/SmartScreen, in-place
upgrades, tax/legal requirements and native Kinyarwanda terminology still need manual QA.
Updates are not implemented or tested. The NSIS setting `deleteAppDataOnUninstall: false`
keeps per-user data. Code signing is not configured; Windows may warn about an unsigned
installer. Electron embeds Chromium; it does not open an external browser window.

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
