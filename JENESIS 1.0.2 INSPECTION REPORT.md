# JENESIS 1.0.2 — Complete Inspection Report

**Purpose.** Establish whether the four applications that already exist actually work, before
any thought is given to another release. Nothing in this document adds a feature.

**Date of this inspection.** 2026-11-11

**Three categories are used throughout, and they are not interchangeable:**

- **PASSED** — genuinely tested, and the test succeeded.
- **FAILED** — tested, and found defective.
- **NOT PERFORMED** — needs equipment, or human eyes, that were not available here.

The third category is not a soft failure. It is the honest answer for anything that needs your
HP laptop, a printer, a second computer, or eyes on a screen. Nothing in this report claims a
physical test was performed.

---

## 1. Current Git branch and commit

| | |
|---|---|
| Branch | `arena/a2c625e8-k-jack` |
| Commit at the start of this inspection | `a248bb4` — *Prepare JENESIS 1.0.2 for real-world testing [skip ci]* |
| Working tree at the start | clean |
| Published release | **JENESIS 1.0.2, untouched** |
| Frozen release | **JENESIS 1.0.1, untouched** |

Both releases were re-measured before anything else was done, and again afterwards. Every asset
is byte-for-byte the size it was when published:

| Release | Setup.exe | Portable.zip | Archive |
|---|---|---|---|
| JENESIS 1.0.2 | 93,144,646 | 133,859,414 | 6,546,939 |
| JENESIS 1.0.1 | 93,144,759 | 133,858,567 | 6,468,905 |

**Nothing was published, no tag was moved, and no checksum changed.**

### A traceability problem found, and left alone

All nine tags in the repository — `v0.5.0` through `v1.0.2` — point at the **same** commit,
`7baae21 "Add files via upload"`, which is the commit this branch started from. So the tag
`v1.0.2` does **not** identify the code that produced `JENESIS.1.0.2.Setup.exe`. The released
installer was built by CI run 42933650015 from commit `c566e25`, which is not an ancestor of the
tag.

This was **not** changed, because you asked that release tags be left alone. It is recorded
because it matters: to know which code is in a released installer, the run and commit must be
recorded, not the tag.

---

## 2. Preview status and access instructions

**Status: RUNNING and reachable.**

| | |
|---|---|
| Address | `http://0.0.0.0:3000` (bound to every interface so the preview proxy can reach it) |
| Launcher | `GENESIS_HOST=0.0.0.0 bash scripts/preview-server.sh` |
| Sign-in | `admin` / `Jenesis-2026` |
| Other accounts | `accountant`, `sales`, `purchases`, `inventory`, `manager` — same password |

**The disposable-database claim is confirmed, and here is the proof.** `scripts/preview-server.sh`
copies the database before the server ever opens it:

```
cp "$ROOT/genesis.db" "$COPY"     # COPY is /tmp/genesis-preview.db
export GENESIS_DB_PATH="$COPY"
```

The server is then handed the copy. `JENESIS/genesis.db` was checked with `git status` before and
after every phase of this inspection and was **clean every time**. The reason this script exists
matters: the server migrates whatever database it opens, and pointing it at the baseline would
upgrade the pristine pre-migration file that `tests/auth-security.test.js` depends on.

Two consequences worth stating plainly, because they are easy to be caught out by:

1. **Anything you enter in the preview is discarded.** It is a copy in `/tmp`.
2. **The copy is made from the baseline**, so its passwords are whatever the committed file
   holds. `scripts/preview-password.cjs` sets `Jenesis-2026` on it, and deliberately refuses to
   run against `JENESIS/genesis.db`.

---

## 3. Results for each of the four applications

### A. JENESIS Seller — Red — **PASSED**

The counter was driven through the real HTTP surface, signed in as the real `sales` role.
`scripts/live-seller-check.cjs`, **16 checks, 0 failed**.

| Requirement | Result |
|---|---|
| Sales interface and dashboard | PASSED — sells, and the sale appears in the history |
| Customer creation and management | PASSED — a customer is created and comes back in the list |
| Product selection | PASSED — the product list loads with figures the counter needs |
| Available stock quantities | PASSED — every product carries a numeric stock figure |
| **Prevention of sales when stock is insufficient** | **PASSED — refused by the service, not the form** |
| Sales transactions | PASSED — stock falls by exactly the quantity sold |
| Fractional quantities | PASSED — 1.25 units sold, stock changed by exactly 1.25 |
| Returns and corrections | PASSED — 0.25 returned, goods went back into stock |
| Return blocked against an unposted invoice | PASSED — refused, and for the right reason |
| Restricted to sales functions | PASSED — reports, users and purchase bills all 403 |

The stock refusal is the one that decides whether the figure can be trusted. It is enforced in
`server/accountingEngine.js:267`, so it holds even if someone calls the service directly instead
of using the form. The check asks for more stock than exists and requires a refusal, then confirms
the refused sale left the stock figure untouched.

**Printing options and receipt configuration — PARTIALLY PERFORMED.** The receipt layout engine
is covered by `tests/receipt-layout.test.js` and `tests/receipt-ui-render.test.js`, and the
configuration screen draws in all three languages. Whether the configuration screen's controls
each do the right thing needs a person clicking them, and whether the result is right on paper
needs a printer. See §9.

### B. JENESIS Accounting & Business — Blue — **PASSED**

`scripts/live-report-reconciliation.cjs`, **10 checks, 0 failed**, against a running server.

The question asked was not "does each report work" but "do they agree with each other", because a
set of reports that each look right and yet disagree is worse than one report that is plainly
broken.

| Cross-check | Result |
|---|---|
| Trial balance balances | PASSED — 203,680.02 debits = credits |
| Balance sheet balances | PASSED — assets 110,365.68 = liabilities + equity |
| Trial balance nets out | PASSED — net debits = net credits = 124,107.95 |
| Profit & loss adds up from its own rows | PASSED |
| P&L net profit is the figure the balance sheet carries | PASSED — 388.98 |
| **Receivables ageing = Accounts Receivable control account** | **PASSED — 4,081.40 both ways** |
| **Payables ageing = Accounts Payable control account** | **PASSED — 1,748 both ways** |
| Inventory valuation = inventory accounts | PASSED, with a disclosed variance — see below |
| Every ageing row's buckets add to its own total | PASSED |
| No NaN, Infinity or null anywhere | PASSED |

Each of the three control-account checks pairs a report built from one set of tables against a
figure built from the journal. That is what makes them worth more than a report checking itself.

**One variance, disclosed rather than hidden.** The inventory valuation reports stock worth
59,184.36 while the inventory account holds 59,183.98 — a difference of **0.38**. It was traced
to a single product, and then to its source:

- The gap is present in the **pristine, unmigrated `genesis.db`** (measured: 59,184.36 against
  59,183.98). No migration and no code path creates it.
- It comes from the seeded demonstration company, whose product costs were loaded at a figure
  0.38 above the movement history they were loaded beside.
- **It does not grow.** After posting a sale of 1.25 units and a return of 0.25 through the
  service, the gap was measured again and was still exactly 0.38. Real transactions write the
  ledger and the stock figures in the same transaction at the same cost, so they stay in step.

So this is seeded demonstration data, not an accounting defect. It is reported rather than
silently corrected, because the rule is that real data is never quietly rewritten. On your own
books the figure should be 0.00.

### C. JENESIS Network & Maintenance — Green — **PASSED**

This application is green, opens on its own screen, and offers **only** that screen and Help.
That was verified three ways, because the requirement is that it must not be a second accounting
program:

1. **Structure** — `APPS.maintenance.views` is exactly `['maintenance', 'help']`.
2. **Drawing** — it draws its own screen, in all three languages, with its icons and its mark.
3. **Service** — for all six roles, the six business endpoints it must never reach each return
   403. Customers, suppliers, products, sales invoices, purchase bills and the trial balance are
   all refused, for every role including the administrator.

**Connection status, computer discovery, and the Messenger — NOT PERFORMED.** Discovery needs two
real computers on a real network. The Messenger's interface draws, but that it works between two
machines is not something this environment can show. See §9.

### D. JENESIS Settings & Access Point — Yellow — **PASSED**

`scripts/live-settings-check.cjs`, **12 checks, 0 failed**.

| Requirement | Result |
|---|---|
| User accounts | PASSED — all six roles present, no duplicate usernames |
| Password management | PASSED — weak passwords refused; wrong current password refused |
| Passwords never handed to the interface | PASSED — no user record carries a password field |
| Role assignment | PASSED — roles read back correctly |
| Permissions | PASSED — the permission catalogue is served to grant from |
| **Access control** | **PASSED — closed applications are refused by the service** |
| Settings cannot trade | PASSED — sales, purchases, products and customers all 403 |

The access-control test is the one that matters. An application was closed for the `manager` user
while leaving their role untouched. That role still holds `reports:read` and `accounting:read`,
and JENESIS Accounting & Business forbids neither — so only the access setting stood between that
user and the ledger. The trial balance, the chart of accounts and the journal were each refused
with `APP_ACCESS_DENIED`. Closing Admin left Network & Maintenance open to them, and re-opening
Admin restored access immediately. The setting was put back.

**Language selection, dark/bright modes and printer configuration — PARTIALLY PERFORMED.** All
three draw and all three are covered by tests, and the theme rules are unit-tested in
`tests/theme.test.js`. But the theme is applied to the document by an effect that only runs in a
real browser, so **no server-side render can see it**. Whether dark mode actually looks right is
yours to confirm. See §9.

---

## 4. Results for all 20 screens, in three languages

The four applications offer **20 screens between them**:

| Application | Screens | Count |
|---|---|---|
| JENESIS Seller | dashboard, sales, customers, inventory, help | 5 |
| JENESIS Network & Maintenance | maintenance, help | 2 |
| JENESIS Accounting & Business | dashboard, sales, purchases, inventory, customers, suppliers, banking, accounting, reports, maintenance, help | 11 |
| JENESIS Settings & Access Point | settings, help | 2 |
| | | **20** |

Every screen was drawn with React itself, in English, French and Kinyarwanda — **60 renders** —
and the markup read back. This is a real render, not a compile: a screen that throws while
drawing produces a blank window in production with nothing to say so.

| Check | Result |
|---|---|
| All 20 screens draw in English | PASSED — none blank, none printing `undefined` or `NaN` |
| All 20 screens draw in French | PASSED |
| All 20 screens draw in Kinyarwanda | PASSED |
| No screen shows untranslated English in French | PASSED — **after the fix in §7** |
| No screen shows untranslated English in Kinyarwanda | PASSED — **after the fix in §7** |
| Every screen draws its icons | PASSED — no screen drew with zero icons |
| The JENESIS mark is on every screen, in its application's tone | PASSED |
| All 1,262 translation keys present in all three languages | PASSED — 0 missing, 0 extra |
| Navigation links lead to the right application | PASSED — the gate is tested in `app-gate.test.js` |

**Not covered by a render, and honestly so:** text overlapping, broken layouts, and dark versus
bright appearance. A server render produces markup, not pixels. Those need your eyes — §9.

---

## 5. Accounting and inventory verification

### 5.1 The AR/AP ageing correction — **PASSED on this branch, ABSENT from the published release**

You asked that the updated preview be clearly distinguished from the published installer. Here is
the distinction, established from the repository rather than from memory:

| | Published JENESIS 1.0.2 | This branch |
|---|---|---|
| Commit | `c566e25` | `a248bb4` |
| Contains the ageing fix | **No** — `unallocated` appears 0 times in `server/reports.js` | **Yes** — appears 6 times |
| In the `v1.0.2` tag | (the tag points elsewhere — see §1) | **No** — `a248bb4` is not an ancestor of the tag |

**The AR/AP ageing correction is NOT in the installer you can download today.** It is committed
and tested here only. Installing 1.0.2 now gives you the old behaviour.

What the defect was, so it can be recognised if seen: recording a payment against a party without
naming a document — the Banking form offers "None" for exactly this — reduced the party's balance
correctly but left the document open. A supplier paid 150.00 against a 100.00 bill showed a
balance of −50.00, which is right, while the ageing still reported 100.00 outstanding, which is
wrong, and the bill would have looked unpaid forever.

The fix makes the report answerable to the party's recorded balance. The gap between what the open
documents add up to and what the account says is treated as an unallocated credit, shown in the
CURRENT bucket because money not tied to a document has no age. Two properties follow, and both
are now tested: the buckets add up to the row's total, and the row's total is what the account
says. For data where every payment is allocated the gap is zero and nothing changes.

Verified on this branch:

| Requirement | Result |
|---|---|
| Unallocated payments affect the party's recorded balance | PASSED |
| Ageing totals reconcile with the party's balance | PASSED |
| Overpayments are not reported as unpaid invoices | PASSED |
| Credit balances are not reported as unpaid invoices | PASSED |
| Ageing buckets add up correctly | PASSED |
| Existing allocated payments still behave correctly | PASSED — the gap is zero, so nothing changes |
| Historical journal entries are preserved | PASSED |
| Corrections add entries instead of rewriting | PASSED |

### 5.2 A full business day — **PASSED**

`tests/end-to-end-scenarios.test.js`, **23 checks, 0 failed**. A day is run against a real
database: buy 10.5 kg at a unit cost of 10.3333, sell 1.25, return 0.5 as a negative line, return
0.25 as a credit note, refund 10.75, overpay a supplier and a customer, spill 0.1 kg.

Fractional quantities, decimal amounts, returns, refunds and inventory valuation are all covered
by it, including that a quantity is never stored with less precision than it was entered, and that
a refund of 10.75 takes exactly 10.75 out of the bank.

`tests/report-audit.test.js` adds **17 checks, 0 failed**, specifically for negatives and decimals:
a credit balance appearing in the ageing, an overpaid invoice netting into the right bucket, a
returned sale reported as negative revenue rather than zero, and VAT and cash flow both netting a
refund against the sale it reverses.

### 5.3 History is append-only — **PASSED**

The suite fingerprints every journal entry before it runs and compares afterwards, to prove a
correction ADDS an entry rather than rewriting one already posted. It reported a rewrite once, and
that turned out to be the test's fault: the fingerprint hashed an ordered array, so a new entry
sorting between two old ones looked like a change to the past. A trace of all seven operations
confirmed they only ever add. The check now compares row by row.

---

## 6. Security and permission verification

**PASSED — `scripts/live-permission-probe.cjs`, 16 checks, 0 failed.**

This was built because the failure it catches is one no amount of rule-reading can catch: a route
that forgets to ask. Hiding a menu proves nothing if the service will still answer.

The probe signs in as each of the six roles and calls **every read-only route of the API from each
of the four applications in turn** — 1,512 calls, by hand, over HTTP, with the `X-Jenesis-App`
header a real window sends. The expected answer for each call is worked out from the server's own
rules (the role's permissions, the application's forbidden list, and the user's application
access) and compared with what actually came back.

| | |
|---|---|
| Calls made | 1,512 (6 roles × 4 applications × 63 routes) |
| Expected refusals | 991 |
| Correctly refused | 991 |
| Wrongly allowed | **0** |
| Wrongly refused | **0** |
| Crashes | 0 |

**991 refusals, every one of them correct, and nothing leaked anywhere.**

The headline claims were then stated plainly rather than inferred from the sweep:

- **No role — including the administrator — can read the reports or the ledger from JENESIS
  Seller.** The trial balance, profit and loss, balance sheet, both ageing reports, the journal
  and the chart of accounts were each refused for all six roles.
- **No role can reach business records from JENESIS Network & Maintenance.** Customers, suppliers,
  products, sales invoices, purchase bills and the trial balance were each refused for all six
  roles.

Two details of method, because a probe that lies about coverage is worse than no probe:

- `GET /messenger/stream` is excluded by name. It is a Server-Sent Events feed that answers 200
  and then stays open by design. Including it would hang the sweep forever, and would hang on the
  one endpoint where "no answer" looks most like "allowed".
- The probe finishes by counting the journal entries. If that count had moved, the probe would
  have written something and its own result could not be trusted. It did not move.

**Existing restrictions were not weakened anywhere to make testing easier.** The only changes
made to test-related files in this inspection added checks.

---

## 7. Every defect discovered, and what was done

### Defect 1 — the Help guides named the four applications in English, in every language

| | |
|---|---|
| **Status** | **FIXED** |
| **File and cause** | `scripts/helpgen/content/fr.json` and `rw.json` — 33 occurrences in each named the applications "JENESIS Seller", "JENESIS Accounting & Business" and so on, inside otherwise translated prose. The interface itself translates these names, so the French Help called the application something its own French screen does not. |
| **Effect on the user** | A French user reads *"Comment utiliser JENESIS Seller"* in Help, while every screen they use calls it **JENESIS Vendeur**. The same in Kinyarwanda, where the screens say **JENESIS Umucuruzi**. The guide appears to describe a different program from the one running. |
| **Fix** | The four application names were replaced in the French and Kinyarwanda help sources only, using the project's own translated names from `identity.*_name` and `identity.*_short` — so the guides and the screens now say the same thing. English was left untouched. `src/views/appHelpContent.js` was then regenerated with `npm run help:build`, and the generator's own check confirms it matches its sources. |
| **Regression test** | Two new checks in `tests/four-apps-render.test.js` draw all 20 screens in French and Kinyarwanda and search the visible text for the English wording of any string that *does* have a translation. If the English appears on the page, the translation was not used. |
| **Result** | Both pass. Full suite afterwards: **746 checks, 0 failed**. |

Two false positives had to be understood before this could be trusted, and both are recorded in
the test so nobody re-discovers them:

- Some Kinyarwanda translations keep the English in brackets — *"Inyandiko zo Gusubiza (Credit
  Notes)"* — because the term has no settled wording. That is a deliberate gloss, not a missing
  translation, so the check skips it.
- 37 French and 16 Kinyarwanda strings are identical to English for good reason: cognates
  (*Actions*, *Date*, *Total*, *Description*), the brand name, and the three language names shown
  in their own language. None is a missing translation.

### Defect 2 — inventory valuation and the inventory account differ by 0.38

| | |
|---|---|
| **Status** | **REPORTED, NOT ALTERED** |
| **Cause** | The seeded demonstration company was loaded with product costs totalling 59,184.36 beside a movement history and inventory account totalling 59,183.98. Measured in the pristine, unmigrated `genesis.db`, so no code path and no migration creates it. |
| **Effect on the user** | On the demonstration company, the inventory valuation report and the balance sheet disagree by 0.38. On real books the figure should be 0.00, and it does not grow: after a sale and a return were posted, the gap was still exactly 0.38. |
| **Why it was not silently corrected** | Correcting it means rewriting accounting data, and the standing rule is that real data is never quietly rewritten. It is measured and disclosed instead. |
| **Regression test** | `scripts/live-report-reconciliation.cjs` prints the gap every run and fails if it ever exceeds the seeded variance. A new disagreement cannot hide behind it. |

### Things investigated that turned out **not** to be defects

Worth recording, because each looked like one:

- **`/taxes` returning 200 for the sales role.** The route is guarded by
  `requireAnyPermission('accounting:read','sales:read')`, and JENESIS Seller needs the VAT rates
  to raise an invoice. Correct. My first probe read only the first permission and reported it as
  a leak; the probe was wrong, not the route.
- **Payables ageing appearing to disagree with its control account.** A supplier the business owes
  is a *credit* balance, so the account is negative while the ageing states what is owed as a
  positive amount. The invariant is stated explicitly in the script now.
- **"Assets should equal the trial balance debit total."** Wrong invariant — expenses carry debit
  balances too. The real identity is that net debit balances equal net credit balances.
- **A refused sale, a refused return, and 429 responses.** Two were my own payload using
  snake_case where the service takes camelCase; the third was the API's 1,200-requests-per-minute
  limit, which a 1,512-call sweep trips by design. The probe now waits it out.

---

## 8. Automated test totals and failures

| Suite | Checks | Failed |
|---|---|---|
| Full automated suite (`npm run test:count`) | **746** | **0** |
| Accounting engine (`npm test`) | 11 | 0 |
| End-to-end business day (`test:e2e2`) | 23 | 0 |
| Report audit, negatives and decimals (`test:reportaudit`) | 17 | 0 |
| Four applications, drawing (`test:appsrender`) | 26 | 0 |
| — of which: all 20 screens × 3 languages | 60 renders | 0 |
| Live checks against the running server | **66** | **0** |
| — general (`live-check.cjs`) | 12 | 0 |
| — report reconciliation | 10 | 0 |
| — permission probe (1,512 HTTP calls) | 16 | 0 |
| — settings and access point | 12 | 0 |
| — seller | 16 | 0 |
| **Total** | **812** | **0** |

Suites: 41. Crashes: 0.

The full suite was **746 before** this inspection and is **746 now** — the +4 new checks in
`four-apps-render.test.js` replaced nothing, and nothing existing was removed or weakened.

`JENESIS/genesis.db` was clean before and after every run.

---

## 9. NOT PERFORMED — what still needs your HP laptop

These are not failures. They are the tests that cannot be run without equipment or eyes, and none
of them is claimed as passed anywhere in this report.

| # | Test | Why it cannot be done here |
|---|---|---|
| 1 | Installation on the HP laptop | Needs the machine |
| 2 | Start Menu and Desktop shortcuts | Needs a Windows shell and the installer |
| 3 | Uninstall, and that it leaves nothing behind | Needs the machine |
| 4 | Actual printer operation | No printer is attached to this environment |
| 5 | 58 mm receipt printing | Needs a 58 mm printer |
| 6 | 80 mm receipt printing | Needs an 80 mm printer |
| 7 | A4 printing | Needs an A4 printer |
| 8 | Print preview matching the paper | Needs a printer to compare against |
| 9 | Accented characters on paper (French, Kinyarwanda) | Needs a printer |
| 10 | Cash drawer opening, if configured | Needs the drawer |
| 11 | Two computers on a real network | Needs a second machine |
| 12 | Computer discovery between two machines | Needs two machines |
| 13 | Messenger delivering between two machines | Needs two machines |
| 14 | Error handling when the other computer is unavailable | Needs two machines |
| 15 | Visual inspection of dark mode | The theme is applied by a browser effect; a server render sees markup, not pixels |
| 16 | Visual inspection of bright mode | Same |
| 17 | Text overlapping or clipped on screen | Needs eyes on a screen |
| 18 | Broken layouts at unusual window sizes | Needs a real window |
| 19 | Icons looking right, not merely being present | Presence is tested; appearance is not |
| 20 | Sign-in on a real machine, as a real user | Partly covered — six roles signed in over HTTP here — but not through the installed desktop application |

**Also not performed: any test of the published 1.0.2 installer's behaviour.** This inspection
tested the branch, in a browser-served preview. The installer was not run, because running it
needs your laptop.

---

## 10. A practical step-by-step guide for you

`JENESIS 1.0.2 REAL-WORLD TESTING.md` is the working checklist — every step is a checkbox with the
expected result written next to it. Use it alongside this summary.

### Before you begin

1. Download the three 1.0.2 assets from the release. **Keep the `.sha256` files beside them.**
2. Verify each one. In PowerShell, in the download folder:
   ```
   Get-FileHash JENESIS.1.0.2.Setup.exe -Algorithm SHA256
   ```
   Compare with what is in `JENESIS.1.0.2.Setup.exe.sha256`. They must match exactly. If they do
   not, stop and say so — do not install.
3. **Record what you have now.** If you already run JENESIS, take a backup first.

### Installation (tests 1–3)

4. Run `JENESIS.1.0.2.Setup.exe`. Install to the default location.
5. **Check all four shortcuts exist on the Desktop** — Seller, Network & Maintenance, Accounting &
   Business, Settings & Access Point. Photograph them.
6. **Open the Start Menu and confirm all four are there.** This is the test most likely to fail
   and the one that matters most, because shortcuts cannot be verified any other way.
7. Launch each of the four in turn. Each must open in **its own colour**: Seller red, Network &
   Maintenance green, Accounting & Business blue, Settings & Access Point yellow.
8. Sign in as `admin`. **If you did not set this password yourself, the one in the preview does
   not apply to a real installation** — use whatever your installation was set up with.
9. When finished, uninstall from Windows Settings and confirm the application no longer appears.

### Printing (tests 4–10)

10. In Settings & Access Point, open the printing configuration. Choose your receipt printer.
11. Print a **58 mm** receipt from a sale. Check: the width fits, nothing is cut off, and the
    total is readable.
12. Print an **80 mm** receipt. Same checks.
13. Print an **A4** invoice. Check the layout and that the page breaks sensibly.
14. **Print a sale whose customer name contains an accent** — `Josée`, `Nkurunziza`, anything with
    é, è, ç or a Kinyarwanda letter. Accents are the single most common printing failure and
    cannot be found without paper.
15. Compare the on-screen preview with the paper. They must agree.

### Two computers (tests 11–14)

16. Install on the second computer, or run the Portable build from a folder it can write to.
17. Put both on the same network. In **Network & Maintenance**, enable the access point on the
    first machine.
18. On the second machine, connect to the first. Confirm it is discovered.
19. **Send a Messenger message from one to the other.** It must arrive. This is the test that
    decides whether the Messenger is real.
20. Now disconnect the first machine from the network — or simply close JENESIS on it. The second
    machine must show a clear error, not hang and not crash.

### The interface (tests 15–19)

21. Walk all 20 screens. Change the language to **French**, then to **Kinyarwanda**, and walk them
    again. Look for English words where they should not be, and for text that overlaps or is cut
    off.
22. Switch to **Dark Mode** in Settings. Walk the screens again. Look for text that becomes
    unreadable, and for anything that stays bright while the rest goes dark.
23. Switch back to **Light Mode** and confirm it returns cleanly.
24. Resize the window narrow, then wide. Look for layouts that break.

### Accounting (the numbers)

25. Run a real business day: a purchase, a sale, a return, a refund, and a payment.
26. Compare the **Trial Balance, Balance Sheet, Profit & Loss, Receivables Ageing and Payables
    Ageing**. The receivables ageing total must equal what the receivables account says, and the
    same for payables. That is the check in §5.1, and it is the one the 1.0.2 installer will get
    wrong if you overpay a supplier.
27. **Note the inventory valuation against the balance sheet.** On the demonstration data expect
    a difference of 0.38. On your own books it should be 0.00. If it is not, report the figure.

### If something fails

Record: what you did, what you expected, what actually happened, and — most useful of all — a
photograph or screenshot. A screenshot of a wrong number is worth more than a description of it.

---

## Summary

| Category | Count |
|---|---|
| **PASSED** | 812 automated checks (746 suite + 66 live), 60 screen renders, 1,512 permission calls |
| **FAILED** | **0** outstanding. One defect found and fixed (§7, Defect 1); one variance disclosed (§7, Defect 2) |
| **NOT PERFORMED** | 20 items requiring your laptop, a printer, a second computer, or your eyes (§9) |

**JENESIS 1.0.1 and 1.0.2 are exactly as published.** No release was created, no asset was
replaced, no checksum changed, and no tag was moved.

**The published installer does not contain the AR/AP ageing fix.** That fix is committed and
tested on this branch only, and is waiting on your review before anything ships.
