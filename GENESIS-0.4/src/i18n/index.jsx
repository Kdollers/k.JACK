import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import en from './en.json';
import fr from './fr.json';
import rw from './rw.json';
import { LOCALE_BY_LANG } from './format.mjs';
import { lookup, translateFromDictionaries, pluralCategory, errorKeyFor } from './core.mjs';

const translations = { en, fr, rw };
export { LOCALE_BY_LANG };
const I18nContext = createContext(null);
const warned = new Set();

export function translate(key, lang = 'en', variables = {}) {
  if (import.meta.env.DEV && !lookup(translations[lang], key) && !warned.has(`${lang}:${key}`)) {
    warned.add(`${lang}:${key}`);
    console.warn(`Missing GENESIS translation: ${lang}:${key}`);
  }
  // Never display raw key paths. The checker makes all missing keys a test
  // failure; English is only an emergency fallback for a damaged installation.
  return translateFromDictionaries(key, lang, translations, variables);
}

export function errorKey(err) { return errorKeyFor(err, en); }

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const stored = localStorage.getItem('genesis_lang');
      return Object.hasOwn(translations, stored) ? stored : 'en';
    } catch { return 'en'; }
  });
  const setLang = (newLang) => {
    if (Object.hasOwn(translations, newLang)) {
      setLangState(newLang);
      try { localStorage.setItem('genesis_lang', newLang); } catch { /* private mode */ }
    }
  };
  useEffect(() => {
    document.documentElement.lang = lang;
    // Desktop-only, validated bridge: native menus and failure dialogs use the
    // same choice after a switch, and remember it if React cannot start next time.
    const change = window.genesisDesktop?.setLanguage?.(lang);
    if (change?.catch) change.catch(() => { /* browser and desktop stay usable */ });
  }, [lang]);
  const value = useMemo(() => ({
    lang,
    locale: LOCALE_BY_LANG[lang],
    setLang,
    t: (key, variables) => translate(key, lang, typeof variables === 'object' && variables !== null ? variables : {}),
    plural: (key, count, variables = {}) => {
      const form = pluralCategory(lang, count);
      return translate(`${key}.${form}`, lang, { count, ...variables });
    }
  }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within an I18nProvider');
  return context;
}
