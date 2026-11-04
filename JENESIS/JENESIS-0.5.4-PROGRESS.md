# JENESIS 0.5.4 — implementation progress

Target: **0.5.4** (from 0.5.3). Developer: KAYIGANWA JACQUES.
Branch: `arena/a2c625e8-k-jack`.

Status: **modifications 1, 2 and 3 are complete and committed.**
Modifications 4, 5 and 6, the rename, and the release packaging are not started.

Test bar: **419 checks passed, 0 failed, 25 suites**
(`NODE_OPTIONS=--experimental-sqlite npm run test:count`, run from `JENESIS/`).
It was 356 at the start of 0.5.4. Anything that drops below 419 is a regression.

---

## Where things stand

| # | Modification | State |
|---|--------------|-------|
| 1 | Complete translation (en/fr/rw) | **DONE** — scanner reports 0 untranslated |
| 2 | Currency formatting | **DONE** — one function, `src/money.js` |
| 3 | Delete / deactivate / reactivate | **DONE** — backend + all five screens |
| 4 | Split into four sub-applications | NOT STARTED |
| 5 | Strict separation (UI, routing, API, DB, auth) | NOT STARTED |
| 6 | Network & Maintenance overhaul | NOT STARTED |
| — | Rename Admin → Accounting & Business | NOT STARTED |
| — | QA regression, installer, delivery | NOT STARTED |

---

## Modification 1 — complete translation

`scripts/find-untranslated.cjs` audits `src/` for user-facing literals. It
started at **171 candidates** and now reports **0**, with **9 documented
exceptions** in `scripts/untranslated-allowlist.json` (language endonyms, ISO
currency codes, keyboard and calculator keys) — each with a written reason, so
nothing is exempted silently.

Scanner rules: JSX text nodes, `title/placeholder/aria-label/alt/label/header/
caption` attributes, `showToast`, `prompt`/`confirm`/`alert`, `label:` entries in
data, a label glued to an expression (`>Total: {amount}<`), and — as a safety
net — a test that seeds untranslated text into a scratch directory to prove the
rules still fire.

126 keys were added across all three languages. `scripts/i18n-add.py` applies a
batch file and **refuses a key that is missing a language**, so a key can never
land in only two of the three dictionaries.

Batches are kept in `scripts/i18n-batches/*.json` as a record of what was added.

Also fixed along the way: the invoice footer hard-coded
`Bank of Kigali • Account: 00040-01234567-USD` and a Mobile Money merchant
number on every printed document. It now prints the company's own contact
details, or a translated line asking for its bank details. **A printed invoice
never invents an account number.**

## Modification 2 — currency formatting

`src/money.js` is the single place a money string is assembled:

- a **graphic sign** goes in front: `$1,400.00`
- a **code** goes behind with one space: `1,400.00 XFA`

`AppContext.formatCurrency` delegates to it, so all ~150 call sites inherit the
rule, and the three screens that glued strings by hand (Banking, Purchases,
Sales) now call it. **Strictly display-only** — no stored value, exchange rate,
decimal precision, journal entry or balance was touched.

## Modification 3 — delete / deactivate / reactivate

The rule everything hangs on: **history is never destroyed.** A record that has
been invoiced, billed, paid, moved or journalled cannot be deleted at all — only
deactivated, with every past document, movement, journal entry and audit row
left exactly as it was.

**Backend** — `server/records.js` (new). One module for the five kinds
(customers, suppliers, products, warehouses, users); each declares the tables
that make it historical, so "has this been used?" is answered by the schema.

- Deleting a record with history → **409 HAS_HISTORY** plus the server's
  explanation, which the UI turns into a "Deactivate instead" button.
- Deactivation sets `active = 0` and changes nothing else.
- Guards: you cannot retire your own account, nor the last active
  administrator; the default store cannot be deactivated.
- A deactivated user has **every session revoked at once**, so an already-open
  window dies immediately rather than at the next login.
- Every action writes an audit row: user, date-time, action type, affected
  record, and before/after values.

**Permissions** — new `records:deactivate` and `records:delete`, granted to
**admin and manager only**. Accountant, sales, purchases and inventory are
refused with 403 even when calling the endpoint directly; the test suite proves
it for each role. The existing assertion that "manager is read-only" now names
this as the single deliberate exception.

**API** — `POST /records/:type/:id/deactivate`, `.../reactivate`,
`DELETE /records/:type/:id`, `GET /records/:type/:id/history`.
The five list endpoints take `?status=active|inactive|all` and **default to
active**, so every picker raising an invoice, bill, receipt, transfer or
adjustment stops offering retired records with no change on its side.

**Frontend** — `src/components/RecordLifecycle.jsx` (new): one control reused by
Customers, Suppliers, Products, Stores and Users. Delete always confirms and
names the record; a 409 becomes an explanation plus "Deactivate instead".
Plus an Active/Inactive/All filter and an "Inactive" badge on each list.

**Tests** — `tests/record-lifecycle.test.js`, 47 checks against a real server on
a copy of the demo database: the 403s, the 409s, surviving stock and history,
killed sessions, the audit rows and a still-balanced trial balance.

---

## Environment notes

The sandbox wipes `.git`, `node_modules/`, `build/` and `dist/` between turns.
Run this first:

```bash
bash /home/user/k.JACK/restore-sandbox.sh
```

It re-attaches `.git`, restores tracked `build/` and `dist/`, runs
`npm ci --ignore-scripts`, and rebuilds the sandbox-only better-sqlite3 shim
over `node:sqlite`. The shim is **test-only and never packaged**.

Never commit `node_modules/`; the shim lives there and is git-ignored.

---

## Carried-forward disclosures (must appear in the final report)

- No run on the user's physical HP PC; no screenshots yet.
- Signed installer is not produced (no code-signing certificate in this
  environment); the installer is unsigned.
- No Playwright end-to-end run; no live Windows database-migration test.
- Messenger is **not** proven between two separate computers.
- The `node:sqlite` shim is test-only and is never shipped.
- Typed sign-in is not confirmed by any automated run.
- The Inventory screen error the user reported has not been reproduced.
- The four Windows shortcuts have not been installed or clicked; they are
  asserted from `build/installer.nsh`.

---

## Correction: the repository database must never be opened by a live server

Running `node server/index.js` against `JENESIS/genesis.db` migrates that file
in place. The baseline database is deliberately **pre-migration**, because
`tests/auth-security.test.js` proves that a database captured before the
versioned migrations upgrades safely. Once the server had migrated it, that
scenario silently upgraded an already-upgraded file and failed with a
meaningless `customers count preserved (+1 walk-in per company) 5 !== 6`.

Two things now prevent it:

- `tests/auth-security.test.js` refuses to run the legacy scenario unless
  `genesis.db` is still pre-migration, and prints the exact remedy
  (`git checkout HEAD -- JENESIS/genesis.db`, then delete `genesis.db-wal` and
  `genesis.db-shm`).
- `scripts/preview-server.sh` starts the server against a throwaway copy in
  `/tmp` through `GENESIS_DB_PATH`, so browser checks never touch the baseline.

Use `bash scripts/preview-server.sh` for any live verification.

