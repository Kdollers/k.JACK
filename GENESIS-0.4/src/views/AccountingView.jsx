import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { inputDate } from '../i18n/format.mjs';
import { labelFor, accountLabel } from '../i18n/labels.mjs';
import { translateLedgerText } from '../i18n/ledger-text.mjs';
import { apiRequest } from '../services/api';
import {
  BookOpen,
  Plus,
  Search,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Trash2,
  Calendar,
  X,
  ChevronRight,
  Filter
} from 'lucide-react';

export default function AccountingView() {
  const { currentCompany, formatCurrency, formatDate, showToast, refreshKey } = useApp();
  const { t, plural } = useI18n();

  const [activeTab, setActiveTab] = useState('accounts'); // 'accounts', 'journal', 'ledger'
  const [accounts, setAccounts] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [showNewEntryModal, setShowNewEntryModal] = useState(false);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [reversingEntryId, setReversingEntryId] = useState(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalBusy, setReversalBusy] = useState(false);

  // General Ledger state
  const [ledgerAccountId, setLedgerAccountId] = useState('');
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // New Journal Entry Form State
  const [entryForm, setEntryForm] = useState({
    date: inputDate(),
    reference: '',
    description: '',
    lines: [
      { accountId: '', description: '', debit: 0, credit: 0 },
      { accountId: '', description: '', debit: 0, credit: 0 }
    ]
  });

  // New Account Form State
  const [accountForm, setAccountForm] = useState({
    code: '',
    name: '',
    type: 'ASSET',
    subtype: 'CURRENT_ASSET',
    normal_balance: 'DEBIT',
    notes: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const accData = await apiRequest('/api/accounts');
      setAccounts(accData);
      if (accData.length > 0 && !ledgerAccountId) {
        setLedgerAccountId(accData[0].id);
      }

      if (activeTab === 'journal') {
        const jeData = await apiRequest('/api/journal-entries');
        setJournalEntries(jeData);
      }
    } catch (err) {
      showToast(err, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchLedger = async () => {
    if (!ledgerAccountId) return;
    setLedgerLoading(true);
    try {
      const data = await apiRequest(`/api/reports/general-ledger?accountId=${ledgerAccountId}`);
      setLedgerData(data);
    } catch (err) {
      showToast(err, 'error');
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentCompany?.id, activeTab, refreshKey]);

  useEffect(() => {
    if (activeTab === 'ledger' && ledgerAccountId) {
      fetchLedger();
    }
  }, [activeTab, ledgerAccountId]);

  // Line calculations for journal entry
  const updateEntryLine = (idx, field, value) => {
    const lines = [...entryForm.lines];
    lines[idx][field] = value;
    if (field === 'debit' && Number(value) > 0) lines[idx].credit = 0;
    if (field === 'credit' && Number(value) > 0) lines[idx].debit = 0;
    setEntryForm({ ...entryForm, lines });
  };

  const addEntryLine = () => {
    setEntryForm({
      ...entryForm,
      lines: [...entryForm.lines, { accountId: '', description: '', debit: 0, credit: 0 }]
    });
  };

  const removeEntryLine = (idx) => {
    if (entryForm.lines.length <= 2) return;
    const lines = entryForm.lines.filter((_, i) => i !== idx);
    setEntryForm({ ...entryForm, lines });
  };

  const sumDebits = entryForm.lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
  const sumCredits = entryForm.lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);
  const balanceDiff = Math.abs(sumDebits - sumCredits);
  const isBalanced = balanceDiff < 0.001 && sumDebits > 0;

  const handlePostJournalEntry = async (e) => {
    e.preventDefault();
    if (!isBalanced) {
      return showToast({ key: 'accounting.journal_unbalanced_notice', params: { amount: balanceDiff }, currencyParams: ['amount'] }, 'error');
    }

    try {
      const res = await apiRequest('/api/journal-entries', {
        method: 'POST',
        body: JSON.stringify(entryForm)
      });
      showToast({ key: 'accounting.journal_posted_notice', params: { number: res.entryNumber } }, 'success');
      setShowNewEntryModal(false);
      setEntryForm({
        date: inputDate(),
        reference: '',
        description: '',
        lines: [
          { accountId: '', description: '', debit: 0, credit: 0 },
          { accountId: '', description: '', debit: 0, credit: 0 }
        ]
      });
      fetchData();
    } catch (err) {
      showToast(err, 'error');
    }
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/api/accounts', {
        method: 'POST',
        body: JSON.stringify(accountForm)
      });
      showToast({ key: 'accounting.account_created_notice' }, 'success');
      setShowAddAccountModal(false);
      setAccountForm({ code: '', name: '', type: 'ASSET', subtype: 'CURRENT_ASSET', normal_balance: 'DEBIT', notes: '' });
      fetchData();
    } catch (err) {
      showToast(err, 'error');
    }
  };

  const handleReverseEntry = (entryId) => {
    setReversalReason('');
    setReversingEntryId(entryId);
  };

  const submitReversal = async (e) => {
    e.preventDefault();
    if (!reversalReason.trim() || !reversingEntryId || reversalBusy) return;
    setReversalBusy(true);
    try {
      const res = await apiRequest(`/api/journal-entries/${reversingEntryId}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason: reversalReason.trim() })
      });
      showToast({ key: 'accounting.reversal_posted_notice', params: { number: res.entryNumber } }, 'success');
      setReversingEntryId(null);
      fetchData();
    } catch (err) {
      showToast(err, 'error');
    } finally {
      setReversalBusy(false);
    }
  };

  const viewEntryDetails = async (id) => {
    try {
      const data = await apiRequest(`/api/journal-entries/${id}`);
      setSelectedEntry(data);
    } catch (err) {
      showToast(err, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t('accounting.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('accounting.subtitle')}</p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setActiveTab('accounts')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'accounts' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('accounting.tab_accounts')}
            </button>
            <button
              onClick={() => setActiveTab('journal')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'journal' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('accounting.tab_journal')}
            </button>
            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'ledger' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('accounting.tab_ledger')}
            </button>
          </div>

          <button
            onClick={() => setShowAddAccountModal(true)}
            className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("accounting.add_account")}</span>
          </button>

          <button
            onClick={() => setShowNewEntryModal(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('accounting.new_entry')}</span>
          </button>
        </div>
      </div>

      {/* 1. Chart of Accounts Tab */}
      {activeTab === 'accounts' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="relative w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={t('common.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">{plural('accounting.account_count', accounts.length)}</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('common.code')}</th>
                  <th className="py-2.5 px-4">{t('common.name')}</th>
                  <th className="py-2.5 px-4">{t('common.type')}</th>
                  <th className="py-2.5 px-4">{t("accounting.subtype")}</th>
                  <th className="py-2.5 px-4">{t("accounting.normal_balance")}</th>
                  <th className="py-2.5 px-4 text-right">{t("common.debit_balance")}</th>
                  <th className="py-2.5 px-4 text-right">{t("common.credit_balance")}</th>
                  <th className="py-2.5 px-4 text-right">{t("accounting.net_balance")}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts
                  .filter((a) => !search || a.code.includes(search) || a.name.toLowerCase().includes(search.toLowerCase()) || accountLabel(a, t).toLowerCase().includes(search.toLowerCase()))
                  .map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">{a.code}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">{accountLabel(a, t)}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {labelFor(a.type, t)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">{labelFor(a.subtype, t)}</td>
                      <td className="py-3 px-4 text-slate-600 text-[11px] uppercase font-mono">{labelFor(a.normal_balance, t)}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {formatCurrency(a.total_debit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {formatCurrency(a.total_credit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(a.balance)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => {
                            setLedgerAccountId(a.id);
                            setActiveTab('ledger');
                          }}
                          className="text-xs text-blue-600 hover:underline font-semibold"
                        >{t("accounting.ledger")}</button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Journal Entries Tab */}
      {activeTab === 'journal' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">{t('accounting.tab_journal')}</h2>
            <div className="text-xs text-slate-500 font-medium">{plural('accounting.entry_count', journalEntries.length)}</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('accounting.entry_number')}</th>
                  <th className="py-2.5 px-4">{t('common.date')}</th>
                  <th className="py-2.5 px-4">{t('common.reference')}</th>
                  <th className="py-2.5 px-4">{t('accounting.source_type')}</th>
                  <th className="py-2.5 px-4">{t('common.description')}</th>
                  <th className="py-2.5 px-4 text-right">{t('accounting.total_debit')}</th>
                  <th className="py-2.5 px-4 text-right">{t('accounting.total_credit')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {journalEntries.map((je) => (
                  <tr key={je.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-blue-600">{je.entry_number}</td>
                    <td className="py-3 px-4 text-slate-600">{formatDate(je.date)}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{je.reference || '-'}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                        {labelFor(je.source_type, t)}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 max-w-xs truncate">{translateLedgerText(je.description, je.source_type, t)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {formatCurrency(je.total_debit)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {formatCurrency(je.total_credit)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                          je.status === 'POSTED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {labelFor(je.status, t)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        <button
                          onClick={() => viewEntryDetails(je.id)}
                          className="px-2 py-1 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                        >{t("accounting.details")}</button>
                        {je.status === 'POSTED' && (
                          <button
                            onClick={() => handleReverseEntry(je.id)}
                            title={t("accounting.reverse_void")}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. General Ledger Explorer Tab */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-700">{t("auth.account")}{":"}</span>
              <select
                value={ledgerAccountId}
                onChange={(e) => setLedgerAccountId(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-80"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {accountLabel(a, t)} ({labelFor(a.type, t)})
                  </option>
                ))}
              </select>
            </div>

            {ledgerData && (
              <div className="flex items-center space-x-4 text-xs">
                <div>
                  <span className="text-slate-500">{t("accounting.opening")}{":"}{' '}</span>
                  <span className="font-bold font-mono text-slate-800">
                    {formatCurrency(ledgerData.openingBalance)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">{t("accounting.net_closing")}{":"}{' '}</span>
                  <span className="font-bold font-mono text-blue-700 text-sm">
                    {formatCurrency(ledgerData.closingBalance)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('common.date')}</th>
                  <th className="py-2.5 px-4">{t('accounting.entry_number')}</th>
                  <th className="py-2.5 px-4">{t('common.reference')}</th>
                  <th className="py-2.5 px-4">{t('common.description')}</th>
                  <th className="py-2.5 px-4 text-right">{t('accounting.debit')}</th>
                  <th className="py-2.5 px-4 text-right">{t('accounting.credit')}</th>
                  <th className="py-2.5 px-4 text-right">{t('accounting.running_balance')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerLoading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : ledgerData?.entries && ledgerData.entries.length > 0 ? (
                  ledgerData.entries.map((line) => (
                    <tr key={line.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 text-slate-600">{formatDate(line.date)}</td>
                      <td className="py-2.5 px-4 font-mono font-bold text-blue-600">{line.entryNumber}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-500">{line.reference || '-'}</td>
                      <td className="py-2.5 px-4 text-slate-800 font-medium">{translateLedgerText(line.description, line.sourceType, t)}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-medium text-slate-700">
                        {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-medium text-slate-700">
                        {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(line.runningBalance)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">{t("accounting.ledger_empty")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Manual Journal Entry Modal */}
      {showNewEntryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full my-8 overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-blue-400" />
                <span>{t('accounting.new_entry')}</span>
              </h3>
              <button
                onClick={() => setShowNewEntryModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePostJournalEntry} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.date')} *</label>
                  <input
                    type="date"
                    required
                    value={entryForm.date}
                    onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.reference')}</label>
                  <input
                    type="text"
                    value={entryForm.reference}
                    onChange={(e) => setEntryForm({ ...entryForm, reference: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder={t("accounting.memo_voucher_number")}
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.description')} *</label>
                  <input
                    type="text"
                    required
                    value={entryForm.description}
                    onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={t("accounting.transaction_purpose")}
                  />
                </div>
              </div>

              {/* Journal Lines Table */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-bold text-slate-700">{t("accounting.journal_lines_debits_and_credits")}</h4>
                  <button
                    type="button"
                    onClick={addEntryLine}
                    className="text-blue-600 hover:text-blue-700 font-semibold text-xs flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('accounting.add_line')}</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 w-5/12">{t('accounting.select_account')} *</th>
                        <th className="py-2 px-3 w-3/12">{t('common.description')}</th>
                        <th className="py-2 px-3 text-right w-2/12">{t('accounting.debit')} ($)</th>
                        <th className="py-2 px-3 text-right w-2/12">{t('accounting.credit')} ($)</th>
                        <th className="py-2 px-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {entryForm.lines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-3">
                            <select
                              required
                              value={line.accountId}
                              onChange={(e) => updateEntryLine(idx, 'accountId', e.target.value)}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                            >
                              <option value="">{t("accounting.choose_gl_account")}</option>
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.code} - {accountLabel(a, t)} ({labelFor(a.type, t)})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={line.description}
                              onChange={(e) => updateEntryLine(idx, 'description', e.target.value)}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded"
                              placeholder={t("accounting.line_narrative")}
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.debit || ''}
                              onChange={(e) => updateEntryLine(idx, 'debit', e.target.value)}
                              className="w-full px-2 py-1.5 text-right border border-slate-300 rounded font-mono font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.credit || ''}
                              onChange={(e) => updateEntryLine(idx, 'credit', e.target.value)}
                              className="w-full px-2 py-1.5 text-right border border-slate-300 rounded font-mono font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeEntryLine(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                      <tr>
                        <td colSpan={2} className="py-2.5 px-3 text-right text-slate-600">{t("accounting.totals")}{":"}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                          {formatCurrency(sumDebits)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                          {formatCurrency(sumCredits)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Real-time Balancing Indicator */}
              <div
                className={`p-3 rounded-lg border flex items-center justify-between text-xs font-semibold ${
                  isBalanced
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-rose-50 border-rose-300 text-rose-800'
                }`}
              >
                <div className="flex items-center space-x-2">
                  {isBalanced ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                  <span>
                    {isBalanced
                      ? t('accounting.balanced')
                      : `${t('accounting.unbalanced')}: Difference is ${formatCurrency(balanceDiff)}`}
                  </span>
                </div>
                <div className="font-mono">{t("common.total")}{":"}{' '}{formatCurrency(sumDebits)}</div>
              </div>

              <div className="border-t border-slate-200 pt-4 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewEntryModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!isBalanced}
                  className={`px-6 py-2 rounded-md font-semibold transition shadow ${
                    isBalanced
                      ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {t('common.post_now')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Journal Entry Viewer Details Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">{t("accounting.journal_entry_number")}{selectedEntry.entry_number}</h3>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <div className="text-slate-500">{t("common.date")}{":"}{' '}{formatDate(selectedEntry.date)}</div>
                  <div className="text-slate-500">{t("accounting.source")}{":"}{' '}{labelFor(selectedEntry.source_type, t)}</div>
                  <div className="text-slate-500">{t("accounting.ref")}{":"}{' '}{selectedEntry.reference || '-'}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-800">{t("common.status")}{":"}{' '}{labelFor(selectedEntry.status, t)}</div>
                  <div className="font-mono font-bold text-blue-700 text-sm mt-1">{t("common.amount")}{":"}{formatCurrency(selectedEntry.total_debit)}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-700 mb-2">{t("accounting.accounting_lines")}</h4>
                <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">{t("auth.account")}</th>
                      <th className="py-2 px-3">{t("common.description")}</th>
                      <th className="py-2 px-3 text-right">{t("accounting.debit")}</th>
                      <th className="py-2 px-3 text-right">{t("accounting.credit")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedEntry.lines &&
                      selectedEntry.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="py-2 px-3 font-semibold text-slate-800">
                            {l.account_code} - {accountLabel({ code: l.account_code, name: l.account_name }, t)}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{translateLedgerText(l.description, selectedEntry.source_type, t)}</td>
                          <td className="py-2 px-3 text-right font-mono font-medium text-slate-800">
                            {l.debit > 0 ? formatCurrency(l.debit) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-medium text-slate-800">
                            {l.credit > 0 ? formatCurrency(l.credit) : '-'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reversal requires an explicit reason; unlike a native browser prompt,
          this dialog and its buttons switch language immediately. */}
      {reversingEntryId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="reversal-title">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5">
              <h3 id="reversal-title" className="font-bold text-sm">{t('accounting.reverse_entry')}</h3>
            </div>
            <form onSubmit={submitReversal} className="p-5 space-y-4 text-xs">
              <label className="block space-y-1.5">
                <span className="font-semibold text-slate-700">{t('accounting.reversal_prompt')}</span>
                <input autoFocus type="text" required maxLength={500} value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md" />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setReversingEntryId(null)} disabled={reversalBusy}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700">{t('common.cancel')}</button>
                <button type="submit" disabled={reversalBusy || !reversalReason.trim()}
                  className="px-3 py-1.5 bg-rose-600 disabled:opacity-50 text-white rounded-md">{t('accounting.reverse_entry')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddAccountModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">{t("accounting.add_account_title")}</h3>
              <button
                onClick={() => setShowAddAccountModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t("common.account_code")}{" *"}</label>
                  <input
                    type="text"
                    required
                    value={accountForm.code}
                    onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-bold"
                    placeholder={t('accounting.account_code_example')}
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t("accounting.normal_balance")}{" *"}</label>
                  <select
                    value={accountForm.normal_balance}
                    onChange={(e) => setAccountForm({ ...accountForm, normal_balance: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                  >
                    <option value="DEBIT">{t("accounting.debit")}</option>
                    <option value="CREDIT">{t("accounting.credit")}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t("common.account_name")}{" *"}</label>
                <input
                  type="text"
                  required
                  value={accountForm.name}
                  onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={t("accounting.e_g_software_subscriptions")}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t("banking.account_type")}{" *"}</label>
                  <select
                    value={accountForm.type}
                    onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="ASSET">{t('accounting.type_asset')}</option>
                    <option value="LIABILITY">{t('accounting.type_liability')}</option>
                    <option value="EQUITY">{t('accounting.type_equity')}</option>
                    <option value="REVENUE">{t('accounting.type_revenue')}</option>
                    <option value="COGS">{t('accounting.type_cogs')}</option>
                    <option value="EXPENSE">{t('accounting.type_expense')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t("accounting.subtype")}</label>
                  <input
                    type="text"
                    value={accountForm.subtype}
                    onChange={(e) => setAccountForm({ ...accountForm, subtype: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
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
    </div>
  );
}
