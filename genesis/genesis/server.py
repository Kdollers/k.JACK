"""HTTP server: JSON API under /api, static web client from the package web/ folder.

Standard library only (ThreadingHTTPServer). Every API request goes through
``api.dispatch``, so authentication, permissions and error translation behave the
same here as in tests. Requests are serialized behind the application lock because
each company database is a single SQLite connection shared by request threads.
"""

import json
import mimetypes
import sys
import threading
import traceback
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

from . import api, backup
from .api import Binary, Html
from .app import Application
from .config import DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, WEB_ROOT

MAX_BODY_BYTES = 2 * 1024 * 1024
TOKEN_HEADER = "X-Genesis-Token"
SCHEDULER_INTERVAL_SECONDS = 60

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
}


def _json_default(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if hasattr(value, "keys"):
        return dict(value)
    raise TypeError(f"not JSON serializable: {type(value).__name__}")


def _requested_language(query, header):
    code = (query.get("lang") or "").strip().lower()
    if code in SUPPORTED_LANGUAGES:
        return code
    for part in (header or "").split(","):
        tag = part.split(";")[0].strip().lower()[:2]
        if tag in SUPPORTED_LANGUAGES:
            return tag
    return DEFAULT_LANGUAGE


class GenesisRequestHandler(BaseHTTPRequestHandler):
    server_version = "GENESIS/1.0"
    protocol_version = "HTTP/1.1"

    # Set by make_server().
    app = None
    lock = None

    def log_message(self, fmt, *args):  # quiet by default; errors still reach stderr
        return

    # -- verbs -------------------------------------------------------------
    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def do_PUT(self):
        self._route("PUT")

    def do_DELETE(self):
        self._route("DELETE")

    # -- routing -----------------------------------------------------------
    def _route(self, method):
        parts = urlsplit(self.path)
        if parts.path.startswith("/api/") or parts.path == "/api":
            self._api(method, parts)
        elif method == "GET":
            self._static(parts.path)
        else:
            self._send_json(405, {"error": "method_not_allowed", "status": 405,
                                  "message": "This action is not allowed for this address."})

    def _api(self, method, parts):
        query = {key: values[-1] for key, values in parse_qs(parts.query, keep_blank_values=True).items()}
        lang = _requested_language(query, self.headers.get("Accept-Language"))
        try:
            body = self._read_json_body(method)
        except ValueError:
            self._send_json(422, {"error": "invalid_json", "status": 422,
                                  "message": self._message("invalid_json", lang)}, lang)
            return
        if body is None and method in ("POST", "PUT"):
            body = {}
        token = self._token()
        with self.lock:
            status, payload = api.dispatch(self.app, method, parts.path, body=body, query=query,
                                           token=token, lang=lang)
        self._send_payload(status, payload, lang)

    def _token(self):
        token = self.headers.get(TOKEN_HEADER, "").strip()
        if not token:
            auth = self.headers.get("Authorization", "")
            if auth.lower().startswith("bearer "):
                token = auth[7:].strip()
        return token

    def _read_json_body(self, method):
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return None if method in ("GET", "DELETE") else {}
        if length > MAX_BODY_BYTES:
            raise ValueError("body too large")
        raw = self.rfile.read(length)
        if not raw.strip():
            return {}
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("invalid json") from error
        if not isinstance(value, dict):
            raise ValueError("body must be an object")
        return value

    @staticmethod
    def _message(key, lang):
        from .i18n import translate
        return translate(key, lang)

    # -- responses ---------------------------------------------------------
    def _send_payload(self, status, payload, lang):
        if isinstance(payload, Binary):
            self._send_bytes(status, payload.content, payload.content_type,
                             disposition=f'attachment; filename="{payload.filename}"' if payload.filename else None)
        elif isinstance(payload, Html):
            self._send_bytes(status, payload.content.encode("utf-8"), "text/html; charset=utf-8")
        else:
            self._send_json(status, payload, lang)

    def _send_json(self, status, payload, lang=None):
        data = json.dumps(payload, default=_json_default, ensure_ascii=False).encode("utf-8")
        self._send_bytes(status, data, "application/json; charset=utf-8", no_store=True)

    def _send_bytes(self, status, data, content_type, disposition=None, no_store=False):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)
        if disposition:
            self.send_header("Content-Disposition", disposition)
        if no_store:
            self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    # -- static files ------------------------------------------------------
    def _static(self, raw_path):
        relative = unquote(raw_path).lstrip("/") or "index.html"
        root = WEB_ROOT.resolve()
        target = (root / relative).resolve()
        # Never serve anything outside the web root (path traversal).
        if root != target and root not in target.parents:
            self._send_json(404, {"error": "endpoint_not_found", "status": 404, "message": "Not found."})
            return
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            self._send_json(404, {"error": "endpoint_not_found", "status": 404, "message": "Not found."})
            return
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in ("application/javascript", "application/json"):
            content_type += "; charset=utf-8"
        self._send_bytes(200, target.read_bytes(), content_type)


def make_server(app, host="127.0.0.1", port=8000):
    handler = type("BoundGenesisHandler", (GenesisRequestHandler,), {"app": app, "lock": app.lock})
    server = ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    return server


def _scheduler(app, stop_event):
    """Run due scheduled backups every minute while the server is up."""
    while not stop_event.wait(SCHEDULER_INTERVAL_SECONDS):
        try:
            with app.lock:
                backup.run_scheduled_backups(app)
        except Exception:  # noqa: BLE001 - keep the scheduler alive; report to stderr
            traceback.print_exc(file=sys.stderr)


def serve(data_dir=None, host="127.0.0.1", port=8000):
    app = Application(data_dir)
    server = make_server(app, host, port)
    stop = threading.Event()
    threading.Thread(target=_scheduler, args=(app, stop), daemon=True).start()
    print(f"GENESIS listening on http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        server.server_close()
        app.close()
    return 0
