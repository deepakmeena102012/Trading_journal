import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDate, formatMoney, formatMonth, formatPct } from '../lib/format';

// Chart tokens (validated for the dark surface #1a1a19).
const C = {
  series: '#3987e5',
  profit: '#26a69a',
  loss: '#ef5350',
  grid: '#2e2e2b',
  axis: '#8f8e86',
  surface: '#1a1a19',
};

const axisProps = {
  stroke: C.axis,
  tick: { fill: C.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: C.grid },
};

function TooltipBox({ children }) {
  return <div className="rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-lg">{children}</div>;
}

const Row = ({ label, value, className = 'text-ink' }) => (
  <div className="flex justify-between gap-4">
    <span className="text-muted">{label}</span>
    <span className={`num font-medium ${className}`}>{value}</span>
  </div>
);

const signClass = (v) => (v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-soft');

/** Equity progression, one point per closed trade. Single series, so no legend. */
export function EquityChart({ points, currency, height = 280 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="0" vertical={false} />
        <XAxis dataKey="index" {...axisProps} tickFormatter={(i) => (i === 0 ? 'Start' : `#${i}`)} minTickGap={24} />
        <YAxis
          {...axisProps}
          width={64}
          domain={['auto', 'auto']}
          tickFormatter={(v) => formatMoney(v, currency, { compact: true })}
        />
        <Tooltip
          cursor={{ stroke: C.axis, strokeDasharray: '3 3' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return (
              <TooltipBox>
                <p className="mb-1 font-medium text-ink">
                  {p.index === 0 ? 'Starting balance' : `Trade #${p.index} · ${p.asset}`}
                </p>
                {p.date && <Row label="Date" value={formatDate(p.date)} />}
                {p.index > 0 && <Row label="Trade P&L" value={formatMoney(p.pnl, currency, { signed: true })} className={signClass(p.pnl)} />}
                <Row label="Equity" value={formatMoney(p.equity, currency)} />
              </TooltipBox>
            );
          }}
        />
        <Line
          type="linear"
          dataKey="equity"
          stroke={C.series}
          strokeWidth={2}
          dot={points.length <= 40 ? { r: 3, fill: C.series, stroke: C.surface, strokeWidth: 2 } : false}
          activeDot={{ r: 5, fill: C.series, stroke: C.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Underwater chart: percentage below the running equity peak. */
export function DrawdownChart({ points, currency, height = 220 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="index" {...axisProps} tickFormatter={(i) => (i === 0 ? 'Start' : `#${i}`)} minTickGap={24} />
        <YAxis {...axisProps} width={52} tickFormatter={(v) => `${v}%`} domain={['dataMin', 0]} />
        <ReferenceLine y={0} stroke={C.axis} />
        <Tooltip
          cursor={{ stroke: C.axis, strokeDasharray: '3 3' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return (
              <TooltipBox>
                <p className="mb-1 font-medium text-ink">{p.index === 0 ? 'Start' : `After trade #${p.index}`}</p>
                <Row label="Drawdown" value={formatPct(p.drawdownPct, 2)} className={p.drawdownPct < 0 ? 'text-loss' : 'text-soft'} />
                <Row label="Amount" value={formatMoney(p.drawdown, currency)} />
                <Row label="Peak" value={formatMoney(p.peak, currency)} />
              </TooltipBox>
            );
          }}
        />
        <Area
          type="linear"
          dataKey="drawdownPct"
          stroke={C.loss}
          strokeWidth={2}
          fill={C.loss}
          fillOpacity={0.18}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Signed P&L bars (profit above the zero line, loss below).
 * Polarity is encoded by position and sign, not by color alone.
 */
export function PnLBarChart({ rows, currency, labelKey = 'key', labelFormatter = (k) => formatMonth(k, true), height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey={labelKey} {...axisProps} tickFormatter={labelFormatter} minTickGap={8} />
        <YAxis {...axisProps} width={64} tickFormatter={(v) => formatMoney(v, currency, { compact: true })} />
        <ReferenceLine y={0} stroke={C.axis} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return (
              <TooltipBox>
                <p className="mb-1 font-medium text-ink">{labelFormatter(p[labelKey])}</p>
                <Row label="Net P&L" value={formatMoney(p.netPnL, currency, { signed: true })} className={signClass(p.netPnL)} />
                <Row label="Trades" value={p.totalTrades} />
                <Row label="Win rate" value={formatPct(p.winRate)} />
              </TooltipBox>
            );
          }}
        />
        <Bar dataKey="netPnL" radius={[4, 4, 4, 4]} maxBarSize={48} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r[labelKey]} fill={r.netPnL >= 0 ? C.profit : C.loss} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
