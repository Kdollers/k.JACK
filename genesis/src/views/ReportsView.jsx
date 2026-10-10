import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../services/api';
import {
  BarChart3,
  Calendar,
  Printer,
  Download,
  CheckCircle,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';

export default function ReportsView() {
  const { currentCompany, formatCurrency, formatDate, showToast, refreshKey } = useApp();
  const { t } = useI18n();

  const [activeReport, setActiveReport] = useState('trial_balance'); // 'trial_balance', 'pnl', 'balance_sheet', 'cash_flow', 'tax'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      let endpoint = '';
      if (activeReport === 'trial_balance') {
        endpoint = `/api/reports/trial-balance?asOfDate=${asOfDate}`;
      } else if (activeReport === 'pnl') {
        endpoint = `/api/reports/profit-loss?startDate=${startDate}&endDate=${endDate}`;
      } else if (activeReport === 'balance_sheet') {
        endpoint = `/api/reports/balance-sheet?asOfDate=${asOfDate}`;
      } else if (activeReport === 'cash_flow') {
        endpoint = `/api/reports/cash-flow?startDate=${startDate}&endDate=${endDate}`;
      } else if (activeReport === 'tax') {
        endpoint = `/api/reports/tax-report?startDate=${startDate}&endDate=${endDate}`;
      }

      const res = await apiRequest(endpoint);
      setData(res);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [currentCompany?.id, activeReport, asOfDate, startDate, endDate, refreshKey]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (!data) return;
    let csvRows = [];

    if (activeReport === 'trial_balance') {
      csvRows.push(['Account Code', 'Account Name', 'Type', 'Total Debit', 'Total Credit', 'Net Debit', 'Net Credit']);
      data.rows.forEach((r) => {
        csvRows.push([r.code, `"${r.name}"`, r.type, r.totalDebit, r.totalCredit, r.netDebit, r.netCredit]);
      });
    } else if (activeReport === 'pnl') {
      csvRows.push(['Category', 'Account', 'Amount']);
      csvRows.push(['REVENUE', 'Total Operating Revenue', data.totalRevenue]);
      csvRows.push(['COGS', 'Total Cost of Goods Sold', data.totalCogs]);
      csvRows.push(['GROSS_PROFIT', 'Gross Profit', data.grossProfit]);
      csvRows.push(['EXPENSES', 'Total Operating Expenses', data.totalExpenses]);
      csvRows.push(['NET_PROFIT', 'Net Income', data.netProfit]);
    } else if (activeReport === 'balance_sheet') {
      csvRows.push(['Section', 'Account', 'Amount']);
      csvRows.push(['ASSETS', 'Total Assets', data.assets.total]);
      csvRows.push(['LIABILITIES', 'Total Liabilities', data.liabilities.total]);
      csvRows.push(['EQUITY', 'Total Equity', data.equity.total]);
    } else if (activeReport === 'tax') {
      csvRows.push(['Metric', 'Amount']);
      csvRows.push(['Taxable Sales', data.taxableSales]);
      csvRows.push(['Output Tax Collected', data.outputTax]);
      csvRows.push(['Taxable Purchases', data.taxablePurchases]);
      csvRows.push(['Input Tax Deductible', data.inputTax]);
      csvRows.push(['Net Tax Payable', data.netTaxPayable]);
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `report-${activeReport}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Report Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t('reports.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('reports.subtitle')}</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportCSV}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('common.export_csv')}</span>
          </button>
          <button
            onClick={handlePrint}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t('common.print')}</span>
          </button>
        </div>
      </div>

      {/* Tabs bar */}
      <div className="flex items-center justify-between bg-slate-100 p-1 rounded-lg border border-slate-200 print:hidden overflow-x-auto text-xs font-medium">
        <div className="flex space-x-1">
          <button
            onClick={() => setActiveReport('trial_balance')}
            className={`px-3 py-1.5 rounded-md transition ${
              activeReport === 'trial_balance' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('reports.trial_balance')}
          </button>
          <button
            onClick={() => setActiveReport('pnl')}
            className={`px-3 py-1.5 rounded-md transition ${
              activeReport === 'pnl' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('reports.profit_loss')}
          </button>
          <button
            onClick={() => setActiveReport('balance_sheet')}
            className={`px-3 py-1.5 rounded-md transition ${
              activeReport === 'balance_sheet' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('reports.balance_sheet')}
          </button>
          <button
            onClick={() => setActiveReport('cash_flow')}
            className={`px-3 py-1.5 rounded-md transition ${
              activeReport === 'cash_flow' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('reports.cash_flow')}
          </button>
          <button
            onClick={() => setActiveReport('tax')}
            className={`px-3 py-1.5 rounded-md transition ${
              activeReport === 'tax' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('reports.tax_report')}
          </button>
        </div>

        {/* Date Filter selector */}
        <div className="flex items-center space-x-2 pl-4">
          {activeReport === 'trial_balance' || activeReport === 'balance_sheet' ? (
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-500">{t('reports.as_of')}:</span>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="bg-white px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>
          ) : (
            <div className="flex items-center space-x-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>
          )}
        </div>
      </div>

      {/* Report Paper Content Area */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 sm:p-10 min-h-[500px]" id="report-print-area">
        {/* Report Official Letterhead */}
        <div className="border-b border-slate-200 pb-5 mb-6 flex justify-between items-start">
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <div className="w-6 h-6 rounded bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center">
                G
              </div>
              <h2 className="text-base font-bold text-slate-900">{currentCompany?.name}</h2>
            </div>
            <p className="text-[11px] text-slate-500">
              {currentCompany?.address} • TIN: {currentCompany?.tax_id}
            </p>
          </div>

          <div className="text-right">
            <h1 className="text-lg font-black text-slate-900 uppercase tracking-wide">
              {activeReport === 'trial_balance' && t('reports.trial_balance')}
              {activeReport === 'pnl' && t('reports.profit_loss')}
              {activeReport === 'balance_sheet' && t('reports.balance_sheet')}
              {activeReport === 'cash_flow' && t('reports.cash_flow')}
              {activeReport === 'tax' && t('reports.tax_report')}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeReport === 'trial_balance' || activeReport === 'balance_sheet'
                ? `${t('reports.as_of')} ${formatDate(asOfDate)}`
                : `Period: ${formatDate(startDate)} to ${formatDate(endDate)}`}
            </p>
          </div>
        </div>

        {/* 1. Trial Balance Content */}
        {activeReport === 'trial_balance' && data && (
          <div className="space-y-4">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold border-b-2 border-slate-300">
                <tr>
                  <th className="py-2.5 px-3">Account Code</th>
                  <th className="py-2.5 px-3">Account Name</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Debit Balance</th>
                  <th className="py-2.5 px-3 text-right">Credit Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {data.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-blue-600">{row.code}</td>
                    <td className="py-2 px-3 font-sans font-medium text-slate-800">{row.name}</td>
                    <td className="py-2 px-3 font-sans text-slate-500 text-[11px]">{row.type}</td>
                    <td className="py-2 px-3 text-right text-slate-800">
                      {row.netDebit > 0 ? formatCurrency(row.netDebit) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-800">
                      {row.netCredit > 0 ? formatCurrency(row.netCredit) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-900 font-bold bg-slate-50 text-sm">
                <tr>
                  <td colSpan={3} className="py-3 px-3 text-right text-slate-800 font-sans">
                    Total Balanced Ledger Amounts:
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-900">
                    {formatCurrency(data.netDebitTotal)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-900">
                    {formatCurrency(data.netCreditTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Trial Balance Equality Notice */}
            <div
              className={`p-3 rounded-lg border flex items-center justify-between text-xs font-semibold ${
                data.isBalanced
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-rose-50 border-rose-300 text-rose-800'
              }`}
            >
              <div className="flex items-center space-x-2">
                {data.isBalanced ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                <span>
                  {data.isBalanced
                    ? 'Audit Check: Trial Balance is mathematically balanced (Total Debits = Total Credits).'
                    : 'Alert: Trial balance is out of balance.'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 2. Profit & Loss Content */}
        {activeReport === 'pnl' && data && (
          <div className="max-w-2xl mx-auto space-y-6 text-xs">
            {/* Revenue */}
            <div>
              <div className="flex justify-between font-bold text-sm text-slate-900 border-b border-slate-300 pb-1 mb-2 uppercase">
                <span>{t('reports.operating_revenue')}</span>
                <span className="font-mono text-blue-700">{formatCurrency(data.totalRevenue)}</span>
              </div>
              <div className="space-y-1 pl-4">
                {data.revenueRows.map((r, i) => (
                  <div key={i} className="flex justify-between text-slate-700 py-1">
                    <span>{r.name}</span>
                    <span className="font-mono font-medium">{formatCurrency(r.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* COGS */}
            <div>
              <div className="flex justify-between font-bold text-sm text-slate-900 border-b border-slate-300 pb-1 mb-2 uppercase">
                <span>{t('reports.cost_of_sales')}</span>
                <span className="font-mono text-rose-600">({formatCurrency(data.totalCogs)})</span>
              </div>
              <div className="space-y-1 pl-4">
                {data.cogsRows.map((r, i) => (
                  <div key={i} className="flex justify-between text-slate-700 py-1">
                    <span>{r.name}</span>
                    <span className="font-mono font-medium">{formatCurrency(r.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Gross Profit */}
            <div className="bg-slate-100 p-3 rounded-lg flex justify-between font-extrabold text-sm text-slate-900 border border-slate-300">
              <span>{t('reports.gross_profit')}</span>
              <span className="font-mono text-blue-800">{formatCurrency(data.grossProfit)}</span>
            </div>

            {/* Expenses */}
            <div>
              <div className="flex justify-between font-bold text-sm text-slate-900 border-b border-slate-300 pb-1 mb-2 uppercase">
                <span>{t('reports.operating_expenses')}</span>
                <span className="font-mono text-rose-600">({formatCurrency(data.totalExpenses)})</span>
              </div>
              <div className="space-y-1 pl-4">
                {data.expenseRows.map((r, i) => (
                  <div key={i} className="flex justify-between text-slate-700 py-1">
                    <span>{r.name}</span>
                    <span className="font-mono font-medium">{formatCurrency(r.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Net Income */}
            <div className="bg-blue-50 border-2 border-blue-600 p-4 rounded-xl flex justify-between font-black text-base text-slate-900 shadow-sm">
              <span>{t('reports.net_income')}</span>
              <span
                className={`font-mono text-lg ${
                  data.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatCurrency(data.netProfit)}
              </span>
            </div>
          </div>
        )}

        {/* 3. Balance Sheet Content */}
        {activeReport === 'balance_sheet' && data && (
          <div className="max-w-3xl mx-auto space-y-6 text-xs">
            {/* Assets */}
            <div>
              <div className="flex justify-between font-extrabold text-sm text-slate-900 border-b-2 border-slate-800 pb-1.5 mb-2 uppercase tracking-wide">
                <span>{t('reports.total_assets')}</span>
                <span className="font-mono text-blue-700">{formatCurrency(data.assets.total)}</span>
              </div>

              {/* Current Assets */}
              <div className="mb-4">
                <div className="font-bold text-slate-600 uppercase text-[10px] mb-1 pl-2">
                  {t('reports.current_assets')}
                </div>
                <div className="space-y-1 pl-4">
                  {data.assets.current.map((a, i) => (
                    <div key={i} className="flex justify-between py-1 text-slate-700 border-b border-slate-100">
                      <span>
                        {a.code} - {a.name}
                      </span>
                      <span className="font-mono font-medium">{formatCurrency(a.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fixed Assets */}
              {data.assets.fixed.length > 0 && (
                <div>
                  <div className="font-bold text-slate-600 uppercase text-[10px] mb-1 pl-2">
                    {t('reports.fixed_assets')}
                  </div>
                  <div className="space-y-1 pl-4">
                    {data.assets.fixed.map((a, i) => (
                      <div key={i} className="flex justify-between py-1 text-slate-700 border-b border-slate-100">
                        <span>
                          {a.code} - {a.name}
                        </span>
                        <span className="font-mono font-medium">{formatCurrency(a.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Liabilities */}
            <div>
              <div className="flex justify-between font-extrabold text-sm text-slate-900 border-b-2 border-slate-800 pb-1.5 mb-2 uppercase tracking-wide">
                <span>{t('reports.total_liabilities')}</span>
                <span className="font-mono text-slate-800">{formatCurrency(data.liabilities.total)}</span>
              </div>

              {data.liabilities.current.length > 0 && (
                <div className="mb-4">
                  <div className="font-bold text-slate-600 uppercase text-[10px] mb-1 pl-2">
                    {t('reports.current_liabilities')}
                  </div>
                  <div className="space-y-1 pl-4">
                    {data.liabilities.current.map((l, i) => (
                      <div key={i} className="flex justify-between py-1 text-slate-700 border-b border-slate-100">
                        <span>
                          {l.code} - {l.name}
                        </span>
                        <span className="font-mono font-medium">{formatCurrency(l.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.liabilities.longTerm.length > 0 && (
                <div>
                  <div className="font-bold text-slate-600 uppercase text-[10px] mb-1 pl-2">
                    {t('reports.long_term_liabilities')}
                  </div>
                  <div className="space-y-1 pl-4">
                    {data.liabilities.longTerm.map((l, i) => (
                      <div key={i} className="flex justify-between py-1 text-slate-700 border-b border-slate-100">
                        <span>
                          {l.code} - {l.name}
                        </span>
                        <span className="font-mono font-medium">{formatCurrency(l.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Equity */}
            <div>
              <div className="flex justify-between font-extrabold text-sm text-slate-900 border-b-2 border-slate-800 pb-1.5 mb-2 uppercase tracking-wide">
                <span>{t('reports.total_equity')}</span>
                <span className="font-mono text-indigo-700">{formatCurrency(data.equity.total)}</span>
              </div>
              <div className="space-y-1 pl-4">
                {data.equity.rows.map((eq, i) => (
                  <div key={i} className="flex justify-between py-1 text-slate-700 border-b border-slate-100">
                    <span className="font-medium">{eq.name}</span>
                    <span className="font-mono font-bold">{formatCurrency(eq.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total Liabilities & Equity Checking Bar */}
            <div className="bg-slate-100 p-4 rounded-xl border border-slate-300 flex justify-between font-black text-sm text-slate-900">
              <span>{t('reports.total_liab_equity')}</span>
              <span className="font-mono text-base">{formatCurrency(data.totalLiabilitiesAndEquity)}</span>
            </div>

            {/* Double Entry Equality Validator */}
            <div
              className={`p-3 rounded-lg border flex items-center justify-between text-xs font-semibold ${
                data.isBalanced
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-rose-50 border-rose-300 text-rose-800'
              }`}
            >
              <div className="flex items-center space-x-2">
                {data.isBalanced ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                <span>
                  {data.isBalanced
                    ? 'Fundamental Accounting Identity Satisfied: Total Assets = Total Liabilities + Total Equity'
                    : `Discrepancy detected: ${formatCurrency(data.difference)}`}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 4. Cash Flow Statement Content */}
        {activeReport === 'cash_flow' && data && (
          <div className="max-w-2xl mx-auto space-y-4 text-xs">
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-slate-200">
                <span className="font-bold text-slate-800">Net Operating Income (P&L):</span>
                <span className="font-mono font-semibold">{formatCurrency(data.netIncome)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-200 text-slate-700">
                <span>Cash Receipts from Customers & Inflows:</span>
                <span className="font-mono text-emerald-600 font-semibold">
                  +{formatCurrency(data.cashReceiptsFromCustomers)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-200 text-slate-700">
                <span>Cash Payments to Suppliers & Operating Expenses:</span>
                <span className="font-mono text-rose-600 font-semibold">
                  -{formatCurrency(data.cashPaidToSuppliersAndExpenses)}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg flex justify-between font-bold text-slate-900">
                <span>Net Cash Generated from Operations:</span>
                <span className="font-mono">{formatCurrency(data.netOperatingCash)}</span>
              </div>

              <div className="pt-4 border-t border-slate-300 space-y-2">
                <div className="flex justify-between py-1 text-slate-600">
                  <span>Cash & Bank Balances at Beginning of Period:</span>
                  <span className="font-mono font-semibold">{formatCurrency(data.beginningCash)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-600">
                  <span>Net Change in Liquidity:</span>
                  <span className="font-mono font-semibold">
                    {data.netChangeInCash >= 0 ? '+' : ''}{formatCurrency(data.netChangeInCash)}
                  </span>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg flex justify-between font-black text-sm text-blue-900">
                  <span>Cash & Bank Balances at End of Period:</span>
                  <span className="font-mono">{formatCurrency(data.endingCash)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5. Tax Report Content */}
        {activeReport === 'tax' && data && (
          <div className="max-w-2xl mx-auto space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">
                  {t('reports.output_tax')}
                </div>
                <div className="text-xl font-black text-slate-900 font-mono mt-1">
                  {formatCurrency(data.outputTax)}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  Taxable Base: {formatCurrency(data.taxableSales)}
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">
                  {t('reports.input_tax')}
                </div>
                <div className="text-xl font-black text-slate-900 font-mono mt-1">
                  {formatCurrency(data.inputTax)}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  Taxable Base: {formatCurrency(data.taxablePurchases)}
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border-2 border-blue-600 p-5 rounded-xl flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900">{t('reports.net_tax_payable')}</h3>
                <p className="text-[11px] text-slate-600">Output VAT Collected minus Deductible Input VAT</p>
              </div>
              <div
                className={`text-xl font-black font-mono ${
                  data.netTaxPayable >= 0 ? 'text-blue-700' : 'text-emerald-700'
                }`}
              >
                {formatCurrency(data.netTaxPayable)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
