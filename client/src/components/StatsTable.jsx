import { useAuth } from '../context/AuthContext';
import { formatMoney, formatPct, formatR, formatRatio, pnlClass } from '../lib/format';

/** Raw per-group statistics. Rows are displayed as calculated – no ranking or judgement. */
export default function StatsTable({ rows, firstColumn = 'Group', renderLabel = (r) => r.label ?? r.key, showPF = true }) {
  const { currency } = useAuth();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-3 py-2.5 font-medium">{firstColumn}</th>
            <th className="px-3 py-2.5 text-right font-medium">Trades</th>
            <th className="px-3 py-2.5 text-right font-medium">Wins</th>
            <th className="px-3 py-2.5 text-right font-medium">Losses</th>
            <th className="px-3 py-2.5 text-right font-medium">Win rate</th>
            <th className="px-3 py-2.5 text-right font-medium">Net P&amp;L</th>
            <th className="px-3 py-2.5 text-right font-medium">Avg R</th>
            {showPF && <th className="px-3 py-2.5 text-right font-medium">Profit factor</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-line/60 last:border-0">
              <td className="px-3 py-2.5 font-medium">{renderLabel(r)}</td>
              <td className="num px-3 py-2.5 text-right">{r.totalTrades}</td>
              <td className="num px-3 py-2.5 text-right">{r.wins}</td>
              <td className="num px-3 py-2.5 text-right">{r.losses}</td>
              <td className="num px-3 py-2.5 text-right">{formatPct(r.winRate)}</td>
              <td className={`num px-3 py-2.5 text-right font-medium ${pnlClass(r.netPnL)}`}>{formatMoney(r.netPnL, currency, { signed: true })}</td>
              <td className={`num px-3 py-2.5 text-right ${pnlClass(r.avgR)}`}>{formatR(r.avgR)}</td>
              {showPF && (
                <td className="num px-3 py-2.5 text-right">
                  {r.profitFactor === null ? (r.grossProfit > 0 ? '∞' : '—') : formatRatio(r.profitFactor)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
