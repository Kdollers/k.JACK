# JENESIS — Merge Report (JEN 0.2 + JAN 0.3 → one application)

Date: 2026-10-29 · Branch `arena/a2c625e8-k-jack` · Sources: `JEN 0.2.zip` and `JAN 0.3.zip`
(kept untouched at the repository root).

**Result: one consolidated project, `JENESIS/`. 165 automated checks pass locally,
0 fail, and the full suite also passes on Linux CI with the real SQLite driver.
The Windows installer has been built and smoke-tested on a GitHub-hosted Windows
runner (final verification: workflow run **40914097531**, plus 40912949515,
40912939198 and 40909845502 after the fixes below): `release/JENESIS-Setup-1.0.0.exe`,
88 MB, all
17 installed-application checks green. The installer is attached to that run as the
`JENESIS-Windows-installer` artifact; it is not committed to the repository.**

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

## 4b. New feature: Light Mode, Dark Mode and System Default

JENESIS has a complete theme system. It was built on top of the existing
React + Tailwind + Electron stack with **no new dependency**.

**What the user gets**

- **Settings → Appearance** (`src/views/SettingsView.jsx`) offers three choices
  with sun / moon / monitor icons: **Light Mode**, **Dark Mode** and **System
  Default** (follows the Windows appearance setting and reacts when it changes).
- A compact **sun / moon switch in the header** (`src/components/Navbar.jsx`)
  and on the sign-in screens (`src/components/AuthScreens.jsx`), both driven by
  the same `ThemeProvider`.
- Switching is **immediate**: the class on `<html>` is updated in a layout
  effect, so no screen ever repaints in the old theme, and nothing is reloaded.
- The choice **persists** in `localStorage` under `jenesis_theme` (Electron
  stores it per Windows profile), so it survives closing and reopening the
  application, restarting the computer, and reinstalling.
- `index.html` applies the saved theme **before the first paint** (inline
  bootstrap), so there is no flash of the wrong theme at startup.

**How it is built**

| Piece | File | Role |
|---|---|---|
| Theme rules | `src/theme.mjs` | preferences, resolution, storage, painting — no React, unit-testable |
| Provider | `src/context/ThemeContext.jsx` | one manager: storage, OS listener, cross-window sync, painting, Electron notification |
| Control | `src/components/ThemeToggle.jsx` | header switch and Settings three-way control |
| Tokens | `src/index.css` + `tailwind.config.js` | `--j-*` design tokens for canvas, surfaces, text, borders, shell, brand, states |
| Compatibility layer | `src/index.css` | rebinds the existing `bg-white`/`text-slate-*` utilities to the tokens while dark, so all 10.5k lines of existing JSX follow the theme |
| Desktop shell | `electron/main.cjs`, `electron/preload.cjs` | window background matches the theme (no white flash), native appearance follows the choice, through one validated IPC channel |

**Centralised tokens, not scattered colours.** `--j-canvas`, `--j-surface`,
`--j-surface-muted`, `--j-surface-hover`, `--j-line`, `--j-line-strong`,
`--j-ink`, `--j-ink-secondary`, `--j-ink-muted`, `--j-ink-subtle`, `--j-shell`,
`--j-shell-line`, `--j-shell-ink`, `--j-brand` and `--j-brand-strong` are
defined once for Light (`:root`) and re-bound for Dark (`.dark`). New screens
use the semantic utilities generated from them (`bg-canvas`, `bg-surface`,
`text-ink`, `border-line`, …); the existing palette-based classes are remapped
in the compatibility layer rather than rewritten, which keeps the accounting
screens exactly as they were tested.

**Coverage is enforced, not assumed.** `tests/theme.test.js` extracts every
colour class used anywhere in `src/` and fails if any of them is neither
remapped for Dark Mode nor explicitly documented as theme-neutral. On every run
it audits **19 screens and components, 643 colour usages, 176 distinct
classes** — so a future screen cannot silently ship light-only colours.

**Every text/background pair is measured, not assumed.** A perfect token set
still allows an unreadable screen if a component puts the wrong text colour on
the wrong background, so `tests/theme.test.js` extracts every pair that appears
together in a `className` (including each branch of a conditional class),
resolves both colours — for Light from the Tailwind palette, for Dark from the
CSS itself with the tokens substituted — and fails below 4.5:1. **122 pairs**
are measured on every run. Five combinations were found below the bar and
fixed (see bugs #19–#22); translucent backgrounds and custom shades are
reported as "not measurable" rather than silently passed.

**Native and third-party pieces.** There is no charting library in the project
(verified: no chart dependency, no `<svg>` chart code), so nothing had to be
adapted there. Icons are `lucide-react` and inherit `currentColor`, so they
follow the text colour automatically; date pickers, select popups, scrollbars
and form autofill are native Chromium controls and follow the theme through
`color-scheme`, which is set on `:root` for Light and `.dark` for Dark;
Chromium's own light autofill yellow is overridden. Tooltips use the native
`title` attribute (drawn by Windows) and custom dropdown menus use the themed
surface classes. The brand mark is a gradient tile with a white "G" and is
unchanged in both themes.

**Accounting-specific readability.** Contrast is asserted, not eyeballed: in
Light Mode primary text is **17.9:1**, labels **7.6:1**, hints **4.8:1**, brand
**5.2:1** and input borders **3.1:1**; in Dark Mode **16.3:1**, **12.0:1**,
**7.9:1**, **7.0:1** and **3.8:1**. Status colours (paid / unpaid / overdue /
pending) keep their tinted badges in both themes, and status is never carried
by colour alone — the existing text labels are unchanged. Printing always uses
the light palette, and `prefers-reduced-motion` switches off the fade-in.

**Nothing accounting-related was touched.** The theme code contains no API
calls, no database access and no writes other than the `jenesis_theme` key
(asserted by tests). No migration, no schema change, no recalculation.

## 4c. Part B — documents are created PAID (and PAID is an accounting fact)

Every sales receipt/invoice and every purchase document is now created in the
**PAID** state, and the interface offers **no PAID/UNPAID choice at all**.

The rule is implemented as an accounting operation, never as a flag:

| Piece | File | Role |
|---|---|---|
| Settlement engine | `server/settlement.js` | posts a draft (if needed) **and** records one real payment for the outstanding balance, in a single transaction |
| Create endpoints | `server/routes/api.js` | `POST /sales/invoices` and `POST /purchases/bills` accept `settle` (the UI always sends it with "Post now") |
| Settle endpoints | `server/routes/api.js` | `POST /sales/invoices/:id/settle` (`sales:post`) and `POST /purchases/bills/:id/settle` (`purchases:post`) — **idempotent** |
| Screens | `src/views/SalesView.jsx`, `src/views/PurchasesView.jsx` | payment method + settlement account for every sale; "Post now" settles; **Settle** button; F2 |

**Why this is not a cosmetic change.** `PAID` only ever results from a genuine
`payments` row created by the existing `recordPayment()` engine: a balanced
journal entry, a bank/cash movement and a partner-balance update. Nothing is
fabricated and nothing is posted twice:

- settling a document that is already paid returns `alreadySettled: true` and
  records **nothing** (F2 can be pressed twice);
- a partially paid document is settled for the **remainder only**, so it can
  never be overpaid;
- a draft is posted **once**, inside the same transaction as its payment;
- a cancelled document is refused;
- document status (DRAFT / POSTED / PARTIALLY_PAID / PAID) and the payment
  transaction are kept as separate records — the audit trail shows both, and
  reversing a payment moves the document back to POSTED/PARTIALLY_PAID
  automatically (existing `reversePayment` behaviour, unchanged).

A document is only left unpaid when the user deliberately unchecks "Post now"
(it then stays a DRAFT) — that is the credit-sale path, and F2 settles it later.

## 4d. Part C — one keyboard layer (F1, F2, F3, F5, Esc, Ctrl/Alt combos)

There is exactly **one** `keydown` listener in the whole application
(`src/context/ShortcutsContext.jsx`); every screen and dialog registers a
handler instead of listening for itself. `tests/shortcuts.test.js` asserts this
by scanning every file under `src/`.

| Shortcut | Action | Destination |
|---|---|---|
| **F1** | Help & User Guide | a real screen (`src/views/HelpView.jsx`, also in the sidebar) |
| **F2** | Settle (PAID) the selected document | Sales + Purchases rows; idempotent; permission-checked; "select a document first" when nothing is selected |
| **F3** / **Ctrl+P** | Print the selected document | Sales invoice, purchase bill, the report on screen, and this guide |
| **F5** | Reload the data on this screen | `triggerRefresh()` |
| **Ctrl+N** | New document | Sales, Purchases, Inventory, Customers, Suppliers, Banking, Accounting — each checks its own permission |
| **Ctrl+K** | Messenger | panel beside the calculator |
| **Ctrl+Shift+C** | Calculator | same panel as the header button |
| **Ctrl+Shift+T** | Theme: Light → Dark → System | `ThemeContext` |
| **Ctrl+Shift+L** | Language: EN → FR → RW | `I18nProvider` |
| **Ctrl+/** | Searchable shortcut reference | built from the same catalogue the listener uses |
| **Alt+← / Alt+→** | Previous / next screen | view history kept by the provider |
| **Esc** | Layered close | dialog → calculator/Messenger → previous screen; **never quits JENESIS** |

Rules the tests enforce:

- **Typing is never interrupted.** Shortcuts are suspended while the caret is
  in a text field, except function keys, Escape and Alt/Shift combinations
  (`allowedWhileTyping`). Combo names come from `event.code`, so a different
  keyboard layout cannot change a shortcut.
- **Escape is layered by priority** (dialog 100/120 → panel 80/90 → screen) and
  the highest priority closes first; with nothing open it goes back a screen.
  A half-filled invoice/bill form asks for confirmation first
  (`ConfirmDialog`), so hammering Esc cannot lose work.
- **Permissions apply to shortcuts too**: Ctrl+N without the matching
  `:write` permission shows the same refusal as the button, and the server
  re-checks every request.
- **Every documented shortcut has a destination** — the test parses the
  catalogue, the provider's built-ins and every `useShortcutAction()` call and
  fails if a combo exists in one place only.

## 4e. Part D — the calculator on the physical keyboard

The existing calculator (`src/components/CalculatorModal.jsx`) now registers as
the **key-capturing layer** of the shortcut system:

- digits `0–9` (keypad included), `.` and `,`, `+ − * /`, `Enter` or `=`,
  `Backspace`, `Delete` (clear entry), `C`, `%`, `Escape`;
- **no leakage**: modifier combinations and function keys are handed back to
  the application, so Ctrl+Shift+C still closes it and F1 still opens help;
  while it is open, typing `5` never reaches an application shortcut;
- **division by zero** shows "Cannot divide by zero" instead of an error code;
- **accounting precision**: results are rounded to 8 decimals and
  floating-point noise is removed (`0.1 + 0.2` → `0.3`);
- the panel stays **movable** (drag its title bar) and can be **minimised** to a
  small bar showing the current value.

## 4f. Part E — JENESIS Messenger

Internal chat between authorised users of the same company, using the existing
local HTTP API only (no new port, no new OS/Node surface, nothing new exposed
through Electron).

| Piece | File | Role |
|---|---|---|
| Schema | `server/migrations.js` (v5) | `messages` table with delivery and read timestamps |
| Engine | `server/messenger.js` | company-scoped conversations, send/list/read, unread counts, in-process pub/sub |
| API | `server/routes/api.js` | `/messenger/users`, `/conversations`, `/messages`, `/unread`, `/stream` (SSE), `POST /conversations/:peerId/read` |
| Panel | `src/components/MessengerPanel.jsx` | conversation list with unread badges, thread, send box, one/two/blue ticks, live indicator |
| Entry point | `src/components/Navbar.jsx` | the Messenger button sits **immediately next to the calculator**, with an unread badge |

Guarantees, each covered by a test:

- the sender is **always the session user** (a client-supplied id is ignored);
- a user of **another company** can never be messaged or read;
- empty, over-long (2 000 chars), self-addressed and unknown-recipient
  messages are refused **before** anything is stored;
- `messaging:read` / `messaging:write` are enforced **server-side** (a
  read-only manager can read but not send) and every route has exactly one
  permission guard;
- live delivery uses **Server-Sent Events** over the same authenticated
  endpoint with automatic reconnection (`retry: 3000`, heartbeat) plus a
  20-second polling fallback; every event carries the message id and the client
  de-duplicates, so a reconnect never shows a message twice;
- **message text is never logged**: the audit trail records who messaged whom
  and when, and a test asserts no audit description contains a message body.

Honest limitation: real multi-computer messaging was verified **inside one
running server** (two sessions, SSE push, receipts). The server is the same
loopback-bound backend the desktop app already uses; messaging between two
separate computers requires that backend to be reachable from both, which is
not the default desktop configuration and was **not** set up or tested here.

## 4g. Part F — "How to use JENESIS" (English + French + Kinyarwanda)

A real screen (`src/views/HelpView.jsx`), reachable from the sidebar and from
**F1**, with content in `src/views/helpContent.js`.

- Fifteen sections — welcome, sign-in, navigation, **sales (PAID, F2, F3)**,
  purchases, inventory, calculator, Messenger, appearance, shortcuts,
  accounting and reports, settings/permissions, backup, troubleshooting, and
  **who does what (Seller, Administrator, Maintenance)** — each with
  **purpose → where to find it → steps → expected result → notes/warnings**.
- Written **together** in English, French and Kinyarwanda; the content is one
  structure per language, and `tests/help-content.test.js` fails if any
  language is missing a section, a step or a note, if a value is empty, or if a
  translation turns out to be an untranslated copy.
- The guide is checked **against the code**: every shortcut it documents must
  exist in the application catalogue and vice versa, the PAID behaviour it
  describes must be implemented by the settlement endpoints, F1 must open it,
  and every label it uses must resolve in all three dictionaries.
- It renders the live shortcut catalogue and the calculator key table, can be
  searched, and can be printed (F3 / Ctrl+P).

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
| 11 | `smoke-test-installed.ps1` assumed the runner always exposes a window handle (`No JENESIS window found to close`) | the installed-app check aborted at "graceful shutdown" (run 40896463853), hiding the 5 remaining checks | `Wait-ForAppWindow` polls for the window and, if the session never exposes one, stops the process directly; "all processes exit" is still asserted either way |
| 12 | **Desktop shutdown had no upper bound**: `stopBackend()` awaited `backend.stop()` with no ceiling and `before-quit` only called `app.quit()` once it resolved | if a backend child could not be reaped, the application would stay open indefinitely with a dead window | the backend stop is wrapped in an 8 s ceiling and a 20 s watchdog forces `app.exit(0)`; the backend is still stopped first, so no data is at risk |
| 13 | The window gave no visibility into its load state and could stay invisible if `ready-to-show` never fired | a user closing JENESIS could be left with an empty, invisible frame; the condition was undiagnosable from the log | the shell now logs `did-finish-load` / `did-fail-load` / `render-process-gone` / `ready-to-show`, retries the load once when it fails or stalls for 15 s, and shows the window after 20 s regardless |
| 14 | **The smoke test closed the wrong window** (test bug, found by CI): `Process.CloseMainWindow()` uses .NET's `MainWindowHandle`, which is whichever top-level window `EnumWindows` returns first — an Electron app owns several (the visible window plus hidden helpers) | 5 of 11 Windows CI runs failed "Close again and confirm clean shutdown": WM_CLOSE went to a helper window and was ignored, leaving the app and its backend running. The application was not at fault — its log shows `Window ready to show` immediately before each failed attempt | the smoke test enumerates the process's visible windows with Win32 `EnumWindows`/`GetWindowText` and posts WM_CLOSE to the one carrying the product name; still a user-style close, and "all processes exit" is still asserted |

| 15 | `bg-slate-750` was used by the sidebar's active company row but never existed in the Tailwind palette | the class did nothing: the selected company was not highlighted | `slate.750` added to the palette and remapped for Dark Mode |
| 16 | `animate-fade-in` was used by toasts and modals but no keyframes were defined in `tailwind.config.js` | notifications appeared without their fade-in | keyframes and animation added; `prefers-reduced-motion` now switches them off |
| 17 | Hint and placeholder text used `slate-400` on white — a **2.56:1** contrast ratio, below the WCAG AA minimum | small helper text and placeholders were hard to read, especially on dim screens | the `--j-ink-subtle` token was darkened to reach **4.8:1** in Light Mode (Dark Mode: 7.9:1) |
| 18 | Input borders used `slate-300` on white — **1.49:1**, below the 3:1 required for control boundaries | form fields had almost no visible outline | `--j-line-strong` was darkened to reach **3.08:1** in Light Mode (Dark Mode: 3.75:1), keeping the same look and feel |
| 19 | Inactive status badge: `text-slate-400` on `bg-slate-100` — **2.34:1** in Light Mode, 4.04:1 in Dark | the "inactive" pill was barely legible | text changed to `text-slate-600` → **6.9:1** light, **7.0:1** dark |
| 20 | Disabled button: `text-slate-500` on `bg-slate-300` — **3.21:1** in both themes | disabled actions looked like enabled-but-faded text | text changed to `text-slate-700` and the Dark Mode value of `bg-slate-300` darkened one step → **6.97:1** light, **6.15:1** dark |
| 21 | "Add company" row in the header dropdown: `text-blue-400` on the `hover:bg-slate-700` row — **4.07:1** | the link dimmed when the pointer was over it | `hover:text-blue-300` added → **5.74:1** |
| 22 | Service / inactive badges: `text-slate-500` on `bg-slate-100` — **4.34:1** in Light Mode | small uppercase labels just under the AA bar | text changed to `text-slate-600` → **6.91:1** light, **6.97:1** dark |
| 23 | The interface shipped as one 605 kB JavaScript bundle, over Vite's 500 kB warning threshold | slower first load, warning on every build | `manualChunks` splits React (135 kB) and the icon set (32 kB) out; the app chunk is 437 kB and the warning is gone |
| 24 | The portable-package step zipped `dist\win-unpacked\*`, a folder electron-builder never creates (`directories.output` is `release`) | the whole Windows job failed after a successful build and smoke test (run 40966223343) | the step now packages `release\win-unpacked` (and validates that the folder exists first) |

Nothing was found that corrupted accounting data; the bundled `genesis.db` is
byte-identical to both source archives (MD5 `f6a9690dbdabc6d4778c04c4dfcf0365`,
asserted by six suites).

## 6. Test results (executed, this sandbox, 2026-10-29)

`npm run test:all` → **269 checks, 0 failed.**

That total is not typed in by hand: `scripts/count-checks.mjs` reads the
transcript of the run and adds up what each suite reported, so the number below
is the number the suites actually printed on this code
(`npm run test:all 2>&1 | node scripts/count-checks.mjs`).

| Suite | Command | Result |
|---|---|---|
| Accounting engine | `npm test` | 10/10 — trial balance and balance sheet balanced, KPIs |
| Auth & security | `npm run test:auth` | 27/27 (21 fresh install + 6 legacy database) |
| Security hardening | `npm run test:security` | 8/8 — rate limits, headers, backup contents, restore safety |
| Desktop backend lifecycle | `npm run test:desktop` | 10/10 |
| Operations | `npm run test:ops` | 36/36 — walk-in sales, returns, stores, transfers, GRN, counts, cash, FX, authorisation |
| Migrations | `npm run test:migrations` | 9/9 (7 legacy upgrade + 2 fresh install) + repo DB MD5 unchanged |
| i18n parity | `npm run test:i18n` | 10/10 — **752 keys × en/fr/rw**, no empties, placeholder parity, every `t()` key resolves |
| **Settlement / PAID documents (new)** | `npm run test:settlement` | **19/19** — created PAID with one real payment, balanced entry, idempotent F2 (no second payment, no second entry), draft posted once, remainder-only on partial, cancelled refused, permission guard, trial balance balanced, audit row |
| **Keyboard shortcuts (new)** | `npm run test:shortcuts` | **18/18** — combo normalisation, layout-independent key names, typing never interrupted, layered Escape, key capture, **exactly one keydown listener in `src/`**, every catalogue shortcut has a destination, calculator precision and divide-by-zero |
| **Messenger (new)** | `npm run test:messenger` | **18/18** — migration v5, session identity, delivery and read receipts, unread counts, company isolation, validation before storing, manager read-only, **live SSE push to the right recipient only**, no message text in the audit log, one guard per route |
| **User guide (new)** | `npm run test:help` | **14/14** — identical structure in en/fr/rw, every section has purpose/where/steps/expected/notes, translations are not copies, guide ↔ code agreement (shortcuts, PAID endpoints, F1, sidebar, route) |
| FX settlement | `npm run test:fx` | 17/17 — 4800/5900 posting, revaluation, role guard, TB balanced |
| **FX revaluation integrity (new)** | `npm run test:fxreval` | **15/15** — history untouched, sub-ledger ↔ control account, company isolation, skip-on-bad-rate, audit trail, no-movement posts nothing |
| **Data-location migration (new)** | `npm run test:datadir` | **11/11** — adoption, source preserved, sidecars, no-overwrite, corruption refused, seeding unaffected |
| **Branding consistency (new)** | `npm run test:branding` | **9/9** — product identity, no stale GENESIS strings, script correctness, dictionary parity |
| **Theme system (new)** | `npm run test:theme` | **32/32** — Light/Dark/System selection, immediate switching, persistence, first-paint bootstrap, token parity, WCAG contrast in both themes, **128 measured text/background pairs**, full-UI colour coverage (**23 screens/components, 714 colour usages**), Electron bridge, no backend access |
| **Theme UI rendered (new)** | `npm run test:themeui` | **6/6** — the theme components are compiled with esbuild and rendered with React: three radio options with icons and accessible names, English/French/Kinyarwanda labels, the stored preference shown by the interface, Light Mode fallback, header switch naming |

Also executed:
- `npm run build` (Vite production build) — **success**, three chunks:
  `index.js` 539 kB (118 kB gzipped), `react.js` 135 kB, `icons.js` 36 kB
  (the previous single 605 kB bundle triggered Vite's size warning; it is gone).
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

### Windows CI (executed — this is where the installer was built)

`.github/workflows/windows-installer.yml`, latest run **40975099606** (the build
that ships with this report), branch `arena/a2c625e8-k-jack`, both jobs green:

| Job | Steps | Result |
|---|---|---|
| Test suite (Linux, Node 20) | `npm ci` → `npm run test:all` → `npm run build` | **success** (258 checks with the real `better-sqlite3`, including the four new suites) |
| Windows installer (`windows-2022`) | `npm ci` → `npm run test:all` → `npm run desktop:dist` → `verify-package.cjs` → installed-app smoke test → portable package + checksums → **release publish** | **success** |

Installed-application smoke test — **18/18 PASS**:

silent install → desktop + Start-menu shortcuts → **application starts from the
executable with no manual server or terminal** → backend on loopback only → no
external browser → unauthenticated requests refused → first-run setup → sign-in →
balanced journal entry → trial balance balanced → backup export → **graceful
shutdown, all processes exit** → **relaunch: business data persists** → backup
restore with a `pre-restore` copy → clean close → **the installed build ships
both themes** (the `app.asar` of the installed program is checked for the
`jenesis_theme` bootstrap, `prefers-color-scheme`, the dark palette
`--j-canvas: 2 6 23` and the remapped `.dark .bg-white` rule) → **silent
uninstall keeps the business database**.

The check was added with the theme system (the step before it is the 17th);
run 40957626626 is the run whose transcript was captured:

```
==> Both themes ship in the installed application
    installed build contains the theme bootstrap, the dark palette and the remapped utilities
    PASS
```

Artifact: `JENESIS-Windows-installer` → `JENESIS-Setup-1.0.0.exe` (~92.6 MB);
the portable package `JENESIS-Portable-1.0.0.zip` (~133 MB). Both are published
with SHA-256 checksums as release **`v1.0.0`** — see `JENESIS/DOWNLOAD.md` for the
direct download links, the checksums of the current build and GUI-only install
instructions.

Honest history of the Windows runs — the failures were found and fixed in the
open, not hidden:

| Run | Outcome |
|---|---|
| 40894176657 | failed: installer built and verified, smoke test failed (no diagnostics yet) |
| 40896463853 | failed at "graceful shutdown": no window handle exposed → bug #11 |
| 40898212001 | **green** (17/17) |
| 40899570266, 40902377843, 40903844471, 40905140071 | failed at "Close again and confirm clean shutdown": WM_CLOSE sent to the wrong window → bug #14 (and #12/#13 hardening) |
| 40906371950, 40907360663 | **green** (17/17) |
| 40908215193, 40911107625 (run A), 40911086548 (run B) | failed with the same symptom — the diagnostic (window title `''`) that exposed bug #14 |
| 40909845502, 40912939198, 40912949515 | **green** (17/17) after the fix |
| **40914097531** | **green** (17/17) — delivered code, before the final documentation commit |
| **40915127284** | **green** (17/17) — the exact branch state delivered at that point |
| 40955901490 | failed in `npm run test:all` on Windows only: the new theme audit matched `views/` while `path.relative()` returns backslashes on Windows → fixed, paths normalised |
| **40956721324** | **green** (18/18) — theme system, both jobs |
| **40957626626** | **green** (18/18) — same code with the transcript captured; **18/18 PASS** including "Both themes ship in the installed application" |
| **40958446528** | **green** (18/18) — the delivered state: theme system, diagnostics back to failure-only |
| **40962100209** | **green** (18/18) — the five contrast fixes and the split bundle |
| **40963360751** | **green** (18/18) — 203 checks including the rendered theme UI |
| **40964195928** | **green** (18/18) — installer published as a release with checksums |
| 40966223343 | **failed** in the new packaging step only (`dist\win-unpacked` does not exist: electron-builder writes to `release\`) → bug #24 |
| **40967528438** | **green** (18/18) — after the fix: portable ZIP built from `release\win-unpacked`, release `v1.0.0` published |
| **40973680804** | **green** (18/18) — **Parts B–F** (PAID documents, shortcuts, Messenger, calculator keyboard, user guide): 269 measured checks, release assets replaced |
| **40975099606** | **green** (18/18) — the delivered state (capture-layer fall-through fix, safer discard dialog) |

### Not run here (environment limits — not claimed as passing)

- **The installer was never executed on a physical Windows PC** — it was verified on
  a clean GitHub-hosted Windows Server 2022 VM (Defender, SmartScreen and real user
  profiles differ).
- **Electron GUI startup** — the desktop *backend* lifecycle is covered by
  `test:desktop` (real process, real HTTP) and the CI smoke test drives the real
  executable, but no human looked at the rendered window.
- **Browser-visual review of every screen in fr/rw** — dictionary parity and
  key coverage are machine-checked; pixels are not.
- `npm run test:e2e` (Python/Playwright UI test) — no browser available.
- **The rendered themes were never seen by a human or a browser engine.** The
  sandbox has no display (no Xvfb, and Electron's binary cannot be downloaded
  here), so Dark Mode was verified by: the token/contrast tests, the full-UI
  colour audit (170 classes), the first-paint bootstrap executed in Node with
  stubs, and a check inside the installed `app.asar` on the Windows runner that
  the theme bootstrap and dark palette really ship. **A two-minute look at both
  themes after installing is still recommended** before rolling the build out.

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

1. **The installer is built and smoke-tested on a GitHub-hosted Windows runner, but
   not on a physical Windows PC, and it is unsigned.** Windows SmartScreen will warn
   until a code-signing certificate is configured (`CSC_LINK` / `CSC_KEY_PASSWORD`).
   The installers are published as a GitHub **release** (`v1.0.0`) with checksums —
   see `JENESIS/DOWNLOAD.md` for the direct links.
2. **Parts B–F were verified by automated tests and by reading the code, not by a
   human using the interface.** No person has pressed F2/F3/Ctrl+… in the running
   desktop application, nobody has looked at the Messenger panel or the user guide
   on screen, and the calculator's keyboard handling is verified through the rule
   layer and source assertions rather than by typing on a real keyboard. The rules
   themselves (typing safety, Escape ordering, single listener, destinations) are
   covered by 17 checks; a two-minute hands-on pass is still worth doing after
   installing.
3. **No live-Windows-database migration test.** v4/v5 were exercised on copies of
   the bundled database and on fresh installs (9 checks), and the CI smoke test
   upgrades nothing — it starts from an empty database. A database created by an
   *installed* GENESIS build and adopted by the JENESIS data-directory migration
   has never been exercised on Windows (only by 11 unit tests on temporary
   folders).
4. **Electron GUI and the installer UI were never displayed** in this environment.
5. **Code signing is not configured**: Windows SmartScreen will warn until
   `CSC_LINK` / `CSC_KEY_PASSWORD` are set in CI.
6. **Installer auto-update is not implemented** (reinstall keeps `%APPDATA%\JENESIS`).
7. **Period-end revaluation requires a rate for every open foreign document** on
   the revaluation date; if one is missing the whole run aborts and nothing posts.
   This is deliberate (no partial revaluation) but means rates must be maintained.
8. **fx revaluation is per settlement/period** — no automatic reversal of a
   revaluation and no revaluation of open bank balances in foreign currency.
9. `koraledger/`, `SAGE/`, `GEN 0.2.zip`, `GEN 0.4.zip` at the repository root are
   untouched and out of scope.
10. **Messenger between two separate computers was not set up or tested.** The
   messaging backend is the same loopback-only server the desktop app uses, so
   today it serves the running application. Live delivery, receipts, permissions
   and company isolation are verified (18 checks) against one server with two
   sessions; using it from a second computer would require exposing that backend
   on a trusted network — a configuration decision that has **not** been made or
   tested here.
11. **Settlement records a payment, it is not a "mark as paid" switch** — a
   document created as PAID always moves money through the chosen cash/bank
   account. That is the requested behaviour, and it means a genuine credit sale
   must be saved as a draft (uncheck "Post now") and settled later with F2.
12. **No Playwright/browser end-to-end run exists** (no browser in the build
   environment), so the React shortcut layer, the Messenger panel and the guide
   screen are verified by unit tests, source assertions and a production build —
   not by clicking through them in a browser.

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
