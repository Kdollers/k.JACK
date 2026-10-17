import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../services/api';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  PlusCircle,
  FileText,
  Package,
  Clock,
  CheckCircle,
  Calendar
} from 'lucide-react';

export default function DashboardView() {
  const { currentCompany, formatCurrency, formatDate, setActiveView, refreshKey } = useApp();
  const { t } = useI18n();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('year'); // 'month', 'quarter', 'year', 'all'

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const today = new Date();
      let startDate = '2026-01-01';
      let endDate = today.toISOString().split('T')[0];

      if (period === 'month') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      } else if (period === 'quarter') {
        const qMonth = Math.floor(today.getMonth() / 3) * 3;
        startDate = new Date(today.getFullYear(), qMonth, 1).toISOString().split('T')[0];
      } else if (period === 'year') {
        startDate = `${today.getFullYear()}-01-01`;
      } else {
        startDate = '2020-01-01';
      }

      const data = await apiRequest(`/api/reports/dashboard?startDate=${startDate}&endDate=${endDate}`);
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [currentCompany?.id, period, refreshKey]);

  return (
    <div className="space-y-6">
      {/* Top Header & Period Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('dashboard.subtitle')}</p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 rounded-md transition ${
                period === 'month' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('common.this_month')}
            </button>
            <button
              onClick={() => setPeriod('quarter')}
              className={`px-3 py-1.5 rounded-md transition ${
                period === 'quarter' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('common.this_quarter')}
            </button>
            <button
              onClick={() => setPeriod('year')}
              className={`px-3 py-1.5 rounded-md transition ${
                period === 'year' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('common.this_year')}
            </button>
            <button
              onClick={() => setPeriod('all')}
              className={`px-3 py-1.5 rounded-md transition ${
                period === 'all' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('common.all')}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sales */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">{t('dashboard.total_sales')}</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
            {formatCurrency(stats?.totalSales || 0)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{stats?.salesCount || 0} Invoices</span>
            <button onClick={() => setActiveView('sales')} className="text-blue-600 hover:underline font-semibold">
              {t('common.view')}
            </button>
          </div>
        </div>

        {/* Total Purchases */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">{t('dashboard.total_purchases')}</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
            {formatCurrency(stats?.totalPurchases || 0)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{stats?.purchasesCount || 0} Bills</span>
            <button onClick={() => setActiveView('purchases')} className="text-blue-600 hover:underline font-semibold">
              {t('common.view')}
            </button>
          </div>
        </div>

        {/* Cash & Bank Balances */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Total Liquidity</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 font-mono tracking-tight">
            {formatCurrency(stats?.totalCashBank || 0)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Cash: {formatCurrency(stats?.cashBalance || 0)}</span>
            <span>Bank: {formatCurrency(stats?.bankBalance || 0)}</span>
          </div>
        </div>

        {/* Gross Profit / Net Profit */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">{t('dashboard.net_profit')}</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div
            className={`text-2xl font-black font-mono tracking-tight ${
              (stats?.netProfit || 0) >= 0 ? 'text-blue-700' : 'text-rose-600'
            }`}
          >
            {formatCurrency(stats?.netProfit || 0)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Gross Margin: {formatCurrency(stats?.grossProfit || 0)}</span>
            <button onClick={() => setActiveView('reports')} className="text-blue-600 hover:underline font-semibold">
              P&L Report
            </button>
          </div>
        </div>
      </div>

      {/* Secondary Balances Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Accounts Receivable */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {t('dashboard.accounts_receivable')}
            </div>
            <div className="text-xl font-bold text-slate-900 font-mono mt-1">
              {formatCurrency(stats?.accountsReceivable || 0)}
            </div>
          </div>
          <button
            onClick={() => setActiveView('customers')}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            {t('customers.title')} &rarr;
          </button>
        </div>

        {/* Accounts Payable */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {t('dashboard.accounts_payable')}
            </div>
            <div className="text-xl font-bold text-slate-900 font-mono mt-1">
              {formatCurrency(stats?.accountsPayable || 0)}
            </div>
          </div>
          <button
            onClick={() => setActiveView('suppliers')}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            {t('suppliers.title')} &rarr;
          </button>
        </div>

        {/* Inventory Value */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {t('dashboard.inventory_value')}
            </div>
            <div className="text-xl font-bold text-slate-900 font-mono mt-1">
              {formatCurrency(stats?.inventoryValue || 0)}
            </div>
          </div>
          <button
            onClick={() => setActiveView('inventory')}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            {t('inventory.title')} &rarr;
          </button>
        </div>
      </div>

      {/* Main Content Split: Recent Transactions + Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-800 flex items-center space-x-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>{t('dashboard.recent_transactions')}</span>
            </h3>
            <div className="flex space-x-2">
              <button
                onClick={() => setActiveView('sales')}
                className="text-xs text-blue-600 hover:underline font-semibold"
              >
                + {t('dashboard.new_invoice')}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">{t('common.date')}</th>
                  <th className="py-2.5 px-4">{t('common.type')}</th>
                  <th className="py-2.5 px-4">{t('common.reference')}</th>
                  <th className="py-2.5 px-4">Party</th>
                  <th className="py-2.5 px-4 text-right">{t('common.amount')}</th>
                  <th className="py-2.5 px-4 text-center">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats?.recentTransactions && stats.recentTransactions.length > 0 ? (
                  stats.recentTransactions.map((tx, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-4 font-medium text-slate-700">{formatDate(tx.date)}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            tx.type === 'SALES_INVOICE'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {tx.type === 'SALES_INVOICE' ? 'Sale' : 'Purchase'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-800">{tx.number}</td>
                      <td className="py-2.5 px-4 text-slate-700 font-medium truncate max-w-[140px]">{tx.party}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(tx.amount)}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                          {tx.status}
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

        {/* Low Stock Alerts & Quick Actions (1 col) */}
        <div className="space-y-6">
          {/* Low Stock Alerts */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-slate-800 flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>{t('dashboard.low_stock_alerts')}</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                {stats?.lowStockCount || 0}
              </span>
            </div>

            {stats?.lowStockItems && stats.lowStockItems.length > 0 ? (
              <div className="space-y-2.5">
                {stats.lowStockItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-lg border border-amber-200/80 bg-amber-50/50 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-800 truncate max-w-[160px]">{item.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">SKU: {item.sku}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-rose-600 font-mono">
                        {item.current_stock} {item.unit}
                      </div>
                      <div className="text-[10px] text-slate-400">Min: {item.min_stock_level}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-500 text-xs flex flex-col items-center">
                <CheckCircle className="w-8 h-8 text-emerald-500 mb-1" />
                <span>{t('dashboard.no_low_stock')}</span>
              </div>
            )}
          </div>

          {/* Quick Actions Shortcuts */}
          <div className="bg-slate-900 text-white rounded-xl p-4 shadow">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              {t('dashboard.quick_actions')}
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => setActiveView('sales')}
                className="bg-slate-800 hover:bg-slate-700 p-2.5 rounded-lg text-left transition border border-slate-700/60"
              >
                <div className="font-semibold text-blue-400">+ Invoice</div>
                <div className="text-[10px] text-slate-400">New Client Bill</div>
              </button>
              <button
                onClick={() => setActiveView('purchases')}
                className="bg-slate-800 hover:bg-slate-700 p-2.5 rounded-lg text-left transition border border-slate-700/60"
              >
                <div className="font-semibold text-emerald-400">+ Bill</div>
                <div className="text-[10px] text-slate-400">Vendor Purchase</div>
              </button>
              <button
                onClick={() => setActiveView('banking')}
                className="bg-slate-800 hover:bg-slate-700 p-2.5 rounded-lg text-left transition border border-slate-700/60"
              >
                <div className="font-semibold text-amber-400">+ Payment</div>
                <div className="text-[10px] text-slate-400">Receipt / Voucher</div>
              </button>
              <button
                onClick={() => setActiveView('accounting')}
                className="bg-slate-800 hover:bg-slate-700 p-2.5 rounded-lg text-left transition border border-slate-700/60"
              >
                <div className="font-semibold text-purple-400">+ Journal</div>
                <div className="text-[10px] text-slate-400">Double Entry</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
