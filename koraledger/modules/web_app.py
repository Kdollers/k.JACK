"""Small, dependency-free browser interface for KoraLedger.

The web client uses the same repository and company file as the desktop app.
Run it with ``python main.py --web``. The single-request server keeps the
existing SQLite connection serialized and is intended for a trusted workstation
or the Arena preview, not as an internet-facing multi-user service.
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import tempfile
from datetime import date
from urllib.parse import parse_qs, unquote, urlsplit

from modules.accounting_repository import ACCOUNT_TYPES, AccountingRepository


WEB_DIR = Path(__file__).resolve().parents[1] / "web"
MAX_REQUEST_BYTES = 1_000_000


class RouteNotFound(LookupError):
    """Raised when a browser route does not map to a KoraLedger resource."""


class WebApplication:
    """Translate browser API calls into the application's accounting repository."""

    def __init__(self, repository):
        self.repository = repository

    @staticmethod
    def _value(query, key, default=""):
        values = query.get(key, ()) if query else ()
        return values[0] if values else default

    @staticmethod
    def _record_id(value):
        if value in (None, ""):
            return None
        try:
            return int(value)
        except (TypeError, ValueError) as error:
            raise ValueError("Record ID must be a whole number.") from error

    def get(self, path, query=None):
        query = query or {}
        path = unquote(path).rstrip("/") or "/"
        repo = self.repository

        if path == "/api/health":
            return {"ok": True, "product": "KoraLedger"}
        if path == "/api/dashboard":
            return repo.dashboard()
        if path == "/api/customers":
            return repo.list_customers(self._value(query, "q"))
        if path == "/api/suppliers":
            return repo.list_suppliers(self._value(query, "q"))
        if path == "/api/products":
            return repo.list_products(self._value(query, "q"))
        if path == "/api/sales":
            return repo.list_sales(self._value(query, "q"))
        if path == "/api/purchases":
            return repo.list_purchases(self._value(query, "q"))
        if path == "/api/payments":
            return repo.list_payments(self._value(query, "q"))
        if path == "/api/accounts":
            return repo.list_accounts(self._value(query, "q"))
        if path == "/api/journals":
            return repo.list_journal_entries(self._value(query, "q"))
        if path == "/api/adjustments":
            return repo.list_inventory_adjustments()
        if path == "/api/search":
            return repo.global_search(self._value(query, "q"))
        if path == "/api/settings":
            return {
                "company_name": repo.get_setting("company_name", "My Company"),
                "currency_code": repo.get_setting("currency_code", "XAF"),
            }
        if path == "/api/reports/trial-balance":
            as_of = self._value(query, "as_of") or None
            rows = repo.trial_balance(as_of)
            debits = sum(float(row["debit"] or 0) for row in rows)
            credits = sum(float(row["credit"] or 0) for row in rows)
            return {"rows": rows, "debits": debits, "credits": credits}
        if path == "/api/reports/income-statement":
            start = self._value(query, "start") or None
            end = self._value(query, "end") or None
            if start is None:
                start = date.today().replace(month=1, day=1).isoformat()
            if end is None:
                end = date.today().isoformat()
            rows, revenue, expenses, net_income = repo.profit_loss(start, end)
            return {
                "rows": rows,
                "revenue": revenue,
                "expenses": expenses,
                "net_income": net_income,
                "start": start,
                "end": end,
            }
        if path == "/api/reports/balance-sheet":
            as_of = self._value(query, "as_of") or None
            rows, totals = repo.balance_sheet(as_of)
            return {"rows": rows, "totals": totals, "as_of": as_of}
        if path == "/api/ledger":
            account_code = self._value(query, "account_code")
            start = self._value(query, "start")
            end = self._value(query, "end")
            if not account_code or not start or not end:
                raise ValueError("Choose an account and a complete date range.")
            account, opening, rows = repo.general_ledger(account_code, start, end)
            return {"account": account, "opening": opening, "rows": rows}

        for resource, detail_method in (
            ("sales", repo.sale_details),
            ("purchases", repo.purchase_details),
            ("journals", repo.journal_details),
        ):
            prefix = f"/api/{resource}/"
            if path.startswith(prefix):
                record_id = self._record_id(path[len(prefix):])
                header, lines = detail_method(record_id)
                if not header:
                    raise RouteNotFound("Document was not found.")
                return {"header": header, "lines": lines}

        raise RouteNotFound(f"Unknown API route: {path}")

    def post(self, path, payload):
        path = unquote(path).rstrip("/") or "/"
        payload = payload or {}
        repo = self.repository

        if path == "/api/customers":
            record_id = self._record_id(payload.get("id"))
            customer_id = repo.save_customer(
                payload.get("name"), payload.get("phone", ""), record_id
            )
            return {"id": customer_id, "message": "Customer saved."}
        if path == "/api/suppliers":
            record_id = self._record_id(payload.get("id"))
            supplier_id = repo.save_supplier(
                payload.get("name"), payload.get("phone", ""), record_id
            )
            return {"id": supplier_id, "message": "Supplier saved."}
        if path == "/api/products":
            product_id = repo.save_product(
                payload.get("code"),
                payload.get("name"),
                payload.get("cost_price", 0),
                payload.get("selling_price", 0),
                payload.get("opening_quantity", 0),
                self._record_id(payload.get("id")),
            )
            return {"id": product_id, "message": "Item saved."}
        if path == "/api/sales":
            items = payload.get("items", [])
            if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
                raise ValueError("Invoice items must be a list of item details.")
            result = repo.create_sale(
                self._record_id(payload.get("customer_id")),
                payload.get("payment_method"),
                items,
                payload.get("posted_date") or None,
            )
            return {**result, "message": "Sales invoice posted."}
        if path == "/api/purchases":
            items = payload.get("items", [])
            if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
                raise ValueError("Purchase items must be a list of item details.")
            result = repo.create_purchase(
                self._record_id(payload.get("supplier_id")),
                payload.get("payment_method"),
                items,
                payload.get("posted_date") or None,
            )
            return {**result, "message": "Purchase invoice posted."}
        if path == "/api/payments":
            result = repo.create_payment(
                payload.get("payment_type"),
                payload.get("party_id"),
                payload.get("amount"),
                payload.get("method"),
                payload.get("description", ""),
                payload.get("posted_date") or None,
            )
            return {**result, "message": "Payment posted."}
        if path == "/api/adjustments":
            result = repo.adjust_inventory(
                self._record_id(payload.get("product_id")),
                payload.get("physical_quantity"),
            )
            return {**result, "message": "Stock count posted."}
        if path == "/api/journals":
            lines = payload.get("lines", [])
            if not isinstance(lines, list) or any(not isinstance(line, dict) for line in lines):
                raise ValueError("Journal lines must be a list of account details.")
            journal_id = repo.post_journal(
                payload.get("description"),
                payload.get("reference", ""),
                payload.get("entry_date"),
                lines,
            )
            return {"id": journal_id, "message": "Journal entry posted."}
        if path == "/api/accounts":
            if payload.get("account_type") not in ACCOUNT_TYPES:
                raise ValueError("Choose a valid account type.")
            account_id = repo.create_account(
                payload.get("account_code"),
                payload.get("account_name"),
                payload.get("account_type"),
                self._record_id(payload.get("parent_id")),
            )
            return {"id": account_id, "message": "Account created."}
        if path == "/api/settings":
            repo.save_settings(
                payload.get("company_name"), payload.get("currency_code")
            )
            return {"message": "Company preferences saved."}

        raise RouteNotFound(f"Unknown API route: {path}")

    def company_backup(self):
        """Return a verified, transactionally consistent company-file snapshot."""
        company = self.repository.get_setting("company_name", "KoraLedger")
        slug = re.sub(r"[^a-z0-9]+", "-", company.lower()).strip("-") or "company"
        filename = f"KoraLedger-{slug}-{date.today().isoformat()}.db"
        with tempfile.TemporaryDirectory(prefix="kora-backup-") as directory:
            path = Path(directory) / filename
            target = sqlite3.connect(path)
            try:
                self.repository.connection.backup(target)
                result = target.execute("PRAGMA integrity_check").fetchone()
                if not result or result[0] != "ok":
                    raise RuntimeError("The company-file backup did not pass its integrity check.")
            finally:
                target.close()
            return filename, path.read_bytes()


class KoraLedgerHTTPServer(HTTPServer):
    allow_reuse_address = True


def make_request_handler(application, csrf_token):
    """Bind an application instance and per-process CSRF token to a handler."""

    class RequestHandler(BaseHTTPRequestHandler):
        server_version = "KoraLedger/1.0"
        sys_version = ""

        def log_message(self, format_string, *args):
            # Keep routine browser polling out of the development console.
            if self.path not in ("/api/health", "/favicon.ico"):
                super().log_message(format_string, *args)

        def _send(self, status, body=b"", content_type="text/plain; charset=utf-8"):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "same-origin")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if body:
                self.wfile.write(body)

        def _send_json(self, status, data):
            body = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
            self._send(status, body, "application/json; charset=utf-8")

        def _send_download(self, filename, body):
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.sqlite3")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _static_file(self, path):
            files = {
                "/static/app.css": ("app.css", "text/css; charset=utf-8"),
                "/static/app.js": ("app.js", "text/javascript; charset=utf-8"),
                "/static/icon.svg": ("icon.svg", "image/svg+xml; charset=utf-8"),
            }
            if path == "/favicon.ico":
                self._send(204)
                return
            file_info = files.get(path)
            if file_info is None:
                raise RouteNotFound("Static file was not found.")
            filename, mime = file_info
            body = (WEB_DIR / filename).read_bytes()
            if filename == "index.html":
                body = body.replace(b"__KORA_CSRF_TOKEN__", csrf_token.encode("ascii"))
            self._send(200, body, mime)

        def do_GET(self):
            parsed = urlsplit(self.path)
            if parsed.path in ("/", "/index.html"):
                try:
                    body = (WEB_DIR / "index.html").read_bytes()
                    body = body.replace(
                        b"__KORA_CSRF_TOKEN__", csrf_token.encode("ascii")
                    )
                    self._send(200, body, "text/html; charset=utf-8")
                except OSError:
                    self._send_json(500, {"error": "Web interface files are missing."})
                return
            if parsed.path.startswith("/static/") or parsed.path == "/favicon.ico":
                try:
                    self._static_file(parsed.path)
                except (OSError, RouteNotFound):
                    self._send(404, b"Not found")
                return
            if parsed.path == "/api/backup":
                try:
                    filename, body = application.company_backup()
                    self._send_download(filename, body)
                except Exception:
                    self.log_error("Could not create a company-file backup")
                    self._send_json(500, {"error": "KoraLedger could not create a verified backup."})
                return
            if not parsed.path.startswith("/api/"):
                self._send_json(404, {"error": "Page not found."})
                return
            try:
                query = parse_qs(parsed.query, keep_blank_values=True)
                result = application.get(parsed.path, query)
                self._send_json(200, result)
            except RouteNotFound as error:
                self._send_json(404, {"error": str(error)})
            except (ValueError, TypeError, KeyError) as error:
                self._send_json(400, {"error": str(error)})
            except Exception:
                self.log_error("Unexpected API error on %s", parsed.path)
                self._send_json(500, {"error": "KoraLedger could not load this data."})

        def do_POST(self):
            parsed = urlsplit(self.path)
            if not parsed.path.startswith("/api/"):
                self._send_json(404, {"error": "Page not found."})
                return
            supplied_token = self.headers.get("X-CSRF-Token", "")
            if not secrets.compare_digest(supplied_token, csrf_token):
                self._send_json(403, {"error": "Refresh KoraLedger before submitting this change."})
                return
            origin = self.headers.get("Origin")
            request_host = self.headers.get("Host", "").lower()
            if origin:
                origin_host = urlsplit(origin).netloc.lower()
                if not request_host or origin_host != request_host:
                    self._send_json(403, {"error": "Cross-origin requests are not allowed."})
                    return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length < 0 or length > MAX_REQUEST_BYTES:
                    raise ValueError("Request is too large.")
                if "application/json" not in self.headers.get("Content-Type", ""):
                    raise ValueError("Submit data as JSON.")
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                if not isinstance(payload, dict):
                    raise ValueError("Request body must be a JSON object.")
                result = application.post(parsed.path, payload)
                self._send_json(200, result)
            except RouteNotFound as error:
                self._send_json(404, {"error": str(error)})
            except (ValueError, TypeError, KeyError, sqlite3.IntegrityError) as error:
                self._send_json(400, {"error": str(error)})
            except Exception:
                self.log_error("Unexpected API error on %s", parsed.path)
                self._send_json(500, {"error": "KoraLedger could not save this change."})

    return RequestHandler


def run_web(host=None, port=None):
    """Start the browser interface using the currently configured company file."""
    from database import close_database, connection, cursor

    host = host or os.environ.get("KORALEDGER_HOST", "0.0.0.0")
    port = int(port or os.environ.get("KORALEDGER_PORT", "8000"))
    repository = AccountingRepository(connection, cursor)
    application = WebApplication(repository)
    csrf_token = secrets.token_urlsafe(32)
    handler = make_request_handler(application, csrf_token)
    server = KoraLedgerHTTPServer((host, port), handler)
    print(f"KoraLedger web workspace listening on http://{host}:{port}")
    print("Press Ctrl+C to stop. Use only on a trusted local or preview network.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nKoraLedger web workspace stopped.")
    finally:
        server.server_close()
        close_database()
