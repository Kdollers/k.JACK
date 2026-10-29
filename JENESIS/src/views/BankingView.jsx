import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useShortcutAction } from '../context/ShortcutsContext';
import { useI18n } from '../i18n';
import { apiRequest, translateError } from '../services/api';
import {
  CreditCard,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Wallet,
  Building2,
  Smartphone,
  Search,
  X,
  Banknote,
  Undo2,
  CheckCircle2,
  Lock
} from 'lucide-react';

/** Editable denomination grid shared by the open/close cash-session dialogs. */
function DenominationLines({ lines, onChange, t }) {
  const total = lines.reduce((sum, l) => sum + (Number(l.unitValue) || 0) * (Number(l.quantity) || 0), 0);
  const update = (idx, field, value) => {
    const next = [...lines];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {lines.map((l, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_110px_90px_110px_28px] gap-2 items-center">
          <input type="text" placeholder={t('banking.denomination')} value={l.denomination}
            onChange={(e) => update(idx, 'denomination', e.target.value)}
            className="px-2 py-1.5 border border-slate-300 rounded-md" />
          <input type="number" step="any" min="0" placeholder={t('banking.unit_value')} value={l.unitValue}
            onChange={(e) => update(idx, 'unitValue', Number(e.target.value))}
            className="px-2 py-1.5 border border-slate-300 rounded-md text-right font-mono" />
          <span className="text-center text-slate-400 font-bold">×</span>
          <input type="number" step="1" min="0" placeholder="#" value={l.quantity}
            onChange={(e) => update(idx, 'quantity', Math.max(0, Math.round(Number(e.target.value))))}
            className="px-2 py-1.5 border border-slate-300 rounded-md text-right font-mono" />
          <button type="button" onClick={() => onChange(lines.filter((_, i) => i !== idx))}
            className="p-1 rounded text-rose-500 hover:bg-rose-50"><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <button type="button"
          onClick={() => onChange([...lines, { denomination: '', unitValue: 0, quantity: 0 }])}
          className="text-emerald-700 hover:text-emerald-900 font-semibold text-xs flex items-center space-x-1">
          <Plus className="w-3.5 h-3.5" /><span>{t('banking.add_denom_line')}</span>
        </button>
        <div className="text-xs font-bold text-slate-800 font-mono">
          {t('banking.counted_total')}: {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
    </div>
  );
}

export default function BankingView() {
  const { currentCompany, formatCurrency, formatDate, showToast, refreshKey, hasPermission } = useApp();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState('accounts'); // 'accounts', 'payments', 'cash'
  const [bankAccounts, setBankAccounts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [cashSessions, setCashSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cash reconciliation state
  const [showOpenCashModal, setShowOpenCashModal] = useState(false);
  const [closingSession, setClosingSession] = useState(null);
  const [openCashForm, setOpenCashForm] = useState({ bankAccountId: '', countLines: [{ denomination: '', unitValue: 0, quantity: 0 }] });
  const [closeCashForm, setCloseCashForm] = useState({ countLines: [{ denomination: '', unitValue: 0, quantity: 0 }], explanation: '' });
  const [closingExpected, setClosingExpected] = useState(0);

  // Modals
  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  // Ctrl+N — record a payment (server enforces banking:write).
  useShortcutAction('Ctrl+N', () => {
    if (!hasPermission('banking:write')) {
      showToast(t('errors.FORBIDDEN'), 'error');
      return true;
    }
    setShowRecordPaymentModal(true);
    return true;
  }, { order: 10 });

  // Bank Form
  const [bankForm, setBankForm] = useState({
    bank_name: '',
    account_number: '',
    account_type: 'BANK',
    currency: 'USD',
    opening_balance: 0
  });

  // Payment Form
  const [paymentForm, setPaymentForm] = useState({
    paymentType: 'CUSTOMER_RECEIPT', // CUSTOMER_RECEIPT, SUPPLIER_PAYMENT, DIRECT_EXPENSE, DIRECT_INCOME, TRANSFER, CUSTOMER_REFUND
    paymentMethod: 'BANK_TRANSFER',
    bankAccountId: '',
    toBankAccountId: '',
    customerId: '',
    supplierId: '',
    expenseAccountId: '',
    incomeAccountId: '',
    amount: 0,
    reference: '',
    notes: '',
    salesInvoiceId: '',
    purchaseInvoiceId: '',
    currencyCode: '',
    exchangeRate: '',
    foreignAmount: '',
    settleWithFxDifference: false
  });

  const [openInvoices, setOpenInvoices] = useState([]);
  const [openBills, setOpenBills] = useState([]);
  const [currencies, setCurrencies] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [banks, pays, custs, supps, accs] = await Promise.all([
        apiRequest('/api/payments/bank-accounts'),
        apiRequest('/api/payments'),
        apiRequest('/api/customers'),
        apiRequest('/api/suppliers'),
        apiRequest('/api/accounts')
      ]);
      setBankAccounts(banks);
      setPayments(pays);
      setCustomers(custs);
      setSuppliers(supps);
      setGlAccounts(accs);

      apiRequest('/api/banking/cash-sessions').then(setCashSessions).catch(() => setCashSessions([]));
      apiRequest('/api/sales/invoices')
        .then((list) => setOpenInvoices(list.filter((i) => i.status === 'POSTED' || i.status === 'PARTIALLY_PAID')))
        .catch(() => setOpenInvoices([]));
      apiRequest('/api/purchases/bills')
        .then((list) => setOpenBills(list.filter((b) => b.status === 'POSTED' || b.status === 'PARTIALLY_PAID')))
        .catch(() => setOpenBills([]));
      apiRequest('/api/fx/currencies').then(setCurrencies).catch(() => setCurrencies([]));

      if (banks.length > 0 && !paymentForm.bankAccountId) {
        setPaymentForm((prev) => ({ ...prev, bankAccountId: banks[0].id }));
      }
    } catch (err) {
      showToast(translateError(t, err), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentCompany?.id, activeTab, refreshKey]);

  const handleAddBank = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/api/payments/bank-accounts', {
        method: 'POST',
        body: JSON.stringify(bankForm)
      });
      showToast(t('common.success', 'Saved'), 'success');
      setShowAddBankModal(false);
      setBankForm({ bank_name: '', account_number: '', account_type: 'BANK', currency: 'USD', opening_balance: 0 });
      fetchData();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!paymentForm.bankAccountId || paymentForm.amount <= 0) {
      return showToast(t('errors.MISSING_FIELDS'), 'error');
    }

    try {
      const res = await apiRequest('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          ...paymentForm,
          salesInvoiceId: paymentForm.salesInvoiceId || null,
          purchaseInvoiceId: paymentForm.purchaseInvoiceId || null,
          currencyCode: paymentForm.currencyCode || null,
          exchangeRate: paymentForm.exchangeRate === '' ? null : Number(paymentForm.exchangeRate),
          foreignAmount: paymentForm.foreignAmount === '' ? null : Number(paymentForm.foreignAmount),
          settleWithFxDifference: !!paymentForm.settleWithFxDifference
        })
      });
      showToast(`${t('banking.tab_payments')} ${res.paymentNumber} — ${t('common.posted')}`, 'success');
      setShowRecordPaymentModal(false);
      fetchData();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  // ---------------- payment reversal (receipt corrections) ----------------
  const handleReversePayment = async (payment) => {
    const reason = window.prompt(`${t('banking.reversal_reason')} (${payment.payment_number}):`);
    if (reason === null) return;
    try {
      await apiRequest(`/api/payments/${payment.id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      showToast(`${payment.payment_number} — ${t('common.reversed')}`, 'success');
      fetchData();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  // ---------------- cash sessions ----------------
  const cashAccounts = bankAccounts.filter((b) => b.account_type === 'CASH' && b.active);

  const handleOpenCash = async (e) => {
    e.preventDefault();
    const lines = openCashForm.countLines.filter((l) => l.denomination && Number(l.unitValue) > 0 && Number(l.quantity) >= 0);
    if (!openCashForm.bankAccountId || lines.length === 0) return showToast(t('errors.MISSING_FIELDS'), 'error');
    try {
      await apiRequest('/api/banking/cash-sessions/open', {
        method: 'POST',
        body: JSON.stringify({ bankAccountId: openCashForm.bankAccountId, countLines: lines })
      });
      showToast(`${t('banking.open_session')} — ${t('common.success', 'OK')}`, 'success');
      setShowOpenCashModal(false);
      fetchData();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const openCloseModal = async (session) => {
    setClosingSession(session);
    setCloseCashForm({ countLines: [{ denomination: '', unitValue: 0, quantity: 0 }], explanation: '' });
    try {
      const detail = await apiRequest(`/api/banking/cash-sessions/${session.id}`);
      setClosingExpected(detail.expected_now ?? detail.opening_amount);
    } catch (_) {
      setClosingExpected(session.opening_amount);
    }
  };

  const handleCloseCash = async (e) => {
    e.preventDefault();
    const lines = closeCashForm.countLines.filter((l) => l.denomination && Number(l.unitValue) > 0 && Number(l.quantity) >= 0);
    if (lines.length === 0) return showToast(t('errors.MISSING_FIELDS'), 'error');
    try {
      const res = await apiRequest(`/api/banking/cash-sessions/${closingSession.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ countLines: lines, explanation: closeCashForm.explanation })
      });
      showToast(`${t('banking.close_session')} — ${t('banking.variance')}: ${formatCurrency(res.varianceAmount)}`, 'success');
      setClosingSession(null);
      fetchData();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const handleApproveCash = async (session) => {
    try {
      await apiRequest(`/api/banking/cash-sessions/${session.id}/approve`, { method: 'POST' });
      showToast(`${session.session_number} — ${t('common.approved')}`, 'success');
      fetchData();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t('banking.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('banking.subtitle')}</p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setActiveTab('accounts')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'accounts' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('banking.tab_accounts')}
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'payments' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('banking.tab_payments')}
            </button>
            {hasPermission('cash:count') && (
              <button
                onClick={() => setActiveTab('cash')}
                className={`px-3 py-1.5 rounded-md transition ${
                  activeTab === 'cash' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('banking.tab_cash')}
              </button>
            )}
          </div>

          {activeTab === 'cash' && hasPermission('cash:count') && (
            <button
              onClick={() => {
                setOpenCashForm({ bankAccountId: cashAccounts[0]?.id || '', countLines: [{ denomination: '', unitValue: 0, quantity: 0 }] });
                setShowOpenCashModal(true);
              }}
              className="bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <Banknote className="w-3.5 h-3.5" />
              <span>{t('banking.open_session')}</span>
            </button>
          )}

          <button
            onClick={() => setShowAddBankModal(true)}
            className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('banking.add_bank')}</span>
          </button>

          <button
            onClick={() => setShowRecordPaymentModal(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('banking.record_payment')}</span>
          </button>
        </div>
      </div>

      {/* 1. Accounts Grid Tab */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bankAccounts.map((acc) => {
              const isCash = acc.account_type === 'CASH';
              const isMomo = acc.account_type === 'MOBILE_MONEY';

              return (
                <div
                  key={acc.id}
                  className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          isCash
                            ? 'bg-amber-100 text-amber-700'
                            : isMomo
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {isCash ? (
                          <Wallet className="w-5 h-5" />
                        ) : isMomo ? (
                          <Smartphone className="w-5 h-5" />
                        ) : (
                          <Building2 className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900">{acc.bank_name}</h3>
                        <p className="text-[11px] text-slate-500 font-mono">Acc: {acc.account_number}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                      {acc.account_type}
                    </span>
                  </div>

                  <div className="border-t border-slate-100 pt-3 flex items-end justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Available Balance</div>
                      <div className="text-xl font-black text-slate-900 font-mono">
                        {formatCurrency(acc.current_balance)}
                      </div>
                    </div>
                    <div className="text-[11px] font-medium text-slate-500 font-mono">
                      GL #{acc.account_code || '1020'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Payment Vouchers History Tab */}
      {activeTab === 'payments' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">{t('banking.tab_payments')}</h2>
            <div className="text-xs text-slate-500 font-medium">{payments.length} transactions recorded</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('common.date')}</th>
                  <th className="py-2.5 px-4">{t('banking.voucher_number')}</th>
                  <th className="py-2.5 px-4">{t('banking.payment_type')}</th>
                  <th className="py-2.5 px-4">{t('banking.account_used')}</th>
                  <th className="py-2.5 px-4">{t('banking.party_category')}</th>
                  <th className="py-2.5 px-4">{t('banking.payment_method')}</th>
                  <th className="py-2.5 px-4 text-right">{t('common.amount')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments && payments.length > 0 ? (
                  payments.map((p) => {
                    const isReceipt = p.payment_type === 'CUSTOMER_RECEIPT' || p.payment_type === 'DIRECT_INCOME';
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-slate-600">{formatDate(p.date)}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">{p.payment_number}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isReceipt
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {p.payment_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700">{p.bank_name}</td>
                        <td className="py-3 px-4 text-slate-800 font-medium">
                          {p.customer_name || p.supplier_name || p.expense_account_name || p.income_account_name || '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-500 uppercase text-[10px] font-semibold">
                          {p.payment_method}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-sm">
                          <span className={isReceipt ? 'text-emerald-600' : 'text-slate-900'}>
                            {isReceipt ? '+' : '-'}{formatCurrency(p.amount)}
                          </span>
                          {p.currency_code && p.currency_code !== (currentCompany?.currency_code || 'USD') && (
                            <div className="text-[10px] font-medium text-slate-400">
                              {p.foreign_amount != null ? `${p.foreign_amount} ${p.currency_code} @ ${p.exchange_rate ?? '—'}` : p.currency_code}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                            p.status === 'REVERSED' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {p.status === 'REVERSED' ? t('common.reversed') : t('common.posted')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {p.status !== 'REVERSED' && hasPermission('banking:write') && (
                            <button
                              onClick={() => handleReversePayment(p)}
                              title={t('banking.reverse_payment')}
                              className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      {t('common.no_data')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Cash Counting & Reconciliation Tab */}
      {activeTab === 'cash' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900">
            {t('banking.cash_hint')} <span className="font-bold">{t('banking.no_auto_adjust_note')}</span>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-slate-50">
              <h2 className="text-sm font-bold text-slate-800">{t('banking.tab_cash')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">{t('banking.session_number')}</th>
                    <th className="py-2.5 px-4">{t('banking.cash_account')}</th>
                    <th className="py-2.5 px-4">{t('banking.opened_by')} / {t('banking.opened_at')}</th>
                    <th className="py-2.5 px-4 text-right">{t('banking.opening_count')}</th>
                    <th className="py-2.5 px-4 text-right">{t('banking.expected_cash')}</th>
                    <th className="py-2.5 px-4 text-right">{t('banking.counted_total')}</th>
                    <th className="py-2.5 px-4 text-right">{t('banking.variance')}</th>
                    <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                    <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cashSessions.length > 0 ? cashSessions.map((cs) => (
                    <tr key={cs.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono font-bold text-amber-700">{cs.session_number}</td>
                      <td className="py-2.5 px-4 text-slate-700">{cs.bank_name}</td>
                      <td className="py-2.5 px-4 text-slate-600">{cs.opened_by_name || '—'}<div className="text-[10px] text-slate-400">{cs.opened_at}</div></td>
                      <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(cs.opening_amount)}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{cs.expected_amount != null ? formatCurrency(cs.expected_amount) : '—'}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{cs.counted_amount != null ? formatCurrency(cs.counted_amount) : '—'}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold">
                        {cs.variance_amount != null ? (
                          <span className={Math.abs(cs.variance_amount) < 0.005 ? 'text-slate-400' : cs.variance_amount < 0 ? 'text-rose-600' : 'text-emerald-600'}
                            title={cs.explanation || ''}>
                            {formatCurrency(cs.variance_amount)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          cs.status === 'OPEN' ? 'bg-amber-100 text-amber-800'
                          : cs.status === 'CLOSED' ? 'bg-blue-100 text-blue-800'
                          : 'bg-emerald-100 text-emerald-800'}`}>
                          {cs.status === 'OPEN' ? t('banking.status_open') : cs.status === 'CLOSED' ? t('banking.status_closed') : t('common.approved')}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          {cs.status === 'OPEN' && hasPermission('cash:count') && (
                            <button onClick={() => openCloseModal(cs)} title={t('banking.close_session')}
                              className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50"><Lock className="w-3.5 h-3.5" /></button>
                          )}
                          {cs.status === 'CLOSED' && hasPermission('cash:approve') && (
                            <button onClick={() => handleApproveCash(cs)} title={t('banking.approve_session')}
                              className="p-1 rounded text-emerald-600 hover:bg-emerald-50"><CheckCircle2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={9} className="py-8 text-center text-slate-400">{t('banking.no_sessions')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-slate-400">{t('banking.approval_note')}</p>
        </div>
      )}

      {/* Open Cash Session Modal */}
      {showOpenCashModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Banknote className="w-4 h-4 text-amber-400" /><span>{t('banking.open_session')}</span>
              </h3>
              <button onClick={() => setShowOpenCashModal(false)} className="text-slate-400 hover:text-white p-1 rounded"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleOpenCash} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('banking.cash_account')} *</label>
                <select required value={openCashForm.bankAccountId}
                  onChange={(e) => setOpenCashForm({ ...openCashForm, bankAccountId: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white">
                  <option value="">—</option>
                  {cashAccounts.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('banking.opening_count')} *</label>
                <DenominationLines lines={openCashForm.countLines}
                  onChange={(lines) => setOpenCashForm({ ...openCashForm, countLines: lines })} t={t} />
              </div>
              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button type="button" onClick={() => setShowOpenCashModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 font-medium">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-md font-semibold">{t('banking.open_session')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Cash Session Modal */}
      {closingSession && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Lock className="w-4 h-4 text-blue-400" />
                <span>{t('banking.close_session')} — {closingSession.session_number}</span>
              </h3>
              <button onClick={() => setClosingSession(null)} className="text-slate-400 hover:text-white p-1 rounded"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCloseCash} className="p-5 space-y-4 text-xs">
              <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 flex justify-between font-semibold text-blue-900">
                <span>{t('banking.expected_cash')}</span>
                <span className="font-mono">{formatCurrency(closingExpected)}</span>
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('banking.closing_count')} *</label>
                <DenominationLines lines={closeCashForm.countLines}
                  onChange={(lines) => setCloseCashForm({ ...closeCashForm, countLines: lines })} t={t} />
              </div>
              {(() => {
                const counted = closeCashForm.countLines.reduce((sum, l) => sum + (Number(l.unitValue) || 0) * (Number(l.quantity) || 0), 0);
                const variance = Math.round((counted - closingExpected) * 100) / 100;
                return (
                  <div className={`rounded-md px-3 py-2 border flex justify-between font-bold ${Math.abs(variance) < 0.005 ? 'bg-slate-50 border-slate-200 text-slate-600' : variance < 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                    <span>{t('banking.variance')}</span>
                    <span className="font-mono">{formatCurrency(variance)}</span>
                  </div>
                );
              })()}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('banking.explanation')}</label>
                <textarea rows={2} value={closeCashForm.explanation}
                  onChange={(e) => setCloseCashForm({ ...closeCashForm, explanation: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md" />
                <p className="text-[10px] text-slate-400 mt-1">{t('banking.explanation_hint')}</p>
              </div>
              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button type="button" onClick={() => setClosingSession(null)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 font-medium">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold">{t('banking.close_session')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Bank Modal */}
      {showAddBankModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">{t('banking.add_bank')}</h3>
              <button
                onClick={() => setShowAddBankModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddBank} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('banking.bank_name')} *</label>
                <input
                  type="text"
                  required
                  value={bankForm.bank_name}
                  onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. Bank of Kigali Main"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('banking.account_number')} *</label>
                <input
                  type="text"
                  required
                  value={bankForm.account_number}
                  onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  placeholder="00040-01234567"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('banking.account_type')}</label>
                  <select
                    value={bankForm.account_type}
                    onChange={(e) => setBankForm({ ...bankForm, account_type: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="BANK">{t('banking.type_bank')}</option>
                    <option value="CASH">{t('banking.type_cash')}</option>
                    <option value="MOBILE_MONEY">{t('banking.type_momo')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.currency')}</label>
                  <input
                    type="text"
                    value={bankForm.currency}
                    onChange={(e) => setBankForm({ ...bankForm, currency: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddBankModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition font-semibold"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showRecordPaymentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">{t('banking.record_payment')}</h3>
              <button
                onClick={() => setShowRecordPaymentModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('banking.payment_type')} *</label>
                <select
                  value={paymentForm.paymentType}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentType: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                >
                  <option value="CUSTOMER_RECEIPT">{t('banking.cust_receipt')}</option>
                  <option value="SUPPLIER_PAYMENT">{t('banking.supp_payment')}</option>
                  <option value="DIRECT_EXPENSE">{t('banking.direct_expense')}</option>
                  <option value="DIRECT_INCOME">{t('banking.direct_income')}</option>
                  <option value="TRANSFER">{t('banking.transfer')}</option>
                  <option value="CUSTOMER_REFUND">{t('banking.cust_refund')}</option>
                </select>
              </div>

              {/* Conditional Party Fields */}
              {(paymentForm.paymentType === 'CUSTOMER_RECEIPT' || paymentForm.paymentType === 'CUSTOMER_REFUND') && (
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('sales.customer')} *</label>
                  <select
                    required
                    value={paymentForm.customerId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, customerId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">— {t('sales.customer')} —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {t('common.outstanding_balance')}: {formatCurrency(c.current_balance)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {paymentForm.paymentType === 'SUPPLIER_PAYMENT' && (
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('purchases.supplier')} *</label>
                  <select
                    required
                    value={paymentForm.supplierId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, supplierId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">— {t('purchases.supplier')} —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {t('common.outstanding_due')}: {formatCurrency(s.current_balance)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {paymentForm.paymentType === 'DIRECT_EXPENSE' && (
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('banking.expense_account')} *</label>
                  <select
                    required
                    value={paymentForm.expenseAccountId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, expenseAccountId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">— {t('banking.expense_account')} —</option>
                    {glAccounts
                      .filter((a) => a.type === 'EXPENSE')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {paymentForm.paymentType === 'DIRECT_INCOME' && (
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('banking.income_account')} *</label>
                  <select
                    required
                    value={paymentForm.incomeAccountId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, incomeAccountId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">— {t('banking.income_account')} —</option>
                    {glAccounts
                      .filter((a) => a.type === 'REVENUE')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {paymentForm.paymentType === 'TRANSFER' && (
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('banking.to_account')} *</label>
                  <select
                    required
                    value={paymentForm.toBankAccountId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, toBankAccountId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">— {t('banking.to_account')} —</option>
                    {bankAccounts
                      .filter((b) => b.id !== paymentForm.bankAccountId)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bank_name} ({b.account_type})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Source Bank Account & Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    {paymentForm.paymentType === 'TRANSFER' ? t('banking.from_account') : 'Account (Cash/Bank) *'}
                  </label>
                  <select
                    required
                    value={paymentForm.bankAccountId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, bankAccountId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name} ({formatCurrency(b.current_balance)})
                      </option>
                    ))}
                  </select>
                </div>

                {(paymentForm.paymentType === 'CUSTOMER_RECEIPT' || paymentForm.paymentType === 'SUPPLIER_PAYMENT') && (
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">
                      {paymentForm.paymentType === 'CUSTOMER_RECEIPT' ? t('banking.target_invoice') : t('banking.target_bill')}
                    </label>
                    <select
                      value={paymentForm.paymentType === 'CUSTOMER_RECEIPT' ? paymentForm.salesInvoiceId : paymentForm.purchaseInvoiceId}
                      onChange={(e) => setPaymentForm(paymentForm.paymentType === 'CUSTOMER_RECEIPT'
                        ? { ...paymentForm, salesInvoiceId: e.target.value }
                        : { ...paymentForm, purchaseInvoiceId: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white"
                    >
                      <option value="">{t('common.none')}</option>
                      {(paymentForm.paymentType === 'CUSTOMER_RECEIPT'
                        ? openInvoices.filter((i) => !paymentForm.customerId || i.customer_id === paymentForm.customerId)
                        : openBills.filter((b) => !paymentForm.supplierId || b.supplier_id === paymentForm.supplierId)
                      ).map((d) => {
                        const num = d.invoice_number || d.bill_number;
                        const due = d.balance_due != null ? d.balance_due : d.total;
                        return (
                          <option key={d.id} value={d.id}>{num} — {t('common.balance_due')}: {formatCurrency(due)}</option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {(paymentForm.paymentType === 'CUSTOMER_RECEIPT' || paymentForm.paymentType === 'SUPPLIER_PAYMENT') && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">{t('sales.currency')}</label>
                      <select value={paymentForm.currencyCode}
                        onChange={(e) => setPaymentForm({ ...paymentForm, currencyCode: e.target.value })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-md bg-white">
                        <option value="">{currentCompany?.currency_code || 'USD'}</option>
                        {currencies.filter((c) => c.code !== (currentCompany?.currency_code || 'USD')).map((c) => (
                          <option key={c.id || c.code} value={c.code}>{c.code}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">{t('sales.exchange_rate')}</label>
                      <input type="number" step="any" min="0" disabled={!paymentForm.currencyCode}
                        value={paymentForm.exchangeRate}
                        onChange={(e) => setPaymentForm({ ...paymentForm, exchangeRate: e.target.value })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-mono disabled:bg-slate-100" />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">{t('banking.foreign_amount')}</label>
                      <input type="number" step="any" min="0" disabled={!paymentForm.currencyCode}
                        value={paymentForm.foreignAmount}
                        onChange={(e) => setPaymentForm({ ...paymentForm, foreignAmount: e.target.value })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-mono disabled:bg-slate-100" />
                    </div>
                  </div>
                )}

                {paymentForm.currencyCode &&
                  (paymentForm.salesInvoiceId || paymentForm.purchaseInvoiceId) && (
                  <label className="flex items-start space-x-2 bg-indigo-50 border border-indigo-200 rounded-md px-3 py-2 cursor-pointer">
                    <input type="checkbox" className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600"
                      checked={paymentForm.settleWithFxDifference}
                      onChange={(e) => setPaymentForm({ ...paymentForm, settleWithFxDifference: e.target.checked })} />
                    <span className="text-[11px] text-indigo-900">
                      <span className="font-semibold">{t('banking.settle_fx_diff')}</span>
                      <span className="block text-[10px] text-indigo-600">{t('banking.settle_fx_hint')}</span>
                    </span>
                  </label>
                )}

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.amount')} *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={paymentForm.amount || ''}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-bold text-slate-900"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('banking.payment_method')}</label>
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="BANK_TRANSFER">{t('banking.method_bank')}</option>
                    <option value="CASH">{t('banking.method_cash')}</option>
                    <option value="MOBILE_MONEY">{t('banking.method_momo')}</option>
                    <option value="CHECK">Cheque</option>
                    <option value="CARD">Credit / Debit Card</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Payment Reference</label>
                  <input
                    type="text"
                    value={paymentForm.reference}
                    onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="e.g. MoMo ID, Cheque #"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('common.notes')}</label>
                <input
                  type="text"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={t('banking.narrative_placeholder')}
                />
              </div>

              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowRecordPaymentModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition font-semibold"
                >
                  {t('common.post_now')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
