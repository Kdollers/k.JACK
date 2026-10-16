import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../services/api';

export default function SellerCatalog() {
  const { currentCompany, refreshKey, formatCurrency, showToast } = useApp();
  const { t } = useI18n();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  useEffect(() => {
    let active = true;
    apiRequest(`/api/products?search=${encodeURIComponent(search)}`)
      .then((rows) => { if (active) setProducts(rows.filter((row) => row.active)); })
      .catch((err) => { if (active) showToast(err, 'error'); });
    return () => { active = false; };
  }, [search, currentCompany?.id, refreshKey]);
  return <section className="space-y-4">
    <div>
      <h1 className="text-xl font-bold">{t('seller.catalog_title')}</h1>
      <p className="text-xs text-slate-500">{t('seller.catalog_help')}</p>
    </div>
    <input value={search} onChange={(e) => setSearch(e.target.value)}
      placeholder={t('common.search')} aria-label={t('common.search')}
      className="w-full max-w-sm border border-slate-300 rounded-lg px-3 py-2 text-sm" />
    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-red-50 text-slate-700"><tr>
          <th className="px-4 py-3">{t('inventory.sku')}</th>
          <th className="px-4 py-3">{t('inventory.product_name')}</th>
          <th className="px-4 py-3">{t('inventory.current_stock')}</th>
          <th className="px-4 py-3">{t('inventory.selling_price')}</th>
        </tr></thead>
        <tbody>{products.length ? products.map((p) => <tr key={p.id} className="border-t border-slate-100">
          <td className="px-4 py-3 font-mono">{p.sku}</td>
          <td className="px-4 py-3">{p.name}</td>
          <td className="px-4 py-3">{p.type === 'SERVICE' ? t('inventory.not_applicable') : `${p.current_stock} ${p.unit}`}</td>
          <td className="px-4 py-3 font-semibold">{formatCurrency(p.selling_price)}</td>
        </tr>) : <tr><td colSpan="4" className="text-center p-8 text-slate-500">{t('common.no_data')}</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}
