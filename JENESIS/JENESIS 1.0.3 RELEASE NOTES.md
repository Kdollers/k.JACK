# JENESIS 1.0.3 — Release Notes

**Four applications in one installation, sharing one database.**

**Install:** download `JENESIS 1.0.3 Setup.exe`, double-click it, accept the SmartScreen prompt
(More info → Run anyway), and follow the installer. **Four shortcuts** then appear on the Desktop
and in the Start menu, each with its own colour and icon — no command prompt needed.

**Portable:** `JENESIS 1.0.3 Portable.zip` runs without installing (unzip, then double-click
`JENESIS.exe`). Data is still kept in `%APPDATA%\JENESIS`, so the portable build and an installed
one can be alternated without moving anything.

---

## The four applications

| Shortcut | Colour | What it is for |
|---|---|---|
| **JENESIS Seller** | red | Selling: the dashboard, sales, customers and stock. No reports, no accounting. |
| **JENESIS Network & Maintenance** | green | Finding the other JENESIS computers, connecting to them, the service, backups, integrity and logs. No business screens at all. |
| **JENESIS Accounting & Business** | blue | The whole program: sales, purchases, inventory, banking, accounting and every report. |
| **JENESIS Settings & Access Point** | yellow | Configuration: the company, users and permissions, taxes, currencies and backups. |

All four open **the same company database**. The shortcuts only choose which face of the same
installation the window opens with.

---

## What is new in 1.0.3

### 1. Accounts Receivable and Accounts Payable are now correct

This is the reason for this release.

**The defect.** Recording a payment against a customer or supplier *without naming a document* —
the Banking form offers "None" for exactly this, and an overpayment or an opening balance
legitimately has nothing to be allocated to — reduced the party's balance correctly but left the
document open. The ageing report is built from the open documents, so it went on reporting the
full amount as owed.

In concrete terms: **a supplier paid 150.00 against a 100.00 bill** showed a balance of −50.00,
which is right, while the payables ageing still reported **100.00 outstanding**, which is wrong.
The bill would have looked unpaid forever, and the business would have looked like it owed money
to someone who owed it money.

**The correction.** The report is now answerable to the party's recorded balance. The difference
between what the open documents add up to and what the account says is treated as an unallocated
credit — or an opening balance brought forward — and it is shown in the **Current** bucket,
because money not tied to a document has no age.

Two properties follow, and both are now tested on every build:

- the ageing buckets add up to the row's total;
- the row's total is what the party's account actually says.

For data where every payment is allocated the difference is zero and **nothing changes**. The
correction only touches the case that was wrong.

**This fix is in 1.0.3 and was not in 1.0.2.** If you are running 1.0.2 and have ever recorded a
payment without naming a document, your ageing reports are overstating what is owed.

### 2. Every screen now speaks the language it is set to

The four Help guides named the applications in English in all three languages: French Help
described "JENESIS Seller" while every French screen called it **JENESIS Vendeur**, and
Kinyarwanda Help the same against **JENESIS Umucuruzi**. The guides appeared to describe a
different program from the one running.

All four application names are now translated in the French and Kinyarwanda guides, using the same
names the interface itself uses. English is unchanged. 66 occurrences across the two languages.

### 3. Releases can now be traced to the code they came from

Every release from v0.5.0 to v1.0.2 carried a tag that pointed at the repository's base commit
rather than at the code the installer was built from. The tag identified nothing: it could not tell
you which source produced the file you downloaded.

From 1.0.3 the tag is created **pinned to the exact commit that was built**, and the build fails if
it ends up naming any other commit. The release notes carry a traceability table naming the source
commit, the workflow run that built it, and the date.

Earlier tags are left exactly as they are — they are not rewritten. The commit each earlier release
was built from is stated in that release's own notes instead.

---

## Testing

| What | Result |
|---|---|
| Automated suite | **771 checks, 0 failed**, 42 suites |
| AR/AP payment scenarios (new in 1.0.3) | **24 checks, 0 failed** |
| Live permission probe | **1,512 HTTP calls, 991 refusals, 0 leaks** |
| Live report reconciliation | 10/10 |
| Live seller checks | 16/16 |
| Live settings checks | 12/12 |
| Live general checks | 12/12 |
| All 20 screens × 3 languages | 60 renders, 0 failures |

The AR/AP suite was verified to be a real regression test: with the correction removed, **11 of
its 24 checks fail**. It is not a test that passes either way.

See **JENESIS 1.0.3 VERIFICATION REPORT.md** for the complete results, including what was *not*
tested.

---

## Not verified — please read

- The installer is **unsigned**; Windows SmartScreen will warn.
- It has been verified on a **GitHub-hosted Windows runner, which is a virtual machine — not a
  physical PC**. Antivirus, SmartScreen behaviour, graphics drivers and User Account Control all
  differ on a real computer.
- **No printer has ever been used.** Receipt printing on 58 mm and 80 mm, A4 printing, and accented
  French and Kinyarwanda characters on paper are all untested.
- **Messenger between two separate physical computers is unproven.** Two services on one machine is
  not two computers.
- **Nobody has looked at the screens by eye.** The two themes have never been seen by a person.

The verification report lists all 20 of these individually, with the exact procedure to follow.

---

CREATED AND DEVELOPED BY KAYIGANWA JACQUES
