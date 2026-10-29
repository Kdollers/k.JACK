import React, { createContext, useContext, useState, useEffect } from 'react';
import en from './en.json';
import fr from './fr.json';
import rw from './rw.json';

const translations = { en, fr, rw };

/** Replaces {name} placeholders with the supplied variables. */
function interpolate(text, vars) {
  return text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined ? String(vars[name]) : match));
}

const I18nContext = createContext();

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    return localStorage.getItem('genesis_lang') || 'en';
  });

  const setLang = (newLang) => {
    if (translations[newLang]) {
      setLangState(newLang);
      localStorage.setItem('genesis_lang', newLang);
    }
  };

  /**
   * Translate a dotted key path.
   *
   * t('sales.title')                       → the translated string
   * t('sales.settled_toast', { number: 7 }) → "Invoice 7 recorded as PAID…"
   * t('auth.account', 'Account')           → second argument as a fallback
   *
   * A second argument that is a plain object is treated as interpolation
   * variables ({name} placeholders); a string stays a fallback, which keeps
   * every existing call site working unchanged.
   */
  const t = (keyPath, options) => {
    const vars = options && typeof options === 'object' ? options : null;
    const fallback = typeof options === 'string' ? options : '';
    const keys = keyPath.split('.');
    let current = translations[lang] || translations.en;
    for (const k of keys) {
      if (current && current[k] !== undefined) {
        current = current[k];
      } else {
        // Fallback to English
        let engFallback = translations.en;
        for (const ek of keys) {
          if (engFallback && engFallback[ek] !== undefined) {
            engFallback = engFallback[ek];
          } else {
            return fallback || keyPath;
          }
        }
        return typeof engFallback === 'string' && vars ? interpolate(engFallback, vars) : engFallback;
      }
    }
    return typeof current === 'string' && vars ? interpolate(current, vars) : current;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
