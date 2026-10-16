# JENESIS 0.1 — desktop, installer, safety and limitations

JENESIS by **KAYIGANWA JACQUES** retains the existing Electron + React + Express + SQLite stack. The three color-coded Windows shortcuts (Seller red, Administrator blue, Network & Maintenance green) open independent windows into **one** loopback service. Each login creates a mode-bound session; the server checks permissions and company membership. Windows shortcuts select only the UI entry point; they never change a user's role. No remote/LAN listener is enabled in this release.

## Building and testing (developers only)

| Task | Command |
| --- | --- |
| Install exact dependencies | `npm ci` |
| Run isolated regression suite | `npm run test:all` |
| Build bundled web interface | `npm run build` |
| Run from source | `npm run desktop` |
| Build Windows NSIS installer on Windows x64 | `npm run desktop:dist` → `release/JENESIS-Setup-0.1.0.exe` |
| Build versioned, database-free source archive | `npm run release:zip` → `../JEN 0.1.zip` |
| Windows install/uninstall smoke test **on a disposable PC only** | `powershell -ExecutionPolicy Bypass -File scripts\smoke-test-installed.ps1 -InstallerPath release\JENESIS-Setup-0.1.0.exe` |

Node.js 22 (and Python/build tools for native modules) are needed on the **build machine**. Normal users only run the installer. The installer is **unsigned**; no code-signing certificate, trusted publisher, physical-PC run, offline-install or upgrade-path certification is claimed. Do not suppress genuine antivirus warnings without investigating them.

## Location and data preservation

| Situation | Live database | Safety copies |
| --- | --- | --- |
| Fresh JENESIS install | `%APPDATA%\JENESIS\genesis.db` | `%APPDATA%\JENESIS\backups\` |
| Existing GENESIS data | `%APPDATA%\GENESIS\genesis.db` (retained in place) | `%APPDATA%\GENESIS\backups\` |
| Both locations contain databases | **Startup stops**: ask the owner to identify the correct data; neither is chosen, moved or overwritten. | Do not merge or delete either. |

The install folder contains **no business database, demo accounts or default password**. On a new installation a one-time setup wizard creates the first company, administrator and its chart. A legacy database may require migrations. Before changing an existing DB, the backend creates a `pre-start-*.db` snapshot with SQLite `VACUUM INTO` and verifies integrity; before pending migrations it saves `pre-migration-*.db` the same way. A failed integrity check prevents startup rather than recreating your data. Transactions and users remain in the old directory after an upgrade. `GENESIS_DB_PATH` remains available to **authorized developers** for isolated tests and recovery; do not point it to an unbacked production database.

The NSIS uninstaller is configured **not to delete app data**. Keep an external backup anyway: uninstall/Windows account deletion/disk failure are different risks. Desktop logs and the selected native-menu language are stored under the chosen live data directory. Safety copies contain **all companies, users, hashes and history**, so protect them as sensitive records. Copies on the same drive are not an off-site backup; monitor free space.

## Two separate backup/restore mechanisms

1. **Company JSON export (Settings → Backup, administrator permission):** SHA-256 checksum and format version 2, business rows only for the signed-in company. It intentionally excludes users, password hashes, sessions and audit history; it cannot rebuild a whole installation. Keep a second copy off the PC. Restore is refused unless file format, checksum, company ownership, foreign keys and balanced journals all pass validation. It requires the current administrator password and typing `RESTORE`. The service creates a **verified full SQLite snapshot** `pre-restore-*.db` before the atomic restore and revokes all sessions afterwards. Older incomplete backup formats are refused.
2. **Full host SQLite snapshot (Network & Maintenance):** a Network user or administrator can create a consistent, verified `jenesis-snapshot-*.db` in the host's `backups/` folder without seeing business records in the UI. Only an administrator can additionally download the company JSON export or restore it in that app. To recover the **entire** installation (including users/history), first close JENESIS completely, verify the backend has exited, identify the correct dated snapshot, make another copy of the current database and its matching WAL/SHM sidecars, and ask an authorized technician to restore the selected standalone snapshot. Do **not** replace the live `.db` while running or discard an uncheckpointed `-wal` file; this can lose recent writes. Verify SQLite integrity and accounting balances before allowing staff back in. A full restore may intentionally revert newer transactions and credentials.

Do not put `.db`, `.db-wal`, `.db-shm`, exported JSON, passwords or customer records in Git, support chat or public issue trackers.

## Lost administrator access

Do **not** delete accounts or start first-run setup over existing data. Ask an active administrator to create a separate account if possible. Otherwise the authorized owner can use the **offline source-only** emergency script after closing JENESIS and creating a SQLite-consistent safety copy:

```powershell
node scripts/recover-administrator.cjs --db "%APPDATA%\GENESIS\genesis.db"
# For a fresh JENESIS installation, substitute "%APPDATA%\JENESIS\genesis.db".
```

It checks the existing DB, makes and verifies another `pre-admin-recovery-*.db` copy, and asks for a unique username/strong password plus the exact word `RECOVER`. Existing business rows and users are retained. Its separate `DISABLE DEMO USERS` option only deactivates six precisely identified historical demo users **if explicitly selected**, and never deletes them. This is a technician procedure from source, **not** a step for normal users or a remote API. Lost passwords are never recoverable from stored hashes.

## Security and operational boundaries

- Local backend on `127.0.0.1`; public `/api/health` contains app identity, version and status only. Every business endpoint requires an authenticated session and its server-side company-scoped permissions. `x-user-id`, displayed UI controls and an arbitrary mode flag cannot grant access.
- Bearer tokens are stored as digests in SQLite, expire after 30 minutes idle/12 hours absolute, and are rotated when switching companies. Passwords are not bundled. Failed sign-ins are rate-limited and may lock the account temporarily. Request limit headers, CSP, frame and MIME security headers are tested.
- Renderer sandbox and context isolation enabled, Node integration disabled, external navigation isolated. Desktop preload exposes app info and validated en/fr/rw language choice only; browser permissions are denied.
- **No LAN host/client** or automatic remote sharing. Moving, syncing or concurrently opening copies of a live database on two computers is unsupported and risks loss. No automatic cloud backups, automated FX conversion/historical rate revaluation, proven FIFO costing, automatic update or jurisdiction-specific tax certification. For XAF/RWF/UGX, fractional monetary lines or taxes are rejected rather than stored behind a zero-decimal display; adjust source amounts with accounting approval.
- Interface/Help Center are bundled in English, French and Kinyarwanda and do not need an internet connection while the local service works. Native Kinyarwanda and legal terms need a qualified local review before regulated use.

## Verification status

`npm run test:all` and `npm run build` pass in the local Linux sandbox on isolated databases. Vite warns about one non-blocking JS chunk over 500 kB. The Electron binary could not be downloaded locally because of a TLS certificate failure, so **no native Electron GUI test ran in this Linux sandbox**. The repository's `.github/workflows/windows-installer.yml` builds and installs the unsigned NSIS binary on an isolated Windows Server 2022 runner, checks the three shortcuts/modes/icons, local startup, accounting, backup, restart persistence and uninstall data preservation. A passing workflow demonstrates that *runner* only, not a real user's Windows 10/11 PC or an offline/upgrade environment. Check the **latest JENESIS 0.1 workflow run** before calling the installer tested; do not confuse it with the earlier GENESIS 0.4.2 runner result.

The source ZIP is not an installer. Its `npm ci`/build instructions are for developers, not for end users. Neither the Windows workflow artifact nor this document is a legal or accounting certification.
