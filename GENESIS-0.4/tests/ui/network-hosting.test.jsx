// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../src/i18n';
import NetworkView from '../../src/views/NetworkView';
import { useApp } from '../../src/context/AppContext';
import { apiRequest } from '../../src/services/api';

vi.mock('../../src/context/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('../../src/services/api', () => ({ apiRequest: vi.fn(), downloadAuthenticated: vi.fn() }));
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

function mount() {
  useApp.mockReturnValue({
    hasPermission: (permission) => ['network:read', 'network:manage'].includes(permission),
    showToast: vi.fn(), formatDateTime: (date) => date, logout: vi.fn()
  });
  return render(<I18nProvider><NetworkView /></I18nProvider>);
}

describe('network-mode LAN control', () => {
  it('renders host-only opt-in and certificate/URLs after a successful activation', async () => {
    expect(window.location.hostname).toBe('localhost');
    apiRequest.mockImplementation((url, options) => {
      if (url.endsWith('/health')) return Promise.resolve({ status: 'healthy', database: 'ok', foreign_keys: true });
      if (options?.method === 'POST') {
        expect(JSON.parse(options.body)).toEqual({ enabled: true });
        return Promise.resolve({ enabled: true, configured: true,
          fingerprintSha256: 'AA:BB:CC', expiresAt: '2029-01-01',
          addresses: ['https://192.168.50.5:34671'] });
      }
      return Promise.resolve({ enabled: false, configured: false, addresses: [] });
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Enable HTTPS LAN hosting' }));
    expect(await screen.findByText('https://192.168.50.5:34671/seller')).toBeTruthy();
    expect(screen.getByText('AA:BB:CC')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disable LAN hosting' })).toBeTruthy();
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/network/hosting',
      expect.objectContaining({ method: 'POST' })));
    expect(screen.queryByText(/USD/)).toBeNull();
  });
});
