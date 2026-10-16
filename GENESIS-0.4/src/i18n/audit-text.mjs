import { labelFor, moduleLabel } from './labels.mjs';
import { translateLedgerText } from './ledger-text.mjs';

// Translate only exact templates emitted by the server. Audit descriptions are
// immutable evidence: never mutate stored rows or silently discard original text.
const events = [
  ['AUTH', 'LOGIN', 'user_login', /^User (.+) logged in$/, ['username']],
  ['AUTH', 'PASSWORD_CHANGE', 'password_change', /^User (.+) changed password$/, ['username']],
  ['AUTH', 'SETUP', 'setup', /^Initial administrator (.+) created$/, ['username']],
  ['AUTH', 'RECOVERY', 'recovery', /^Offline administrator recovery(; archived demo users deactivated)?$/, ['demo']],
  ['AUTH', 'RESTORE_DENIED', 'restore_denied', /^Restore refused: password re-entry failed$/, []],
  ['USERS', 'CREATE', 'user_created', /^Created user (.+) \((admin|accountant|sales|purchases|inventory|manager)\)$/, ['username', 'role']],
  ['USERS', 'UPDATE', 'user_updated', /^Updated user (.+): role=(admin|accountant|sales|purchases|inventory|manager), active=([01])(, password reset)?$/, ['username', 'role', 'active', 'reset']],
  ['COMPANY', 'UPDATE', 'company_updated', /^Updated company profile (.*)$/, ['name']],
  ['COMPANY', 'CREATE', 'company_created', /^Created new company (.*) \(([^()]+)\)$/, ['name', 'code']],
  ['ACCOUNTS', 'CREATE', 'account_created', /^Created account (\S+) - (.*)$/, ['code', 'name']],
  ['ACCOUNTS', 'UPDATE', 'account_updated', /^Updated account (.*)$/, ['record']],
  ['CUSTOMERS', 'CREATE', 'customer_created', /^Created customer (\S+) - (.*)$/, ['code', 'name']],
  ['CUSTOMERS', 'UPDATE', 'customer_updated', /^Updated customer (.*)$/, ['name']],
  ['SUPPLIERS', 'CREATE', 'supplier_created', /^Created supplier (\S+) - (.*)$/, ['code', 'name']],
  ['SUPPLIERS', 'UPDATE', 'supplier_updated', /^Updated supplier (.*)$/, ['name']],
  ['PRODUCTS', 'CREATE', 'product_created', /^Created product (\S+) - (.*)$/, ['code', 'name']],
  ['PRODUCTS', 'UPDATE', 'product_updated', /^Updated product (.*)$/, ['name']],
  ['SALES', 'CREATE', 'quote_created', /^Created quote (\S+)$/, ['number']],
  ['SALES', 'UPDATE', 'quote_converted', /^Converted quote (\S+) to invoice (\S+)$/, ['quote', 'number']],
  ['SALES', 'CREATE', 'invoice_draft_created', /^Created sales invoice draft (\S+) \(\$([\d.]+)\)$/, ['number', 'amount']],
  ['PURCHASES', 'CREATE', 'order_created', /^Created purchase order (\S+)$/, ['number']],
  ['PURCHASES', 'CREATE', 'bill_draft_created', /^Created purchase bill draft (\S+) \(\$([\d.]+)\)$/, ['number', 'amount']],
  ['BANKING', 'CREATE', 'bank_created', /^Added (BANK|CASH|MOBILE_MONEY) account (.*)$/, ['type', 'name']],
  ['TAXES', 'CREATE', 'tax_created', /^Created tax rate (\S+) \((\d+(?:\.\d+)?)%\)$/, ['code', 'rate']],
  ['SYSTEM', 'BACKUP', 'backup_exported', /^Exported company backup \((\d+) journal entries\)$/, ['count']],
  ['SYSTEM', 'RESTORE', 'backup_restored', /^Restored company backup from (.+) \((\d+) journal entries\); all sessions revoked$/, ['when', 'count']],
  ['ACCOUNTING', 'POST', 'journal_posted', /^Posted Journal Entry (\S+) \((.*)\) for amount ([\d.]+)$/, ['number', 'text', 'amount']],
  ['ACCOUNTING', 'VOID', 'journal_reversed', /^Reversed Journal Entry (\S+) with new reversal entry (\S+)$/, ['number', 'reversal']],
  ['SALES', 'POST', 'invoice_posted', /^Posted Sales Invoice (\S+) for customer (.*?) \(\$([\d.]+)\)$/, ['number', 'party', 'amount']],
  ['SALES', 'POST', 'credit_posted', /^Posted Credit Note (\S+) for customer (.*?) \(\$([\d.]+)\)$/, ['number', 'party', 'amount']],
  ['PURCHASES', 'POST', 'bill_posted', /^Posted Purchase Bill (\S+) from (.*?) \(\$([\d.]+)\)$/, ['number', 'party', 'amount']],
  ['PURCHASES', 'POST', 'return_posted', /^Posted Purchase Return (\S+) to (.*?) \(\$([\d.]+)\)$/, ['number', 'party', 'amount']],
  ['PAYMENTS', 'CREATE', 'payment_recorded', /^Recorded payment (\S+) \(([A-Z_]+)\) of \$([\d.]+)$/, ['number', 'type', 'amount']],
  ['INVENTORY', 'POST', 'adjustment_posted', /^Posted stock adjustment (\S+) \((.*?)\) value: \$([\d.]+)$/, ['number', 'reason', 'amount']],
  ['INVENTORY', 'POST', 'count_posted', /^Completed physical inventory count (\S+): Var Qty (-?[\d.]+), Var Value \$(-?[\d.]+)$/, ['number', 'quantity', 'amount']]
];

export const AUDIT_KEYS = events.map(([, , key]) => `audit.${key}`).concat([
  'audit.recovery_demo', 'audit.user_updated_with_reset', 'audit.other_event',
  'audit.original_description'
]);

export function auditDescription(log, t, formatCurrency, formatNumber = String, formatDateTime = String, formatPercent = String) {
  for (const [module, action, key, regex, names] of events) {
    if (log.module !== module || log.action !== action) continue;
    const match = regex.exec(log.description || '');
    if (!match) continue;
    const vars = Object.fromEntries(names.map((name, i) => [name, match[i + 1]]));
    if (vars.role) vars.role = labelFor(vars.role, t);
    if (vars.type) vars.type = labelFor(vars.type, t);
    if (vars.reason) vars.reason = labelFor(vars.reason, t);
    if (vars.active) vars.active = vars.active === '1' ? t('common.active') : t('common.inactive');
    if (vars.amount) vars.amount = formatCurrency(Number(vars.amount));
    if (vars.count) vars.count = formatNumber(Number(vars.count));
    if (vars.quantity) {
      const digits = Math.min(4, (vars.quantity.split('.')[1] || '').length);
      vars.quantity = formatNumber(Number(vars.quantity), digits);
    }
    if (vars.when) vars.when = formatDateTime(vars.when);
    if (vars.rate) {
      const digits = Math.min(2, (vars.rate.split('.')[1] || '').length);
      vars.rate = formatPercent(Number(vars.rate), digits);
    }
    if (vars.text) {
      // Journal content can be user-entered. Known engine templates can be
      // localized; everything else must remain exactly as the user wrote it.
      const source = log.module === 'ACCOUNTING' ? 'MANUAL' : null;
      vars.text = translateLedgerText(vars.text, source, t);
    }
    const localizedKey = key === 'recovery' && vars.demo ? 'recovery_demo'
      : key === 'user_updated' && vars.reset ? 'user_updated_with_reset' : key;
    return t(`audit.${localizedKey}`, vars);
  }
  return t('audit.other_event', {
    action: labelFor(log.action, t), module: moduleLabel(log.module, t),
    record: log.record_id || '-'
  });
}
