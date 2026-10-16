'use strict';
/** User-facing API failures use stable codes, not English server exception text.
 * Technical details remain on the server; the client translates errors.<CODE>.
 * Unknown validation failures intentionally become a localized generic message.
 */
const exact = {
  'Company name is required': 'COMPANY_NAME_REQUIRED',
  'Code, Name, Type, and Normal Balance are required': 'ACCOUNT_FIELDS_REQUIRED',
  'Customer name is required': 'CUSTOMER_NAME_REQUIRED',
  'Supplier name is required': 'SUPPLIER_NAME_REQUIRED',
  'SKU and Product Name are required': 'PRODUCT_FIELDS_REQUIRED',
  'Customer and line items are required': 'INVOICE_FIELDS_REQUIRED',
  'Customer and at least one line item are required': 'INVOICE_FIELDS_REQUIRED',
  'Supplier and line items are required': 'BILL_FIELDS_REQUIRED',
  'Supplier and at least one line item are required': 'BILL_FIELDS_REQUIRED',
  'Bank Name and Account Number are required': 'BANK_FIELDS_REQUIRED',
  'Description and at least two balanced lines are required': 'JOURNAL_FIELDS_REQUIRED',
  'Code, Name, and Rate are required': 'TAX_FIELDS_REQUIRED',
  'accountId is required': 'ACCOUNT_REQUIRED',
  'Quote not found': 'QUOTE_NOT_FOUND',
  'Invoice not found': 'INVOICE_NOT_FOUND',
  'Purchase bill not found': 'BILL_NOT_FOUND',
  'Journal entry not found': 'JOURNAL_NOT_FOUND',
  'Account not found': 'ACCOUNT_NOT_FOUND',
  'Customer not found': 'CUSTOMER_NOT_FOUND',
  'Supplier not found': 'SUPPLIER_NOT_FOUND',
  'Company not found': 'COMPANY_NOT_FOUND',
  'Journal Entry must contain at least two lines': 'JOURNAL_FIELDS_REQUIRED',
  'Debit and credit values cannot be negative': 'NEGATIVE_ENTRY',
  'A single line cannot have both debit and credit amounts': 'BOTH_DEBIT_CREDIT',
  'A journal line cannot have zero debit and zero credit': 'EMPTY_ENTRY_LINE',
  'One or more accounts do not exist in this company': 'ACCOUNT_NOT_FOUND',
  'Journal entry is already reversed': 'ALREADY_REVERSED',
  'Cannot post an empty invoice': 'EMPTY_INVOICE',
  'Accounts Receivable account (subtype ACCOUNTS_RECEIVABLE) not configured': 'AR_NOT_CONFIGURED',
  'Cannot post an empty purchase invoice': 'EMPTY_BILL',
  'Accounts Payable account (subtype ACCOUNTS_PAYABLE) not configured': 'AP_NOT_CONFIGURED',
  'Payment amount must be greater than zero': 'PAYMENT_AMOUNT_INVALID',
  'Bank/Cash account not found': 'BANK_NOT_FOUND',
  'Customer is required for customer receipt': 'CUSTOMER_REQUIRED',
  'Supplier is required for supplier payment': 'SUPPLIER_REQUIRED',
  'Expense account is required': 'EXPENSE_ACCOUNT_REQUIRED',
  'Income account is required': 'INCOME_ACCOUNT_REQUIRED',
  'Destination bank account is required for transfer': 'DESTINATION_REQUIRED',
  'Source and destination accounts must be different': 'SAME_TRANSFER_ACCOUNT',
  'Stock adjustment lines cannot be empty': 'EMPTY_ADJUSTMENT',
  'No non-zero quantity adjustments provided': 'ZERO_ADJUSTMENT',
  'Physical inventory count lines cannot be empty': 'EMPTY_COUNT',
  'Credit note lines cannot be empty': 'EMPTY_CREDIT_NOTE',
  'Return lines cannot be empty': 'EMPTY_RETURN'
};

function errorPayload(body, status) {
  if (!body || typeof body !== 'object' || status < 400) return body;
  const message = typeof body.error === 'string' ? body.error : '';
  let code = body.code || exact[message];
  if (!code) {
    if (/^Unbalanced Journal Entry:/.test(message)) code = 'JOURNAL_UNBALANCED';
    else if (/^Cannot post (purchase )?invoice with status /.test(message)) code = 'CANNOT_POST_STATUS';
    else if (/^Product .* not found$/.test(message)) code = 'PRODUCT_NOT_FOUND';
    else if (/^Unsupported payment type:/.test(message)) code = 'PAYMENT_TYPE_INVALID';
    else if (/^UNIQUE constraint failed|^SqliteError: UNIQUE/.test(message)) code = 'DUPLICATE_RECORD';
    else if (/^FOREIGN KEY constraint failed/.test(message)) code = 'INVALID_REFERENCE';
    else code = status === 404 ? 'NOT_FOUND' : status >= 500 ? 'GENERIC' : 'VALIDATION_FAILED';
  }
  // Preserve non-error metadata (e.g. safetyCopy), never echo SQL errors or
  // untranslated English into a French/Kinyarwanda user interface.
  const { error, ...rest } = body;
  return { ...rest, code };
}

module.exports = { errorPayload };
