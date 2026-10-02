# KoraLedger

KoraLedger is a local small-business accounting workspace for customer and supplier records, sales and purchase invoices, inventory, receipts and payments, a double-entry general ledger, and financial statements.

## Start the app

From this folder:

```bash
python main.py
```

That opens the Tk desktop workspace (requires Python Tkinter). Two alternatives are available:

```bash
python main.py --cli   # terminal menus
python main.py --web   # browser workspace at http://127.0.0.1:8000
```

The browser workspace is built with Python's standard library and needs no package installation. Set `KORALEDGER_HOST` and `KORALEDGER_PORT` to change its bind address and port. It binds to `0.0.0.0:8000` by default for hosted previews; on a private workstation, prefer `KORALEDGER_HOST=127.0.0.1`.

## Company file

The default company database is `accounting.db` in this folder. To work with a different company file, set `ACCOUNTING_DB_PATH` before starting KoraLedger. Company settings can change the display name and reporting currency. The browser Settings page can download a verified SQLite backup of the open company file.

The browser server is a single-operator local workspace, not an internet-facing multi-user service. Keep the company file and backups private.

## Checks

```bash
python -m unittest discover -s tests -v
```
