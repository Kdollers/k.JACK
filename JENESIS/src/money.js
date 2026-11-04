/**
 * money.js — the one place JENESIS decides how an amount of money reads.
 *
 * Before this module every screen built its own string, and a company whose
 * currency is written as a code — XFA, RWF, USD, EUR, FCFA — saw the code
 * pushed against the digits with no space at all: "1 400,00XFA". The amount
 * and the currency must be separated, and a code belongs behind the amount
 * while a graphic sign ($, €, £, ₣) belongs in front of it, which is the
 * convention of the currency itself.
 *
 * This file holds no React and touches no DOM, so the rules are unit-tested
 * in Node (tests/money-format.test.js).
 *
 * It is DISPLAY ONLY. It never rounds, converts or stores anything: the
 * number it is given is the number that is printed, with the company's own
 * number of decimals. Stored values, journal entries, exchange rates and
 * balances are untouched.
 */

/**
 * A token made only of characters that are neither letters nor digits is a
 * graphic sign ($  €  £  ¥  ₣  ¤). Those go in front of the amount.
 * Anything with a letter in it is a code or an abbreviation (XFA, RWF, USD,
 * EUR, FCFA, Frw) and goes behind it.
 */
export function isGraphicSign(token) {
  const value = String(token == null ? '' : token).trim();
  if (!value) return false;
  return !/[A-Za-z0-9]/.test(value);
}

/** The token to print: the configured symbol, or the code when there is none. */
export function moneyToken({ symbol, code } = {}) {
  const sym = String(symbol == null ? '' : symbol).trim();
  if (sym) return sym;
  return String(code == null ? '' : code).trim();
}

/**
 * The amount alone, with the company's decimals and the user's own number
 * format. No currency is added. Used where the currency is named in a
 * heading, a table column or beside the figure already.
 */
export function formatAmount(value, { decimals = 2, locale } = {}) {
  const num = Number(value);
  const safe = Number.isFinite(num) ? num : 0;
  const places = Number.isFinite(Number(decimals)) ? Number(decimals) : 2;
  return safe.toLocaleString(locale, {
    minimumFractionDigits: places,
    maximumFractionDigits: places
  });
}

/**
 * The amount with its currency: "1,400.00 XFA", "1 400,00 RWF", "$1,400.00".
 *
 * The separator is a plain space, so the figure can be selected and copied
 * and so it reads the same in a report, a table and a printed invoice.
 */
export function formatMoney(value, { symbol, code, decimals = 2, locale } = {}) {
  const amount = formatAmount(value, { decimals, locale });
  const token = moneyToken({ symbol, code });
  if (!token) return amount;
  return isGraphicSign(token) ? `${token}${amount}` : `${amount} ${token}`;
}

/**
 * The same rule for a currency that is not the company's own (a foreign-currency
 * invoice, an FX revaluation). Passed explicitly so no screen has to know
 * where the currency goes.
 */
export function formatForeignMoney(value, foreign, { locale } = {}) {
  const options = foreign || {};
  return formatMoney(value, {
    symbol: options.symbol,
    code: options.code,
    decimals: options.decimals === undefined ? 2 : options.decimals,
    locale
  });
}

export default formatMoney;
