# JEN 0.5.4 — release notes

**JENESIS 0.5.4** — desktop business and accounting software by
KAYIGANWA JACQUES.

Installer: `JEN 0.5.4 Setup.exe` · Portable: `JEN 0.5.4 Portable.zip` ·
Source: `JEN 0.5.4.zip`

Built by GitHub Actions, run **41939563103**, commit
**`e4c4bfdbd5bedee4e02058ae416e34b5d5dbb135`**.

---

## The four applications

One installation, four programs, **one shared database**. Each has its own
name, colour, icon, window title, Desktop shortcut and Start-menu entry, and
each remembers its own Light/Dark theme.

| # | Application | Colour | Opens on | What it is for |
|---|---|---|---|---|
| 1 | **JENESIS Seller** | Red | Sales | Selling: the dashboard, sales, customers and stock. |
| 2 | **JENESIS Network & Maintenance** | Green | Network & Maintenance | The network between JENESIS computers, the service, verified backups, integrity checks and logs. |
| 3 | **JENESIS Accounting & Business** | Blue | Dashboard | The whole program: sales, purchases, inventory, banking, accounting, reports and settings. |
| 4 | **JENESIS Settings & Access Point** | Yellow | Settings | The company, users and permissions, taxes, currencies and backups. Administrators and managers. |

These four names are used **exactly** in the window titles, the desktop
shortcuts, the Start-menu entries, the installer, the uninstaller and this
documentation. Inside the interface, where the language has been switched to
French or Kinyarwanda, the same four applications are shown under their
translated names (`JENESIS Vendeur`, `JENESIS Réseau & Maintenance`,
`JENESIS Comptabilité & Gestion`, `JENESIS Paramètres & Point d'accès`;
`JENESIS Umucuruzi`, `JENESIS Umuyoboro & Kubungabunga`,
`JENESIS Ibaruramari & Ubucuruzi`, `JENESIS Igenamiterere & Ahantu ho
Kwinjirira`). The installer keeps deleting the shortcuts of the older
`JENESIS Admin` and `JENESIS Maintenance` names, so an upgrade does not leave
stale icons behind.

---

## What is new in 0.5.4

### 1. The interface is complete in English, French and Kinyarwanda

1,030 keys per language across 28 namespaces, with **zero untranslated
strings** reported by the scanner that audits every screen. Nine documented
exceptions (language names, ISO currency codes, keyboard keys), each with a
written reason. Switching language updates the screen immediately and is
remembered.

### 2. Amounts are formatted in one place

`1,400.00 XFA` — grouped digits, two decimals, the currency code after the
amount — produced by a single function and used by every screen and report. It
is strictly a display rule: stored values are never rewritten.

### 3. Records can be retired instead of lost

Customers, suppliers, products, stores and users can be deactivated,
reactivated, or deleted by an Administrator or a Manager. The API enforces the
permission, not just the interface.

- A record that carries history is **deactivated, never deleted**: accounting
  transactions are never silently destroyed.
- You cannot deactivate yourself, and the last active Administrator cannot be
  removed at all.
- Every action is written to the audit trail with **who, when, what and which
  record**.

**47 checks.**

### 4. JENESIS is now four applications

Formerly three, now four — see the table above. Each keeps its own theme
choice, and the identity colour does not change between Light and Dark.

### 5. The applications are held to their own boundaries

Sharing one database does not mean every window can reach everything. From
JENESIS Seller the reports cannot be opened even by an administrator, and
JENESIS Network & Maintenance cannot read customers, suppliers, products,
stock, sales or accounting data. Refusals are recorded in the audit trail —
never the password or the session token. **22 checks**, each proved by asking
for something that must be refused.

### 6. JENESIS Network & Maintenance finds the other computers

It discovers the JENESIS computers on the local network (UDP broadcast on port
41235), keeps the ones you work with, and connects to, disconnects from,
reconnects to and watches them — with a plain-language reason when one is not
answering: switched off, JENESIS not running, something else on that address,
or a different version.

The announcement it broadcasts carries only a name, an address, a port and a
version: **no token, no user, no company, no database path**. Nothing is
broadcast while the network switch is off.

**16 checks**, run between two real services over real UDP sockets.

### 7. Renaming

**JENESIS Admin is now JENESIS Accounting & Business**, and **JENESIS
Maintenance is now JENESIS Network & Maintenance** — in the window titles, the
shortcuts, the installer, Help and all three dictionaries. Internal
identifiers, the database file and existing installations were deliberately
left untouched, so an upgrade changes nothing but the names.

### 8. Repaired along the way

- **`/api/taxes` no longer refuses the Seller.** The sales invoice reads the
  list of tax rates from a route that was guarded by an accounting permission
  alone, so a clerk in JENESIS Seller was refused the rates their own screen
  asked for. Reading is now allowed to either role; defining a rate stays with
  accounting.
- **The test suite runs on Node 20 as well as Node 22.** One file required
  `node:sqlite` directly, which exists only from Node 22.5 onwards.
- **A crashed suite can no longer look green.** On Linux the suite ran through
  a pipe that kept only the exit code of the check counter at the far end, so a
  suite that died before printing a total was counted as clean.

---

## What was tested, and what passed

**528 automated checks, 0 failed, 31 suites** — run on both the Linux
(Ubuntu 22.04) and the Windows Server 2022 runner, on Node 20.

| Suite | Checks |
|---|---|
| Accounting engine integrity (real database, posted entries) | 10 |
| Authentication & authorization (fresh and legacy-upgrade scenarios) | 27 |
| Security hardening | 8 |
| Desktop backend | 10 |
| Operations | 36 |
| Database migrations | 9 |
| i18n parity | 10 |
| Foreign exchange | 17 |
| FX revaluation | 15 |
| Documents created PAID | 20 |
| Keyboard shortcuts | 25 |
| Four applications | 16 |
| Production start-up | 21 |
| Messenger | 18 |
| User guide | 15 |
| Reports screens | 13 |
| Every screen drawn with React | 26 |
| Currency formatting | 9 |
| Translation coverage | 7 |
| Translation scope | 3 |
| Delete / deactivate / reactivate and the audit trail | 47 |
| Data location migration | 11 |
| Branding and the J identity | 13 |
| Application gate | 6 |
| Four applications rendered | 17 |
| Separation between the applications | 22 |
| Network & Maintenance | 16 |
| Test-suite portability | 34 |
| Theme rules | 34 |
| Theme UI | 6 |
| Interface import gate | 7 |

### Installed-application smoke test: 29/29 PASS

The installer was run silently on a clean Windows Server 2022 machine and the
installed application was then used:

silent install → four desktop shortcuts → the same four in the Start menu →
starts from the executable with no manual server or terminal → backend on
loopback only → no external browser → the installed application serves its
start page and every file it references → unauthenticated requests refused →
first-run setup → sign-in → **the window shows real content and not a blank
white screen (its pixels are captured and counted)** → the interface reports a
successful start → balanced journal entry → trial balance balanced → backup
export → graceful shutdown → relaunch, data persists → backup restore keeps a
pre-restore copy → clean close → both themes ship → **four desktop shortcuts,
each named for its application, each carrying its own `--app=` argument and its
own icon** → **all four applications opened from their own shortcut, each with
a real interface** → **all four running side by side on one shared company** →
the credentials typed into the window with the keyboard → silent uninstall
keeps the business database.

The four shortcuts, as read back out of the `.lnk` files the installer wrote:

```
JENESIS Seller                  -> JENESIS.exe --app=seller       icon-seller.ico
JENESIS Network & Maintenance   -> JENESIS.exe --app=maintenance  icon-maintenance.ico
JENESIS Accounting & Business   -> JENESIS.exe --app=admin        icon-admin.ico
JENESIS Settings & Access Point -> JENESIS.exe --app=settings     icon-settings.ico
```

### Screenshots

Four pictures of the four installed applications are attached to this release
and published in the `screenshots/` folder of the repository. Each was measured
rather than merely saved:

| Picture | Distinct colours | Its own colour | The other three |
|---|---|---|---|
| `JENESIS-Seller.bmp` | 1,255 | red **2.02%** | 0.00 / 0.00 / 0.00 |
| `JENESIS-Network-Maintenance.bmp` | 1,459 | green **2.04%** | 0.00 / 0.00 / 0.00 |
| `JENESIS-Accounting-Business.bmp` | 1,671 | blue **2.01%** | 0.00 / 0.00 / 0.00 |
| `JENESIS-Settings-Access-Point.bmp` | 1,406 | yellow **2.00%** | 0.00 / 0.00 / 0.00 |

Each window carries its own identity colour and none of the others.

---

## Files and checksums

| File | Size | SHA-256 |
|---|---|---|
| `JEN 0.5.4 Setup.exe` | 93,034,371 bytes (88.7 MB) | `11ab8809e7d95de17bdbd3dc0f8f04205ec6fbed8cd58d9bbaec23eae5a210a6` |
| `JEN 0.5.4 Portable.zip` | 133,710,242 bytes (127.5 MB) | `1675bd8630dcc9a8165dd7ca1b17e6c5cd1b83cf856de6ddb158fb1ea8cc9875` |
| `JEN 0.5.4.zip` | 5,873,562 bytes (5.6 MB) | in `JEN 0.5.4.zip.sha256`, on the release page |

Verify a download with:

```powershell
certutil -hashfile "JEN 0.5.4 Setup.exe" SHA256
```

---

## What has NOT been verified — please read

- **The installer is unsigned.** Windows SmartScreen will warn
  ("Windows protected your PC"); choose **More info → Run anyway**. No
  code-signing certificate is configured for this project.
- **Nothing has been run on a physical PC.** The installer was installed,
  launched and used on a GitHub-hosted Windows Server 2022 virtual machine.
  Real computers differ: antivirus, SmartScreen, graphics drivers and user
  account control are all things that runner does not have. **This has not
  been tested on your HP computer.**
- **Sign-in has not been confirmed.** The smoke test types the username, the
  password and `Enter` into the window and fails on any error the interface
  reports, but on that runner the interface **did not confirm** that it reached
  the signed-in screen. Sign-in through the interface is therefore **not**
  claimed to work. (Sign-in through the API is covered by 27 checks.)
- **Two computers on a real network have not been tested.** Every network
  function was exercised between two real JENESIS services over real UDP and
  HTTP sockets — but both ran on the same machine. **LAN communication between
  two separate computers is not proven.** Discovery also depends on your
  network allowing UDP broadcast on port 41235; guest Wi-Fi, some routers and
  corporate switches block it. To try it: switch on *Allow other computers on
  this network to connect* in **JENESIS Network & Maintenance** on both
  machines and look for each other in the computer list.
- **Messenger between two physical computers is not proven.** Delivery,
  receipts, permissions and company isolation are covered by 18 checks against
  one service with two independent sessions; `scripts\messenger-two-computers.cjs`
  repeats the exchange over HTTP with two accounts, but both sessions run on
  one machine. Run that script from a second PC to prove it.
- **Nobody has looked at the interface.** The build environment has no display
  and no browser. Themes were verified by measurement (128 text/background
  pairs, all ≥ 4.5:1 contrast in both themes) and the screens by rendering them
  with React and by counting the pixels of the installed windows — not by eye.
  Spend ten minutes in both themes after installing.
- **Printing on a physical printer is untested**, and Playwright end-to-end
  tests cannot be run (no browser is installable in the build environment).
- **The four application names are translated in the interface** when the
  language is French or Kinyarwanda. They are exact and untranslated everywhere
  they identify the product (titles, shortcuts, installer, documentation).
