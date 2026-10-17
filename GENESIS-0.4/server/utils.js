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

function roundTo(num, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(num) + Number.EPSILON) * factor) / factor;
}

module.exports = { generateId, roundTo };

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
