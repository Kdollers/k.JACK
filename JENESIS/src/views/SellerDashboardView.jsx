import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../services/api';
import InvoicePrintModal from '../components/InvoicePrintModal';
import { requestNewSale } from '../sellerIntents';
import {
  ShoppingCart,
  Receipt,
  Users,
  Package,
  Search,
  Printer,
  Wallet,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw
} from 'lucide-react';

/**
 * JENESIS Seller — the counter.
 *
 * The Seller used to be shown the accounting dashboard: profit and loss, the
 * balance sheet, receivables, payables, the general ledger. That is a
 * bookkeeper's desk handed to someone whose job is selling, and it told them
 * things they have no business seeing on a shop floor.
 *
 * This screen answers the seller's own question instead:
 *
 *   What did I sell today? What can I sell right now? What is in the till?
 *
 * Every figure here comes from one endpoint — GET /api/seller/dashboard —
 * which is built for the counter and cannot return a profit, a margin or a
 * balance-sheet line, because it never asks the database for one. Hiding the
 * accounting menu was never going to be enough on its own; the service refuses
 * the accounting routes when a request arrives from JENESIS Seller, whoever is
 * signed in.
 *
 * The database is not separate. A sale written from this window is the same
 * invoice, the same journal entry and the same stock movement the accountant
 * reconciles at the end of the day.
 */

/** How a product's availability reads. */
const AVAILABILITY_STYLE = {
  IN_STOCK: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  LOW: 'bg-amber-100 text-amber-800 border-amber-200',
  OUT: 'bg-rose-100 text-rose-800 border-rose-200'
};

function Panel({ title, icon, action, children, className = '' }) {
  // Assigned rather than renamed in the parameter list: a component held in a
  // variable must be a real binding in this file's scope, which the interface
  // checker (tests/ui-imports.test.js) verifies for every screen.
  const Icon = icon;
  return (
    <section className={`bg-surface border border-line rounded-xl shadow-sm overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <h2 className="text-sm font-bold flex items-center space-x-2">
          {Icon ? <Icon className="w-4 h-4 j-text" /> : null}
          <span>{title}</span>
        </h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Figure({ label, value, sub, icon, tone = 'default' }) {
  const Icon = icon;
  const tones = {
    default: 'bg-surface text-ink',
    accent: 'j-bg-soft j-text',
    warning: 'bg-amber-100 text-amber-800'
  };
  return (
    <div className={`rounded-xl border border-line p-4 ${tones[tone] || tones.default}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">{label}</span>
        {Icon ? <Icon className="w-4 h-4 opacity-70" /> : null}
      </div>
      <div className="mt-1.5 text-xl font-black font-mono tracking-tight">{value}</div>
      {sub ? <div className="mt-1 text-[10px] opacity-75">{sub}</div> : null}
    </div>
  );
}

export default function SellerDashboardView({ initialData = null }) {
  const { formatCurrency, formatDate, showToast, refreshKey, setActiveView } = useApp();
  const { t } = useI18n();

  // `initialData` exists so the screen can be drawn from figures it is given,
  // which is how its content is proved without a browser: the test hands it a
  // day's trading and reads the markup back. In the application it is always
  // null and the screen fetches for itself.
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [printing, setPrinting] = useState(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiRequest('/api/seller/dashboard'));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (initialData) return; // drawn from what it was given
    fetchDashboard();
  }, [fetchDashboard, refreshKey, initialData]);

  // Product search: what it costs the customer, and whether it is on the
  // shelf. Read-only — nothing here changes a price or a stock level.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setSearching(true);
      try {
        const list = await apiRequest(`/api/seller/products?search=${encodeURIComponent(search)}`);
        if (!cancelled) setResults(Array.isArray(list) ? list : []);
      } catch (err) {
        if (!cancelled) showToast(err.message, 'error');
      } finally {
        if (!cancelled) setSearching(false);
      }
    };
    const timer = setTimeout(run, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, showToast]);

  const openNewSale = () => {
    // The Sales screen owns the invoice form, so it is opened and asked to
    // start a new sale — the same form, the same posting, the same journal
    // entry. Nothing is duplicated here.
    requestNewSale();
    setActiveView('sales');
  };

  const printSale = async (sale) => {
    try {
      const invoice = await apiRequest(`/api/sales/invoices/${sale.id}`);
      setPrinting(invoice);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const today = data?.today || { count: 0, total: 0, cash: 0, credit: 0, tax: 0 };
  const register = data?.register || { open: false, accounts: [], total: 0 };
  const lowStock = data?.stock?.lowStock || [];
  const recent = data?.recentSales || [];
  const week = data?.week || [];

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24 text-[rgb(var(--j-ink-muted))] text-xs">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header: the counter, and the day it is working through */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('seller.title')}</h1>
          <p className="text-xs text-[rgb(var(--j-ink-muted))] mt-0.5">{t('seller.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchDashboard}
            className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold hover:bg-surface-hover j-ring"
          >
            <RefreshCw className={`w-3.5 h-3.5 inline mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
          <button
            type="button"
            onClick={openNewSale}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white j-bg hover:opacity-90 shadow j-ring"
          >
            <ShoppingCart className="w-3.5 h-3.5 inline mr-1.5" />
            {t('seller.new_sale')}
          </button>
        </div>
      </div>

      {/* The four things a seller needs before anything else */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={openNewSale}
          className="rounded-xl border border-line bg-surface p-4 text-left hover:bg-surface-hover transition j-ring"
        >
          <ShoppingCart className="w-5 h-5 j-text" />
          <div className="mt-2 text-xs font-bold">{t('seller.new_sale')}</div>
          <div className="text-[10px] text-[rgb(var(--j-ink-subtle))]">{t('seller.new_sale_hint')}</div>
        </button>
        <button
          type="button"
          onClick={() => setActiveView('sales')}
          className="rounded-xl border border-line bg-surface p-4 text-left hover:bg-surface-hover transition j-ring"
        >
          <Receipt className="w-5 h-5 j-text" />
          <div className="mt-2 text-xs font-bold">{t('seller.sales_history')}</div>
          <div className="text-[10px] text-[rgb(var(--j-ink-subtle))]">{t('seller.sales_history_hint')}</div>
        </button>
        <button
          type="button"
          onClick={() => setActiveView('customers')}
          className="rounded-xl border border-line bg-surface p-4 text-left hover:bg-surface-hover transition j-ring"
        >
          <Users className="w-5 h-5 j-text" />
          <div className="mt-2 text-xs font-bold">{t('seller.customers')}</div>
          <div className="text-[10px] text-[rgb(var(--j-ink-subtle))]">{t('seller.customers_hint')}</div>
        </button>
        <button
          type="button"
          onClick={() => setActiveView('inventory')}
          className="rounded-xl border border-line bg-surface p-4 text-left hover:bg-surface-hover transition j-ring"
        >
          <Package className="w-5 h-5 j-text" />
          <div className="mt-2 text-xs font-bold">{t('seller.stock')}</div>
          <div className="text-[10px] text-[rgb(var(--j-ink-subtle))]">{t('seller.stock_hint')}</div>
        </button>
      </div>

      {/* Today, in four figures */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Figure
          label={t('seller.sales_today')}
          value={formatCurrency(today.total)}
          sub={`${today.count} ${t('seller.sales_count')}`}
          icon={TrendingUp}
          tone="accent"
        />
        <Figure
          label={t('seller.cash_today')}
          value={formatCurrency(today.cash)}
          sub={t('seller.cash_today_hint')}
          icon={Wallet}
        />
        <Figure
          label={t('seller.credit_today')}
          value={formatCurrency(today.credit)}
          sub={t('seller.credit_today_hint')}
          icon={Clock}
        />
        <Figure
          label={t('seller.restock')}
          value={String(lowStock.length)}
          sub={t('seller.restock_hint')}
          icon={AlertTriangle}
          tone={lowStock.length > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product search and availability */}
        <Panel
          title={t('seller.find_product')}
          icon={Search}
          className="lg:col-span-2"
          action={
            <span className="text-[10px] text-[rgb(var(--j-ink-subtle))]">
              {searching ? t('common.searching') : `${results.length} ${t('seller.found')}`}
            </span>
          }
        >
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[rgb(var(--j-ink-subtle))]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('seller.search_placeholder')}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-line bg-surface text-xs focus:outline-none focus:border-[rgb(var(--j-accent))] j-ring"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[rgb(var(--j-ink-muted))] uppercase text-[10px] font-bold">
                <tr className="border-b border-line">
                  <th className="py-2 px-2">{t('common.name')}</th>
                  <th className="py-2 px-2">{t('inventory.sku')}</th>
                  <th className="py-2 px-2 text-right">{t('seller.price')}</th>
                  <th className="py-2 px-2 text-right">{t('seller.on_hand')}</th>
                  <th className="py-2 px-2 text-center">{t('seller.availability')}</th>
                </tr>
              </thead>
              <tbody>
                {results.length > 0 ? results.map((p) => (
                  <tr key={p.id} className="border-b border-line/60 hover:bg-surface-hover">
                    <td className="py-2 px-2 font-semibold">{p.name}</td>
                    <td className="py-2 px-2 font-mono text-[10px] text-[rgb(var(--j-ink-muted))]">{p.sku}</td>
                    <td className="py-2 px-2 text-right font-mono">{formatCurrency(p.price)}</td>
                    <td className="py-2 px-2 text-right font-mono">
                      {p.onHand} {p.unit || ''}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${AVAILABILITY_STYLE[p.availability] || ''}`}>
                        {t(`seller.avail_${String(p.availability).toLowerCase()}`)}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[rgb(var(--j-ink-subtle))]">
                      {search ? t('seller.no_match') : t('seller.type_to_search')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-[rgb(var(--j-ink-subtle))]">{t('seller.stock_readonly')}</p>
        </Panel>

        {/* The till */}
        <Panel title={t('seller.register')} icon={Wallet}>
          {register.open ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center space-x-2 text-emerald-600 font-bold">
                <CheckCircle className="w-4 h-4" />
                <span>{t('seller.register_open')}</span>
              </div>
              <dl className="space-y-1.5 mt-2">
                <div className="flex justify-between">
                  <dt className="text-[rgb(var(--j-ink-muted))]">{t('seller.register_name')}</dt>
                  <dd className="font-semibold">{register.name || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[rgb(var(--j-ink-muted))]">{t('seller.register_number')}</dt>
                  <dd className="font-mono font-semibold">{register.sessionNumber || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[rgb(var(--j-ink-muted))]">{t('seller.register_opened')}</dt>
                  <dd className="font-semibold">{register.openedAt ? formatDate(register.openedAt) : '—'}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-1.5">
                  <dt className="text-[rgb(var(--j-ink-muted))]">{t('seller.opening_float')}</dt>
                  <dd className="font-mono font-bold">{formatCurrency(register.openingFloat || 0)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex items-center space-x-2 text-[rgb(var(--j-ink-muted))]">
                <XCircle className="w-4 h-4" />
                <span>{t('seller.register_closed')}</span>
              </div>
              {(register.accounts || []).map((a) => (
                <div key={a.id} className="flex justify-between py-1 border-b border-line/60">
                  <span>{a.name}</span>
                  <span className="font-mono font-semibold">{formatCurrency(a.balance)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-1.5 font-bold">
                <span>{t('common.total')}</span>
                <span className="font-mono">{formatCurrency(register.total || 0)}</span>
              </div>
              <p className="text-[10px] text-[rgb(var(--j-ink-subtle))] pt-1">{t('seller.register_note')}</p>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales history, with the receipt for each one */}
        <Panel
          title={t('seller.recent_sales')}
          icon={Receipt}
          className="lg:col-span-2"
          action={
            <button
              type="button"
              onClick={() => setActiveView('sales')}
              className="text-[10px] font-bold j-text hover:underline"
            >
              {t('seller.all_sales')}
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[rgb(var(--j-ink-muted))] uppercase text-[10px] font-bold">
                <tr className="border-b border-line">
                  <th className="py-2 px-2">{t('common.reference')}</th>
                  <th className="py-2 px-2">{t('common.date')}</th>
                  <th className="py-2 px-2">{t('seller.customer')}</th>
                  <th className="py-2 px-2 text-right">{t('common.amount')}</th>
                  <th className="py-2 px-2 text-center">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {recent.length > 0 ? recent.map((sale) => (
                  <tr key={sale.id} className="border-b border-line/60 hover:bg-surface-hover">
                    <td className="py-2 px-2 font-mono font-bold j-text">{sale.number}</td>
                    <td className="py-2 px-2 text-[rgb(var(--j-ink-muted))]">{formatDate(sale.date)}</td>
                    <td className="py-2 px-2">{sale.customer || t('seller.walk_in')}</td>
                    <td className="py-2 px-2 text-right font-mono font-semibold">{formatCurrency(sale.total)}</td>
                    <td className="py-2 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => printSale(sale)}
                        title={t('seller.print_receipt')}
                        className="px-2 py-1 rounded border border-line hover:bg-surface-hover j-ring"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[rgb(var(--j-ink-subtle))]">
                      {t('seller.no_sales_yet')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Daily summary: the last seven days */}
        <Panel title={t('seller.daily_summary')} icon={TrendingUp}>
          <table className="w-full text-left text-xs">
            <thead className="text-[rgb(var(--j-ink-muted))] uppercase text-[10px] font-bold">
              <tr className="border-b border-line">
                <th className="py-2 px-1">{t('common.date')}</th>
                <th className="py-2 px-1 text-right">{t('seller.sales_count')}</th>
                <th className="py-2 px-1 text-right">{t('common.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {week.map((row) => (
                <tr key={row.date} className="border-b border-line/60">
                  <td className="py-1.5 px-1 text-[rgb(var(--j-ink-muted))]">{formatDate(row.date)}</td>
                  <td className="py-1.5 px-1 text-right font-mono">{row.count}</td>
                  <td className="py-1.5 px-1 text-right font-mono font-semibold">{formatCurrency(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {/* What needs restocking — quantities only, never what it cost */}
      {lowStock.length > 0 && (
        <Panel title={t('seller.needs_restock')} icon={AlertTriangle}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {lowStock.map((p) => (
              <div key={p.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs">
                <div className="font-bold truncate">{p.name}</div>
                <div className="text-[10px] font-mono text-[rgb(var(--j-ink-subtle))]">{p.sku}</div>
                <div className="mt-1 flex justify-between">
                  <span className="text-[rgb(var(--j-ink-muted))]">{t('seller.on_hand')}</span>
                  <span className="font-mono font-bold">{p.onHand} {p.unit || ''}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {printing && (
        <InvoicePrintModal invoice={printing} type="INVOICE" onClose={() => setPrinting(null)} />
      )}
    </div>
  );
}
