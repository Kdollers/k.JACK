import React, { createContext, useContext, useState, useEffect } from 'react';
import en from './en.json';
import fr from './fr.json';
import rw from './rw.json';

const translations = { en, fr, rw };

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

  const t = (keyPath, fallback = '') => {
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
        return engFallback;
      }
    }
    return current;
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
