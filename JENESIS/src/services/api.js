/**
 * API client. Every request carries the session bearer token. The token is kept in
 * sessionStorage (cleared when the window closes) and is never trusted as identity by the
 * backend beyond its session lookup.
 *
 * By default it talks to the JENESIS service running on this computer (same
 * origin). JENESIS Maintenance can point it at another computer on the network
 * instead — that is how several computers share one company and one Messenger.
 * When a remote address is set, requests are absolute and cross-origin; the
 * server only answers for loopback origins and always requires a session token.
 */
const TOKEN_KEY = 'genesis_session_token';
const SERVER_URL_KEY = 'jenesis_server_url';

/**
 * The address of the JENESIS service, or '' for "the service on this computer".
 * Stored per browser profile, so each window keeps its own choice.
 */
export function getServerUrl() {
  try {
    return (localStorage.getItem(SERVER_URL_KEY) || '').trim();
  } catch (_) {
    return '';
  }
}

/** Sets (or clears, with '') the address of a JENESIS service on the network. */
export function setServerUrl(url) {
  const value = String(url || '').trim().replace(/\/+$/, '');
  try {
    if (value) localStorage.setItem(SERVER_URL_KEY, value);
    else localStorage.removeItem(SERVER_URL_KEY);
  } catch (_) { /* storage is optional */ }
  return value;
}

/** True when this window is using another computer's service. */
export function isRemoteServer() {
  return getServerUrl() !== '';
}

/** Resolves a relative API path against the configured service. */
export function apiUrl(path) {
  const base = getServerUrl();
  if (!base) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

let unauthorizedHandler = null;

export function getSessionToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setSessionToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

/** AppContext registers a handler that returns the user to the sign-in screen. */
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Fills {placeholders} in a translated message from server-provided details. */
export function interpolateVars(str, vars) {
  if (!vars) return str;
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

/**
 * Translates a server error into the active language. Business failures carry a
 * stable machine `code`; the matching errors.CODE dictionary entry wins, and the
 * original English message is the fallback so nothing is ever lost.
 */
export function translateError(t, err) {
  if (!err) return '';
  if (err.code) {
    const key = `errors.${err.code}`;
    const translated = t(key, null);
    if (translated && translated !== key) return interpolateVars(translated, err.details);
  }
  if (err.status === 403) return t('errors.FORBIDDEN', err.message);
  return err.message || String(err);
}

export async function apiRequest(url, options = {}) {
  const token = getSessionToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(apiUrl(url), { ...options, headers });

  const contentType = response.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const code = data && typeof data === 'object' ? data.code : undefined;
    const details = data && typeof data === 'object' ? data.details : undefined;
    const message = (data && typeof data === 'object' && data.error) || (typeof data === 'string' && data) || 'API Request Failed';
    if ((response.status === 401 || code === 'PASSWORD_CHANGE_REQUIRED') && unauthorizedHandler) {
      unauthorizedHandler({ status: response.status, code });
    }
    throw new ApiError(message, { status: response.status, code, details });
  }

  return data;
}

/** Downloads a file from an authenticated endpoint (plain navigation cannot send the token). */
export async function downloadAuthenticated(url, fallbackName) {
  const token = getSessionToken();
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    let message = 'Download failed';
    try { message = (await response.json()).error || message; } catch (_) { /* not JSON */ }
    if (response.status === 401 && unauthorizedHandler) unauthorizedHandler({ status: 401 });
    throw new ApiError(message, { status: response.status });
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const name = match ? match[1] : fallbackName;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.setAttribute('download', name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
