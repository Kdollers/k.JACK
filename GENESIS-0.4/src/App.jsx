import React, { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { I18nProvider, useI18n } from './i18n';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Toast from './components/Toast';
import BrandMark from './components/BrandMark';
import Calculator from './components/Calculator';
import { LoginScreen, SetupScreen, RecoveryScreen, ChangePasswordScreen, BackendUnavailable } from './components/AuthScreens';

import DashboardView from './views/DashboardView';
import CustomersView from './views/CustomersView';
import SuppliersView from './views/SuppliersView';
import InventoryView from './views/InventoryView';
import SalesView from './views/SalesView';
import PurchasesView from './views/PurchasesView';
import BankingView from './views/BankingView';
import AccountingView from './views/AccountingView';
import ReportsView from './views/ReportsView';
import SettingsView from './views/SettingsView';
import SellerHome from './views/SellerHome';
import SellerCatalog from './views/SellerCatalog';
import StaffHome from './views/StaffHome';
import NetworkView from './views/NetworkView';
import HelpCenter from './views/HelpCenter';

function AppContent() {
  const { activeView, loading, authState, authError, hasPermission, appMode } = useApp();
  const { t } = useI18n();
  useEffect(() => {
    document.title = `${t('app_name')} — ${t(`app_modes.${appMode}`)}`;
  }, [appMode, t]);

  if (authState === 'setup') return <SetupScreen />;
  if (authState === 'recovery') return <RecoveryScreen />;
  if (authState === 'login') return <LoginScreen />;
  if (authState === 'change-password') return <ChangePasswordScreen />;
  if (authState === 'error') return <BackendUnavailable message={authError} />;

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white space-y-4">
        <BrandMark mode={appMode} className="w-12 h-12 animate-pulse" />
        <div className="text-center">
          <div className="text-sm font-bold tracking-wider">{t('app_name')}</div>
          <div className="text-xs text-slate-400 mt-1">{t('auth.initializing')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900 antialiased font-sans">
      <Navbar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {activeView === 'dashboard' && (appMode === 'seller' ? <SellerHome /> :
            appMode === 'network' ? <NetworkView /> :
            hasPermission('reports:read') ? <DashboardView /> : <StaffHome />)}
          {activeView === 'customers' && appMode !== 'network' && hasPermission('customers:read') && <CustomersView />}
          {activeView === 'suppliers' && appMode !== 'seller' && appMode !== 'network' && hasPermission('suppliers:read') && <SuppliersView />}
          {activeView === 'inventory' && hasPermission('inventory:read') &&
            (appMode === 'seller' ? <SellerCatalog /> : <InventoryView />)}
          {activeView === 'sales' && hasPermission('sales:read') && <SalesView />}
          {activeView === 'purchases' && hasPermission('purchases:read') && <PurchasesView />}
          {activeView === 'banking' && hasPermission('banking:read') && <BankingView />}
          {activeView === 'accounting' && hasPermission('accounting:read') && <AccountingView />}
          {activeView === 'reports' && hasPermission('reports:read') && <ReportsView />}
          {activeView === 'settings' && hasPermission('company:manage') && <SettingsView />}
          {activeView === 'help' && <HelpCenter />}
        </main>
      </div>

      <Toast />
      {appMode !== 'network' && <Calculator />}
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </I18nProvider>
  );
}
