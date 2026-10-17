import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import {
  Building2,
  Globe2,
  User,
  ChevronDown,
  PlusCircle,
  Calendar,
  Check,
  ShieldCheck,
  Layers
} from 'lucide-react';

export default function Navbar() {
  const { currentCompany, companies, switchCompany, currentUser, logout, setActiveView } = useApp();
  const { lang, setLang, t } = useI18n();

  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const languages = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'rw', label: 'Ikinyarwanda', flag: '🇷🇼' }
  ];

  const currentLang = languages.find((l) => l.code === lang) || languages[0];

  const roleColors = {
    admin: 'bg-red-900/60 text-red-200 border-red-700',
    accountant: 'bg-emerald-900/60 text-emerald-200 border-emerald-700',
    sales: 'bg-blue-900/60 text-blue-200 border-blue-700',
    purchases: 'bg-amber-900/60 text-amber-200 border-amber-700',
    inventory: 'bg-purple-900/60 text-purple-200 border-purple-700',
    manager: 'bg-indigo-900/60 text-indigo-200 border-indigo-700'
  };

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between px-4 select-none z-30 relative shadow-md">
      {/* Brand & Active Company */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center font-black text-white text-lg tracking-wider shadow">
            G
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-base tracking-wide text-white">GENESIS</span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                ERP 1.0
              </span>
            </div>
          </div>
        </div>

        <div className="h-5 w-px bg-slate-700 hidden sm:block" />

        {/* Company Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setCompanyMenuOpen(!companyMenuOpen);
              setLangMenuOpen(false);
              setUserMenuOpen(false);
            }}
            className="flex items-center space-x-2 text-xs font-medium text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-800 px-2.5 py-1.5 rounded border border-slate-700 transition"
          >
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="max-w-[180px] truncate">{currentCompany?.name || 'Genesis Trading'}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {companyMenuOpen && (
            <div className="absolute left-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-50 text-xs">
              <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-700/60">
                {t('common.select_company')}
              </div>
              {companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    switchCompany(c);
                    setCompanyMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-700 transition ${
                    c.id === currentCompany?.id ? 'text-blue-400 font-semibold bg-slate-750' : 'text-slate-200'
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  {c.id === currentCompany?.id && <Check className="w-3.5 h-3.5 text-blue-400" />}
                </button>
              ))}
              <div className="border-t border-slate-700/60 pt-1 mt-1">
                <button
                  onClick={() => {
                    setActiveView('settings');
                    setCompanyMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-blue-400 hover:bg-slate-700 flex items-center space-x-1.5"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{t('settings.tab_company')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Controls: Date, Language, User Switcher */}
      <div className="flex items-center space-x-3">
        {/* Date Display */}
        <div className="hidden lg:flex items-center space-x-1.5 text-xs text-slate-400 bg-slate-800/40 px-2 py-1 rounded border border-slate-800">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span>{new Date().toISOString().split('T')[0]}</span>
        </div>

        {/* Language Switcher */}
        <div className="relative">
          <button
            onClick={() => {
              setLangMenuOpen(!langMenuOpen);
              setCompanyMenuOpen(false);
              setUserMenuOpen(false);
            }}
            className="flex items-center space-x-1.5 text-xs font-medium text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-800 px-2.5 py-1.5 rounded border border-slate-700 transition"
          >
            <span>{currentLang.flag}</span>
            <span className="hidden sm:inline">{currentLang.label}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {langMenuOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-50 text-xs">
              <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-700/60">
                {t('common.language')}
              </div>
              {languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setLang(l.code);
                    setLangMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-700 transition ${
                    lang === l.code ? 'text-blue-400 font-semibold bg-slate-750' : 'text-slate-200'
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <span>{l.flag}</span>
                    <span>{l.label}</span>
                  </span>
                  {lang === l.code && <Check className="w-3.5 h-3.5 text-blue-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User Switcher / Profile */}
        <div className="relative">
          <button
            onClick={() => {
              setUserMenuOpen(!userMenuOpen);
              setCompanyMenuOpen(false);
              setLangMenuOpen(false);
            }}
            className="flex items-center space-x-2 text-xs font-medium text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-800 px-2.5 py-1.5 rounded border border-slate-700 transition"
          >
            <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="text-left hidden md:block">
              <div className="text-[11px] font-semibold text-white leading-tight">{currentUser.full_name}</div>
            </div>
            <span
              className={`text-[9px] uppercase px-1.5 py-0.2 rounded border font-semibold ${
                roleColors[currentUser.role] || 'bg-slate-800 text-slate-300 border-slate-600'
              }`}
            >
              {currentUser.role}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-50 text-xs">
              <div className="px-3 py-2 border-b border-slate-700/60">
                <div className="font-semibold text-white text-xs">{currentUser.full_name}</div>
                <div className="text-[11px] text-slate-400">@{currentUser.username} • {currentUser.email || 'user@genesis.com'}</div>
              </div>
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {t('auth.account', 'Account')}
              </div>
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  logout();
                }}
                className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-700 transition"
              >
                {t('auth.sign_out', 'Sign out')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
