import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { PERIODS, rangeFor } from '../lib/dates';
import { formatMoney, formatMonth, formatPct, formatR, formatRatio, pnlClass } from '../lib/format';
import { Card, EmptyState, ErrorBanner, PageHeader, Spinner, StatCard, Tabs } from '../components/ui';
import { DrawdownChart, PnLBarChart } from '../components/charts';
import StatsTable from '../components/StatsTable';
import TradeCalendar from '../components/TradeCalendar';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'strategies', label: 'By strategy' },
  { value: 'assets', label: 'By asset' },
  { value: 'checklist', label: 'Checklist analysis' },
  { value: 'breakdown', label: 'Other breakdowns' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'calendar', label: 'Calendar' },
];

function Section({ loading, error, reload, empty, children }) {
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (loading) return <Spinner />;
  if (empty) return <Card><EmptyState icon={BarChart3} title="No closed trades in this period" message="Statistics are calculated from closed trades only." /></Card>;
  return children;
}

function Overview({ range }) {
  const { currency } = useAuth();
  const { data, loading, error, reload } = useApi('/analytics/overview', range);
  const equity = useApi('/analytics/equity', range);
  const money = (v, signed) => formatMoney(v, currency, { signed });

  return (
    <Section loading={loading && !data} error={error} reload={reload} empty={data && data.stats.totalTrades === 0}>
      {data && (() => {
        const { stats: s, equity: e, risk } = data;
        const pf = s.profitFactor === null ? (s.grossProfit > 0 ? '∞' : '—') : formatRatio(s.profitFactor);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <StatCard label="Total trades" value={s.totalTrades} sub={`${s.wins}W · ${s.losses}L · ${s.breakevens}BE`} />
              <StatCard label="Win rate" value={formatPct(s.winRate)} sub={`Loss rate ${formatPct(s.lossRate)}`} />
              <StatCard label="Net P&L" value={money(s.netPnL, true)} valueClass={pnlClass(s.netPnL)} sub={`Costs ${money(s.totalCosts)}`} />
              <StatCard label="Profit factor" value={pf} sub={`${money(s.grossProfit)} / ${money(Math.abs(s.grossLoss))}`} />
              <StatCard label="Expectancy / trade" value={money(s.expectancy, true)} valueClass={pnlClass(s.expectancy)} sub="(Win% × Avg win) − (Loss% × Avg loss)" />
              <StatCard label="Average R" value={formatR(s.avgR)} valueClass={pnlClass(s.avgR)} sub={`Total ${formatR(s.totalR)} · ${s.tradesWithR} trades`} />
              <StatCard label="Average win" value={money(s.avgWin)} sub={`Avg ${formatR(s.avgWinR)}`} />
              <StatCard label="Average loss" value={money(s.avgLoss)} sub={`Avg ${formatR(s.avgLossR)}`} />
              <StatCard label="Max drawdown" value={money(e.maxDrawdown)} sub={formatPct(e.maxDrawdownPct, 2)} />
              <StatCard label="Longest win streak" value={s.longestWinStreak} sub={`Current ${s.currentWinStreak}`} />
              <StatCard label="Longest loss streak" value={s.longestLossStreak} sub={`Current ${s.currentLossStreak}`} />
              <StatCard label="Largest win / loss" value={money(s.largestWin)} sub={`Loss ${money(s.largestLoss)}`} />
            </div>

            <Card title="Drawdown">
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Maximum drawdown" value={money(e.maxDrawdown)} sub={formatPct(e.maxDrawdownPct, 2)} />
                <StatCard label="Current drawdown" value={money(e.currentDrawdown)} sub={formatPct(e.currentDrawdownPct, 2)} />
                <StatCard label="Peak equity" value={money(e.peakEquity)} />
                <StatCard label="Current equity" value={money(e.currentEquity)} />
              </div>
              {equity.data?.points?.length > 1 ? (
                <DrawdownChart points={equity.data.points} currency={currency} />
              ) : equity.loading ? (
                <Spinner />
              ) : null}
              <p className="mt-2 text-xs text-muted">Percentage below the running equity peak after each closed trade in this period.</p>
            </Card>

            <Card title="Risk summary">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Average risk %" value={formatPct(risk.avgRiskPercentage, 2)} />
                <StatCard label="Largest risk %" value={formatPct(risk.maxRiskPercentage, 2)} />
                <StatCard label="Average risk amount" value={money(risk.avgRiskAmount)} sub={`Largest ${money(risk.maxRiskAmount)}`} />
                <StatCard
                  label="Trades above default risk"
                  value={risk.defaultRiskPercentage ? risk.tradesAboveDefaultRisk : '—'}
                  sub={risk.defaultRiskPercentage ? `Default ${risk.defaultRiskPercentage}% (Settings)` : 'Set a default risk % in Settings'}
                />
              </div>
              <p className="mt-3 text-xs text-muted">
                {risk.lossesBeyondOneR} losing trade(s) lost more than 1R · {risk.tradesWithoutRisk} trade(s) have no recorded risk (excluded from R statistics).
              </p>
            </Card>
          </div>
        );
      })()}
    </Section>
  );
}

function GroupTab({ path, firstColumn, range, extraParams, renderLabel }) {
  const params = useMemo(() => ({ ...range, ...extraParams }), [range, extraParams]);
  const { data, loading, error, reload } = useApi(path, params);
  return (
    <Section loading={loading && !data} error={error} reload={reload} empty={data && data.rows.length === 0}>
      {data && (
        <Card bodyClassName="p-0">
          <StatsTable rows={data.rows} firstColumn={firstColumn} renderLabel={renderLabel} />
        </Card>
      )}
    </Section>
  );
}

function Breakdown({ range }) {
  const [by, setBy] = useState('setup');
  const extra = useMemo(() => ({ by }), [by]);
  const labels = { setup: 'Setup', session: 'Session', timeframe: 'Timeframe', direction: 'Direction', market: 'Market' };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="breakdown-by" className="text-sm text-muted">Group by</label>
        <select id="breakdown-by" className="input w-auto" value={by} onChange={(e) => setBy(e.target.value)}>
          {Object.entries(labels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <GroupTab
        path="/analytics/breakdown"
        firstColumn={labels[by]}
        range={range}
        extraParams={extra}
        renderLabel={(r) => (by === 'direction' || by === 'market' ? r.key.charAt(0).toUpperCase() + r.key.slice(1) : r.key)}
      />
    </div>
  );
}

function ChecklistTab({ range }) {
  const { currency } = useAuth();
  const strategies = useApi('/strategies');
  const [strategyId, setStrategyId] = useState('');
  const list = (strategies.data?.strategies || []).filter((s) => s.conditions.length > 0);

  useEffect(() => {
    if (!strategyId && list.length) setStrategyId(list[0]._id);
  }, [list, strategyId]);

  const params = useMemo(() => (strategyId ? { ...range, strategyId } : null), [range, strategyId]);
  const { data, loading, error, reload } = useApi(strategyId ? '/analytics/checklist' : null, params || undefined);

  if (strategies.loading) return <Spinner />;
  if (!list.length) {
    return <Card><EmptyState title="No strategies with checklist conditions" message="Add checklist conditions to a strategy and mark them on your trades to see this analysis." /></Card>;
  }

  const cell = (st) =>
    st.totalTrades ? (
      <>
        <span className="num block">{st.totalTrades} trades · {formatPct(st.winRate)}</span>
        <span className={`num text-xs ${pnlClass(st.avgR)}`}>{formatR(st.avgR)} · {formatMoney(st.netPnL, currency, { signed: true })}</span>
      </>
    ) : (
      <span className="text-muted">—</span>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="cl-strategy" className="text-sm text-muted">Strategy</label>
        <select id="cl-strategy" className="input w-auto" value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
          {list.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
      </div>
      <Section loading={loading && !data} error={error} reload={reload} empty={data && data.totalTrades === 0}>
        {data && (
          <>
            <Card title="Performance by conditions satisfied" bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th className="px-3 py-2.5 font-medium">Conditions satisfied</th>
                      <th className="px-3 py-2.5 text-right font-medium">Trades</th>
                      <th className="px-3 py-2.5 text-right font-medium">Win rate</th>
                      <th className="px-3 py-2.5 text-right font-medium">Avg R</th>
                      <th className="px-3 py-2.5 text-right font-medium">Net P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byScore.map((r) => (
                      <tr key={r.key} className="border-b border-line/60 last:border-0">
                        <td className="num px-3 py-2.5 font-medium">{r.satisfied} / {r.applicable}</td>
                        <td className="num px-3 py-2.5 text-right">{r.totalTrades}</td>
                        <td className="num px-3 py-2.5 text-right">{formatPct(r.winRate)}</td>
                        <td className={`num px-3 py-2.5 text-right ${pnlClass(r.avgR)}`}>{formatR(r.avgR)}</td>
                        <td className={`num px-3 py-2.5 text-right ${pnlClass(r.netPnL)}`}>{formatMoney(r.netPnL, currency, { signed: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-3 py-2 text-xs text-muted">Satisfied = conditions marked Yes; applicable excludes N/A. Based on {data.totalTrades} closed trades with a checklist.</p>
            </Card>

            <Card title="Performance by individual condition" bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th className="px-3 py-2.5 font-medium">Condition</th>
                      <th className="px-3 py-2.5 font-medium">Yes</th>
                      <th className="px-3 py-2.5 font-medium">No</th>
                      <th className="px-3 py-2.5 font-medium">N/A</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCondition.map((c) => (
                      <tr key={c.id} className="border-b border-line/60 align-top last:border-0">
                        <td className="px-3 py-2.5 font-medium">
                          {c.text}
                          {!c.current && <span className="block text-xs font-normal text-muted">Removed from strategy</span>}
                        </td>
                        <td className="px-3 py-2.5">{cell(c.yes)}</td>
                        <td className="px-3 py-2.5">{cell(c.no)}</td>
                        <td className="px-3 py-2.5">{cell(c.na)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-3 py-2 text-xs text-muted">Historical results only. Small samples can vary a lot.</p>
            </Card>
          </>
        )}
      </Section>
    </div>
  );
}

function Monthly({ range }) {
  const { currency } = useAuth();
  const { data, loading, error, reload } = useApi('/analytics/monthly', range);
  return (
    <Section loading={loading && !data} error={error} reload={reload} empty={data && data.rows.length === 0}>
      {data && (
        <div className="space-y-4">
          <Card title="Monthly net P&L">
            <PnLBarChart rows={data.rows} currency={currency} />
          </Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...data.rows].reverse().map((r) => (
              <div key={r.key} className="card p-4">
                <p className="font-semibold">{formatMonth(r.key)}</p>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-muted">Trades</dt><dd className="num">{r.totalTrades}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Win rate</dt><dd className="num">{formatPct(r.winRate)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Net P&amp;L</dt><dd className={`num font-medium ${pnlClass(r.netPnL)}`}>{formatMoney(r.netPnL, currency, { signed: true })}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Average R</dt><dd className={`num ${pnlClass(r.avgR)}`}>{formatR(r.avgR)}</dd></div>
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview';
  const [period, setPeriod] = useState('all');
  const range = useMemo(() => {
    const r = rangeFor(period, user?.timezone);
    return r.from ? r : {};
  }, [period, user?.timezone]);

  const strategyLabel = (r) => (
    <span>
      {r.label}
      {r.active === false && <span className="ml-1.5 text-xs font-normal text-muted">(inactive)</span>}
    </span>
  );

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Historical performance calculated from your closed trades."
        actions={
          tab !== 'calendar' && (
            <select className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
              {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          )
        }
      />
      <Tabs tabs={TABS} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} />
      {tab === 'overview' && <Overview range={range} />}
      {tab === 'strategies' && <GroupTab path="/analytics/strategies" firstColumn="Strategy" range={range} renderLabel={strategyLabel} />}
      {tab === 'assets' && <GroupTab path="/analytics/assets" firstColumn="Asset" range={range} />}
      {tab === 'checklist' && <ChecklistTab range={range} />}
      {tab === 'breakdown' && <Breakdown range={range} />}
      {tab === 'monthly' && <Monthly range={range} />}
      {tab === 'calendar' && <TradeCalendar />}
    </>
  );
}
