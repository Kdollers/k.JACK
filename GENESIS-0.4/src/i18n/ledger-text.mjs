import { labelFor } from './labels.mjs';

// The accounting engine stores English audit/narrative text in historical rows.
// Recognize ONLY its known templates and source types; never rewrite database
// descriptions or attempt to translate a user's own memo. Numbers and business
// names are retained verbatim. Unrecognized historical text remains visible.
const patterns = [
  ['REVERSAL', 'reversal_line', /^Reversal of: (.*)$/, ['text']],
  ['REVERSAL', 'reversal_entry', /^Reversal of (.+?): (.*)$/, ['number', 'reason']],
  ['SALES_INVOICE', 'ar_invoice', /^AR: Inv #(.+?) - (.*)$/, ['number', 'party']],
  ['SALES_INVOICE', 'sales_revenue', /^Sales Revenue: Inv #(.+)$/, ['number']],
  ['SALES_INVOICE', 'output_tax', /^VAT Output: Inv #(.+)$/, ['number']],
  ['SALES_INVOICE', 'cost_of_sales', /^COGS: Inv #(.+)$/, ['number']],
  ['SALES_INVOICE', 'stock_reduction', /^Inventory reduction: Inv #(.+)$/, ['number']],
  ['SALES_INVOICE', 'sales_invoice', /^Sales Invoice #(.+?) - (.*)$/, ['number', 'party']],
  ['PURCHASE_INVOICE', 'purchase_inventory', /^Purchases\/Inventory: Bill #(.+)$/, ['number']],
  ['PURCHASE_INVOICE', 'input_tax', /^VAT Input: Bill #(.+)$/, ['number']],
  ['PURCHASE_INVOICE', 'ap_bill', /^AP: Bill #(.+?) - (.*)$/, ['number', 'party']],
  ['PURCHASE_INVOICE', 'purchase_invoice', /^Purchase Invoice #(.+?) from (.*)$/, ['number', 'party']],
  ['CUSTOMER_RECEIPT', 'customer_receipt', /^Customer Receipt (.+?) from (.*)$/, ['number', 'party']],
  ['CUSTOMER_RECEIPT', 'receipt_line', /^Receipt: (.+?) - (.*)$/, ['number', 'party']],
  ['CUSTOMER_RECEIPT', 'ar_payment', /^AR: Payment from (.*)$/, ['party']],
  ['SUPPLIER_PAYMENT', 'supplier_payment', /^Supplier Payment (.+?) to (.*)$/, ['number', 'party']],
  ['SUPPLIER_PAYMENT', 'ap_payment', /^AP: Payment to (.*)$/, ['party']],
  ['SUPPLIER_PAYMENT', 'payment_line', /^Payment: (.+?) - (.*)$/, ['number', 'party']],
  ['DIRECT_EXPENSE', 'expense_payment', /^Expense Payment (.+?): (.*)$/, ['number', 'text']],
  ['DIRECT_EXPENSE', 'paid_via', /^Paid via (.*)$/, ['bank']],
  ['DIRECT_INCOME', 'income_receipt', /^Income Receipt (.+?): (.*)$/, ['number', 'text']],
  ['DIRECT_INCOME', 'received_in', /^Received in (.*)$/, ['bank']],
  ['TRANSFER', 'bank_transfer', /^Bank Transfer (.+?) from (.+?) to (.*)$/, ['number', 'from', 'to']],
  ['TRANSFER', 'transfer_in', /^Transfer in from (.*)$/, ['bank']],
  ['TRANSFER', 'transfer_out', /^Transfer out to (.*)$/, ['bank']],
  ['STOCK_ADJUSTMENT', 'adjustment_loss', /^Inventory Adjustment Loss \((.*?)\) - (.*)$/, ['reason', 'number']],
  ['STOCK_ADJUSTMENT', 'asset_reduction', /^Inventory Asset Reduction - (.*)$/, ['number']],
  ['STOCK_ADJUSTMENT', 'asset_increase', /^Inventory Asset Increase - (.*)$/, ['number']],
  ['STOCK_ADJUSTMENT', 'adjustment_gain', /^Inventory Adjustment Gain \((.*?)\) - (.*)$/, ['reason', 'number']],
  ['STOCK_ADJUSTMENT', 'stock_adjustment', /^Stock Adjustment #(.+?) \((.*?)\)$/, ['number', 'reason']],
  ['PHYSICAL_COUNT', 'count_shortage', /^Physical Inventory Count Shortage - (.*)$/, ['number']],
  ['PHYSICAL_COUNT', 'asset_adjustment', /^Inventory Asset Adjustment - (.*)$/, ['number']],
  ['PHYSICAL_COUNT', 'count_surplus', /^Physical Inventory Count Surplus - (.*)$/, ['number']],
  ['PHYSICAL_COUNT', 'physical_count', /^Physical Inventory Count #(.+?) Reconciliation$/, ['number']],
  ['CREDIT_NOTE', 'sales_return', /^Sales Return: CN #(.+)$/, ['number']],
  ['CREDIT_NOTE', 'output_reversal', /^VAT Output Reversal: CN #(.+)$/, ['number']],
  ['CREDIT_NOTE', 'ar_credit', /^AR Credit: CN #(.+?) - (.*)$/, ['number', 'party']],
  ['CREDIT_NOTE', 'restock', /^Restock Inventory: CN #(.+)$/, ['number']],
  ['CREDIT_NOTE', 'cogs_reversal', /^COGS Reversal: CN #(.+)$/, ['number']],
  ['CREDIT_NOTE', 'credit_note', /^Credit Note #(.+?) - (.*?) \((.*)\)$/, ['number', 'party', 'reason']],
  ['PURCHASE_RETURN', 'ap_return', /^AP Return Debit: #(.+?) - (.*)$/, ['number', 'party']],
  ['PURCHASE_RETURN', 'inventory_return', /^Inventory Return Credit: #(.+)$/, ['number']],
  ['PURCHASE_RETURN', 'input_reversal', /^VAT Input Reversal: #(.+)$/, ['number']],
  ['PURCHASE_RETURN', 'purchase_return', /^Purchase Return #(.+?) to (.*?) \((.*)\)$/, ['number', 'party', 'reason']]
];

const defaults = {
  DIRECT_EXPENSE: { 'Operating Expense': 'operating_expense', 'Expense Payment': 'expense_payment_only' },
  DIRECT_INCOME: { 'Direct Income': 'direct_income' },
  REVERSAL: { Correction: 'correction' }
};

export const LEDGER_KEYS = patterns.map(([, key]) => `ledger.${key}`).concat(
  Object.values(defaults).flatMap((values) => Object.values(values).map((key) => `ledger.${key}`))
);

function seededBankName(name, t) {
  const seeded = { 'Main Bank Account': 'BANK-MAIN', 'Cash Register': 'CASH-MAIN',
    'Mobile Money Account': 'MOBILE-MAIN' };
  return seeded[name] ? t(`seed_bank.${seeded[name]}`) : name;
}

export function translateLedgerText(text, sourceType, t) {
  if (!text || sourceType === 'MANUAL') return text || '';
  if (defaults[sourceType]?.[text]) return t(`ledger.${defaults[sourceType][text]}`);
  for (const [type, key, regex, names] of patterns) {
    if (type !== sourceType) continue;
    const match = regex.exec(text);
    if (!match) continue;
    const vars = Object.fromEntries(names.map((name, i) => [name, match[i + 1]]));
    for (const field of ['reason', 'text']) {
      if (vars[field] && defaults[sourceType]?.[vars[field]]) vars[field] = t(`ledger.${defaults[sourceType][vars[field]]}`);
    }
    if (vars.reason) vars.reason = labelFor(vars.reason, t);
    for (const field of ['bank', 'from', 'to']) if (vars[field]) vars[field] = seededBankName(vars[field], t);
    if (sourceType === 'REVERSAL' && vars.text) {
      // Historical reversals contain the original line's text but not its type.
      // Only translate a nested text that exactly matches one of the engine's
      // generated templates; leave all other (human) memos unchanged.
      const nested = patterns.find(([candidate, , nestedRegex]) =>
        candidate !== 'REVERSAL' && nestedRegex.test(vars.text));
      if (nested) vars.text = translateLedgerText(vars.text, nested[0], t);
    }
    return t(`ledger.${key}`, vars);
  }
  return text;
}
