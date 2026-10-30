import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  APP_IDS,
  APP_STORAGE_KEY,
  APPS,
  PRODUCT,
  appIdFromArgv,
  appTitle,
  canOpenView,
  isAppId,
  landingViewFor,
  resolveAppId,
  viewsForApp
} from '../appIdentity';

/**
 * AppModeContext — which of the three JENESIS applications this window is.
 *
 * The desktop shortcut passes the application on the command line
 * (`JENESIS.exe --app=seller`); the portable build and a browser fall back to
 * the remembered choice. When neither exists — first launch of the portable
 * package, or the plain shortcut — the window shows the launcher, which offers
 * the three applications as cards instead of guessing.
 */
const AppModeContext = createContext(null);

export const LAUNCHER = 'launcher';

function readStoredApp() {
  try {
    return resolveAppId(window.localStorage?.getItem(APP_STORAGE_KEY));
  } catch (_) {
    return null;
  }
}

/** The application given by the desktop shell (preload) or by the URL. */
function readRequestedApp() {
  if (typeof window === 'undefined') return null;
  const bridge = window.genesisDesktop || window.jenesisDesktop;
  const fromBridge = resolveAppId(bridge?.app);
  if (fromBridge) return fromBridge;
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('app');
    const resolved = resolveAppId(fromQuery);
    if (resolved) return resolved;
  } catch (_) { /* no query string */ }
  return null;
}

export function AppModeProvider({ children }) {
  // The command line wins: it is what the shortcut says, every time.
  const [appId, setAppIdState] = useState(() => readRequestedApp() || null);
  const [remembered, setRemembered] = useState(() => readStoredApp());

  // A window opened without a command-line application shows the launcher,
  // unless this computer already chose one before (portable use).
  const effectiveAppId = appId || (remembered && !readRequestedApp() ? remembered : null);

  const setAppId = useCallback((next) => {
    const resolved = resolveAppId(next);
    if (!resolved) return;
    setAppIdState(resolved);
    setRemembered(resolved);
    try {
      window.localStorage?.setItem(APP_STORAGE_KEY, resolved);
    } catch (_) { /* storage is optional */ }
  }, []);

  const clearAppId = useCallback(() => {
    setAppIdState(null);
    setRemembered(null);
    try {
      window.localStorage?.removeItem(APP_STORAGE_KEY);
    } catch (_) { /* storage is optional */ }
  }, []);

  // Paint the identity before anything draws: the accent tokens and the favicon
  // depend on `data-app`, and the window title is part of the identity too.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (effectiveAppId) root.setAttribute('data-app', effectiveAppId);
    else root.removeAttribute('data-app');
    document.title = effectiveAppId
      ? `${appTitle(effectiveAppId)} — ${PRODUCT.name}`
      : `${PRODUCT.name} — Professional Business Accounting & Management Software`;

    const app = effectiveAppId ? APPS[effectiveAppId] : null;
    const icon = app ? app.favicon : PRODUCT.favicon;
    let link = document.querySelector('link[rel="icon"][data-jenesis="true"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'icon');
      link.setAttribute('data-jenesis', 'true');
      document.head.appendChild(link);
    }
    link.setAttribute('href', icon);
  }, [effectiveAppId]);

  const value = useMemo(
    () => ({
      /** 'seller' | 'maintenance' | 'admin' | null (launcher) */
      appId: effectiveAppId,
      /** The identity of the running application, or the product mark. */
      app: effectiveAppId ? APPS[effectiveAppId] : null,
      /** True while no application has been chosen. */
      isLauncher: !effectiveAppId,
      product: PRODUCT,
      appIds: APP_IDS,
      setAppId,
      clearAppId,
      canOpen: (viewId) => (effectiveAppId ? canOpenView(effectiveAppId, viewId) : false),
      views: () => viewsForApp(effectiveAppId),
      landingView: (rememberedView) => landingViewFor(effectiveAppId, rememberedView)
    }),
    [effectiveAppId, setAppId, clearAppId]
  );

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode() {
  const context = useContext(AppModeContext);
  if (!context) {
    throw new Error('useAppMode must be used inside <AppModeProvider>');
  }
  return context;
}

/** Helper for tests and the Electron main process. */
export { appIdFromArgv, isAppId, appTitle, LAUNCHER as LAUNCHER_MODE };
