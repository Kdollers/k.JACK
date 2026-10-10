import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../services/api';
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
  X
} from 'lucide-react';

export default function BankingView() {
  const { currentCompany, formatCurrency, formatDate, showToast, refreshKey } = useApp();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState('accounts'); // 'accounts', 'payments'
  const [bankAccounts, setBankAccounts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);

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
    paymentType: 'CUSTOMER_RECEIPT', // CUSTOMER_RECEIPT, SUPPLIER_PAYMENT, DIRECT_EXPENSE, DIRECT_INCOME, TRANSFER
    paymentMethod: 'BANK_TRANSFER',
    bankAccountId: '',
    toBankAccountId: '',
    customerId: '',
    supplierId: '',
    expenseAccountId: '',
    incomeAccountId: '',
    amount: 0,
    reference: '',
    notes: ''
  });

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

      if (banks.length > 0 && !paymentForm.bankAccountId) {
        setPaymentForm((prev) => ({ ...prev, bankAccountId: banks[0].id }));
      }
    } catch (err) {
      showToast(err.message, 'error');
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
      showToast('Cash / Bank account added successfully', 'success');
      setShowAddBankModal(false);
      setBankForm({ bank_name: '', account_number: '', account_type: 'BANK', currency: 'USD', opening_balance: 0 });
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!paymentForm.bankAccountId || paymentForm.amount <= 0) {
      return showToast('Valid account and positive payment amount are required', 'error');
    }

    try {
      const res = await apiRequest('/api/payments', {
        method: 'POST',
        body: JSON.stringify(paymentForm)
      });
      showToast(`Payment ${res.paymentNumber} posted and ledger updated!`, 'success');
      setShowRecordPaymentModal(false);
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
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
          </div>

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
                  <th className="py-2.5 px-4">Voucher #</th>
                  <th className="py-2.5 px-4">{t('banking.payment_type')}</th>
                  <th className="py-2.5 px-4">Account Used</th>
                  <th className="py-2.5 px-4">Associated Party / Category</th>
                  <th className="py-2.5 px-4">Method</th>
                  <th className="py-2.5 px-4 text-right">{t('common.amount')}</th>
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
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      {t('common.no_data')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
                </select>
              </div>

              {/* Conditional Party Fields */}
              {paymentForm.paymentType === 'CUSTOMER_RECEIPT' && (
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('sales.customer')} *</label>
                  <select
                    required
                    value={paymentForm.customerId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, customerId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Choose Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — Outstanding Balance: {formatCurrency(c.current_balance)}
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
                    <option value="">-- Choose Supplier --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — Outstanding Due: {formatCurrency(s.current_balance)}
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
                    <option value="">-- Choose Operating Expense --</option>
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
                    <option value="">-- Choose Income Account --</option>
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
                    <option value="">-- Choose Destination Account --</option>
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
                  placeholder="Voucher narrative or purpose"
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
