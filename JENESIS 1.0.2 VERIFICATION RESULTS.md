# JENESIS 1.0.2 — Verification results

**JENESIS** — created and developed by **KAYIGANWA JACQUES**.

What has been tested, what was found, what was fixed, and — in its own
section, because it is the longest one — what has not been tested and cannot
be, here.

The accompanying **`JENESIS 1.0.2 REAL-WORLD TESTING.md`** is the procedure for
the parts that need your hands, your laptop, a printer, and a second computer.

---

## 1. What was run, and what it reported

| | |
|---|---|
| Full automated suite | **742 checks, 0 failed, 41 suites** |
| — on Linux (sandbox) | 742, 0 failed |
| — on a GitHub-hosted Windows runner | 713 at release, 0 failed |
| End-to-end business scenarios (new) | **23 checks, 0 failed** |
| Live HTTP checks against a running server | **12 checks, 0 failed** |
| Screens drawn — 20 screens × 3 languages | **60 renders, 0 failures** |
| Installed-application smoke test (Windows) | **30/30 PASS** |
| Interface sign-in | **confirmed via the DevTools Protocol** |
| Translation parity | **1,262 keys** per language, 0 missing |
| Baseline database after the suite | unchanged (now enforced in CI) |

The suite grew from 713 to 742 during this verification phase: 23 checks from
the new end-to-end scenarios, plus 2 from the screen sweep, plus the counter's
own rounding. **Nothing existing was removed or weakened.**

Two facts worth stating separately, because they are easy to conflate:

- **713** is what the released build (run 42933650015, commit `c566e25`) ran.
  That is the number on the release page.
- **742** is what the current working tree runs, including the scenarios added
  afterwards. The release files are unchanged.

Run the suite yourself from `JENESIS/`:

```
NODE_OPTIONS=--experimental-sqlite npm run test:all
npm run test:e2e2     # the end-to-end business day
```

---

## 2. Defects discovered and corrected

### 2.1 Found during this verification phase

**AR and AP ageing contradicted the balance sheet when a payment was not tied
to a document.** — *fixed*

`recordPayment` accepts a payment against a customer or supplier without naming
a particular invoice; the Banking form offers "None" for exactly this. The
party's overall balance is reduced correctly, but the individual document is
not — so a supplier paid 150.00 against a 100.00 bill ended up with a balance
of **−50.00** (correct: the business is owed fifty) while the ageing still
reported **100.00 outstanding**. The report disagreed with the accounts, and
the bill would have looked unpaid forever.

The fix makes the report answerable to the party's recorded balance. The
difference between what the open documents add up to and what the account
actually says is an unallocated credit — or an opening balance brought forward
— and it is now shown in the **current** bucket, because money not tied to a
document has no age. Two properties follow, and both are now tested:

- the buckets add up to the row's total;
- the row's total is what the party's account says.

For data where every payment *is* allocated, the difference is zero and the
report is unchanged. The fix only corrects the case that was wrong.

**One investigation that found nothing — recorded because the question
mattered.** The end-to-end suite fingerprints every journal entry before it
runs and compares afterwards, to prove that a correction *adds* an entry rather
than rewriting one already posted. It reported a rewrite. That was a fault in
the test, not the program: the fingerprint hashed an ordered array, so a new
entry sorting between two old ones looked like a change to the past. A separate
trace confirmed all seven business operations — purchase, sale, negative sale,
credit note, refund, overpayment and stock adjustment — **only ever add
entries**, and the corrected check now proves it per row.

### 2.2 Found earlier in 1.0.2 (the report audit)

1. **AR and AP ageing dropped every credit balance.** Both filtered
   `current_balance > 0` and `balance_due > 0`, so a customer who had been
   refunded too much — and was therefore owed money — vanished from the report.
2. **Inventory valuation overstated total units by exactly two.**
   `roundTo(products.reduce((acc, p) => acc + ..., 2), 2)` passes `2` as the
   reduce's *initial value* rather than as `roundTo`'s decimals.
3. **Inventory valuation printed unrounded rows under a rounded total.**
   1.25 kg at 10.3333 showed `12.916662500000001` in the row and `12.92` below.
4. **Quantities were rounded to currency precision**, so a 0.125 kg lot was
   rounded out of the stock total.

### 2.3 Found in 1.0.1 (the three modifications)

5. Rounding that scaled by 100 and lost cents, and returned `-1` for `-1.005`.
6. Tax and COGS skipped entirely when a line was negative.
7. A FIFO return posting no COGS at all.
8. A refund impossible to record.
9. The Seller's Help guide carrying accounting instructions a Seller cannot
   carry out.

Each of the nine has a test that fails if it returns.

---

## 3. What the end-to-end scenarios actually do

`tests/end-to-end-scenarios.test.js` runs a business day against a real
database — not a mock — using the numbers the brief named:

1. Buy **10.5 kg** at a unit cost of **10.3333**.
2. Sell **1.25 kg**.
3. Return **0.5 kg** as a negative sale line.
4. Return **0.25 kg** as a credit note against the posted invoice, restocking.
5. Refund a customer **10.75**.
6. Overpay a supplier, and overpay a customer, using two parties created for
   the purpose so the outcome does not depend on the sample company's balances.
7. Adjust stock by **−0.1 kg** for a spillage.

Then it asks the questions that decide whether the program is fit for a
business:

- Stock: **48 → 57.9**, exactly (48 + 10.5 − 1.25 + 0.5 + 0.25 − 0.1).
- Bank: falls by exactly the refund plus the supplier payment.
- Trial balance: balanced. Balance sheet: balanced.
- AP ageing shows the overpaid supplier at **−50**; AR ageing shows the
  overpaid customer at **−30**.
- The buckets add up to each row's total.
- Every entry posted that day balances in itself.
- **No journal entry or line that existed beforehand was modified.**

---

## 4. Tests that can be automated — and are

These are already in the suite, so they run on every push without anybody
being present:

| Area | Covered by | Checks |
|---|---|---|
| Rounding exactness and debit/credit symmetry | `decimal-negative` | 25 |
| Stock, sales, returns, refunds, corrections | `decimal-negative` | (above) |
| Every report with negatives and decimals | `report-audit` | 17 |
| The full business day and the past staying past | `end-to-end-scenarios` | 23 |
| The receipt document: sizes, layouts, hard cases | `receipt-layout` | 27 |
| The Printing screen actually drawing | `receipt-ui-render` | 16 |
| The four Help guides: complete, translated, correct app | `app-help` | 27 |
| The Help generator not drifting from its sources | `helpgen` | 1 |
| Every screen of every app in three languages | `four-apps-render` | 22 |
| Right-click, Seller dashboard, Settings & Access Point | three suites | 54 |
| Authentication, permissions, security hardening | `auth-security`, `security-hardening` | — |
| Translation parity | `i18n-parity` | 10 |
| Live sign-in and reports over HTTP | `scripts/live-check.cjs` | 12 |

**Gaps that could be automated later, and are not:**

- Printing to a real printer (no printer exists in any runner).
- Two computers on a real network (one machine can host two services; that is
  not two computers).
- Anything requiring a human to look at a screen — legibility, layout,
  whether text is cut off.

---

## 5. Tests requiring physical hardware

**None of the following has been performed. Nothing here is claimed as
passing.**

| Test | Needs | Status |
|---|---|---|
| Installer launches and completes | Your HP laptop | **Not performed** |
| Four shortcuts appear and launch | Your HP laptop | **Not performed** |
| No blank white window | Your HP laptop, and your eyes | **Not performed** |
| Data survives a Windows restart | Your HP laptop | **Not performed** |
| Uninstall leaves nothing unexpected | Your HP laptop | **Not performed** |
| USB printer discovered and prints | A USB printer | **Not performed** |
| Network printer discovered and prints | A network printer | **Not performed** |
| 58 mm thermal output and alignment | A 58 mm thermal printer | **Not performed** |
| 80 mm thermal output and alignment | An 80 mm thermal printer | **Not performed** |
| A4 output | An A4 printer | **Not performed** |
| Logo position on paper | Any printer | **Not performed** |
| French and Kinyarwanda characters on paper | Any printer | **Not performed** |
| Preview matches the paper | Any printer, and your eyes | **Not performed** |
| Two computers discover each other | Two computers, one network | **Not performed** |
| Messenger delivery between them | Two computers | **Not performed** |
| Unread counts, history, reconnection | Two computers | **Not performed** |
| An unauthorised computer is refused | Two computers | **Not performed** |
| Dark and bright mode look right | Your eyes | **Not performed** |
| Every Help instruction matches the program | Your reading | **Not performed** |

What the smoke test *does* prove on the Windows runner, which is not nothing:
the installer runs, all four shortcuts launch, no window is blank (it checks
the rendered content), and credentials typed into the sign-in window reach the
interface through the DevTools Protocol. It does not prove any of it looks
right.

---

## 6. Remaining limitations

1. **No human being has looked at any screen.** Every screen is rendered by
   React and 20 of them are drawn in three languages, and the Windows runner
   photographed the installed applications — but there is no browser here, and
   the photographs are a machine's picture of a window. **Please be the first
   person to look at them.**
2. **Printing has never been tested against a real printer.** There is no
   printer in either environment. What was tested: building the receipt for
   every paper size and layout option, and for decimal quantities, negative
   lines, French and Kinyarwanda text and a 200-line receipt; that printing
   leaves the database byte-for-byte unchanged; that each application keeps its
   own layout. What was not: discovering a printer, sending it a job, or
   whether a receipt emerges correctly from a thermal roll.
3. **Two computers have never been tested.** Two services on one machine is not
   two computers. Discovery, delivery, unread counts, history and reconnection
   are all unverified between physical machines.
4. **Nothing has run on a physical PC.** Only GitHub-hosted Windows runners.
   Antivirus, SmartScreen, graphics drivers and user account control are things
   that runner does not have.
5. **The installer is unsigned.** Windows SmartScreen will warn
   (More info → Run anyway).
6. **No live database migration test.** Migrations 1–6 replay cleanly against a
   copy, but a real company database upgrading in place has not been watched.
   **Back up before installing over an existing installation.**
7. **Right-click was never clicked by a person.** Every action is exercised in
   code and over HTTP.
8. **The four Help guides have never been read on a screen.** All 117 sections
   are proven to exist, to be complete, to be genuinely translated and to
   render for the right application. Whether the prose reads well, and whether
   every instruction matches your business, only you can judge.
9. **Three form restrictions are deliberate**: stock transfer lines, goods
   receipt lines, and the cash-count quantity. The first two are refused by the
   engine, so relaxing the form would only let you type a value the engine
   rejects; a supplier return has its own instrument. The third counts
   banknotes.
10. **One design choice worth knowing.** A payment recorded without naming an
    invoice reduces the party's balance but does not mark any particular
    document paid; the unallocated difference now appears in the *current*
    bucket of the ageing report. If you would rather payments always allocate
    to the oldest open document automatically, that is a change to make
    deliberately, not during verification.

---

## 7. Release files, unchanged

JENESIS 1.0.2 is untouched by this verification work. No new version was
created; the release and its checksums are exactly as published.

```
JENESIS 1.0.2 Setup.exe       93,144,646 bytes   8fcc2cdfef56157e940d55ab330a09f0fb5d543fab8ed191d44d15277642ad41
JENESIS 1.0.2 Portable.zip   133,859,414 bytes   15571760a597f7fa2c8c2989ef04d416ea4adf85f8c4fb7991cfaf8125e00664
JENESIS 1.0.2.zip              6,546,939 bytes   c0836a9eee5001f62e20c522e53ad45fef531a647800b4632eb48ad04cefad8f
```

Built by GitHub Actions run 42933650015, commit `c566e25`.

JENESIS 1.0.1 remains published and separate, its files never overwritten.

---

Created and developed by **KAYIGANWA JACQUES.**
