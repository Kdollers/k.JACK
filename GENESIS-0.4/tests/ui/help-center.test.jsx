// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider, useI18n } from '../../src/i18n';
import HelpCenter from '../../src/views/HelpCenter';
import { useApp } from '../../src/context/AppContext';
vi.mock('../../src/context/AppContext', () => ({ useApp: vi.fn() }));
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });
function LanguageButtons() {
  const { setLang } = useI18n();
  return <><button onClick={() => setLang('fr')}>FR</button><button onClick={() => setLang('rw')}>RW</button></>;
}
function mount(mode, allowed) {
  const setActiveView = vi.fn();
  useApp.mockReturnValue({ appMode: mode, setActiveView, hasPermission: (perm) => allowed.includes(perm) });
  render(<I18nProvider><LanguageButtons /><HelpCenter /></I18nProvider>);
  return setActiveView;
}
describe('bundled offline help', () => {
  it('has detailed mode-specific instructions and live French/Kinyarwanda translations', () => {
    mount('seller', ['customers:read', 'inventory:read', 'sales:read']);
    expect(screen.getByText('Built into JENESIS: works without an internet connection.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sales workflow' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Purchasing workflow' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sales workflow' }));
    expect(screen.getByText(/Auto-post creates the associated accounting/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'FR' }));
    expect(screen.getByRole('heading', { name: 'Cycle de vente' })).toBeTruthy();
    expect(screen.getByText(/La comptabilisation automatique crée/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'RW' }));
    expect(screen.getByRole('heading', { name: 'Uko kugurisha bikorwa' })).toBeTruthy();
    expect(screen.getByText(/Kubyemeza ako kanya byandika/)).toBeTruthy();
  });
  it('network mode has no sales, accountant or seller instructions', () => {
    mount('network', ['network:read']);
    expect(screen.getByRole('heading', { name: 'Health and maintenance' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sales workflow' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Double-entry accounting' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Backup and restore' })).toBeNull();
  });
  it('an administrator can follow help into an authorized module', () => {
    const navigate = mount('administrator', ['sales:read', 'backup:export']);
    fireEvent.click(screen.getByRole('button', { name: 'Sales workflow' }));
    fireEvent.click(screen.getByRole('button', { name: /Open Sales/ }));
    expect(navigate).toHaveBeenCalledWith('sales');
  });
});
