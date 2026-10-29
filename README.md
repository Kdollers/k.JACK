# k.JACK

## JENESIS — the consolidated application

**`JENESIS/`** is the current, single application: the result of merging the
`JEN 0.2` and `JAN 0.3` archives into one product. It is an SME accounting and
business-management suite (double-entry ledger, sales, purchases, inventory,
banking, multi-currency with period-end FX revaluation, reports, RBAC, audit trail,
backup/restore) that runs as a Windows desktop app and ships with a trilingual UI
(English / Français / Ikinyarwanda).

Start here:

- **[JENESIS/README.md](JENESIS/README.md)** — what the application does
- **[JENESIS/INSTALL.md](JENESIS/INSTALL.md)** — installation, upgrade and first launch
- **[JENESIS/MERGE-REPORT.md](JENESIS/MERGE-REPORT.md)** — what was taken from each
  archive, bugs fixed, test results, database migration and backup instructions
- **[JENESIS/DESKTOP.md](JENESIS/DESKTOP.md)** — desktop packaging and Windows CI

Verified status: **165 automated checks pass** (`cd JENESIS && npm ci && npm run test:all`).
The Windows installer is built by `.github/workflows/windows-installer.yml` and has
**not** been produced yet.

## Everything else in this repository

| Path | What it is |
|---|---|
| `JAN 0.3.zip`, `JEN 0.2.zip` | the two source archives that were merged (kept for reference, unmodified) |
| `GEN 0.2.zip`, `GEN 0.4.zip` | earlier web-only builds of the same lineage |
| `koraledger/` | separate Python/SQLite accounting project, not part of JENESIS |
| `SAGE/` | installer CAB data (unrelated reference material) |
