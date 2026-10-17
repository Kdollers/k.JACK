/**
 * API client. Every request carries the session bearer token. The token is kept in
 * sessionStorage (cleared when the window closes) and is never trusted as identity by the
 * backend beyond its session lookup.
 */
const TOKEN_KEY = 'genesis_session_token';

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
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest(url, options = {}) {
  const token = getSessionToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(url, { ...options, headers });

  const contentType = response.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const code = data && typeof data === 'object' ? data.code : undefined;
    const message = (data && typeof data === 'object' && data.error) || (typeof data === 'string' && data) || 'API Request Failed';
    if ((response.status === 401 || code === 'PASSWORD_CHANGE_REQUIRED') && unauthorizedHandler) {
      unauthorizedHandler({ status: response.status, code });
    }
    throw new ApiError(message, { status: response.status, code });
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
