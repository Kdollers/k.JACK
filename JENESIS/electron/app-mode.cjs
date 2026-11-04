'use strict';
/**
 * app-mode.cjs — which of the four JENESIS applications a window is.
 *
 * The Electron main process is CommonJS, so it cannot import the ES module the
 * renderer uses (src/appIdentity.js). This file mirrors exactly the rules that
 * matter to the desktop shell; tests/four-apps.test.js asserts the two
 * implementations agree, so a change in one that forgets the other fails the
 * suite.
 *
 * The four applications:
 *   seller      -> JENESIS Seller                  (red)
 *   maintenance -> JENESIS Network & Maintenance   (green)
 *   admin       -> JENESIS Accounting & Business   (blue)
 *   settings    -> JENESIS Settings & Access Point (yellow)
 */
const APP_IDS = ['seller', 'maintenance', 'admin', 'settings'];

/**
 * The full application names, in the shape Windows shows them: the title bar,
 * the desktop shortcut and the Start Menu entry. Mirrors APP_TITLES in
 * src/appIdentity.js — the test suite compares the two.
 */
const APP_TITLES = {
  seller: 'JENESIS Seller',
  maintenance: 'JENESIS Network & Maintenance',
  admin: 'JENESIS Accounting & Business',
  settings: 'JENESIS Settings & Access Point'
};

function isAppId(value) {
  return APP_IDS.includes(value);
}

/** Normalises "Seller", "JENESIS-Seller", "seller.exe" -> "seller". */
function resolveAppId(candidate) {
  if (typeof candidate !== 'string') return null;
  const value = candidate.trim().toLowerCase();
  if (isAppId(value)) return value;
  const cleaned = value
    .replace(/^--app[=:\s]+/, '')
    .replace(/^jenesis[-\s]*/, '')
    .replace(/\.exe$/, '')
    .trim();
  return isAppId(cleaned) ? cleaned : null;
}

/** Reads the application out of a command line (--app=seller or a bare word). */
function appIdFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  for (const arg of argv) {
    if (typeof arg !== 'string') continue;
    const match = arg.match(/^--app[=:\s]+(.+)$/i);
    if (match) {
      const resolved = resolveAppId(match[1]);
      if (resolved) return resolved;
    }
  }
  for (const arg of argv) {
    const resolved = resolveAppId(arg);
    if (resolved) return resolved;
  }
  return null;
}

function appTitle(appId) {
  return APP_TITLES[appId] || 'JENESIS';
}

/** Windows keeps the four applications apart in the taskbar by this id. */
function appUserModelId(appId) {
  return `com.jenesis.accounting.${appId || 'launcher'}`;
}

/** The application's own icon files (built by .merge-work/make_logo.py). */
function iconFiles(appId) {
  const suffix = isAppId(appId) ? `-${appId}` : '';
  return { ico: `build/icon${suffix}.ico`, png: `build/icon${suffix}.png` };
}

/** The URL the window loads: the mode travels as a query the renderer reads. */
function windowUrl(baseUrl, appId) {
  const base = String(baseUrl || '').replace(/\?.*$/, '');
  return isAppId(appId) ? `${base}?app=${appId}` : base;
}

module.exports = {
  APP_IDS,
  APP_TITLES,
  isAppId,
  resolveAppId,
  appIdFromArgv,
  appTitle,
  appUserModelId,
  iconFiles,
  windowUrl
};
