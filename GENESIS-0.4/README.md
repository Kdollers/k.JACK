# JENESIS 0.1

**Business management & accounting software by KAYIGANWA JACQUES.** This is an early Windows desktop release based on the existing GENESIS project, **not a clean-slate rewrite**. Its historical source database is confidential project data, not a starter database: never ship it, reset it, or run tests against it. Normal users install an application; Node.js and developer tools are only needed to build or troubleshoot from source.

## Three independently launchable applications

| Shortcut / color | What it does | Who may sign in |
| --- | --- | --- |
| **JENESIS Seller** · red `#DC2626` | Customers, product catalog **without purchase costs**, sales and invoices, display-only calculator. | Sales, administrator |
| **JENESIS Administrator** · blue `#2563EB` | Company settings, authorized sales/purchasing, inventory, accounting, banking, reports and backup; display-only calculator. | Administrator, accountant, purchaser, inventory staff, read-only manager (modules still require role permissions) |
| **JENESIS Network and Maintenance** · green `#16A34A` | Local service/database health and verified, full-database SQLite snapshots; administrators can additionally export/restore a company. **No calculator or business module.** | Network staff, administrator |

Each Windows shortcut opens its own mode-specific window. All three share **one local backend and one live SQLite database**, not synchronized database copies. The server binds the session to its entry-point mode and checks permissions and company membership on **every** request. A browser-side menu is not a security boundary. The administrator shortcut is the default when running `JENESIS.exe` without arguments; shortcuts for Seller and Network pass validated mode flags.

## Existing accounting functionality

- Customers, suppliers, products and companies have tested create/edit/search, validation, error reporting, restart persistence and company isolation. Creating another company gives it its **own** account definitions, with no copied balances/transactions. Existing-company base currency cannot be changed through the settings API.
- Sales invoices, credit notes, purchasing bills and returns, payments, stock movements/adjustments, journals and financial reports remain in the existing stack. Posting workflows are transactionally scoped and tested for balanced journals and idempotence; use a documented reversal rather than deleting posted history. Do not use this software as sole proof of legal/tax compliance.
- Per-company base currencies: **XAF** (Central African CFA franc), RWF, USD, EUR and UGX. A company maintains amounts in the chosen base currency. **No automatic FX conversion, historical-rate engine or certified FIFO costing.** Zero-decimal companies refuse invoices/payments/journals with fractional monetary values rather than silently hiding them; tax/discount amounts must resolve to whole currency units until a jurisdiction-specific rounding policy is established. Existing stored currency amounts are not reinterpreted during upgrade. More countries can be selected by ISO country code; a country selection does not implement its tax law automatically.
- English, French and Kinyarwanda interface catalogs, formatted dates/numbers, translated native menus, and a **bundled offline Help Center** with role-specific tutorials and an honest About/limitations section. External review of legal/accounting terminology, especially Kinyarwanda, is still required.

## Installing and preserving data

An unsigned Windows NSIS installer is built and installed/tested on a **hosted Windows runner**, not a physical Windows 10/11 PC. The installer does not ship a sample database, historical users or a default password. On a fresh installation it creates `%APPDATA%\JENESIS\genesis.db` and prompts once for an administrator and company. On upgrade, if `%APPDATA%\GENESIS\genesis.db` already exists, JENESIS keeps using that location instead; it does **not** silently start a blank second ledger. If *both* directories contain databases, startup refuses to choose one. The installed data directory is retained on uninstall; make and verify an external backup before any update/uninstall anyway. See [DESKTOP.md](DESKTOP.md) for the exact recovery process and verified snapshot/export distinction.

**Current limits:** LAN host/client and remote access are **not enabled** in JENESIS 0.1; the backend is loopback-only. Never share, sync or merge live SQLite files over a network. Off-site backups are manual. No physical-PC upgrade, antivirus/SmartScreen or offline installer certification has been completed. This release is unsigned and is not a regulatory certification.

## Development and tests

```bash
npm ci
npm run test:all
npm run build
npm run desktop            # requires Electron available on the development machine
```

`npm run test:all` exercises the accounting engine, CRUD and React forms, mode/session isolation, WAL snapshots, authentication, recovery, security, translations, desktop lifecycle and more, using disposable databases. `npm run desktop:dist` builds `release/JENESIS-Setup-0.1.0.exe` on Windows; the Windows workflow verifies package contents and installs/smoke-tests it in an isolated VM. `npm run release:zip` creates **`../JEN 0.1.zip`** containing source, built UI, help, tests and installer configuration; **no business database, backups, dependencies or installer binary**. This archive is not a substitute for the Windows installer.

The source-run backend listens on `127.0.0.1:3000` by default. For controlled tests, `GENESIS_DB_PATH`/`GENESIS_DIST_DIR` environment variables retain their old names for compatibility. Never set the database path to a real business database when running tests or experimenting. Source tests needing a historical fixture extract a **temporary copy** from the separate original GEN 0.4 archive. See [DESKTOP.md](DESKTOP.md) for security, backups, Windows smoke tests and documented limitations.
