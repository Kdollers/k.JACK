# Downloading and installing JENESIS on Windows

Everything you need to run JENESIS on a Windows PC, with direct download links.

**Application:** JENESIS 1.0.0 — double-entry accounting for SMEs
(double-entry journals, GL, sales/purchase invoices, receipts, payments, credit
notes, inventory, customers/suppliers, cash/bank/mobile money, AR/AP, trial
balance, P&L, balance sheet, cash flow, multi-company, multi-currency with
period-end FX revaluation, audit trail, backup/restore, English / Français /
Ikinyarwanda) **plus the new Light Mode, Dark Mode and System Default theme
system**.

---

## 1. What you get

| File | What it is | Size | SHA-256 |
|---|---|---|---|
| `JENESIS-Setup-1.0.0.exe` | **Windows installer** (NSIS). Installs JENESIS, creates Desktop and Start-menu shortcuts, and an uninstaller. | see below | see below |
| `JENESIS-Portable-1.0.0.zip` | **Portable package** — the same application, no installation needed. Unzip and double-click `JENESIS.exe`. Useful on a locked-down PC or a USB stick. | see below | see below |
| `*.sha256` | Checksum for each file above, so you can prove the download is intact. | — | — |

Both files are built by GitHub Actions from this exact commit and are the same
build that was smoke-tested (see §6). Neither contains tests, source maps,
development tooling or the sandbox-only database adapter — the packaged
application is checked for that on every build (`scripts/verify-package.cjs`).

---

## 2. Direct download links

### Recommended — GitHub release (permanent, no sign-in needed)

- **Installer:**
  <https://github.com/Kdollers/k.JACK/releases/download/v1.0.0/JENESIS-Setup-1.0.0.exe>
- **Portable ZIP:**
  <https://github.com/Kdollers/k.JACK/releases/download/v1.0.0/JENESIS-Portable-1.0.0.zip>
- **All files for this version:**
  <https://github.com/Kdollers/k.JACK/releases/tag/v1.0.0>

### Alternative — build artifacts of the workflow run

If you prefer the files exactly as the build job produced them:

1. Open <https://github.com/Kdollers/k.JACK/actions/runs/RUN_ID>
2. Scroll to the bottom, **Artifacts** section
3. Download **`JENESIS-Windows-installer`** (the `.exe` and its `.sha256`) or
   **`JENESIS-Portable`** (the `.zip` and its `.sha256`)

Artifacts require being signed in to GitHub and are kept for 90 days; the
release above does not expire.

---

## 3. Verify what you downloaded (optional but recommended)

The exact checksums of this build are printed in the table in §7 and are also
attached to the release as `JENESIS-Setup-1.0.0.exe.sha256`. To check a file on
Windows, open the folder in File Explorer, type `cmd` in the address bar… — or
simply use PowerShell from the folder's context menu:

```powershell
certutil -hashfile JENESIS-Setup-1.0.0.exe SHA256
```

The value must match the SHA-256 in §7 / in the `.sha256` file.

---

## 4. Installing on Windows (no command prompt, no code)

1. Download `JENESIS-Setup-1.0.0.exe` from the link above.
2. **Double-click** the downloaded file.
3. Windows SmartScreen may say *"Windows protected your PC"* because the
   installer is not code-signed. Click **More info → Run anyway**.
   (Nothing is wrong with the file; signing certificates are not configured for
   this project yet.)
4. The JENESIS setup wizard opens:
   - accept the license,
   - keep the proposed folder, or choose another one,
   - click through the remaining screens.
5. When it finishes, **JENESIS** is on your Desktop and in the Start menu.
   Tick "Run JENESIS" if you want it to start immediately.

### First launch

1. Start **JENESIS** from the Desktop shortcut.
2. The **setup screen** appears once: company name, and the first
   administrator's name, username and password (at least 10 characters).
   There are no default accounts — the account you create is the only way in.
3. Sign in.
4. Set up the basics under **Settings**: company details, chart of accounts,
   taxes, users and roles, currencies (only if you trade in foreign currency).
5. Choose your language in the top bar (English / Français / Ikinyarwanda).
6. Choose **Settings → Appearance**: **Light Mode**, **Dark Mode** or
   **System Default** (follows Windows). The sun/moon switch in the header
   changes it at any time; it applies everywhere instantly and is remembered.

### Portable package

Unzip `JENESIS-Portable-1.0.0.zip` and double-click **`JENESIS.exe`**.
Nothing is written to Program Files; your data still goes to
`%APPDATA%\JENESIS` (see §5), so the portable build and the installed build
share the same company data. To "uninstall", delete the folder.

### Requirements

Windows 10 or Windows 11, 64-bit. About 400 MB of disk space. No other software
is needed — the accounting service, the database and the interface are all
included and run locally; JENESIS works without an internet connection.

---

## 5. Where your data lives, and how to back it up

| What | Where |
|---|---|
| **Database** | `C:\Users\<you>\AppData\Roaming\JENESIS\genesis.db` |
| Automatic and manual backups | `C:\Users\<you>\AppData\Roaming\JENESIS\backups\` |
| Application log | `C:\Users\<you>\AppData\Roaming\JENESIS\logs\desktop.log` |

(`AppData` is a hidden folder: paste `%APPDATA%\JENESIS` into the File Explorer
address bar to open it.)

**Backing up — the easy way (recommended):** in JENESIS open
**Settings → Backup**, and use **Download backup**. That writes a complete,
verified copy of the database. **Restore backup** asks for your password and
first keeps a copy of the current database, so a restore can be undone.

**Backing up — the manual way:** close JENESIS, then copy the whole
`%APPDATA%\JENESIS` folder to an external drive or cloud folder. Copying
`genesis.db` while JENESIS is running can catch a half-written file — use the
in-app backup for daily use, and the folder copy for a full snapshot.

**Your data is safe with this build:**
- Installing never deletes or resets an existing database.
- Updating (installing a new version over an old one) keeps
  `%APPDATA%\JENESIS\genesis.db`; every schema upgrade takes a `pre-migration`
  backup first.
- **Uninstalling keeps your business data**: the program is removed, the
  database folder is not (verified by the smoke test).
- Upgrading from an older **GENESIS** installation: JENESIS **copies**
  `%APPDATA%\GENESIS\genesis.db` into `%APPDATA%\JENESIS\genesis.db` on first
  launch and verifies the copy. The old file is left untouched. It looks for
  `Adopted the existing database from …` in `desktop.log`.

---

## 6. What was tested on this build — and what was not

**Executed and passed** (GitHub Actions, run RUN_ID):

| Check | Result |
|---|---|
| Full automated suite (Linux, real SQLite driver) | **203 checks, 0 failed** |
| Theme rules: Light/Dark/System, immediate switching, persistence, first-paint, tokens, contrast, Electron bridge | **32 checks passed** |
| Theme UI rendered with React (options, icons, accessible names, en/fr/rw, stored preference, fallback) | **6 checks passed** |
| Production build (Vite) | **success** (app 437 kB + React 135 kB + icons 32 kB) |
| Packaged-application verification (no test code, no bundled database, SQLite binary present) | **success** |
| Installed-application smoke test on a clean Windows Server 2022 VM | **18/18 PASS** |

The 18 installed-application checks: silent install → shortcuts → starts from
the executable with no manual server or terminal → backend on loopback only →
no external browser → unauthenticated requests refused → first-run setup →
sign-in → balanced journal entry → trial balance balanced → backup export →
graceful shutdown (all processes exit) → relaunch, data persists → backup
restore keeps a pre-restore copy → clean close → **the installed build ships
both themes** → silent uninstall keeps the business database.

**Not executed — please read:**

- **The installer has never been run on a physical Windows PC.** It was
  installed, launched and used by an automated script on a GitHub-hosted
  Windows Server 2022 virtual machine. Real PCs differ (antivirus, SmartScreen,
  GPU/driver behaviour, user account control).
- **Neither theme has been looked at by a human or a browser.** The build
  environment has no display, so the themes were verified by measurement
  (122 text/background pairs, all ≥ 4.5:1 contrast in both themes; every colour
  class in the interface audited) and by checking that the installed package
  really contains the theme code — not by eye. Spend two minutes in both
  themes after installing.
- **The installer is unsigned**, so Windows SmartScreen will warn until a code
  signing certificate is configured.
- Not covered: printing on a physical printer, Playwright end-to-end tests
  (no browser in the build environment), and a live upgrade of a database
  created by an installed GENESIS build on Windows (covered by 11 unit tests on
  copies instead).

If anything looks wrong after installing, `%APPDATA%\JENESIS\logs\desktop.log`
is the first place to look.

---

## 7. Files and checksums of this build

| File | Size (bytes) | SHA-256 |
|---|---|---|
| `JENESIS-Setup-1.0.0.exe` | SIZE_EXE | SHA_EXE |
| `JENESIS-Portable-1.0.0.zip` | SIZE_ZIP | SHA_ZIP |

Built by GitHub Actions run **RUN_ID** from commit COMMIT_SHA on branch
`arena/a2c625e8-k-jack`.
