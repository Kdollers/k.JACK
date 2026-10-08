// HTTP client. Every request carries the session token and the reader's language.

const TOKEN_KEY = "genesis.token";

export const session = {
  token: sessionStorage.getItem(TOKEN_KEY) || "",
  lang: "en",
  company: null,
  user: null,
  permissions: [],
};

export function setToken(token) {
  session.token = token || "";
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload.message || payload.error || `HTTP ${status}`);
    this.status = status;
    this.key = payload.error || "";
  }
}

function buildUrl(path, query) {
  const url = new URL(path, window.location.origin);
  for (const [name, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, value);
  }
  return url;
}

function headers(extra) {
  const result = { "Accept-Language": session.lang, ...(extra || {}) };
  if (session.token) result["X-Genesis-Token"] = session.token;
  return result;
}

async function readError(response) {
  try {
    return await response.json();
  } catch (_error) {
    return {};
  }
}

export async function api(method, path, body, query) {
  const init = { method, headers: headers() };
  if (body !== undefined) {
    init.headers = headers({ "Content-Type": "application/json" });
    init.body = JSON.stringify(body);
  }
  const response = await fetch(buildUrl(path, query), init);
  if (!response.ok) throw new ApiError(response.status, await readError(response));
  return response.json();
}

// Fetch a file or HTML page with the token, then hand it to the browser.
export async function fetchBlob(path, query) {
  const response = await fetch(buildUrl(path, query), { headers: headers() });
  if (!response.ok) throw new ApiError(response.status, await readError(response));
  const filename = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") || "")?.[1] || "";
  return { blob: await response.blob(), filename };
}

export async function download(path, query, fallbackName) {
  const { blob, filename } = await fetchBlob(path, query);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename || fallbackName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export async function openPrint(path, query) {
  const { blob } = await fetchBlob(path, query);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function loadDictionary(lang) {
  const response = await fetch(`/api/i18n/${encodeURIComponent(lang)}`);
  return response.json();
}
