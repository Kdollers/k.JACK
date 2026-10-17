import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../services/api';
import StatementModal from '../components/StatementModal';
import {
  Building,
  Plus,
  Search,
  FileText,
  DollarSign,
  Edit2,
  Phone,
  Mail,
  X
} from 'lucide-react';

export default function SuppliersView() {
  const { currentCompany, formatCurrency, showToast, refreshKey } = useApp();
  const { t } = useI18n();

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('list'); // 'list' or 'aging'
  const [agingData, setAgingData] = useState(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [statementSupplier, setStatementSupplier] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    tax_id: '',
    payment_terms: 'NET_30'
  });

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`/api/suppliers?search=${encodeURIComponent(search)}`);
      setSuppliers(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchAging = async () => {
    try {
      const data = await apiRequest('/api/reports/ap-aging');
      setAgingData(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSuppliers();
    if (activeTab === 'aging') fetchAging();
  }, [currentCompany?.id, search, activeTab, refreshKey]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        await apiRequest(`/api/suppliers/${editingSupplier.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        showToast('Supplier updated successfully', 'success');
      } else {
        await apiRequest('/api/suppliers', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        showToast('Supplier created successfully', 'success');
      }
      setShowAddModal(false);
      setEditingSupplier(null);
      resetForm();
      fetchSuppliers();
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
      payment_terms: 'NET_30'
    });
  };

  const openEdit = (supp) => {
    setEditingSupplier(supp);
    setFormData({
      code: supp.code,
      name: supp.name,
      contact_person: supp.contact_person || '',
      email: supp.email || '',
      phone: supp.phone || '',
      address: supp.address || '',
      tax_id: supp.tax_id || '',
      payment_terms: supp.payment_terms || 'NET_30'
    });
    setShowAddModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t('suppliers.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('suppliers.subtitle')}</p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium mr-2">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'list' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Suppliers
            </button>
            <button
              onClick={() => setActiveTab('aging')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'aging' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('suppliers.aging_title')}
            </button>
          </div>

          <button
            onClick={() => {
              resetForm();
              setEditingSupplier(null);
              setShowAddModal(true);
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('suppliers.add_supplier')}</span>
          </button>
        </div>
      </div>

      {activeTab === 'list' ? (
        /* Suppliers List */
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
            <div className="text-xs text-slate-500 font-medium">{suppliers.length} records</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('suppliers.supplier_code')}</th>
                  <th className="py-2.5 px-4">{t('suppliers.supplier_name')}</th>
                  <th className="py-2.5 px-4">{t('common.contact_person')}</th>
                  <th className="py-2.5 px-4">Contact Info</th>
                  <th className="py-2.5 px-4">{t('customers.payment_terms')}</th>
                  <th className="py-2.5 px-4 text-right">Current Payable Balance</th>
                  <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : suppliers.length > 0 ? (
                  suppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-semibold text-blue-600">{s.code}</td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        <div>{s.name}</div>
                        {s.tax_id && <div className="text-[10px] text-slate-400 font-mono">TIN: {s.tax_id}</div>}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{s.contact_person || '-'}</td>
                      <td className="py-3 px-4 text-slate-600 text-[11px] space-y-0.5">
                        {s.phone && (
                          <div className="flex items-center space-x-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{s.phone}</span>
                          </div>
                        )}
                        {s.email && (
                          <div className="flex items-center space-x-1">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span className="truncate max-w-[120px]">{s.email}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {s.payment_terms}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        <span className={s.current_balance > 0 ? 'text-rose-600' : 'text-slate-700'}>
                          {formatCurrency(s.current_balance)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => setStatementSupplier(s)}
                            title={t('suppliers.statement_title')}
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEdit(s)}
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
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      {t('common.no_data')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* A/P Aging View */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">{t('suppliers.aging_title')}</h2>
              <p className="text-[11px] text-slate-500">Aging analysis of supplier accounts payable</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500">Total Outstanding A/P: </span>
              <span className="text-base font-bold font-mono text-indigo-700">
                {formatCurrency(agingData?.totalAp || 0)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Supplier</th>
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
                    <tr key={row.supplierId} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {row.supplierName} ({row.supplierCode})
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
                      No outstanding payables found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {editingSupplier ? t('common.edit') : t('suppliers.add_supplier')}
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
                    {t('suppliers.supplier_name')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. Global Tech Distributors"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    {t('suppliers.supplier_code')}
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
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.contact_person')}</label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.tax_id')}</label>
                  <input
                    type="text"
                    value={formData.tax_id}
                    onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('customers.payment_terms')}</label>
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
      {statementSupplier && (
        <StatementModal
          entityId={statementSupplier.id}
          entityType="SUPPLIER"
          onClose={() => setStatementSupplier(null)}
        />
      )}
    </div>
  );
}
