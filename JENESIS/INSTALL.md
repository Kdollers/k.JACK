# JENESIS — Installation, Upgrade and First Launch

JENESIS is a Windows desktop application. You install it once with a normal
installer and then start it from a desktop or Start-menu shortcut. **No command
prompt, no terminal and no development server are needed to use it.**

---

## 1. Install on a Windows PC (10/11, 64-bit)

1. Download **`JENESIS-Setup-1.0.0.exe`** (produced by the build/CI steps below).
2. Double-click it and follow the installer:
   - choose the installation folder (or accept the default),
   - tick "Create a desktop shortcut" if you want one.
3. Click *Finish*. JENESIS creates a **JENESIS** shortcut on the desktop and in the
   Start menu.
4. Start **JENESIS** from that shortcut. The application opens its own window; the
   backend starts automatically on a local (loopback) port. No browser is opened
   and nothing else needs to be started.

> Windows SmartScreen may warn "Windows protected your PC" because the installer is
> not code-signed. Click **More info → Run anyway**. Signing requires a code-signing
> certificate (`CSC_LINK` / `CSC_KEY_PASSWORD` in CI) and is not set up yet.

## 2. Building the installer yourself (Windows 10/11 x64, Node.js 20 or newer)

Two ways, both produce `release\JENESIS-Setup-1.0.0.exe` (about 85 MB):

**A. One click**

```
build-installer.bat
```

It checks Node.js, installs dependencies, builds the application, opens the
`release` folder and prints the next command for the smoke test.

**B. By hand**

```bat
cd JENESIS
npm ci                 :: installs dependencies and the SQLite driver
npm run test:all       :: optional but recommended - must be fully green
npm run desktop:dist   :: builds the frontend and the NSIS installer
```

If `npm ci` fails on `better-sqlite3`, run `npm rebuild better-sqlite3`. That needs
the free "Desktop development with C++" workload from Visual Studio Build Tools
only when no prebuilt binary exists for your Node/Electron combination.

**Automatic build (recommended):** the repository contains
`.github/workflows/windows-installer.yml`. On every push it runs the test suite on
Linux and, on Windows, builds the installer, verifies the packaged folder and
smoke-tests the **installed** application (install → launch → setup → sign-in →
accounting entry → backup → close → relaunch → data still present → uninstall keeps
data). The installer is uploaded as the `JENESIS-Windows-installer` artifact.

That pipeline has run green repeatedly; the most recent verification was CI run
**40958446528** (18/18 installed-application checks), which produced
`JENESIS-Setup-1.0.0.exe` (88 MB) and passed **17/17** installed-application
checks, including "data survives a relaunch" and "uninstall keeps the database".
Download the artifact from that run (or from the latest green run) — it is the
verified installer. It is unsigned, so SmartScreen will warn until a code-signing
certificate is configured.

## 3. First launch

1. Start JENESIS. The **setup screen** appears once:
   - company name,
   - the first administrator's full name, username and password
     (at least 10 characters, not the same as the username).
2. Sign in with that account. There are **no default accounts and no default
   passwords** — the administrator you create is the only way in.
3. Set up the basics in **Settings** before entering transactions:
   - **Company** — address, tax id, base currency and fiscal year,
   - **Chart of accounts** — the default chart is created for you; add accounts as needed,
   - **Taxes** — VAT rates,
   - **Users and roles** — Administrator, Accountant, Sales, Purchases, Inventory,
     Manager (read-only). Every permission is enforced by the server, not by hiding
     buttons,
   - **Currencies and exchange rates** — only needed if you trade in foreign currency.
4. Choose your language (English / Français / Ikinyarwanda) in the top bar or in
   Settings; switching language never changes data.
5. Choose your **appearance** in **Settings → Appearance**: Light Mode, Dark Mode
   or System Default (follows Windows). The sun/moon switch in the header changes
   it at any time, it applies to the whole application immediately, and it is
   remembered for the next launch. Changing the theme never touches your data.

**Other roles** sign in with the accounts the administrator creates for them. An
account created by the administrator must choose a new password at its first
sign-in. Five wrong passwords lock an account for 15 minutes; sessions expire after
30 minutes of inactivity and 12 hours in total.

## 4. Upgrading

| Situation | What to do |
|---|---|
| **From an older GENESIS installation** | Just install and start JENESIS. On first launch it **copies** `%APPDATA%\GENESIS\genesis.db` into `%APPDATA%\JENESIS\genesis.db` (and verifies the copy). The old file is left untouched. Prefer the manual route below if you want to check things yourself first. |
| **From JEN 0.2 / JAN 0.3** | Install over the top and start. Database migration v4 (the FX-revaluation tables and accounts) runs automatically, after a `pre-migration-v4-…` safety copy is written. |
| **Manual upgrade (always safe)** | 1. In the old version: Settings → Backup → **Export** (JSON) *and* close the app. 2. Copy `%APPDATA%\GENESIS\genesis.db` (plus `genesis.db-wal` / `genesis.db-shm` if present) to a safe place. 3. Install JENESIS. 4. Before the first start, copy the database into `%APPDATA%\JENESIS\genesis.db`. 5. Start JENESIS — it opens your existing data. |

**Before any upgrade, take a backup.** JENESIS also makes these copies by itself:

| When | Copy |
|---|---|
| Before pending migrations | `%APPDATA%\JENESIS\backups\pre-migration-v<N>-<timestamp>.db` |
| Before a restore | `%APPDATA%\JENESIS\backups\pre-restore-<timestamp>.db` |
| Every launch | `%APPDATA%\JENESIS\backups\genesis-<timestamp>.db` (last 20 kept) |

## 5. Backups and restore

- **Export:** Settings → Backup → Export produces a signed JSON file containing
  business data only — no users, passwords or sessions. Keep it off the machine.
- **Restore:** Settings → Backup → Import. You must re-enter your current password
  and type `RESTORE`; the app writes a `pre-restore-…` copy first and signs every
  user out afterwards.
- **File-level:** close JENESIS completely, then copy
  `%APPDATA%\JENESIS\genesis.db` (and the `-wal` / `-shm` files if present). To
  restore, close JENESIS, put the file back and delete the `-wal` / `-shm` files.

## 6. Uninstalling

Uninstall **JENESIS** from Windows Settings → Apps. Only the program files are
removed; `%APPDATA%\JENESIS` — your company data and backups — is kept. Delete it
manually only if you are certain you no longer need it.

## 7. Troubleshooting

| Symptom | What to check |
|---|---|
| The window stays blank | `%APPDATA%\JENESIS\logs\desktop.log` and `logs\backend-child.log`; the log shows whether the backend became ready |
| "Setup has already been completed" but you forgot the password | restore a backup export, or ask an administrator to reset the account (Settings → Users) |
| Nothing happens on the first launch after an upgrade from GENESIS | look for `Adopted the existing database from …` in `desktop.log`; if it is missing, follow the manual upgrade in §4 |
| SmartScreen blocks the installer | More info → Run anyway (the installer is unsigned) |
| Port conflicts | the backend picks a free local port automatically; nothing needs configuring |

## 8. Running from source (developers)

```bash
npm ci                 # install dependencies
npm run dev:server     # backend on http://127.0.0.1:3000
npx vite               # frontend with hot reload on http://localhost:5173
npm run test:all       # 165 checks
npm run desktop        # run the Electron shell from source
```
