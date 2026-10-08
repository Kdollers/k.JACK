"""The real HTTP server: JSON API, token header, status codes, downloads and static file safety."""

import json
import threading
import unittest
import urllib.error
import urllib.request

from genesis import server
from tests.helpers import ADMIN_PASSWORD, Env


class HttpServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env()
        cls.httpd = server.make_server(cls.env.app, "127.0.0.1", 0)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.env.close()

    def request(self, method, path, body=None, token=None, headers=None, raw=None):
        data = raw if raw is not None else (json.dumps(body).encode("utf-8") if body is not None else None)
        req = urllib.request.Request(self.base + path, data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if token:
            req.add_header(server.TOKEN_HEADER, token)
        for name, value in (headers or {}).items():
            req.add_header(name, value)
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.status, dict(response.headers), response.read()
        except urllib.error.HTTPError as error:
            return error.code, dict(error.headers), error.read()

    def login(self):
        status, _h, data = self.request("POST", "/api/login",
                                        body={"company": self.env.slug, "username": "admin",
                                              "password": ADMIN_PASSWORD})
        self.assertEqual(status, 200, data)
        return json.loads(data)["token"]

    def test_health_and_security_headers(self):
        status, headers, data = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data), {"ok": True})
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertIn("default-src 'self'", headers["Content-Security-Policy"])

    def test_login_then_me_with_token_header(self):
        token = self.login()
        status, _h, data = self.request("GET", "/api/me", token=token)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data)["user"]["username"], "admin")

    def test_bearer_authorization_is_accepted(self):
        token = self.login()
        status, _h, _d = self.request("GET", "/api/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(status, 200)

    def test_missing_token_is_401_json_error(self):
        status, _h, data = self.request("GET", "/api/customers")
        payload = json.loads(data)
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "authentication_required")
        self.assertTrue(payload["message"])

    def test_invalid_json_is_422(self):
        status, _h, data = self.request("POST", "/api/customers", raw=b"{not json", token=self.login())
        self.assertEqual(status, 422)
        self.assertEqual(json.loads(data)["error"], "invalid_json")

    def test_non_object_json_body_is_rejected(self):
        status, _h, data = self.request("POST", "/api/customers", raw=b"[1,2]", token=self.login())
        self.assertEqual(status, 422)

    def test_translated_message_follows_accept_language(self):
        from genesis.i18n import translate
        status, _h, data = self.request("GET", "/api/me", headers={"Accept-Language": "fr-FR,fr;q=0.9"})
        self.assertEqual(status, 401)
        self.assertEqual(json.loads(data)["message"], translate("authentication_required", "fr"))

    def test_report_export_is_a_download(self):
        token = self.login()
        status, headers, data = self.request("GET", "/api/reports/trial_balance/export?format=csv",
                                             token=token)
        self.assertEqual(status, 200)
        self.assertIn("attachment", headers["Content-Disposition"])
        self.assertIn("trial_balance-", headers["Content-Disposition"])
        self.assertTrue(headers["Content-Type"].startswith("text/csv"))
        self.assertTrue(data.startswith(b"\xef\xbb\xbf"))

    def test_static_files_cannot_escape_the_web_root(self):
        for path in ("/../genesis/server.py", "/..%2Fgenesis%2Fserver.py", "/%2e%2e/tests/helpers.py"):
            status, _h, _d = self.request("GET", path)
            self.assertEqual(status, 404, path)

    def test_unknown_static_path_is_404(self):
        status, _h, _d = self.request("GET", "/no-such-file.js")
        self.assertEqual(status, 404)

    def test_wrong_method_on_static_is_405(self):
        status, _h, _d = self.request("POST", "/index.html", body={})
        self.assertEqual(status, 405)


if __name__ == "__main__":
    unittest.main()
