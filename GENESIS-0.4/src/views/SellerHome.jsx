import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../services/api';
import { ShoppingCart, Users, PackageSearch, ReceiptText } from 'lucide-react';

export default function SellerHome() {
  const { currentCompany, refreshKey, formatCurrency, showToast, setActiveView } = useApp();
  const { t } = useI18n();
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let active = true;
    apiRequest('/api/seller/overview').then((data) => { if (active) setStats(data); })
      .catch((err) => { if (active) showToast(err, 'error'); });
    return () => { active = false; };
  }, [currentCompany?.id, refreshKey]);
  const cards = [
    { label: t('seller.today_invoices'), value: stats?.invoices ?? '—', icon: ReceiptText },
    { label: t('seller.today_sales'), value: stats ? formatCurrency(stats.sales_total) : '—', icon: ShoppingCart },
    { label: t('seller.active_customers'), value: stats?.customers ?? '—', icon: Users },
    { label: t('seller.low_stock'), value: stats?.low_stock ?? '—', icon: PackageSearch }
  ];
  return <div className="space-y-6">
    <div className="border-b border-red-100 pb-4">
      <h1 className="text-2xl font-bold text-slate-900">{t('seller.title')}</h1>
      <p className="text-sm text-slate-600">{t('seller.subtitle')}</p>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon }) => <div key={label}
        className="bg-white rounded-xl border border-red-100 shadow-sm p-5">
        <Icon className="text-red-600 w-6 h-6 mb-4" aria-hidden="true" />
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-xs text-slate-500 mt-1">{label}</div>
      </div>)}
    </div>
    <div className="flex flex-wrap gap-3">
      <button onClick={() => setActiveView('sales')}
        className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-5 py-2.5 text-sm font-bold">
        {t('seller.open_sales')}
      </button>
      <button onClick={() => setActiveView('customers')}
        className="bg-white hover:bg-red-50 text-red-700 border border-red-200 rounded-lg px-5 py-2.5 text-sm font-bold">
        {t('seller.open_customers')}
      </button>
    </div>
  </div>;
}
