'use strict';
/**
 * Neutral utilities shared by the accounting engine, stock ledger and the
 * operational modules. Kept dependency-free so any module can require it
 * without creating circular imports.
 */
const crypto = require('crypto');

function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Expands exponential notation ("1e-7", "1.5e+21") into a plain decimal
 * string. Every later step works on digits, and "1e-7" has no digit position
 * to round at until it is written out.
 */
function toPlainDecimalString(n) {
  const s = String(n);
  if (!/e/i.test(s)) return s;
  const m = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(s);
  if (!m) return s;
  const [, sign, int, frac = '', exp] = m;
  const digits = int + frac;
  const point = int.length + Number(exp);
  let out;
  if (point <= 0) out = '0.' + '0'.repeat(-point) + digits;
  else if (point >= digits.length) out = digits + '0'.repeat(point - digits.length);
  else out = digits.slice(0, point) + '.' + digits.slice(point);
  return (sign === '-' ? '-' : '') + out;
}

/** Puts a rounded number back together, and never returns -0. */
function assembleNumber(negative, intDigits, fracDigits, decimals) {
  const int = intDigits.replace(/^0+(?=\d)/, '') || '0';
  const frac = decimals > 0 ? (fracDigits || '').padEnd(decimals, '0').slice(0, decimals) : '';
  const value = Number(int + (frac ? '.' + frac : ''));
  return negative && value !== 0 ? -value : value;
}

/**
 * Rounds a number to a fixed number of decimal places, exactly.
 *
 * This is the one function every money calculation in JENESIS goes through, so
 * an error here is an error in the accounts. It used to be:
 *
 *     Math.round((Number(num) + Number.EPSILON) * factor) / factor
 *
 * which is wrong in two ways. Multiplying first re-introduces the very error it
 * was trying to avoid - 8.165 * 100 is 816.4999999999999, so it rounded down to
 * 8.16 - and for negative numbers it was not merely imprecise but broken:
 * roundTo(-1.005, 2) returned -1, throwing the cents away.
 *
 * That second fault is the serious one now that JENESIS accepts negative
 * entries. A debit of -1.005 rounded to -1.00 while the matching credit of
 * 1.005 rounded to 1.01 leaves the entry a cent out of balance, which is
 * exactly what double-entry accounting must never do.
 *
 * So the rounding is done on the digits of the number's shortest decimal
 * representation - the string that reads back as the same number - rather than
 * on a scaled float. Ties go AWAY FROM ZERO, so a debit and its matching
 * credit always round to equal and opposite values and the entry stays
 * balanced.
 */
function roundTo(num, decimals = 2) {
  const n = Number(num);
  if (!Number.isFinite(n)) return 0;
  let d = Math.trunc(Number(decimals));
  if (!Number.isFinite(d) || d < 0) d = 2;
  if (d > 12) d = 12; // beyond this a decimal string stops being meaningful

  const plain = toPlainDecimalString(n);
  const negative = plain.charAt(0) === '-';
  const body = negative ? plain.slice(1) : plain;
  const dot = body.indexOf('.');
  const intDigits = dot === -1 ? body : body.slice(0, dot);
  const fracDigits = dot === -1 ? '' : body.slice(dot + 1);

  // Keep `d` fraction digits and look at the next one to decide the rounding.
  const keptFrac = fracDigits.slice(0, d);
  const nextDigit = fracDigits.charAt(d);
  if (!nextDigit || Number(nextDigit) < 5) {
    return assembleNumber(negative, intDigits, keptFrac, d);
  }

  // The next digit is 5 or more: add one to the last kept digit, carrying.
  const digits = (intDigits + keptFrac).split('');
  let i = digits.length - 1;
  for (;;) {
    if (i < 0) { digits.unshift('1'); break; }
    if (digits[i] === '9') { digits[i] = '0'; i -= 1; continue; }
    digits[i] = String(Number(digits[i]) + 1);
    break;
  }
  const all = digits.join('');
  if (d === 0) return assembleNumber(negative, all, '', 0);
  const splitAt = Math.max(0, all.length - d);
  return assembleNumber(negative, all.slice(0, splitAt) || '0', all.slice(splitAt), d);
}

module.exports = { generateId, roundTo, toPlainDecimalString };

/**
 * Business-rule error with a stable machine code and optional structured
 * details, so the UI can translate it into English/French/Kinyarwanda while
 * the English message remains the fallback for API consumers.
 */
class ApiError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    if (details) this.details = details;
  }
}

/**
 * Stable machine codes for business-rule failures. The server message stays
 * English (audit/API consumers); the UI translates `code` into en/fr/rw.
 */
const ERROR_CODE_PATTERNS = [
  [/A revaluation has already been posted/i, 'FX_REVALUATION_EXISTS'],
  [/No open foreign-currency balances/i, 'NO_FX_EXPOSURE'],
  [/FX settlement requires a linked invoice or bill/i, 'FX_SETTLE_REQUIRES_DOCUMENT'],
  [/FX settlement requires a foreign-currency payment/i, 'FX_SETTLE_BASE_CURRENCY'],
  [/FX gain\/loss accounts/i, 'FX_ACCOUNTS_MISSING'],
  [/^Insufficient stock for/i, 'INSUFFICIENT_STOCK'],
  [/Cannot post invoice with status/i, 'ALREADY_POSTED'],
  [/Cannot post purchase invoice with status/i, 'ALREADY_POSTED'],
  [/Cannot post goods receipt with status/i, 'ALREADY_POSTED'],
  [/Journal entry is already reversed/i, 'ALREADY_REVERSED'],
  [/Payment is already reversed/i, 'ALREADY_REVERSED'],
  [/Payment has no journal entry to reverse/i, 'NOTHING_TO_REVERSE'],
  [/has already been fully credited/i, 'FULLY_CREDITED'],
  [/exceeds the still-returnable quantity/i, 'OVER_RETURN'],
  [/would refund more than invoice/i, 'OVER_REFUND'],
  [/Credit notes can only be issued against posted invoices/i, 'CN_NEEDS_POSTED_INVOICE'],
  [/Walk-in sales must be paid immediately/i, 'WALKIN_IMMEDIATE_PAYMENT'],
  [/Invoice is not a walk-in sale/i, 'NOT_WALKIN'],
  [/No active cash account is configured for walk-in sales/i, 'NO_CASH_ACCOUNT'],
  [/requires a posted goods receipt before a supplier invoice/i, 'GRN_REQUIRED'],
  [/Linked goods receipt is not posted/i, 'GRN_NOT_POSTED'],
  [/Linked goods receipt not found/i, 'NOT_FOUND'],
  [/Receipt exceeds the purchase order quantity/i, 'OVER_RECEIPT'],
  [/Receipt exceeds purchase order quantity/i, 'OVER_RECEIPT'],
  [/Cannot receive goods against a cancelled purchase order/i, 'PO_CANCELLED'],
  [/Cannot receive more than outstanding/i, 'OVER_RECEIPT'],
  [/Nothing to receive: all lines are already fully received/i, 'NOTHING_TO_RECEIVE'],
  [/Only goods can be received into stock/i, 'SERVICE_NOT_STOCKABLE'],
  [/Only goods can be transferred between stores/i, 'SERVICE_NOT_STOCKABLE'],
  [/cannot approve a count that you created or submitted/i, 'COUNT_SELF_APPROVAL'],
  [/cannot approve a cash reconciliation that you closed/i, 'CASH_SELF_APPROVAL'],
  [/A rejection reason is required/i, 'REJECT_REASON_REQUIRED'],
  [/Only submitted counts can be (approved|rejected)/i, 'COUNT_NOT_SUBMITTED'],
  [/Only draft or rejected counts can be (edited|submitted)/i, 'COUNT_NOT_DRAFT'],
  [/Only approved counts can be posted/i, 'COUNT_NOT_APPROVED'],
  [/A cash session is already open/i, 'SESSION_ALREADY_OPEN'],
  [/Cash sessions can only be opened on CASH-type accounts/i, 'SESSION_NOT_CASH_ACCOUNT'],
  [/Only open cash sessions can be closed/i, 'SESSION_NOT_OPEN'],
  [/Only closed cash sessions can be approved/i, 'SESSION_NOT_CLOSED'],
  [/A discrepancy explanation is required/i, 'VARIANCE_EXPLANATION_REQUIRED'],
  [/This cash account is inactive/i, 'ACCOUNT_INACTIVE'],
  [/Source and destination stores must be different/i, 'TRANSFER_SAME_STORE'],
  [/Source and destination accounts must be different/i, 'TRANSFER_SAME_ACCOUNT'],
  [/Only draft transfers can be dispatched/i, 'TRANSFER_NOT_DRAFT'],
  [/Only draft transfers can be cancelled/i, 'TRANSFER_NOT_DRAFT'],
  [/Only dispatched \(in-transit\) transfers can be received/i, 'TRANSFER_NOT_DISPATCHED'],
  [/Received quantities cannot be negative/i, 'NEGATIVE_QUANTITY'],
  [/Received quantities must be greater than zero/i, 'NEGATIVE_QUANTITY'],
  [/Transfer quantities must be greater than zero/i, 'NEGATIVE_QUANTITY'],
  [/Store code .* already exists/i, 'ALREADY_EXISTS'],
  [/Currency .* already exists/i, 'ALREADY_EXISTS'],
  [/The default store cannot be deactivated/i, 'DEFAULT_STORE_LOCKED'],
  [/This store still holds stock/i, 'STORE_HAS_STOCK'],
  [/The base currency cannot be deactivated/i, 'BASE_CURRENCY_LOCKED'],
  [/No exchange rate configured/i, 'NO_EXCHANGE_RATE'],
  [/An exchange rate is required to record a payment/i, 'NO_EXCHANGE_RATE'],
  [/Exchange rate must be greater than zero/i, 'INVALID_RATE'],
  [/Currency code must be 3 letters/i, 'INVALID_CURRENCY_CODE'],
  [/Currency codes must be 3 letters/i, 'INVALID_CURRENCY_CODE'],
  [/is not configured for this company/i, 'CURRENCY_NOT_CONFIGURED'],
  [/Currency decimals must be between 0 and 4/i, 'INVALID_DECIMALS'],
  [/Store code must be 2-20 characters/i, 'INVALID_STORE_CODE'],
  [/Effective date must be YYYY-MM-DD/i, 'INVALID_DATE'],
  [/A rate must link two different currencies/i, 'SAME_CURRENCY_PAIR'],
  [/Unbalanced Journal Entry/i, 'UNBALANCED_JOURNAL'],
  [/Cannot adjust by .* \(available/i, 'INSUFFICIENT_STOCK'],
  [/Customer is required/i, 'CUSTOMER_REQUIRED'],
  [/Supplier is required/i, 'SUPPLIER_REQUIRED']
];

function errorCode(err) {
  if (!err) return undefined;
  if (err.code && typeof err.code === 'string' && err.code !== 'ERR_ASSERTION') return err.code;
  const msg = String(err.message || '');
  for (const [pattern, code] of ERROR_CODE_PATTERNS) {
    if (pattern.test(msg)) return code;
  }
  return undefined;
}

/** Shapes any thrown error into the standard JSON error body. */
function asErrorResponse(err) {
  const body = { error: err && err.message ? err.message : String(err) };
  const code = errorCode(err);
  if (code) body.code = code;
  if (err && err.details) body.details = err.details;
  return body;
}

module.exports.ApiError = ApiError;
module.exports.errorCode = errorCode;
module.exports.asErrorResponse = asErrorResponse;
module.exports.ERROR_CODE_PATTERNS = ERROR_CODE_PATTERNS;
