import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../services/api';
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
  FileSpreadsheet
} from 'lucide-react';

export default function InventoryView() {
  const { currentCompany, formatCurrency, showToast, refreshKey } = useApp();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState('products'); // 'products', 'adjust', 'count', 'movements', 'valuation'
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [valuation, setValuation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Product Form
  const [productForm, setProductForm] = useState({
    sku: '',
    barcode: '',
    name: '',
    description: '',
    category: 'General',
    type: 'GOODS',
    unit: 'pcs',
    cost_price: 0,
    selling_price: 0,
    min_stock_level: 5,
    current_stock: 0,
    warehouse_location: 'Main Store'
  });

  // Stock Adjustment Form
  const [adjForm, setAdjForm] = useState({
    productId: '',
    quantityChange: 0,
    reason: 'DAMAGED',
    notes: ''
  });

  // Physical Count Lines
  const [countLines, setCountLines] = useState([]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`/api/products?search=${encodeURIComponent(search)}`);
      setProducts(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchMovements = async () => {
    try {
      const data = await apiRequest('/api/inventory/movements');
      setMovements(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchValuation = async () => {
    try {
      const data = await apiRequest('/api/inventory/valuation');
      setValuation(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'products') fetchProducts();
    else if (activeTab === 'movements') fetchMovements();
    else if (activeTab === 'valuation') fetchValuation();
    else if (activeTab === 'count') {
      fetchProducts();
    }
  }, [currentCompany?.id, search, activeTab, refreshKey]);

  useEffect(() => {
    if (activeTab === 'count' && products.length > 0) {
      const physicalItems = products.filter((p) => p.type === 'GOODS');
      setCountLines(
        physicalItems.map((p) => ({
          productId: p.id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          cost_price: p.cost_price,
          system_qty: p.current_stock,
          counted_qty: p.current_stock,
          variance_qty: 0,
          notes: ''
        }))
      );
    }
  }, [activeTab, products]);

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await apiRequest(`/api/products/${editingProduct.id}`, {
          method: 'PUT',
          body: JSON.stringify(productForm)
        });
        showToast('Product updated successfully', 'success');
      } else {
        await apiRequest('/api/products', {
          method: 'POST',
          body: JSON.stringify(productForm)
        });
        showToast('Product created successfully', 'success');
      }
      setShowAddProductModal(false);
      setEditingProduct(null);
      fetchProducts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAdjustmentSubmit = async (e) => {
    e.preventDefault();
    if (!adjForm.productId || adjForm.quantityChange === 0) {
      return showToast('Please select a product and enter a non-zero quantity change', 'error');
    }

    try {
      await apiRequest('/api/inventory/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          reason: adjForm.reason,
          notes: adjForm.notes,
          lines: [{ productId: adjForm.productId, quantityChange: adjForm.quantityChange }]
        })
      });
      showToast('Stock adjustment posted and general ledger updated', 'success');
      setAdjForm({ productId: '', quantityChange: 0, reason: 'DAMAGED', notes: '' });
      fetchProducts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCountQtyChange = (idx, newCounted) => {
    const updated = [...countLines];
    const item = updated[idx];
    const val = Number(newCounted) || 0;
    item.counted_qty = val;
    item.variance_qty = val - item.system_qty;
    setCountLines(updated);
  };

  const handlePostPhysicalCount = async () => {
    try {
      const payload = {
        location: 'Main Store',
        notes: 'Physical inventory audit count',
        lines: countLines.map((l) => ({
          productId: l.productId,
          countedQty: l.counted_qty,
          notes: l.notes
        }))
      };

      const res = await apiRequest('/api/inventory/counts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      showToast(`Physical count ${res.countNumber} posted! Variance reconciled to General Ledger.`, 'success');
      setActiveTab('products');
      fetchProducts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openEditProduct = (prod) => {
    setEditingProduct(prod);
    setProductForm({
      sku: prod.sku,
      barcode: prod.barcode || '',
      name: prod.name,
      description: prod.description || '',
      category: prod.category || 'General',
      type: prod.type || 'GOODS',
      unit: prod.unit || 'pcs',
      cost_price: prod.cost_price || 0,
      selling_price: prod.selling_price || 0,
      min_stock_level: prod.min_stock_level || 5,
      current_stock: prod.current_stock || 0,
      warehouse_location: prod.warehouse_location || 'Main Store'
    });
    setShowAddProductModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t('inventory.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('inventory.subtitle')}</p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setActiveTab('products')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'products' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Catalog
            </button>
            <button
              onClick={() => setActiveTab('adjust')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'adjust' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('inventory.adjust_stock')}
            </button>
            <button
              onClick={() => setActiveTab('count')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'count' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('inventory.physical_count')}
            </button>
            <button
              onClick={() => setActiveTab('movements')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'movements' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('inventory.movements')}
            </button>
            <button
              onClick={() => setActiveTab('valuation')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'valuation' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('inventory.valuation')}
            </button>
          </div>

          <button
            onClick={() => {
              setEditingProduct(null);
              setProductForm({
                sku: '',
                barcode: '',
                name: '',
                description: '',
                category: 'General',
                type: 'GOODS',
                unit: 'pcs',
                cost_price: 0,
                selling_price: 0,
                min_stock_level: 5,
                current_stock: 0,
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
                placeholder={t('common.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">{products.length} products listed</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('inventory.sku')}</th>
                  <th className="py-2.5 px-4">{t('inventory.product_name')}</th>
                  <th className="py-2.5 px-4">{t('inventory.category')}</th>
                  <th className="py-2.5 px-4">{t('inventory.warehouse_location')}</th>
                  <th className="py-2.5 px-4 text-right">{t('inventory.cost_price')}</th>
                  <th className="py-2.5 px-4 text-right">{t('inventory.selling_price')}</th>
                  <th className="py-2.5 px-4 text-right">{t('inventory.current_stock')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : products.length > 0 ? (
                  products.map((p) => {
                    const isLow = p.type === 'GOODS' && p.current_stock <= p.min_stock_level;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 font-mono font-semibold text-blue-600">{p.sku}</td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          <div>{p.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {p.type === 'SERVICE' ? 'Service' : `${p.unit}`}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-medium">{p.category}</td>
                        <td className="py-3 px-4 text-slate-500">{p.warehouse_location || '-'}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">
                          {formatCurrency(p.cost_price)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(p.selling_price)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold">
                          {p.type === 'GOODS' ? (
                            <span className={isLow ? 'text-rose-600' : 'text-slate-800'}>
                              {p.current_stock} {p.unit}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">N/A</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isLow ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-100 text-amber-800">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              <span>Low Stock</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800">
                              Normal
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
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
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      {t('common.no_data')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Stock Adjustment Tab */}
      {activeTab === 'adjust' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-2xl mx-auto">
          <div className="border-b border-slate-200 pb-4 mb-4">
            <h2 className="text-base font-bold text-slate-800">{t('inventory.adjust_stock')}</h2>
            <p className="text-xs text-slate-500">
              Record inventory shrinkage, damaged goods, or found surplus stock. Automatically creates a balanced double-entry
              journal entry.
            </p>
          </div>

          <form onSubmit={handleAdjustmentSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Select Merchandise Product *</label>
              <select
                required
                value={adjForm.productId}
                onChange={(e) => setAdjForm({ ...adjForm, productId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">-- Choose Product --</option>
                {products
                  .filter((p) => p.type === 'GOODS')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (SKU: {p.sku}) — Current Stock: {p.current_stock} {p.unit}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  {t('inventory.qty_change')} *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={adjForm.quantityChange}
                  onChange={(e) => setAdjForm({ ...adjForm, quantityChange: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. -2 for damage, +5 for found"
                />
                <span className="text-[10px] text-slate-400">Use negative number for loss, positive for found</span>
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
                placeholder="Audit notes describing the circumstance..."
              />
            </div>

            <div className="border-t border-slate-200 pt-4 flex justify-end space-x-2">
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold transition"
              >
                {t('common.post_now')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Physical Inventory Count Tab */}
      {activeTab === 'count' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">{t('inventory.physical_count')}</h2>
              <p className="text-[11px] text-slate-500">
                Enter actual physical count numbers to calculate variance and automatically post reconciliation journal entries.
              </p>
            </div>
            <button
              onClick={handlePostPhysicalCount}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow transition self-start sm:self-auto"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t('inventory.post_count')}</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3 text-right">{t('inventory.system_qty')}</th>
                  <th className="py-2.5 px-3 text-right">{t('inventory.counted_qty')}</th>
                  <th className="py-2.5 px-3 text-right">{t('inventory.variance_qty')}</th>
                  <th className="py-2.5 px-3 text-right">{t('inventory.variance_val')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {countLines.map((line, idx) => {
                  const varVal = line.variance_qty * (line.cost_price || 0);
                  return (
                    <tr key={line.productId} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-semibold text-slate-700">{line.sku}</td>
                      <td className="py-2 px-3 font-medium text-slate-800">{line.name}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600">
                        {line.system_qty} {line.unit}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="any"
                          value={line.counted_qty}
                          onChange={(e) => handleCountQtyChange(idx, e.target.value)}
                          className="w-24 text-right px-2 py-1 border border-slate-300 rounded font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold">
                        <span
                          className={
                            line.variance_qty === 0
                              ? 'text-slate-400'
                              : line.variance_qty > 0
                              ? 'text-emerald-600'
                              : 'text-rose-600'
                          }
                        >
                          {line.variance_qty > 0 ? `+${line.variance_qty}` : line.variance_qty}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold">
                        <span
                          className={
                            varVal === 0 ? 'text-slate-400' : varVal > 0 ? 'text-emerald-600' : 'text-rose-600'
                          }
                        >
                          {formatCurrency(varVal)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Movements Tab */}
      {activeTab === 'movements' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-bold text-slate-800">{t('inventory.movements')}</h2>
            <p className="text-[11px] text-slate-500">Immutable ledger of all stock inputs, sales, and corrections</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('common.date')}</th>
                  <th className="py-2.5 px-4">Product</th>
                  <th className="py-2.5 px-4">{t('common.type')}</th>
                  <th className="py-2.5 px-4">{t('common.reference')}</th>
                  <th className="py-2.5 px-4 text-right">{t('common.quantity')}</th>
                  <th className="py-2.5 px-4 text-right">{t('inventory.cost_price')}</th>
                  <th className="py-2.5 px-4 text-right">Total Cost</th>
                  <th className="py-2.5 px-4 text-right">Stock After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements && movements.length > 0 ? (
                  movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 text-slate-600">{m.date}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">
                        {m.product_name} ({m.product_sku})
                      </td>
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
                      <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                        {formatCurrency(m.unit_cost)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-medium text-slate-800">
                        {formatCurrency(m.total_cost)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">{m.stock_after}</td>
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
      )}

      {/* 5. Valuation Tab */}
      {activeTab === 'valuation' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium uppercase">{t('inventory.total_cost_val')}</div>
              <div className="text-xl font-black text-slate-900 font-mono mt-1">
                {formatCurrency(valuation?.totalCostValue || 0)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium uppercase">{t('inventory.total_retail_val')}</div>
              <div className="text-xl font-black text-blue-700 font-mono mt-1">
                {formatCurrency(valuation?.totalRetailValue || 0)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium uppercase">{t('inventory.projected_margin')}</div>
              <div className="text-xl font-black text-emerald-600 font-mono mt-1">
                {formatCurrency(valuation?.potentialProfit || 0)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium uppercase">Total Physical Units</div>
              <div className="text-xl font-black text-slate-900 font-mono mt-1">
                {valuation?.totalUnits || 0}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">SKU</th>
                  <th className="py-2.5 px-4">Product Name</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4 text-right">In Stock Qty</th>
                  <th className="py-2.5 px-4 text-right">Unit Cost</th>
                  <th className="py-2.5 px-4 text-right">Selling Price</th>
                  <th className="py-2.5 px-4 text-right">Total Asset Cost</th>
                  <th className="py-2.5 px-4 text-right">Total Retail Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {valuation?.products &&
                  valuation.products.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-700">{p.sku}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">{p.name}</td>
                      <td className="py-2.5 px-4 text-slate-600">{p.category}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-800">
                        {p.current_stock} {p.unit}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                        {formatCurrency(p.cost_price)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-700">
                        {formatCurrency(p.selling_price)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(p.total_cost_value)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-700">
                        {formatCurrency(p.total_retail_value)}
                      </td>
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
              <h3 className="font-bold text-sm">
                {editingProduct ? t('common.edit') : t('inventory.add_product')}
              </h3>
              <button
                onClick={() => setShowAddProductModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleProductSubmit} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.sku')} *</label>
                  <input
                    type="text"
                    required
                    value={productForm.sku}
                    onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="e.g. ITM-001"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.barcode')}</label>
                  <input
                    type="text"
                    value={productForm.barcode}
                    onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">{t('inventory.product_name')} *</label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.category')}</label>
                  <input
                    type="text"
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.product_type')}</label>
                  <select
                    value={productForm.type}
                    onChange={(e) => setProductForm({ ...productForm, type: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="GOODS">{t('inventory.physical_goods')}</option>
                    <option value="SERVICE">{t('inventory.service')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.unit')}</label>
                  <input
                    type="text"
                    value={productForm.unit}
                    onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="pcs, kg, box"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.cost_price')} *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={productForm.cost_price}
                    onChange={(e) => setProductForm({ ...productForm, cost_price: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.selling_price')} *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={productForm.selling_price}
                    onChange={(e) => setProductForm({ ...productForm, selling_price: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">{t('inventory.min_stock')}</label>
                  <input
                    type="number"
                    value={productForm.min_stock_level}
                    onChange={(e) => setProductForm({ ...productForm, min_stock_level: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    {t('inventory.warehouse_location')}
                  </label>
                  <input
                    type="text"
                    value={productForm.warehouse_location}
                    onChange={(e) => setProductForm({ ...productForm, warehouse_location: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
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
