import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest, setSessionToken, getSessionToken, setUnauthorizedHandler } from '../services/api';
import { useI18n } from '../i18n';
import { formatMoney, formatDate as localizedDate, formatDateTime as localizedDateTime, formatNumber as localizedNumber, formatPercent as localizedPercent } from '../i18n/format.mjs';
import { appModeFromPath } from '../config/appMode.mjs';
const requestedMode = appModeFromPath(window.location.pathname);

const AppContext = createContext();

/**
 * Authentication states:
 *  - 'checking'        : startup, contacting the backend
 *  - 'setup'           : no administrator exists yet (first run)
 *  - 'login'           : sign-in required
 *  - 'recovery'        : existing data/no usable administrator; never public setup
 *  - 'change-password' : signed in, but the password must be changed first
 *  - 'ready'           : signed in and usable
 *  - 'error'           : the backend could not be reached
 */
export function AppProvider({ children }) {
  const { lang } = useI18n();
  const [authState, setAuthState] = useState('checking');
  const [authError, setAuthError] = useState(null);
  const [currentCompany, setCurrentCompany] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeView, setActiveView] = useState('dashboard');
  const [appMode, setAppMode] = useState(requestedMode);
  const [toast, setToast] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loading = authState === 'checking';

  const showToast = (message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  const hasPermission = useCallback((perm) => permissions.includes(perm), [permissions]);

  const applySignedIn = (me) => {
    if (requestedMode !== 'general' && me.mode !== requestedMode) {
      setSessionToken(null);
      setAuthState('login');
      return;
    }
    setAppMode(me.mode || requestedMode);
    setCurrentUser(me.user);
    setCurrentCompany(me.company || null);
    setCompanies(me.companies || (me.company ? [me.company] : []));
    setPermissions(me.permissions || []);
    setAuthState(me.user.must_change_password ? 'change-password' : 'ready');
  };

  const signOutLocally = useCallback((message) => {
    setSessionToken(null);
    setCurrentUser(null);
    setCurrentCompany(null);
    setCompanies([]);
    setPermissions([]);
    setUsers([]);
    setActiveView('dashboard');
    setAuthState('login');
    if (message) setAuthError(message);
  }, []);

  // Any 401 from the API returns the user to sign-in (the server is the source of truth).
  useEffect(() => {
    setUnauthorizedHandler(({ status, code }) => {
      if (code === 'PASSWORD_CHANGE_REQUIRED') {
        setAuthState('change-password');
        return;
      }
      if (status === 401) signOutLocally({ code: 'SESSION_EXPIRED' });
    });
    return () => setUnauthorizedHandler(null);
  }, [signOutLocally]);

  // Startup: decide between setup, sign-in, and the application.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const status = await apiRequest('/api/setup/status');
        if (cancelled) return;
        if (status.needsSetup) {
          setSessionToken(null);
          setAuthState('setup');
          return;
        }
        if (status.recoveryRequired) {
          setSessionToken(null);
          setAuthState('recovery');
          return;
        }
        if (!getSessionToken()) {
          setAuthState('login');
          return;
        }
        const me = await apiRequest('/api/auth/me');
        if (cancelled) return;
        applySignedIn(me);
      } catch (err) {
        if (cancelled) return;
        if (err.status === 401) {
          signOutLocally(null);
        } else {
          console.error('Failed to initialise the application', err);
          setAuthError(err);
          setAuthState('error');
        }
      }
    }
    init();
    return () => { cancelled = true; };
  }, [signOutLocally]);

  // Refresh the company and, for administrators, the user list.
  useEffect(() => {
    if (authState !== 'ready') return;
    let cancelled = false;
    (async () => {
      try {
        const me = await apiRequest('/api/auth/me');
        if (!cancelled) {
          setCurrentCompany(me.company || null);
          setCompanies(me.companies || (me.company ? [me.company] : []));
          setPermissions(me.permissions || []);
        }
        if ((me.permissions || []).includes('users:manage')) {
          const list = await apiRequest('/api/auth/users');
          if (!cancelled) setUsers(list);
        } else if (!cancelled) {
          setUsers([]);
        }
      } catch (err) {
        console.error('Failed to refresh application context', err);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey, authState]);

  const login = async (username, password) => {
    setAuthError(null);
    const res = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, mode: requestedMode })
    });
    setSessionToken(res.token);
    const me = await apiRequest('/api/auth/me');
    applySignedIn(me);
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (_) { /* session may already be gone */ }
    signOutLocally(null);
  };

  const completeSetup = async (form) => {
    setAuthError(null);
    await apiRequest('/api/setup/initialize', { method: 'POST', body: JSON.stringify(form) });
    setAuthState('login');
  };

  const changePassword = async (currentPassword, newPassword) => {
    await apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });
    const me = await apiRequest('/api/auth/me');
    applySignedIn(me);
  };

  const switchCompany = async (comp) => {
    if (!comp?.id || comp.id === currentCompany?.id) return;
    const result = await apiRequest('/api/auth/switch-company', {
      method: 'POST', body: JSON.stringify({ company_id: comp.id })
    });
    setSessionToken(result.token);
    // A full renderer reload clears pending queries and cached data from the
    // previous company. Merely replacing the name in a dropdown is not safe.
    window.location.reload();
  };

  const formatCurrency = (val) => formatMoney(val, currentCompany, lang);
  const formatDate = (val) => localizedDate(val, lang);
  const formatDateTime = (val) => localizedDateTime(val, lang);
  const formatNumber = (val, digits = 0) => localizedNumber(val, lang, digits);
  const formatPercent = (val, digits = 1) => localizedPercent(val, lang, digits);

  return (
    <AppContext.Provider
      value={{
        authState,
        authError,
        showRecovery: () => setAuthState('recovery'),
        showLogin: () => setAuthState('login'),
        login,
        logout,
        completeSetup,
        changePassword,
        hasPermission,
        permissions,
        appMode,
        currentCompany,
        setCurrentCompany,
        companies,
        switchCompany,
        currentUser,
        setCurrentUser,
        users,
        activeView,
        setActiveView,
        toast,
        showToast,
        formatCurrency,
        formatDate,
        formatDateTime,
        formatNumber,
        formatPercent,
        triggerRefresh,
        refreshKey,
        loading
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
}
