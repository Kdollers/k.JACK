# JENESIS 1.0.3 — Progress

What was done for this release, in the order it was done, and what each item changed.

---

## 1. Accounts Receivable and Accounts Payable — corrected

**The highest-priority item.** The correction existed on the development branch but was absent from
the published 1.0.2 installer.

**Where it lives.** `JENESIS/server/reports.js`, in `getArAging` and `getApAging`.

**Before:**

```js
const totalDue = roundTo(current + days30 + days60 + days90 + daysOver90, 2);
...
totalDue: totalDue !== 0 ? totalDue : cust.current_balance,
current,
```

**After:**

```js
const bucketSum = roundTo(current + days30 + days60 + days90 + daysOver90, 2);
const unallocated = roundTo(cust.current_balance - bucketSum, 2);
const totalDue = roundTo(cust.current_balance, 2);
...
totalDue,
unallocated,
current: roundTo(current + unallocated, 2),
```

**Why the difference matters.** A payment recorded without naming a document reduces the party's
balance but leaves the document open. Summing the open documents therefore reports more than the
account owes. Folding the difference into **Current** keeps both guarantees an ageing must make:
the buckets add up, and the total is what the account says.

**Regression tests.** `JENESIS/tests/ar-ap-payment-scenarios.test.js`, 24 checks, covering the
eight cases the brief named — partial payment, full payment, customer overpayment, supplier
overpayment, several payments against one invoice, credit notes, refunds, and the outstanding
balance after payment. Each scenario is checked four ways: the party's recorded balance, the
statement's closing balance (replayed from the transactions), the ageing report, and the control
account in the nominal ledger.

**Proof the tests are real.** With the correction reverted, 11 of the 24 checks fail. Both the
allocated and the unallocated overpayment cases are covered, because they fail differently.

---

## 2. Application names translated in the Help guides

**File.** `JENESIS/scripts/helpgen/content/fr.json` and `rw.json`; `src/views/appHelpContent.js`
regenerated from them.

33 occurrences in each language named the four applications in English inside otherwise translated
prose. The names are now taken from the project's own `identity.*_name` and `identity.*_short`
translations, so the guides and the screens say the same thing.

`npm run help:check` confirms the generated file matches its sources.

---

## 3. Release traceability

**File.** `.github/workflows/windows-installer.yml`.

Releases were created with `gh release create` and no `--target`, so GitHub wrote the tag at the
default branch's head. Every tag from v0.5.0 to v1.0.2 therefore names the repository's base commit
instead of the code that was compiled.

- `gh release create` now passes `--target ${{ github.sha }}`.
- A verification step afterwards resolves the tag and **fails the build** if it names any other
  commit, rather than publishing files nobody can trace.
- The release notes now carry a traceability table: release tag, version, source commit, workflow
  run, build date and workflow name.
- The stale heading `## What is new in 0.5.5` now reads `## What is new in $version` — it had been
  advertising 0.5.5 on every release since.
- The verification report is now published alongside the release.

Earlier tags are untouched.

---

## 4. Test totals

| | Checks |
|---|---|
| Suite before this release | 747 |
| Suite after | **771** |
| New AR/AP scenarios | +24 |

Nothing was removed and no expectation was weakened. The one test that had to change was a helper
in the new file that read `cn.id` where `postCreditNote` returns `creditNoteId` — a bug in the new
test's own cleanup, not a relaxation.

---

## 5. Verified again, unchanged

| Check | Result |
|---|---|
| Permission probe (6 roles × 4 apps × 63 routes) | 1,512 calls, 991 refusals, 0 leaks |
| Report reconciliation | 10/10 |
| Seller | 16/16 |
| Settings | 12/12 |
| General | 12/12 |
| 20 screens × 3 languages | 60 renders, 0 failures |

---

## 6. Known and deliberately not changed

**Inventory valuation differs from the inventory account by 0.38.** The valuation reports
59,184.36 where the inventory account holds 59,183.98. It was measured in the pristine, unmigrated
`genesis.db`, so no code path and no migration creates it — the seeded demonstration company was
loaded with product costs 0.38 above the movement history loaded beside them.

It is reported rather than corrected, because accounting data is never quietly rewritten. It does
not grow: after a sale of 1.25 units and a return of 0.25 were posted through the service, the gap
was measured again and was still exactly 0.38. Real transactions write the ledger and the stock
figures in the same transaction, at the same cost.

The reconciliation check prints the gap on every run and fails if it ever exceeds the seeded
variance, so a new disagreement cannot hide behind it.

## 7. Five runs, and what each one changed

The release was not reached in one attempt. Every failure is recorded here, because a build that
passes first time tells you nothing about what was wrong before it.

| Run | Outcome | What it proved / changed |
|---|---|---|
| 136 | failed | The suite crashed on the AR/AP fixture. Nothing published. |
| 137 | failed | Same crash. Its transcript was then made readable. |
| 138 | failed | Built and smoke-tested correctly, then **published nothing**. |
| 139 | **success** | v1.0.3 published, tagged `7c531ab`. |
| — | success | `attach-verification-report.yml` added the report. Built nothing. |

**Run 136 and 137 — a fixture that only fails on the real database driver.**

    RangeError: Too few parameter values were provided
        at makeInvoice (tests/ar-ap-payment-scenarios.test.js:134)

The statement inserts seventeen columns, ten of them bound: id, company, number, date, due date,
customer, subtotal, total, balance due and created-by. The call bound nine. Tax and discount are
hard-coded to zero in that fixture, so subtotal, total and balance due all carry the same amount —
which is how one of the three came to be left out.

It could not be found locally. This sandbox cannot compile `better-sqlite3`, so the tests run on
Node's built-in `node:sqlite` through a shim, and `node:sqlite` does not check: it binds NULL to
the gap and carries on. All 24 checks passed here and the suite crashed the moment it met the real
driver.

The shim now counts parameters the way `better-sqlite3` does and throws the same `RangeError` — too
few, too many, missing or unexpected named parameter — with string literals and comments blanked
first, so a question mark inside `'...'` is not counted as a parameter. The check is applied in
`run()`, `get()` and `all()`. The whole suite was re-run beneath it: **771 checks, 0 failed, and no
other file in the repository binds the wrong number of values.** The generator of the shim
(`make-sqlite-shim.sh`, which is tracked) carries the same change, so the next sandbox reset cannot
restore the forgiving version.

**Run 137 — making a Linux failure readable.** A failing job on this repository was a closed book:
the log lives in GitHub's log service, which cannot be reached from anywhere but a browser. The
installer job already committed its transcript to `ci-logs/`; the tests job did not, and the tests
job is the one that runs the suite against the real database driver. It does now, with `if:
always()` so a passing run leaves the same evidence.

**Run 138 — a complete build that published nothing.** Every real step passed, including the
30-check smoke test of the installed application. The step that commits screenshots back to the
branch was then rejected as a non-fast-forward, because the branch had moved during the half-hour
build. It failed, and the two steps behind `if: success()` — the portable upload and the release —
were skipped. A run that had done all of its work shipped none of it, because a *record* of the
work could not be committed.

`push-branch.sh` now retries on top of the branch as it stands and, failing that, says so and exits
0. All three steps that commit to the branch use it. A record of a build can no longer cancel the
build.

**Run 139 — the release.** `v1.0.3`, tagged `7c531ab80f02c4b68cdda8ba432a1309049c97bf`, which is
exactly the commit the installer was built from; the workflow resolves the tag and fails the build
if it names any other. Publishing left 1.0.2 and 1.0.1 byte-for-byte unchanged.

**Attaching the report.** Asset uploads cannot be made from the development environment, and the
installer workflow ignores `*.md` — correctly, since a push that rebuilt the installer would
invalidate every checksum the report quotes. A small workflow of its own now attaches it: it
compiles nothing, refuses to create a release that does not exist, and is triggered by a change to
the report itself. Pushing the report ran it and left the installer binary untouched.

---

CREATED AND DEVELOPED BY KAYIGANWA JACQUES
