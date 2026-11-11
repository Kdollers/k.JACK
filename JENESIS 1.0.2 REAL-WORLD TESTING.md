# JENESIS 1.0.2 — Real-world testing procedure

**JENESIS** — created and developed by **KAYIGANWA JACQUES**.

This document is the procedure for testing JENESIS 1.0.2 on real hardware:
your HP laptop, a real printer, and two computers on a real network. **None of
what follows has been performed.** Every automated test in
`VERIFICATION RESULTS.md` ran in a Linux sandbox or on a GitHub-hosted Windows
runner; neither has a screen, a printer, or a second computer.

Read the two documents together:

| Document | What it is |
|---|---|
| **`JENESIS 1.0.2 REAL-WORLD TESTING.md`** (this one) | What to do, step by step, and what to write down |
| **`JENESIS 1.0.2 VERIFICATION RESULTS.md`** | What has already been tested automatically, what was found, what is still unknown |

**Before you begin — download the right file.**

| | |
|---|---|
| Installer | `JENESIS 1.0.2 Setup.exe` — 93,144,646 bytes |
| Portable | `JENESIS 1.0.2 Portable.zip` — 133,859,414 bytes |
| Source | `JENESIS 1.0.2.zip` — 6,546,939 bytes |

Release page: `https://github.com/Kdollers/k.JACK/releases/tag/v1.0.2`

Check the download before you run it, in PowerShell:

```powershell
certutil -hashfile "JENESIS 1.0.2 Setup.exe" SHA256
```

Expected: `8fcc2cdfef56157e940d55ab330a09f0fb5d543fab8ed191d44d15277642ad41`

---

## How to record a result

For every step below, write down:

1. **What you did** — the exact clicks, and the values you typed.
2. **What you expected.**
3. **What actually happened.**
4. **Pass / Fail / Odd-but-usable.**

For anything that fails or looks odd, add:
5. **A screenshot** (Windows: `Win + Shift + S`, then paste).
6. **The application's own log.** They are in
   `%APPDATA%\JENESIS\logs\` — take the whole folder if you can.

Two things matter more than the rest: **a blank white window**, and **a number
that is wrong**. A button in the wrong place is a nuisance; a number that is
wrong is a problem with the accounts.

---

## 1. Windows installation verification

Do this on the HP laptop. Estimated 30–45 minutes, including two restarts.

### 1.1 Before installing

- [ ] Note your Windows version (`Win + R`, type `winver`).
- [ ] Note whether any JENESIS is already installed. **If you have real
      business data, back it up first** — see §1.7.
- [ ] Close other applications.

### 1.2 The installer launches

- [ ] Double-click `JENESIS 1.0.2 Setup.exe`.
- [ ] **Expected:** Windows SmartScreen warns that the publisher is unknown.
      This is expected — the installer is unsigned. Choose **More info**, then
      **Run anyway**.
- [ ] Record: did the installer window appear? Was the JENESIS name and the
      **J** logo correct? (It must be a **J**. If you see a **G**, stop and
      report it — that is the wrong logo and must never ship.)

### 1.3 Installation completes

- [ ] Follow the installer. Accept the default location unless you have a
      reason not to.
- [ ] Record: did it finish without an error? Did it ask for a restart?
- [ ] If it failed, **do not retry blindly** — note the exact message.

### 1.4 Shortcuts

- [ ] Look at the Desktop. **Expected: four shortcuts**, each with its own
      colour and its own J logo:

  | Shortcut | Colour |
  |---|---|
  | JENESIS Seller | red |
  | JENESIS Network & Maintenance | green |
  | JENESIS Accounting & Business | blue |
  | JENESIS Settings & Access Point | yellow |

- [ ] Open the Start menu. **Expected:** a JENESIS folder with the same four.
- [ ] **Launch each of the four from the Desktop**, then again from the Start
      menu. Record whether each one opens.

### 1.5 No blank white screens

This is the single most important check. For each of the four applications:

- [ ] Launch it.
- [ ] **Expected:** the window shows the JENESIS interface — a coloured header,
      a menu, content. **Not** a white or blank window.
- [ ] If a window is blank: press `Ctrl + Shift + I` (or `F12`) to open the
      developer tools, click **Console**, and screenshot any red text. Then
      copy `%APPDATA%\JENESIS\logs\`.

### 1.6 Data persists across a restart

- [ ] Open JENESIS Accounting & Business. Create something you will recognise —
      a customer called `TEST PERSIST`, or a product `TEST PERSIST`.
- [ ] Close all JENESIS windows. **Restart Windows.**
- [ ] Reopen the same application.
- [ ] **Expected:** `TEST PERSIST` is still there.
- [ ] Record: did it survive? Also check that the two other things below
      survived, because they are stored separately:
  - Your chosen **theme** (dark/bright) — see §4.7.
  - Your chosen **language** — see §4.6.

### 1.7 Uninstallation

**Back up first if you have real data.** The uninstaller removes the program,
not your database, but a backup costs a minute.

- [ ] `Settings → Apps → Installed apps → JENESIS → Uninstall`.
- [ ] **Expected:** it completes and the four Desktop shortcuts are removed.
- [ ] After uninstalling, check these and record what is left:

  | Place | Expected |
  |---|---|
  | `C:\Program Files\JENESIS\` (or your chosen folder) | Removed |
  | Desktop shortcuts | Removed |
  | Start menu folder | Removed |
  | `%APPDATA%\JENESIS\` | **Kept** — this is your data and your settings |
  | `%APPDATA%\JENESIS\logs\` | **Kept** |
  | Your database | **Kept** |

  Anything left in the install folder, or any shortcut that survives, is a
  defect. **Your data being kept is correct, not a defect.**

---

## 2. Real printer verification

**Every step in this section requires physical hardware.** None of it has been
tested. What has been tested is described in `VERIFICATION RESULTS.md` §3.

### 2.1 Prepare

- [ ] Open **JENESIS Settings & Access Point → Printing**.
- [ ] Record: is the printer list populated? Does it show your printer?
- [ ] **Expected:** every printer Windows knows about, including ones that are
      off or out of paper. A printer shown greyed out with a reason is correct;
      a printer missing from the list is not.

### 2.2 Printer discovery, by connection type

| Type | What to check | Pass / Fail |
|---|---|---|
| **USB** | Plug in a USB thermal or A4 printer. Does it appear? | |
| **Network / Wi-Fi** | Does a network printer appear? | |
| **Offline printer** | Switch one off. Is it still listed, marked unavailable? | |
| **Default printer** | Is the Windows default marked as such? | |

### 2.3 Paper sizes

For each size below: select it, print a test receipt, and hold the result up.

| Size | Check | Pass / Fail |
|---|---|---|
| **58 mm** | Print a test receipt. Does the text fit the roll? Is anything cut off at the right edge? | |
| **80 mm** | Same. Is the extra width used, or is the text still 58 mm wide? | |
| **A4** | Print a test. Does it come out on A4 as a document rather than a narrow strip? | |
| **Custom** | Enter a custom width. Does it take effect? | |

- [ ] Record the **measured** width of the printed area for 58 mm and 80 mm.

### 2.4 Appearance

In **Settings → Printing**, change each of these, print, and compare:

- [ ] **Font size** — does it get bigger/smaller on paper?
- [ ] **Font family** — does it change?
- [ ] **Margins** — does the text move in from the edges?
- [ ] **Line spacing** — do the lines move apart?
- [ ] **Logo** — toggle it on and off. Does it appear/disappear, and is it
      positioned sensibly (not overlapping the business name)?
- [ ] **Business name** — does yours print?
- [ ] **Address, telephone, email** — do they print?
- [ ] **Receipt title** — change it. Does the new title print?
- [ ] **Footer message** — change it. Does it print at the bottom?
- [ ] **Transaction details** — switch fields off. Do they disappear from the
      paper?

### 2.5 The hard cases — these matter most

Print a receipt containing each of these and check the paper:

- [ ] **A decimal quantity** — e.g. sell **1.25 kg**. Does the paper say
      `1.25` and not `1` or `1.3`?
- [ ] **A negative line** — return **0.5 kg**. Does it print as `-0.5`?
- [ ] **Decimal money** — an amount like **10.75**. Correct on paper?
- [ ] **French text** — switch the language to French, print. Do the accented
      characters (`é`, `è`, `à`, `ç`) print correctly, or as boxes/question
      marks?
- [ ] **Kinyarwanda text** — switch to Kinyarwanda, print. Same question.
- [ ] **A long receipt** — 30+ lines. Does it all print, or is the end cut off?
- [ ] **Repeated printing** — print the same receipt five times. Are all five
      identical?

### 2.6 Preview versus paper

- [ ] Open the **print preview**. Compare it side by side with the paper.
- [ ] Record any difference in: alignment, text size, whether it fits the
      width, and where the logo sits.
- [ ] From the preview, go back to settings, change something, and preview
      again. Does the change appear?

### 2.7 Printing must not touch the accounts

This one is automated in the test suite but is worth doing once by hand:

- [ ] Note the total on the **Trial Balance** (`Reports → Trial Balance`).
- [ ] Print ten receipts.
- [ ] Re-read the Trial Balance.
- [ ] **Expected:** identical, and still balanced. If printing changed any
      figure, that is a serious defect — report it immediately.

---

## 3. Two-computer LAN verification

**Requires two Windows computers on the same network.** This has never been
tested; the automated suite runs two services on one machine, which is not the
same thing.

### 3.1 Prepare

- [ ] Install JENESIS on **both** computers (or use the portable build on the
      second).
- [ ] Confirm both are on the same network and can see each other
      (`ping` the other machine's address).
- [ ] On the computer that will **serve**, open **JENESIS Network &
      Maintenance** and turn the network service **on**. It is opt-in — it does
      not run unless you switch it on.

### 3.2 Discovery and connection

- [ ] On the second computer, open Network & Maintenance.
- [ ] **Expected:** the first computer appears in the list, with its address.
- [ ] Press **Test**. **Expected:** it reports the computer as answering.
- [ ] Press **Connect**.
- [ ] Record: what address did you connect to? Did it connect first time?

### 3.3 Messenger

- [ ] Send a message from computer A to computer B.
- [ ] **Expected:** it arrives on B. How long did it take?
- [ ] Send one from B to A.
- [ ] Send a message containing French accents and Kinyarwanda text. Do they
      arrive intact?

### 3.4 Unread notifications

- [ ] With B **closed**, send two messages from A.
- [ ] Open B. **Expected:** an unread count of 2, which clears once read.

### 3.5 Message history

- [ ] Close and reopen both applications.
- [ ] **Expected:** the conversation is still there, in order.
- [ ] Restart Windows on one machine. Is the history still there?

### 3.6 Disconnection and reconnection

- [ ] While connected, **turn off Wi-Fi** on B (or unplug the cable).
- [ ] **Expected:** B says it is disconnected, and does **not** freeze or show
      a blank window.
- [ ] Turn Wi-Fi back on.
- [ ] Press **Reconnect**. **Expected:** it reconnects and the history is
      intact.

### 3.7 Authorised access only

- [ ] From a computer that has **not** been connected, try to reach the
      served computer's data.
- [ ] **Expected:** it cannot. Record what happens.
- [ ] Confirm the service is off by default on a fresh install.

---

## 4. Complete application interface inspection

Work through all four applications. Estimated 1–2 hours.

### 4.1 Navigation

For each application:
- [ ] Every item in the left menu opens a screen.
- [ ] No item leads to a blank window.
- [ ] The application offers **only** its own screens. In particular,
      **Network & Maintenance must not offer any accounting, sales, purchase
      or stock screen.**

### 4.2 Buttons

- [ ] Click every button on every screen.
- [ ] Record any that do nothing, throw an error, or do something other than
      their label says.

### 4.3 Forms

For every form:
- [ ] Type into every field.
- [ ] Try to save with a required field empty — **expected:** a clear message
      naming the field, not a silent failure.
- [ ] Enter a **decimal** quantity (1.25) and a **negative** one where allowed
      (−0.5). Both must be accepted.
- [ ] Enter text where a number belongs — **expected:** a sensible refusal.

### 4.4 Tables

- [ ] Do the columns line up with their headings?
- [ ] Sort a column. Does it sort?
- [ ] Scroll a long list.
- [ ] With an empty list, does it say so rather than showing nothing?

### 4.5 Help

- [ ] Open **Help** in each of the four applications.
- [ ] **Expected:** each shows **its own** guide — the Seller sees the Seller
      guide, the Admin sees the Admin guide, and so on. You should never be
      asked which guide you want.
- [ ] **Expected:** the Seller's guide contains **no** accounting instructions.
- [ ] **Expected:** every guide ends with the credit to
      **KAYIGANWA JACQUES**.
- [ ] Read a section and follow it. If any instruction does not match what the
      program actually does, note the section and the mismatch.

### 4.6 Language switching

- [ ] Switch to **French**. Every label should change. Note any that stay in
      English.
- [ ] Switch to **Kinyarwanda**. Same check.
- [ ] Switch back to English.
- [ ] **Expected:** no untranslated English anywhere.

### 4.7 Dark and bright mode

- [ ] Switch to **Dark**. Look at every screen.
- [ ] Switch to **Bright**. Look at every screen.
- [ ] Record any text that is hard to read against its background, and any
      element that disappears.
- [ ] Close and reopen — is the choice remembered?
- [ ] **Each application remembers its own theme.** Setting Dark in Seller must
      not change Admin.

### 4.8 Printer settings

- [ ] Settings → Printing, as §2.
- [ ] Change the layout in **Seller**, then open **Settings** (the yellow
      application) and check its layout. **Expected: they are separate** — the
      Seller's 58 mm roll must not overwrite the Admin's 80 mm layout.

### 4.9 Permissions

- [ ] Sign in as a **Seller**. **Expected:** the Seller's own screens only; no
      accounting, no user management.
- [ ] Try to reach an accounting function anyway. **Expected:** refused.
- [ ] Sign in as an **Admin**. **Expected:** everything.

### 4.10 Error messages

- [ ] Force a few errors: save an incomplete form, search for something that
      does not exist, post an unbalanced journal entry.
- [ ] **Expected:** each gives a message that says what is wrong in plain
      language. Record any that are blank, in English only when the interface
      is French, or that show a raw code.

---

## 5. Accounting and inventory scenarios

These are the scenarios run automatically and reported in
`VERIFICATION RESULTS.md` §2. Do them once by hand as well, because the
automatic version uses synthetic data and yours is real.

**Work on a copy of your data, not your live books.**

For each scenario: record the figures before, do it, then read the reports.

| # | Scenario | The number to check |
|---|---|---|
| 1 | Buy **10.5 kg** at **10.3333** per kg | Stock rises by exactly 10.5 |
| 2 | Sell **1.25 kg** | Stock falls by exactly 1.25 |
| 3 | Return **0.5 kg** as a negative sale line | Stock rises by exactly 0.5 |
| 4 | Raise a credit note for **0.25 kg** | Stock rises by exactly 0.25 |
| 5 | Refund a customer **10.75** | The bank falls by exactly 10.75 |
| 6 | Pay a supplier **50 more** than the bill | The supplier goes to **−50** in AP ageing |
| 7 | Receive **30 more** from a customer than the invoice | The customer goes to **−30** in AR ageing |
| 8 | Adjust stock by **−0.1 kg** (spillage) | Stock falls by exactly 0.1 |
| 9 | Read **Inventory valuation** | The rows add up to the total printed |
| 10 | Read **AR ageing** | It agrees with each customer's balance |
| 11 | Read **AP ageing** | It agrees with each supplier's balance |
| 12 | Read **Profit & Loss** | Revenue − COGS − Expenses = Net profit |
| 13 | Read **Balance Sheet** | Assets = Liabilities + Equity |
| 14 | Read **Trial Balance** | Debits = Credits, exactly |

After all fourteen, read the **Trial Balance** again. It must still balance,
and the entries that were there before must be unchanged — a correction adds a
new entry, it never edits an old one.

---

## 6. Deliverables

| # | Deliverable | Where |
|---|---|---|
| 6.1 | Real-world testing checklist | This document |
| 6.2 | Tests that can be automated | `VERIFICATION RESULTS.md` §4 |
| 6.3 | Tests requiring physical hardware | `VERIFICATION RESULTS.md` §5 |
| 6.4 | Defects discovered and corrected | `VERIFICATION RESULTS.md` §2 |
| 6.5 | Remaining limitations | `VERIFICATION RESULTS.md` §6 |
| 6.6 | Installer instructions for the HP laptop | §1 above |

---

Created and developed by **KAYIGANWA JACQUES.**
