# JENESIS — Verify / Fix / Build Report (Windows installer readiness)

Date: 2026-10-17 · Branch `arena/d8792eb2-k-jack` · Work done on the existing project (nothing recreated, no database touched).

## A. Project verification

**Inspected:** full tree of `GENESIS-0.4/` (server, src, electron, tests, scripts, docs); `package.json` (scripts + `build` config); `electron/main.cjs`, `backend-manager.cjs`, `data-location.cjs`, `preload.cjs`; `server/index.js` startup/dist/health; `server/db.js` + `migrations.js` (v1–v4); `vite.config.js`; git branch/status; all i18n dictionaries.

**Desktop architecture verified (by code inspection + automated tests):**
- Backend auto-starts with the app: `main.cjs` spawns the Express server on a free **loopback** port with 3 retries and a 25 s timeout — no browser needed, the window loads `http://127.0.0.1:<port>/`.
- Handshake safety: the shell only attaches to a server whose `/api/health` returns `appId: 'genesis-accounting'` (a foreign server on the port is rejected — tested).
- Clean shutdown: `before-quit` stops the backend before exit; unexpected backend death shows an error dialog; single-instance lock prevents duplicate backends (all exercised by `tests/desktop-backend.test.js`, 10/10).
- Data location: DB lives in `%APPDATA%\JENESIS\genesis.db` (per-user data dir, never the install folder). Existing DB is **auto-backed-up on every launch** (20 kept), seed copy uses `COPYFILE_EXCL` so an existing DB can never be overwritten; the packaged app ships **no** demo DB — first run creates an empty DB and the setup wizard creates the first admin.
- Uninstall keeps user data: `deleteAppDataOnUninstall: false`. Upgrade/reinstall never touches `%APPDATA%`.
- Renderer locked down: contextIsolation + sandbox, no nodeIntegration, origin-locked navigation, all permission requests denied, devtools off when packaged.

**Changed this session:**
1. **JENESIS rename (user-facing only)** — window title (`APP_TITLE`), installer product/shortcut/uninstall names, `artifactName` → `JENESIS-Setup-${version}.exe`, `appId` → `com.jenesis.accounting`, package description/author/copyright, `index.html` title, server `APP_NAME`/startup + fallback-page/log strings, Electron error dialogs, in-app brands (App/AuthScreens/Navbar/Sidebar), i18n values ×3 languages (8 per language), README/DESKTOP docs, user-facing server error strings (backup validity, NO_COMPANY).
2. **Period-end FX revaluation implemented** (the one outstanding accounting requirement): migration **v4** (accounts 4810 Unrealized FX Gain / 5910 Unrealized FX Loss; `booked_exchange_rate` columns backfilled; `fx_revaluations` + `fx_revaluation_lines` tables), `fx.revalueOpenBalances()` engine, routes `POST /api/fx/revaluate` (permission `fx:revalue` — admin/accountant only) + `GET /api/fx/revaluations[/:id]`, Settings → Currencies UI card (date, notes, run, history), invoices/bills now stamp `booked_exchange_rate` at creation. Semantics: open foreign balances restated at the effective rate of the chosen date; difference posted AR/AP ↔ 4810/5910; document book rate advances while the **original rate is preserved forever**; sub-ledger (customer/supplier balances) kept in step; `total = amount_paid + balance_due` invariant preserved; duplicate same-date runs refused; no-movement runs post nothing.

**Intentionally NOT renamed (internal identifiers — changing them would break function or data):**
- `appId: 'genesis-accounting'` in `/api/health` + `EXPECTED_APP_ID` in `backend-manager.cjs` + npm package `name` — the shell↔backend handshake protocol (asserted by desktop tests).
- DB file name `genesis.db`, env vars `GENESIS_DB_PATH / GENESIS_DIST_DIR / GENESIS_PORT / GENESIS_HOST / GENESIS_SEED_DEMO / GENESIS_CHILD_LOG`, IPC channel `genesis:get-app-info`, backup file prefixes.
- Demo-company name inside the bundled demo database (accounting data must not be rewritten).
- Folder names `GENESIS-0.4/`, `JEN 0.2/`, git history, `GENESIS_AI_Builder_Prompt.md`.
- Consequence to note: because `productName` changed, the packaged app's data directory is now `%APPDATA%\JENESIS` (it was `%APPDATA%\GENESIS` in docs). No installer was ever distributed, so no real data exists at the old path; if one ever appears, copy `genesis.db` across before first launch.

## B. Test results (all re-run after every change; final run all green)

| Suite | Result |
|---|---|
| `npm test` (accounting engine) | ALL PASSED |
| `test:auth` | 21 fresh + 6 legacy passed |
| `test:security` | 8/8 |
| `test:desktop` | 10/10 (backend lifecycle, loopback binding, seed protection, backup pruning) |
| `test:ops` | 36/36 (stores, transfers, GRN, counts workflow, cash, walk-in, refunds, authz) |
| `test:migrations` | 9/9 (legacy upgrade + fresh install; repo DB MD5 asserted) |
| `test:i18n` | 10/10 — **652 keys × en/fr/rw**, exact parity, no empties, all ~50 error codes translated, placeholder parity, every `t()` key used in `src/` resolves |
| `test:fx` | **17/17** (settlement gain/loss + revaluation: 4810/5910 posting, book-rate advance, booked-rate preservation, duplicate-date refusal, role guard 403, supplier loss side, no-movement no-post, TB balanced) |
| `vite build` | OK — `dist/index.html` title = "JENESIS — …" |

**Not run / not possible here:** launching the Electron **GUI** (no display, no Electron binary in sandbox), running the NSIS installer, any Windows-native execution. Known flake: the desktop loopback-binding check can spuriously fail in this sandbox's network (link-local artifact); it passed in the final run and the server binds 127.0.0.1 by default (verified in code).

## C. Windows installer

**An installer was NOT built — the sandbox makes it impossible, with primary evidence:**
1. `npx electron-builder --win --dir` (v25.1.8) **loaded and validated the project's build configuration successfully**, then failed at the first packaging step: `node-gyp does not support cross-compiling native modules from source` for **better-sqlite3** (its win32-x64 prebuilt binary download is blocked; Linux→Windows cross-compilation of native modules is not supported by node-gyp).
2. Direct probes of the three required downloads all fail at TLS level (egress proxy disconnect): `electron-v33.4.11-win32-x64.zip`, `winCodeSign-2.6.0.7z`, `nsis-3.0.4.1.7z` (GitHub release-asset CDN is outside this environment's allowlist).

So: **Linux-side source build = successful and verified; Windows installer = not produced, not tested.** Nothing in the project configuration caused the failure.

**Shortest reliable procedure on a Windows PC (Node.js 18+ required, normal internet):**
```bat
:: 1. get the code (either)
::    - unzip JEN 0.2.zip, or
::    - git clone -b arena/d8792eb2-k-jack https://github.com/Kdollers/k.JACK && cd k.JACK\GENESIS-0.4
cd JEN 0.2            :: (or k.JACK\GENESIS-0.4)
npm install           :: downloads Electron 33 + builds/downloads better-sqlite3 for Windows
npm run test:all      :: optional but recommended: must be fully green
npm run desktop:dist  :: vite build + electron-builder --win nsis
```
Expected artifact: **`release\JENESIS-Setup-1.0.0.exe`** (version 1.0.0 comes from `package.json`; the assisted NSIS installer lets you choose the directory and creates Desktop + Start-Menu shortcuts named **JENESIS**).

If `npm install` fails on better-sqlite3, run `npm rebuild better-sqlite3` (needs the free "Desktop development with C++" workload from Visual Studio Build Tools only if no prebuilt is available for your Node/Electron combination).

## D. Database safety

- Bundled demo DB `genesis.db` MD5 `f6a9690dbdabc6d4778c04c4dfcf0365` — **unchanged** from the imported baseline (re-verified after the final suite; every test suite MD5-asserts it and runs on temp copies).
- Migrations v2/v3/v4 are **versioned and strictly additive** (new tables/columns with backfill; no drops, no data rewrites). Tested on: legacy-upgrade copies, fresh installs (child-process scenarios), and every suite start.
- Desktop app: launch-time automatic backup of the existing DB (20 generations kept in `backups/`), `COPYFILE_EXCL` seeding, `deleteAppDataOnUninstall: false`, DB outside the install folder → reinstall/upgrade cannot destroy accounting data.
- In-app Backup/Restore (Settings → Backup) re-verified by `test:security` (restore brings data back, revokes sessions, fails safely on inconsistency).
- Precaution before upgrading any real installation: take one manual backup (Settings → Backup → Export) and copy `%APPDATA%\JENESIS\genesis.db` aside.

## E. Remaining work (requires your Windows laptop)

1. **Build the installer** (procedure above) — ~10 minutes.
2. **Test the packaged app** (cannot be done in any Linux CI for GUI/NSIS): install → shortcut launch → first-run wizard creates admin at `%APPDATA%\JENESIS\genesis.db` → login/logout → switch en/fr/rw on several screens incl. an error toast → walk-in cash sale (no customer) → goods receipt + post (stock rises only then) → stock count submit → approve **as a different user** → Settings → Currencies: add a currency, a rate, run a revaluation → Settings → Backup export + restore → close app → confirm no leftover backend process in Task Manager → uninstall → confirm `%APPDATA%\JENESIS\genesis.db` still exists.
3. Browser-visual check of every screen in fr/rw (structural parity is machine-verified; pixels are not).
4. Optional cosmetics: chunk-size warning in the vite build (code-splitting), `scripts/add_i18n_v2.py` docstring still says GENESIS (internal tooling).

**Nothing else is outstanding:** all requirement areas A–J from the original build prompt are implemented and test-verified except the Windows packaging step, which is environment-blocked as evidenced above.
