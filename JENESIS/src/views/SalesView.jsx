import React, { useState, useEffect } from 'react';
import { useEscapeLayer, useShortcutAction } from '../context/ShortcutsContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest, translateError, interpolateVars } from '../services/api';
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
  const { currentCompany, formatCurrency, formatDate, showToast, refreshKey, setActiveView, hasPermission } = useApp();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState('invoices'); // 'invoices', 'quotes', 'orders', 'credit_notes'
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [creditNotes, setCreditNotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [walkInFilter, setWalkInFilter] = useState(false);

  // Modals
  const [showNewInvoiceModal, setShowNewInvoiceModal] = useState(false);
  const [showNewQuoteModal, setShowNewQuoteModal] = useState(false);
  const [showNewCreditNoteModal, setShowNewCreditNoteModal] = useState(false);
  const [printInvoiceData, setPrintInvoiceData] = useState(null);
  // Row selection drives the keyboard actions: F2 settles and F3 prints the
  // selected document.
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Invoice Form State
  const [invoiceForm, setInvoiceForm] = useState({
    customer_id: '',
    walk_in: false,
    currency_code: '',
    exchange_rate: null,
    warehouse_id: '',
    payment_method: 'CASH',
    bank_account_id: '',
    date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    notes: '',
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
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (walkInFilter) params.set('walk_in', '1');
      const qs = params.toString();
      const [invData, custData, prodData, taxData] = await Promise.all([
        apiRequest(`/api/sales/invoices${qs ? `?${qs}` : ''}`),
        apiRequest('/api/customers'),
        apiRequest('/api/products'),
        apiRequest('/api/taxes')
      ]);
      setInvoices(invData);
      setCustomers(custData);
      setProducts(prodData);
      setTaxes(taxData);

      // Optional reference data (some roles may not read banking/fx — ignore).
      apiRequest('/api/inventory/warehouses').then(setWarehouses).catch(() => setWarehouses([]));
      apiRequest('/api/fx/currencies').then(setCurrencies).catch(() => setCurrencies([]));
      apiRequest('/api/payments/bank-accounts').then(setBankAccounts).catch(() => setBankAccounts([]));

      if (activeTab === 'quotes') {
        const qData = await apiRequest('/api/sales/quotes');
        setQuotes(qData);
      } else if (activeTab === 'credit_notes') {
        const cnData = await apiRequest('/api/sales/credit-notes');
        setCreditNotes(cnData);
      }
    } catch (err) {
      showToast(translateError(t, err), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentCompany?.id, activeTab, refreshKey, statusFilter, walkInFilter]);

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
    // Walk-in (anonymous) sales need no customer; credit sales always do.
    if (!invoiceForm.walk_in && !invoiceForm.customer_id) {
      return showToast(t('sales.credit_customer_hint'), 'error');
    }

    try {
      const payload = {
        ...invoiceForm,
        customer_id: invoiceForm.walk_in ? null : invoiceForm.customer_id,
        currency_code: invoiceForm.currency_code || null,
        exchange_rate: invoiceForm.exchange_rate != null && invoiceForm.exchange_rate !== '' ? Number(invoiceForm.exchange_rate) : null,
        warehouse_id: invoiceForm.warehouse_id || null,
        bank_account_id: invoiceForm.bank_account_id || null,
        // "Post now" means: post the document AND settle it (PAID).
        settle: invoiceForm.autoPost === true
      };
      const res = await apiRequest('/api/sales/invoices', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      // JENESIS records every new sales document as PAID (a real receipt is
      // booked by the server); there is no PAID/UNPAID choice in the form.
      showToast(
        res.paid
          ? t('sales.settled_toast', { number: res.invoiceNumber, payment: res.paymentNumber || '' })
          : `${t('sales.invoice_number')} ${res.invoiceNumber} — ${t('common.posted')}`,
        'success'
      );
      setShowNewInvoiceModal(false);
      setInvoiceForm((f) => ({ ...f, walk_in: false, customer_id: '', lines: f.lines.map((l) => ({ ...l, product_id: '', description: '', quantity: 1, unit_price: 0 })) }));
      fetchData();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  // Records the outstanding payment on an existing document and marks it PAID.
  // Idempotent: the server refuses to create a second payment and reports
  // alreadySettled, so pressing F2 twice never double-pays.
  const handleSettle = async (invId) => {
    try {
      const res = await apiRequest(`/api/sales/invoices/${invId}/settle`, {
        method: 'POST',
        body: JSON.stringify({ payment_method: 'CASH' })
      });
      showToast(
        res.alreadySettled
          ? t('sales.already_paid', { number: res.invoiceNumber })
          : t('sales.settled_toast', { number: res.invoiceNumber, payment: res.paymentNumber || '' }),
        res.alreadySettled ? 'info' : 'success'
      );
      fetchData();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  // Is anything worth keeping in the new-invoice form?
  const invoiceFormDirty = () => {
    const f = invoiceForm;
    if (f.customer_id || f.notes.trim()) return true;
    return f.lines.some((l) => l.product_id || (l.description || '').trim() || Number(l.quantity) !== 1 || Number(l.unit_price) !== 0);
  };

  // Escape on the "New Sales Invoice" dialog: warn before discarding work.
  useEscapeLayer({
    id: 'sales-new-invoice',
    priority: 100,
    active: showNewInvoiceModal,
    onEscape: () => {
      if (invoiceFormDirty()) {
        setConfirmDiscard(true);
        return true;
      }
      setShowNewInvoiceModal(false);
      return true;
    }
  });

  // F2 — settle (mark PAID) the selected document. Idempotent on the server.
  useShortcutAction('F2', () => {
    if (!selectedInvoiceId) {
      showToast(t('shortcuts.settle_none'), 'info');
      return true;
    }
    handleSettle(selectedInvoiceId);
    return true;
  }, { order: 10 });

  // F3 — print the selected invoice.
  useShortcutAction('F3', () => {
    if (!selectedInvoiceId) return false; // falls through to "nothing to print"
    handlePrint(selectedInvoiceId);
    return true;
  }, { order: 10 });

  // Ctrl+N — new document on this screen.
  useShortcutAction('Ctrl+N', () => {
    if (!hasPermission('sales:write')) {
      showToast(t('errors.FORBIDDEN'), 'error');
      return true;
    }
    setShowNewInvoiceModal(true);
    return true;
  }, { order: 10 });

  const handlePostDraft = async (invId, inv) => {
    try {
      let body;
      if (inv?.walk_in) {
        // Walk-in checkout: settle immediately (server defaults to the cash account).
        body = { payment_method: 'CASH' };
      }
      const res = await apiRequest(`/api/sales/invoices/${invId}/post`, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      showToast(`${t('sales.invoice_number')} ${res.invoiceNumber} — ${t('common.posted')}`, 'success');
      fetchData();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const handlePrint = async (invId) => {
    try {
      const inv = await apiRequest(`/api/sales/invoices/${invId}`);
      setPrintInvoiceData(inv);
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const handleConvertQuote = async (quoteId) => {
    try {
      const res = await apiRequest(`/api/sales/quotes/${quoteId}/convert-to-invoice`, { method: 'POST' });
      showToast(`${t('sales.tab_quotes')} → ${t('sales.invoice_number')} ${res.invoiceNumber}`, 'success');
      setActiveTab('invoices');
      fetchData();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const handleCreateCreditNote = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/api/sales/credit-notes', {
        method: 'POST',
        body: JSON.stringify(creditNoteForm)
      });
      showToast(`${t('sales.credit_note_number')} ${res.creditNoteNumber} — ${t('common.posted')}`, 'success');
      setShowNewCreditNoteModal(false);
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
          <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder={t('sales.search_invoices')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') fetchData(); }}
                  onBlur={() => fetchData()}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
              >
                <option value="">{t('common.all')}</option>
                <option value="DRAFT">{t('common.draft')}</option>
                <option value="POSTED">{t('common.posted')}</option>
                <option value="PARTIALLY_PAID">{t('common.partially_paid')}</option>
                <option value="PAID">{t('common.paid')}</option>
                <option value="CANCELLED">{t('common.cancelled')}</option>
              </select>
              <label className="flex items-center space-x-1.5 text-xs text-slate-600 font-medium">
                <input type="checkbox" checked={walkInFilter} onChange={(e) => setWalkInFilter(e.target.checked)} className="rounded border-slate-300" />
                <span>{t('sales.filter_walk_in')}</span>
              </label>
            </div>
            <div className="text-xs text-slate-500 font-medium">{invoices.length} {t('sales.tab_invoices')}</div>
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
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedInvoiceId((prev) => (prev === inv.id ? '' : inv.id))}
                      className={`hover:bg-slate-50 transition cursor-pointer ${
                        selectedInvoiceId === inv.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">{inv.invoice_number}</td>
                      <td className="py-3 px-4 text-slate-600">{formatDate(inv.date)}</td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(inv.due_date)}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {inv.walk_in ? (
                          <span className="inline-flex items-center space-x-1">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-violet-100 text-violet-700 border border-violet-200">
                              {t('sales.walk_in_badge')}
                            </span>
                          </span>
                        ) : (
                          inv.customer_name
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {formatCurrency(inv.subtotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {formatCurrency(inv.tax_total)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(inv.total)}
                        {inv.foreign_total ? (
                          <div className="text-[10px] font-medium text-slate-400">
                            {inv.foreign_total} {inv.currency_code} @ {inv.exchange_rate}
                          </div>
                        ) : null}
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
                          {inv.status === 'PAID' ? t('common.paid')
                            : inv.status === 'POSTED' ? t('common.posted')
                            : inv.status === 'DRAFT' ? t('common.draft')
                            : inv.status === 'PARTIALLY_PAID' ? t('common.partially_paid')
                            : inv.status === 'CANCELLED' ? t('common.cancelled')
                            : inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          {inv.status === 'DRAFT' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePostDraft(inv.id, inv); }}
                              title={t('sales.post_invoice')}
                              className="px-2 py-1 rounded text-[10px] font-bold bg-blue-600 text-white hover:bg-blue-500 transition"
                            >
                              {t('common.post')}
                            </button>
                          )}
                          {inv.status !== 'PAID' && inv.status !== 'DRAFT' && inv.status !== 'CANCELLED' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSettle(inv.id); }}
                              title={t('sales.settle_hint')}
                              className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition"
                            >
                              {t('sales.settle_action')}
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handlePrint(inv.id); }}
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
              {/* Walk-in (anonymous) sale toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 bg-violet-50 border border-violet-200 rounded-lg px-4 py-2.5">
                <label htmlFor="walkIn" className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    id="walkIn"
                    checked={invoiceForm.walk_in}
                    onChange={(e) => setInvoiceForm({
                      ...invoiceForm,
                      walk_in: e.target.checked,
                      customer_id: e.target.checked ? '' : invoiceForm.customer_id,
                      autoPost: e.target.checked ? true : invoiceForm.autoPost
                    })}
                    className="rounded border-slate-300 text-violet-600"
                  />
                  <span className="text-violet-900 font-bold">{t('sales.walk_in_sale')}</span>
                </label>
                <span className="text-[10px] text-violet-700">{t('sales.walk_in_hint')}</span>
              </div>

              {/* Customer & Dates Header */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                {!invoiceForm.walk_in && (
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">{t('sales.customer')} *</label>
                    <select
                      required
                      value={invoiceForm.customer_id}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, customer_id: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                    >
                      <option value="">— {t('sales.customer')} —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">{t('sales.credit_customer_hint')}</p>
                  </div>
                )}

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

                {warehouses.length > 0 && (
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">{t('inventory.movements_store')}</label>
                    <select
                      value={invoiceForm.warehouse_id}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, warehouse_id: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">{t('inventory.default_store')}</option>
                      {warehouses.filter((w) => w.active).map((w) => (
                        <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Currency & walk-in checkout */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('sales.currency')}</label>
                  <select
                    value={invoiceForm.currency_code}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, currency_code: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    <option value="">{currentCompany?.currency_code || 'USD'} ({t('settings.base_currency')})</option>
                    {currencies.filter((c) => c.code !== (currentCompany?.currency_code || 'USD')).map((c) => (
                      <option key={c.id || c.code} value={c.code}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('sales.exchange_rate')}</label>
                  <input
                    type="number" step="any" min="0"
                    disabled={!invoiceForm.currency_code}
                    value={invoiceForm.exchange_rate ?? ''}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, exchange_rate: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder={t('settings.rate_value')}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono disabled:bg-slate-100"
                  />
                </div>
                {true && (
                  <>
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">{t('banking.payment_method')}</label>
                      <select
                        value={invoiceForm.payment_method}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, payment_method: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="CASH">{t('banking.method_cash')}</option>
                        <option value="MOBILE_MONEY">{t('banking.method_momo')}</option>
                        <option value="BANK_TRANSFER">{t('banking.method_bank')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">{t('sales.settlement_account')}</label>
                      <select
                        value={invoiceForm.bank_account_id}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, bank_account_id: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">{t('banking.type_cash')}</option>
                        {bankAccounts.filter((b) => b.active).map((b) => (
                          <option key={b.id} value={b.id}>{b.bank_name}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
              {invoiceForm.currency_code && (
                <p className="text-[10px] text-slate-400 -mt-2">{t('sales.base_total_note')}</p>
              )}

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
                      {t('sales.auto_post_hint')}
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
                  {invoiceForm.currency_code && (
                    <div className="flex justify-between text-slate-600">
                      <span>{t('sales.foreign_total')}:</span>
                      <span className="font-mono font-semibold text-violet-700">
                        {invTotals.total.toLocaleString(undefined, { maximumFractionDigits: 4 })} {invoiceForm.currency_code}
                        {invoiceForm.exchange_rate ? ` × ${invoiceForm.exchange_rate}` : ''}
                      </span>
                    </div>
                  )}
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
                  {invoiceForm.autoPost ? t('sales.post_invoice') : `${t('common.save')} (${t('common.draft')})`}
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
                  <option value="">— {t('sales.choose_customer')} —</option>
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

      {/* Escape on a half-filled form asks before discarding it */}
      <ConfirmDialog
        open={confirmDiscard}
        title={t('sales.discard_title')}
        message={t('sales.discard_message')}
        confirmLabel={t('sales.discard_confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          setShowNewInvoiceModal(false);
        }}
      />
    </div>
  );
}
