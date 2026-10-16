// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../src/i18n';
import Sidebar from '../../src/components/Sidebar';
import { useApp } from '../../src/context/AppContext';
vi.mock('../../src/context/AppContext', () => ({ useApp: vi.fn() }));
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });
function mount(mode, permissions) {
  const setActiveView = vi.fn();
  useApp.mockReturnValue({ appMode: mode, activeView: 'dashboard', setActiveView,
    hasPermission: (perm) => permissions.includes(perm) });
  render(<I18nProvider><Sidebar /></I18nProvider>);
  return setActiveView;
}
describe('mode navigation uses the permission intersection', () => {
  it('seller is red and cannot navigate to purchasing, banking or full reports', () => {
    const navigate = mount('seller', ['dashboard:read', 'customers:read', 'inventory:read', 'sales:read']);
    const home = screen.getByRole('button', { name: 'Dashboard' });
    expect(home.className).toContain('bg-red-600');
    expect(screen.getByRole('button', { name: 'Customers' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Suppliers' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reports' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Purchases' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sales & Invoicing' }));
    expect(navigate).toHaveBeenCalledWith('sales');
  });
  it('network is green and has only health dashboard and offline help', () => {
    mount('network', ['dashboard:read', 'network:read', 'network:manage']);
    expect(screen.getByRole('button', { name: 'Dashboard' }).className).toContain('bg-green-600');
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Help Center' })).toBeTruthy();
  });
  it('admin navigation remains available in blue with server permissions', () => {
    mount('administrator', ['dashboard:read', 'company:manage', 'reports:read']);
    expect(screen.getByRole('button', { name: 'Dashboard' }).className).toContain('bg-blue-600');
    expect(screen.getByRole('button', { name: /Settings/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reports/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sales & Invoicing' })).toBeNull();
  });
});
