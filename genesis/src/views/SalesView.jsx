import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../services/api';
import InvoicePrintModal from '../components/InvoicePrintModal';
import {
  ShoppingCart,
  Plus,
  Search,
  Printer,
  CheckCircle,
  FileText,
  Trash2,
  X,
  CreditCard,
  RotateCcw,
  ArrowRight
} from 'lucide-react';

export default function SalesView() {
  const { currentCompany, formatCurrency, formatDate, showToast, refreshKey, setActiveView } = useApp();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState('invoices'); // 'invoices', 'quotes', 'orders', 'credit_notes'
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [creditNotes, setCreditNotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [showNewInvoiceModal, setShowNewInvoiceModal] = useState(false);
  const [showNewQuoteModal, setShowNewQuoteModal] = useState(false);
  const [showNewCreditNoteModal, setShowNewCreditNoteModal] = useState(false);
  const [printInvoiceData, setPrintInvoiceData] = useState(null);

  // Invoice Form State
  const [invoiceForm, setInvoiceForm] = useState({
    customer_id: '',
    date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    notes: 'Thank you for your business. Payment terms as agreed.',
    autoPost: true,
    lines: [
      {
        product_id: '',
        description: '',
        quantity: 1,
        unit_price: 0,
        discount_percent: 0,
        tax_rate: 18
      }
    ]
  });

  // Credit Note Form State
  const [creditNoteForm, setCreditNoteForm] = useState({
    customerId: '',
    reason: 'Customer return / Defective item',
    restockItems: 1,
    notes: '',
    lines: [
      {
        productId: '',
        description: '',
        quantity: 1,
        unitPrice: 0,
        taxRate: 18
      }
    ]
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invData, custData, prodData, taxData] = await Promise.all([
        apiRequest('/api/sales/invoices'),
        apiRequest('/api/customers'),
        apiRequest('/api/products'),
        apiRequest('/api/taxes')
      ]);
      setInvoices(invData);
      setCustomers(custData);
      setProducts(prodData);
      setTaxes(taxData);

      if (activeTab === 'quotes') {
        const qData = await apiRequest('/api/sales/quotes');
        setQuotes(qData);
      } else if (activeTab === 'credit_notes') {
        const cnData = await apiRequest('/api/sales/credit-notes');
        setCreditNotes(cnData);
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

  // Invoice Line item helpers
  const handleProductSelect = (idx, prodId) => {
    const prod = products.find((p) => p.id === prodId);
    if (!prod) return;
    const lines = [...invoiceForm.lines];
    lines[idx] = {
      ...lines[idx],
      product_id: prod.id,
      description: prod.name,
      unit_price: prod.selling_price || 0,
      tax_rate: 18
    };
    setInvoiceForm({ ...invoiceForm, lines });
  };

  const updateLine = (idx, field, value) => {
    const lines = [...invoiceForm.lines];
    lines[idx][field] = value;
    setInvoiceForm({ ...invoiceForm, lines });
  };

  const addLine = () => {
    setInvoiceForm({
      ...invoiceForm,
      lines: [
        ...invoiceForm.lines,
        { product_id: '', description: '', quantity: 1, unit_price: 0, discount_percent: 0, tax_rate: 18 }
      ]
    });
  };

  const removeLine = (idx) => {
    if (invoiceForm.lines.length <= 1) return;
    const lines = invoiceForm.lines.filter((_, i) => i !== idx);
    setInvoiceForm({ ...invoiceForm, lines });
  };

  // Calculations for preview
  const calcTotals = (lines) => {
    let sub = 0;
    let tax = 0;
    let disc = 0;
    for (const l of lines) {
      const q = Number(l.quantity) || 0;
      const p = Number(l.unit_price || l.unitPrice) || 0;
      const d = Number(l.discount_percent || l.discountPercent) || 0;
      const tRate = Number(l.tax_rate || l.taxRate) || 0;

      const lineSub = q * p * (1 - d / 100);
      const lineTax = lineSub * (tRate / 100);
      sub += lineSub;
      tax += lineTax;
      disc += q * p * (d / 100);
    }
    return { subtotal: sub, taxTotal: tax, discountTotal: disc, total: sub + tax };
  };

  const invTotals = calcTotals(invoiceForm.lines);

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    if (!invoiceForm.customer_id) return showToast('Please select a customer', 'error');

    try {
      const res = await apiRequest('/api/sales/invoices', {
        method: 'POST',
        body: JSON.stringify(invoiceForm)
      });
      showToast(`Invoice ${res.invoiceNumber} created and posted to ledger!`, 'success');
      setShowNewInvoiceModal(false);
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handlePostDraft = async (invId) => {
    try {
      const res = await apiRequest(`/api/sales/invoices/${invId}/post`, { method: 'POST' });
      showToast(`Invoice ${res.invoiceNumber} posted to General Ledger and stock updated!`, 'success');
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handlePrint = async (invId) => {
    try {
      const inv = await apiRequest(`/api/sales/invoices/${invId}`);
      setPrintInvoiceData(inv);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleConvertQuote = async (quoteId) => {
    try {
      const res = await apiRequest(`/api/sales/quotes/${quoteId}/convert-to-invoice`, { method: 'POST' });
      showToast(`Quote converted to Invoice ${res.invoiceNumber}!`, 'success');
      setActiveTab('invoices');
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCreateCreditNote = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/api/sales/credit-notes', {
        method: 'POST',
        body: JSON.stringify(creditNoteForm)
      });
      showToast(`Credit note ${res.creditNoteNumber} posted and customer credited!`, 'success');
      setShowNewCreditNoteModal(false);
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
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t('sales.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('sales.subtitle')}</p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'invoices' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('sales.tab_invoices')}
            </button>
            <button
              onClick={() => setActiveTab('quotes')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'quotes' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('sales.tab_quotes')}
            </button>
            <button
              onClick={() => setActiveTab('credit_notes')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'credit_notes' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('sales.tab_credit_notes')}
            </button>
          </div>

          {activeTab === 'invoices' && (
            <button
              onClick={() => setShowNewInvoiceModal(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('sales.new_invoice')}</span>
            </button>
          )}

          {activeTab === 'credit_notes' && (
            <button
              onClick={() => setShowNewCreditNoteModal(true)}
              className="bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('sales.new_credit_note')}</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. Invoices Tab */}
      {activeTab === 'invoices' && (
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
            <div className="text-xs text-slate-500 font-medium">{invoices.length} invoices</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('sales.invoice_number')}</th>
                  <th className="py-2.5 px-4">{t('common.date')}</th>
                  <th className="py-2.5 px-4">{t('common.due_date')}</th>
                  <th className="py-2.5 px-4">{t('sales.customer')}</th>
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
                ) : invoices.length > 0 ? (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">{inv.invoice_number}</td>
                      <td className="py-3 px-4 text-slate-600">{formatDate(inv.date)}</td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(inv.due_date)}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{inv.customer_name}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {formatCurrency(inv.subtotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {formatCurrency(inv.tax_total)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(inv.total)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                        {formatCurrency(inv.balance_due)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            inv.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : inv.status === 'POSTED'
                              ? 'bg-blue-100 text-blue-800'
                              : inv.status === 'DRAFT'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          {inv.status === 'DRAFT' && (
                            <button
                              onClick={() => handlePostDraft(inv.id)}
                              title="Post to General Ledger"
                              className="px-2 py-1 rounded text-[10px] font-bold bg-blue-600 text-white hover:bg-blue-500 transition"
                            >
                              Post
                            </button>
                          )}
                          <button
                            onClick={() => handlePrint(inv.id)}
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

      {/* 2. Quotes Tab */}
      {activeTab === 'quotes' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-bold text-slate-800">{t('sales.tab_quotes')}</h2>
            <p className="text-[11px] text-slate-500">Estimates and quotations for potential customer sales</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('sales.quote_number')}</th>
                  <th className="py-2.5 px-4">{t('common.date')}</th>
                  <th className="py-2.5 px-4">Valid Until</th>
                  <th className="py-2.5 px-4">{t('sales.customer')}</th>
                  <th className="py-2.5 px-4 text-right">{t('common.total')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotes && quotes.length > 0 ? (
                  quotes.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">{q.quote_number}</td>
                      <td className="py-3 px-4 text-slate-600">{formatDate(q.date)}</td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(q.valid_until)}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{q.customer_name}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(q.total)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                          {q.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {q.status !== 'CONVERTED' && (
                          <button
                            onClick={() => handleConvertQuote(q.id)}
                            className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded text-[10px] font-bold hover:bg-blue-100 transition inline-flex items-center space-x-1"
                          >
                            <span>Convert to Invoice</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
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
      )}

      {/* 3. Credit Notes Tab */}
      {activeTab === 'credit_notes' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-bold text-slate-800">{t('sales.tab_credit_notes')}</h2>
            <p className="text-[11px] text-slate-500">
              Customer returns, refunds, and price adjustments credited against Accounts Receivable
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('sales.credit_note_number')}</th>
                  <th className="py-2.5 px-4">{t('common.date')}</th>
                  <th className="py-2.5 px-4">{t('sales.customer')}</th>
                  <th className="py-2.5 px-4">Reason</th>
                  <th className="py-2.5 px-4 text-right">Credit Total</th>
                  <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {creditNotes && creditNotes.length > 0 ? (
                  creditNotes.map((cn) => (
                    <tr key={cn.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-rose-600">{cn.credit_note_number}</td>
                      <td className="py-3 px-4 text-slate-600">{formatDate(cn.date)}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{cn.customer_name}</td>
                      <td className="py-3 px-4 text-slate-600">{cn.reason}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                        -{formatCurrency(cn.total)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-50 text-rose-700 border border-rose-200">
                          {cn.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      {t('common.no_data')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Invoice Modal */}
      {showNewInvoiceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full my-8 overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <ShoppingCart className="w-4 h-4 text-blue-400" />
                <span>{t('sales.new_invoice')}</span>
              </h3>
              <button
                onClick={() => setShowNewInvoiceModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="p-6 space-y-4 text-xs">
              {/* Customer & Dates Header */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('sales.customer')} *</label>
                  <select
                    required
                    value={invoiceForm.customer_id}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, customer_id: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    <option value="">-- Choose Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.date')} *</label>
                  <input
                    type="date"
                    required
                    value={invoiceForm.date}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, date: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.due_date')} *</label>
                  <input
                    type="date"
                    required
                    value={invoiceForm.due_date}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Line Items Table */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-bold text-slate-700">{t('sales.line_items')}</h4>
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
                        <th className="py-2 px-3 w-5/12">{t('sales.product')} / Description</th>
                        <th className="py-2 px-3 text-right w-20">{t('common.quantity')}</th>
                        <th className="py-2 px-3 text-right w-28">{t('common.unit_price')}</th>
                        <th className="py-2 px-3 text-right w-20">Disc %</th>
                        <th className="py-2 px-3 text-right w-20">Tax %</th>
                        <th className="py-2 px-3 text-right w-28">{t('common.amount')}</th>
                        <th className="py-2 px-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoiceForm.lines.map((line, idx) => {
                        const lineSub = (line.quantity || 0) * (line.unit_price || 0) * (1 - (line.discount_percent || 0) / 100);
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
                                <option value="">-- Custom Item or Choose Product --</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.sku}) — {formatCurrency(p.selling_price)}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                placeholder="Description"
                                value={line.description}
                                onChange={(e) => updateLine(idx, 'description', e.target.value)}
                                className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                                value={line.unit_price}
                                onChange={(e) => updateLine(idx, 'unit_price', Number(e.target.value))}
                                className="w-full px-2 py-1 text-right border border-slate-300 rounded font-mono font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={line.discount_percent}
                                onChange={(e) => updateLine(idx, 'discount_percent', Number(e.target.value))}
                                className="w-full px-2 py-1 text-right border border-slate-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
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

              {/* Totals & Notes Split */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.notes')}</label>
                  <textarea
                    rows={3}
                    value={invoiceForm.notes}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="mt-2 flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="autoPost"
                      checked={invoiceForm.autoPost}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, autoPost: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <label htmlFor="autoPost" className="text-slate-700 font-medium">
                      Post immediately to General Ledger & deduct warehouse inventory
                    </label>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>{t('common.subtotal')}:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {formatCurrency(invTotals.subtotal)}
                    </span>
                  </div>
                  {invTotals.discountTotal > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>{t('common.discount')}:</span>
                      <span className="font-mono font-semibold text-rose-600">
                        -{formatCurrency(invTotals.discountTotal)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>{t('common.tax')} (VAT):</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {formatCurrency(invTotals.taxTotal)}
                    </span>
                  </div>
                  <div className="border-t border-slate-300 pt-2 flex justify-between text-base font-extrabold text-blue-700">
                    <span>{t('common.total')}:</span>
                    <span className="font-mono">{formatCurrency(invTotals.total)}</span>
                  </div>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="border-t border-slate-200 pt-4 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewInvoiceModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold transition shadow"
                >
                  {invoiceForm.autoPost ? t('sales.post_invoice') : 'Save as Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Credit Note Modal */}
      {showNewCreditNoteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-rose-950 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">{t('sales.new_credit_note')}</h3>
              <button
                onClick={() => setShowNewCreditNoteModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCreditNote} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('sales.customer')} *</label>
                <select
                  required
                  value={creditNoteForm.customerId}
                  onChange={(e) => setCreditNoteForm({ ...creditNoteForm, customerId: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Choose Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Reason for Credit / Return *</label>
                <input
                  type="text"
                  required
                  value={creditNoteForm.reason}
                  onChange={(e) => setCreditNoteForm({ ...creditNoteForm, reason: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Returned Product (Optional)</label>
                <select
                  value={creditNoteForm.lines[0]?.productId || ''}
                  onChange={(e) => {
                    const prod = products.find((p) => p.id === e.target.value);
                    setCreditNoteForm({
                      ...creditNoteForm,
                      lines: [
                        {
                          productId: prod?.id || '',
                          description: prod?.name || 'Returned Goods',
                          quantity: 1,
                          unitPrice: prod?.selling_price || 0,
                          taxRate: 18
                        }
                      ]
                    });
                  }}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Select Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('common.quantity')}</label>
                  <input
                    type="number"
                    min="1"
                    value={creditNoteForm.lines[0]?.quantity || 1}
                    onChange={(e) => {
                      const lines = [...creditNoteForm.lines];
                      lines[0].quantity = Number(e.target.value);
                      setCreditNoteForm({ ...creditNoteForm, lines });
                    }}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Credit Unit Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={creditNoteForm.lines[0]?.unitPrice || 0}
                    onChange={(e) => {
                      const lines = [...creditNoteForm.lines];
                      lines[0].unitPrice = Number(e.target.value);
                      setCreditNoteForm({ ...creditNoteForm, lines });
                    }}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="restock"
                  checked={Boolean(creditNoteForm.restockItems)}
                  onChange={(e) => setCreditNoteForm({ ...creditNoteForm, restockItems: e.target.checked ? 1 : 0 })}
                  className="rounded border-slate-300 text-rose-600"
                />
                <label htmlFor="restock" className="text-slate-700 font-medium">
                  {t('sales.restock_items')}
                </label>
              </div>

              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewCreditNoteModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-md transition font-semibold"
                >
                  Post Credit Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Printable View Modal */}
      {printInvoiceData && (
        <InvoicePrintModal
          invoice={printInvoiceData}
          type="INVOICE"
          onClose={() => setPrintInvoiceData(null)}
        />
      )}
    </div>
  );
}
