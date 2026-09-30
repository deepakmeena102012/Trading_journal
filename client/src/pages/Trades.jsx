import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight, Filter, PlusCircle, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { DIRECTIONS, MARKETS, RESULTS, labelOf } from '../lib/constants';
import { formatDate, formatMoney, formatPrice, formatR, pnlClass } from '../lib/format';
import { Card, DirectionBadge, EmptyState, ErrorBanner, PageHeader, ResultBadge, Spinner } from '../components/ui';

const FILTER_KEYS = ['from', 'to', 'asset', 'market', 'strategyId', 'setup', 'direction', 'result', 'timeframe', 'session'];
const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'pnl_desc', label: 'Highest P&L' },
  { value: 'pnl_asc', label: 'Lowest P&L' },
  { value: 'r_desc', label: 'Highest R' },
  { value: 'r_asc', label: 'Lowest R' },
];
const PAGE_SIZE = 50;

export default function Trades() {
  const { currency } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(() => FILTER_KEYS.some((k) => params.get(k)));
  const [search, setSearch] = useState(params.get('q') || '');

  const query = useMemo(() => {
    const q = { sort: params.get('sort') || 'newest', page: params.get('page') || '1', limit: PAGE_SIZE };
    for (const k of [...FILTER_KEYS, 'q']) if (params.get(k)) q[k] = params.get(k);
    return q;
  }, [params]);

  const { data, loading, error, reload } = useApi('/trades', query);
  const meta = useApi('/trades/meta');
  const strategies = useApi('/strategies');

  // Debounce the search box into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') || '') !== search) update({ q: search });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  }

  function clearFilters() {
    const next = new URLSearchParams();
    if (params.get('sort')) next.set('sort', params.get('sort'));
    setSearch('');
    setParams(next, { replace: true });
  }

  const activeFilters = FILTER_KEYS.filter((k) => params.get(k)).length;
  const page = Number(query.page);

  const select = (key, options, allLabel) => (
    <select className="input" value={params.get(key) || ''} onChange={(e) => update({ [key]: e.target.value })} aria-label={allLabel}>
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  const opts = (arr = []) => arr.map((v) => ({ value: v, label: v }));

  return (
    <>
      <PageHeader
        title="Trades"
        subtitle={data ? `${data.total} trade${data.total === 1 ? '' : 's'}` : ' '}
        actions={
          <Link to="/trades/new" className="btn-primary">
            <PlusCircle size={16} /> Add trade
          </Link>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            className="input pl-9"
            placeholder="Search asset, setup, strategy, notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search trades"
          />
        </div>
        <select className="input w-auto" value={query.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn-secondary" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          <Filter size={15} /> Filters{activeFilters ? ` (${activeFilters})` : ''}
        </button>
      </div>

      {showFilters && (
        <div className="card mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label" htmlFor="f-from">From</label>
            <input id="f-from" type="date" className="input" value={params.get('from') || ''} onChange={(e) => update({ from: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="f-to">To</label>
            <input id="f-to" type="date" className="input" value={params.get('to') || ''} onChange={(e) => update({ to: e.target.value })} />
          </div>
          <div>
            <span className="label">Asset</span>
            {select('asset', opts(meta.data?.assets), 'All assets')}
          </div>
          <div>
            <span className="label">Market</span>
            {select('market', MARKETS, 'All markets')}
          </div>
          <div>
            <span className="label">Strategy</span>
            {select(
              'strategyId',
              [...(strategies.data?.strategies || []).map((s) => ({ value: s._id, label: s.name })), { value: 'none', label: 'No strategy' }],
              'All strategies'
            )}
          </div>
          <div>
            <span className="label">Setup</span>
            {select('setup', opts(meta.data?.setups), 'All setups')}
          </div>
          <div>
            <span className="label">Direction</span>
            {select('direction', DIRECTIONS, 'Long & short')}
          </div>
          <div>
            <span className="label">Result</span>
            {select('result', [...RESULTS, { value: 'open', label: 'Open' }], 'All results')}
          </div>
          <div>
            <span className="label">Timeframe</span>
            {select('timeframe', opts(meta.data?.timeframes), 'All timeframes')}
          </div>
          <div>
            <span className="label">Session</span>
            {select('session', opts(meta.data?.sessions), 'All sessions')}
          </div>
          {activeFilters > 0 && (
            <div className="sm:col-span-2 lg:col-span-5">
              <button type="button" className="btn-ghost px-2 text-xs" onClick={clearFilters}>
                <X size={14} /> Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={reload} />}

      {loading && !data ? (
        <Spinner />
      ) : data && data.trades.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title={activeFilters || query.q ? 'No trades match these filters' : 'No trades yet'}
            message={activeFilters || query.q ? 'Try changing or clearing the filters.' : 'Record your first trade to start building your journal.'}
            action={
              activeFilters || query.q ? (
                <button type="button" className="btn-secondary" onClick={clearFilters}>Clear filters</button>
              ) : (
                <Link to="/trades/new" className="btn-primary"><PlusCircle size={16} /> Add trade</Link>
              )
            }
          />
        </Card>
      ) : data ? (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          {/* Desktop table */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Asset</th>
                  <th className="px-4 py-3 font-medium">Direction</th>
                  <th className="px-4 py-3 font-medium">Strategy</th>
                  <th className="px-4 py-3 text-right font-medium">Entry</th>
                  <th className="px-4 py-3 text-right font-medium">Exit</th>
                  <th className="px-4 py-3 text-right font-medium">P&amp;L</th>
                  <th className="px-4 py-3 text-right font-medium">R</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {data.trades.map((t) => (
                  <tr
                    key={t._id}
                    className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-raised/50"
                    onClick={() => navigate(`/trades/${t._id}`)}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link to={`/trades/${t._id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                        {formatDate(t.date)}
                      </Link>
                      {t.time && <span className="ml-1.5 text-xs text-muted">{t.time}</span>}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {t.asset}
                      <span className="ml-1.5 text-xs font-normal text-muted">{labelOf(MARKETS, t.market)}</span>
                    </td>
                    <td className="px-4 py-3"><DirectionBadge direction={t.direction} /></td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-soft">
                      {t.strategyName || '—'}
                      {t.setup && <span className="block truncate text-xs text-muted">{t.setup}</span>}
                    </td>
                    <td className="num px-4 py-3 text-right">{formatPrice(t.entryPrice)}</td>
                    <td className="num px-4 py-3 text-right">{formatPrice(t.exitPrice)}</td>
                    <td className={`num px-4 py-3 text-right font-medium ${pnlClass(t.netPnL)}`}>{formatMoney(t.netPnL, currency, { signed: true })}</td>
                    <td className={`num px-4 py-3 text-right ${pnlClass(t.rMultiple)}`}>{formatR(t.rMultiple)}</td>
                    <td className="px-4 py-3"><ResultBadge result={t.result} status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {data.trades.map((t) => (
              <li key={t._id}>
                <Link to={`/trades/${t._id}`} className="card block p-3.5 active:bg-raised">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {t.asset} <span className="text-xs font-normal text-muted">{t.direction === 'long' ? '▲ Long' : '▼ Short'}</span>
                      </p>
                      <p className="truncate text-xs text-muted">
                        {formatDate(t.date)} {t.time} · {t.strategyName || 'No strategy'}
                      </p>
                    </div>
                    <ResultBadge result={t.result} status={t.status} />
                  </div>
                  <div className="mt-2.5 flex items-end justify-between text-xs">
                    <span className="num text-muted">
                      {formatPrice(t.entryPrice)} → {formatPrice(t.exitPrice)}
                    </span>
                    <span className="text-right">
                      <span className={`num block text-sm font-semibold ${pnlClass(t.netPnL)}`}>
                        {formatMoney(t.netPnL, currency, { signed: true })}
                      </span>
                      <span className={`num ${pnlClass(t.rMultiple)}`}>{formatR(t.rMultiple)}</span>
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {data.pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <button type="button" className="btn-secondary px-2.5" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page">
                <ChevronLeft size={16} />
              </button>
              <span className="text-muted">
                Page {page} of {data.pages}
              </span>
              <button type="button" className="btn-secondary px-2.5" disabled={page >= data.pages} onClick={() => update({ page: String(page + 1) })} aria-label="Next page">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
