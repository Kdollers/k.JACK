import React, { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [currentCompany, setCurrentCompany] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [currentUser, setCurrentUser] = useState({
    id: 'usr-admin',
    username: 'admin',
    full_name: 'System Administrator',
    role: 'admin'
  });
  const [users, setUsers] = useState([]);
  const [activeView, setActiveView] = useState('dashboard');
  const [toast, setToast] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  const showToast = (message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  // Load companies and current user
  useEffect(() => {
    async function init() {
      try {
        const compRes = await fetch('/api/companies');
        if (compRes.ok) {
          const compData = await compRes.json();
          setCompanies(compData);
          if (compData.length > 0) {
            const savedCompId = localStorage.getItem('genesis_company_id');
            const found = compData.find((c) => c.id === savedCompId) || compData[0];
            setCurrentCompany(found);
          }
        }

        const userRes = await fetch('/api/auth/users');
        if (userRes.ok) {
          const userData = await userRes.json();
          setUsers(userData);
          const savedUserId = localStorage.getItem('genesis_user_id');
          if (savedUserId) {
            const matched = userData.find((u) => u.id === savedUserId);
            if (matched) setCurrentUser(matched);
          }
        }
      } catch (err) {
        console.error('Failed to initialize app context', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [refreshKey]);

  const switchCompany = (comp) => {
    setCurrentCompany(comp);
    localStorage.setItem('genesis_company_id', comp.id);
    triggerRefresh();
  };

  const switchUser = (user) => {
    setCurrentUser(user);
    localStorage.setItem('genesis_user_id', user.id);
    showToast(`Switched active user to ${user.full_name} (${user.role.toUpperCase()})`, 'info');
  };

  const formatCurrency = (val) => {
    const num = Number(val) || 0;
    const sym = currentCompany?.currency_symbol || '$';
    const decimals = currentCompany?.currency_decimals !== undefined ? currentCompany.currency_decimals : 2;
    return `${sym}${num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentCompany,
        setCurrentCompany,
        companies,
        switchCompany,
        currentUser,
        setCurrentUser,
        users,
        switchUser,
        activeView,
        setActiveView,
        toast,
        showToast,
        formatCurrency,
        formatDate,
        triggerRefresh,
        refreshKey,
        loading
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
}
