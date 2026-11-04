import React, { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppModeProvider, useAppMode, appTitle } from './context/AppModeContext';
import { accessPermissionFor } from './appIdentity';
import { useI18n } from './i18n';
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
import MaintenanceView from './views/MaintenanceView';
import LauncherView from './views/LauncherView';
import JenesisLogo from './components/JenesisLogo';
// Last line of defence: an error thrown while rendering used to leave an empty
// document behind (a blank window with no explanation). The boundary shows a
// translated message instead and writes the error to the desktop log.
import { AppErrorBoundary } from './components/AppCrashScreen';

function AppContent() {
  const { activeView, loading, authState, authError, setActiveView, hasPermission, logout } = useApp();
  const { appId, isLauncher, app, canOpen, landingView } = useAppMode();
  const { t } = useI18n();

  // No application was requested: offer the four of them. The installed
  // shortcuts never reach this screen — they name their application.
  if (isLauncher) return <LauncherView />;

  // An application never shows a screen that is not part of it. The backend
  // enforces permissions as well; this is the second gate.
  useEffect(() => {
    if (!appId) return;
    if (!canOpen(activeView)) setActiveView(landingView(activeView));
  }, [appId, activeView, canOpen, landingView, setActiveView]);

  // Diagnostic only: tell the desktop shell that the signed-in interface is on
  // screen. The shared header is drawn from this moment on, so this is the
  // stage a signed-in failure stops at. No business data and no name is sent —
  // only the fact that the interface got there.
  useEffect(() => {
    if (authState !== 'ready') return;
    const bridge = typeof window === 'undefined' ? null : (window.genesisDesktop || window.jenesisDesktop);
    if (bridge && typeof bridge.reportStartup === 'function') {
      bridge.reportStartup('signed-in', 'the signed-in interface is displayed');
    }
  }, [authState]);

  if (authState === 'setup') return <SetupScreen />;
  if (authState === 'login') return <LoginScreen />;
  if (authState === 'change-password') return <ChangePasswordScreen />;
  if (authState === 'error') return <BackendUnavailable message={authError} />;

  // An application can require a permission simply to be opened. Without this
  // gate a user who may not configure anything would land on a settings screen
  // whose every action the server refuses — a screen that looks broken.
  const requiredPermission = accessPermissionFor(appId);
  if (requiredPermission && !hasPermission(requiredPermission)) {
    const tone = app ? app.tone : 'brand';
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-canvas p-6">
        <div className="max-w-md w-full bg-surface border border-line rounded-xl shadow-lg p-6 text-center">
          <JenesisLogo tone={tone} size={56} className="mx-auto" />
          <h1 className="mt-4 text-base font-bold">{t('identity.no_access_title')}</h1>
          <p className="mt-2 text-xs text-[rgb(var(--j-ink-muted))]">
            {t('identity.no_access_body', { app: app ? appTitle(appId) : 'JENESIS' })}
          </p>
          <button
            type="button"
            onClick={logout}
            className="mt-5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white j-bg hover:opacity-90 j-ring"
          >
            {t('identity.open_another')}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    const tone = app ? app.tone : 'brand';
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white space-y-4">
        <JenesisLogo tone={tone} size={56} className="animate-pulse" />
        <div className="text-center">
          <div className="text-sm font-bold tracking-wider">
            {app ? `JENESIS ${app.id.toUpperCase()}` : 'JENESIS ERP & ACCOUNTING'}
          </div>
          <div className="text-xs text-slate-400 mt-1">{t('common.initializing')}</div>
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
          {activeView === 'maintenance' && <MaintenanceView />}
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
    // AppModeProvider is outermost: it decides which application this window is,
    // which the theme (per-application preference) and every screen depend on.
    <AppModeProvider>
      <ThemedProviders />
    </AppModeProvider>
  );
}

function ThemedProviders() {
  const { appId } = useAppMode();
  return (
    <ThemeProvider appId={appId}>
      <I18nProvider>
        {/* Inside the language provider, so the failure screen is translated
            like the rest of the interface. */}
        <AppErrorBoundary>
          <AppProvider>
            {/* ShortcutsProvider sits inside AppProvider (it navigates and toasts)
                and above AppContent so every screen can register shortcuts. */}
            <ShortcutsProvider>
              <AppContent />
            </ShortcutsProvider>
          </AppProvider>
        </AppErrorBoundary>
      </I18nProvider>
    </ThemeProvider>
  );
}
