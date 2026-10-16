// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useApp } from '../../src/context/AppContext';
import { apiRequest } from '../../src/services/api';
import { I18nProvider } from '../../src/i18n';
import SettingsView from '../../src/views/SettingsView';
import CustomersView from '../../src/views/CustomersView';
import SuppliersView from '../../src/views/SuppliersView';
import InventoryView from '../../src/views/InventoryView';

vi.mock('../../src/context/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('../../src/services/api', () => ({ apiRequest: vi.fn(), downloadAuthenticated: vi.fn() }));

const company = { id: 'company-1', name: 'Original Trading', currency_code: 'USD',
  currency_symbol: '$', currency_decimals: 2, default_language: 'en',
  inventory_valuation_method: 'WEIGHTED_AVERAGE' };
function renderView(View, props = {}) {
  useApp.mockReturnValue({ currentCompany: company, companies: [company], users: [],
    showToast: vi.fn(), triggerRefresh: vi.fn(), refreshKey: 0, logout: vi.fn(),
    formatCurrency: (n) => `$${n}`, formatNumber: String, formatDateTime: String,
    formatDate: String, formatPercent: String, setActiveView: vi.fn(), ...props });
  return render(<I18nProvider><View /></I18nProvider>);
}
function submittedBody(path, method) {
  const call = apiRequest.mock.calls.find(([url, opts]) => url === path && opts?.method === method);
  expect(call).toBeDefined();
  return JSON.parse(call[1].body);
}

beforeEach(() => {
  localStorage.setItem('genesis_lang', 'en');
  apiRequest.mockImplementation(async (url) => {
    if (url.startsWith('/api/customers') || url.startsWith('/api/suppliers') ||
        url.startsWith('/api/products')) return [];
    return { success: true };
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('CRUD forms in the actual React renderer', () => {
  it('selects country and currency when creating a company; the base currency of existing companies is read-only', async () => {
    renderView(SettingsView);
    const code = screen.getByDisplayValue('USD');
    expect(code.readOnly).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Create New Company' }));
    const modal = screen.getByText('Create Company').closest('form');
    fireEvent.change(within(modal).getByPlaceholderText('e.g. Apex Enterprises Ltd'),
      { target: { value: 'Cameroon Services' } });
    fireEvent.change(within(modal).getByLabelText('Country *'), { target: { value: 'CM' } });
    fireEvent.change(within(modal).getByLabelText('Currency Code'), { target: { value: 'XAF' } });
    expect(within(modal).getByDisplayValue('FCFA')).toBeTruthy();
    fireEvent.submit(modal);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/companies', expect.anything()));
    expect(submittedBody('/api/companies', 'POST')).toMatchObject({
      name: 'Cameroon Services', country_code: 'CM', currency_code: 'XAF', currency_decimals: 0
    });
  });

  for (const [View, kind, label, record] of [
    [CustomersView, 'customers', 'Customer Name', {
      id: 'cust-1', code: 'CUST-001', name: 'Existing Customer', active: 1,
      credit_limit: 0, payment_terms: 'NET_30', city: 'Yaoundé', country: 'Cameroon'
    }],
    [SuppliersView, 'suppliers', 'Supplier Name', {
      id: 'supp-1', code: 'SUPP-001', name: 'Existing Supplier', active: 1,
      payment_terms: 'NET_30', city: 'Douala', country: 'Cameroon'
    }]
  ]) {
    it(`edits ${kind} without losing country, city or active state`, async () => {
      apiRequest.mockImplementation(async (url) => url.startsWith(`/api/${kind}`) ? [record] : []);
      renderView(View);
      const edit = await screen.findByTitle('Edit');
      fireEvent.click(edit);
      const modal = screen.getByRole('button', { name: 'Save' }).closest('form');
      expect(within(modal).getByLabelText('Active').checked).toBe(true);
      fireEvent.change(within(modal).getByLabelText('City / town'), { target: { value: 'Buea' } });
      fireEvent.change(within(modal).getByLabelText(`${label} *`), { target: { value: 'Edited Contact' } });
      fireEvent.submit(modal);
      await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(`/api/${kind}/${record.id}`, expect.anything()));
      expect(submittedBody(`/api/${kind}/${record.id}`, 'PUT')).toMatchObject({
        name: 'Edited Contact', city: 'Buea', country: 'Cameroon', active: true
      });
    });
  }

  it('edits a product with zero min stock and the correct currency step without changing current stock', async () => {
    const item = { id: 'prod-1', sku: 'ITEM-1', name: 'Existing Product', type: 'GOODS',
      active: 1, unit: 'pcs', category: 'General', cost_price: 20, selling_price: 45,
      min_stock_level: 0, current_stock: 7, warehouse_location: 'Main Store' };
    apiRequest.mockImplementation(async (url) => url.startsWith('/api/products') ? [item] : []);
    renderView(InventoryView, { currentCompany: { ...company, currency_code: 'XAF', currency_decimals: 0 } });
    fireEvent.click(await screen.findByTitle('Edit'));
    const modal = screen.getByRole('button', { name: 'Save' }).closest('form');
    expect(within(modal).getByLabelText('Active').checked).toBe(true);
    expect(within(modal).getByDisplayValue('0')).toBeTruthy();
    const price = within(modal).getByLabelText(/Selling Price/i);
    expect(price.getAttribute('step')).toBe('1');
    fireEvent.change(within(modal).getByLabelText('Product Name *'), { target: { value: 'Edited Product' } });
    fireEvent.submit(modal);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/products/prod-1', expect.anything()));
    expect(submittedBody('/api/products/prod-1', 'PUT')).toMatchObject({
      active: true, current_stock: 7, min_stock_level: 0, name: 'Edited Product'
    });
  });
});
