import React from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import {
  LayoutDashboard,
  Users,
  Building,
  Package,
  ShoppingCart,
  ShoppingBag,
  CreditCard,
  BookOpen,
  BarChart3,
  Settings,
  HelpCircle
} from 'lucide-react';

export default function Sidebar() {
  const { activeView, setActiveView } = useApp();
  const { t } = useI18n();

  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { id: 'customers', icon: Users, label: t('nav.customers') },
    { id: 'suppliers', icon: Building, label: t('nav.suppliers') },
    { id: 'inventory', icon: Package, label: t('nav.inventory') },
    { id: 'sales', icon: ShoppingCart, label: t('nav.sales') },
    { id: 'purchases', icon: ShoppingBag, label: t('nav.purchases') },
    { id: 'banking', icon: CreditCard, label: t('nav.banking') },
    { id: 'accounting', icon: BookOpen, label: t('nav.accounting') },
    { id: 'reports', icon: BarChart3, label: t('nav.reports') },
    { id: 'settings', icon: Settings, label: t('nav.settings') }
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none">
      <div className="py-3">
        <div className="px-4 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Enterprise Modules
        </div>
        <nav className="space-y-0.5 px-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-3 border-t border-slate-800 text-[11px] text-slate-400 bg-slate-950/40">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-slate-300">GENESIS Software</span>
          <span className="px-1 py-0.5 rounded text-[9px] bg-emerald-900/60 text-emerald-300 border border-emerald-700/60">
            Certified
          </span>
        </div>
        <div className="text-[10px] text-slate-500">
          Double-Entry Accounting Standard
        </div>
      </div>
    </aside>
  );
}
