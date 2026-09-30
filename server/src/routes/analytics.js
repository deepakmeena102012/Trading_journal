const express = require('express');
const mongoose = require('mongoose');
const Trade = require('../models/Trade');
const Strategy = require('../models/Strategy');
const A = require('../utils/analytics');
const { money } = require('../utils/money');
const { asyncHandler, HttpError } = require('../middleware/errors');

const router = express.Router();

const FIELDS =
  'date time createdAt asset market direction setup timeframe session strategyId strategyName status result netPnL grossPnL totalCosts rMultiple riskAmount riskPercentage checklistResults';

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

async function loadTrades(userId) {
  return Trade.find({ userId }).select(FIELDS).lean();
}

/** Applies the common from/to/strategy/market filters from the query string. */
function applyFilters(trades, q) {
  return trades.filter((t) => {
    if (isDate(q.from) && t.date < q.from) return false;
    if (isDate(q.to) && t.date > q.to) return false;
    if (q.strategyId && mongoose.isValidObjectId(q.strategyId) && String(t.strategyId) !== q.strategyId) return false;
    if (typeof q.market === 'string' && q.market && t.market !== q.market) return false;
    return true;
  });
}

const strategyKey = (t) => (t.strategyId ? String(t.strategyId) : t.strategyName ? `deleted:${t.strategyName}` : 'none');

router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const all = await loadTrades(req.userId);
    const filtered = applyFilters(all, req.query);
    const stats = A.summarize(filtered);
    const curve = A.equityCurve(all, req.user.startingBalance, { from: req.query.from, to: req.query.to });
    const allTimeNet = A.summarize(all).netPnL;
    const open = all.filter((t) => t.status === 'open');
    res.json({
      stats,
      equity: {
        startingBalance: req.user.startingBalance,
        currentBalance: money(req.user.startingBalance + allTimeNet),
        openingBalance: curve.openingBalance,
        currentEquity: curve.currentEquity,
        peakEquity: curve.peakEquity,
        maxDrawdown: curve.maxDrawdown,
        maxDrawdownPct: curve.maxDrawdownPct,
        currentDrawdown: curve.currentDrawdown,
        currentDrawdownPct: curve.currentDrawdownPct,
      },
      openTrades: {
        count: open.length,
        totalRisk: money(open.reduce((s, t) => s + (Number(t.riskAmount) || 0), 0)),
      },
      risk: A.riskSummary(filtered, req.user.defaultRiskPercentage),
    });
  })
);

router.get(
  '/equity',
  asyncHandler(async (req, res) => {
    const all = await loadTrades(req.userId);
    const from = isDate(req.query.from) ? req.query.from : undefined;
    const to = isDate(req.query.to) ? req.query.to : undefined;
    res.json(A.equityCurve(all, req.user.startingBalance, { from, to }));
  })
);

router.get(
  '/assets',
  asyncHandler(async (req, res) => {
    const trades = applyFilters(await loadTrades(req.userId), req.query);
    const rows = A.groupStats(trades, (t) => t.asset).sort((a, b) => b.totalTrades - a.totalTrades || a.key.localeCompare(b.key));
    res.json({ rows });
  })
);

router.get(
  '/strategies',
  asyncHandler(async (req, res) => {
    const [trades, strategies] = await Promise.all([
      loadTrades(req.userId),
      Strategy.find({ userId: req.userId }).select('name active').lean(),
    ]);
    const names = new Map(strategies.map((s) => [String(s._id), s]));
    const rows = A.groupStats(applyFilters(trades, { ...req.query, strategyId: undefined }), strategyKey, (key, list) => {
      if (key === 'none') return 'No strategy';
      if (key.startsWith('deleted:')) return `${list[0].strategyName} (deleted)`;
      return names.get(key)?.name || list[0].strategyName || 'Unknown';
    }).map((r) => ({ ...r, active: names.get(r.key)?.active ?? null }));
    rows.sort((a, b) => b.totalTrades - a.totalTrades);
    res.json({ rows });
  })
);

/** Generic breakdown by a single trade attribute. */
const BREAKDOWN_FIELDS = ['setup', 'session', 'timeframe', 'direction', 'market'];
router.get(
  '/breakdown',
  asyncHandler(async (req, res) => {
    const by = req.query.by;
    if (!BREAKDOWN_FIELDS.includes(by)) throw new HttpError(400, `"by" must be one of ${BREAKDOWN_FIELDS.join(', ')}`);
    const trades = applyFilters(await loadTrades(req.userId), req.query);
    const rows = A.groupStats(trades, (t) => t[by] || '—').sort((a, b) => b.totalTrades - a.totalTrades);
    res.json({ rows });
  })
);

router.get(
  '/monthly',
  asyncHandler(async (req, res) => {
    const trades = applyFilters(await loadTrades(req.userId), req.query);
    const rows = A.groupStats(trades, (t) => t.date.slice(0, 7)).sort((a, b) => (a.key < b.key ? -1 : 1));
    res.json({ rows });
  })
);

router.get(
  '/calendar',
  asyncHandler(async (req, res) => {
    const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month
      : new Date().toISOString().slice(0, 7);
    const trades = await Trade.find({ userId: req.userId, date: { $regex: `^${month}` } }).select(FIELDS).lean();
    const days = A.calendar(trades, month);
    const closed = trades.filter(A.isClosed);
    res.json({ month, days, summary: A.summarize(closed) });
  })
);

router.get(
  '/checklist',
  asyncHandler(async (req, res) => {
    const { strategyId } = req.query;
    if (!mongoose.isValidObjectId(strategyId)) throw new HttpError(400, 'Select a strategy');
    const strategy = await Strategy.findOne({ _id: strategyId, userId: req.userId }).lean();
    if (!strategy) throw new HttpError(404, 'Strategy not found');
    const trades = applyFilters(await loadTrades(req.userId), req.query);
    res.json({ strategy: { _id: strategy._id, name: strategy.name }, ...A.checklistAnalysis(trades, strategy) });
  })
);

module.exports = router;
