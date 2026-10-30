import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useShortcutAction } from '../context/ShortcutsContext';
import { useI18n } from '../i18n';
import { apiRequest, translateError } from '../services/api';
import {
  Package,
  Plus,
  Search,
  Sliders,
  ClipboardList,
  History,
  TrendingUp,
  AlertTriangle,
  Edit2,
  Check,
  X,
  FileSpreadsheet,
  Building2,
  ArrowLeftRight,
  Send,
  PackageCheck,
  Printer,
  Eye,
  CheckCircle2,
  XCircle,
  Truck,
  Ban,
  Save,
  RotateCcw
} from 'lucide-react';

const COUNT_STATUSES = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  POSTED: 'bg-indigo-50 text-indigo-700 border-indigo-200'
};

const TRANSFER_STATUSES = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  DISPATCHED: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200'
};

function StatusBadge({ status, map }) {
  const { t } = useI18n();
  const labels = {
    DRAFT: t('common.draft'),
    SUBMITTED: t('common.submitted'),
    APPROVED: t('common.approved'),
    REJECTED: t('common.rejected'),
    POSTED: t('common.posted'),
    DISPATCHED: t('inventory.transfers.status_in_transit'),
    COMPLETED: t('inventory.transfers.status_completed'),
    CANCELLED: t('common.cancelled')
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${map[status] || map.DRAFT}`}>
      {labels[status] || status}
    </span>
  );
}

export default function InventoryView() {
  const { currentCompany, formatCurrency, formatDate, showToast, refreshKey, hasPermission, activeView } = useApp();
  const { t } = useI18n();

  // 'products' | 'stores' | 'transfers' | 'adjust' | 'count' | 'movements' | 'valuation'
  const [activeTab, setActiveTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [valuation, setValuation] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [stockLevels, setStockLevels] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [movementWarehouse, setMovementWarehouse] = useState('');

  // Modals
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [storeStockFor, setStoreStockFor] = useState(null);   // { product, companyStock, stores }
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [receiveFor, setReceiveFor] = useState(null);         // transfer detail being received
  const [showCountSheet, setShowCountSheet] = useState(null); // count row to print
  const [rejectFor, setRejectFor] = useState(null);           // count being rejected
  const [rejectReason, setRejectReason] = useState('');
  const [editingCount, setEditingCount] = useState(null);     // rejected/draft count being revised

  // Product Form
  const [productForm, setProductForm] = useState({
    sku: '', barcode: '', name: '', description: '', category: 'General', type: 'GOODS',
    unit: 'pcs', cost_price: 0, selling_price: 0, min_stock_level: 5, current_stock: 0,
    warehouse_location: 'Main Store'
  });

  // Store form
  const [storeForm, setStoreForm] = useState({ code: '', name: '', address: '', isDefault: false });

  // Stock Adjustment Form
  const [adjForm, setAdjForm] = useState({
    productId: '', warehouseId: '', quantityChange: 0, reason: 'DAMAGED', notes: ''
  });

  // Transfer form
  const [transferForm, setTransferForm] = useState({ fromWarehouseId: '', toWarehouseId: '', notes: '', lines: [] });

  // Physical Count (workflow)
  const [countWarehouseId, setCountWarehouseId] = useState('');
  const [countLines, setCountLines] = useState([]);
  const [countNotes, setCountNotes] = useState('');

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      setProducts(await apiRequest(`/api/products?search=${encodeURIComponent(search)}`));
    } catch (err) {
      showToast(translateError(t, err), 'error');
    } finally {
      setLoading(false);
    }
  }, [search]);

  const fetchWarehouses = useCallback(async () => {
    try {
      const data = await apiRequest('/api/inventory/warehouses');
      setWarehouses(data);
      return data;
    } catch (err) {
      console.error(err);
      return [];
    }
  }, []);

  const fetchStockLevels = useCallback(async () => {
    try {
      setStockLevels(await apiRequest('/api/inventory/stock-levels'));
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchMovements = useCallback(async () => {
    try {
      const suffix = movementWarehouse ? `?warehouseId=${encodeURIComponent(movementWarehouse)}` : '';
      setMovements(await apiRequest(`/api/inventory/movements${suffix}`));
    } catch (err) {
      console.error(err);
    }
  }, [movementWarehouse]);

  const fetchValuation = useCallback(async () => {
    try {
      setValuation(await apiRequest('/api/inventory/valuation'));
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchTransfers = useCallback(async () => {
    try {
      setTransfers(await apiRequest('/api/inventory/transfers'));
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchCounts = useCallback(async () => {
    try {
      setCounts(await apiRequest('/api/inventory/counts'));
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchWarehouses();
  }, [currentCompany?.id, refreshKey]);

  useEffect(() => {
    if (activeTab === 'products' || activeTab === 'adjust') { fetchProducts(); fetchWarehouses(); }
    else if (activeTab === 'stores') { fetchWarehouses(); fetchStockLevels(); fetchProducts(); }
    else if (activeTab === 'transfers') { fetchTransfers(); fetchWarehouses(); fetchProducts(); }
    else if (activeTab === 'movements') { fetchMovements(); fetchWarehouses(); }
    else if (activeTab === 'valuation') fetchValuation();
    else if (activeTab === 'count') { fetchProducts(); fetchWarehouses(); fetchStockLevels(); fetchCounts(); }
  }, [currentCompany?.id, search, activeTab, refreshKey, movementWarehouse]);

  // Default selections once warehouses are known
  useEffect(() => {
    if (warehouses.length === 0) return;
    const def = warehouses.find((w) => w.is_default) || warehouses[0];
    setAdjForm((f) => (f.warehouseId ? f : { ...f, warehouseId: def.id }));
    setCountWarehouseId((c) => c || def.id);
    setTransferForm((f) => (f.fromWarehouseId ? f : { ...f, fromWarehouseId: def.id }));
  }, [warehouses]);

  // Build the physical count sheet from the SELECTED STORE's stock levels.
  useEffect(() => {
    if (activeTab !== 'count' || products.length === 0 || !countWarehouseId) return;
    if (editingCount) return; // lines come from the loaded count when revising
    const physical = products.filter((p) => p.type === 'GOODS');
    setCountLines(
      physical.map((p) => {
        const lvl = stockLevels.find((s) => s.product_id === p.id && s.warehouse_id === countWarehouseId);
        const sysQty = lvl ? lvl.quantity : 0;
        return {
          productId: p.id, sku: p.sku, name: p.name, unit: p.unit, cost_price: p.cost_price,
          system_qty: sysQty, counted_qty: sysQty, variance_qty: 0, varianceReason: '', notes: ''
        };
      })
    );
  }, [activeTab, products, countWarehouseId, stockLevels, editingCount]);

  const systemQtyIn = (productId, warehouseId) => {
    const lvl = stockLevels.find((s) => s.product_id === productId && s.warehouse_id === warehouseId);
    return lvl ? lvl.quantity : 0;
  };

  // ============================== PRODUCTS ==============================
  const handleProductSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await apiRequest(`/api/products/${editingProduct.id}`, { method: 'PUT', body: JSON.stringify(productForm) });
        showToast(t('common.success', 'Saved'), 'success');
      } else {
        await apiRequest('/api/products', { method: 'POST', body: JSON.stringify(productForm) });
        showToast(t('common.success', 'Saved'), 'success');
      }
      setShowAddProductModal(false);
      setEditingProduct(null);
      fetchProducts();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  // Ctrl+E edits the product row the keyboard is on (or the first one).
  useShortcutAction('Ctrl+E', () => {
    const list = products;
    const rowId = document.activeElement?.closest?.('[data-j-row]')?.getAttribute('data-j-row');
    const target = list.find((p) => String(p.id) === String(rowId)) || list[0];
    if (!target) { showToast(t('shortcuts.edit_none'), 'info'); return false; }
    openEditProduct(target);
  }, { when: () => activeView === 'inventory' });

  const openEditProduct = (prod) => {
    setEditingProduct(prod);
    setProductForm({
      sku: prod.sku, barcode: prod.barcode || '', name: prod.name, description: prod.description || '',
      category: prod.category || 'General', type: prod.type || 'GOODS', unit: prod.unit || 'pcs',
      cost_price: prod.cost_price || 0, selling_price: prod.selling_price || 0,
      min_stock_level: prod.min_stock_level || 5, current_stock: prod.current_stock || 0,
      warehouse_location: prod.warehouse_location || 'Main Store'
    });
    setShowAddProductModal(true);
  };

  const openStoreStock = async (prod) => {
    try {
      const data = await apiRequest(`/api/inventory/stock-levels?product_id=${prod.id}`);
      setStoreStockFor({ ...data, product: prod });
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  // ============================== STORES ==============================
  const handleStoreSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingStore) {
        await apiRequest(`/api/inventory/warehouses/${editingStore.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: storeForm.name, address: storeForm.address, isDefault: storeForm.isDefault, active: storeForm.active })
        });
      } else {
        await apiRequest('/api/inventory/warehouses', {
          method: 'POST',
          body: JSON.stringify({ code: storeForm.code, name: storeForm.name, address: storeForm.address, isDefault: storeForm.isDefault })
        });
      }
      showToast(t('inventory.store_saved'), 'success');
      setShowStoreModal(false);
      setEditingStore(null);
      fetchWarehouses();
      fetchStockLevels();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  // ============================== ADJUSTMENTS ==============================
  const handleAdjustmentSubmit = async (e) => {
    e.preventDefault();
    if (!adjForm.productId || adjForm.quantityChange === 0) {
      return showToast(t('errors.MISSING_FIELDS'), 'error');
    }
    try {
      await apiRequest('/api/inventory/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          reason: adjForm.reason,
          notes: adjForm.notes,
          warehouseId: adjForm.warehouseId || null,
          lines: [{ productId: adjForm.productId, quantityChange: adjForm.quantityChange }]
        })
      });
      showToast(t('common.posted'), 'success');
      setAdjForm({ productId: '', warehouseId: adjForm.warehouseId, quantityChange: 0, reason: 'DAMAGED', notes: '' });
      fetchProducts();
      fetchStockLevels();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  // ============================== TRANSFERS ==============================
  const addTransferLine = () => {
    setTransferForm((f) => ({ ...f, lines: [...f.lines, { productId: '', quantity: 1 }] }));
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    const lines = transferForm.lines.filter((l) => l.productId && Number(l.quantity) > 0);
    if (!transferForm.fromWarehouseId || !transferForm.toWarehouseId || lines.length === 0) {
      return showToast(t('errors.MISSING_FIELDS'), 'error');
    }
    try {
      await apiRequest('/api/inventory/transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromWarehouseId: transferForm.fromWarehouseId,
          toWarehouseId: transferForm.toWarehouseId,
          notes: transferForm.notes,
          lines: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) }))
        })
      });
      showToast(t('inventory.transfers.transfer_created'), 'success');
      setShowTransferModal(false);
      setTransferForm((f) => ({ ...f, toWarehouseId: '', notes: '', lines: [] }));
      fetchTransfers();
    } catch (err) {
      showToast(translateError(t, err), 'error');
    }
  };

  const dispatchTransfer = async (id) => {
    try {
      await apiRequest(`/api/inventory/transfers/${id}/dispatch`, { method: 'POST' });
      showToast(t('common.posted'), 'success');
      fetchTransfers(); fetchStockLevels(); fetchProducts();
    } catch (err) { showToast(translateError(t, err), 'error'); }
  };

  const cancelTransfer = async (id) => {
    if (!window.confirm(t('common.confirm_title'))) return;
    try {
      await apiRequest(`/api/inventory/transfers/${id}/cancel`, { method: 'POST' });
      showToast(t('common.cancelled'), 'success');
      fetchTransfers();
    } catch (err) { showToast(translateError(t, err), 'error'); }
  };

  const openReceive = async (id) => {
    try {
      const detail = await apiRequest(`/api/inventory/transfers/${id}`);
      setReceiveFor({ ...detail, receiveQty: Object.fromEntries(detail.lines.map((l) => [l.id, Math.max(0, Number(l.quantity) - Number(l.received_quantity || 0))])) });
    } catch (err) { showToast(translateError(t, err), 'error'); }
  };

  const submitReceive = async () => {
    if (!receiveFor) return;
    try {
      const payload = Object.fromEntries(
        Object.entries(receiveFor.receiveQty).map(([k, v]) => [k, Number(v) || 0])
      );
      const res = await apiRequest(`/api/inventory/transfers/${receiveFor.id}/receive`, {
        method: 'POST', body: JSON.stringify({ lines: payload })
      });
      showToast(`${t('inventory.transfers.receive_transfer')} — ${res.status}`, 'success');
      setReceiveFor(null);
      fetchTransfers(); fetchStockLevels(); fetchProducts();
    } catch (err) { showToast(translateError(t, err), 'error'); }
  };

  // ============================== PHYSICAL COUNT WORKFLOW ==============================
  const handleCountQtyChange = (idx, newCounted) => {
    const updated = [...countLines];
    const item = updated[idx];
    const val = Number(newCounted) || 0;
    item.counted_qty = val;
    item.variance_qty = val - item.system_qty;
    if (!item.varianceReason) {
      item.varianceReason = item.variance_qty < 0 ? 'MISSING' : item.variance_qty > 0 ? 'EXCESS' : '';
    }
    setCountLines(updated);
  };

  const buildCountPayload = () => ({
    warehouseId: countWarehouseId || null,
    location: warehouses.find((w) => w.id === countWarehouseId)?.name || 'Main Store',
    notes: countNotes,
    lines: countLines.map((l) => ({
      productId: l.productId,
      countedQty: l.counted_qty,
      varianceReason: l.variance_qty !== 0 ? (l.varianceReason || (l.variance_qty < 0 ? 'MISSING' : 'EXCESS')) : null,
      notes: l.notes
    }))
  });

  const saveCountDraft = async () => {
    try {
      const payload = buildCountPayload();
      let res;
      if (editingCount) {
        res = await apiRequest(`/api/inventory/counts/${editingCount.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        res = await apiRequest('/api/inventory/counts/draft', { method: 'POST', body: JSON.stringify(payload) });
      }
      showToast(`${t('inventory.save_draft')} — ${res.countNumber}`, 'success');
      setEditingCount(null);
      fetchCounts();
    } catch (err) { showToast(translateError(t, err), 'error'); }
  };

  const countAction = async (id, action, body) => {
    try {
      await apiRequest(`/api/inventory/counts/${id}/${action}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      showToast(t('common.success', 'Done'), 'success');
      setRejectFor(null);
      setRejectReason('');
      fetchCounts(); fetchProducts(); fetchStockLevels();
    } catch (err) { showToast(translateError(t, err), 'error'); }
  };

  const reviseCount = async (row) => {
    try {
      const detail = await apiRequest(`/api/inventory/counts/${row.id}`);
      setEditingCount(detail);
      setCountWarehouseId(detail.warehouse_id || countWarehouseId);
      setCountNotes(detail.notes || '');
      setCountLines(detail.lines.map((l) => ({
        productId: l.product_id, sku: l.sku, name: l.product_name, unit: l.unit, cost_price: l.unit_cost,
        system_qty: l.system_qty, counted_qty: l.counted_qty, variance_qty: l.variance_qty,
        varianceReason: l.variance_reason || '', notes: l.notes || ''
      })));
      setActiveTab('count');
    } catch (err) { showToast(translateError(t, err), 'error'); }
  };

  const canAdjust = hasPermission('inventory:adjust');
  // Ctrl+N — new product on this screen (only for users who may create one).
  useShortcutAction('Ctrl+N', () => {
    if (!hasPermission('inventory:write')) {
      showToast(t('errors.FORBIDDEN'), 'error');
      return true;
    }
    setShowAddProductModal(true);
    return true;
  }, { order: 10 });

  // Ctrl+Shift+T — the shell asks for the stock-transfers tab.
  useEffect(() => {
    const onOpenTab = (event) => {
      if (event.detail === 'transfers') setActiveTab('transfers');
    };
    window.addEventListener('jenesis:open-tab', onOpenTab);
    return () => window.removeEventListener('jenesis:open-tab', onOpenTab);
  }, []);
  const canApprove = hasPermission('inventory:approve');
  const canManageStores = hasPermission('stores:manage');
  const canWriteStock = hasPermission('inventory:write');

  const tabBtn = (id, label) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-3 py-1.5 rounded-md transition whitespace-nowrap ${
        activeTab === id ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t('inventory.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('inventory.subtitle')}</p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium overflow-x-auto">
            {tabBtn('products', t('inventory.catalog'))}
            {tabBtn('stores', t('inventory.tab_stores'))}
            {tabBtn('transfers', t('inventory.tab_transfers'))}
            {canAdjust && tabBtn('adjust', t('inventory.adjust_stock'))}
            {tabBtn('count', t('inventory.physical_count'))}
            {tabBtn('movements', t('inventory.movements'))}
            {tabBtn('valuation', t('inventory.valuation'))}
          </div>

          <button
            onClick={() => {
              setEditingProduct(null);
              setProductForm({
                sku: '', barcode: '', name: '', description: '', category: 'General', type: 'GOODS',
                unit: 'pcs', cost_price: 0, selling_price: 0, min_stock_level: 5, current_stock: 0,
                warehouse_location: 'Main Store'
              });
              setShowAddProductModal(true);
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('inventory.add_product')}</span>
          </button>
        </div>
      </div>

      {/* 1. Products Catalog Tab */}
      {activeTab === 'products' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="relative w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={`${t('common.search')} (SKU / ${t('inventory.product_name')} / ${t('inventory.barcode')})`}
                value={search}
                data-j-search
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">{products.length} {t('inventory.products_listed')}</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('inventory.sku')}</th>
                  <th className="py-2.5 px-4">{t('inventory.product_name')}</th>
                  <th className="py-2.5 px-4">{t('inventory.category')}</th>
                  <th className="py-2.5 px-4 text-right">{t('inventory.cost_price')}</th>
                  <th className="py-2.5 px-4 text-right">{t('inventory.selling_price')}</th>
                  <th className="py-2.5 px-4 text-right">{t('inventory.current_stock')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-400">{t('common.loading')}</td></tr>
                ) : products.length > 0 ? (
                  products.map((p) => {
                    const isGoods = p.type === 'GOODS';
                    const isOut = isGoods && p.current_stock <= 0;
                    const isLow = isGoods && !isOut && p.current_stock <= p.min_stock_level;
                    return (
                      <tr key={p.id} data-j-row={p.id} className="hover:bg-slate-50 transition focus:bg-surface-hover outline-none" tabIndex={0}>
                        <td className="py-3 px-4 font-mono font-semibold text-blue-600">{p.sku}</td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          <div>{p.name}</div>
                          <div className="text-[10px] text-slate-400">{isGoods ? p.unit : t('inventory.service')}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-medium">{p.category}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">{formatCurrency(p.cost_price)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{formatCurrency(p.selling_price)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold">
                          {isGoods ? (
                            <span className={isOut ? 'text-rose-700' : isLow ? 'text-rose-600' : 'text-slate-800'}>
                              {p.current_stock} {p.unit}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">N/A</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {!isGoods ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-slate-100 text-slate-600">{t('inventory.service')}</span>
                          ) : isOut ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-rose-100 text-rose-800">
                              <AlertTriangle className="w-2.5 h-2.5" /><span>{t('inventory.out_of_stock')}</span>
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-100 text-amber-800">
                              <AlertTriangle className="w-2.5 h-2.5" /><span>{t('inventory.low_stock')}</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800">{t('inventory.normal_stock')}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center space-x-1">
                          {isGoods && (
                            <button
                              onClick={() => openStoreStock(p)}
                              title={t('inventory.view_stock')}
                              className="p-1 rounded text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => openEditProduct(p)}
                            title={t('common.edit')}
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-400">{t('common.no_data')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Stores Tab */}
      {activeTab === 'stores' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">{t('inventory.tab_stores')}</h2>
              {canManageStores && (
                <button
                  onClick={() => {
                    setEditingStore(null);
                    setStoreForm({ code: '', name: '', address: '', isDefault: false });
                    setShowStoreModal(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /><span>{t('inventory.add_store')}</span>
                </button>
              )}
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('common.code')}</th>
                  <th className="py-2.5 px-4">{t('common.name')}</th>
                  <th className="py-2.5 px-4">{t('inventory.store_address')}</th>
                  <th className="py-2.5 px-4 text-center">{t('inventory.default_store')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                  {canManageStores && <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {warehouses.length > 0 ? warehouses.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-700">{w.code}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">{w.name}</td>
                    <td className="py-2.5 px-4 text-slate-500">{w.address || '-'}</td>
                    <td className="py-2.5 px-4 text-center">{w.is_default ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : '—'}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${w.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                        {w.active ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    {canManageStores && (
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={() => {
                            setEditingStore(w);
                            setStoreForm({ code: w.code, name: w.name, address: w.address || '', isDefault: !!w.is_default, active: !!w.active });
                            setShowStoreModal(true);
                          }}
                          className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                          title={t('inventory.edit_store')}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400">{t('inventory.no_stores')}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Consolidated + per-store stock levels */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-slate-50">
              <h2 className="text-sm font-bold text-slate-800">{t('inventory.stock_by_store')}</h2>
              <p className="text-[11px] text-slate-500">{t('inventory.transfers.company_stock_note')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">{t('inventory.sku')}</th>
                    <th className="py-2.5 px-4">{t('inventory.product_name')}</th>
                    <th className="py-2.5 px-4">{t('inventory.movements_store')}</th>
                    <th className="py-2.5 px-4 text-right">{t('common.quantity')}</th>
                    <th className="py-2.5 px-4 text-right">{t('inventory.company_total_stock')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stockLevels.length > 0 ? stockLevels.map((s, i) => {
                    const prod = products.find((p) => p.id === s.product_id);
                    return (
                      <tr key={`${s.product_id}-${s.warehouse_id}-${i}`} className="hover:bg-slate-50">
                        <td className="py-2 px-4 font-mono text-slate-600">{s.sku}</td>
                        <td className="py-2 px-4 font-medium text-slate-800">{s.name}</td>
                        <td className="py-2 px-4 text-slate-600">{s.warehouse_name} <span className="text-slate-400 font-mono">({s.warehouse_code})</span></td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-slate-800">{s.quantity}</td>
                        <td className="py-2 px-4 text-right font-mono text-slate-500">{prod ? prod.current_stock : '—'}</td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-400">{t('common.no_data')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. Transfers Tab */}
      {activeTab === 'transfers' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">{t('inventory.tab_transfers')}</h2>
                <p className="text-[11px] text-slate-500">{t('inventory.transfers.dispatch_hint')}</p>
              </div>
              {canWriteStock && (
                <button
                  onClick={() => { addTransferLine(); setShowTransferModal(true); }}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /><span>{t('inventory.transfers.new_transfer')}</span>
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">{t('inventory.transfers.transfer_number')}</th>
                    <th className="py-2.5 px-4">{t('common.date')}</th>
                    <th className="py-2.5 px-4">{t('inventory.transfers.from_store')}</th>
                    <th className="py-2.5 px-4">{t('inventory.transfers.to_store')}</th>
                    <th className="py-2.5 px-4 text-right">{t('inventory.transfers.requested_qty')}</th>
                    <th className="py-2.5 px-4 text-right">{t('inventory.transfers.received_qty')}</th>
                    <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                    <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transfers.length > 0 ? transfers.map((tr) => (
                    <tr key={tr.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono font-bold text-blue-600">{tr.transfer_number}</td>
                      <td className="py-2.5 px-4 text-slate-600">{formatDate(tr.date)}</td>
                      <td className="py-2.5 px-4 text-slate-700">{tr.from_name || tr.from_warehouse_id}</td>
                      <td className="py-2.5 px-4 text-slate-700">{tr.to_name || tr.to_warehouse_id}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{tr.total_quantity}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{tr.received_quantity || 0}</td>
                      <td className="py-2.5 px-4 text-center"><StatusBadge status={tr.status} map={TRANSFER_STATUSES} /></td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          {tr.status === 'DRAFT' && canWriteStock && (
                            <>
                              <button onClick={() => dispatchTransfer(tr.id)} title={t('inventory.transfers.dispatch_transfer')}
                                className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50"><Send className="w-3.5 h-3.5" /></button>
                              <button onClick={() => cancelTransfer(tr.id)} title={t('inventory.transfers.cancel_transfer')}
                                className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50"><Ban className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                          {tr.status === 'DISPATCHED' && canWriteStock && (
                            <button onClick={() => openReceive(tr.id)} title={t('inventory.transfers.receive_transfer')}
                              className="p-1 rounded text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"><PackageCheck className="w-3.5 h-3.5" /></button>
                          )}
                          <button onClick={() => openReceive(tr.id)} title={t('common.view')}
                            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100"><Eye className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={8} className="py-8 text-center text-slate-400">{t('inventory.transfers.no_transfers')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. Stock Adjustment Tab */}
      {activeTab === 'adjust' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-2xl mx-auto">
          <div className="border-b border-slate-200 pb-4 mb-4">
            <h2 className="text-base font-bold text-slate-800">{t('inventory.adjust_stock')}</h2>
            <p className="text-xs text-slate-500">{t('inventory.workflow_hint')}</p>
          </div>

          <form onSubmit={handleAdjustmentSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('inventory.adjustment_store')} *</label>
                <select
                  required
                  value={adjForm.warehouseId}
                  onChange={(e) => setAdjForm({ ...adjForm, warehouseId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('inventory.product_name')} *</label>
                <select
                  required
                  value={adjForm.productId}
                  onChange={(e) => setAdjForm({ ...adjForm, productId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- {t('common.search')} --</option>
                  {products.filter((p) => p.type === 'GOODS').map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) — {systemQtyIn(p.id, adjForm.warehouseId)} {p.unit}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('inventory.qty_change')} *</label>
                <input
                  type="number" step="any" required
                  value={adjForm.quantityChange}
                  onChange={(e) => setAdjForm({ ...adjForm, quantityChange: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-400">− {t('inventory.reason_loss')} / + {t('inventory.reason_found')}</span>
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('inventory.reason')} *</label>
                <select
                  value={adjForm.reason}
                  onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="DAMAGED">{t('inventory.reason_damaged')}</option>
                  <option value="EXPIRED">{t('inventory.reason_expired')}</option>
                  <option value="LOSS">{t('inventory.reason_loss')}</option>
                  <option value="FOUND">{t('inventory.reason_found')}</option>
                  <option value="CORRECTION">{t('inventory.reason_correction')}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">{t('common.notes')}</label>
              <textarea
                rows={3}
                value={adjForm.notes}
                onChange={(e) => setAdjForm({ ...adjForm, notes: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="border-t border-slate-200 pt-4 flex justify-end space-x-2">
              <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold transition">
                {t('common.post_now')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. Physical Inventory Count Tab (workflow) */}
      {activeTab === 'count' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-4 print:hidden">
              <div>
                <h2 className="text-sm font-bold text-slate-800">
                  {editingCount ? `${t('inventory.revise_count')} — ${editingCount.count_number}` : t('inventory.physical_count')}
                </h2>
                <p className="text-[11px] text-slate-500">{t('inventory.workflow_hint')}</p>
              </div>
              <div className="flex items-center space-x-2">
                <select
                  value={countWarehouseId}
                  disabled={!!editingCount}
                  onChange={(e) => setCountWarehouseId(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
                {canAdjust && (
                  <button
                    onClick={saveCountDraft}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5"
                  >
                    <Save className="w-3.5 h-3.5" /><span>{t('inventory.save_draft')}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">{t('inventory.sku')}</th>
                    <th className="py-2.5 px-3">{t('inventory.product_name')}</th>
                    <th className="py-2.5 px-3 text-right">{t('inventory.system_qty')}</th>
                    <th className="py-2.5 px-3 text-right">{t('inventory.counted_qty')}</th>
                    <th className="py-2.5 px-3 text-right">{t('inventory.variance_qty')}</th>
                    <th className="py-2.5 px-3 text-right">{t('inventory.variance_val')}</th>
                    <th className="py-2.5 px-3">{t('inventory.variance_reason')}</th>
                    <th className="py-2.5 px-3">{t('common.notes')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {countLines.map((line, idx) => {
                    const varVal = line.variance_qty * (line.cost_price || 0);
                    const disabled = !canAdjust;
                    return (
                      <tr key={line.productId} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-semibold text-slate-700">{line.sku}</td>
                        <td className="py-2 px-3 font-medium text-slate-800">{line.name}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">{line.system_qty} {line.unit}</td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number" step="any" min="0" disabled={disabled}
                            value={line.counted_qty}
                            onChange={(e) => handleCountQtyChange(idx, e.target.value)}
                            className="w-24 text-right px-2 py-1 border border-slate-300 rounded font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          <span className={line.variance_qty === 0 ? 'text-slate-400' : line.variance_qty > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {line.variance_qty > 0 ? `+${line.variance_qty}` : line.variance_qty}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          <span className={varVal === 0 ? 'text-slate-400' : varVal > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {formatCurrency(varVal)}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <select
                            disabled={disabled || line.variance_qty === 0}
                            value={line.varianceReason || ''}
                            onChange={(e) => {
                              const updated = [...countLines];
                              updated[idx].varianceReason = e.target.value;
                              setCountLines(updated);
                            }}
                            className="w-32 px-1.5 py-1 border border-slate-300 rounded text-[11px] bg-white disabled:bg-slate-100"
                          >
                            <option value="">—</option>
                            <option value="MISSING">{t('inventory.reason_missing')}</option>
                            <option value="EXCESS">{t('inventory.reason_excess')}</option>
                            <option value="DAMAGED">{t('inventory.reason_damaged')}</option>
                            <option value="OTHER">{t('inventory.reason_other')}</option>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text" disabled={disabled}
                            value={line.notes || ''}
                            onChange={(e) => {
                              const updated = [...countLines];
                              updated[idx].notes = e.target.value;
                              setCountLines(updated);
                            }}
                            className="w-36 px-2 py-1 border border-slate-300 rounded text-[11px] disabled:bg-slate-100"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between print:hidden">
              <input
                type="text"
                placeholder={t('common.notes')}
                value={countNotes}
                disabled={!canAdjust}
                onChange={(e) => setCountNotes(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-md w-72 disabled:bg-slate-100"
              />
              {editingCount && canAdjust && (
                <button onClick={() => { setEditingCount(null); }} className="text-xs text-slate-500 hover:text-slate-800 flex items-center space-x-1">
                  <RotateCcw className="w-3.5 h-3.5" /><span>{t('common.cancel')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Counts history / workflow */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-slate-50">
              <h2 className="text-sm font-bold text-slate-800">{t('inventory.counts_history')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">{t('inventory.count_number')}</th>
                    <th className="py-2.5 px-4">{t('common.date')}</th>
                    <th className="py-2.5 px-4">{t('inventory.movements_store')}</th>
                    <th className="py-2.5 px-4">{t('inventory.counter')}</th>
                    <th className="py-2.5 px-4">{t('inventory.approved_by')}</th>
                    <th className="py-2.5 px-4 text-right">{t('inventory.variance_qty')}</th>
                    <th className="py-2.5 px-4 text-right">{t('inventory.variance_val')}</th>
                    <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                    <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {counts.length > 0 ? counts.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono font-bold text-blue-600">{c.count_number}</td>
                      <td className="py-2.5 px-4 text-slate-600">{formatDate(c.date)}</td>
                      <td className="py-2.5 px-4 text-slate-700">{c.warehouse_name || c.location}</td>
                      <td className="py-2.5 px-4 text-slate-600">{c.created_by_name || '—'}</td>
                      <td className="py-2.5 px-4 text-slate-600">{c.approved_by_name || '—'}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{c.total_variance_qty}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(c.total_variance_val)}</td>
                      <td className="py-2.5 px-4 text-center"><StatusBadge status={c.status} map={COUNT_STATUSES} /></td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button onClick={() => setShowCountSheet(c)} title={t('inventory.print_count_sheet')}
                            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100"><Printer className="w-3.5 h-3.5" /></button>
                          {(c.status === 'DRAFT' || c.status === 'REJECTED') && canAdjust && (
                            <>
                              <button onClick={() => reviseCount(c)} title={t('inventory.revise_count')}
                                className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50"><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => countAction(c.id, 'submit')} title={t('inventory.submit_for_review')}
                                className="p-1 rounded text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"><Send className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                          {c.status === 'SUBMITTED' && canApprove && (
                            <>
                              <button onClick={() => countAction(c.id, 'approve')} title={t('inventory.approve_count')}
                                className="p-1 rounded text-emerald-600 hover:bg-emerald-50"><CheckCircle2 className="w-4 h-4" /></button>
                              <button onClick={() => { setRejectFor(c); setRejectReason(''); }} title={t('inventory.reject_count')}
                                className="p-1 rounded text-rose-600 hover:bg-rose-50"><XCircle className="w-4 h-4" /></button>
                            </>
                          )}
                          {c.status === 'APPROVED' && canApprove && (
                            <button onClick={() => countAction(c.id, 'post')} title={t('inventory.post_approved_count')}
                              className="p-1 rounded text-indigo-600 hover:bg-indigo-50"><Package className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={9} className="py-8 text-center text-slate-400">{t('inventory.no_counts')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. Movements Tab */}
      {activeTab === 'movements' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">{t('inventory.movements')}</h2>
              <p className="text-[11px] text-slate-500">{t('inventory.subtitle')}</p>
            </div>
            <select
              value={movementWarehouse}
              onChange={(e) => setMovementWarehouse(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value="">{t('inventory.all_stores')}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('common.date')}</th>
                  <th className="py-2.5 px-4">{t('inventory.product_name')}</th>
                  <th className="py-2.5 px-4">{t('inventory.movements_store')}</th>
                  <th className="py-2.5 px-4">{t('common.type')}</th>
                  <th className="py-2.5 px-4">{t('common.reference')}</th>
                  <th className="py-2.5 px-4 text-right">{t('common.quantity')}</th>
                  <th className="py-2.5 px-4 text-right">{t('inventory.cost_price')}</th>
                  <th className="py-2.5 px-4 text-right">{t('common.total')}</th>
                  <th className="py-2.5 px-4 text-right">{t('inventory.current_stock')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements && movements.length > 0 ? (
                  movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 text-slate-600">{m.date}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">{m.product_name} ({m.product_sku})</td>
                      <td className="py-2.5 px-4 text-slate-600">{m.warehouse_name || '—'}</td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                          {m.movement_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">{m.reference_number || '-'}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold">
                        <span className={m.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-600">{formatCurrency(m.unit_cost)}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-medium text-slate-800">{formatCurrency(m.total_cost)}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">{m.stock_after}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={9} className="py-8 text-center text-slate-400">{t('common.no_data')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. Valuation Tab */}
      {activeTab === 'valuation' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium uppercase">{t('inventory.total_cost_val')}</div>
              <div className="text-xl font-black text-slate-900 font-mono mt-1">{formatCurrency(valuation?.totalCostValue || 0)}</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium uppercase">{t('inventory.total_retail_val')}</div>
              <div className="text-xl font-black text-blue-700 font-mono mt-1">{formatCurrency(valuation?.totalRetailValue || 0)}</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium uppercase">{t('inventory.projected_margin')}</div>
              <div className="text-xl font-black text-emerald-600 font-mono mt-1">{formatCurrency(valuation?.potentialProfit || 0)}</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium uppercase">{t('settings.valuation_method')}</div>
              <div className="text-xl font-black text-slate-900 mt-1">
                {(currentCompany?.inventory_valuation_method || 'WEIGHTED_AVERAGE') === 'FIFO' ? t('settings.fifo') : t('settings.weighted_average')}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('inventory.sku')}</th>
                  <th className="py-2.5 px-4">{t('inventory.product_name')}</th>
                  <th className="py-2.5 px-4">{t('inventory.category')}</th>
                  <th className="py-2.5 px-4 text-right">{t('inventory.current_stock')}</th>
                  <th className="py-2.5 px-4 text-right">{t('inventory.cost_price')}</th>
                  <th className="py-2.5 px-4 text-right">{t('inventory.selling_price')}</th>
                  <th className="py-2.5 px-4 text-right">{t('inventory.total_cost_val')}</th>
                  <th className="py-2.5 px-4 text-right">{t('inventory.total_retail_val')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {valuation?.products && valuation.products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-700">{p.sku}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">{p.name}</td>
                    <td className="py-2.5 px-4 text-slate-600">{p.category}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-800">{p.current_stock} {p.unit}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-600">{formatCurrency(p.cost_price)}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-700">{formatCurrency(p.selling_price)}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">{formatCurrency(p.total_cost_value)}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-700">{formatCurrency(p.total_retail_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Product Add/Edit Modal */}
      {showAddProductModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">{editingProduct ? t('common.edit') : t('inventory.add_product')}</h3>
              <button onClick={() => setShowAddProductModal(false)} className="text-slate-400 hover:text-white p-1 rounded transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleProductSubmit} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.sku')} *</label>
                  <input type="text" required value={productForm.sku}
                    onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.barcode')}</label>
                  <input type="text" value={productForm.barcode}
                    onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('inventory.product_name')} *</label>
                <input type="text" required value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.category')}</label>
                  <input type="text" value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.product_type')}</label>
                  <select value={productForm.type}
                    onChange={(e) => setProductForm({ ...productForm, type: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="GOODS">{t('inventory.physical_goods')}</option>
                    <option value="SERVICE">{t('inventory.service')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.unit')}</label>
                  <input type="text" value={productForm.unit}
                    onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.cost_price')} *</label>
                  <input type="number" step="0.01" required value={productForm.cost_price}
                    onChange={(e) => setProductForm({ ...productForm, cost_price: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.selling_price')} *</label>
                  <input type="number" step="0.01" required value={productForm.selling_price}
                    onChange={(e) => setProductForm({ ...productForm, selling_price: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.min_stock')}</label>
                  <input type="number" value={productForm.min_stock_level}
                    onChange={(e) => setProductForm({ ...productForm, min_stock_level: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.warehouse_location')}</label>
                  <input type="text" value={productForm.warehouse_location}
                    onChange={(e) => setProductForm({ ...productForm, warehouse_location: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>

              {!editingProduct && productForm.type === 'GOODS' && (
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.current_stock')}</label>
                  <input type="number" step="any" min="0" value={productForm.current_stock}
                    onChange={(e) => setProductForm({ ...productForm, current_stock: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <p className="text-[10px] text-slate-400 mt-1">{t('inventory.opening_stock_hint')}</p>
                </div>
              )}

              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button type="button" onClick={() => setShowAddProductModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition font-medium">
                  {t('common.cancel')}
                </button>
                <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition font-semibold">
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Store Add/Edit Modal */}
      {showStoreModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">{editingStore ? t('inventory.edit_store') : t('inventory.add_store')}</h3>
              <button onClick={() => setShowStoreModal(false)} className="text-slate-400 hover:text-white p-1 rounded"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleStoreSubmit} className="p-5 space-y-3.5 text-xs">
              {!editingStore && (
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.store_code')} *</label>
                  <input type="text" required value={storeForm.code}
                    onChange={(e) => setStoreForm({ ...storeForm, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              )}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('inventory.store_name')} *</label>
                <input type="text" required value={storeForm.name}
                  onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('inventory.store_address')}</label>
                <input type="text" value={storeForm.address}
                  onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <label className="flex items-center space-x-2">
                <input type="checkbox" checked={!!storeForm.isDefault}
                  onChange={(e) => setStoreForm({ ...storeForm, isDefault: e.target.checked })}
                  className="rounded border-slate-300" />
                <span className="text-slate-700 font-medium">{t('inventory.default_store')}</span>
              </label>
              {editingStore && (
                <label className="flex items-center space-x-2">
                  <input type="checkbox" checked={storeForm.active !== false}
                    onChange={(e) => setStoreForm({ ...storeForm, active: e.target.checked })}
                    className="rounded border-slate-300" />
                  <span className="text-slate-700 font-medium">{t('common.active')}</span>
                </label>
              )}
              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button type="button" onClick={() => setShowStoreModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 font-medium">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold">{t('common.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Per-store stock modal */}
      {storeStockFor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">{t('inventory.stock_by_store')} — {storeStockFor.product.name}</h3>
              <button onClick={() => setStoreStockFor(null)} className="text-slate-400 hover:text-white p-1 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 text-xs space-y-2">
              {storeStockFor.stores.map((s) => (
                <div key={s.warehouse_id} className="flex items-center justify-between border border-slate-100 rounded-md px-3 py-2">
                  <span className="font-medium text-slate-700">{s.name} <span className="font-mono text-slate-400">({s.code})</span></span>
                  <span className="font-mono font-bold text-slate-900">{s.quantity} {storeStockFor.product.unit}</span>
                </div>
              ))}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-md px-3 py-2 font-bold">
                <span>{t('inventory.company_total_stock')}</span>
                <span className="font-mono">{storeStockFor.companyStock} {storeStockFor.product.unit}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <ArrowLeftRight className="w-4 h-4 text-blue-400" /><span>{t('inventory.transfers.new_transfer')}</span>
              </h3>
              <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-white p-1 rounded"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleTransferSubmit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.transfers.from_store')} *</label>
                  <select required value={transferForm.fromWarehouseId}
                    onChange={(e) => setTransferForm({ ...transferForm, fromWarehouseId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white">
                    <option value="">—</option>
                    {warehouses.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.transfers.to_store')} *</label>
                  <select required value={transferForm.toWarehouseId}
                    onChange={(e) => setTransferForm({ ...transferForm, toWarehouseId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white">
                    <option value="">—</option>
                    {warehouses.filter((w) => w.active && w.id !== transferForm.fromWarehouseId).map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                {transferForm.lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_110px_32px] gap-2 items-center">
                    <select required value={line.productId}
                      onChange={(e) => {
                        const lines = [...transferForm.lines];
                        lines[idx].productId = e.target.value;
                        setTransferForm({ ...transferForm, lines });
                      }}
                      className="px-2 py-1.5 border border-slate-300 rounded-md bg-white">
                      <option value="">— {t('inventory.product_name')} —</option>
                      {products.filter((p) => p.type === 'GOODS').map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku}) — {transferForm.fromWarehouseId ? systemQtyIn(p.id, transferForm.fromWarehouseId) : p.current_stock} {p.unit}
                        </option>
                      ))}
                    </select>
                    <input type="number" step="any" min="0.0001" required value={line.quantity}
                      onChange={(e) => {
                        const lines = [...transferForm.lines];
                        lines[idx].quantity = Number(e.target.value);
                        setTransferForm({ ...transferForm, lines });
                      }}
                      className="px-2 py-1.5 border border-slate-300 rounded-md text-right font-mono" />
                    <button type="button"
                      onClick={() => setTransferForm({ ...transferForm, lines: transferForm.lines.filter((_, i) => i !== idx) })}
                      className="p-1.5 rounded text-rose-500 hover:bg-rose-50"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button type="button" onClick={addTransferLine}
                  className="text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1">
                  <Plus className="w-3.5 h-3.5" /><span>{t('inventory.transfers.add_transfer_line')}</span>
                </button>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('common.notes')}</label>
                <input type="text" value={transferForm.notes}
                  onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md" />
              </div>

              <p className="text-[10px] text-slate-400">{t('inventory.transfers.company_stock_note')}</p>

              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button type="button" onClick={() => setShowTransferModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 font-medium">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold">{t('common.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive / view transfer modal */}
      {receiveFor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Truck className="w-4 h-4 text-amber-400" />
                <span>{receiveFor.transfer_number}</span>
                <StatusBadge status={receiveFor.status} map={TRANSFER_STATUSES} />
              </h3>
              <button onClick={() => setReceiveFor(null)} className="text-slate-400 hover:text-white p-1 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 text-xs space-y-3">
              <div className="flex justify-between text-slate-600">
                <span>{receiveFor.from_name} → {receiveFor.to_name}</span>
                <span>{formatDate(receiveFor.date)}</span>
              </div>
              {receiveFor.status === 'DISPATCHED' && canWriteStock && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  {t('inventory.transfers.partial_hint')} {t('inventory.transfers.receive_lines_hint')}
                </p>
              )}
              <table className="w-full text-left">
                <thead className="text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2">{t('inventory.product_name')}</th>
                    <th className="py-2 text-right">{t('inventory.transfers.requested_qty')}</th>
                    <th className="py-2 text-right">{t('inventory.transfers.received_qty')}</th>
                    {receiveFor.status === 'DISPATCHED' && canWriteStock && <th className="py-2 text-right">{t('inventory.transfers.receive_transfer')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receiveFor.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 font-medium text-slate-800">{l.product_name} <span className="font-mono text-slate-400">({l.sku})</span></td>
                      <td className="py-2 text-right font-mono">{l.quantity}</td>
                      <td className="py-2 text-right font-mono">{l.received_quantity || 0}</td>
                      {receiveFor.status === 'DISPATCHED' && canWriteStock && (
                        <td className="py-2 text-right">
                          <input type="number" step="any" min="0"
                            value={receiveFor.receiveQty[l.id] ?? 0}
                            onChange={(e) => setReceiveFor({ ...receiveFor, receiveQty: { ...receiveFor.receiveQty, [l.id]: Number(e.target.value) } })}
                            className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-mono" />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button onClick={() => setReceiveFor(null)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 font-medium">{t('common.close')}</button>
                {receiveFor.status === 'DISPATCHED' && canWriteStock && (
                  <button onClick={submitReceive}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-semibold">
                    {t('inventory.transfers.receive_transfer')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject count modal */}
      {rejectFor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">{t('inventory.reject_count')} — {rejectFor.count_number}</h3>
              <button onClick={() => setRejectFor(null)} className="text-slate-400 hover:text-white p-1 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 text-xs space-y-3">
              <label className="block text-slate-600 font-semibold">{t('inventory.rejection_reason')} *</label>
              <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md" />
              <div className="flex justify-end space-x-2">
                <button onClick={() => setRejectFor(null)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 font-medium">{t('common.cancel')}</button>
                <button onClick={() => countAction(rejectFor.id, 'reject', { reason: rejectReason })}
                  disabled={!rejectReason.trim()}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-md font-semibold disabled:opacity-40">
                  {t('inventory.reject_count')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printable count sheet */}
      {showCountSheet && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-xl shadow-2xl max-w-3xl w-full my-8 overflow-hidden print:m-0 print:p-0 print:shadow-none">
            <div className="bg-slate-800 text-white px-6 py-3 flex items-center justify-between print:hidden">
              <div className="font-semibold text-sm flex items-center space-x-2">
                <span>{t('inventory.print_count_sheet')}</span>
                <span className="text-blue-400 font-mono">#{showCountSheet.count_number}</span>
              </div>
              <div className="flex items-center space-x-2">
                <button onClick={() => window.print()}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center space-x-1.5">
                  <Printer className="w-3.5 h-3.5" /><span>{t('common.print')}</span>
                </button>
                <button onClick={() => setShowCountSheet(null)} className="text-slate-400 hover:text-white p-1 rounded"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div id="printable-area" className="p-8 text-slate-800 bg-white">
              <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-4">
                <div>
                  <h1 className="text-lg font-bold">{currentCompany?.name}</h1>
                  <p className="text-xs text-slate-500">{currentCompany?.address}</p>
                </div>
                <div className="text-right">
                  <h2 className="text-base font-black uppercase tracking-wide">{t('inventory.count_sheet_title')}</h2>
                  <p className="text-xs font-mono">#{showCountSheet.count_number}</p>
                  <p className="text-xs">{t('inventory.count_date')}: {formatDate(showCountSheet.date)}</p>
                  <p className="text-xs">{t('inventory.movements_store')}: {showCountSheet.warehouse_name || showCountSheet.location}</p>
                </div>
              </div>
              <CountSheetLines countId={showCountSheet.id} />
              <div className="mt-6 grid grid-cols-3 gap-6 text-xs">
                <div className="border-t border-slate-400 pt-1">{t('inventory.counted_by')}: {showCountSheet.created_by_name || '—'}</div>
                <div className="border-t border-slate-400 pt-1">{t('inventory.submitted_by')}: {showCountSheet.submitted_by_name || '—'}</div>
                <div className="border-t border-slate-400 pt-1">{t('inventory.approved_by')}: {showCountSheet.approved_by_name || '—'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Loads the lines of one count for the printable sheet. */
function CountSheetLines({ countId }) {
  const { t } = useI18n();
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    let alive = true;
    apiRequest(`/api/inventory/counts/${countId}`)
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => { /* the sheet stays empty */ });
    return () => { alive = false; };
  }, [countId]);

  if (!detail) return <div className="text-xs text-slate-400">{t('common.loading')}</div>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-slate-400 uppercase text-[10px]">
          <th className="py-1.5 text-left">{t('inventory.sku')}</th>
          <th className="py-1.5 text-left">{t('inventory.product_name')}</th>
          <th className="py-1.5 text-right">{t('inventory.system_qty')}</th>
          <th className="py-1.5 text-right">{t('inventory.counted_qty')}</th>
          <th className="py-1.5 text-right">{t('inventory.variance_qty')}</th>
          <th className="py-1.5 text-left">{t('inventory.variance_reason')}</th>
          <th className="py-1.5 text-left">{t('common.notes')}</th>
        </tr>
      </thead>
      <tbody>
        {detail.lines.map((l) => (
          <tr key={l.id} className="border-b border-slate-200">
            <td className="py-1.5 font-mono">{l.sku}</td>
            <td className="py-1.5">{l.product_name}</td>
            <td className="py-1.5 text-right font-mono">{l.system_qty}</td>
            <td className="py-1.5 text-right font-mono font-bold">{l.counted_qty}</td>
            <td className="py-1.5 text-right font-mono">{l.variance_qty > 0 ? `+${l.variance_qty}` : l.variance_qty}</td>
            <td className="py-1.5">{l.variance_reason || '—'}</td>
            <td className="py-1.5">{l.notes || ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
