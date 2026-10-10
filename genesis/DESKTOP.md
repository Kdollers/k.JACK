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
- Known limitation: the backend API does not yet enforce authentication (see
  "Known limitations" in the release notes).
