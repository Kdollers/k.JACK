import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../services/api';
import StatementModal from '../components/StatementModal';
import {
  Users,
  Plus,
  Search,
  FileText,
  DollarSign,
  Edit2,
  Phone,
  Mail,
  MapPin,
  Check,
  X,
  CreditCard
} from 'lucide-react';

export default function CustomersView() {
  const { currentCompany, formatCurrency, showToast, refreshKey, setActiveView } = useApp();
  const { t } = useI18n();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('list'); // 'list' or 'aging'
  const [agingData, setAgingData] = useState(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [statementCustomer, setStatementCustomer] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    tax_id: '',
    credit_limit: 10000,
    payment_terms: 'NET_30'
  });

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`/api/customers?search=${encodeURIComponent(search)}`);
      setCustomers(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchAging = async () => {
    try {
      const data = await apiRequest('/api/reports/ar-aging');
      setAgingData(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCustomers();
    if (activeTab === 'aging') fetchAging();
  }, [currentCompany?.id, search, activeTab, refreshKey]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await apiRequest(`/api/customers/${editingCustomer.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        showToast('Customer updated successfully', 'success');
      } else {
        await apiRequest('/api/customers', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        showToast('Customer created successfully', 'success');
      }
      setShowAddModal(false);
      setEditingCustomer(null);
      resetForm();
      fetchCustomers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      contact_person: '',
      email: '',
      phone: '',
      address: '',
      tax_id: '',
      credit_limit: 10000,
      payment_terms: 'NET_30'
    });
  };

  const openEdit = (cust) => {
    setEditingCustomer(cust);
    setFormData({
      code: cust.code,
      name: cust.name,
      contact_person: cust.contact_person || '',
      email: cust.email || '',
      phone: cust.phone || '',
      address: cust.address || '',
      tax_id: cust.tax_id || '',
      credit_limit: cust.credit_limit || 0,
      payment_terms: cust.payment_terms || 'NET_30'
    });
    setShowAddModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t('customers.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('customers.subtitle')}</p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium mr-2">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'list' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Customers
            </button>
            <button
              onClick={() => setActiveTab('aging')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'aging' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('customers.aging_title')}
            </button>
          </div>

          <button
            onClick={() => {
              resetForm();
              setEditingCustomer(null);
              setShowAddModal(true);
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('customers.add_customer')}</span>
          </button>
        </div>
      </div>

      {activeTab === 'list' ? (
        /* Customers List */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Search bar */}
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
            <div className="text-xs text-slate-500 font-medium">{customers.length} records</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('customers.customer_code')}</th>
                  <th className="py-2.5 px-4">{t('customers.customer_name')}</th>
                  <th className="py-2.5 px-4">{t('common.contact_person')}</th>
                  <th className="py-2.5 px-4">Contact Info</th>
                  <th className="py-2.5 px-4">{t('customers.payment_terms')}</th>
                  <th className="py-2.5 px-4 text-right">{t('customers.credit_limit')}</th>
                  <th className="py-2.5 px-4 text-right">{t('customers.current_balance')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : customers.length > 0 ? (
                  customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-semibold text-blue-600">{c.code}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        <div>{c.name}</div>
                        {c.tax_id && <div className="text-[10px] text-slate-400 font-mono">TIN: {c.tax_id}</div>}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{c.contact_person || '-'}</td>
                      <td className="py-3 px-4 text-slate-600 text-[11px] space-y-0.5">
                        {c.phone && (
                          <div className="flex items-center space-x-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{c.phone}</span>
                          </div>
                        )}
                        {c.email && (
                          <div className="flex items-center space-x-1">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span className="truncate max-w-[120px]">{c.email}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {c.payment_terms}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {formatCurrency(c.credit_limit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        <span className={c.current_balance > 0 ? 'text-rose-600' : 'text-slate-700'}>
                          {formatCurrency(c.current_balance)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => setStatementCustomer(c)}
                            title={t('customers.view_statement')}
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEdit(c)}
                            title={t('common.edit')}
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      {t('common.no_data')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* A/R Aging View */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">{t('customers.aging_title')}</h2>
              <p className="text-[11px] text-slate-500">Aging analysis of outstanding customer receivables</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500">Total Outstanding A/R: </span>
              <span className="text-base font-bold font-mono text-blue-700">
                {formatCurrency(agingData?.totalAr || 0)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3 text-right">Current (Not Due)</th>
                  <th className="py-2.5 px-3 text-right">1-30 Days</th>
                  <th className="py-2.5 px-3 text-right">31-60 Days</th>
                  <th className="py-2.5 px-3 text-right">61-90 Days</th>
                  <th className="py-2.5 px-3 text-right">&gt; 90 Days</th>
                  <th className="py-2.5 px-3 text-right font-bold">Total Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agingData?.rows && agingData.rows.length > 0 ? (
                  agingData.rows.map((row) => (
                    <tr key={row.customerId} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {row.customerName} ({row.customerCode})
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">{formatCurrency(row.current)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{formatCurrency(row.days30)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-600">{formatCurrency(row.days60)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700 font-medium">
                        {formatCurrency(row.days90)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-600 font-bold">
                        {formatCurrency(row.daysOver90)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                        {formatCurrency(row.totalDue)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No outstanding receivables found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer Create/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {editingCustomer ? t('common.edit') : t('customers.add_customer')}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    {t('customers.customer_name')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. Acme Corporation"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    {t('customers.customer_code')}
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Auto-generated if empty"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    {t('common.contact_person')}
                  </label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    {t('common.tax_id')}
                  </label>
                  <input
                    type="text"
                    value={formData.tax_id}
                    onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="TIN number"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.phone')}</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.email')}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('common.address')}</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Street, City, Country"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    {t('customers.credit_limit')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.credit_limit}
                    onChange={(e) => setFormData({ ...formData, credit_limit: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    {t('customers.payment_terms')}
                  </label>
                  <select
                    value={formData.payment_terms}
                    onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="IMMEDIATE">{t('customers.immediate')}</option>
                    <option value="NET_15">{t('customers.net_15')}</option>
                    <option value="NET_30">{t('customers.net_30')}</option>
                    <option value="NET_60">{t('customers.net_60')}</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
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

      {/* Statement Modal */}
      {statementCustomer && (
        <StatementModal
          entityId={statementCustomer.id}
          entityType="CUSTOMER"
          onClose={() => setStatementCustomer(null)}
        />
      )}
    </div>
  );
}
