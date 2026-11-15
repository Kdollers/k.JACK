# JENESIS 1.0.3 — Verification Report

This report states what was tested, how, and what the result was. Where something could not be
tested here, it says so and names what is needed to test it.

**Five categories are used, and they are not interchangeable:**

- **COMPLETED** — the work itself is done (a correction made, a test written).
- **PASSED** — genuinely tested, and the test succeeded.
- **FAILED** — tested, and found defective.
- **NOT PERFORMED** — needs equipment, or human eyes, that this environment does not have.
- **BLOCKED** — cannot proceed because something else is outstanding.

Nothing in this report claims a physical test was performed.

---

## 1. Executive summary

JENESIS 1.0.3 corrects the Accounts Receivable / Accounts Payable ageing defect, translates the
application names inside the French and Kinyarwanda Help guides, and makes releases traceable to
the code they were built from.

| | |
|---|---|
| Automated suite | **771 checks, 0 failed**, 42 suites |
| New AR/AP regression scenarios | **24 checks, 0 failed** |
| Live HTTP permission probe | **1,512 calls, 991 refusals, 0 unauthorised leaks** |
| Live checks against the running application | **66 checks, 0 failed** |
| Screens drawn | **20 screens × 3 languages = 60 renders, 0 failures** |
| Defects found and fixed | **2** (Help guide names; release tagging) |
| Defects reported, not altered | **1** (the 0.38 inventory variance in seeded demo data) |
| Physical tests still outstanding | **14** |

The AR/AP correction was **not** in the published 1.0.2 installer. It is in 1.0.3 only.

**Recommendation: ready to release, with the physical tests in section 10 still outstanding.** See
section 19.

---

## 2. Changes implemented

| # | Change | Status |
|---|---|---|
| 1 | AR/AP ageing corrected in `server/reports.js` (`getArAging`, `getApAging`) | COMPLETED |
| 2 | 24 AR/AP regression scenarios added, `tests/ar-ap-payment-scenarios.test.js` | COMPLETED |
| 3 | Application names translated in French and Kinyarwanda Help guides | COMPLETED |
| 4 | Release tag pinned to the built commit (`--target`), with a build-time check | COMPLETED |
| 5 | Stale "What is new in 0.5.5" heading made version-driven | COMPLETED |
| 6 | Traceability table (commit, run, date) added to the release notes | COMPLETED |
| 7 | Verification report published as a release asset | COMPLETED |
| 8 | Version raised to 1.0.3 in `package.json` | COMPLETED |
| 9 | Full suite, live checks and permission probe re-run | COMPLETED |

No existing test was removed and no expectation was weakened. The four applications, their colours,
their permissions and their separation are unchanged.

---

## 3. AR/AP correction verification

### 3.1 The defect

Recording a payment against a party **without naming a document** — the Banking form offers "None"
for exactly this, and an overpayment or an opening balance has nothing to be allocated to — reduced
the party's balance correctly but left the document open. The ageing is built from the open
documents, so it reported the full amount as owed.

A supplier paid **150.00** against a **100.00** bill: balance −50.00 (right), ageing **100.00
outstanding** (wrong). The bill would have looked unpaid forever.

### 3.2 The correction

`server/reports.js`, in both `getArAging` and `getApAging`:

```js
const bucketSum = roundTo(current + days30 + days60 + days90 + daysOver90, 2);
const unallocated = roundTo(cust.current_balance - bucketSum, 2);
const totalDue = roundTo(cust.current_balance, 2);
```

with `totalDue`, `unallocated`, and `current: roundTo(current + unallocated, 2)` returned. The gap
between the open documents and the account is an unallocated credit, shown in **Current** because
money not tied to a document has no age. Where every payment is allocated the gap is zero and
nothing changes.

### 3.3 Confirmation that 1.0.2 did not have it

| | `unallocated` in `server/reports.js` |
|---|---|
| `c566e25` — the commit JENESIS 1.0.2 was built from | **0 occurrences — absent** |
| This branch | 6 occurrences — present |

### 3.4 The eight required scenarios

`tests/ar-ap-payment-scenarios.test.js`. Each scenario is checked **four ways**, because the four
figures are computed from four different places and only agree when the posting was right: the
party's `current_balance` (maintained incrementally), the statement's closing balance (replayed from
the transactions), the ageing report (built from open documents), and the control account in the
nominal ledger.

| Scenario | Result |
|---|---|
| Partial payment — 100.00 invoice, 40.00 paid | PASSED — 60.00 outstanding |
| Full payment — 200.00 invoice, 200.00 paid | PASSED — nothing outstanding |
| Customer overpayment — 100.00 invoice, 130.00 received | PASSED — 30.00 credit |
| Supplier overpayment — 100.00 bill, 150.00 paid | PASSED — 50.00 credit |
| Several payments against one invoice — 3 × 100.00 | PASSED — checked after each |
| Credit note — 100.00 invoice, 25.00 credited | PASSED — 75.00 outstanding |
| Refund — overpayment of 50.00 returned | PASSED — balance restored to 0 |
| Outstanding balance after payment | PASSED — all six parties correct |

Both the **allocated** and the **unallocated** forms of each overpayment are covered, because they
fail differently.

### 3.5 Proof the tests are real regression tests

The correction was temporarily reverted and the suite re-run:

```
✗ a customer overpayment is a credit, not a debt
✗ a supplier overpayment is a credit, not an unpaid bill
✗ an overpaid supplier is not reported as money the business owes
✗ a supplier overpayment recorded with no document named still leaves a credit
✗ a customer overpayment recorded with no document named still leaves a credit
✗ an unallocated payment never leaves a document looking unpaid
✗ a credit note reduces what the customer owes
✗ a refund returns an overpayment and restores the balance
✗ the refund is on the statement and brings it back to zero
✗ every scenario leaves the outstanding balance it should
✗ no figure in any ageing report is NaN, Infinity or missing
```

**11 of the 24 checks fail without the correction.** The file was then restored bit-for-bit and the
suite returns to 24/24.

### 3.6 General Ledger, Balance Sheet, Trial Balance and statements

| Requirement | Result |
|---|---|
| The correction introduces no General Ledger inconsistency | PASSED — trial balance balances after every scenario |
| Balance Sheet remains consistent | PASSED — balanced after every scenario |
| Trial Balance remains consistent | PASSED — net debits = net credits after every scenario |
| Customer statements remain consistent | PASSED — each statement's closing balance equals the recorded balance |
| Supplier statements remain consistent | PASSED — same |
| Receivables control account equals what all customers owe | PASSED |
| Payables control account equals what all suppliers are owed | PASSED |

---

## 4. Accounting reconciliation results

`scripts/live-report-reconciliation.cjs` against the running application, **10 checks, 0 failed**.
The reports are checked against each other, not each against itself.

| Check | Result |
|---|---|
| Trial balance balances, and says so | PASSED |
| Balance sheet balances, and says so | PASSED |
| Trial balance nets out (debit balances = credit balances) | PASSED |
| Profit & loss adds up from the rows it prints | PASSED |
| P&L net profit is the figure the balance sheet carries | PASSED |
| Receivables ageing = Accounts Receivable control account | PASSED — 4,266.40 both ways |
| Payables ageing = Accounts Payable control account | PASSED — 1,748 both ways |
| Inventory valuation = inventory accounts | PASSED, with a disclosed variance (§9) |
| Every ageing row's buckets add to its own total | PASSED |
| No NaN, Infinity or null anywhere | PASSED |

Measured on this build: trial balance 204,130.02 debits = credits; balance sheet assets 110,435.68
= liabilities + equity; net profit 388.98 before the scenario fixtures.

`tests/report-audit.test.js` adds **17 checks, 0 failed** for negatives and decimals, and
`tests/end-to-end-scenarios.test.js` runs a full business day in **23 checks, 0 failed**.

---

## 5. Permission and security test results

`scripts/live-permission-probe.cjs`. Six roles × four applications × every read-only route, over
real HTTP, with the `X-Jenesis-App` header a real window sends. The expected answer is derived from
the server's own rules and compared with what came back.

| | Before 1.0.3 | Now |
|---|---|---|
| Calls | 1,512 | **1,512** |
| Expected refusals | 991 | **991** |
| Correctly refused | 991 | **991** |
| Wrongly allowed | 0 | **0** |
| Wrongly refused | 0 | **0** |
| Crashes | 0 | **0** |

**No regression.** Results are identical.

The headline claims, stated plainly rather than inferred from the sweep:

- **No role — including the administrator — can read the reports or the ledger from JENESIS
  Seller.** Trial balance, profit & loss, balance sheet, both ageing reports, the journal and the
  chart of accounts, refused for all six roles.
- **No role can reach business records from JENESIS Network & Maintenance.** Customers, suppliers,
  products, sales invoices, purchase bills and the trial balance, refused for all six roles.

Method notes, because a probe that overstates its coverage is worse than no probe:

- `GET /messenger/stream` is excluded by name — it is a Server-Sent Events feed that answers 200
  and then stays open by design, and would hang the sweep on the one endpoint where "no answer"
  looks most like "allowed".
- The probe finishes by counting journal entries and fails if the count moved, so a probe that
  wrote something could not be believed.
- No existing restriction was weakened to make testing easier.

---

## 6. Seller application test results

`scripts/live-seller-check.cjs`, **16 checks, 0 failed**, signed in as the real `sales` role.

| Requirement | Result |
|---|---|
| Sales interface and dashboard | PASSED |
| Customer creation and management | PASSED — created, and read back |
| Product selection | PASSED |
| Available stock quantities | PASSED — every product carries a numeric figure |
| Prevention of sales when stock is insufficient | PASSED — **refused by the service, not the form** |
| Sales transactions | PASSED — stock fell by exactly the quantity sold |
| Fractional quantities | PASSED — 1.25 sold, stock changed by exactly 1.25 |
| Returns and corrections | PASSED — 0.25 returned, goods back into stock |
| Return refused against an unposted invoice | PASSED — refused, and for the right reason |
| Printing options and receipt configuration access | PARTIAL — see §10, tests 4–10 |
| Restricted to sales functions | PASSED — reports, users and purchase bills all refused |

The stock refusal is enforced in `server/accountingEngine.js:267`, so it holds even when the
service is called directly rather than through the form. The check asks for more stock than exists,
requires a refusal, and separately confirms the refused sale left the stock figure untouched.

---

## 7. Settings application test results

`scripts/live-settings-check.cjs`, **12 checks, 0 failed**.

| Requirement | Result |
|---|---|
| User accounts | PASSED — six roles present, no duplicate usernames |
| Password management | PASSED — weak password refused; wrong current password refused |
| Passwords never handed to the interface | PASSED |
| Role assignment | PASSED |
| Permissions | PASSED — the catalogue is served to grant from |
| Access control | PASSED — a closed application is refused by the service |
| Application settings, language, theme, printer | PARTIAL — see §10 |
| Settings cannot trade | PASSED — sales, purchases, products, customers all refused |

The access-control test closes an application for one user while leaving their role untouched. The
`manager` role still holds `reports:read` and `accounting:read`, and JENESIS Accounting & Business
forbids neither — so only the access setting stood between that user and the ledger. Trial balance,
chart of accounts and journal were each refused with `APP_ACCESS_DENIED`. Closing Admin left Network
& Maintenance open to them, and re-opening Admin restored access at once. The setting was put back.

---

## 8. General application test results

`scripts/live-check.cjs`, **12 checks, 0 failed**: the server answers, a real user signs in,
products, customers and bank accounts load, the trial balance balances, journal entries load, the
inventory valuation loads with every row rounded, both ageing reports load and reconcile, no report
returns NaN or Infinity, and all four Help guides are served.

Screens: **20 screens × 3 languages = 60 renders, 0 failures** (`tests/four-apps-render.test.js`,
26 checks). Every screen draws its icons, carries the JENESIS mark in its own application tone, and
shows no untranslated English in French or Kinyarwanda. All 1,262 translation keys are present in
all three languages, with 0 missing and 0 extra.

---

## 9. Inventory valuation investigation

**The finding, restated.** Inventory valuation reports **59,184.36**; the inventory account holds
**59,183.98**. Difference **0.38**.

**Where it comes from.** Measured in the **pristine, unmigrated `genesis.db`**:

```
BASELINE genesis.db (unmigrated)
  SUM(stock x cost_price)      = 59184.3600
  SUM(movements qty x cost)    = 59183.9800
  ledger account 1200 net      = 59183.9800
```

No code path and no migration creates it. The seeded demonstration company was loaded with product
costs 0.38 above the movement history loaded beside them. It traces to one product, whose stored
cost is 719.57 where its movement history averages 719.562.

**Requirement by requirement:**

| Requirement | Result |
|---|---|
| Preserve the original accounting records | COMPLETED — `genesis.db` unchanged; verified with `git status` throughout |
| Do not silently rewrite `genesis.db` | COMPLETED — nothing was written to it |
| Is the difference expected from seeded demo data? | **Yes** — proven by measuring the pristine baseline |
| Do new inventory transactions increase it? | **No** — see below |
| Keep it visible in the report | COMPLETED — stated here and printed by the check on every run |
| Never conceal it to obtain a passing test | COMPLETED — the check prints the gap and fails above the seeded variance |

**Proof new transactions do not widen it.** After a sale of 1.25 units and a return of 0.25 were
posted through the service, the gap was measured again and was **still exactly 0.38**. Real
transactions write the ledger and the stock figures in the same transaction, at the same cost.

The reconciliation check prints the gap every run (`note: valuation and ledger differ by 0.38`) and
fails if it ever exceeds the seeded variance. A new disagreement cannot hide behind it.

On a company's own books the figure should be **0.00**.

---

## 10. Twenty physical tests and their status

The 20 items marked NOT PERFORMED in the 1.0.2 inspection were reviewed and sorted.

### A. Completed in this environment

| # | Test | How | Result |
|---|---|---|---|
| 2 | Start Menu and Desktop shortcuts | Windows runner, in CI | **PASSED on a virtual machine** |
| 3 | Uninstall, keeping business data | Windows runner, in CI | **PASSED on a virtual machine** |
| 20 | Sign-in as a real user | Windows runner, in CI + six roles over HTTP | **PASSED on a virtual machine** |

The installed-application smoke test runs on every build and verifies all three: it reads each
`.lnk` on the Desktop (four, each naming its application and carrying its own icon), confirms each
also appears in the Start menu pointing at the same place, signs in through the interface the way a
user does, and uninstalls silently while keeping the business data.

**These are a GitHub-hosted Windows runner, which is a virtual machine — not your HP laptop.**
Antivirus, SmartScreen, graphics drivers and User Account Control all differ on a real PC.

### B. Requires a physical Windows computer — 1 test

| # | Test | Required equipment | Status |
|---|---|---|---|
| 1 | Installation on the HP laptop | The HP laptop | NOT PERFORMED |

### C. Requires a printer — 7 tests

| # | Test | Required equipment | Status |
|---|---|---|---|
| 4 | Actual printer operation | Any printer | NOT PERFORMED |
| 5 | 58 mm receipt printing | A 58 mm thermal receipt printer | NOT PERFORMED |
| 6 | 80 mm receipt printing | An 80 mm thermal receipt printer | NOT PERFORMED |
| 7 | A4 printing | An A4 printer | NOT PERFORMED |
| 8 | Print preview matches the paper | A printer | NOT PERFORMED |
| 9 | Accented characters on paper (French, Kinyarwanda) | A printer | NOT PERFORMED |
| 10 | Cash drawer opening | A cash drawer | NOT PERFORMED |

### D. Requires a second computer or a real network — 4 tests

| # | Test | Required equipment | Status |
|---|---|---|---|
| 11 | Two computers on a real network | Two computers, one network | NOT PERFORMED |
| 12 | Computer discovery between two machines | Two computers | NOT PERFORMED |
| 13 | Messenger delivering between two machines | Two computers | NOT PERFORMED |
| 14 | Error handling when the other computer is unavailable | Two computers | NOT PERFORMED |

### E. Requires direct visual inspection — 5 tests

| # | Test | Required | Status |
|---|---|---|---|
| 15 | Dark mode looks right | Human eyes | NOT PERFORMED |
| 16 | Bright mode looks right | Human eyes | NOT PERFORMED |
| 17 | No text overlapping or clipped | Human eyes | NOT PERFORMED |
| 18 | No broken layouts at unusual window sizes | Human eyes | NOT PERFORMED |
| 19 | Icons look right, not merely present | Human eyes | NOT PERFORMED |

Presence is tested; appearance is not. The theme is applied by a browser effect, so no server-side
render can see it.

### Checklist for the tests you must run

Photograph or screenshot every result. A picture of a wrong number is worth more than a description.

**Priority 1 — Desktop and Start Menu shortcuts**

1. Run `JENESIS 1.0.3 Setup.exe` on the HP laptop. *Equipment: the laptop.*
2. **Expected:** four shortcuts on the Desktop — JENESIS Seller (red), JENESIS Network &
   Maintenance (green), JENESIS Accounting & Business (blue), JENESIS Settings & Access Point
   (yellow). **Actual:** ______ **PASS / FAIL**
3. Open the Start Menu. **Expected:** the same four, in the same colours. **Actual:** ______
   **PASS / FAIL**
4. Launch each. **Expected:** each opens its own application, no command prompt window, no error.
   **Actual:** ______ **PASS / FAIL**

**Priority 2 — Printer configuration and receipt printing**

5. In JENESIS Settings & Access Point, open the printing configuration and select your receipt
   printer. *Equipment: a receipt printer.* **Expected:** the printer is detected and selectable.
   **Actual:** ______ **PASS / FAIL**
6. Print a **58 mm** receipt from a sale. *Equipment: 58 mm printer.* **Expected:** the width fits,
   nothing is cut off, the total is legible. **Actual:** ______ **PASS / FAIL**
7. Print an **80 mm** receipt. *Equipment: 80 mm printer.* **Expected:** same. **Actual:** ______
   **PASS / FAIL**
8. Print an **A4** invoice. *Equipment: A4 printer.* **Expected:** the layout is sensible and page
   breaks fall in sensible places. **Actual:** ______ **PASS / FAIL**
9. Print a sale whose customer name carries an accent — `Josée`, `Nkurunziza`, anything with é, è,
   ç or a Kinyarwanda letter. **Expected:** the accent prints correctly, not as a box or a
   question mark. **Actual:** ______ **PASS / FAIL**
10. Compare the on-screen preview with the paper. **Expected:** they agree. **Actual:** ______
    **PASS / FAIL**

**Priority 3 — Second computer**

11. On computer A, open JENESIS Network & Maintenance and switch ON "Allow other computers on this
    network to connect". Note the address it shows. *Equipment: two computers on one network.*
    **Actual address:** ______
12. On computer B, connect to that address. **Expected:** computer A is discovered and connects.
    **Actual:** ______ **PASS / FAIL**
13. Send a Messenger message from B to A. **Expected:** it arrives. **Actual:** ______ **PASS /
    FAIL**
    A harness is provided: from computer B run
    `node scripts\messenger-two-computers.cjs --server http://<A>:3000 --user admin --peer
    accountant --password <pw> --password-peer <pw>`
14. Close JENESIS on A, or disconnect it. **Expected:** B shows a clear error, does not hang and
    does not crash. **Actual:** ______ **PASS / FAIL**

**Priority 4 — Appearance**

15. Switch to Dark Mode and walk all 20 screens. **Expected:** everything stays readable; nothing
    stays bright while the rest goes dark. **Actual:** ______ **PASS / FAIL**
16. Switch to Light Mode. **Expected:** it returns cleanly. **Actual:** ______ **PASS / FAIL**
17. Walk the screens in French, then Kinyarwanda. **Expected:** no English where a translation
    exists; no overlapping or clipped text. **Actual:** ______ **PASS / FAIL**
18. Resize the window narrow, then wide. **Expected:** no layout breaks. **Actual:** ______
    **PASS / FAIL**
19. Look at the icons. **Expected:** they look right, not merely present. **Actual:** ______
    **PASS / FAIL**

**Also outstanding:** uninstalling on the HP laptop, and confirming it leaves your business data in
place.

---

## 11. Build information

<!--BUILD_INFO_START-->

JENESIS 1.0.3 was built by GitHub Actions run **43702388660**, on a `windows-2022` hosted runner,
from commit **7c531ab80f02c4b68cdda8ba432a1309049c97bf**. Every step of the Windows job passed:

| Step | Result |
|---|---|
| Read the version (`1.0.3`) | PASS |
| Install dependencies | PASS |
| Full test suite (Windows) | PASS |
| Build the frontend and the NSIS installer | PASS |
| Verify the packaged application | PASS |
| Smoke-test the installed application | PASS (30/30) |
| Package the portable build and write checksums | PASS |
| Package the source backup | PASS |
| Stage, upload and publish | PASS |

**What the smoke test did to the installed application.** It installed the real
`JENESIS 1.0.3 Setup.exe`, launched it from the installed shortcut, walked first-run setup,
signed in as a real user, posted an accounting entry, took a backup, closed the window, relaunched
it and confirmed the data was still there, and finally uninstalled while keeping the business data.
Thirty checks, all PASS.

**How the credentials were typed.** A runner has no keyboard, so the sign-in was delivered three
ways — the Chromium DevTools Protocol (real input events), `SendKeys`, and `WM_CHAR` posted into the
window — and the run records which one reached the interface. This build: **confirmed via the
DevTools Protocol** that the signed-in screen was reached. That is why
`JENESIS-Seller-Dashboard.bmp` and `JENESIS-Settings-Signed-In.bmp` show the screens as a signed-in
user sees them rather than the sign-in prompt.

**Two failures came before this build, and both are recorded here because they changed the release.**

1. *Run 136 and 137 — the suite crashed on the real database driver.* The AR/AP fixture bound nine
   values to a statement with ten placeholders. It passed in this sandbox, because the sandbox
   cannot compile `better-sqlite3` and runs the tests on Node's built-in `node:sqlite` through a
   shim, and `node:sqlite` does not check. CI, on the real driver, threw
   `RangeError: Too few parameter values were provided`. The missing value was bound, and the shim
   was then made to count parameters the way the real driver does so that the sandbox fails on the
   same code CI fails on. The whole suite was re-run under the strictened shim: 771 checks, 0
   failed, and no other file in the repository binds the wrong number of values.

2. *Run 138 — a full, correct build published nothing.* Every real step passed, including the smoke
   test. The step that commits the screenshots back to the branch was then rejected as a
   non-fast-forward because the branch had moved during the half-hour build, and the two steps
   guarded by `if: success()` — the portable upload and the release — were skipped. Branch commits
   are now best-effort and retried, and a record of the build can no longer cancel the build.

**Nothing was published prematurely.** v1.0.3 did not exist until run 139 completed successfully.
The installers of 1.0.2 and 1.0.1 were re-measured after this release and are byte-for-byte
unchanged — see the note on the earlier releases immediately below.

<!--BUILD_INFO_END-->

---

## 12–17. Release identifiers

<!--RELEASE_IDS_START-->

| | |
|---|---|
| Release | `v1.0.3` |
| Version in `package.json` | `1.0.3` |
| Git commit SHA | `7c531ab80f02c4b68cdda8ba432a1309049c97bf` |
| Git tag | `v1.0.3` |
| Tag object type | `commit` (lightweight — it names the commit directly) |
| Tag resolves to | `7c531ab80f02c4b68cdda8ba432a1309049c97bf` |
| Commit the installer was built from | `7c531ab80f02c4b68cdda8ba432a1309049c97bf` |
| Tag matches the built commit | **YES** — verified against the run's `head_sha` |
| GitHub Actions run ID | `43702388660` (run number 139) |
| Workflow | `JENESIS Windows installer` |
| Built (UTC) | 2026-11-15 10:16 UTC |
| Installer (`JENESIS 1.0.3 Setup.exe`) | 93,142,753 bytes (88.8 MB) |
| Portable (`JENESIS 1.0.3 Portable.zip`) | 133,860,593 bytes (127.7 MB) |
| Source backup (`JENESIS 1.0.3.zip`) | 6,677,039 bytes (6.4 MB) |
| Installer SHA-256 | `6e01f01853bbf4cf24e98c14fea6054b280d18b3cf68cbab2fd69c5a2f8a05b5` |
| Portable SHA-256 | `1a644d430881992e3999f495452384b33ecc7d5e81a4f97f2924dac006e958d1` |
| Source backup SHA-256 | `7ff6b0f653c26b84774a591e02acc2f59a542a4fd2011ec44195010856ef19da` |

Every figure above was measured by the build that produced the files, not retyped afterwards. The
sizes and hashes are those the run computed when it wrote the files; the sizes were independently
re-read from the release API and agree to the byte. Verify a download with:

```
certutil -hashfile "JENESIS 1.0.3 Setup.exe" SHA256
```

and compare with the `.sha256` file published next to each download.

<!--RELEASE_IDS_END-->

The tag is created with `--target` pinned to the source commit, and a step in the workflow resolves
the tag and **fails the build** if it names any other commit. Earlier tags are left exactly as they
are — rewriting them would silently move the code nine published releases point at, which is the
opposite of traceability.

**The earlier releases were re-measured after v1.0.3 was published, and are untouched.** Publishing
this release did not overwrite, rebuild or alter a single byte of 1.0.2 or 1.0.1:

| Release | Installer (bytes) | Portable (bytes) | Source (bytes) |
|---|---|---|---|
| v1.0.3 | 93,142,753 | 133,860,593 | 6,677,039 |
| v1.0.2 | 93,144,646 | 133,859,414 | 6,546,939 |
| v1.0.1 | 93,144,759 | 133,858,567 | 6,468,905 |

The v1.0.2 and v1.0.1 figures are the same to the byte as they were before this release existed.

---

## 18. Outstanding issues

| # | Issue | Status |
|---|---|---|
| 1 | Inventory valuation differs from the inventory account by 0.38 in seeded demo data | OPEN — reported, not altered. Does not grow. See §9 |
| 2 | All tags from v0.5.0 to v1.0.2 point at the base commit, not the built code | OPEN for those releases — deliberately not rewritten. Fixed for 1.0.3 onwards |
| 3 | 14 physical tests outstanding (1 laptop, 7 printer, 4 network, 2 visual) | OPEN — need your equipment. See §10 |
| 4 | The installer is unsigned; SmartScreen will warn | OPEN — signing needs a certificate |
| 5 | Messenger between two physical computers is unproven | OPEN — needs two machines |
| 6 | The two themes have never been seen by a person | OPEN — needs your eyes |

---

## 19. Final release recommendation

**JENESIS 1.0.3 is released — and 14 physical tests are still outstanding.**

It was published as `v1.0.3` by GitHub Actions run `43702388660`, and the tag names
`7c531ab80f02c4b68cdda8ba432a1309049c97bf`, which is exactly the commit the installer was built
from. It did not exist as a release until that run had finished every step successfully, and
publishing it left 1.0.2 and 1.0.1 byte-for-byte unchanged.

What justifies releasing:

- The AR/AP defect — the reason for this release — is corrected, and the correction is guarded by
  24 regression checks that were **proven to fail without it**.
- Every report agrees with every other report and with the nominal ledger.
- **1,512 permission calls, 991 refusals, zero leaks.** No role reaches what it should not.
- All 20 screens draw in all three languages, with their icons and their marks.
- 771 automated checks pass; nothing was removed or weakened to make that true.

What the release must not be taken to mean:

- It does **not** mean the installer has been run on your HP laptop. It has been run on a
  GitHub-hosted Windows runner, which is a virtual machine.
- It does **not** mean printing works. **No printer has ever been used.**
- It does **not** mean the two computers connect. That has never been tried with two real machines.
- It does **not** mean the interface looks right. Its presence is tested; its appearance is not.

**The one thing to do before trusting 1.0.3 with a real business day:** run the Priority 1 and
Priority 2 checklists in section 10 — the four shortcuts, and printing with an accented customer
name. Those are the two areas where this environment can tell you nothing at all, and the two most
likely to fail.

---

CREATED AND DEVELOPED BY KAYIGANWA JACQUES
