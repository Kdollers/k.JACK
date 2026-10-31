# JEN 0.5.2 — Release notes (corrected build)

**Release name:** JEN 0.5.2 · **Version:** 0.5.2 · **Git tag:** `v0.5.2`
**Branch:** `arena/a2c625e8-k-jack`
**Date:** 31 October 2026

JEN 0.5.2 is **the correction of JEN 0.5.1**, not a new program. It is the same
JENESIS, the same database, the same accounting engine and the same three
applications. One defect was repaired — the crash that appeared as soon as a
user signed in — and the way the project is built was changed so that this
class of defect can never be packaged again.

> **JEN 0.5 and JEN 0.5.1 are left untouched.** Their release pages, installers
> and checksums are still there and still valid. JEN 0.5.2 is a new release
> next to them. **Install JEN 0.5.2**, not 0.5.1: 0.5.1 carries the crash.

---

## 1. The defect: the interface stopped the moment a user signed in

**What you saw.** After signing in to JENESIS Admin (or Seller, or
Maintenance), the interface was replaced by *“JENESIS could not display this
screen … Your accounting records have not been changed.”* The program was
still running, the service was still answering, and the data was safe — but the
interface was gone.

**What was really happening.** The header of the application — the same header
in all three applications — draws the JENESIS Messenger button. In
`JENESIS/src/components/Navbar.jsx` that button was drawn with
`<MessageSquare … />`, and the file **never imported `MessageSquare`** from
`lucide-react`. The first time the browser met that name, it threw:

```
ReferenceError: MessageSquare is not defined
```

and the error boundary stopped the interface. The header is only drawn once a
user is signed in, which is exactly why everything looked right until that
moment, and why all three applications failed the same way.

**Why the previous tests did not catch it.** Two reasons, both now addressed:

1. **A missing import does not fail a build.** An unknown bare name is treated
   as a global reference, so `npm run build` and electron-builder produced the
   installer without a single warning. The defect could only be seen at run
   time.
2. **The installed-application test never got that far.** It signed in through
   the local API, which never draws the header, and it inspected the window
   while it was still on the sign-in screen. The crash happened one step later.

---

## 2. What was repaired

| # | Repair | Where |
|---|---|---|
| 1 | The header **imports the icon it draws**. This is the one-line fix that makes the interface work again. | `JENESIS/src/components/Navbar.jsx` |
| 2 | A new suite, **`tests/ui-imports.test.js`**, refuses to let any interface file draw a component it does not import, use an icon the package does not export, import a file that does not exist, or import a name the module does not export. Comments are stripped before the scan, the shared shell of the three applications is covered, and a self-test proves the checker still reports a missing import. | `JENESIS/tests/ui-imports.test.js` |
| 3 | **`npm run build` runs that gate first**, so an interface file with a missing import can no longer be packaged at all. `npm run test:all` runs it too. | `JENESIS/package.json` |
| 4 | `genesis:get-app-info` answers with **the application of the window that asked** (`modeOfWindow` over the sender) instead of the application that was opened last, so a second window is no longer told it is a different application than the one it is showing. | `JENESIS/electron/main.cjs` |
| 5 | The interface **reports the signed-in screen to the log** (`renderer: signed-in` in `%APPDATA%\JENESIS\logs\desktop.log`), so the moment a failure happens can always be read afterwards. It carries no name, no company and no record. | `JENESIS/src/App.jsx` |
| 6 | The installed-application test **types the credentials into the window** the way a user does and fails on any `renderer: render-error`, `ReferenceError` or `is not defined` line in the log. | `JENESIS/scripts/smoke-test-installed.ps1` |

Nothing was removed to make this possible: no feature, no screen, no report,
no table, no translation, and no compatibility path. The database file
`genesis.db`, the desktop handshake id `genesis-accounting`, the password salt
and the storage keys are untouched.

### Proof, measured on the built files

The interface was built twice from this repository — once with the import
removed (the state JEN 0.5.1 shipped) and once with it — and the two bundles
were compared. The header's call is the same in both; what changes is what the
name means:

| Build | The header's icon in `dist/assets/index-*.js` |
|---|---|
| **JEN 0.5.1 state** (no import) | `e.jsx(MessageSquare,{className:"w-3.5 h-3.5 text-emerald-400"})` — a bare, unrenamed global. A minifier cannot rename a name it has no binding for, so this line is the `ReferenceError` waiting to happen. |
| **JEN 0.5.2** (imported) | the name is gone from the bundle: it is now a local binding of the real import and is minified like every other local. The icon is defined in `dist/assets/icons-*.js` (`… = o("MessageSquare", …)`) and reached through the import. |

The gate is also proven to fail when the defect is put back: adding a file that
draws `<NotImportedAnywhere />` makes `tests/ui-imports.test.js` report
`src/… draws <NotImportedAnywhere /> without importing it` and exit non-zero.

---

## 3. What you can download

| File | What it is | Size | SHA-256 |
|---|---|---|---|
| `JEN 0.5.2 Setup.exe` | **Windows installer** — installs JENESIS and creates the three shortcuts (Seller, Maintenance, Admin) | 92,918,784 bytes (88.6 MB) | `2bf5f400e65f55d6f99495b440633692cb4f6ea08404db5bab61e8dbd2a52797` |
| `JEN 0.5.2 Portable.zip` | **Portable build** — unzip and double-click `JENESIS.exe`, nothing installed | 133,576,919 bytes (127.4 MB) | `cf32eaa38118fecce52dcd0e08ed5539ad883f70b7e934760e90d6c17f52a032` |
| `JEN 0.5.2.zip` | **Source-code backup** — every tracked file of the project | 5,636,662 bytes (5.4 MB) | `b9b977509c552da17cc3a480ec7c1530712b3f29c98af07f8a4b828eb5a42db5` |

These are the files of **GitHub Actions run 41231907095, commit
`fdfc3669078d31ef474cf39f9bdfb804f8e410d0`**. Every push republishes the release with new checksums, so the
`.sha256` file beside each download always carries the one that belongs to the
file you are getting.

Direct links:

- Installer — <https://github.com/Kdollers/k.JACK/releases/download/v0.5.2/JEN.0.5.2.Setup.exe>
- Portable — <https://github.com/Kdollers/k.JACK/releases/download/v0.5.2/JEN.0.5.2.Portable.zip>
- Source backup — <https://github.com/Kdollers/k.JACK/releases/download/v0.5.2/JEN.0.5.2.zip>
- All files of this release — <https://github.com/Kdollers/k.JACK/releases/tag/v0.5.2>

Every download has a `.sha256` file beside it. Check one on Windows with:

```
certutil -hashfile "JEN 0.5.2 Setup.exe" SHA256
```

and compare with the content of `JEN 0.5.2 Setup.exe.sha256`.

---

## 4. Installing and opening the three applications

1. Download **`JEN 0.5.2 Setup.exe`**.
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
happened — including the line `renderer: signed-in` when the interface reached
the signed-in screen — and the window shows a message instead of a blank
screen.

---

## 5. Your data

- The crash changed nothing: it happened while the interface was being drawn,
  before any record was touched. **No accounting record was modified by it.**
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

Measured on GitHub Actions run **41231907095** (Ubuntu 22.04 and Windows
Server 2022 runners), commit `fdfc3669078d31ef474cf39f9bdfb804f8e410d0`:

| Check | Result |
|---|---|
| Full automated suite (real SQLite, whole project) | **321 checks, 0 failed** |
| Interface import gate (nothing is drawn that is not imported, icons exist, imports resolve) | 7 checks passed |
| Production start-up suite (start-up guard, CSP, packaged interface location, shell verification, diagnostics, per-window identity, signed-in report) | 21 checks passed |
| Package verification (interface present twice, files non-empty, no tests or tooling inside the package) | passed |
| Installed application: **the start page and every file it references are served** | passed |
| Installed application: **the window shows real content, not a blank screen** (its pixels are captured and counted) | passed |
| Installed application: **the interface reports a successful start** and no start-up error is logged | passed |
| Installed application: silent install, three shortcuts, launch from the executable, **each of the three shortcuts opening its own application with a real interface**, all three running side by side on one company, first-run setup, sign-in, a balanced journal entry, backup and restore, clean shutdown, relaunch with data intact, uninstall keeping the database | passed (27/27) |

## 7. What is NOT verified

| Item | Status |
|---|---|
| Run on your physical HP Windows computer | **No** — verified on a GitHub-hosted Windows Server 2022 runner |
| Screenshots of the three applications | **Not possible** in this environment: there is no display. The window is verified by capturing and analysing its pixels instead |
| The signed-in interface being driven by the installed-application test | **Partly** — the test types the credentials into the window and fails on any reported interface error, but on that runner the interface did not confirm the signed-in screen, so the signed-in interface itself is not proven there. It is protected by the build-time import gate (§2.3) and, on your computer, by the `renderer: signed-in` line in the log |
| Messenger between two separate computers on a network | **Not proven** — the harness passes on one machine; run `scripts\messenger-two-computers.cjs --server http://<other PC>:3000 --user <name> --peer <name> --password <pw>` after enabling LAN access in Maintenance |
| Code signing | The installer is **unsigned**, so SmartScreen warns once |
| The installer being inspected byte-by-byte from the development sandbox | Not possible: this sandbox has no access to download the built files; the checksums on the release page are the ones GitHub computed when it published them |

---

## 8. How this build is produced

Every push to the branch runs `.github/workflows/windows-installer.yml`:

1. **Job 1 (Ubuntu 22.04)** — `npm run test:all`, counted by
   `scripts/count-checks.mjs`, then `npm run build` (which itself runs the
   interface import gate first).
2. **Job 2 (Windows Server 2022)** — the suite again, then
   `npm run desktop:dist` (Vite build + electron-builder NSIS),
   `node scripts/verify-package.cjs release/win-unpacked`, then
   `scripts/smoke-test-installed.ps1`, which installs the application for real
   and drives it end to end.
3. SHA-256 checksums, the portable package and the source backup
   (`git archive`) are published to the release **JEN 0.5.2**.

The development sandbox cannot build the installer: `node-gyp` refuses to
cross-compile `better-sqlite3`, and electron-builder cannot download Electron
there. The Windows runner is the only place the installer is produced — which
is also why every claim above is measured there.

---

*Created and developed by KAYIGANWA JACQUES.*
