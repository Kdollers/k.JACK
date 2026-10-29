import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { ShortcutsProvider } from './context/ShortcutsContext';
import { I18nProvider } from './i18n';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Toast from './components/Toast';
import AppOverlays from './components/AppOverlays';
import { LoginScreen, SetupScreen, ChangePasswordScreen, BackendUnavailable } from './components/AuthScreens';

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
import HelpView from './views/HelpView';

function AppContent() {
  const { activeView, loading, authState, authError } = useApp();

  if (authState === 'setup') return <SetupScreen />;
  if (authState === 'login') return <LoginScreen />;
  if (authState === 'change-password') return <ChangePasswordScreen />;
  if (authState === 'error') return <BackendUnavailable message={authError} />;

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white space-y-4">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center font-black text-2xl shadow-lg animate-pulse">
          G
        </div>
        <div className="text-center">
          <div className="text-sm font-bold tracking-wider">JENESIS ERP & ACCOUNTING</div>
          <div className="text-xs text-slate-400 mt-1">Initializing ledger & database...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink antialiased font-sans">
      <Navbar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {activeView === 'dashboard' && <DashboardView />}
          {activeView === 'customers' && <CustomersView />}
          {activeView === 'suppliers' && <SuppliersView />}
          {activeView === 'inventory' && <InventoryView />}
          {activeView === 'sales' && <SalesView />}
          {activeView === 'purchases' && <PurchasesView />}
          {activeView === 'banking' && <BankingView />}
          {activeView === 'accounting' && <AccountingView />}
          {activeView === 'reports' && <ReportsView />}
          {activeView === 'settings' && <SettingsView />}
          {activeView === 'help' && <HelpView />}
        </main>
      </div>

      {/* Calculator, Messenger and the shortcut reference: opened by the header
          buttons or by their keyboard shortcuts — one instance of each. */}
      <AppOverlays />

      <Toast />
    </div>
  );
}

export default function App() {
  // ThemeProvider is outermost: the sign-in, first-run and error screens are
  // rendered by AppContent and must honour the saved theme too.
  return (
    <ThemeProvider>
      <I18nProvider>
        <AppProvider>
          {/* ShortcutsProvider sits inside AppProvider (it navigates and toasts)
              and above AppContent so every screen can register shortcuts. */}
          <ShortcutsProvider>
            <AppContent />
          </ShortcutsProvider>
        </AppProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
