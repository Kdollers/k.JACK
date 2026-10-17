import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { Printer, Download, X, Calendar, FileText } from 'lucide-react';
import { apiRequest } from '../services/api';

export default function StatementModal({ entityId, entityType = 'CUSTOMER', onClose }) {
  const { currentCompany, formatCurrency, formatDate } = useApp();
  const { t } = useI18n();

  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const isCustomer = entityType === 'CUSTOMER';
  const endpoint = isCustomer ? `/api/customers/${entityId}/statement` : `/api/suppliers/${entityId}/statement`;

  const fetchStatement = async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`${endpoint}?startDate=${startDate}&endDate=${endDate}`);
      setStatement(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatement();
  }, [entityId, startDate, endDate]);

  const exportCSV = () => {
    if (!statement || !statement.transactions) return;
    const entity = statement.customer || statement.supplier;
    const headers = ['Date', 'Type', 'Reference', 'Debit/Amount', 'Credit/Payment', 'Running Balance'];
    const rows = statement.transactions.map((t) => [
      t.date,
      t.type,
      `"${t.reference || ''}"`,
      t.amount || 0,
      t.credit || 0,
      t.balance || 0
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `statement-${entity?.code || 'entity'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const entity = statement?.customer || statement?.supplier;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-xl shadow-2xl max-w-4xl w-full my-8 overflow-hidden print:m-0 print:p-0 print:w-full">
        {/* Header Controls */}
        <div className="bg-slate-800 text-white px-6 py-3 flex items-center justify-between print:hidden">
          <div className="flex items-center space-x-3">
            <FileText className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-sm">
              {isCustomer ? t('customers.statement_title') : t('suppliers.statement_title')}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1.5 bg-slate-700/80 px-2 py-1 rounded text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-300" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-white border-none text-[11px] focus:outline-none"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-white border-none text-[11px] focus:outline-none"
              />
            </div>

            <button
              onClick={exportCSV}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2.5 py-1.5 rounded text-xs font-medium flex items-center space-x-1 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('common.export_csv')}</span>
            </button>

            <button
              onClick={() => window.print()}
              className="bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded text-xs font-medium flex items-center space-x-1 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t('common.print')}</span>
            </button>

            <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 sm:p-10 text-xs bg-white min-h-[500px]">
          {loading ? (
            <div className="text-center py-20 text-slate-400 font-medium">{t('common.loading')}</div>
          ) : (
            <div>
              {/* Statement Header */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-5 mb-6">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">{currentCompany?.name}</h1>
                  <p className="text-slate-500 text-[11px]">
                    {currentCompany?.address} • TIN: {currentCompany?.tax_id}
                  </p>
                </div>
                <div className="text-right">
                  <h2 className="text-xl font-black text-slate-800 uppercase tracking-wide">
                    {isCustomer ? 'STATEMENT OF ACCOUNT' : 'SUPPLIER RECONCILIATION'}
                  </h2>
                  <p className="text-slate-500 text-[11px]">
                    Period: {formatDate(startDate)} — {formatDate(endDate)}
                  </p>
                </div>
              </div>

              {/* Entity Info & Balances */}
              <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Account Info</div>
                  <div className="font-bold text-sm text-slate-900">{entity?.name}</div>
                  <div className="text-slate-600 font-mono text-[11px]">Code: {entity?.code}</div>
                  {entity?.address && <div className="text-slate-600">{entity.address}</div>}
                  {entity?.phone && <div className="text-slate-600">Tel: {entity.phone}</div>}
                </div>
                <div className="text-right flex flex-col justify-center space-y-1">
                  <div className="flex justify-between sm:justify-end sm:space-x-4 text-slate-600">
                    <span>{t('customers.opening_balance')}:</span>
                    <span className="font-bold font-mono text-slate-800">
                      {formatCurrency(statement?.openingBalance || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between sm:justify-end sm:space-x-4 text-base font-extrabold text-blue-700">
                    <span>{t('customers.closing_balance')}:</span>
                    <span className="font-mono">{formatCurrency(statement?.closingBalance || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto mb-6">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-slate-300 bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2 px-3">{t('common.date')}</th>
                      <th className="py-2 px-3">{t('common.type')}</th>
                      <th className="py-2 px-3">{t('common.reference')}</th>
                      <th className="py-2 px-3 text-right">{isCustomer ? 'Invoice Amount' : 'Bill Amount'}</th>
                      <th className="py-2 px-3 text-right">Payment / Credit</th>
                      <th className="py-2 px-3 text-right">{t('accounting.running_balance')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {statement?.transactions && statement.transactions.length > 0 ? (
                      statement.transactions.map((tx, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-medium text-slate-700">{formatDate(tx.date)}</td>
                          <td className="py-2 px-3">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                              {tx.type}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-800 font-medium">{tx.reference}</td>
                          <td className="py-2 px-3 text-right font-mono font-medium text-slate-800">
                            {tx.amount > 0 ? formatCurrency(tx.amount) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-medium text-emerald-600">
                            {tx.credit > 0 ? formatCurrency(tx.credit) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(tx.balance)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          {t('common.no_data')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
