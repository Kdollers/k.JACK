# JEN 0.5.1 — Release notes (corrected build)

**Release name:** JEN 0.5.1 &nbsp;·&nbsp; **Version:** 0.5.1 &nbsp;·&nbsp; **Git tag:** `v0.5.1`
**Branch:** `arena/a2c625e8-k-jack`
**Date:** 30 October 2026

JEN 0.5.1 is **the correction of JEN 0.5**, not a new program. It is the same
JENESIS, the same database, the same accounting engine and the same three
applications. One defect was repaired and the way the application is tested was
changed so that this class of defect can never be shipped again.

> **JEN 0.5 is left untouched.** Its release page, its installer and its
> checksums are still there and still valid. JEN 0.5.1 is a new release next to
> it.

---

## 1. The defect: all three applications could open a white window

**What you saw.** After installing JEN 0.5 and opening JENESIS Seller,
JENESIS Maintenance or JENESIS Admin, the window opened and stayed completely
white.

**What was really happening.** The application is two parts: a small local
service and the interface it serves to the window. The service started
perfectly — which is why the installer, the shortcuts and the database all
looked right. The interface, however, was served from **inside `app.asar`, the
packed application archive, and from nowhere else**. Whenever that copy could
not be read by the service process, the start page arrived without its
JavaScript and CSS files, nothing was drawn, and nothing was recorded in any
log. All three applications share that start-up path, which is exactly why all
three failed the same way.

**Why the previous tests did not catch it.** The 293 automated checks and the
18/18 installed-application checks were real, but they only ever *asked the
service questions* (health, setup, sign-in, a journal entry, a backup). None of
them ever asked: *is the interface actually served, and does the window show
something?* A build can pass every one of those checks and still show a white
screen.

---

## 2. What was repaired

| # | Repair | Where |
|---|---|---|
| 1 | The interface is shipped **twice**: as a real `resources\app-frontend` directory (used first, readable by any process) and inside `app.asar` (fallback). | `package.json` → `build.extraResources`, `electron/dist-location.cjs` |
| 2 | The desktop shell **verifies the interface before it shows the window**: it fetches the start page and every file the page references, and it names any file that is missing. | `electron/main.cjs` → `verifyInterface()` |
| 3 | If a copy cannot be served, the shell **switches to the other copy automatically** and restarts the service with it. | `electron/main.cjs` → `ensureInterface()` |
| 4 | A **start-up guard** (`public/boot.js`) keeps a visible “Starting JENESIS…” card on screen, catches a file that fails to load, a script error, an unhandled rejection and a stalled start, and shows a translated message with the reason, *Try again* and *Copy details*. A blank window is now impossible to leave unexplained. | `public/boot.js`, `index.html` |
| 5 | The **saved Light/Dark theme is painted again** before the first frame. It used to be an inline script in `index.html`, which the production Content-Security-Policy (`script-src 'self'`) blocks — it is now a file of its own, which the policy allows. | `public/boot.js`, `server/security.js` |
| 6 | A crash inside the interface shows a **translated error screen** with the reason instead of an empty document. | `src/components/AppCrashScreen.jsx`, `src/App.jsx` |
| 7 | The interface **reports every start-up stage to the log** (`%APPDATA%\JENESIS\logs\desktop.log`), including success, so a failed start can always be read afterwards. | `electron/preload.cjs`, `electron/main.cjs`, `src/main.jsx` |
| 8 | A window that loads but never starts is **detected and retried** (25 s watchdog), and a lost renderer is recorded. | `electron/main.cjs` |
| 9 | **19 new automated checks** guard all of the above, and the installed-application test now checks the interface files, the **pixels of the window** and the start-up report. | `tests/production-boot.test.js`, `scripts/verify-package.cjs`, `scripts/smoke-test-installed.ps1` |

Nothing was removed to make this possible: no feature, no screen, no report,
no table, no translation, and no compatibility path. The database file
`genesis.db`, the desktop handshake id `genesis-accounting`, the password salt
and the storage keys are untouched.

---

## 3. What you can download

| File | What it is | Size | SHA-256 |
|---|---|---|---|
| `JEN 0.5.1 Setup.exe` | **Windows installer** — installs JENESIS and creates the three shortcuts (Seller, Maintenance, Admin) | 92,919,376 bytes (88.6 MB) | `8dfa6e9f6a0de6a76aad06524862ac1621155896cb86a4c23b34e5a79d1ada26` |
| `JEN 0.5.1 Portable.zip` | **Portable build** — unzip and double-click `JENESIS.exe`, nothing installed | 133,576,615 bytes (127.4 MB) | `5c892f8e58623acc96c80a197b874e05a3961bc1724ebfb290b0ec8b5c04787f` |
| `JEN 0.5.1.zip` | **Source-code backup** — every tracked file of the project | 5,630,489 bytes (5.4 MB) | in `JEN 0.5.1.zip.sha256`, next to the download |

These are the files of **GitHub Actions run 41124091931, commit
`6bc7338e7afbe2f9abf8e0b36cd2b1c85e0f7de5`** — the build in which the three
applications are also opened from their own desktop shortcuts. Every later push republishes the
release with new checksums, so the `.sha256` file beside each download always
carries the one that belongs to the file you are getting.

Direct links:

- Installer — <https://github.com/Kdollers/k.JACK/releases/download/v0.5.1/JEN.0.5.1.Setup.exe>
- Portable — <https://github.com/Kdollers/k.JACK/releases/download/v0.5.1/JEN.0.5.1.Portable.zip>
- Source backup — <https://github.com/Kdollers/k.JACK/releases/download/v0.5.1/JEN.0.5.1.zip>
- All files of this release — <https://github.com/Kdollers/k.JACK/releases/tag/v0.5.1>

Every download has a `.sha256` file beside it. Check one on Windows with:

```
certutil -hashfile "JEN 0.5.1 Setup.exe" SHA256
```

and compare with the content of `JEN 0.5.1 Setup.exe.sha256`.

---

## 4. Installing and opening the three applications

1. Download **`JEN 0.5.1 Setup.exe`**.
2. Double-click it. Windows SmartScreen may say *“Windows protected your PC”*
   because the installer is not code-signed: choose **More info → Run anyway**.
3. Follow the installer (Next → Install). No command prompt, no code.
4. Three shortcuts appear on the Desktop and in the Start menu:
   **JENESIS Seller** (red J), **JENESIS Maintenance** (green J),
   **JENESIS Admin** (blue J).
5. Open **JENESIS Admin** first. On a new installation it asks for the company
   name, your name, a username and a password — **you create the sign-in; there
   is no default account**. Later, other users are created in
   Settings → Users.
6. Each application keeps its own colour, icon and Light/Dark theme, and all
   three work on the **same** set of records.

If anything goes wrong, `%APPDATA%\JENESIS\logs\desktop.log` now explains what
happened, and the window shows a message instead of a blank screen.

---

## 5. Your data

- Installation **adopts** an existing JENESIS database, backs it up first and
  never resets it.
- The **uninstaller keeps your business database** — it is stored in
  `%APPDATA%\JENESIS`, not in the installation folder.
- A database left by the older GENESIS brand is **copied, not moved**: the
  original file is left where it was.
- No change in this release touches the accounting engine, the tables or the
  records.

---

## 6. What was tested on this build

Measured on GitHub Actions run **41124091931** (Ubuntu 22.04 and Windows
Server 2022 runners), commit `6bc7338`:

| Check | Result |
|---|---|
| Full automated suite (real SQLite, whole project) | **312 checks, 0 failed** |
| New production start-up suite (start-up guard, CSP, packaged interface location, shell verification, diagnostics) | 19 checks passed |
| Package verification (interface present twice, files non-empty, no tests or tooling inside the package) | passed |
| Installed application: **the start page and every file it references are served** | passed |
| Installed application: **the window shows real content, not a blank screen** (its pixels are captured and counted) | passed |
| Installed application: **the interface reports a successful start** and no start-up error is logged | passed |
| Installed application: silent install, three shortcuts, launch from the executable, **each of the three shortcuts opening its own application with a real interface**, all three running side by side on one company, first-run setup, sign-in, balanced journal entry, backup and restore, clean shutdown, relaunch with data intact, uninstall keeping the database | all passed (26 of 26) |

## 7. What is NOT verified

| Item | Status |
|---|---|
| Run on your physical HP Windows computer | **No** — verified on a GitHub-hosted Windows Server 2022 runner |
| Screenshots of the three applications | **Not possible** in this environment: there is no display. The window is verified by capturing and analysing its pixels instead |
| Messenger between two separate computers on a network | **Not proven** — the harness passes on one machine; run `scripts\messenger-two-computers.cjs --server http://<other PC>:3000 --user <name> --peer <name> --password <pw>` after enabling LAN access in Maintenance |
| Code signing | The installer is **unsigned**, so SmartScreen warns once |
| The installer being inspected byte-by-byte from the development sandbox | Not possible: this sandbox has no access to download the built files; the checksums on the release page are the ones GitHub computed when it published them |

---

## 8. How this build is produced

Every push to the branch runs `.github/workflows/windows-installer.yml`:

1. **Job 1 (Ubuntu 22.04)** — `npm run test:all`, counted by
   `scripts/count-checks.mjs`, then `npm run build`.
2. **Job 2 (Windows Server 2022)** — the suite again, then
   `npm run desktop:dist` (Vite build + electron-builder NSIS),
   `node scripts/verify-package.cjs release/win-unpacked`, then
   `scripts/smoke-test-installed.ps1`, which installs the application for real
   and drives it end to end.
3. SHA-256 checksums, the portable package and the source backup
   (`git archive`) are published to the release **JEN 0.5.1**.

The development sandbox cannot build the installer: `node-gyp` refuses to
cross-compile `better-sqlite3`, and electron-builder cannot download Electron
there. The Windows runner is the only place the installer is produced — which
is also why every claim above is measured there.

---

*Created and developed by KAYIGANWA JACQUES.*
