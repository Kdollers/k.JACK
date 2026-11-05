# JENESIS 0.5.4 — implementation progress

Target: **0.5.4** (from 0.5.3). Developer: KAYIGANWA JACQUES.
Branch: `arena/a2c625e8-k-jack`.

Status: **all six modifications are complete, and JEN 0.5.4 is built and
published.** The installer has been installed and used on a Windows Server 2022
runner, and all four shortcuts have been launched.

Test bar: **528 checks passed, 0 failed, 31 suites**
(`NODE_OPTIONS=--experimental-sqlite npm run test:count`, run from `JENESIS/`,
and the same figure reported by the Windows runner on Node 20).
It was 356 at the start of 0.5.4. Anything that drops below 528 is a regression.

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
| 6 | Network & Maintenance overhaul | **DONE** — part one (backend, 16 checks) and part two (the screens, 102 keys, 4 render checks) |
| — | Rename Admin → Accounting & Business | **DONE** — identity, shell, installer, help, en/fr/rw |
| — | QA regression, installer, delivery | **DONE** — 528 checks, installer built and installed, smoke test 29/29, JEN 0.5.4 published |

Still unverified, and said so in the release notes: the physical PC, sign-in
through the interface (the runner reported NOT confirmed), and two computers on
a real network.

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
- ~~The four Windows shortcuts have not been installed or clicked; they are
  asserted from `build/installer.nsh`.~~ **Resolved.** The installer is now
  built and installed on a Windows Server 2022 runner and every shortcut is
  read back out of the `.lnk` file the installer wrote, then launched.

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

---

## Modification 6 — Network & Maintenance (part two): the screens

Part one built and proved the mechanism; part two puts it on a screen.

**`src/components/NetworkComputers.jsx`** is new: it draws the computer list,
one row per computer, with its name, address, when it was last seen and what
state it is in (online, offline, not a JENESIS computer, refused, switched
off). Every state carries a `data-testid` so a test can ask for it by name, and
every row offers the actions its state allows.

**`src/views/MaintenanceView.jsx`** grew the "Computers on this network"
section: a search field, the list, and the buttons — **Find computers**,
**Connect**, **Disconnect**, **Test**, **Forget** and **Diagnose**. It delegates
the list itself to `NetworkComputers`.

**102 new translation keys** (996 → 1,030 per language). Every message a
diagnosis can produce is a translated string, not a literal in the component —
including the eight reasons a computer may be unreachable. `node
scripts/find-untranslated.cjs` reports **0**.

**Four new render checks** in `tests/screens-render.test.js`, negatively proven:
the file was temporarily broken in four different ways and each check was seen
to fail before it was allowed to pass. The suite now renders 26 screens.

**The renaming was finished** here: the window titles, the shortcuts, the Start
menu, the installer, Help and all three dictionaries now say **JENESIS Network
& Maintenance** and **JENESIS Accounting & Business**. Inside the interface,
where the language is French or Kinyarwanda, the four applications are shown
under their translated names; the names are exact and untranslated everywhere
they identify the product.

---

## The installer, and the four shortcuts, verified on Windows

This is the part that had only ever been asserted from configuration. It is now
measured.

`scripts/smoke-test-installed.ps1` was rewritten to know about four
applications. It reads each `.lnk` with `WScript.Shell` and reports where it
points, which argument it carries and which icon it shows — then **launches
it** and waits for the window that must appear. All four pass:

```
JENESIS Seller                  -> JENESIS.exe --app=seller       icon-seller.ico
JENESIS Network & Maintenance   -> JENESIS.exe --app=maintenance  icon-maintenance.ico
JENESIS Accounting & Business   -> JENESIS.exe --app=admin        icon-admin.ico
JENESIS Settings & Access Point -> JENESIS.exe --app=settings     icon-settings.ico
```

The same four names are then found in the Start menu, the four windows are
opened together, and the backend is asked for `/setup/status` to prove that all
four are serving **the same company** rather than four databases.

### Faults found while making that happen

Six, none of which were visible from the repository:

1. **PowerShell variable shadowing.** The loop that launches each application
   named its variable `$appName`; every helper that enumerates windows reads a
   script-level `$AppName`. PowerShell ignores case, so inside that loop the
   test asked Windows for processes named "JENESIS Seller" and found none.
   Every window it then reported as missing was on screen the whole time. The
   lookup now reads the script-level name explicitly and the loop variable was
   renamed.
2. **The same trap one level up:** the step's own parameter is `$Name`, so a
   block that said `$name` inside a step read the step's title. Blocks now
   close over their values with `GetNewClosure()`.
3. **`System.Drawing` is not available.** The screenshot code would not compile
   on the runner. The BMP is now assembled byte by byte from `GetDIBits`.
4. **A C-style `/** */` comment** written outside the C# block, which
   PowerShell reads as a command.
5. **`$AppName:` in a string** is a scope reference, not text.
6. **The window title is not the string it was created with.** Once the page
   has loaded the window shows the document's title, so the seller window is
   called `JENESIS Seller — JENESIS`. The check now looks for the name within
   the title.

### Screenshots

The runner has no display, but `PrintWindow` still renders a window into a
bitmap, so every window the smoke test verifies is photographed. The four
pictures were then measured rather than merely saved: 1,255–1,671 distinct
colours each, and each window carries **only its own identity colour** at about
2% of its pixels, with 0.00% of the other three.

The per-window path renders one window at a time, so a `ToScreenBmp` capture of
the whole desktop was added for the moment when all four are open. It measures
what it captured and discards the file — and says so — if the result is blank,
because on a runner with no display a black rectangle would otherwise pass for
a photograph.

---

## Defects repaired after the first green build

Three were found by the Windows job rather than by anything local:

- **`/api/taxes` refused the Seller.** The sales invoice reads the list of tax
  rates from a route guarded by `accounting:read` alone, and the Seller role
  does not hold it. A new `requireAnyPermission` guard allows the route when the
  caller holds either `accounting:read` or `sales:read`, while `POST` stays with
  `accounting:write` — the clerk may read the rates, only the bookkeeper may
  define them. The application scope is applied to each held permission, so
  JENESIS Network & Maintenance still gets nothing. Four checks prove it in
  both directions.
- **The suite only ran on Node 22.** `tests/auth-security.test.js` required
  `node:sqlite` directly, which exists from Node 22.5 onwards. CI runs Node 20.
  Database handles now come from `tests/open-database.cjs`, which uses
  `better-sqlite3` when it is installed and falls back to `node:sqlite` when it
  is not.
- **A crashed suite could look green.** The Linux job ran the suite through a
  pipe and kept only the exit code of the check counter at the far end. The
  counter totals what each suite *printed*, so a suite that died before
  printing anything left the total clean and the job green. The job now runs
  with `pipefail`.

`tests/test-suite-portability.test.js` (34 checks) keeps all three fixed: no
test file may require a version-specific module outside the shared opener, the
opener must actually work here, and every test script must either run inside
`test:all` or print the reason it cannot. It found one immediately: `test:e2e`
drives a real browser through Playwright, which cannot be installed in CI, and
it now says so on every transcript instead of being quietly left out.

---

## Environment notes (updated)

- The suite runs on **Node 20 and Node 22**. `node:sqlite` is a fallback, never
  an assumption.
- `electron-builder --win` cannot run here (native cross-compilation, and the
  release assets it needs are not reachable). **Every installer statement in
  this document comes from the `windows-2022` job**, never from this machine.
- The `better-sqlite3` shim is a sandbox device. It is test-only, git-ignored,
  rebuilt by `restore-sandbox.sh`, and never packaged.
- Screenshots cannot be viewed here: there is no browser, and release assets
  cannot be downloaded. A half-size copy of each is committed to the branch by
  the workflow so the pictures can be inspected from outside.
