# JENESIS 0.1 — desktop, installer, safety and limitations

JENESIS by **KAYIGANWA JACQUES** retains the existing Electron + React + Express + SQLite stack. The three color-coded Windows shortcuts (Seller red, Administrator blue, Network & Maintenance green) open independent windows into **one** local service. Each login creates a mode-bound session; the server checks permissions and company membership. Windows shortcuts select only the UI entry point; they never change a user's role. A separate private HTTPS LAN listener can be enabled explicitly on the host; it is off by default.

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
| Both locations contain databases | The **last explicit local choice** is used. With no saved choice, startup **stops**; ask the owner to identify the correct ledger. | Do not merge or delete either. |
| A previously selected database is missing | Startup **stops** instead of silently creating a replacement. | Restore the correct database from a verified copy with an authorized technician. |

**If you installed JENESIS but see Sign in without ever creating an administrator:** the desktop may have found `%APPDATA%\GENESIS\genesis.db` from an earlier GENESIS installation. At the first launch of this update, a native dialog offers **Use existing GENESIS records** (the default) or **Start separate JENESIS installation**. Choose the latter **only if you want a new, empty company**. Confirm the warning; JENESIS restarts and displays the one-time form for company, administrator name, username, password and confirmation. After submitting it, sign in with the account you just created. No known default password exists. If you have already selected an installation, the login/recovery/setup screen offers a desktop-only switch between them with a second confirmation. It never imports or merges records: old accounts and business history remain in the old directory and still require their own credentials. If you need access to **those original records**, do **not** create a fresh account expecting it to unlock them; contact their administrator or follow authorized offline recovery below. On shared Windows accounts, confirm ownership before choosing a ledger. Browser/LAN clients cannot switch the host database.

The choice is saved in `%APPDATA%\JENESIS\installation-choice.json` (no passwords) after confirmation and is marked initialized once the selected database opens. An unexplained missing database, corrupted choice or two unrelated databases without a recorded selection fails closed; never remove data or the choice file just to re-enable setup. A previous database with no usable administrator shows recovery, not public first-run registration. Data directories and backups are **not** uninstalled or overwritten when switching.

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

## Private LAN: one host, browser clients (opt-in)

1. Choose **one** Windows computer as the host and complete its first-run company/administrator setup locally. Keep that computer powered on and back it up externally. In its green Network & Maintenance window, a network-role user or administrator selects **Enable HTTPS LAN hosting**. This starts a separate TLS-only listener on port `34671`, alongside the existing loopback service. Nothing is exposed before opt-in. The status shows client URLs, the host certificate's SHA-256 fingerprint and expiry.
2. On a second computer on the same **trusted private IPv4 LAN**, use a regular browser and the displayed `https://<host-ip>:34671/seller` or `/administrator` URL. Each user authenticates normally; their mode, role and company restrictions are checked by the same backend and **the host's single SQLite database**. There is no client database to synchronize. **Do not run the installed JENESIS.exe on a client PC expecting it to attach to the host**: this version provides a browser client only and a separate installed executable would create its own ledger.
3. The certificate is generated on the host, is **self-signed**, and is not publicly trusted. Obtain its fingerprint directly from the host's Network screen or another authenticated, independent channel. Inspect the browser certificate's **SHA-256** fingerprint before accepting a first-connection warning; reject any difference. Comparing it to a value served by that same untrusted remote connection provides no protection. Certificate/private key are retained in the selected data directory's `lan-identity/` folder; protect that folder as well as the database. Never email the private key or suppress a changed fingerprint without investigating.
4. The operating-system firewall may require an inbound rule for **TCP 34671 on the Private network profile only**. Restrict it to your trusted local subnet. Do **not** forward this port on a router or expose it to public IPs, hostile Wi-Fi or the Internet. The backend rejects non-private peers, plaintext remote HTTP and remote first-run setup; these checks are defense in depth, not a substitute for network/firewall controls. HTTPS clients cannot change hosting: do that locally on the host. Disable hosting from the same Network screen when it is no longer needed.
5. If the host's private IPv4 address changes, certificate name verification may fail and restart may refuse LAN hosting (`LAN_ADDRESS_CHANGED`). Restore the original address if appropriate, or ask a trusted technician to plan a new certificate and repeat fingerprint verification for **every** client. There is no automatic certificate rotation, DNS discovery, installed desktop-client pairing or WAN/VPN hosting in this version. Local access still works if the LAN port is blocked or the stored certificate/config is damaged; never delete the live database to repair a network problem.

## Security and operational boundaries

- Local desktop backend on `127.0.0.1`; opt-in LAN browser service over HTTPS on private IPv4 only. Public `/api/health` contains app identity, version and status only. Every business endpoint requires an authenticated session and its server-side company-scoped permissions. `x-user-id`, displayed UI controls and an arbitrary mode flag cannot grant access.
- Bearer tokens are stored as digests in SQLite, expire after 30 minutes idle/12 hours absolute, and are rotated when switching companies. Passwords are not bundled. Failed sign-ins are rate-limited and may lock the account temporarily. Request limit headers, CSP, frame and MIME security headers are tested.
- Renderer sandbox and context isolation enabled, Node integration disabled, external navigation isolated. Desktop preload exposes app info, validated en/fr/rw language choice and a narrowly scoped native-confirmed database-selection request; it exposes no filesystem, generic IPC or shell access. Browser permissions are denied.
- Private HTTPS **browser** clients are available only after local opt-in; there is no installed desktop-client pairing or WAN/public Internet service. Moving, syncing or concurrently opening copies of a live database on two computers is unsupported and risks loss. No automatic cloud backups, automated FX conversion/historical rate revaluation, proven FIFO costing, automatic update or jurisdiction-specific tax certification. For XAF/RWF/UGX, fractional monetary lines or taxes are rejected rather than stored behind a zero-decimal display; adjust source amounts with accounting approval.
- Interface/Help Center are bundled in English, French and Kinyarwanda and do not need an internet connection while the local service works. Native Kinyarwanda and legal terms need a qualified local review before regulated use.

## Verification status

`npm run test:all` and `npm run build` pass in the local Linux sandbox on isolated databases. Vite warns about one non-blocking JS chunk over 500 kB. The Electron binary could not be downloaded locally because of a TLS certificate failure, so **no native Electron GUI test ran in this Linux sandbox**. The repository's `.github/workflows/windows-installer.yml` builds and installs the unsigned NSIS binary on an isolated Windows Server 2022 runner, checks the three shortcuts/modes/icons, local startup, accounting, backup, restart persistence and uninstall data preservation. A passing workflow demonstrates that *runner* only, not a real user's Windows 10/11 PC or an offline/upgrade environment. Check the **latest JENESIS 0.1 workflow run** before calling the installer tested; do not confuse it with the earlier GENESIS 0.4.2 runner result.

The source ZIP is not an installer. Its `npm ci`/build instructions are for developers, not for end users. Neither the Windows workflow artifact nor this document is a legal or accounting certification.
