# JEN 0.5.3 — Release notes (corrected build)

**Release name:** JEN 0.5.3 · **Version:** 0.5.3 · **Git tag:** `v0.5.3`
**Branch:** `arena/a2c625e8-k-jack`
**Date:** 1 November 2026

JEN 0.5.3 is **the correction of JEN 0.5.2**, not a new program. It is the same
JENESIS, the same database, the same accounting engine and the same three
applications. Three defects reported after testing the installed application
were repaired, and two of them are now covered by tests that run before every
build.

> **JEN 0.5, JEN 0.5.1 and JEN 0.5.2 are left untouched.** Their release pages,
> installers and checksums are still there and still valid. JEN 0.5.3 is a new
> release next to them. **Install JEN 0.5.3**: 0.5.2 carries the Profit & Loss
> and Balance Sheet fault described below.

**Download:** https://github.com/Kdollers/k.JACK/releases/tag/v0.5.3

---

## 1. The defects

### 1.1 Profit & Loss and Balance Sheet stopped the interface

**What you saw.** Opening *Profit & Loss* or *Balance Sheet* left the report
area blank, or replaced the whole window with *“JENESIS could not display this
screen …”*. Because that screen replaces the **entire interface**, every other
screen looked broken at the same time until the application was restarted —
which is why Inventory appeared to be faulty too (see §1.4).

**What was really happening.** `src/views/ReportsView.jsx` kept the answer of
the previously open report in memory while the new one was being fetched. It
then read `revenueRows` (a Profit & Loss field) and `assets.current` (a Balance
Sheet field) from a payload that was still a **trial balance**, which has
neither, and threw. A slow answer, or a quick click on the tab, was enough.

**What was repaired.**

* the previous answer is **cleared before a new one is asked for**, so the
  screen can never be drawn with another report's figures;
* every report answer is now **tagged by the server** with the report it
  belongs to (`report: 'trial_balance' | 'pnl' | 'balance_sheet' | 'cash_flow' | 'tax'`),
  and the screen **refuses an answer that belongs to another report**;
* every list and every figure is read through one shared rule
  (`src/reportShapes.js`), so a missing list yields an empty list and never
  `undefined.map(…)`;
* when a period really has no figures, the screen **says so** — “no figures for
  this period” — instead of leaving a blank page that looks like a failure.

### 1.2 The Profit & Loss figure was wrong when other income existed

Revenue of the “other” kind (interest received, a gain on a disposal) was being
counted as **operating revenue**, and other expenses as **operating expenses**.
They are now separate lines, and the report shows the **operating profit** the
business earned before them:

```
gross profit        = revenue − cost of sales
operating profit    = gross profit − operating expenses
net profit          = operating profit + other income − other expenses
```

New labels for the three sections in English, French and Kinyarwanda.

### 1.3 The header advertised the wrong keys

The calculator button was labelled `Ctrl+Shift+C`. Those keys open
**Customers** — and they also close an open calculator. The calculator is
`Ctrl+Shift+K`. The Messenger button was labelled `Ctrl+K` instead of
`Ctrl+Shift+M`. So the keys printed on the button were never the keys that
opened the tool.

Both labels are now read out of the single shortcut list
(`comboFor()` in `src/shortcuts.js`), so a label can no longer drift away from
the keys that really work, and a test fails on any header tooltip that spells
out its own key combination.

### 1.4 Inventory — reported, not reproduced

Inventory was reported as “not working” on 0.5.2. On this build it was tested
and **no fault was found in it**:

* all seven of its endpoints (`/api/products`, `/api/inventory/warehouses`,
  `stock-levels`, `movements`, `valuation`, `transfers`, `counts`) answer 200
  against a real database with the seeded company records;
* the screen renders without error;
* no component is drawn without being imported.

The most likely explanation is §1.1: the report crash replaces the whole
interface, so Inventory was showing the crash screen produced by Reports. That
remains **an unconfirmed explanation, not a proven one.** If Inventory still
shows an error on this build, the message on the screen and the diagnostic
reference identify it exactly — please send either.

---

## 2. What is new in the test suite

| Suite | Checks | What it covers |
|---|---|---|
| `tests/reports-screens.test.js` (new) | 13 | The rule that a report is only drawn with its own answer — including the exact mix that crashed — and the figures themselves against a real database with posted entries: the totals, the date filters, Assets = Liabilities + Equity, and the other-income split. |
| `tests/screens-render.test.js` (new) | 20 | All twelve screens, plus the shared header, sidebar, calculator and shortcut reference, are **drawn with React itself** (esbuild + `react-dom/server`, already installed for the build) and must not throw. This is the class of defect that makes a screen “not work”. |
| `tests/shortcuts.test.js` | +1 | A button that names its shortcut must name the one the list really uses. |
| `tests/desktop-backend.test.js` | fixed | The “binds only to loopback” check compared the backend, up for a second, against a control server up for a few milliseconds. On a host that exposes listening ports through a proxy that difference alone failed the check. The control is now polled for the same grace period, and the check stands down — with a note — when the host cannot tell the two bindings apart. |

**Whole suite: 356 checks, 0 failed, 22 suites** (measured on this commit).

Suite before this work: 321 checks, 0 failed, 20 suites.

---

## 3. What you can download

| File | What it is |
|---|---|
| `JEN 0.5.3 Setup.exe` | The Windows installer. Creates the three shortcuts (Seller, Maintenance, Admin) on the Desktop and in the Start menu. |
| `JEN 0.5.3 Portable.zip` | The same application without installing: unzip, then double-click `JENESIS.exe`. Data still goes to `%APPDATA%\JENESIS`. |
| `JEN 0.5.3.zip` | The complete source code of this release (tracked files only). |
| `*.sha256` | One checksum file next to each download. |

| File | Size | SHA-256 |
|---|---|---|
| `JEN 0.5.3 Setup.exe` | 92,925,018 bytes (88.6 MB) | `977a822b855b3582715c7744f10c6b1908125100b31209cf894428cc588ac8a2` |
| `JEN 0.5.3 Portable.zip` | 133,580,903 bytes (127.4 MB) | `2049bec8526256532fa1a2558ddc1256ec8cdbc9717a9d09adb6d0e2e2d82501` |
| `JEN 0.5.3.zip` | 5,665,338 bytes (5.4 MB) | `633cd27ddc28ed7ee129b86c7a81b1a24df7b41c2401d3accff427df0fbba876` |

Built by GitHub Actions run **41278315678**, commit `199012d`, on the
`arena/a2c625e8-k-jack` branch: **356 automated checks passed**, and the
installed-application smoke test **27/27 PASS**.

The first two checksums are the ones the build wrote into its own
`download-table.md` and printed on the release page. The third (the source
backup) is reproduced here from the same commit with
`git -c core.autocrlf=true archive --format=zip HEAD ":(exclude)JENESIS/dist"`,
which produced a file of exactly the published size; the authoritative value
is the `JEN 0.5.3.zip.sha256` file shipped next to the download.

---

## 4. Installing and opening the three applications

1. Download `JEN 0.5.3 Setup.exe`.
2. If Windows shows **SmartScreen**, choose *More info → Run anyway*. The
   installer is unsigned; it is not infected.
3. Follow the installer. It creates three shortcuts:
   **JENESIS Seller** (red), **JENESIS Maintenance** (green) and
   **JENESIS Admin** (blue).
4. Open **JENESIS Admin** first — it is the application that offers accounting,
   reports and settings.
5. No command prompt, no PowerShell, no Node and no browser is involved.

If you already have JEN 0.5.2 installed, install 0.5.3 over it: **your database
is not touched** (uninstalling never deletes it either — verified by the
smoke test).

---

## 5. Your data

* The database lives in `%APPDATA%\JENESIS\`. It is **never** deleted, reset or
  overwritten by an installation, an upgrade or an uninstall.
* A backup is written before every migration.
* Use *Maintenance → Backup* in the application, or copy the folder, before any
  upgrade you are unsure about.

---

## 6. What is NOT verified on this build

Stated plainly, as with every previous release:

* **No run on a physical Windows PC.** Everything is verified on a GitHub-hosted
  Windows Server 2022 runner. The machine in your office has not been used.
* **No screenshots.** The runner has no display; the window is checked by
  capturing its pixels, not by looking at it.
* **The installer is unsigned**, so SmartScreen warns.
* **Messenger across two computers** is still unproven — it has never been run
  between two machines on a LAN.
* **Inventory** is reported faulty but not reproduced (§1.4).
* **Sign-in typed into the window** is attempted by the smoke test but has not
  yet been observed reaching the signed-in screen on any automated run. The run
  fails on any error the interface reports, but the key presses have never been
  proven to arrive.
* The `node:sqlite` shim used to run the suite in the Linux sandbox is
  **test-only** and is never packaged. The shipped application uses the real
  `better-sqlite3`.

---

## 7. How this build is produced

GitHub Actions, workflow `JENESIS Windows installer`:

1. Job *Test suite (Linux)* — the whole suite on a real SQLite database.
2. Job *Windows installer* — builds the NSIS installer, verifies the packaged
   folder, then **installs it and smoke-tests the installed application**:
   silent install, shortcuts, starting from the executable, the interface being
   served, a window with real content and not blank pixels, first-run setup,
   sign-in, a balanced journal entry, backup and restore, clean shutdown,
   relaunch with the data intact, and uninstall keeping the database.

The installer filename, the ZIP names, the release title, the tag and every
artefact name are all derived from `JENESIS/package.json` in one place, so a
corrected release can no longer be published under an older number (the two
artefact names that were still typed in by hand are now derived too).
