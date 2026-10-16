// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppProvider, useApp } from '../../src/context/AppContext';
import { LoginScreen, SetupScreen, RecoveryScreen } from '../../src/components/AuthScreens';
import { I18nProvider } from '../../src/i18n';
import { apiRequest, getSessionToken, setSessionToken } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({
  apiRequest: vi.fn(), getSessionToken: vi.fn(() => null),
  setSessionToken: vi.fn(), setUnauthorizedHandler: vi.fn()
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete window.genesisDesktop;
  vi.clearAllMocks();
});

function AuthOnly() {
  const { authState } = useApp();
  if (authState === 'setup') return <SetupScreen />;
  if (authState === 'recovery') return <RecoveryScreen />;
  if (authState === 'login') return <LoginScreen />;
  if (authState === 'ready') return <p>Signed in and authorized</p>;
  return <p>Checking installation</p>;
}

function mount(status, desktop = null) {
  if (desktop) window.genesisDesktop = desktop;
  apiRequest.mockImplementation(async (route, options) => {
    if (route === '/api/setup/status') return status;
    if (route === '/api/setup/initialize') return { success: true };
    if (route === '/api/auth/login') {
      const { password } = JSON.parse(options.body);
      if (password !== 'Private-Admin-Passw0rd') throw { status: 401, code: 'INVALID_CREDENTIALS' };
      return { token: 'test-only-session-token' };
    }
    if (route === '/api/auth/me') return {
      mode: 'administrator', user: { username: 'owner.admin', role: 'admin', must_change_password: false },
      permissions: ['users:manage', 'company:manage'], company: { id: 'company-1' }
    };
    if (route === '/api/auth/users') return [];
    throw new Error(`Unexpected API call: ${route}`);
  });
  getSessionToken.mockReturnValue(null);
  render(<I18nProvider><AppProvider><AuthOnly /></AppProvider></I18nProvider>);
}

describe('first-run versus existing-installation authentication UI', () => {
  it('fresh database shows setup; mismatch is blocked; setup leads to sign-in and only the right password works', async () => {
    mount({ needsSetup: true, recoveryRequired: false, hasAdministrator: false });
    await screen.findByRole('heading', { name: 'Set up JENESIS' });
    expect(screen.queryByText(/already has an active administrator/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Owner Company' } });
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'RW' } });
    fireEvent.change(screen.getByLabelText('Administrator full name'), { target: { value: 'The Owner' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'owner.admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Private-Admin-Passw0rd' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Does-Not-Match' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create administrator and continue' }));
    await screen.findByRole('alert');
    expect(apiRequest.mock.calls.filter(([route]) => route === '/api/setup/initialize')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Private-Admin-Passw0rd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create administrator and continue' }));
    await screen.findByRole('heading', { name: 'Sign in' });
    const setupCall = apiRequest.mock.calls.find(([route]) => route === '/api/setup/initialize');
    expect(JSON.parse(setupCall[1].body)).toMatchObject({
      company_name: 'Owner Company', full_name: 'The Owner',
      username: 'owner.admin', password: 'Private-Admin-Passw0rd',
      confirm_password: 'Private-Admin-Passw0rd'
    });
    expect(screen.getByText(/already has an active administrator/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'owner.admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText(/Invalid username or password/);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(setSessionToken).not.toHaveBeenCalledWith('test-only-session-token');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Private-Admin-Passw0rd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Signed in and authorized');
    expect(setSessionToken).toHaveBeenCalledWith('test-only-session-token');
  });

  it('existing administrator shows sign-in, not setup; desktop offers only a separate, confirmed ledger', async () => {
    const chooseInstallation = vi.fn(async () => false); // user cancelled the native confirmation
    mount({ needsSetup: false, recoveryRequired: false, hasAdministrator: true }, {
      getAppInfo: vi.fn(async () => ({ alternativeInstallation: { target: 'current', newDatabase: true } })),
      chooseInstallation
    });
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByRole('heading', { name: 'Set up JENESIS' })).toBeNull();
    expect(screen.getByText(/already has an active administrator/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new, separate installation' }));
    await waitFor(() => expect(chooseInstallation).toHaveBeenCalledWith('current'));
    expect(apiRequest.mock.calls.filter(([route]) => route === '/api/setup/initialize')).toHaveLength(0);
  });

  it('existing business data without an active admin shows recovery, not public setup; browser cannot switch databases', async () => {
    mount({ needsSetup: false, recoveryRequired: true, hasAdministrator: false });
    await screen.findByRole('heading', { name: 'Recover access to an existing installation' });
    expect(screen.queryByRole('heading', { name: 'Set up JENESIS' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start a new, separate installation' })).toBeNull();
  });

  it('French and Kinyarwanda expose the same existing-account / separate-data distinction', async () => {
    for (const lang of ['fr', 'rw']) {
      localStorage.setItem('genesis_lang', lang);
      mount({ needsSetup: false, recoveryRequired: false, hasAdministrator: true }, {
        getAppInfo: vi.fn(async () => ({ alternativeInstallation: { target: 'current', newDatabase: true } })),
        chooseInstallation: vi.fn(async () => false)
      });
      const heading = lang === 'fr' ? 'Connexion' : 'Injira';
      // The native confirmation runs in the same language as the selected UI.
      await screen.findByRole('heading', { name: heading });
      expect(await screen.findByRole('button', {
        name: lang === 'fr' ? 'Démarrer une nouvelle installation distincte' : 'Tangira JENESIS nshya itandukanye'
      })).toBeTruthy();
      cleanup();
      delete window.genesisDesktop;
    }
  });
});
