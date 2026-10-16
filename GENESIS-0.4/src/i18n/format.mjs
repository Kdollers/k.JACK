// Presentation only: never round or mutate ledger values in storage.
export const LOCALE_BY_LANG = { en: 'en-GB', fr: 'fr-FR', rw: 'rw-RW' };
const localeOf = (lang) => LOCALE_BY_LANG[lang] || LOCALE_BY_LANG.en;

export function formatNumber(value, lang = 'en', digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return new Intl.NumberFormat(localeOf(lang), {
    minimumFractionDigits: digits, maximumFractionDigits: digits
  }).format(number);
}

export function formatMoney(value, company, lang = 'en') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const decimals = Math.max(0, Math.min(6, Number(company?.currency_decimals ?? 2) || 0));
  const code = company?.currency_code || 'USD';
  const symbol = company?.currency_symbol || code;
  try {
    // Use the company's configured currency, not the selected UI language's
    // currency. Intl places the symbol and negative sign according to locale.
    return new Intl.NumberFormat(localeOf(lang), {
      style: 'currency', currency: code, currencyDisplay: 'code',
      minimumFractionDigits: decimals, maximumFractionDigits: decimals
    }).formatToParts(number).map((part) => part.type === 'currency' ? symbol : part.value).join('');
  } catch {
    return `${symbol} ${formatNumber(number, lang, decimals)}`;
  }
}

// Date inputs use the local calendar day, not UTC's date (which can differ near midnight).
export function inputDate(value = new Date()) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  const pad = (v) => String(v).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    const result = new Date(y, m - 1, d, 12);
    return result.getFullYear() === y && result.getMonth() + 1 === m && result.getDate() === d ? result : null;
  }
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? value.replace(' ', 'T') + 'Z' : value;
  const result = new Date(normalized);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function formatDate(value, lang = 'en') {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat(localeOf(lang), {
    year: 'numeric', month: 'short', day: 'numeric'
  }).format(date) : String(value || '');
}

export function formatDateTime(value, lang = 'en') {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat(localeOf(lang), {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(date) : String(value || '');
}

export function formatPercent(value, lang = 'en', digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return new Intl.NumberFormat(localeOf(lang), {
    style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits
  }).format(number / 100);
}
