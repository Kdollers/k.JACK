'use strict';
/** Basic per-company configuration. These are INDEPENDENT base currencies,
 * NOT a foreign-exchange engine. No conversion is performed anywhere here.
 */
const { ValidationError, requiredText, optionalText, validateEmail } = require('./crud-validation');
const ISO_COUNTRIES = new Set(require('../shared/iso-countries.json'));
const CURRENCIES = Object.freeze(require('../shared/currencies.json'));
function countryCode(value, { optional = false } = {}) {
  if ((value === null || value === undefined || value === '') && optional) return null;
  if (typeof value !== 'string' || !ISO_COUNTRIES.has(value.trim().toUpperCase())) {
    throw new ValidationError('COUNTRY_INVALID');
  }
  return value.trim().toUpperCase();
}
function fiscalDay(value) {
  if (typeof value !== 'string' || !/^\d{2}-\d{2}$/.test(value)) throw new ValidationError('FISCAL_DATE_INVALID');
  const date = new Date(`2024-${value.slice(0, 2)}-${value.slice(3)}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(5, 10) !== value) {
    throw new ValidationError('FISCAL_DATE_INVALID');
  }
  return value;
}
function newCompanyConfig(body, { allowUnspecifiedCountry = false } = {}) {
  const name = requiredText(body.name, 'COMPANY_NAME_REQUIRED');
  const currency = String(body.currency_code ?? 'USD').trim().toUpperCase();
  if (!Object.hasOwn(CURRENCIES, currency)) throw new ValidationError('CURRENCY_UNSUPPORTED');
  const defaults = CURRENCIES[currency];
  const decimals = body.currency_decimals ?? defaults.decimals;
  if (!Number.isInteger(decimals) || decimals !== defaults.decimals) {
    throw new ValidationError('CURRENCY_PRECISION_INVALID');
  }
  const symbol = optionalText(body.currency_symbol, 8) || defaults.symbol;
  if (!['en', 'fr', 'rw'].includes(body.default_language ?? 'en')) throw new ValidationError('LANGUAGE_INVALID');
  return {
    name, legal_name: optionalText(body.legal_name, 120) || name,
    address: optionalText(body.address, 300), phone: optionalText(body.phone, 60),
    email: validateEmail(body.email), tax_id: optionalText(body.tax_id, 100),
    country_code: countryCode(body.country_code, { optional: allowUnspecifiedCountry }),
    currency_code: currency, currency_symbol: symbol, currency_decimals: decimals,
    fiscal_year_start: fiscalDay(body.fiscal_year_start ?? '01-01'),
    fiscal_year_end: fiscalDay(body.fiscal_year_end ?? '12-31'),
    default_language: body.default_language ?? 'en'
  };
}
function updatedCompanyConfig(body, current, hasInventoryMovements = false) {
  const requestedCurrency = String(body.currency_code ?? current.currency_code).trim().toUpperCase();
  if (requestedCurrency !== current.currency_code) throw new ValidationError('CURRENCY_CHANGE_REQUIRES_MIGRATION', 409);
  const requestedDecimals = body.currency_decimals ?? current.currency_decimals;
  if (!Number.isInteger(requestedDecimals) || requestedDecimals !== current.currency_decimals) {
    throw new ValidationError('CURRENCY_CHANGE_REQUIRES_MIGRATION', 409);
  }
  const language = body.default_language ?? current.default_language;
  if (!['en', 'fr', 'rw'].includes(language)) throw new ValidationError('LANGUAGE_INVALID');
  const method = body.inventory_valuation_method ?? current.inventory_valuation_method;
  if (!['FIFO', 'WEIGHTED_AVERAGE'].includes(method)) throw new ValidationError('VALUATION_METHOD_INVALID');
  // FIFO cannot be selected in new data until the posting engine actually
  // supports it. Retain legacy FIFO metadata as-is to avoid silent rewriting.
  if (method === 'FIFO' && current.inventory_valuation_method !== 'FIFO') {
    throw new ValidationError('FIFO_NOT_IMPLEMENTED', 409);
  }
  if (method !== current.inventory_valuation_method && hasInventoryMovements) {
    throw new ValidationError('VALUATION_CHANGE_REQUIRES_MIGRATION', 409);
  }
  return {
    name: requiredText(body.name ?? current.name, 'COMPANY_NAME_REQUIRED'),
    legal_name: optionalText(body.legal_name ?? current.legal_name, 120),
    address: optionalText(body.address ?? current.address, 300),
    phone: optionalText(body.phone ?? current.phone, 60),
    email: validateEmail(body.email ?? current.email),
    tax_id: optionalText(body.tax_id ?? current.tax_id, 100),
    country_code: countryCode(body.country_code ?? current.country_code, { optional: true }),
    currency_code: requestedCurrency,
    currency_symbol: optionalText(body.currency_symbol ?? current.currency_symbol, 8) || current.currency_symbol,
    currency_decimals: requestedDecimals,
    fiscal_year_start: fiscalDay(body.fiscal_year_start ?? current.fiscal_year_start),
    fiscal_year_end: fiscalDay(body.fiscal_year_end ?? current.fiscal_year_end),
    default_language: language,
    tax_inclusive_pricing: body.tax_inclusive_pricing === undefined ? current.tax_inclusive_pricing :
      (body.tax_inclusive_pricing === true || body.tax_inclusive_pricing === 1 ? 1 : 0),
    inventory_valuation_method: method
  };
}
module.exports = { CURRENCIES, countryCode, fiscalDay, newCompanyConfig, updatedCompanyConfig };
