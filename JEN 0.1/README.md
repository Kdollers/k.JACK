# JEN 0.1 — JENESIS 0.1.0

**JENESIS**, developed by **KAYIGANWA JACQUES**. This folder is the release handoff. The working project remains in `GENESIS-0.4/`; it has **not** been moved, renamed, reset, or replaced.

## Files and Windows installer

- **`JEN 0.1.zip`** — verified **source and bundled web interface** archive (119 files, 945,351 bytes). It includes scripts, installer configuration, offline help and tests. It is **not** an installer and contains **no database, users, backups, dependencies or credentials**.
- **`SHA256SUMS.txt`** — SHA-256 for that local source archive. Check with `sha256sum -c SHA256SUMS.txt` if that command is available.
- **Windows installer** — unsigned `JENESIS-Setup-0.1.0.exe` is in the **`JENESIS-Windows-installer`** artifact of [passing hosted Windows run 38840415907](https://github.com/Kdollers/k.JACK/actions/runs/38840415907) (artifact ID `12020547628`). Download/extract the artifact through GitHub's web interface, then run the `.exe` on a clean Windows PC. The installer binary is **not present in this local folder**: this sandbox cannot download GitHub Actions' external artifact-storage URL. GitHub API reports SHA-256 `894949ca3aac4452d462ecb70811191295bcf1d1fc51e4cc4b9565a8ab7f8d4d` for the **artifact archive**, not for the `.exe`. That artifact is currently available and is scheduled to expire **2027-01-14 UTC**. Normal application users do not need Node.js, a terminal or build tools.

## Verification performed

- Local `npm run test:all` and `npm run build` passed on isolated databases; UI **13/13**, desktop lifecycle **12/12**, localization **10/10**, fresh authentication **23/23**, legacy authentication **6/6**, security **8/8**, plus CRUD, five company base currencies, LAN/TLS, accounting, snapshots, payments and recovery regressions.
- The source ZIP passed its own content checks and an independent CRC/database-exclusion verification. The source archive in this folder exactly matches the checked-in `JEN 0.1.zip` at repository root.
- The **Windows Server 2022** workflow built and installed the unsigned NSIS installer, checked package contents/native SQLite, all three shortcut icons and app modes, opt-in private-LAN TLS with host certificate fingerprint and a mode-bound browser-client sign-in, accounting and backup, restart persistence, and uninstall data retention. [Passing workflow and installer artifact](https://github.com/Kdollers/k.JACK/actions/runs/38840415907). This is **not** a physical Windows 10/11 PC, antivirus/SmartScreen, offline installation or upgrade-path certification.
- The original historical data was never used as a mutable test database. Its pre-change SQLite backup and source archive remain outside this release folder at `GENESIS-0.4/backups/pre-jenesis-2026-10-16/` (excluded from Git); the SQLite safety copy passed integrity checks. No production data ships in the release.

## Use and limits

The installed shortcuts launch red **Seller**, blue **Administrator**, and green **Network & Maintenance** applications with server-enforced role, mode and company permissions. Only Seller and Administrator have a display-only calculator. English, French and Kinyarwanda interfaces and offline tutorials are bundled. Administrators choose a company base currency: **XAF, RWF, USD, EUR or UGX**; explicitly foreign-tagged transactions are refused rather than reinterpreted. **Automatic FX conversion, historical-rate revaluation, and jurisdiction-certified tax/rounding are not provided.** Have an accountant validate results for regulated use.

The backend remains **loopback-only by default**. A local network/administrator session can explicitly enable private **HTTPS** browser access on the host's TCP port `34671` in the green app. Clients use the displayed `/seller` or `/administrator` browser URL, verify the self-signed certificate's SHA-256 fingerprint **out of band**, and authenticate against the *same host database*. Do not copy/sync a live SQLite file. An installed desktop executable on a second computer does **not** automatically connect to the host. Keep the LAN port private and the host/backups protected. See the source archive's `README.md` and `DESKTOP.md` for setup, recovery and further limitations.

**Uninstall preserves user data by design**, but take and verify an off-PC backup before installation, upgrade, restoration or uninstall. No default production password is included; first-run setup is local to the host.
