# GENESIS

Business accounting and management software: double-entry ledger, customers and suppliers,
products with FIFO or weighted-average costing, sales and purchase documents, payments
(cash, bank, mobile money), financial and operational reports, configurable tax, users and
roles, audit trail, and backup/restore with integrity checks. Each company has its own
database. The interface is available in English, French and Kinyarwanda.

It is written with the Python standard library only (SQLite, `http.server`) and a
vanilla JavaScript browser client. There are no third-party Python dependencies.

## Run it

Requires Python 3.11 or newer.

```bash
python3 -m genesis --host 127.0.0.1 --port 8000      # from this folder
# or install it:
pip install .
genesis --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`. On first run there is no company, so the page asks you to
create one: company name, currency, tax profile, costing method, and the first
administrator account. Use `--host 0.0.0.0` only on a network you trust.

Data location: `--data-dir DIR`, or the `GENESIS_DATA_DIR` environment variable, or
`./data` in the current folder by default. Company databases, the registry and backups all
live there. Never commit that folder.

## Tests

```bash
python3 -m unittest                      # from this folder: the full Python suite
cd tests/ui && npm install && cd ../..   # once: jsdom, for the browser smoke test
python3 -m unittest tests.test_ui_smoke  # runs the real web client against a live server
```

The browser smoke test loads the actual client modules into a DOM (jsdom). It creates the
first company, signs in, visits every page, switches language, creates a customer, and
checks that no untranslated keys appear. It does not run in a real browser engine, so
layout and CSS are not covered by it.

## Layout

| Path | Contents |
| --- | --- |
| `genesis/` | Python package: `api.py` (routes), `auth.py` (roles and permissions), `ledger.py` (double-entry engine), `documents.py`, `inventory.py` (FIFO and weighted average), `payments.py`, `reports.py`, `exporters.py` (CSV, XLSX, PDF), `backup.py`, `company.py`, `server.py` |
| `genesis/locales/` | Translation sources (`*_i18n.py`, one table per area). `python3 -m genesis.locales.generate` writes `en.py`, `fr.py`, `rw.py`. Edit the sources, not the generated files. |
| `genesis/web/` | Browser client: `index.html`, `css/app.css`, `js/*.js` |
| `tests/` | Unit and integration tests (`unittest`), plus `tests/ui/` for the browser smoke test |

## Accounting rules the code enforces

- Money is stored as integers in minor units. Quantities are stored times 10,000.
  Percentages are in basis points. Rounding happens only in one place, half-up.
- Every journal entry needs at least two lines, and total debits must equal total credits.
  Unbalanced entries are rejected.
- Posted entries, posted documents, payments and stock movements cannot be deleted or
  edited. Corrections are made by reversal.
- Entries on or before the lock date are rejected.
- Only roles with the matching permission can post, reverse, change accounts, manage
  tax, or delete accounting records. Accountants can post and reverse. Administrators can
  manage backups and companies.
- Each company's data is in its own database. A backup can only be restored into the
  company it came from.

## Status and known limits

- Kinyarwanda translations were written without a native-speaker review. They need one
  before production use.
- The browser client is covered by the jsdom smoke test, not by a real browser.
- Creating a second company is possible through the API (`POST /api/companies`, which
  needs `companies.manage`), but the browser client only offers the first-run screen.
- The desktop Tkinter application in `koraledger/` is separate from GENESIS and is not
  covered here.
