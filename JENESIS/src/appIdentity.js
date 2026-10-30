/**
 * appIdentity.js — the three JENESIS applications.
 *
 * JEN 0.2 shipped as one program with role-based permissions. This module adds
 * the product decision JENESIS is built around: three distinct applications,
 * each with its own name, colour, menu and remembered theme, all sharing one
 * database and one accounting engine.
 *
 *   JENESIS Seller      — red   — selling: sales, receipts, customers
 *   JENESIS Maintenance — green — upkeep: inventory, network, backups, logs
 *   JENESIS Admin       — blue  — everything: accounting, purchases, reports
 *
 * This file holds no React and touches no DOM by itself, so the rules are
 * unit-tested in Node (tests/app-identity.test.js).
 */

/** The three applications, in the order they are offered to the user. */
export const APP_IDS = ['seller', 'maintenance', 'admin'];

/**
 * Everything that makes an application itself. `views` are the screens it
 * offers; `accent` mirrors the tokens bound in src/index.css so the interface
 * and the logo always carry the same colour.
 */
export const APPS = {
  seller: {
    id: 'seller',
    nameKey: 'identity.seller_name',
    shortKey: 'identity.seller_short',
    purposeKey: 'identity.seller_purpose',
    colour: 'red',
    tone: 'seller',
    iconIco: 'build/icon-seller.ico',
    iconPng: 'build/icon-seller.png',
    favicon: '/favicon-seller.png',
    accent: { light: '#dc2626', dark: '#f87171', deep: '#450a0a' },
    defaultView: 'sales',
    views: ['dashboard', 'sales', 'customers', 'inventory', 'help']
  },
  maintenance: {
    id: 'maintenance',
    nameKey: 'identity.maintenance_name',
    shortKey: 'identity.maintenance_short',
    purposeKey: 'identity.maintenance_purpose',
    colour: 'green',
    tone: 'maintenance',
    iconIco: 'build/icon-maintenance.ico',
    iconPng: 'build/icon-maintenance.png',
    favicon: '/favicon-maintenance.png',
    accent: { light: '#16a34a', dark: '#4ade80', deep: '#052e16' },
    defaultView: 'maintenance',
    views: ['dashboard', 'inventory', 'maintenance', 'help']
  },
  admin: {
    id: 'admin',
    nameKey: 'identity.admin_name',
    shortKey: 'identity.admin_short',
    purposeKey: 'identity.admin_purpose',
    colour: 'blue',
    tone: 'admin',
    iconIco: 'build/icon-admin.ico',
    iconPng: 'build/icon-admin.png',
    favicon: '/favicon-admin.png',
    accent: { light: '#2563eb', dark: '#60a5fa', deep: '#0b1f4b' },
    defaultView: 'dashboard',
    views: [
      'dashboard', 'sales', 'purchases', 'inventory', 'customers', 'suppliers',
      'banking', 'accounting', 'reports', 'settings', 'maintenance', 'help'
    ]
  }
};

/** The product mark itself (used before an application is chosen). */
export const PRODUCT = {
  id: 'jenesis',
  name: 'JENESIS',
  tone: 'brand',
  iconIco: 'build/icon.ico',
  iconPng: 'build/icon.png',
  favicon: '/favicon.png',
  accent: { light: '#1d4ed8', dark: '#60a5fa', deep: '#0b1f4b' }
};

/** Where the launcher remembers the last application the user opened. */
export const APP_STORAGE_KEY = 'jenesis_app';

/** Where each application remembers its own Light/Dark/System choice. */
export function themeStorageKey(appId) {
  return `jenesis_theme:${appId || 'admin'}`;
}

/**
 * The single key used before the three applications existed. It is still read
 * (by the Admin application only) so nobody loses the theme they chose.
 */
export const LEGACY_THEME_STORAGE_KEY = 'jenesis_theme';

/** True for a value that names one of the three applications. */
export function isAppId(value) {
  return APP_IDS.includes(value);
}

/**
 * Resolves an application id from a command-line switch or a stored choice.
 * Unrecognised input yields null, which means "ask the user which application".
 */
export function resolveAppId(candidate) {
  if (typeof candidate !== 'string') return null;
  const value = candidate.trim().toLowerCase();
  if (isAppId(value)) return value;
  // Accept the spellings a shortcut might contain: --app=Seller, JENESIS-Seller,
  // "JENESIS Seller", "seller.exe".
  const cleaned = value.replace(/^jenesis[-\s]*/, '').replace(/\.exe$/, '').trim();
  if (isAppId(cleaned)) return cleaned;
  return null;
}

/** The application identity, falling back to the product mark. */
export function getApp(appId) {
  return APPS[appId] || null;
}

/** Every screen the application offers, in menu order. */
export function viewsForApp(appId) {
  const app = APPS[appId];
  return app ? app.views.slice() : [];
}

/**
 * The screen a user lands on. A remembered screen is honoured when the
 * application offers it, so re-opening JENESIS Seller returns to Sales.
 */
export function landingViewFor(appId, rememberedView) {
  const views = viewsForApp(appId);
  if (rememberedView && views.includes(rememberedView)) return rememberedView;
  const app = APPS[appId];
  return app ? app.defaultView : 'dashboard';
}

/**
 * Hard rule, enforced in the interface as well as in the menu: an application
 * never renders a screen it does not own. The backend enforces permissions
 * independently, so this is a second gate, not the only one.
 */
export function canOpenView(appId, viewId) {
  return viewsForApp(appId).includes(viewId);
}

/** Read `--app=seller` (or a bare `seller`) out of a command line. */
export function appIdFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  for (const arg of argv) {
    if (typeof arg !== 'string') continue;
    const match = arg.match(/^--app[=:\s]+(.+)$/i);
    if (match) {
      const resolved = resolveAppId(match[1]);
      if (resolved) return resolved;
    }
  }
  // A bare word (for example a launcher invoked as `JENESIS seller`).
  for (const arg of argv) {
    const resolved = resolveAppId(arg);
    if (resolved) return resolved;
  }
  return null;
}

/**
 * The window title of an application, in the shape Windows shows it:
 * "JENESIS Seller" / "JENESIS Maintenance" / "JENESIS Admin".
 */
export function appTitle(appId) {
  const app = APPS[appId];
  if (!app) return PRODUCT.name;
  return `JENESIS ${appId.charAt(0).toUpperCase()}${appId.slice(1)}`;
}

/**
 * Electron uses this to keep the three applications apart in the taskbar, so
 * each one gets its own pinned icon instead of sharing a single group.
 */
export function appUserModelId(appId) {
  return `com.jenesis.accounting.${appId || 'admin'}`;
}
