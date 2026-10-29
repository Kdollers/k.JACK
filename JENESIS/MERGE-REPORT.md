# JENESIS — Merge Report (JEN 0.2 + JAN 0.3 → one application)

Date: 2026-10-29 · Branch `arena/a2c625e8-k-jack` · Sources: `JEN 0.2.zip` and `JAN 0.3.zip`
(kept untouched at the repository root).

**Result: one consolidated project, `JENESIS/`. 165 automated checks pass, 0 fail.
The Windows installer has NOT been produced — the sandbox cannot build Windows
binaries. A CI workflow that builds and smoke-tests it is included
(`.github/workflows/windows-installer.yml`); it has not been executed yet.**

---

## 1. What the two archives actually contained

Both archives are the same application one day apart, not two different products.

| | JEN 0.2.zip (2026-10-17) | JAN 0.3.zip (2026-10-18) |
|---|---|---|
| Brand | **GENESIS** | **JENESIS** |
| `build.appId` | `com.genesis.accounting` | `com.jenesis.accounting` |
| Windows data folder | `%APPDATA%\GENESIS` | `%APPDATA%\JENESIS` |
| Installer artifact | `GENESIS-Setup-1.0.0.exe` | `JENESIS-Setup-1.0.0.exe` |
| Schema migrations | v1, v2, v3 | v1, v2, v3, **v4** |
| FX features | settlement gain/loss (4800/5900) | settlement **+ period-end revaluation** (4810/5910) |
| i18n keys per language | 642 | **652** |
| Server / src / test LOC | 8,442 / 10,492 / 2,667 | 8,692 / 10,566 / 2,779 |
| Bundled `genesis.db` | MD5 `f6a9690dbdabc6d4778c04c4dfcf0365` | identical |
| Extra files | — | `WINDOWS-INSTALLER-REPORT.md`, `build-installer.bat` |

**I diffed every file before merging.** Outside the rename, the entire delta is
552 lines, all of it the FX-revaluation feature. Every "removed" line in the diff
is an *edited* line (the FX accounts list, an INSERT gaining `booked_exchange_rate`,
the `fx.js` require list) — **JAN 0.3 drops nothing from JEN 0.2**. There was no
older-but-better implementation to rescue: JAN 0.3 is a strict superset.

## 2. Foundation

`JENESIS/` is built from **JAN 0.3** (JENESIS branding + FX revaluation), with the
integration work below applied on top. Nothing from JEN 0.2 was discarded, because
nothing in JEN 0.2 was missing from JAN 0.3.

## 3. Feature provenance

| Feature | Origin | State in the merged app |
|---|---|---|
| Double-entry engine, balanced journals, reversals | both (identical) | preserved, tested |
| Chart of accounts, auto-posting (sales/purchases/payments) | both | preserved, tested |
| Sales: quotes → invoices → credit notes, printing | both | preserved, tested |
| Purchases: POs → bills → returns, weighted-average costing | both | preserved, tested |
| Payments: receipt, supplier, expense, income, transfer, refund, reversal | both | preserved, tested |
| Inventory: stores, transfers, goods receipts, counts, movements, FIFO | both (from JEN 0.2 work) | preserved, tested |
| Cash management (denomination counts, approvals) | both | preserved, tested |
| Multi-currency + exchange rates | both | preserved, tested |
| FX settlement gain/loss (4800/5900) | both (JEN 0.2 v3) | preserved, tested |
| **FX period-end revaluation (4810/5910, booked rates, history)** | **JAN 0.3 only (v4)** | preserved + hardened + 32 new checks |
| Reports: trial balance, P&L, balance sheet, cash flow, A/R & A/P ageing, VAT, statements | both | preserved, tested |
| Multi-company isolation, RBAC, audit trail, backup/restore | both | preserved, tested |
| First-run setup wizard, scrypt passwords, lockout, rate limits | both | preserved, tested |
| Trilingual UI (en / fr / rw), 652 keys | both | preserved, parity tested |
| Electron desktop shell (loopback backend, launch backups, single instance) | both | preserved + data-dir migration |
| Windows packaging scripts | both | **fixed (they were broken by the rename)** |

## 4. Integration work done in this merge

1. **GENESIS → JENESIS data-directory migration** (`electron/data-location.cjs`,
   `electron/main.cjs`). On first launch, if `%APPDATA%\JENESIS\genesis.db` does
   not exist but `%APPDATA%\GENESIS\genesis.db` does, the old database — and any
   `-wal` / `-shm` sidecars — is **copied** (never moved, never overwritten), then
   verified by size and SQLite header; a failed verification removes the partial
   copy instead of adopting a damaged file. JAN 0.3 only told users to copy the
   file by hand. 11 new tests.
2. **FX revaluation hardening** (`server/fx.js`): a document with an unusable
   booking rate is now skipped instead of being restated against a fallback rate
   of 1 (which could invent a gain or loss out of incomplete legacy data).
3. **Migration ordering** (`server/migrations.js`): v4 was listed *before* v3.
   The runner is set-based so nothing was skipped, but the file no longer read in
   version order and the pre-migration backup label was misleading. Now v1→v4 with
   the ordering contract documented.
4. **Windows build/smoke/verify scripts repaired** (they still pointed at the
   GENESIS brand and would have failed 100% against a JENESIS build) — see §5.
5. **Windows CI workflow added** (`.github/workflows/windows-installer.yml`):
   Linux test job + Windows job that runs `npm ci`, `test:all`,
   `desktop:dist`, package verification, the installed-application smoke test and
   uploads `JENESIS-Setup-<version>.exe`. DESKTOP.md documented this workflow, but
   it had never been committed.
6. **UI completeness**: `settings.revaluation_history` existed in all three
   dictionaries but was never rendered; the revaluation history table now has its
   translated heading.
7. **New test suites**: `tests/fx-revaluation-integrity.test.js` (15),
   `tests/data-location-migration.test.js` (11), `tests/branding-consistency.test.js` (9),
   all wired into `npm run test:all`.
8. **Documentation**: this report, `INSTALL.md`, README/DESKTOP updates, and a
   "historical document" banner on `FINAL-REPORT-v2.md`, which still described the
   pre-rename GENESIS 0.4 session while shipping inside the JENESIS build.

## 5. Bugs found and fixed

| # | Bug | Effect | Fix |
|---|---|---|---|
| 1 | `scripts/verify-package.cjs` hard-coded `GENESIS.exe` | package verification always failed after the rename | executable name derived from `package.json` → `build.productName` |
| 2 | `scripts/build-windows.ps1` searched for `GENESIS-Setup-*.exe` | threw "Installer was not produced" even on a successful build | reads `build.productName` from `package.json` |
| 3 | `scripts/smoke-test-installed.ps1` hard-coded `GENESIS.exe`, `%APPDATA%\GENESIS`, process name `GENESIS`, `GENESIS*.lnk`, `Uninstall GENESIS.exe` | **every** installed-app check (launch, setup, login, persistence, uninstall) would fail | parameterised `-AppName 'JENESIS'`; exe, data dir, process name, shortcuts and uninstaller all derived from it; the same script can still smoke-test an old GENESIS build |
| 4 | No adoption path for an existing GENESIS database after the folder was renamed to `JENESIS` | an upgrade could look like data loss ("copy the file across by hand" was the only instruction) | automatic, verified, non-destructive one-time copy (see §4.1) |
| 5 | FX revaluation fell back to rate `1` when a document had no usable booking rate | could post a fabricated unrealised gain/loss | such documents are skipped; covered by a test |
| 6 | `MIGRATIONS` array listed v4 before v3 | misleading pre-migration backup label (`pre-migration-v4-…` while v3 was still pending); confusing to maintain | listed in ascending version order, contract documented |
| 7 | `.github/workflows/windows-installer.yml` was documented but absent | no automated way to produce or verify the installer | workflow added (Linux tests + Windows build/verify/smoke) |
| 8 | `settings.revaluation_history` translated but never used | untranslated-looking heading gap in Settings → Currencies | rendered as the history table heading |
| 9 | `FINAL-REPORT-v2.md` shipped in the JENESIS build but describes the GENESIS 0.4 session | readers could not tell which report is current | marked historical, this report is the current one |
| 10 | `scripts/add_i18n_v2.py` docstring still said GENESIS | cosmetic | docstring updated |

Nothing was found that corrupted accounting data; the bundled `genesis.db` is
byte-identical to both source archives (MD5 `f6a9690dbdabc6d4778c04c4dfcf0365`,
asserted by six suites).

## 6. Test results (executed, this sandbox, 2026-10-29)

`npm run test:all` → **165 checks, 0 failed.**

| Suite | Command | Result |
|---|---|---|
| Accounting engine | `npm test` | 10/10 — trial balance and balance sheet balanced, KPIs |
| Auth & security | `npm run test:auth` | 27/27 (21 fresh install + 6 legacy database) |
| Security hardening | `npm run test:security` | 8/8 — rate limits, headers, backup contents, restore safety |
| Desktop backend lifecycle | `npm run test:desktop` | 10/10 |
| Operations | `npm run test:ops` | 36/36 — walk-in sales, returns, stores, transfers, GRN, counts, cash, FX, authorisation |
| Migrations | `npm run test:migrations` | 9/9 (7 legacy upgrade + 2 fresh install) + repo DB MD5 unchanged |
| i18n parity | `npm run test:i18n` | 10/10 — **652 keys × en/fr/rw**, no empties, placeholder parity, every `t()` key resolves |
| FX settlement | `npm run test:fx` | 17/17 — 4800/5900 posting, revaluation, role guard, TB balanced |
| **FX revaluation integrity (new)** | `npm run test:fxreval` | **15/15** — history untouched, sub-ledger ↔ control account, company isolation, skip-on-bad-rate, audit trail, no-movement posts nothing |
| **Data-location migration (new)** | `npm run test:datadir` | **11/11** — adoption, source preserved, sidecars, no-overwrite, corruption refused, seeding unaffected |
| **Branding consistency (new)** | `npm run test:branding` | **9/9** — product identity, no stale GENESIS strings, script correctness, dictionary parity |

Also executed:
- `npm run build` (Vite production build) — **success**, 594 kB bundle
  (`dist/assets/index-DhpQgir6.js`), only the pre-existing >500 kB chunk warning.
- Production server smoke test against the built `dist/`: `/api/health` →
  `{"status":"healthy","application":"JENESIS …","appId":"genesis-accounting"}`,
  `/` → 200 with the JENESIS title and the built bundle, `/api/setup/status` →
  `needsSetup: true` on a fresh database, `/api/accounts` → 401 unauthenticated.

### How these tests were run (important caveat)

The native `better-sqlite3` module cannot be installed in this sandbox: its
prebuilt binary download redirects to `objects.githubusercontent.com` (blocked)
and `node-gyp` cannot reach nodejs.org for headers. To execute the suites anyway I
wrote a **test-only adapter** that maps the `better-sqlite3` API onto Node 22's
built-in `node:sqlite`, installed it into `node_modules/` (git-ignored, never
referenced by application code) and matched better-sqlite3's own binding semantics
verified against its C++ source (`undefined` binds as NULL; arrays bind as
parameter lists; foreign keys off by default).

**Consequence:** the results above validate the application's SQL, business logic
and HTTP behaviour — they do not validate the native SQLite driver itself. On any
machine with normal internet, `npm ci` installs the real `better-sqlite3` and the
same suites run against it.

Two findings came out of building the adapter and are **not** application bugs:
`undefined` (an omitted `email` when creating a user) binds as NULL, and
`stmt.run(array)` binds the array as the parameter list — both are documented
better-sqlite3 behaviours the app relies on correctly.

### Not run here (environment limits — not claimed as passing)

- **Windows installer build, install, launch and persistence** — impossible in this
  Linux sandbox (no Electron binary, no display, Windows-only downloads blocked).
  Configured in CI (§4.5); **the installer does not exist yet** and must be built
  and smoke-tested before it is distributed.
- **Electron GUI startup** — the desktop *backend* lifecycle is covered by
  `test:desktop` (real process, real HTTP), but no window was ever rendered.
- **Browser-visual review of every screen in fr/rw** — dictionary parity and
  key coverage are machine-checked; pixels are not.
- `npm run test:e2e` (Python/Playwright UI test) — no browser available.

## 7. Database safety, migrations and backups

**Schema versions.** v1 authentication/sessions · v2 operations (stores, transfers,
goods receipts, cash sessions, multi-currency, count workflow, FIFO layers) ·
v3 FX settlement accounts 4800/5900 · **v4 FX revaluation accounts 4810/5910,
`booked_exchange_rate`, `fx_revaluations` + `fx_revaluation_lines`**.

All migrations are **additive** (new tables, `ALTER TABLE … ADD COLUMN`, backfills).
No migration drops a table, deletes a row or rewrites accounting data. Each is
recorded in `schema_migrations` and runs once, inside a transaction.

**Automatic safety copies the application makes**

| When | What |
|---|---|
| Before any pending migration | `backups/pre-migration-v<N>-<timestamp>.db` (file copy after a WAL checkpoint) |
| Before a backup restore | `backups/pre-restore-<timestamp>.db` |
| Every desktop launch | `backups/genesis-<timestamp>.db` (last 20 kept) |
| On adoption of a GENESIS database | the original stays in `%APPDATA%\GENESIS` — a second, untouched copy |

**Where data lives:** `%APPDATA%\JENESIS\genesis.db` (per-user, never the install
folder). Logs: `%APPDATA%\JENESIS\logs\`. Uninstall keeps user data
(`deleteAppDataOnUninstall: false`).

**Upgrade paths**

1. *No previous installation* → the first launch creates an empty database and
   shows the setup wizard; no default accounts and no default passwords exist.
2. *Upgrading from a GENESIS installation* → install JENESIS and start it. It
   copies `%APPDATA%\GENESIS\genesis.db` into `%APPDATA%\JENESIS\genesis.db`,
   verifies the copy, logs `Adopted the existing database from …` and opens it.
   The original file is left where it is. Manual alternative: close GENESIS,
   copy `genesis.db` (plus any `-wal`/`-shm`) into `%APPDATA%\JENESIS\`, start
   JENESIS.
3. *Upgrading from JEN 0.2/JAN 0.3* → migration v4 runs automatically on first
   start, after a `pre-migration-v4-…` copy is written. v4 backfills
   `booked_exchange_rate` from the existing document rates, so historical
   booking rates are preserved.

**Before upgrading any real installation:** take one manual backup
(Settings → Backup → Export) and copy `%APPDATA%\JENESIS\genesis.db` aside.

## 8. Installation and first launch

See `INSTALL.md` for the user-facing procedure. In short: build the installer with
`build-installer.bat` (or `npm ci && npm run desktop:dist` on a Windows PC with
Node.js), run `JENESIS-Setup-1.0.0.exe`, then launch JENESIS from the desktop
shortcut — no terminal, no dev server. The first run asks for the company name and
the first administrator; afterwards sign in with that account.

## 9. Remaining limitations

1. **The Windows installer is not built or verified.** The CI workflow is
   configured but has never run. Until a green Windows job produces
   `JENESIS-Setup-1.0.0.exe` and the smoke test passes, the desktop application is
   *implemented and unit-tested*, not *shipped*.
2. **No live-Windows-database migration test.** v4 was exercised on copies of the
   bundled database and on fresh installs (9 checks), never on a database created
   by an installed Windows build.
3. **Electron GUI and the installer UI were never displayed** in this environment.
4. **Code signing is not configured**: Windows SmartScreen will warn until
   `CSC_LINK` / `CSC_KEY_PASSWORD` are set in CI.
5. **Installer auto-update is not implemented** (reinstall keeps `%APPDATA%\JENESIS`).
6. **Vite chunk-size warning** (594 kB > 500 kB) — cosmetic, no code-splitting yet.
7. **Period-end revaluation requires a rate for every open foreign document** on
   the revaluation date; if one is missing the whole run aborts and nothing posts.
   This is deliberate (no partial revaluation) but means rates must be maintained.
8. **fx revaluation is per settlement/period** — no automatic reversal of a
   revaluation and no revaluation of open bank balances in foreign currency.
9. `koraledger/`, `SAGE/`, `GEN 0.2.zip`, `GEN 0.4.zip` at the repository root are
   untouched and out of scope.

## 10. File map of the consolidated project

```
JENESIS/
├── server/            Express + SQLite backend (accounting engine, FX, reports, auth, backup)
├── src/               React 18 UI (views, components, i18n dictionaries en/fr/rw)
├── electron/          Desktop shell, backend lifecycle, data location + legacy migration
├── tests/             11 suites, 165 checks (`npm run test:all`)
├── scripts/           Windows build, package verification, installed-app smoke test
├── build/             Application icon (icon.ico / icon.png)
├── dist/              Built frontend (committed, as in both source archives)
├── genesis.db         Bundled starter/demo database (MD5 unchanged from both archives)
├── build-installer.bat  One-click Windows build
├── README.md          Product overview
├── DESKTOP.md         Desktop and packaging guide
├── INSTALL.md         Installation, upgrade and first launch
└── MERGE-REPORT.md    This report
```
