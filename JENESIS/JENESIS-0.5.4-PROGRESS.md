# JENESIS 0.5.4 — implementation progress

Target: **0.5.4** (from 0.5.3). Developer: KAYIGANWA JACQUES.
Branch: `arena/a2c625e8-k-jack`.

Status: **modifications 1, 2, 3, 4 and 5 are complete and committed.**
Modification 6, the QA sweep and the release packaging are not finished.

Test bar: **467 checks passed, 0 failed, 29 suites**
(`NODE_OPTIONS=--experimental-sqlite npm run test:count`, run from `JENESIS/`).
It was 356 at the start of 0.5.4. Anything that drops below 467 is a regression.

Version is **0.5.4** (`package.json`, and the installer filename with it).

---

## Where things stand

| # | Modification | State |
|---|--------------|-------|
| 1 | Complete translation (en/fr/rw) | **DONE** — scanner reports 0 untranslated |
| 2 | Currency formatting | **DONE** — one function, `src/money.js` |
| 3 | Delete / deactivate / reactivate | **DONE** — backend + all five screens |
| 4 | Split into four sub-applications | **DONE** — four apps, four colours, four icon sets, four installer shortcuts |
| 5 | Strict separation (UI, routing, API, DB, auth) | **DONE** — enforced in the route guard, refusals recorded |
| 6 | Network & Maintenance overhaul | **PART ONE DONE** (backend + 16 tests; screens pending) |
| — | Rename Admin → Accounting & Business | **DONE** — identity, shell, installer, help, en/fr/rw |
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

## Modification 4 — four sub-applications

| id | title | colour | views |
|----|-------|--------|-------|
| seller | JENESIS Seller | red | dashboard, sales, customers, inventory, help |
| maintenance | JENESIS Network & Maintenance | green | maintenance, help |
| admin | JENESIS Accounting & Business | blue | the whole program |
| settings | JENESIS Settings & Access Point | yellow | settings, help |

One database, one installer, four Desktop and Start Menu shortcuts.
`src/appIdentity.js` is the single definition; `electron/app-mode.cjs` is its
CommonJS twin and `tests/four-apps.test.js` asserts the two cannot drift apart.

Icons come from `scripts/make-app-icons.sh <slug> <hue>`, which rotates the hue
of the blue master in HSL so every application keeps the artist's saturation
and lightness. Hues: seller 0, maintenance 143, admin 221, settings 38.

Two defects found while building it:

- `src/App.jsx` called `t()` on the "initializing" screen without calling
  `useI18n()`, so the window drew nothing at all. Every existing suite passed
  while this was broken, because none of them render that screen.
  `tests/translation-scope.test.js` now requires every file that calls `t()` to
  bring `t` into scope, and is proven by reintroducing the defect.
- The Settings application had no gate. A Seller who opened it landed inside
  screens whose every action the server refuses. An application may now name a
  permission needed to open it (`settings:access`, administrator and manager),
  and `src/App.jsx` refuses with a translated screen naming the application.

`tests/four-apps-render.test.js` draws all four applications and the launcher
with `react-dom/server` and reads the markup back: no blank window, each with
its own name and its own mark, in all three languages.

## Modification 5 — the four applications are held to their own boundaries

Permissions say what a ROLE may do. That was already the first wall: a Seller
holds no `reports:read`, so no report opens for them however they ask. But a
role is not an application, so each one now names itself on every request
(`X-JENESIS-App`) and `server/appScope.js` refuses what it must never touch:

| application | never |
|-------------|-------|
| Seller | reports, purchases, banking, journals, users, company, network, backups |
| Maintenance | accounting, sales, purchases, customers, suppliers, products, stock, reports |
| Settings | trading, and the customer and supplier lists |

A denylist, not an allowlist: an allowlist that missed one permission would
break a working screen, whereas a denylist only refuses what is named.

Callers that name no application are untouched, so older clients, scripts and
every pre-existing test behave exactly as before. An unrecognised application
name is ignored rather than trusted.

Refusals are recorded: every 403 and every 401 that actually presented a token
goes to the audit trail with the user, route, application and permission —
never the token or the password. An anonymous request with no credentials is
not an attempt and is deliberately not logged, so health probes cannot flood it.

`tests/app-separation.test.js` runs this over real HTTP against a real server
process: 18 checks, proven by disabling the scope check, which fails four.

---

## Modification 6 — Network & Maintenance (part one)

`server/network-discovery.js` adds what the application was missing.

**Discovery.** A service allowed on the network announces itself by UDP
broadcast every 15 s and answers a probe with the same announcement; a service
looking for neighbours broadcasts one probe and collects the answers. The
announcement carries only a name, an address, a port and a version — no token,
no user, no company, no database path. With the switch off the service neither
announces nor answers.

**Registration.** Known computers live in `<data>/computers.json`, written
atomically. Adding the same address twice renames it instead of duplicating it;
forgetting one removes it; only ever one is connected at a time.

**Status and diagnoses.** Each registered computer is probed over HTTP and the
result recorded with a message a person can act on:

| code | what it means |
|------|---------------|
| ONLINE | it answered, and it is JENESIS |
| UNREACHABLE | nothing answered — off, asleep, or not on this network |
| REFUSED | the computer is there but JENESIS is not running |
| NOT_JENESIS | something answered at that address, but it is not JENESIS |
| VERSION_MISMATCH | the other computer runs a different version |
| TIMEOUT | no answer in time |
| BAD_ADDRESS | the address is not one a computer can be reached at |
| LAN_DISABLED | this computer is not allowed on the network yet |

Connecting to a computer that does not answer is refused with the reason.

`tests/network-maintenance.test.js` runs two real services, each with its own
database copy, and proves one finds the other: 16 checks, including reading the
raw announcement off the wire and asserting its field list is exactly what it
should be and none of it is a secret.

**Still to come:** the Network & Maintenance screens that use this, and their
en/fr/rw translations.

**Not proven here:** two services on one machine is not two computers. That
proof is `scripts/messenger-two-computers.cjs`, run on the user's network.

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

