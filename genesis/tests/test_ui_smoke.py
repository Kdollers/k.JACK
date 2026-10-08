"""Runs the headless browser-client smoke test (tests/ui/smoke.mjs) against a live server.

Needs Node.js and the jsdom dev dependency (``cd tests/ui && npm install``). The tests are
skipped, not failed, when either is missing, so the Python suite stays runnable on its own.
"""

import os
import shutil
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path

from genesis import server
from genesis.app import Application
from tests.helpers import ADMIN_PASSWORD, Env
from tests.test_documents import make_customer, make_product, stock_in

UI_DIR = Path(__file__).resolve().parent / "ui"


def run_smoke(app, **extra):
    """Serve ``app`` on a free port and run the browser smoke test against it."""
    httpd = server.make_server(app, "127.0.0.1", 0)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        environment = dict(os.environ, GENESIS_URL=f"http://127.0.0.1:{httpd.server_address[1]}/",
                           GENESIS_USER="admin", GENESIS_PASSWORD=ADMIN_PASSWORD, **extra)
        return subprocess.run(["node", "smoke.mjs"], cwd=UI_DIR, env=environment,
                              capture_output=True, text=True, timeout=240)
    finally:
        httpd.shutdown()
        httpd.server_close()


@unittest.skipUnless(shutil.which("node"), "node is not installed")
@unittest.skipUnless((UI_DIR / "node_modules" / "jsdom").is_dir(), "run 'npm install' in tests/ui first")
class UiSmokeTests(unittest.TestCase):
    def test_client_signs_in_navigates_translates_and_saves(self):
        env = Env()
        try:
            # Data the browser workflow uses: a customer and a stocked product priced at 1500.
            make_customer(env, "Sales Harness Customer")
            product = make_product(env, "UI-SKU-1", price=1500, cost=1000)
            stock_in(env, product, 50, 1000)
            result = run_smoke(env.app, GENESIS_MODE="signin", GENESIS_COMPANY=env.slug)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("checks passed", result.stdout)
        finally:
            env.close()

    def test_first_run_creates_the_company_in_the_browser(self):
        data_dir = Path(tempfile.mkdtemp(prefix="genesis-setup-"))
        app = Application(data_dir)
        try:
            self.assertFalse(app.has_companies())
            result = run_smoke(app, GENESIS_MODE="setup")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("checks passed", result.stdout)
            self.assertTrue(app.has_companies())
        finally:
            app.close()
            shutil.rmtree(data_dir, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
