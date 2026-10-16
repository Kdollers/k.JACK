// Presentation of stable codes and untouched, seeded master-data names.
// Never translate user-entered names or write localized labels to the database.
export const ENUM_KEYS = {
  DRAFT: 'common.draft', POSTED: 'common.posted', PAID: 'common.paid',
  PARTIALLY_PAID: 'common.partially_paid', PENDING: 'common.pending',
  CONFIRMED: 'common.confirmed', CANCELLED: 'common.cancelled',
  REVERSED: 'enums.reversed', CONVERTED: 'enums.converted',
  ACCEPTED: 'enums.accepted', REJECTED: 'enums.rejected', RECEIVED: 'enums.received',
  ASSET: 'accounting.type_asset', LIABILITY: 'accounting.type_liability',
  EQUITY: 'accounting.type_equity', REVENUE: 'accounting.type_revenue',
  COGS: 'accounting.type_cogs', EXPENSE: 'accounting.type_expense',
  DEBIT: 'accounting.debit', CREDIT: 'accounting.credit',
  GOODS: 'inventory.physical_goods', SERVICE: 'inventory.service',
  BANK: 'banking.type_bank', CASH: 'banking.type_cash',
  MOBILE_MONEY: 'banking.method_momo', BANK_TRANSFER: 'banking.method_bank',
  CHECK: 'banking.cheque', CARD: 'banking.credit_debit_card',
  CUSTOMER_RECEIPT: 'banking.cust_receipt', SUPPLIER_PAYMENT: 'banking.supp_payment',
  DIRECT_EXPENSE: 'banking.direct_expense', DIRECT_INCOME: 'banking.direct_income',
  TRANSFER: 'banking.transfer',
  SALES_INVOICE: 'enums.sales_invoice', PURCHASE_BILL: 'enums.purchase_bill',
  PURCHASE_INVOICE: 'enums.purchase_bill', CREDIT_NOTE: 'sales.new_credit_note',
  STOCK_ADJUSTMENT: 'inventory.adjust_stock', PHYSICAL_COUNT: 'inventory.physical_count',
  PURCHASE_RETURN: 'purchases.new_return', MANUAL: 'enums.manual',
  REVERSAL: 'enums.reversal', OPENING: 'enums.opening',
  PURCHASE_IN: 'enums.purchase_in', SALE_OUT: 'enums.sale_out',
  ADJUSTMENT_IN: 'enums.adjustment_in', ADJUSTMENT_OUT: 'enums.adjustment_out',
  SALE_RETURN_IN: 'enums.sale_return_in', PURCHASE_RETURN_OUT: 'enums.purchase_return_out',
  CASH_RECEIPT: 'banking.cust_receipt',
  INVOICE: 'enums.sales_invoice', BILL: 'enums.purchase_bill',
  PAYMENT: 'enums.payment', RETURN: 'enums.return',
  QUOTE: 'enums.quote', PURCHASE_ORDER: 'enums.purchase_order',
  NET_15: 'customers.net_15', NET_30: 'customers.net_30', NET_60: 'customers.net_60',
  IMMEDIATE: 'customers.immediate',
  DAMAGED: 'inventory.reason_damaged', EXPIRED: 'inventory.reason_expired',
  LOSS: 'inventory.reason_loss', FOUND: 'inventory.reason_found',
  CORRECTION: 'inventory.reason_correction', INTERNAL_USE: 'enums.internal_use',
  ACCOUNTS_RECEIVABLE: 'enums.subtype_ar', ACCOUNTS_PAYABLE: 'enums.subtype_ap',
  CURRENT_ASSET: 'enums.subtype_current_asset', FIXED_ASSET: 'enums.subtype_fixed_asset',
  INVENTORY: 'enums.subtype_inventory', TAX_PAYABLE: 'enums.subtype_tax_payable',
  CURRENT_LIABILITY: 'enums.subtype_current_liability',
  LONG_TERM_LIABILITY: 'enums.subtype_long_term_liability',
  OPERATING_REVENUE: 'enums.subtype_operating_revenue',
  OTHER_REVENUE: 'enums.subtype_other_revenue',
  OPERATING_EXPENSE: 'enums.subtype_operating_expense',
  ADMIN_EXPENSE: 'enums.subtype_admin_expense',
  admin: 'settings.role_admin', accountant: 'settings.role_accountant',
  sales: 'settings.role_sales', purchases: 'settings.role_purchases',
  inventory: 'settings.role_inventory', manager: 'settings.role_manager',
  network: 'settings.role_network',
  AUTH: 'enums.module_auth', USERS: 'settings.tab_users', COMPANY: 'settings.tab_company',
  CUSTOMERS: 'nav.customers', SUPPLIERS: 'nav.suppliers', PRODUCTS: 'nav.inventory',
  SALES: 'nav.sales', PURCHASES: 'nav.purchases', BANKING: 'nav.banking',
  ACCOUNTING: 'nav.accounting', ACCOUNTS: 'accounting.tab_accounts',
  TAXES: 'settings.tab_taxes', BACKUP: 'settings.tab_backup',
  REPORTS: 'nav.reports', PAYMENTS: 'nav.banking', SYSTEM: 'settings.title',
  JOURNAL: 'accounting.tab_journal',
  CREATE: 'enums.action_create', UPDATE: 'enums.action_update',
  LOGIN: 'enums.action_login', LOGOUT: 'enums.action_logout',
  SETUP: 'enums.action_setup', POST: 'enums.action_post',
  REVERSE: 'enums.action_reverse', RESTORE: 'enums.action_restore',
  VOID: 'enums.action_reverse', RESTORE_DENIED: 'enums.action_restore_denied',
  PASSWORD_CHANGE: 'enums.action_password_change', RECOVERY: 'enums.action_recovery'
};

export function labelFor(value, t) {
  return ENUM_KEYS[value] ? t(ENUM_KEYS[value]) : value ?? '';
}

// INVENTORY is both an account subtype and an audit module; unlike an account
// subtype, the audit module uses the navigation title.
export function moduleLabel(value, t) {
  return value === 'INVENTORY' ? t('nav.inventory') : labelFor(value, t);
}

// The name must still equal the original shipped name. If a user renames an
// account, its own name is authoritative (even if it is in a different language).
export const DEFAULT_ACCOUNT_NAMES = {
  '1010': 'Cash on Hand (Petty Cash)',
  '1020': 'Bank Current Account (Main)',
  '1030': 'Mobile Money Account (MoMo)',
  '1100': 'Accounts Receivable (Trade Debtors)',
  '1150': 'VAT Input Tax (Tax Receivable)',
  '1200': 'Merchandise Inventory',
  '1500': 'Office Furniture & Fixtures',
  '1510': 'Computer & IT Equipment',
  '1590': 'Accumulated Depreciation',
  '2010': 'Accounts Payable (Trade Creditors)',
  '2110': 'VAT Output Tax (Tax Payable)',
  '2200': 'Accrued Salaries Payable',
  '2500': 'Bank Business Loan',
  '3010': "Owner's Capital", '3020': "Owner's Drawings", '3900': 'Retained Earnings',
  '4010': 'Sales Revenue - Products', '4020': 'Service & Consulting Revenue',
  '4090': 'Sales Discounts & Allowances', '4500': 'Other Income & Interest',
  '5010': 'Cost of Goods Sold - Products', '5020': 'Inventory Shrinkage & Loss',
  '6010': 'Staff Salaries & Benefits', '6020': 'Office Rent Expense',
  '6030': 'Electricity & Water Utilities', '6040': 'Internet & Communications',
  '6050': 'Marketing & Advertising', '6060': 'Office Supplies & Stationery',
  '6070': 'Bank Charges & Payment Fees', '6080': 'Repairs & Maintenance',
  '6090': 'Depreciation Expense'
};

export function accountLabel(account, t) {
  if (!account) return '';
  const { code, name } = account;
  if (code === 'NET-INCOME' && name === 'Current Period Net Earnings / (Loss)') {
    return t('reports.current_period_earnings');
  }
  return DEFAULT_ACCOUNT_NAMES[code] === name ? t(`chart.${code}`) : name;
}

const DEFAULT_TAX_NAMES = {
  VAT18: 'Standard VAT 18%', ZERO: 'Zero-Rated / Exempt (0%)', RED10: 'Reduced VAT 10%'
};
export function taxLabel(tax, t) {
  return DEFAULT_TAX_NAMES[tax?.code] === tax?.name ? t(`seed_tax.${tax.code}`) : tax?.name || '';
}

const DEFAULT_BANK_NAMES = {
  'BANK-MAIN': 'Main Bank Account', 'CASH-MAIN': 'Cash Register',
  'MOBILE-MAIN': 'Mobile Money Account', 'BANK-UNCONFIGURED': 'Main Bank Account',
  '001-DEFAULT': 'Main Bank Account' // Existing secondary companies from older versions.
};
export function bankLabel(bank, t) {
  if (DEFAULT_BANK_NAMES[bank?.account_number] !== bank?.bank_name) return bank?.bank_name || '';
  return t(`seed_bank.${bank.account_number === 'CASH-MAIN' ? 'CASH-MAIN' : bank.account_number === 'MOBILE-MAIN' ? 'MOBILE-MAIN' : 'BANK-MAIN'}`);
}

export function bankNumberLabel(bank, t) {
  return DEFAULT_BANK_NAMES[bank?.account_number] === bank?.bank_name
    ? t('banking.placeholder_account_number') : bank?.account_number || '';
}

export function categoryLabel(value, t) {
  return value === 'General' ? t('inventory.category_general') : value || '';
}
export function unitLabel(value, t) {
  return value === 'pcs' ? t('inventory.unit_pieces') : value || '';
}
export function warehouseLabel(value, t) {
  return value === 'Main Store' ? t('inventory.main_store') : value || '';
}
