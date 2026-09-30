import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { daysInMonth, firstWeekday, nowInTimezone, shiftMonth } from '../lib/dates';
import { formatDate, formatMoney, formatMonth, formatPct, formatR, pnlClass } from '../lib/format';
import { Card, ErrorBanner, ResultBadge, Spinner } from './ui';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function TradeCalendar() {
  const { user, currency } = useAuth();
  const today = nowInTimezone(user?.timezone).date;
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(null);
  const { data, loading, error, reload } = useApi('/analytics/calendar', { month });
  const dayTrades = useApi(selected ? '/trades' : null, selected ? { from: selected, to: selected, sort: 'oldest', limit: 100 } : undefined);

  const byDate = useMemo(() => new Map((data?.days || []).map((d) => [d.date, d])), [data]);
  const cells = [];
  for (let i = 0; i < firstWeekday(month); i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth(month); d += 1) cells.push(`${month}-${String(d).padStart(2, '0')}`);

  const changeMonth = (delta) => {
    setMonth((m) => shiftMonth(m, delta));
    setSelected(null);
  };
  const s = data?.summary;

  return (
    <div className="space-y-4">
      <Card
        title={formatMonth(month)}
        action={
          <div className="flex items-center gap-1">
            <button type="button" className="btn-ghost p-1.5" onClick={() => changeMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => { setMonth(today.slice(0, 7)); setSelected(null); }}>
              Today
            </button>
            <button type="button" className="btn-ghost p-1.5" onClick={() => changeMonth(1)} aria-label="Next month">
              <ChevronRight size={16} />
            </button>
          </div>
        }
      >
        {error && <ErrorBanner message={error} onRetry={reload} />}
        {s && s.totalTrades > 0 && (
          <p className="mb-3 text-sm text-muted">
            {s.totalTrades} closed trades · Win rate {formatPct(s.winRate)} ·{' '}
            <span className={pnlClass(s.netPnL)}>{formatMoney(s.netPnL, currency, { signed: true })}</span> · {formatR(s.totalR)} total
          </p>
        )}
        <div className={`grid grid-cols-7 gap-1 ${loading ? 'opacity-60' : ''}`}>
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-1 text-center text-[11px] font-medium text-muted">
              <span className="hidden sm:inline">{w}</span>
              <span className="sm:hidden">{w[0]}</span>
            </div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`blank-${i}`} />;
            const d = byDate.get(date);
            const hasClosed = d && d.closedTrades > 0;
            const tone = !d
              ? 'border-line/50 bg-bg/40'
              : !hasClosed
                ? 'border-accent/40 bg-accent/5'
                : d.netPnL > 0
                  ? 'border-profit/40 bg-profit/10'
                  : d.netPnL < 0
                    ? 'border-loss/40 bg-loss/10'
                    : 'border-line bg-raised';
            return (
              <button
                key={date}
                type="button"
                disabled={!d}
                onClick={() => setSelected(date === selected ? null : date)}
                aria-label={`${formatDate(date)}${d ? `: ${d.trades} trades, ${formatMoney(d.netPnL, currency, { signed: true })}` : ': no trades'}`}
                className={`flex min-h-[56px] flex-col rounded-md border p-1 text-left sm:min-h-[84px] sm:p-1.5 ${tone} ${
                  selected === date ? 'ring-2 ring-accent' : ''
                } ${d ? 'hover:brightness-125' : 'cursor-default'} ${date === today ? 'outline outline-1 outline-soft/40' : ''}`}
              >
                <span className="text-[11px] text-muted">{Number(date.slice(-2))}</span>
                {d && (
                  <span className="mt-auto space-y-0.5">
                    <span className={`num block truncate text-[10px] font-semibold sm:text-xs ${pnlClass(d.netPnL)}`}>
                      {hasClosed ? formatMoney(d.netPnL, currency, { signed: true, compact: true }) : 'Open'}
                    </span>
                    <span className="hidden text-[10px] text-muted sm:block">
                      {d.trades} trade{d.trades > 1 ? 's' : ''}
                      {hasClosed && ` · ${formatR(d.totalR)}`}
                    </span>
                    {hasClosed && (
                      <span className="hidden text-[10px] text-muted sm:block">
                        {d.wins}W {d.losses}L{d.breakevens ? ` ${d.breakevens}BE` : ''}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-profit/40 bg-profit/10" /> Positive P&amp;L</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-loss/40 bg-loss/10" /> Negative P&amp;L</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-accent/40 bg-accent/5" /> Open trades only</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-line/50 bg-bg/40" /> No trades</span>
        </div>
      </Card>

      {selected && (
        <Card title={`Trades on ${formatDate(selected)}`}>
          {dayTrades.loading ? (
            <Spinner />
          ) : dayTrades.error ? (
            <ErrorBanner message={dayTrades.error} />
          ) : (
            <ul className="divide-y divide-line">
              {(dayTrades.data?.trades || []).map((t) => (
                <li key={t._id}>
                  <Link to={`/trades/${t._id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-raised/40">
                    <span className="min-w-0">
                      <span className="font-medium">{t.asset}</span>{' '}
                      <span className="text-xs text-muted">
                        {t.direction === 'long' ? '▲ Long' : '▼ Short'} {t.time && `· ${t.time}`} {t.strategyName && `· ${t.strategyName}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className={`num text-sm font-medium ${pnlClass(t.netPnL)}`}>{formatMoney(t.netPnL, currency, { signed: true })}</span>
                      <span className={`num hidden text-xs sm:inline ${pnlClass(t.rMultiple)}`}>{formatR(t.rMultiple)}</span>
                      <ResultBadge result={t.result} status={t.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
