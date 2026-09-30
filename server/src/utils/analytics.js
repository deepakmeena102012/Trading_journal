/**
 * Pure historical-performance calculations. No predictions, no recommendations:
 * every number here is derived only from the user's recorded, closed trades.
 */
const { round, money, safeDiv } = require('./money');

const pct = (n, d) => {
  const r = safeDiv(n, d, null);
  return r === null ? 0 : round(r * 100, 2);
};

/** Chronological order: date, then time, then creation time. */
function chronoCompare(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = a.time || '';
  const tb = b.time || '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
}

const sortChrono = (trades) => [...trades].sort(chronoCompare);

const isClosed = (t) => t.status === 'closed' && Number.isFinite(Number(t.netPnL));

/** Streaks over chronologically ordered closed trades. Break-even trades end a streak. */
function streaks(sorted) {
  let longestWin = 0;
  let longestLoss = 0;
  let win = 0;
  let loss = 0;
  for (const t of sorted) {
    if (t.result === 'win') {
      win += 1;
      loss = 0;
    } else if (t.result === 'loss') {
      loss += 1;
      win = 0;
    } else {
      win = 0;
      loss = 0;
    }
    longestWin = Math.max(longestWin, win);
    longestLoss = Math.max(longestLoss, loss);
  }
  return { currentWinStreak: win, currentLossStreak: loss, longestWinStreak: longestWin, longestLossStreak: longestLoss };
}

/**
 * Core statistics for a set of closed trades.
 *  Win Rate       = wins / total closed trades x 100 (break-even trades count in the denominator)
 *  Net P&L        = sum of each trade's net P&L (gross P&L minus fees, swap and slippage)
 *  Profit Factor  = gross profit / |gross loss|  (null when there are no losing trades)
 *  Average Win    = total winning P&L / number of wins
 *  Average Loss   = total losing P&L / number of losses (negative number)
 *  Expectancy     = (win rate x average win) - (loss rate x |average loss|), per trade
 *  Average R      = mean R multiple of trades that have a defined initial risk
 */
function summarize(trades) {
  const closed = sortChrono(trades.filter(isClosed));
  const wins = closed.filter((t) => t.result === 'win');
  const losses = closed.filter((t) => t.result === 'loss');
  const breakevens = closed.filter((t) => t.result === 'breakeven');
  const total = closed.length;

  let grossProfit = 0;
  let grossLoss = 0;
  let netPnL = 0;
  let totalCosts = 0;
  for (const t of closed) netPnL += Number(t.netPnL);
  for (const t of closed) totalCosts += Number(t.totalCosts) || 0;
  for (const t of wins) grossProfit += Number(t.netPnL);
  for (const t of losses) grossLoss += Number(t.netPnL);

  const withR = closed.filter((t) => Number.isFinite(t.rMultiple) && t.rMultiple !== null);
  const totalR = withR.reduce((s, t) => s + t.rMultiple, 0);
  const winsWithR = wins.filter((t) => Number.isFinite(t.rMultiple) && t.rMultiple !== null);
  const lossesWithR = losses.filter((t) => Number.isFinite(t.rMultiple) && t.rMultiple !== null);

  const winRate = pct(wins.length, total);
  const lossRate = pct(losses.length, total);
  const avgWin = safeDiv(grossProfit, wins.length, 0);
  const avgLoss = safeDiv(grossLoss, losses.length, 0);
  const avgWinR = safeDiv(winsWithR.reduce((s, t) => s + t.rMultiple, 0), winsWithR.length, 0);
  const avgLossR = safeDiv(lossesWithR.reduce((s, t) => s + t.rMultiple, 0), lossesWithR.length, 0);
  const pnls = closed.map((t) => Number(t.netPnL));

  return {
    totalTrades: total,
    wins: wins.length,
    losses: losses.length,
    breakevens: breakevens.length,
    winRate,
    lossRate,
    breakevenRate: pct(breakevens.length, total),
    grossProfit: money(grossProfit),
    grossLoss: money(grossLoss),
    netPnL: money(netPnL),
    totalCosts: money(totalCosts),
    avgWin: money(avgWin),
    avgLoss: money(avgLoss),
    avgR: round(safeDiv(totalR, withR.length, 0), 2),
    totalR: round(totalR, 2),
    tradesWithR: withR.length,
    avgWinR: round(avgWinR, 2),
    avgLossR: round(avgLossR, 2),
    profitFactor: grossLoss === 0 ? null : round(safeDiv(grossProfit, Math.abs(grossLoss), 0), 2),
    expectancy: money((winRate / 100) * avgWin - (lossRate / 100) * Math.abs(avgLoss)),
    largestWin: pnls.length && Math.max(...pnls) > 0 ? money(Math.max(...pnls)) : 0,
    largestLoss: pnls.length && Math.min(...pnls) < 0 ? money(Math.min(...pnls)) : 0,
    ...streaks(closed),
  };
}

/**
 * Equity curve and drawdown. The curve starts at the balance at the beginning of the
 * requested range (starting balance + all closed P&L before `from`).
 */
function equityCurve(trades, startingBalance, { from, to } = {}) {
  const closed = sortChrono(trades.filter(isClosed));
  let opening = Number(startingBalance) || 0;
  const inRange = [];
  for (const t of closed) {
    if (from && t.date < from) opening += Number(t.netPnL);
    else if (!to || t.date <= to) inRange.push(t);
  }
  opening = money(opening);

  const points = [
    { index: 0, label: 'Start', date: from || (inRange[0] ? inRange[0].date : null), equity: opening, pnl: 0 },
  ];
  let equity = opening;
  inRange.forEach((t, i) => {
    equity += Number(t.netPnL);
    points.push({
      index: i + 1,
      label: `#${i + 1}`,
      date: t.date,
      time: t.time || null,
      tradeId: String(t._id || ''),
      asset: t.asset,
      pnl: money(t.netPnL),
      equity: money(equity),
    });
  });

  const dd = drawdown(points);
  return { points: dd.points, openingBalance: opening, ...dd.stats };
}

function drawdown(points) {
  let peak = -Infinity;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  const out = points.map((p) => {
    peak = Math.max(peak, p.equity);
    const dd = peak - p.equity;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
    return { ...p, peak: money(peak), drawdown: money(-dd), drawdownPct: round(-ddPct, 2) };
  });
  const last = out[out.length - 1];
  return {
    points: out,
    stats: {
      peakEquity: last ? last.peak : 0,
      currentEquity: last ? last.equity : 0,
      maxDrawdown: money(maxDrawdown),
      maxDrawdownPct: round(maxDrawdownPct, 2),
      currentDrawdown: last ? money(-last.drawdown) : 0,
      currentDrawdownPct: last ? round(-last.drawdownPct, 2) : 0,
    },
  };
}

/** Compact per-group statistics used for asset / strategy / month breakdowns. */
function groupStats(trades, keyFn, labelFn = (k) => k) {
  const groups = new Map();
  for (const t of trades.filter(isClosed)) {
    const key = keyFn(t);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return [...groups.entries()].map(([key, list]) => {
    const s = summarize(list);
    return {
      key,
      label: labelFn(key, list),
      totalTrades: s.totalTrades,
      wins: s.wins,
      losses: s.losses,
      breakevens: s.breakevens,
      winRate: s.winRate,
      netPnL: s.netPnL,
      grossProfit: s.grossProfit,
      grossLoss: s.grossLoss,
      avgR: s.avgR,
      totalR: s.totalR,
      profitFactor: s.profitFactor,
      expectancy: s.expectancy,
      avgWin: s.avgWin,
      avgLoss: s.avgLoss,
    };
  });
}

/** Per-day totals for a calendar month (YYYY-MM). */
function calendar(trades, month) {
  const days = new Map();
  for (const t of trades) {
    if (!t.date || !t.date.startsWith(month)) continue;
    if (!days.has(t.date)) days.set(t.date, { date: t.date, trades: 0, closedTrades: 0, openTrades: 0, netPnL: 0, totalR: 0, wins: 0, losses: 0, breakevens: 0 });
    const d = days.get(t.date);
    d.trades += 1;
    if (isClosed(t)) {
      d.closedTrades += 1;
      d.netPnL += Number(t.netPnL);
      if (Number.isFinite(t.rMultiple) && t.rMultiple !== null) d.totalR += t.rMultiple;
      if (t.result === 'win') d.wins += 1;
      else if (t.result === 'loss') d.losses += 1;
      else d.breakevens += 1;
    } else {
      d.openTrades += 1;
    }
  }
  return [...days.values()]
    .map((d) => ({ ...d, netPnL: money(d.netPnL), totalR: round(d.totalR, 2) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Checklist analysis for one strategy.
 *  - byScore: performance grouped by "conditions satisfied / applicable conditions"
 *  - byCondition: performance when each condition was marked Yes / No / N/A
 */
function checklistAnalysis(trades, strategy) {
  const relevant = trades.filter(
    (t) => isClosed(t) && Array.isArray(t.checklistResults) && t.checklistResults.length > 0
  );

  const scoreGroups = new Map();
  for (const t of relevant) {
    const applicable = t.checklistResults.filter((c) => c.value !== 'na').length;
    const satisfied = t.checklistResults.filter((c) => c.value === 'yes').length;
    const key = `${satisfied}/${applicable}`;
    if (!scoreGroups.has(key)) scoreGroups.set(key, { satisfied, applicable, trades: [] });
    scoreGroups.get(key).trades.push(t);
  }
  const byScore = [...scoreGroups.entries()]
    .map(([key, g]) => {
      const s = summarize(g.trades);
      return {
        key,
        satisfied: g.satisfied,
        applicable: g.applicable,
        ratio: g.applicable ? round((g.satisfied / g.applicable) * 100, 2) : 0,
        totalTrades: s.totalTrades,
        wins: s.wins,
        losses: s.losses,
        winRate: s.winRate,
        netPnL: s.netPnL,
        avgR: s.avgR,
      };
    })
    .sort((a, b) => b.ratio - a.ratio || b.applicable - a.applicable);

  // Conditions: current strategy conditions first, then any historical ones only found on trades.
  const conditions = new Map();
  for (const c of strategy?.conditions || []) conditions.set(String(c._id), { id: String(c._id), text: c.text, current: true });
  for (const t of relevant) {
    for (const c of t.checklistResults) {
      const id = String(c.conditionId);
      if (!conditions.has(id)) conditions.set(id, { id, text: c.text, current: false });
    }
  }

  const byCondition = [...conditions.values()].map((cond) => {
    const buckets = { yes: [], no: [], na: [] };
    for (const t of relevant) {
      const entry = t.checklistResults.find((c) => String(c.conditionId) === cond.id);
      if (entry && buckets[entry.value]) buckets[entry.value].push(t);
    }
    const stat = (list) => {
      const s = summarize(list);
      return { totalTrades: s.totalTrades, wins: s.wins, losses: s.losses, winRate: s.winRate, netPnL: s.netPnL, avgR: s.avgR };
    };
    return { ...cond, yes: stat(buckets.yes), no: stat(buckets.no), na: stat(buckets.na) };
  });

  return { totalTrades: relevant.length, byScore, byCondition };
}

/** Risk summary over all trades that have a recorded risk (open and closed). */
function riskSummary(trades, defaultRiskPercentage) {
  const withPct = trades.filter((t) => Number.isFinite(t.riskPercentage) && t.riskPercentage !== null);
  const withAmt = trades.filter((t) => Number.isFinite(t.riskAmount) && t.riskAmount !== null && t.riskAmount > 0);
  const limit = Number(defaultRiskPercentage);
  const hasLimit = Number.isFinite(limit) && limit > 0;
  return {
    tradesWithRisk: withAmt.length,
    tradesWithoutRisk: trades.length - withAmt.length,
    avgRiskPercentage: round(safeDiv(withPct.reduce((s, t) => s + t.riskPercentage, 0), withPct.length, 0), 2),
    maxRiskPercentage: withPct.length ? round(Math.max(...withPct.map((t) => t.riskPercentage)), 2) : 0,
    avgRiskAmount: money(safeDiv(withAmt.reduce((s, t) => s + t.riskAmount, 0), withAmt.length, 0)),
    maxRiskAmount: withAmt.length ? money(Math.max(...withAmt.map((t) => t.riskAmount))) : 0,
    defaultRiskPercentage: hasLimit ? limit : null,
    tradesAboveDefaultRisk: hasLimit ? withPct.filter((t) => t.riskPercentage > limit + 1e-9).length : 0,
    lossesBeyondOneR: trades.filter((t) => isClosed(t) && t.rMultiple !== null && t.rMultiple < -1).length,
  };
}

module.exports = {
  sortChrono,
  chronoCompare,
  isClosed,
  summarize,
  equityCurve,
  groupStats,
  calendar,
  checklistAnalysis,
  riskSummary,
  streaks,
};
