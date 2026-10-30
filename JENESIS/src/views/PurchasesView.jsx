import React, { useState, useEffect } from 'react';
import { useEscapeLayer, useShortcutAction } from '../context/ShortcutsContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest, translateError } from '../services/api';
import InvoicePrintModal from '../components/InvoicePrintModal';
import {
  ShoppingBag,
  Plus,
  Search,
  Printer,
  Trash2,
  X,
  CreditCard,
  ArrowRight,
  Truck,
  PackageCheck
} from 'lucide-react';

export default function PurchasesView() {
  const { currentCompany, formatCurrency, formatDate, showToast, refreshKey, hasPermission } = useApp();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState('bills'); // 'bills', 'orders', 'receipts', 'returns'
  const [bills, setBills] = useState([]);
  const [orders, setOrders] = useState([]);
  const [returns, setReturns] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [showNewBillModal, setShowNewBillModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [printBillData, setPrintBillData] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  // Row selection drives the keyboard actions: F2 settles and F3 prints.
  const [selectedBillId, setSelectedBillId] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [receiptPo, setReceiptPo] = useState(null);

  // Goods receipt form (stock increases ONLY when this is posted)
  const [receiptForm, setReceiptForm] = useState({
    supplierId: '',
    purchaseOrderId: '',
    warehouseId: '',
    notes: '',
    lines: [{ productId: '', quantity: 1 }]
  });

  // Bill Form State
  const [billForm, setBillForm] = useState({
    supplier_id: '',
    vendor_invoice_number: '',
    goods_receipt_id: '',
    currency_code: '',
    exchange_rate: null,
    date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    notes: '',
    autoPost: true, // kept for the server's POSTED fallback; the form no longer offers the choice
    payment_method: 'CASH',
    bank_account_id: '',
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
      const [billsData, suppData, prodData, orderData, returnData] = await Promise.all([
        apiRequest('/api/purchases/bills'),
        apiRequest('/api/suppliers'),
        apiRequest('/api/products'),
        apiRequest('/api/purchases/orders'),
        apiRequest('/api/purchases/returns')
      ]);
      setBills(billsData);

      // Optional reference data (some roles cannot read banking — ignore).
      apiRequest('/api/payments/bank-accounts').then(setBankAccounts).catch(() => setBankAccounts([]));
      setSuppliers(suppData);
      setProducts(prodData);
      setOrders(orderData);
      setReturns(returnData);

      // Optional reference data (some roles may not read these — ignore).
      apiRequest('/api/purchases/receipts').then(setReceipts).catch(() => setReceipts([]));
      apiRequest('/api/inventory/warehouses').then(setWarehouses).catch(() => setWarehouses([]));
      apiRequest('/api/fx/currencies').then(setCurrencies).catch(() => setCurrencies([]));
    } catch (err) {
      showToast(translateError(t, err), 'error');
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
    if (!billForm.supplier_id) return showToast(t('errors.SUPPLIER_REQUIRED'), 'error');

    try {
      const res = await apiRequest('/api/purchases/bills', {
        method: 'POST',
        body: JSON.stringify({
          ...billForm,
          goods_receipt_id: billForm.goods_receipt_id || null,
          currency_code: billForm.currency_code || null,
          exchange_rate: billForm.exchange_rate != null && billForm.exchange_rate !== '' ? Number(billForm.exchange_rate) : null,
          bank_account_id: billForm.bank_account_id || null,
          // JENESIS records every new purchase document as PAID (the server
          // books a real supplier payment); there is no PAID/UNPAID choice.
          // A purchase document is created PAID: the bill is posted and the
          // real supplier payment is recorded in the same operation.
          settle: true
        })
      });
      showToast(
        res.paid
          ? t('purchases.settled_toast', { number: res.billNumber, payment: res.paymentNumber || '' })
          : `${t('purchases.bill_number')} ${res.billNumber} — ${t('common.posted')}`,
        'success'
      );
      setShowNewBillModal(false);
      fetchData();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  // Records the outstanding payment on an existing bill and marks it PAID.
  // Idempotent — the server never creates a second payment for a settled bill.
  const handleSettle = async (billId) => {
    try {
      const res = await apiRequest(`/api/purchases/bills/${billId}/settle`, {
        method: 'POST',
        body: JSON.stringify({ payment_method: 'CASH' })
      });
      showToast(
        res.alreadySettled
          ? t('purchases.already_paid', { number: res.billNumber })
          : t('purchases.settled_toast', { number: res.billNumber, payment: res.paymentNumber || '' }),
        res.alreadySettled ? 'info' : 'success'
      );
      fetchData();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  // Is anything worth keeping in the new-bill form?
  const billFormDirty = () => {
    const f = billForm;
    if (f.supplier_id || f.vendor_invoice_number || (f.notes || '').trim()) return true;
    return f.lines.some((l) => l.product_id || (l.description || '').trim() || Number(l.quantity) !== 1 || Number(l.unit_cost) !== 0);
  };

  // Escape on the "New Purchase Bill" dialog: warn before discarding work.
  useEscapeLayer({
    id: 'purchases-new-bill',
    priority: 100,
    active: showNewBillModal,
    onEscape: () => {
      if (billFormDirty()) {
        setConfirmDiscard(true);
        return true;
      }
      setShowNewBillModal(false);
      return true;
    }
  });

  // F2 — settle (mark PAID) the selected bill. Idempotent on the server.
  useShortcutAction('F2', () => {
    if (!selectedBillId) {
      showToast(t('shortcuts.settle_none'), 'info');
      return true;
    }
    handleSettle(selectedBillId);
    return true;
  }, { order: 10 });

  // F3 — print the selected bill.
  useShortcutAction('F3', () => {
    if (!selectedBillId) return false; // falls through to "nothing to print"
    handlePrint(selectedBillId);
    return true;
  }, { order: 10 });

  // Ctrl+N — new document on this screen.
  useShortcutAction('Ctrl+N', () => {
    if (!hasPermission('purchases:write')) {
      showToast(t('errors.FORBIDDEN'), 'error');
      return true;
    }
    setShowNewBillModal(true);
    return true;
  }, { order: 10 });

  // Ctrl+Shift+N — the shell asks for a new purchase document.
  useEffect(() => {
    const onNewDocument = (event) => {
      if (event.detail !== 'purchase') return;
      if (!hasPermission('purchases:write')) { showToast(t('errors.FORBIDDEN'), 'error'); return; }
      setShowNewBillModal(true);
    };
    window.addEventListener('jenesis:new-document', onNewDocument);
    return () => window.removeEventListener('jenesis:new-document', onNewDocument);
  }, [hasPermission, showToast, t]);

  const handlePostDraft = async (billId) => {
    try {
      const res = await apiRequest(`/api/purchases/bills/${billId}/post`, { method: 'POST' });
      showToast(`${t('purchases.bill_number')} ${res.billNumber} — ${t('common.posted')}`, 'success');
      fetchData();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const handlePrint = async (billId) => {
    try {
      const b = await apiRequest(`/api/purchases/bills/${billId}`);
      setPrintBillData(b);
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  // ---------------- goods receipts ----------------
  const loadPoForReceipt = async (poId) => {
    setReceiptForm((f) => ({ ...f, purchaseOrderId: poId }));
    if (!poId) { setReceiptPo(null); return; }
    try {
      const po = await apiRequest(`/api/purchases/orders/${poId}`);
      setReceiptPo(po);
      setReceiptForm((f) => ({
        ...f,
        supplierId: po.supplier_id,
        lines: po.lines
          .filter((l) => Number(l.quantity) - Number(l.received_qty || 0) > 0)
          .map((l) => ({ productId: l.product_id, quantity: Number(l.quantity) - Number(l.received_qty || 0) }))
      }));
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const handleReceiptSubmit = async (andPost) => {
    const lines = receiptForm.lines.filter((l) => l.productId && Number(l.quantity) > 0);
    if (!receiptForm.supplierId || lines.length === 0) {
      return showToast(t('errors.MISSING_FIELDS'), 'error');
    }
    try {
      const created = await apiRequest('/api/purchases/receipts', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: receiptForm.supplierId,
          purchaseOrderId: receiptForm.purchaseOrderId || null,
          warehouseId: receiptForm.warehouseId || null,
          notes: receiptForm.notes,
          lines: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) }))
        })
      });
      if (andPost) {
        await apiRequest(`/api/purchases/receipts/${created.receiptId}/post`, { method: 'POST' });
      }
      showToast(`${t('purchases.receipt_number')} ${created.receiptNumber} — ${andPost ? t('common.posted') : t('common.draft')}`, 'success');
      setShowReceiptModal(false);
      setReceiptPo(null);
      setReceiptForm({ supplierId: '', purchaseOrderId: '', warehouseId: '', notes: '', lines: [{ productId: '', quantity: 1 }] });
      fetchData();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const postReceipt = async (id) => {
    try {
      await apiRequest(`/api/purchases/receipts/${id}/post`, { method: 'POST' });
      showToast(t('common.posted'), 'success');
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
              onClick={() => setActiveTab('receipts')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'receipts' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('purchases.tab_receipts')}
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

          {activeTab === 'receipts' && (
            <button
              onClick={() => setShowReceiptModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow transition"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>{t('purchases.new_receipt')}</span>
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
                    <tr
                      key={b.id}
                      onClick={() => setSelectedBillId((prev) => (prev === b.id ? '' : b.id))}
                      className={`hover:bg-slate-50 transition cursor-pointer ${
                        selectedBillId === b.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''
                      }`}
                    >
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
                              onClick={(e) => { e.stopPropagation(); handlePostDraft(b.id); }}
                              className="px-2 py-1 rounded text-[10px] font-bold bg-blue-600 text-white hover:bg-blue-500 transition"
                            >
                              Post
                            </button>
                          )}
                          {b.status !== 'PAID' && b.status !== 'DRAFT' && b.status !== 'CANCELLED' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSettle(b.id); }}
                              title={t('purchases.settle_hint')}
                              className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition"
                            >
                              {t('purchases.settle_action')}
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handlePrint(b.id); }}
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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-bold text-slate-800">{t('purchases.tab_orders')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('purchases.po_number')}</th>
                  <th className="py-2.5 px-4">{t('common.date')}</th>
                  <th className="py-2.5 px-4">{t('purchases.supplier')}</th>
                  <th className="py-2.5 px-4 text-right">{t('common.total')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.length > 0 ? orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-bold text-indigo-600">{o.po_number}</td>
                    <td className="py-2.5 px-4 text-slate-600">{formatDate(o.date)}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">{o.supplier_name}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">{formatCurrency(o.total)}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                        o.status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-800'
                        : o.status === 'PARTIALLY_RECEIVED' ? 'bg-amber-100 text-amber-800'
                        : o.status === 'CANCELLED' ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-slate-600'}`}>
                        {o.status === 'RECEIVED' ? t('purchases.status_received')
                          : o.status === 'PARTIALLY_RECEIVED' ? t('purchases.status_partially_received')
                          : o.status === 'CANCELLED' ? t('common.cancelled')
                          : o.status === 'POSTED' ? t('common.confirmed') : o.status}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-400">{t('common.no_data')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2b. Goods Receipts Tab */}
      {activeTab === 'receipts' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-bold text-slate-800">{t('purchases.tab_receipts')}</h2>
            <p className="text-[11px] text-slate-500">{t('purchases.receipt_hint')}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('purchases.receipt_number')}</th>
                  <th className="py-2.5 px-4">{t('common.date')}</th>
                  <th className="py-2.5 px-4">{t('purchases.supplier')}</th>
                  <th className="py-2.5 px-4">{t('purchases.select_po')}</th>
                  <th className="py-2.5 px-4 text-right">{t('purchases.total_quantity')}</th>
                  <th className="py-2.5 px-4 text-right">{t('purchases.total_value')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receipts.length > 0 ? receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-bold text-emerald-700">{r.receipt_number}</td>
                    <td className="py-2.5 px-4 text-slate-600">{formatDate(r.date)}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">{r.supplier_name || '—'}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">{r.po_number || t('purchases.direct_receipt_no_po')}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{r.total_quantity}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(r.total_value)}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${r.status === 'POSTED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                        {r.status === 'POSTED' ? t('common.posted') : t('common.draft')}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {r.status === 'DRAFT' && (
                        <button onClick={() => postReceipt(r.id)}
                          className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-500">
                          {t('purchases.post_receipt')}
                        </button>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-400">{t('purchases.no_receipts')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Returns Tab */}
      {activeTab === 'returns' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-bold text-slate-800">{t('purchases.tab_returns')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('purchases.return_number')}</th>
                  <th className="py-2.5 px-4">{t('common.date')}</th>
                  <th className="py-2.5 px-4">{t('purchases.supplier')}</th>
                  <th className="py-2.5 px-4">{t('common.reason')}</th>
                  <th className="py-2.5 px-4 text-right">{t('common.total')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {returns.length > 0 ? returns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-bold text-rose-600">{r.return_number}</td>
                    <td className="py-2.5 px-4 text-slate-600">{formatDate(r.date)}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">{r.supplier_name}</td>
                    <td className="py-2.5 px-4 text-slate-600">{r.reason || '—'}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">{formatCurrency(r.total)}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800">{t('common.posted')}</span>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400">{t('common.no_data')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
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
                    <option value="">— {t('purchases.supplier')} —</option>
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

              {/* Goods receipt link & currency */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-emerald-50/50 p-4 rounded-lg border border-emerald-200">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('purchases.link_receipt_bill')}</label>
                  <select
                    value={billForm.goods_receipt_id}
                    onChange={(e) => setBillForm({ ...billForm, goods_receipt_id: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">{t('purchases.direct_receipt_no_po')}</option>
                    {receipts
                      .filter((r) => r.status === 'POSTED' && (!billForm.supplier_id || r.supplier_id === billForm.supplier_id))
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.receipt_number} — {r.total_quantity} × {formatCurrency(r.total_value)}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('sales.currency')}</label>
                  <select
                    value={billForm.currency_code}
                    onChange={(e) => setBillForm({ ...billForm, currency_code: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
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
                    disabled={!billForm.currency_code}
                    value={billForm.exchange_rate ?? ''}
                    onChange={(e) => setBillForm({ ...billForm, exchange_rate: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder={t('settings.rate_value')}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono disabled:bg-slate-100"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 -mt-2">{t('purchases.receipt_hint')}</p>

              {/* Line Items */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-bold text-slate-700">{t('purchases.line_items_stock')}</h4>
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
                                <option value="">— {t('purchases.choose_product')} —</option>
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
                  {/* Settlement: a recorded bill is PAID — no PAID/UNPAID choice. */}
                  <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
                    <p className="text-[10px] text-emerald-800 font-semibold">{t('purchases.payment_section')}</p>
                    <p className="text-[10px] text-emerald-700">{t('purchases.payment_on_creation_hint')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[10px]">{t('banking.payment_method')}</label>
                        <select
                          value={billForm.payment_method}
                          onChange={(e) => setBillForm({ ...billForm, payment_method: e.target.value })}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="CASH">{t('banking.method_cash')}</option>
                          <option value="MOBILE_MONEY">{t('banking.method_momo')}</option>
                          <option value="BANK_TRANSFER">{t('banking.method_bank')}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[10px]">{t('sales.settlement_account')}</label>
                        <select
                          value={billForm.bank_account_id}
                          onChange={(e) => setBillForm({ ...billForm, bank_account_id: e.target.value })}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">{t('banking.type_cash')}</option>
                          {bankAccounts.filter((b) => b.active).map((b) => (
                            <option key={b.id} value={b.id}>{b.bank_name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
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
                  {billForm.currency_code && (
                    <div className="flex justify-between text-slate-600">
                      <span>{t('sales.foreign_total')}:</span>
                      <span className="font-mono font-semibold text-emerald-700">
                        {billTotals.total.toLocaleString(undefined, { maximumFractionDigits: 4 })} {billForm.currency_code}
                        {billForm.exchange_rate ? ` × ${billForm.exchange_rate}` : ''}
                      </span>
                    </div>
                  )}
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
                  {t('purchases.post_bill')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Goods Receipt Modal */}
      {showReceiptModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full my-8 overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Truck className="w-4 h-4 text-emerald-400" />
                <span>{t('purchases.new_receipt')}</span>
              </h3>
              <button onClick={() => setShowReceiptModal(false)} className="text-slate-400 hover:text-white p-1 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{t('purchases.receipt_hint')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('purchases.select_po')}</label>
                  <select
                    value={receiptForm.purchaseOrderId}
                    onChange={(e) => loadPoForReceipt(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="">{t('purchases.direct_receipt_no_po')}</option>
                    {orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'RECEIVED').map((o) => (
                      <option key={o.id} value={o.id}>{o.po_number} — {o.supplier_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('purchases.supplier')} *</label>
                  <select
                    required
                    value={receiptForm.supplierId}
                    onChange={(e) => setReceiptForm({ ...receiptForm, supplierId: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="">— {t('purchases.supplier')} —</option>
                    {suppliers.map((sp) => (
                      <option key={sp.id} value={sp.id}>{sp.name} ({sp.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('purchases.receipt_store')}</label>
                  <select
                    value={receiptForm.warehouseId}
                    onChange={(e) => setReceiptForm({ ...receiptForm, warehouseId: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="">{t('inventory.default_store')}</option>
                    {warehouses.filter((w) => w.active).map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              {receiptPo && (
                <div className="text-[11px] text-slate-500">
                  {t('purchases.receipts_of_po')}: {receiptPo.receipts?.length || 0}
                </div>
              )}

              <div className="space-y-2">
                {receiptForm.lines.map((line, idx) => {
                  const poLine = receiptPo?.lines?.find((l) => l.product_id === line.productId);
                  const remaining = poLine ? Number(poLine.quantity) - Number(poLine.received_qty || 0) : null;
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_110px_32px] gap-2 items-center">
                      <select
                        required
                        value={line.productId}
                        onChange={(e) => {
                          const lines = [...receiptForm.lines];
                          lines[idx].productId = e.target.value;
                          setReceiptForm({ ...receiptForm, lines });
                        }}
                        className="px-2 py-1.5 border border-slate-300 rounded-md bg-white"
                      >
                        <option value="">— {t('inventory.product_name')} —</option>
                        {(receiptPo
                          ? products.filter((pd) => receiptPo.lines.some((l) => l.product_id === pd.id))
                          : products.filter((pd) => pd.type === 'GOODS')
                        ).map((pd) => (
                          <option key={pd.id} value={pd.id}>{pd.name} ({pd.sku})</option>
                        ))}
                      </select>
                      <input
                        type="number" step="any" min="0.0001" required
                        value={line.quantity}
                        onChange={(e) => {
                          const lines = [...receiptForm.lines];
                          lines[idx].quantity = Number(e.target.value);
                          setReceiptForm({ ...receiptForm, lines });
                        }}
                        className="px-2 py-1.5 border border-slate-300 rounded-md text-right font-mono"
                      />
                      <button type="button"
                        onClick={() => setReceiptForm({ ...receiptForm, lines: receiptForm.lines.filter((_, i) => i !== idx) })}
                        className="p-1.5 rounded text-rose-500 hover:bg-rose-50"><X className="w-3.5 h-3.5" /></button>
                      {remaining != null && (
                        <div className="col-span-3 text-[10px] text-slate-400 -mt-1">
                          {t('purchases.ordered_qty')}: {poLine.quantity} — {t('purchases.received_qty')}: {poLine.received_qty || 0} — {t('purchases.remaining_qty')}: {remaining}
                        </div>
                      )}
                    </div>
                  );
                })}
                <button type="button"
                  onClick={() => setReceiptForm({ ...receiptForm, lines: [...receiptForm.lines, { productId: '', quantity: 1 }] })}
                  className="text-emerald-700 hover:text-emerald-900 font-semibold flex items-center space-x-1">
                  <Plus className="w-3.5 h-3.5" /><span>{t('sales.add_line')}</span>
                </button>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('common.notes')}</label>
                <input type="text" value={receiptForm.notes}
                  onChange={(e) => setReceiptForm({ ...receiptForm, notes: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md" />
              </div>

              <div className="border-t border-slate-200 pt-4 flex justify-end space-x-2">
                <button type="button" onClick={() => setShowReceiptModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 font-medium">{t('common.cancel')}</button>
                <button type="button" onClick={() => handleReceiptSubmit(false)}
                  className="px-4 py-2 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 rounded-md font-semibold">
                  {t('common.save')} ({t('common.draft')})
                </button>
                <button type="button" onClick={() => handleReceiptSubmit(true)}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-semibold shadow flex items-center space-x-1.5">
                  <PackageCheck className="w-4 h-4" /><span>{t('purchases.post_receipt')}</span>
                </button>
              </div>
            </div>
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

      {/* Escape on a half-filled form asks before discarding it */}
      <ConfirmDialog
        open={confirmDiscard}
        title={t('purchases.discard_title')}
        message={t('purchases.discard_message')}
        confirmLabel={t('purchases.discard_confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          setShowNewBillModal(false);
        }}
      />
    </div>
  );
}
