import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import {
  PREFERS_DARK_QUERY,
  normalizeThemePreference,
  readThemePreference,
  resolveTheme,
  systemPrefersDarkFrom,
  toggleTheme as nextThemePreference,
  applyTheme,
  themeStorageKey,
  writeThemePreference,
} from '../theme.mjs';

const ThemeContext = createContext(null);

const getStorage = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch (_) {
    return null; // storage disabled
  }
};

/**
 * Central theme manager.
 *
 * Every control that changes the appearance (the Settings screen, the header
 * button, the sign-in screen) goes through this provider, so there is exactly
 * one place where the preference is stored, resolved and painted.
 */
export function ThemeProvider({ children, appId = null }) {
  // Initialised from storage, so the very first render already uses the saved
  // theme (index.html applies the same rules before the first paint).
  // `appId` scopes the preference: each application remembers its own choice.
  const [preference, setPreferenceState] = useState(() =>
    readThemePreference(getStorage(), appId)
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    systemPrefersDarkFrom(
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia(PREFERS_DARK_QUERY)
        : null
    )
  );

  // Follow the operating system while "System Default" is selected.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia(PREFERS_DARK_QUERY);
    const onChange = (event) => setSystemPrefersDark(Boolean(event.matches));

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    if (typeof query.addListener === 'function') {
      query.addListener(onChange);
      return () => query.removeListener(onChange);
    }
    return undefined;
  }, []);

  // Another JENESIS window changed the theme: keep this one in step (only for
  // the same application — the Seller window must not follow the Admin window).
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const key = themeStorageKey(appId);
    const onStorage = (event) => {
      if (event && event.key && event.key !== key) return;
      setPreferenceState(readThemePreference(getStorage(), appId));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [appId]);

  // Switching application reloads the preference that belongs to it.
  useEffect(() => {
    setPreferenceState(readThemePreference(getStorage(), appId));
  }, [appId]);

  const theme = resolveTheme(preference, systemPrefersDark);

  // Paint before the browser draws, so switching never flashes the old theme.
  useLayoutEffect(() => {
    applyTheme(document.documentElement, theme);

    // Let the Electron shell follow too: it tints the window background (no
    // white flash on the next launch) and keeps native dialogs consistent.
    const desktop = typeof window === 'undefined' ? null : window.genesisDesktop;
    if (desktop && typeof desktop.setTheme === 'function') {
      try {
        desktop.setTheme(preference);
      } catch (_) {
        /* the desktop bridge is optional */
      }
    }
  }, [theme, preference]);

  const setPreference = useCallback((next) => {
    setPreferenceState(writeThemePreference(getStorage(), normalizeThemePreference(next), appId));
  }, [appId]);

  const toggleTheme = useCallback(() => {
    setPreference(nextThemePreference(preference, systemPrefersDark));
  }, [preference, systemPrefersDark, setPreference]);

  const value = useMemo(
    () => ({
      preference,
      theme,
      isDark: theme === 'dark',
      systemPrefersDark,
      setPreference,
      toggleTheme,
    }),
    [preference, theme, systemPrefersDark, setPreference, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
