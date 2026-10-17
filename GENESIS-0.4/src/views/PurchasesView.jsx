import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../services/api';
import InvoicePrintModal from '../components/InvoicePrintModal';
import {
  ShoppingBag,
  Plus,
  Search,
  Printer,
  Trash2,
  X,
  CreditCard,
  ArrowRight
} from 'lucide-react';

export default function PurchasesView() {
  const { currentCompany, formatCurrency, formatDate, showToast, refreshKey } = useApp();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState('bills'); // 'bills', 'orders', 'returns'
  const [bills, setBills] = useState([]);
  const [orders, setOrders] = useState([]);
  const [returns, setReturns] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [showNewBillModal, setShowNewBillModal] = useState(false);
  const [printBillData, setPrintBillData] = useState(null);

  // Bill Form State
  const [billForm, setBillForm] = useState({
    supplier_id: '',
    vendor_invoice_number: '',
    date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    notes: 'Received in good order and verified against delivery note.',
    autoPost: true,
    lines: [
      {
        product_id: '',
        description: '',
        quantity: 1,
        unit_cost: 0,
        tax_rate: 18
      }
    ]
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [billsData, suppData, prodData] = await Promise.all([
        apiRequest('/api/purchases/bills'),
        apiRequest('/api/suppliers'),
        apiRequest('/api/products')
      ]);
      setBills(billsData);
      setSuppliers(suppData);
      setProducts(prodData);

      if (activeTab === 'orders') {
        const oData = await apiRequest('/api/purchases/orders');
        setOrders(oData);
      } else if (activeTab === 'returns') {
        const rData = await apiRequest('/api/purchases/returns');
        setReturns(rData);
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

  const handleProductSelect = (idx, prodId) => {
    const prod = products.find((p) => p.id === prodId);
    if (!prod) return;
    const lines = [...billForm.lines];
    lines[idx] = {
      ...lines[idx],
      product_id: prod.id,
      description: prod.name,
      unit_cost: prod.cost_price || 0,
      tax_rate: 18
    };
    setBillForm({ ...billForm, lines });
  };

  const updateLine = (idx, field, value) => {
    const lines = [...billForm.lines];
    lines[idx][field] = value;
    setBillForm({ ...billForm, lines });
  };

  const addLine = () => {
    setBillForm({
      ...billForm,
      lines: [...billForm.lines, { product_id: '', description: '', quantity: 1, unit_cost: 0, tax_rate: 18 }]
    });
  };

  const removeLine = (idx) => {
    if (billForm.lines.length <= 1) return;
    const lines = billForm.lines.filter((_, i) => i !== idx);
    setBillForm({ ...billForm, lines });
  };

  const calcTotals = (lines) => {
    let sub = 0;
    let tax = 0;
    for (const l of lines) {
      const q = Number(l.quantity) || 0;
      const c = Number(l.unit_cost) || 0;
      const tRate = Number(l.tax_rate) || 0;

      const lineSub = q * c;
      const lineTax = lineSub * (tRate / 100);
      sub += lineSub;
      tax += lineTax;
    }
    return { subtotal: sub, taxTotal: tax, total: sub + tax };
  };

  const billTotals = calcTotals(billForm.lines);

  const handleCreateBill = async (e) => {
    e.preventDefault();
    if (!billForm.supplier_id) return showToast('Please select a supplier', 'error');

    try {
      const res = await apiRequest('/api/purchases/bills', {
        method: 'POST',
        body: JSON.stringify(billForm)
      });
      showToast(`Purchase bill ${res.billNumber} posted, stock increased, and AP credited!`, 'success');
      setShowNewBillModal(false);
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handlePostDraft = async (billId) => {
    try {
      const res = await apiRequest(`/api/purchases/bills/${billId}/post`, { method: 'POST' });
      showToast(`Bill ${res.billNumber} posted to General Ledger and stock updated!`, 'success');
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handlePrint = async (billId) => {
    try {
      const b = await apiRequest(`/api/purchases/bills/${billId}`);
      setPrintBillData(b);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t('purchases.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('purchases.subtitle')}</p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setActiveTab('bills')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'bills' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('purchases.tab_bills')}
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'orders' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('purchases.tab_orders')}
            </button>
            <button
              onClick={() => setActiveTab('returns')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'returns' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('purchases.tab_returns')}
            </button>
          </div>

          {activeTab === 'bills' && (
            <button
              onClick={() => setShowNewBillModal(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('purchases.new_bill')}</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. Bills Tab */}
      {activeTab === 'bills' && (
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
            <div className="text-xs text-slate-500 font-medium">{bills.length} bills</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('purchases.bill_number')}</th>
                  <th className="py-2.5 px-4">{t('common.date')}</th>
                  <th className="py-2.5 px-4">{t('purchases.supplier')}</th>
                  <th className="py-2.5 px-4">Vendor Ref</th>
                  <th className="py-2.5 px-4 text-right">{t('common.subtotal')}</th>
                  <th className="py-2.5 px-4 text-right">{t('common.tax')}</th>
                  <th className="py-2.5 px-4 text-right">{t('common.total')}</th>
                  <th className="py-2.5 px-4 text-right">{t('common.balance_due')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : bills.length > 0 ? (
                  bills.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-600">{b.bill_number}</td>
                      <td className="py-3 px-4 text-slate-600">{formatDate(b.date)}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{b.supplier_name}</td>
                      <td className="py-3 px-4 font-mono text-slate-500">{b.vendor_invoice_number || '-'}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {formatCurrency(b.subtotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {formatCurrency(b.tax_total)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(b.total)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                        {formatCurrency(b.balance_due)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            b.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : b.status === 'POSTED'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          {b.status === 'DRAFT' && (
                            <button
                              onClick={() => handlePostDraft(b.id)}
                              className="px-2 py-1 rounded text-[10px] font-bold bg-blue-600 text-white hover:bg-blue-500 transition"
                            >
                              Post
                            </button>
                          )}
                          <button
                            onClick={() => handlePrint(b.id)}
                            title={t('common.print')}
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      {t('common.no_data')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Purchase Orders Tab */}
      {activeTab === 'orders' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
          <h2 className="text-sm font-bold text-slate-800 mb-1">{t('purchases.tab_orders')}</h2>
          <p className="text-[11px] text-slate-500 mb-4">Official purchase orders issued to suppliers</p>
          <div className="text-center py-10 text-slate-400 text-xs">{t('common.no_data')}</div>
        </div>
      )}

      {/* 3. Returns Tab */}
      {activeTab === 'returns' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
          <h2 className="text-sm font-bold text-slate-800 mb-1">{t('purchases.tab_returns')}</h2>
          <p className="text-[11px] text-slate-500 mb-4">Defective stock returned to vendors with debit to AP</p>
          <div className="text-center py-10 text-slate-400 text-xs">{t('common.no_data')}</div>
        </div>
      )}

      {/* New Purchase Bill Modal */}
      {showNewBillModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full my-8 overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <ShoppingBag className="w-4 h-4 text-indigo-400" />
                <span>{t('purchases.new_bill')}</span>
              </h3>
              <button
                onClick={() => setShowNewBillModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBill} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('purchases.supplier')} *</label>
                  <select
                    required
                    value={billForm.supplier_id}
                    onChange={(e) => setBillForm({ ...billForm, supplier_id: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    <option value="">-- Choose Supplier --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    {t('purchases.vendor_invoice_num')}
                  </label>
                  <input
                    type="text"
                    value={billForm.vendor_invoice_number}
                    onChange={(e) => setBillForm({ ...billForm, vendor_invoice_number: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="e.g. VEND-INV-9988"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.date')} *</label>
                  <input
                    type="date"
                    required
                    value={billForm.date}
                    onChange={(e) => setBillForm({ ...billForm, date: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.due_date')} *</label>
                  <input
                    type="date"
                    required
                    value={billForm.due_date}
                    onChange={(e) => setBillForm({ ...billForm, due_date: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-bold text-slate-700">Purchased Items / Stock</h4>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-blue-600 hover:text-blue-700 font-semibold text-xs flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('sales.add_line')}</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 w-5/12">Item / Service</th>
                        <th className="py-2 px-3 text-right w-24">{t('common.quantity')}</th>
                        <th className="py-2 px-3 text-right w-32">{t('common.unit_cost')}</th>
                        <th className="py-2 px-3 text-right w-20">Tax %</th>
                        <th className="py-2 px-3 text-right w-32">{t('common.amount')}</th>
                        <th className="py-2 px-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {billForm.lines.map((line, idx) => {
                        const lineSub = (line.quantity || 0) * (line.unit_cost || 0);
                        const lineTax = lineSub * ((line.tax_rate || 0) / 100);
                        const lineTot = lineSub + lineTax;

                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2 px-3">
                              <select
                                value={line.product_id}
                                onChange={(e) => handleProductSelect(idx, e.target.value)}
                                className="w-full px-2 py-1 border border-slate-300 rounded mb-1 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                              >
                                <option value="">-- Choose Stock Product or Custom --</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.sku})
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                placeholder="Description"
                                value={line.description}
                                onChange={(e) => updateLine(idx, 'description', e.target.value)}
                                className="w-full px-2 py-1 border border-slate-200 rounded text-[11px]"
                              />
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                required
                                value={line.quantity}
                                onChange={(e) => updateLine(idx, 'quantity', Number(e.target.value))}
                                className="w-full px-2 py-1 text-right border border-slate-300 rounded font-mono font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                step="0.01"
                                required
                                value={line.unit_cost}
                                onChange={(e) => updateLine(idx, 'unit_cost', Number(e.target.value))}
                                className="w-full px-2 py-1 text-right border border-slate-300 rounded font-mono font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-2 px-3 text-right">
                              <select
                                value={line.tax_rate}
                                onChange={(e) => updateLine(idx, 'tax_rate', Number(e.target.value))}
                                className="w-full px-1 py-1 text-right border border-slate-300 rounded font-mono text-[11px]"
                              >
                                <option value="18">18%</option>
                                <option value="10">10%</option>
                                <option value="0">0%</option>
                              </select>
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                              {formatCurrency(lineTot)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeLine(idx)}
                                className="text-slate-400 hover:text-rose-600 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.notes')}</label>
                  <textarea
                    rows={3}
                    value={billForm.notes}
                    onChange={(e) => setBillForm({ ...billForm, notes: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="mt-2 flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="billAutoPost"
                      checked={billForm.autoPost}
                      onChange={(e) => setBillForm({ ...billForm, autoPost: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <label htmlFor="billAutoPost" className="text-slate-700 font-medium">
                      Post bill immediately (updates weighted-average cost & stock)
                    </label>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>{t('common.subtotal')}:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {formatCurrency(billTotals.subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>VAT Input (Deductible Tax):</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {formatCurrency(billTotals.taxTotal)}
                    </span>
                  </div>
                  <div className="border-t border-slate-300 pt-2 flex justify-between text-base font-extrabold text-slate-900">
                    <span>{t('common.total')}:</span>
                    <span className="font-mono text-indigo-700">{formatCurrency(billTotals.total)}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewBillModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-semibold transition shadow"
                >
                  {billForm.autoPost ? t('purchases.post_bill') : 'Save as Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bill Print Modal */}
      {printBillData && (
        <InvoicePrintModal
          invoice={printBillData}
          type="BILL"
          onClose={() => setPrintBillData(null)}
        />
      )}
    </div>
  );
}
