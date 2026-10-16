# JENESIS 0.1

**Business management & accounting software by KAYIGANWA JACQUES.** This is an early Windows desktop release based on the existing GENESIS project, **not a clean-slate rewrite**. Its historical source database is confidential project data, not a starter database: never ship it, reset it, or run tests against it. Normal users install an application; Node.js and developer tools are only needed to build or troubleshoot from source.

## Three independently launchable applications

| Shortcut / color | What it does | Who may sign in |
| --- | --- | --- |
| **JENESIS Seller** · red `#DC2626` | Customers, product catalog **without purchase costs**, sales and invoices, display-only calculator. | Sales, administrator |
| **JENESIS Administrator** · blue `#2563EB` | Company settings, authorized sales/purchasing, inventory, accounting, banking, reports and backup; display-only calculator. | Administrator, accountant, purchaser, inventory staff, read-only manager (modules still require role permissions) |
| **JENESIS Network and Maintenance** · green `#16A34A` | Host health, verified SQLite snapshots and opt-in **private HTTPS LAN hosting** for browser clients; administrators can additionally export/restore a company. **No calculator or business module.** | Network staff, administrator |

Each Windows shortcut opens its own mode-specific window. All three share **one backend and one live SQLite database**, not synchronized copies. The server binds the session to its entry-point mode and checks permissions and company membership on **every** request. A browser-side menu is not a security boundary. The administrator shortcut is the default when running `JENESIS.exe` without arguments; shortcuts for Seller and Network pass validated mode flags. Opt-in LAN **browser clients** use that same host over HTTPS; the installed desktop executable on another PC does **not** automatically connect to the host and must not be used to create a second ledger.

## Existing accounting functionality

- Customers, suppliers, products and companies have tested create/edit/search, validation, error reporting, restart persistence and company isolation. Creating another company gives it its **own** account definitions, with no copied balances/transactions. Existing-company base currency cannot be changed through the settings API.
- Sales invoices, credit notes, purchasing bills and returns, payments, stock movements/adjustments, journals and financial reports remain in the existing stack. Posting workflows are transactionally scoped and tested for balanced journals and idempotence; use a documented reversal rather than deleting posted history. Do not use this software as sole proof of legal/tax compliance.
- Per-company base currencies: **XAF** (Central African CFA franc), RWF, USD, EUR and UGX. A company maintains amounts in the chosen base currency. **No automatic FX conversion, historical-rate engine or certified FIFO costing.** The server rejects explicitly foreign-tagged prices, invoices, payments and journals rather than interpreting them as the company's base currency; legacy contacts with a foreign default currency cannot originate new postings without an FX ledger. Zero-decimal companies refuse invoices/payments/journals with fractional monetary values rather than silently hiding them; tax/discount amounts must resolve to whole currency units until a jurisdiction-specific rounding policy is established. Existing stored currency amounts are not reinterpreted during upgrade. More countries can be selected by ISO country code; a country selection does not implement its tax law automatically.
- English, French and Kinyarwanda interface catalogs, formatted dates/numbers, translated native menus, and a **bundled offline Help Center** with role-specific tutorials and an honest About/limitations section. External review of legal/accounting terminology, especially Kinyarwanda, is still required.

## Installing and preserving data

An unsigned Windows NSIS installer is built and installed/tested on a **hosted Windows runner**, not a physical Windows 10/11 PC. The installer does not ship a sample database, historical users or a default password. On a fresh installation it creates `%APPDATA%\JENESIS\genesis.db` and prompts once for a company and administrator (name, username, password and confirmation). If `%APPDATA%\GENESIS\genesis.db` already exists, a native first-launch dialog asks whether to keep using those existing records (the default) or start a **separate empty** JENESIS installation; it never imports or overwrites the old ledger. If you unexpectedly see Sign in, the old database may already have an administrator; use its credentials or authorized recovery to access **those records**, not a new first-run account. A new, separately confirmed installation has its own first-run form and can later be switched back from the desktop sign-in screen. If *both* directories contain databases without a saved selection, or a selected database disappears, startup stops instead of guessing or silently recreating it. The installed data directories and backups are retained on uninstall; make and verify an external backup before any update/uninstall anyway. See [DESKTOP.md](DESKTOP.md) for the exact recovery process and verified snapshot/export distinction.

**Private LAN (opt-in):** On the host, finish administrator setup, open the green Network app, and enable HTTPS hosting. It listens on TCP **34671** only after that action. Give clients its `/seller` or `/administrator` **browser** address, not the database file; every client signs in to the host. Before accepting the browser's self-signed certificate warning, compare the SHA-256 fingerprint displayed on the client against the fingerprint shown in the host's Network app by a *separate trusted channel*. **Never** accept a mismatch or expose that port to the public Internet. The firewall may need a private-network-only inbound rule; see [DESKTOP.md](DESKTOP.md) for setup, IP changes and recovery. LAN clients require the host to stay powered on. No installed desktop-client connection, Internet/VPN service, automatic certificate renewal or sync is offered.

**Current limits:** Never share, sync or merge live SQLite files over a network. Off-site backups are manual. No physical-PC upgrade, antivirus/SmartScreen or offline installer certification has been completed. This release is unsigned and is not a regulatory certification.

## Development and tests

```bash
npm ci
npm run test:all
npm run build
npm run desktop            # requires Electron available on the development machine
```

`npm run test:all` exercises the accounting engine, five independent base currencies (including rejection of foreign-tagged transactions), CRUD and React forms, mode/session isolation, opt-in LAN/TLS and fingerprint checks, WAL snapshots, authentication, recovery, security, translations and desktop lifecycle, using disposable databases. `npm run desktop:dist` builds `release/JENESIS-Setup-0.1.0.exe` on Windows; the Windows workflow verifies package contents and installs/smoke-tests it in an isolated VM. `npm run release:zip` creates **`../JEN 0.1.zip`** containing source, built UI, help, tests and installer configuration; **no business database, backups, dependencies or installer binary**. This archive is not a substitute for the Windows installer.

The source-run backend listens on `127.0.0.1:3000` by default. For controlled tests, `GENESIS_DB_PATH`/`GENESIS_DIST_DIR` environment variables retain their old names for compatibility. Never set the database path to a real business database when running tests or experimenting. Source tests needing a historical fixture extract a **temporary copy** from the separate original GEN 0.4 archive. See [DESKTOP.md](DESKTOP.md) for security, backups, Windows smoke tests and documented limitations.
