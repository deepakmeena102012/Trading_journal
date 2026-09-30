import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, PlusCircle, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { PERIODS, rangeFor } from '../lib/dates';
import { formatMoney, formatPct, formatR, formatRatio, pnlClass } from '../lib/format';
import { Card, EmptyState, ErrorBanner, PageHeader, SegmentedControl, Spinner, StatCard } from '../components/ui';
import { EquityChart } from '../components/charts';

export default function Dashboard() {
  const { user, currency } = useAuth();
  const [period, setPeriod] = useState('all');
  const overview = useApi('/analytics/overview');
  const range = useMemo(() => rangeFor(period, user?.timezone), [period, user?.timezone]);
  const equity = useApi('/analytics/equity', range);

  if (overview.loading && !overview.data) return <Spinner />;
  if (overview.error) return <ErrorBanner message={overview.error} onRetry={overview.reload} />;

  const { stats: s, equity: e, openTrades } = overview.data;
  const money = (v, signed) => formatMoney(v, currency, { signed });

  if (s.totalTrades === 0 && openTrades.count === 0) {
    return (
      <>
        <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} subtitle="Your journal is empty." />
        <Card>
          <EmptyState
            icon={TrendingUp}
            title="Start your journal"
            message="Define your strategy and its checklist first, then record each trade. Statistics appear here once you close trades."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/strategies/new" className="btn-secondary">
                  <ListChecks size={16} /> Create strategy
                </Link>
                <Link to="/trades/new" className="btn-primary">
                  <PlusCircle size={16} /> Add trade
                </Link>
              </div>
            }
          />
        </Card>
      </>
    );
  }

  const pf = s.profitFactor === null ? (s.grossProfit > 0 ? '∞' : '—') : formatRatio(s.profitFactor);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${user.accountName || 'Account'} · all-time statistics from closed trades`}
        actions={
          <Link to="/trades/new" className="btn-primary">
            <PlusCircle size={16} /> Add trade
          </Link>
        }
      />

      {openTrades.count > 0 && (
        <Link
          to="/trades?result=open"
          className="mb-4 flex items-center justify-between rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-soft hover:bg-accent/15"
        >
          <span>
            {openTrades.count} open trade{openTrades.count > 1 ? 's' : ''}
            {openTrades.totalRisk > 0 && ` · ${money(openTrades.totalRisk)} at risk`}
          </span>
          <span className="text-accent">Review →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Net P&L" value={money(s.netPnL, true)} valueClass={pnlClass(s.netPnL)} sub={`Fees & costs: ${money(s.totalCosts)}`} />
        <StatCard label="Win rate" value={formatPct(s.winRate)} sub={`${s.wins}W · ${s.losses}L · ${s.breakevens}BE`} />
        <StatCard label="Current balance" value={money(e.currentBalance)} sub={`Starting: ${money(e.startingBalance)}`} />
        <StatCard
          label="Current equity"
          value={money(e.currentEquity)}
          sub={openTrades.count ? `Excludes ${openTrades.count} open trade(s)` : `Peak: ${money(e.peakEquity)}`}
        />
      </div>

      <Card
        className="mt-4"
        title="Equity curve"
        action={<SegmentedControl options={PERIODS} value={period} onChange={setPeriod} ariaLabel="Equity curve period" />}
      >
        {equity.error ? (
          <ErrorBanner message={equity.error} onRetry={equity.reload} />
        ) : equity.loading && !equity.data ? (
          <Spinner />
        ) : equity.data?.points.length > 1 ? (
          <>
            <EquityChart points={equity.data.points} currency={currency} />
            <p className="mt-2 text-xs text-muted">
              {equity.data.points.length - 1} closed trades · opening {money(equity.data.openingBalance)} → {money(equity.data.currentEquity)}
            </p>
          </>
        ) : (
          <EmptyState title="No closed trades in this period" message="Choose a different period or record a closed trade." />
        )}
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total trades" value={s.totalTrades} />
        <StatCard label="Winning trades" value={s.wins} />
        <StatCard label="Losing trades" value={s.losses} />
        <StatCard label="Break-even" value={s.breakevens} />
        <StatCard label="Total profit" value={money(s.grossProfit)} valueClass={pnlClass(s.grossProfit)} />
        <StatCard label="Total loss" value={money(s.grossLoss)} valueClass={pnlClass(s.grossLoss)} />
        <StatCard label="Average win" value={money(s.avgWin)} />
        <StatCard label="Average loss" value={money(s.avgLoss)} />
        <StatCard label="Average R" value={formatR(s.avgR)} valueClass={pnlClass(s.avgR)} sub={`${s.tradesWithR} trades with risk`} />
        <StatCard label="Profit factor" value={pf} />
        <StatCard label="Max drawdown" value={money(e.maxDrawdown)} sub={formatPct(e.maxDrawdownPct, 2)} />
        <StatCard label="Largest win" value={money(s.largestWin)} />
        <StatCard label="Largest loss" value={money(s.largestLoss)} />
        <StatCard label="Win streak (current)" value={s.currentWinStreak} sub={`Longest: ${s.longestWinStreak}`} />
        <StatCard label="Loss streak (current)" value={s.currentLossStreak} sub={`Longest: ${s.longestLossStreak}`} />
      </div>
    </>
  );
}
