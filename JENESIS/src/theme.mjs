/**
 * JENESIS theme management — the single source of truth for Light Mode,
 * Dark Mode and "follow the system".
 *
 * This module deliberately contains no React and no DOM-of-its-own: it takes
 * the storage and document objects it needs as arguments, so the rules can be
 * unit tested in Node (tests/theme.test.js) without a browser.
 *
 * Nothing here touches the backend, the database or accounting data. The theme
 * is a presentation preference stored under the JENESIS key in localStorage,
 * which Electron persists per user profile.
 */

/** The three choices offered in Settings. */
export const THEME_PREFERENCES = ['light', 'dark', 'system'];

/** Used when nothing has been stored yet. */
export const DEFAULT_THEME_PREFERENCE = 'light';

/** Where the choice is persisted (per user profile / browser storage). */
export const THEME_STORAGE_KEY = 'jenesis_theme';

/** The class the CSS token layer hangs off. */
export const DARK_CLASS = 'dark';

export const THEME_LABELS = {
  light: 'Light Mode',
  dark: 'Dark Mode',
  system: 'System Default',
};

/**
 * Anything unknown (old values, typos, missing storage) becomes a valid
 * preference; Light Mode is the documented default.
 */
export function normalizeThemePreference(value) {
  return THEME_PREFERENCES.includes(value) ? value : DEFAULT_THEME_PREFERENCE;
}

/**
 * Turn a stored preference into the theme that should actually be painted.
 * `systemPrefersDark` is the operating system's current preference, which is
 * only consulted when the user asked to follow the system.
 */
export function resolveTheme(preference, systemPrefersDark = false) {
  const pref = normalizeThemePreference(preference);
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

export function isDarkTheme(preference, systemPrefersDark = false) {
  return resolveTheme(preference, systemPrefersDark) === 'dark';
}

export function readThemePreference(storage) {
  try {
    return normalizeThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch (_) {
    // Storage can be unavailable (private mode, disabled cookies, quota).
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function writeThemePreference(storage, preference) {
  const value = normalizeThemePreference(preference);
  try {
    storage?.setItem(THEME_STORAGE_KEY, value);
  } catch (_) {
    /* the in-memory theme still applies for this session */
  }
  return value;
}

/**
 * Paint the theme on the document element. Accepts any object shaped like
 * document.documentElement so it can be exercised without a DOM.
 */
export function applyTheme(element, theme) {
  const dark = theme === 'dark';
  if (!element) return dark;
  const attr = (name, value) => {
    if (typeof element.setAttribute === 'function') element.setAttribute(name, value);
  };

  if (element.classList && typeof element.classList.toggle === 'function') {
    element.classList.toggle(DARK_CLASS, dark);
  } else if (element.classList) {
    if (dark) element.classList.add(DARK_CLASS);
    else element.classList.remove(DARK_CLASS);
  }

  attr('data-theme', theme);
  if (element.style) element.style.colorScheme = theme;
  return dark;
}

/**
 * The header button flips between the two explicit themes: clicking it is a
 * deliberate choice, so "follow the system" is dropped in favour of whatever
 * the user is looking at right now.
 */
export function toggleTheme(preference, systemPrefersDark = false) {
  return resolveTheme(preference, systemPrefersDark) === 'dark' ? 'light' : 'dark';
}

/** True when the media query says the operating system wants a dark UI. */
export function systemPrefersDarkFrom(mediaQuery) {
  try {
    return Boolean(mediaQuery && mediaQuery.matches);
  } catch (_) {
    return false;
  }
}

export const PREFERS_DARK_QUERY = '(prefers-color-scheme: dark)';
