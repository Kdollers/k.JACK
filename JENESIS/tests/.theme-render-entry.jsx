import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import ThemeToggle from '../src/components/ThemeToggle';

export function renderToggle(variant) {
  return renderToStaticMarkup(
    React.createElement(
      ThemeProvider,
      null,
      React.createElement(
        I18nProvider,
        null,
        React.createElement(ThemeToggle, { variant: variant || 'segmented' })
      )
    )
  );
}

export function renderPreference() {
  function Probe() {
    const value = useTheme();
    return React.createElement(
      'span',
      null,
      `${value.preference}|${value.theme}|${value.isDark}`
    );
  }
  return renderToStaticMarkup(
    React.createElement(ThemeProvider, null, React.createElement(Probe, null))
  );
}
