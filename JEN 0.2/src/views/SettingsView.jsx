import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest, downloadAuthenticated, translateError } from '../services/api';
import {
  Settings,
  Building,
  Users,
  Percent,
  ShieldCheck,
  Database,
  Download,
  Upload,
  RefreshCw,
  Plus,
  Check,
  AlertTriangle,
  X
} from 'lucide-react';

export default function SettingsView() {
  const { currentCompany, companies, switchCompany, users, showToast, refreshKey, triggerRefresh, logout } = useApp();
  const { lang, setLang, t } = useI18n();

  const [activeTab, setActiveTab] = useState('company'); // 'company', 'users', 'taxes', 'audit', 'backup'
  const [auditLogs, setAuditLogs] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(false);

  // Company Form
  const [companyForm, setCompanyForm] = useState({
    name: '',
    legal_name: '',
    address: '',
    phone: '',
    email: '',
    tax_id: '',
    currency_code: 'USD',
    currency_symbol: '$',
    currency_decimals: 2,
    fiscal_year_start: '01-01',
    fiscal_year_end: '12-31',
    default_language: 'en',
    tax_inclusive_pricing: 0,
    inventory_valuation_method: 'WEIGHTED_AVERAGE',
    require_goods_receipt: 0
  });

  // New Company Modal
  const [showNewCompanyModal, setShowNewCompanyModal] = useState(false);
  const [newCompanyForm, setNewCompanyForm] = useState({
    name: '',
    legal_name: '',
    address: '',
    phone: '',
    email: '',
    tax_id: '',
    currency_code: 'USD',
    currency_symbol: '$'
  });

  // User Modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    full_name: '',
    email: '',
    role: 'accountant'
  });

  // Tax Modal
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [taxForm, setTaxForm] = useState({
    code: '',
    name: '',
    rate: 18.0
  });

  useEffect(() => {
    if (currentCompany) {
      setCompanyForm({
        name: currentCompany.name || '',
        legal_name: currentCompany.legal_name || '',
        address: currentCompany.address || '',
        phone: currentCompany.phone || '',
        email: currentCompany.email || '',
        tax_id: currentCompany.tax_id || '',
        currency_code: currentCompany.currency_code || 'USD',
        currency_symbol: currentCompany.currency_symbol || '$',
        currency_decimals: currentCompany.currency_decimals ?? 2,
        fiscal_year_start: currentCompany.fiscal_year_start || '01-01',
        fiscal_year_end: currentCompany.fiscal_year_end || '12-31',
        default_language: currentCompany.default_language || 'en',
        tax_inclusive_pricing: currentCompany.tax_inclusive_pricing || 0,
        inventory_valuation_method: currentCompany.inventory_valuation_method || 'WEIGHTED_AVERAGE',
        require_goods_receipt: currentCompany.require_goods_receipt || 0
      });
    }
  }, [currentCompany]);

  const fetchTaxes = async () => {
    try {
      const data = await apiRequest('/api/taxes');
      setTaxes(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const data = await apiRequest('/api/audit-trail');
      setAuditLogs(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'taxes') fetchTaxes();
    else if (activeTab === 'audit') fetchAuditLogs();
    else if (activeTab === 'currencies') {
      fetchCurrencies();
      apiRequest('/api/fx/revaluations').then(setRevaluations).catch(() => setRevaluations([]));
    }
  }, [activeTab, refreshKey]);

  const handleSaveCompany = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/api/companies/current', {
        method: 'PUT',
        body: JSON.stringify(companyForm)
      });
      showToast(t('common.success', 'Saved'), 'success');
      triggerRefresh();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    try {
      const newComp = await apiRequest('/api/companies', {
        method: 'POST',
        body: JSON.stringify(newCompanyForm)
      });
      showToast(`Company ${newComp.name} created! Chart of accounts initialized.`, 'success');
      setShowNewCompanyModal(false);
      triggerRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify(userForm)
      });
      showToast(`User ${userForm.username} created successfully`, 'success');
      setShowUserModal(false);
      setUserForm({ username: '', password: '', full_name: '', email: '', role: 'accountant' });
      triggerRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCreateTax = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/api/taxes', {
        method: 'POST',
        body: JSON.stringify(taxForm)
      });
      showToast('Tax rate configured successfully', 'success');
      setShowTaxModal(false);
      setTaxForm({ code: '', name: '', rate: 18 });
      fetchTaxes();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDownloadBackup = async () => {
    try {
      await downloadAuthenticated('/api/backup/export', `genesis-backup-${Date.now()}.json`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Restore is staged: choose a file, then confirm with the current password and the word RESTORE.
  // ---------------- currencies & FX ----------------
  const [currencies, setCurrencies] = useState([]);
  const [rates, setRates] = useState([]);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [currencyForm, setCurrencyForm] = useState({ code: '', name: '', symbol: '', decimals: 2 });
  const [rateForm, setRateForm] = useState({ baseCode: '', quoteCode: '', rate: '', effectiveDate: new Date().toISOString().split('T')[0] });
  const [convForm, setConvForm] = useState({ amount: '', from: '', to: '' });
  const [revaluations, setRevaluations] = useState([]);
  const [revalForm, setRevalForm] = useState({ date: new Date().toISOString().split('T')[0], notes: '' });
  const [convResult, setConvResult] = useState(null);

  const fetchCurrencies = async () => {
    try {
      const c = await apiRequest('/api/fx/currencies');
      setCurrencies(c);
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const fetchRates = async (base) => {
    if (!base) { setRates([]); return; }
    try {
      const r = await apiRequest(`/api/fx/rates?from=${base}`);
      setRates(r);
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const handleAddCurrency = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/api/fx/currencies', { method: 'POST', body: JSON.stringify(currencyForm) });
      showToast(t('common.success', 'Saved'), 'success');
      setShowCurrencyModal(false);
      setCurrencyForm({ code: '', name: '', symbol: '', decimals: 2 });
      fetchCurrencies();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const handleToggleCurrency = async (cur) => {
    try {
      await apiRequest(`/api/fx/currencies/${cur.id}`, { method: 'PUT', body: JSON.stringify({ active: cur.active ? 0 : 1 }) });
      fetchCurrencies();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const handleAddRate = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/api/fx/rates', {
        method: 'POST',
        body: JSON.stringify({ fromCode: rateForm.baseCode, toCode: rateForm.quoteCode, rate: Number(rateForm.rate), effectiveDate: rateForm.effectiveDate })
      });
      showToast(t('settings.rate_added'), 'success');
      setRateForm({ ...rateForm, rate: '' });
      fetchRates(rateForm.baseCode);
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const handleRunRevaluation = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/api/fx/revaluate', {
        method: 'POST',
        body: JSON.stringify({ date: revalForm.date, notes: revalForm.notes })
      });
      showToast(`${res.revaluationNumber}: ${t('settings.reval_docs')} ${res.documents}, ${t('settings.reval_gain')} ${res.totalGain}, ${t('settings.reval_loss')} ${res.totalLoss}`, 'success');
      const list = await apiRequest('/api/fx/revaluations');
      setRevaluations(list);
      fetchRates(rateForm.baseCode);
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const handleConvert = async (e) => {
    e.preventDefault();
    setConvResult(null);
    try {
      const res = await apiRequest(`/api/fx/convert?amount=${Number(convForm.amount)}&from=${convForm.from}&to=${convForm.to}&date=${new Date().toISOString().split('T')[0]}`);
      setConvResult(res);
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const [restoreDraft, setRestoreDraft] = useState(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);

  const handleRestoreUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const backupJson = JSON.parse(text);
      setRestorePassword('');
      setRestoreConfirm('');
      setRestoreDraft({ fileName: file.name, text: text.trim(), backup: backupJson });
    } catch (err) {
      showToast(`${t('settings.restore_invalid_file')}: ${err.message}`, 'error');
    }
  };

  const cancelRestore = () => {
    setRestoreDraft(null);
    setRestorePassword('');
    setRestoreConfirm('');
  };

  const submitRestore = async () => {
    if (!restoreDraft || restoreConfirm !== 'RESTORE' || !restorePassword) return;
    setRestoreBusy(true);
    try {
      // The file text is sent unchanged inside the envelope so its checksum still matches.
      const payload = `{"backup":${restoreDraft.text},"password":${JSON.stringify(restorePassword)},"confirm":"RESTORE"}`;
      await apiRequest('/api/backup/import', { method: 'POST', body: payload });
      cancelRestore();
      showToast(t('settings.restore_done'), 'success');
      // The server has revoked every session: return to sign-in.
      await logout();
    } catch (err) {
      showToast(`${t('settings.restore_failed')}: ${err.message}`, 'error');
    } finally {
      setRestoreBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t('settings.title')}</h1>
        <p className="text-xs text-slate-500 mt-0.5">{t('settings.subtitle')}</p>
      </div>

      {/* Tabs bar */}
      <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium overflow-x-auto">
        <button
          onClick={() => setActiveTab('company')}
          className={`px-3 py-1.5 rounded-md transition ${
            activeTab === 'company' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t('settings.tab_company')}
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-3 py-1.5 rounded-md transition ${
            activeTab === 'users' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t('settings.tab_users')}
        </button>
        <button
          onClick={() => setActiveTab('taxes')}
          className={`px-3 py-1.5 rounded-md transition ${
            activeTab === 'taxes' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t('settings.tab_taxes')}
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-3 py-1.5 rounded-md transition ${
            activeTab === 'audit' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t('settings.tab_audit')}
        </button>
        <button
          onClick={() => setActiveTab('currencies')}
          className={`px-3 py-1.5 rounded-md transition ${
            activeTab === 'currencies' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t('settings.tab_currencies')}
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          className={`px-3 py-1.5 rounded-md transition ${
            activeTab === 'backup' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t('settings.tab_backup')}
        </button>
      </div>

      {/* 1. Company Setup Tab */}
      {activeTab === 'company' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-3xl">
          <div className="flex justify-between items-center border-b border-slate-200 pb-4 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">{t('settings.tab_company')}</h2>
              <p className="text-[11px] text-slate-500">Legal entity details, fiscal calendar, currency, and valuation rules</p>
            </div>
            <button
              onClick={() => setShowNewCompanyModal(true)}
              className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Company</span>
            </button>
          </div>

          <form onSubmit={handleSaveCompany} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('settings.company_name')} *</label>
                <input
                  type="text"
                  required
                  value={companyForm.name}
                  onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('settings.legal_name')}</label>
                <input
                  type="text"
                  value={companyForm.legal_name}
                  onChange={(e) => setCompanyForm({ ...companyForm, legal_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('common.tax_id')}</label>
                <input
                  type="text"
                  value={companyForm.tax_id}
                  onChange={(e) => setCompanyForm({ ...companyForm, tax_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('common.phone')}</label>
                <input
                  type="text"
                  value={companyForm.phone}
                  onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('common.email')}</label>
                <input
                  type="email"
                  value={companyForm.email}
                  onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">{t('common.address')}</label>
              <input
                type="text"
                value={companyForm.address}
                onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Currency Code</label>
                <input
                  type="text"
                  value={companyForm.currency_code}
                  onChange={(e) => setCompanyForm({ ...companyForm, currency_code: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  placeholder="USD, RWF, EUR"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Currency Symbol</label>
                <input
                  type="text"
                  value={companyForm.currency_symbol}
                  onChange={(e) => setCompanyForm({ ...companyForm, currency_symbol: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  placeholder="$, Frw, €"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Decimals</label>
                <input
                  type="number"
                  min="0"
                  max="4"
                  value={companyForm.currency_decimals}
                  onChange={(e) => setCompanyForm({ ...companyForm, currency_decimals: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  {t('settings.valuation_method')}
                </label>
                <select
                  value={companyForm.inventory_valuation_method}
                  onChange={(e) => setCompanyForm({ ...companyForm, inventory_valuation_method: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                >
                  <option value="WEIGHTED_AVERAGE">{t('settings.weighted_average')}</option>
                  <option value="FIFO">{t('settings.fifo')}</option>
                </select>
              </div>

              <div className="flex items-start space-x-2.5">
                <input
                  type="checkbox"
                  id="require_goods_receipt"
                  checked={!!companyForm.require_goods_receipt}
                  onChange={(e) => setCompanyForm({ ...companyForm, require_goods_receipt: e.target.checked ? 1 : 0 })}
                  className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="require_goods_receipt" className="text-xs text-slate-600 cursor-pointer">
                  <span className="font-semibold text-slate-700">{t('settings.require_goods_receipt')}</span>
                  <span className="block text-[10px] text-slate-400">{t('settings.require_goods_receipt_hint')}</span>
                </label>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('common.language')}</label>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                >
                  <option value="en">English (UK / US)</option>
                  <option value="fr">Français</option>
                  <option value="rw">Ikinyarwanda</option>
                </select>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 flex justify-end">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold transition shadow"
              >
                {t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Users & Roles Tab */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">{t('settings.tab_users')}</h2>
              <p className="text-[11px] text-slate-500">Role-based access control and user authorization</p>
            </div>
            <button
              onClick={() => setShowUserModal(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 shadow"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add User</span>
            </button>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Full Name</th>
                <th className="py-2.5 px-4">Username</th>
                <th className="py-2.5 px-4">Role</th>
                <th className="py-2.5 px-4">Email</th>
                <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-800">{u.full_name}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">@{u.username}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-200">
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500">{u.email || '-'}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800">
                      {t('common.active')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. Tax Rates Tab */}
      {activeTab === 'taxes' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">{t('settings.tab_taxes')}</h2>
              <p className="text-[11px] text-slate-500">Configurable sales and purchase tax rates</p>
            </div>
            <button
              onClick={() => setShowTaxModal(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 shadow"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Tax Rate</span>
            </button>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">{t('common.code')}</th>
                <th className="py-2.5 px-4">{t('common.name')}</th>
                <th className="py-2.5 px-4 text-right">Tax Rate %</th>
                <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {taxes.map((tItem) => (
                <tr key={tItem.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-blue-600">{tItem.code}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{tItem.name}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{tItem.rate}%</td>
                  <td className="py-3 px-4 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800">
                      {t('common.active')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Audit Trail Tab */}
      {/* 2b. Currencies & Exchange Rates Tab */}
      {activeTab === 'currencies' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">{t('settings.tab_currencies')}</h2>
                <p className="text-[11px] text-slate-500">{t('settings.base_currency')}: {currentCompany?.currency_code}</p>
              </div>
              <button onClick={() => setShowCurrencyModal(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow">
                <span>{t('settings.add_currency')}</span>
              </button>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('settings.currency_code')}</th>
                  <th className="py-2.5 px-4">{t('settings.currency_name')}</th>
                  <th className="py-2.5 px-4">{t('settings.currency_symbol')}</th>
                  <th className="py-2.5 px-4 text-center">{t('settings.currency_decimals')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currencies.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-800">{c.code}</td>
                    <td className="py-2.5 px-4 text-slate-600">{c.name}</td>
                    <td className="py-2.5 px-4">{c.symbol || '—'}</td>
                    <td className="py-2.5 px-4 text-center font-mono">{c.decimals}</td>
                    <td className="py-2.5 px-4 text-center">
                      {c.is_base ? (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-indigo-100 text-indigo-800" title={t('settings.base_locked')}>{t('settings.is_base')}</span>
                      ) : (
                        <button onClick={() => handleToggleCurrency(c)}
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                          {c.active ? t('settings.currency_active') : t('settings.currency_inactive')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Rates */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <h2 className="text-sm font-bold text-slate-800">{t('settings.exchange_rates')}</h2>
              </div>
              <form onSubmit={handleAddRate} className="p-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('settings.from_currency')}</label>
                  <select required value={rateForm.baseCode}
                    onChange={(e) => { const nf = { ...rateForm, baseCode: e.target.value }; setRateForm(nf); fetchRates(e.target.value); }}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white">
                    <option value="">—</option>
                    {currencies.filter((c) => c.active).map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('settings.to_currency')}</label>
                  <select required value={rateForm.quoteCode}
                    onChange={(e) => setRateForm({ ...rateForm, quoteCode: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white">
                    <option value="">—</option>
                    {currencies.filter((c) => c.active && c.code !== rateForm.baseCode).map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('settings.rate_value')}</label>
                  <input type="number" step="any" min="0" required value={rateForm.rate}
                    onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono" />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('settings.effective_date')}</label>
                  <input type="date" required value={rateForm.effectiveDate}
                    onChange={(e) => setRateForm({ ...rateForm, effectiveDate: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md" />
                </div>
                <div className="col-span-2 flex justify-end">
                  <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold">{t('settings.add_rate')}</button>
                </div>
              </form>
              <div className="max-h-64 overflow-y-auto border-t border-slate-200">
                <table className="w-full text-left text-xs">
                  <tbody className="divide-y divide-slate-100">
                    {rates.length > 0 ? rates.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 px-4 font-mono">{r.from_code} → {r.to_code}</td>
                        <td className="py-2 px-4 font-mono font-bold">{r.rate}</td>
                        <td className="py-2 px-4 text-slate-500">{r.effective_date}</td>
                      </tr>
                    )) : (
                      <tr><td className="py-4 px-4 text-center text-slate-400">{t('settings.no_rates_yet')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Conversion tester */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-fit">
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <h2 className="text-sm font-bold text-slate-800">{t('settings.conversion_tester')}</h2>
              </div>
              <form onSubmit={handleConvert} className="p-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('settings.amount_to_convert')}</label>
                  <input type="number" step="any" required value={convForm.amount}
                    onChange={(e) => setConvForm({ ...convForm, amount: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">{t('settings.from_currency')}</label>
                    <select required value={convForm.from} onChange={(e) => setConvForm({ ...convForm, from: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-md bg-white">
                      <option value="">—</option>
                      {currencies.filter((c) => c.active).map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">{t('settings.to_currency')}</label>
                    <select required value={convForm.to} onChange={(e) => setConvForm({ ...convForm, to: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-md bg-white">
                      <option value="">—</option>
                      {currencies.filter((c) => c.active).map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}
                    </select>
                  </div>
                </div>
                <div className="col-span-2 flex items-center justify-between">
                  <button type="submit" className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-md font-semibold">{t('settings.convert')}</button>
                  {convResult && (
                    <div className="text-sm font-bold font-mono text-emerald-700">
                      {convResult.amount} {convResult.from} → {convResult.converted} {convResult.to} @ {convResult.rate}
                    </div>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Period-end FX revaluation */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h2 className="text-sm font-bold text-slate-800">{t('settings.fx_revaluation')}</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">{t('settings.fx_revaluation_hint')}</p>
            </div>
            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
              <form onSubmit={handleRunRevaluation} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">{t('common.date')} *</label>
                    <input type="date" required value={revalForm.date}
                      onChange={(e) => setRevalForm({ ...revalForm, date: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">{t('common.notes')}</label>
                    <input type="text" value={revalForm.notes}
                      onChange={(e) => setRevalForm({ ...revalForm, notes: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-semibold">{t('settings.run_revaluation')}</button>
                </div>
              </form>
              <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-bold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">{t('common.date')}</th>
                      <th className="py-2 px-3 text-center">{t('settings.reval_docs')}</th>
                      <th className="py-2 px-3 text-right">{t('settings.reval_gain')}</th>
                      <th className="py-2 px-3 text-right">{t('settings.reval_loss')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {revaluations.length > 0 ? revaluations.map((r) => (
                      <tr key={r.id} title={r.revaluation_number}>
                        <td className="py-2 px-3 font-mono">{r.revaluation_date}</td>
                        <td className="py-2 px-3 text-center">{r.documents_count}</td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-700">{r.total_gain}</td>
                        <td className="py-2 px-3 text-right font-mono text-rose-600">{r.total_loss}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} className="py-4 px-3 text-center text-slate-400">{t('settings.no_revaluations')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Add currency modal */}
          {showCurrencyModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
                  <h3 className="font-bold text-sm">{t('settings.add_currency')}</h3>
                  <button onClick={() => setShowCurrencyModal(false)} className="text-slate-400 hover:text-white p-1 rounded"><X className="w-4 h-4" /></button>
                </div>
                <form onSubmit={handleAddCurrency} className="p-5 space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">{t('settings.currency_code')} *</label>
                      <input required pattern="[A-Za-z]{3}" value={currencyForm.code}
                        onChange={(e) => setCurrencyForm({ ...currencyForm, code: e.target.value.toUpperCase() })}
                        placeholder="EUR" className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono" />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">{t('settings.currency_symbol')}</label>
                      <input value={currencyForm.symbol}
                        onChange={(e) => setCurrencyForm({ ...currencyForm, symbol: e.target.value })}
                        placeholder="€" className="w-full px-3 py-1.5 border border-slate-300 rounded-md" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">{t('settings.currency_name')} *</label>
                    <input required value={currencyForm.name}
                      onChange={(e) => setCurrencyForm({ ...currencyForm, name: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">{t('settings.currency_decimals')}</label>
                    <input type="number" min="0" max="4" value={currencyForm.decimals}
                      onChange={(e) => setCurrencyForm({ ...currencyForm, decimals: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono" />
                  </div>
                  <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                    <button type="button" onClick={() => setShowCurrencyModal(false)}
                      className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 font-medium">{t('common.cancel')}</button>
                    <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold">{t('common.save')}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-bold text-slate-800">{t('settings.tab_audit')}</h2>
            <p className="text-[11px] text-slate-500">Immutable trace of transactions, logins, and data modifications</p>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">User</th>
                <th className="py-2.5 px-4">Module</th>
                <th className="py-2.5 px-4">Action</th>
                <th className="py-2.5 px-4">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">{log.timestamp}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-800">{log.user_name}</td>
                  <td className="py-2.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-700">
                      {log.module}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-semibold text-blue-600">{log.action}</td>
                  <td className="py-2.5 px-4 text-slate-700 max-w-md truncate">{log.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Backup & Restoration Tab */}
      {activeTab === 'backup' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          {/* Export Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Export Full System Backup</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{t('settings.backup_desc')}</p>
            </div>
            <button
              onClick={handleDownloadBackup}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-xs font-semibold shadow transition flex items-center justify-center space-x-2"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('settings.download_backup')}</span>
            </button>
          </div>

          {/* Restore Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">{t('settings.restore_backup')}</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{t('settings.restore_desc')}</p>
            </div>
            {!restoreDraft && (
              <div>
                <label className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg text-xs font-semibold shadow transition flex items-center justify-center space-x-2 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{t('settings.restore_choose_file')}</span>
                  <input type="file" accept=".json" onChange={handleRestoreUpload} className="hidden" />
                </label>
              </div>
            )}
            {restoreDraft && (
              <div className="space-y-3 border border-amber-300 bg-amber-50 rounded-lg p-3" role="group" aria-label={t('settings.restore_backup')}>
                <p className="text-xs font-semibold text-amber-900">{t('settings.restore_warning')}</p>
                <p className="text-[11px] text-amber-900">{t('settings.restore_file')}: {restoreDraft.fileName}</p>
                <p className="text-[11px] text-amber-900">{t('settings.restore_signout_notice')}</p>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-700">{t('settings.restore_password_label')}</span>
                  <input type="password" autoComplete="current-password" value={restorePassword}
                    onChange={(e) => setRestorePassword(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs" />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-700">{t('settings.restore_type_confirm')}</span>
                  <input type="text" value={restoreConfirm}
                    onChange={(e) => setRestoreConfirm(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs font-mono" />
                </label>
                <div className="flex space-x-2">
                  <button type="button" onClick={cancelRestore} disabled={restoreBusy}
                    className="flex-1 border border-slate-300 bg-white text-slate-700 py-2 rounded-lg text-xs font-semibold">
                    {t('settings.restore_cancel')}
                  </button>
                  <button type="button" onClick={submitRestore}
                    disabled={restoreBusy || restoreConfirm !== 'RESTORE' || !restorePassword}
                    className="flex-1 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-semibold">
                    {restoreBusy ? t('settings.restore_running') : t('settings.restore_confirm_button')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Company Modal */}
      {showNewCompanyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">Create New Company</h3>
              <button
                onClick={() => setShowNewCompanyModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCompany} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  value={newCompanyForm.name}
                  onChange={(e) => setNewCompanyForm({ ...newCompanyForm, name: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                  placeholder="e.g. Apex Enterprises Ltd"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Tax ID / TIN</label>
                <input
                  type="text"
                  value={newCompanyForm.tax_id}
                  onChange={(e) => setNewCompanyForm({ ...newCompanyForm, tax_id: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Currency Code</label>
                  <input
                    type="text"
                    value={newCompanyForm.currency_code}
                    onChange={(e) => setNewCompanyForm({ ...newCompanyForm, currency_code: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Currency Symbol</label>
                  <input
                    type="text"
                    value={newCompanyForm.currency_symbol}
                    onChange={(e) => setNewCompanyForm({ ...newCompanyForm, currency_symbol: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewCompanyModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition font-semibold"
                >
                  Create Company
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">Add New User</h3>
              <button
                onClick={() => setShowUserModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={userForm.full_name}
                  onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Password *</label>
                  <input
                    type="password"
                    required
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Role *</label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    <option value="admin">{t('settings.role_admin')}</option>
                    <option value="accountant">{t('settings.role_accountant')}</option>
                    <option value="sales">{t('settings.role_sales')}</option>
                    <option value="purchases">{t('settings.role_purchases')}</option>
                    <option value="inventory">{t('settings.role_inventory')}</option>
                    <option value="manager">{t('settings.role_manager')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Email</label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition font-semibold"
                >
                  Add User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tax Modal */}
      {showTaxModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">Add Tax Rate</h3>
              <button
                onClick={() => setShowTaxModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTax} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Code *</label>
                <input
                  type="text"
                  required
                  value={taxForm.code}
                  onChange={(e) => setTaxForm({ ...taxForm, code: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  placeholder="VAT18, RED10"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Tax Description *</label>
                <input
                  type="text"
                  required
                  value={taxForm.name}
                  onChange={(e) => setTaxForm({ ...taxForm, name: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Standard VAT 18%"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Tax Rate (%) *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={taxForm.rate}
                  onChange={(e) => setTaxForm({ ...taxForm, rate: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-bold"
                />
              </div>

              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowTaxModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition font-semibold"
                >
                  Add Rate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
