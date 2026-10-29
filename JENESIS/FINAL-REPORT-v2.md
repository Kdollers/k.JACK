> **Historical document.** This file describes the work of the session it names
> (before the JEN 0.2 + JAN 0.3 merge) and is kept for traceability. The current
> status of the consolidated application is in **[MERGE-REPORT.md](MERGE-REPORT.md)**.

# GENESIS 0.4 — Final Continuation Report (session of 2026-10-17)

Branch: `arena/d8792eb2-k-jack` · Commits: `eda2bad` (baseline) → `2505bbc` (server) → `402a9d8` (tests) → `6d5f351`, `6f1ecb4`, `0c4b8a9`, `1ac9d2a`, `d274a66` (UI/i18n/tests) → FX settlement commit (migration v3 + engine + UI + `test:fx`).

## 1. Honest correction to the task premise

The task prompt stated that prior sessions had modified files and referenced `src/i18n/labels.mjs`. **Neither was true**: the repository contained exactly one commit ("Add files via upload") with zero modifications, and the i18n system is JSON dictionaries (`src/i18n/{en,fr,rw}.json`) + `index.jsx` — there is no `labels.mjs`. All work below was done by this continuation on the untouched `GEN 0.4` codebase (extracted to `GENESIS-0.4/`, imported as commit `eda2bad`).

## 2. Features complete BEFORE this session (baseline, verified by its own tests)

- Double-entry accounting engine: balanced journals, reversal entries, no duplicate posting guards.
- Sales: quotes → invoices → credit notes, VAT, posting to GL, invoice printing.
- Purchases: POs → supplier bills → purchase returns/credit notes; weighted-average costing.
- Payments: 5 types (customer receipt, supplier payment, expense, income, transfer), bank/cash/MoMo accounts.
- Inventory: stock adjustments, physical counts (single-location), movement history, product catalogue.
- Reports (9): Trial Balance, P&L, Balance Sheet, Cash Flow, A/R, A/P, VAT, Stock Valuation, Dashboard KPIs.
- Security: sessions (SHA-256 digests, 30-min idle/12-h absolute), scrypt + legacy-sha256 upgrade, lockout (5/15 min), rate limits, role permissions, company separation, first-run setup wizard, forced password change.
- Electron desktop shell: backend lifecycle manager, data location (`%APPDATA%\GENESIS`), backup pruning.
- i18n runtime with en/fr/rw JSON dictionaries (401 keys at baseline).

## 3. Implemented in THIS session

### Server (commit 2505bbc, migration v2 — additive only)
- **Multi-store inventory**: `warehouses`, `stock_levels` (per-store balances), `stock_transfers` + lines (dispatch → in-transit → partial receipt → completed; company-wide stock conserved), `fifo_stock_layers` (FIFO or weighted-average per `companies.inventory_valuation_method`).
- **Goods receipts (GRN)**: `goods_receipts` + lines; **stock increases only when a GRN/bill is posted**, never on product/PO creation; `companies.require_goods_receipt=1` makes posted GRN mandatory before a bill can post; over-receipt vs PO blocked; GRNI account 2120.
- **Walk-in sales**: anonymous sales (no customer needed); credit sales still require a customer; walk-in customer auto-seeded per company.
- **Returns/refund guards**: duplicate-return and over-refund prevention (cannot credit more than invoiced), original-transaction references on credit notes, payment reversal (`POST /payments/:id/reverse`) with balanced reversal JE, customer refund payment type.
- **Count workflow**: submit → review → approve with **no self-approval by default** (`You cannot approve a count that you created or submitted`), rejection reasons mandatory, full audit trail (counter/reviewer/approver/dates/reasons), variance posting (MISSING/EXCESS auto-classified, free-text reason stored).
- **Cash management**: denomination-based open/close counts, expected-vs-actual computed from posted cash flows, mandatory discrepancy explanation, independent approval, **no automatic accounting adjustment on discrepancy**.
- **Multi-currency**: `currencies` (per-currency decimal precision, base locked), `exchange_rates` with effective dates (latest rate ≤ transaction date), transactions store `currency_code/exchange_rate/foreign amount`, ledger always base-currency at the transaction-date rate, historical amounts/rates preserved.
- **FX-difference accounting** (migration v3): dedicated accounts **4800 Foreign Exchange Gain** / **5900 Foreign Exchange Loss**. When a foreign-currency receipt/payment is linked to an invoice/bill and `settleWithFxDifference` is set, the document is cleared exactly and the base-currency difference between the document balance and the payment is posted to 4800/5900 with a balanced journal (tested both directions, §5). Without the flag, foreign payments apply normally and never touch FX accounts.
- **Error-code architecture**: `server/utils.js` maps ~48 business-error messages to stable codes; API responses carry `code` + `details`; client `translateError()` renders them from dictionaries in all 3 languages.
- New sequence types (TRANSFER, GOODS_RECEIPT, CASH_SESSION), opening-stock posting via stock ledger (movement type OPENING, no JE), barcode/product search, company-wide stock invariant helpers.

### Frontend (commits 6d5f351 → d274a66)
- **Calculator** (`CalculatorModal`, Navbar button): + − × ÷, decimals, clear — never posts transactions.
- **InventoryView rewritten** (~1150 lines): stores CRUD, per-store + consolidated stock, transfers (dispatch/receive/partial), stock levels, opening stock, counts workflow (submit/review/approve/reject/revise), **printable count sheet**, movement history, product search.
- **SalesView**: walk-in toggle with hint, conditional customer (credit-sales hint), store selection, currency + rate inputs with base-total note, walk-in checkout (CASH/MOBILE_MONEY/BANK_TRANSFER + settlement account), search/status/walk-in filters, walk-in badges, foreign totals, translated statuses, draft posting.
- **PurchasesView**: goods-receipts tab (list, create from PO or direct, draft/post, remaining-qty display), **real PO and returns tables** (were stubs), GRN-linked bills + bill currency/rate, translated statuses.
- **BankingView**: cash-sessions tab (denomination grid with live totals, open/close with expected-vs-actual + variance, explanation, approve), payment reversal with reason, customer-refund payment type, payment status/currency columns, and a payment modal with linked invoice/bill selection, transaction currency + rate + foreign amount, and the "settle document fully — post FX difference" option.
- **SettingsView**: currencies tab (CRUD, decimals 0–4, base lock, active toggle), exchange rates with effective dates + history, conversion tester, **require-goods-receipt policy toggle**.
- **i18n**: 401 → **635 keys per language**, en/fr/rw exact parity; all hardcoded English strings in the touched views replaced; error messages, dialogs and buttons translated; identifiers/codes/document numbers never translated.
- Role fix: `fx:read` granted to sales/purchases roles so their currency selectors work (read-only, no privilege escalation).

## 4. Database protection

- Repo-bundled demo DB `genesis.db` **MD5 `f6a9690dbdabc6d4778c04c4dfcf0365` — identical to baseline** (asserted by tests every run; re-verified after the final suite).
- All migration/operations tests run against **temporary copies** in `%TEMP%`; the migrations test spawns child processes for legacy-upgrade and fresh-install scenarios.
- Migration v2 is **versioned and additive** (new tables + `addColumn` with structural defaults); identifiers and relationships preserved; no destructive statements.
- **A live Windows-installed database was NOT available in this environment. The migration path was tested only on copies of the bundled demo DB and on fresh-install scenarios. The live Windows DB migration is therefore UNVERIFIED.** On first start of the upgraded app on Windows, the migration runs against `%APPDATA%\GENESIS\genesis.db`; a backup exists in-app (`backup.js` + Settings → Backup tab) and should be taken before upgrading.

## 5. Tests — actual results (final run, all green)

| Suite | Command | Result |
|---|---|---|
| Accounting engine | `npm test` | ALL PASSED (balanced TB/BS, KPIs) |
| Auth & security (fresh 21 + legacy 6) | `npm run test:auth` | ALL PASSED |
| Security hardening | `npm run test:security` | 8/8 |
| Desktop lifecycle | `npm run test:desktop` | 10/10 |
| Operations (walk-in, returns, stores, transfers, GRN, counts, cash, FX, authz) | `npm run test:ops` | 36/36 |
| Migrations v2 (legacy upgrade + fresh install) | `npm run test:migrations` | 9/9 + repo DB MD5 unchanged |
| i18n parity (new this session) | `npm run test:i18n` | 10/10 — 642 keys/lang, error-code coverage, placeholder parity, every `t()` key used in `src/` resolves |
| FX settlement (new this session) | `npm run test:fx` | 11/11 — migration v3 accounts, EUR invoice settled at moved rate → FX loss 50 to 5900, supplier mirror → FX gain 25 to 4800, historical rates preserved, guard error codes, TB balanced, repo DB MD5 unchanged |

Known flake: the desktop check "backend binds only to the loopback interface" intermittently fails **in this sandbox only** because the environment's link-local address (`169.254.0.21`) is occasionally answered by sandbox network plumbing. The server binds `127.0.0.1` by default (no code diff since baseline); re-run passed 10/10.

## 6. Build, startup, language verification

- **Production build**: `vite build` succeeds (only pre-existing >500 kB chunk-size warning). `dist/` refreshed and committed (as in baseline).
- **Startup check**: server started from production `dist/` against a DB copy — `/api/health` → `{"status":"healthy",...}`, index served (200, root div), login succeeded against the copied DB, forced-password-change gate correctly returned 403 `PASSWORD_CHANGE_REQUIRED` for demo accounts (by design; proven by auth tests).
- **Languages**: en/fr/rw parity machine-verified; switching is a pure dictionary lookup (no data mutation — tested); fr/rw confirmed genuinely translated (not English copies). **Browser-side visual verification of every screen in all 3 languages was not performed in this environment** (no browser); the verification is structural + key-coverage based.

## 7. Windows packaging — NOT VERIFIED

`electron` is installed without its binary (offline install) and no Windows target can be built or run in this Linux sandbox. **The packaged Windows app (installer, shortcut launch, auto backend start, `%APPDATA%` DB location, clean shutdown) is IMPLEMENTED but UNTESTED here.** Per the task rule, the standalone Windows app must **not** be considered ready until a packaged build is tested on Windows (`npm run package:win`, then install and exercise: first-run wizard, login, one sale, one goods receipt, one count approval, backup/restore).

## 8. Security & accounting issues found and fixed this session

- Sales/purchases roles could not read currencies → currency selector silently degraded (fixed with `fx:read`).
- POs and purchase returns had **no UI at all** (stub tabs) despite working APIs → built real tables.
- Baseline hardcoded English strings in Banking/Accounting/Dashboard/Customers/Suppliers/Sales/Purchases views → all replaced with dictionary keys.
- Fresh installs previously inherited demo bank balances → zeroed for production installs (commit 402a9d8).
- Cash expected-amount date parsing bug (`split('T')` vs SQLite datetimes) → `datePart()` normalizer.
- Per-store stock listing omitted zero-stock stores → LEFT JOIN + COALESCE.
- Opening-stock double-count (insert + ledger) → single ledger path with `current_stock=0` insert.
- Authorization is enforced server-side on every new route (tested via role matrix in `test:ops`); hiding buttons is never the control.

## 9. Remaining incomplete items

1. **Windows packaged-app testing** (blocker for "desktop ready" claim) — environment limitation.
2. **Live Windows DB migration** — unverified (no access); tested on copies only.
3. Period-end FX **revaluation** of open foreign-currency balances (`fx:revalue` permission reserved; per-settlement FX-difference accounting IS implemented and tested — see §3/§5).
4. Browser-visual check of all screens in fr/rw (structural parity is tested).
5. Vite chunk-size warning (cosmetic; code-splitting not done).
6. `koraledger/`, `SAGE/`, zip archives in repo root left untouched (out of scope).

## 10. Evidence map (implemented vs tested vs packaged-verified)

- Implemented + unit/integration-tested against real HTTP server & DB copies: everything in §3 (see §5 suites), including FX settlement gain/loss posting (`test:fx`).
- Implemented + production-build/startup-smoke-tested: server startup, dist serving, health, login.
- Implemented, **not** package-verified: Electron packaging, Windows installer/shortcut/shutdown flows.
- Not implemented: §9 item 3 (FX revaluation).
