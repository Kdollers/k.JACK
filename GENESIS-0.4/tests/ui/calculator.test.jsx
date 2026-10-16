// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../src/i18n';
import { useApp } from '../../src/context/AppContext';
import Calculator from '../../src/components/Calculator';
import { calculate } from '../../src/utils/calculator.mjs';
vi.mock('../../src/context/AppContext', () => ({ useApp: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('display-only calculator', () => {
  it('calculates with precedence and refuses malformed expressions without running code', () => {
    expect(calculate('2 + 3 * (4 - 1)')).toBe(11);
    expect(calculate('10 / 4')).toBe(2.5);
    expect(calculate('2 * -3')).toBe(-6);
    expect(() => calculate('1/0')).toThrow('CALCULATOR_DIV_ZERO');
    expect(() => calculate('process.exit(0)')).toThrow('CALCULATOR_INVALID');
  });
  it('appears in Seller and Administrator only, never Network & Maintenance', () => {
    useApp.mockReturnValue({ appMode: 'seller' });
    const seller = render(<I18nProvider><Calculator /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Calculator' }));
    expect(screen.getByRole('textbox', { name: 'Calculation' })).toBeTruthy();
    seller.unmount();
    useApp.mockReturnValue({ appMode: 'administrator' });
    const admin = render(<I18nProvider><Calculator /></I18nProvider>);
    expect(screen.getByRole('button', { name: 'Calculator' })).toBeTruthy();
    admin.unmount();
    useApp.mockReturnValue({ appMode: 'network' });
    const network = render(<I18nProvider><Calculator /></I18nProvider>);
    expect(network.container.innerHTML).toBe('');
  });
});
