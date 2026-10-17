#!/usr/bin/env python3
"""
Interactive test of the GENESIS sign-in screens in a real browser (Playwright + Chromium).

Covers: first-run setup, sign-in, wrong password, sign-out, forced password change,
and that the Content-Security-Policy does not block the application (no CSP errors).

Runs against a TEMPORARY database created for this test. The shipped genesis.db is never used.

Requirements:
  - Python package 'playwright' (pip install playwright).
  - A Chromium executable: set GENESIS_E2E_BROWSER to its path, or use Playwright's bundled
    browser (python -m playwright install chromium). Optional GENESIS_E2E_ARGS (space separated).
  - The production build in dist/ (npx vite build).
Exit code 0 = all checks passed.
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright, expect

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = int(os.environ.get('GENESIS_E2E_PORT', '47611'))
BASE = f'http://127.0.0.1:{PORT}'
SHOTS = os.environ.get('GENESIS_E2E_SHOTS', '/tmp/genesis-e2e')

ADMIN = {'company': 'E2E Test Company', 'full_name': 'E2E Administrator', 'username': 'e2e.admin',
         'password': 'E2E-Admin-Passw0rd'}
CLERK = {'username': 'e2e.clerk', 'password': 'E2E-Clerk-Passw0rd', 'new': 'E2E-Clerk-New-Passw0rd'}

results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {detail}' if detail and not ok else ''))


def wait_health(proc, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError('backend exited early')
        try:
            with urllib.request.urlopen(f'{BASE}/api/health', timeout=2) as r:
                if json.loads(r.read()).get('appId') == 'genesis-accounting':
                    return
        except Exception:
            time.sleep(0.3)
    raise RuntimeError('backend did not become ready')


def main():
    if not os.path.exists(os.path.join(ROOT, 'dist', 'index.html')):
        print('dist/index.html missing: run npx vite build first')
        return 2
    work = tempfile.mkdtemp(prefix='genesis-e2e-')
    db_path = os.path.join(work, 'genesis.db')
    os.environ['E2E_DB_PATH'] = db_path
    os.makedirs(SHOTS, exist_ok=True)
    env = dict(os.environ, GENESIS_DB_PATH=db_path, GENESIS_DIST_DIR=os.path.join(ROOT, 'dist'),
               GENESIS_HOST='127.0.0.1', GENESIS_PORT=str(PORT), NODE_ENV='production')
    server = subprocess.Popen(['node', os.path.join(ROOT, 'server', 'index.js')], cwd=ROOT, env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        wait_health(server)
        run_browser()
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
        shutil.rmtree(work, ignore_errors=True)

    failed = [r for r in results if not r[1]]
    print(f'--- {len(results) - len(failed)} passed, {len(failed)} failed ---')
    return 0 if not failed else 1


def run_browser():
    exe = os.environ.get('GENESIS_E2E_BROWSER') or None
    args = os.environ.get('GENESIS_E2E_ARGS', '').split() or ['--no-sandbox']
    with sync_playwright() as p:
        # Some sandboxes need extra shared libraries for the browser; they are passed to the browser only.
        browser_env = dict(os.environ)
        if os.environ.get('GENESIS_E2E_LIBS'):
            browser_env['LD_LIBRARY_PATH'] = os.environ['GENESIS_E2E_LIBS']
        browser = p.chromium.launch(executable_path=exe, args=args, env=browser_env, timeout=90000)
        context = browser.new_context(viewport={'width': 1280, 'height': 860})
        page = context.new_page()
        csp_errors = []
        page.on('console', lambda m: csp_errors.append(m.text) if m.type == 'error' and 'Content Security Policy' in m.text else None)
        page.on('pageerror', lambda e: csp_errors.append(str(e)) if 'Content Security Policy' in str(e) else None)
        external = []
        page.on('request', lambda r: external.append(r.url) if not r.url.startswith(BASE) and not r.url.startswith('data:') else None)

        # 1. First-run setup
        page.goto(BASE + '/')
        expect(page.get_by_text('Set up GENESIS', exact=False).first).to_be_visible(timeout=30000)
        check('first run shows the setup screen', True)
        page.get_by_label('Company name').fill(ADMIN['company'])
        page.get_by_label('Administrator full name').fill(ADMIN['full_name'])
        page.get_by_label('Username', exact=True).fill(ADMIN['username'])
        page.locator('input[type=password]').nth(0).fill(ADMIN['password'])
        page.locator('input[type=password]').nth(1).fill(ADMIN['password'])
        page.screenshot(path=os.path.join(SHOTS, '1-setup.png'))
        page.get_by_role('button', name='Create administrator and continue').click()

        # 2. Sign-in screen after setup
        expect(page.get_by_role('button', name='Sign in')).to_be_visible(timeout=30000)
        check('after setup the sign-in screen is shown', True)

        # 3. Wrong password is refused with a message, not a crash
        page.get_by_label('Username', exact=True).fill(ADMIN['username'])
        page.locator('input[type=password]').first.fill('wrong-password-123')
        page.get_by_role('button', name='Sign in').click()
        expect(page.get_by_text('Invalid username or password', exact=False).first).to_be_visible(timeout=15000)
        page.screenshot(path=os.path.join(SHOTS, '2-wrong-password.png'))
        check('wrong password shows an error and stays on sign-in', page.get_by_role('button', name='Sign in').is_visible())

        # 4. Correct sign-in reaches the application
        page.locator('input[type=password]').first.fill(ADMIN['password'])
        page.get_by_role('button', name='Sign in').click()
        user_button = page.get_by_text(ADMIN['full_name'], exact=False).first
        expect(user_button).to_be_visible(timeout=30000)
        check('correct password reaches the application', True)
        page.screenshot(path=os.path.join(SHOTS, '3-dashboard.png'))

        # 5. Sign-out returns to sign-in and ends the session
        user_button.click()
        page.get_by_role('button', name='Sign out').click()
        expect(page.get_by_role('button', name='Sign in')).to_be_visible(timeout=15000)
        token_left = page.evaluate("sessionStorage.getItem('genesis_session_token')")
        check('sign-out returns to the sign-in screen and clears the session token', token_left is None)

        # 6. Forced password change: create a clerk whose password must be changed.
        # Done through the API as the administrator, then the flag is set in the database.
        admin_token = api_login(ADMIN['username'], ADMIN['password'])
        api_post('/api/auth/users', admin_token, {'username': CLERK['username'], 'password': CLERK['password'],
                                                 'full_name': 'E2E Clerk', 'role': 'accountant'})
        mark_must_change(CLERK['username'])

        page.get_by_label('Username', exact=True).fill(CLERK['username'])
        page.locator('input[type=password]').first.fill(CLERK['password'])
        page.get_by_role('button', name='Sign in').click()
        expect(page.get_by_text('Change your password', exact=False).first).to_be_visible(timeout=30000)
        check('a user with a temporary password is asked to change it', True)
        page.screenshot(path=os.path.join(SHOTS, '4-change-password.png'))
        page.locator('input[type=password]').nth(0).fill(CLERK['password'])
        page.locator('input[type=password]').nth(1).fill(CLERK['new'])
        page.locator('input[type=password]').nth(2).fill(CLERK['new'])
        page.get_by_role('button', name='Change password').click()
        user_button = page.get_by_text('E2E Clerk', exact=False).first
        expect(user_button).to_be_visible(timeout=30000)
        check('after changing the password the application opens', True)
        user_button.click()
        page.get_by_role('button', name='Sign out').click()
        expect(page.get_by_role('button', name='Sign in')).to_be_visible(timeout=15000)

        # 7. The old password no longer works; the new one does.
        page.get_by_label('Username', exact=True).fill(CLERK['username'])
        page.locator('input[type=password]').first.fill(CLERK['password'])
        page.get_by_role('button', name='Sign in').click()
        expect(page.get_by_text('Invalid username or password', exact=False).first).to_be_visible(timeout=15000)
        check('the temporary password is refused after the change', True)
        page.locator('input[type=password]').first.fill(CLERK['new'])
        page.get_by_role('button', name='Sign in').click()
        expect(page.get_by_text('E2E Clerk', exact=False).first).to_be_visible(timeout=30000)
        check('the new password signs in', True)

        check('no Content-Security-Policy violations', not csp_errors, '; '.join(csp_errors[:3]))
        check('no requests to external hosts', not external, ', '.join(external[:3]))
        browser.close()


def api_login(username, password):
    req = urllib.request.Request(BASE + '/api/auth/login', data=json.dumps({'username': username, 'password': password}).encode(),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())['token']


def api_post(route, token, body):
    req = urllib.request.Request(BASE + route, data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'}, method='POST')
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def mark_must_change(username):
    # The database path is the temporary one used by the server started in main().
    db = sqlite3.connect(os.environ['E2E_DB_PATH'])
    db.execute('UPDATE users SET must_change_password = 1 WHERE username = ?', (username,))
    db.commit()
    db.close()


if __name__ == '__main__':
    sys.exit(main())
