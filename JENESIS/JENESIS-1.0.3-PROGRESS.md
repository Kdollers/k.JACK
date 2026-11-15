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

---

CREATED AND DEVELOPED BY KAYIGANWA JACQUES
