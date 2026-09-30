const express = require('express');
const mongoose = require('mongoose');
const Trade = require('../models/Trade');
const Screenshot = require('../models/Screenshot');
const { buildTradeFields, compliance } = require('../services/tradeService');
const { asyncHandler, HttpError } = require('../middleware/errors');
const { upload, detectImageType } = require('../middleware/upload');

const router = express.Router();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);

const SORTS = {
  newest: { date: -1, time: -1, createdAt: -1 },
  oldest: { date: 1, time: 1, createdAt: 1 },
  pnl_desc: { netPnL: -1, date: -1 },
  pnl_asc: { netPnL: 1, date: -1 },
  r_desc: { rMultiple: -1, date: -1 },
  r_asc: { rMultiple: 1, date: -1 },
};

/** Builds a Mongo filter from query params. Always scoped to the authenticated user. */
function buildFilter(userId, q) {
  const filter = { userId };
  const from = str(q.from);
  const to = str(q.to);
  if (isDate(from) || isDate(to)) {
    filter.date = {};
    if (isDate(from)) filter.date.$gte = from;
    if (isDate(to)) filter.date.$lte = to;
  }
  if (str(q.asset)) filter.asset = str(q.asset).toUpperCase();
  if (['forex', 'crypto', 'gold', 'stocks', 'other'].includes(q.market)) filter.market = q.market;
  if (str(q.strategyId) === 'none') filter.strategyId = null;
  else if (mongoose.isValidObjectId(q.strategyId)) filter.strategyId = q.strategyId;
  if (str(q.setup)) filter.setup = str(q.setup);
  if (['long', 'short'].includes(q.direction)) filter.direction = q.direction;
  if (q.result === 'open') filter.status = 'open';
  else if (['win', 'loss', 'breakeven'].includes(q.result)) filter.result = q.result;
  if (['open', 'closed'].includes(q.status)) filter.status = q.status;
  if (str(q.timeframe)) filter.timeframe = str(q.timeframe);
  if (str(q.session)) filter.session = str(q.session);
  const search = str(q.q).slice(0, 100);
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { asset: rx },
      { setup: rx },
      { strategyName: rx },
      { 'beforeNotes.idea': rx },
      { 'beforeNotes.reason': rx },
      { 'afterNotes.whatHappened': rx },
      { 'afterNotes.mistakes': rx },
      { 'afterNotes.lessons': rx },
      { tags: rx },
    ];
  }
  return filter;
}

const withCompliance = (t) => ({ ...t, compliance: compliance(t.checklistResults) });

async function findOwnedTrade(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Trade not found');
  const trade = await Trade.findOne({ _id: req.params.id, userId: req.userId });
  if (!trade) throw new HttpError(404, 'Trade not found');
  return trade;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = buildFilter(req.userId, req.query);
    const sort = SORTS[req.query.sort] || SORTS.newest;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    // Open trades have no P&L/R; keep them at the end when sorting by those fields.
    if (req.query.sort && /^(pnl|r)_/.test(req.query.sort)) {
      const field = req.query.sort.startsWith('pnl') ? 'netPnL' : 'rMultiple';
      filter[field] = { $ne: null };
    }

    const [trades, total] = await Promise.all([
      Trade.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-beforeNotes -afterNotes')
        .lean(),
      Trade.countDocuments(filter),
    ]);
    res.json({ trades: trades.map(withCompliance), total, page, pages: Math.max(Math.ceil(total / limit), 1) });
  })
);

/** Distinct values used to populate filter dropdowns and form suggestions. */
router.get(
  '/meta',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const [assets, setups, timeframes, sessions] = await Promise.all([
      Trade.distinct('asset', { userId }),
      Trade.distinct('setup', { userId }),
      Trade.distinct('timeframe', { userId }),
      Trade.distinct('session', { userId }),
    ]);
    const clean = (arr) => arr.filter(Boolean).sort((a, b) => a.localeCompare(b));
    res.json({ assets: clean(assets), setups: clean(setups), timeframes: clean(timeframes), sessions: clean(sessions) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const fields = await buildTradeFields(req.userId, req.body);
    const trade = await Trade.create({ ...fields, userId: req.userId });
    res.status(201).json({ trade: withCompliance(trade.toObject()) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const trade = await findOwnedTrade(req);
    res.json({ trade: withCompliance(trade.toObject()) });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const trade = await findOwnedTrade(req);
    const fields = await buildTradeFields(req.userId, req.body, trade);
    trade.set(fields);
    await trade.save();
    res.json({ trade: withCompliance(trade.toObject()) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const trade = await findOwnedTrade(req);
    await Screenshot.deleteMany({ tradeId: trade._id, userId: req.userId });
    await trade.deleteOne();
    res.json({ message: 'Trade deleted' });
  })
);

// ---- Screenshots (one per kind: before / entry / exit; uploading replaces the existing one) ----

router.post(
  '/:id/screenshots',
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const trade = await findOwnedTrade(req);
    const kind = req.body.kind;
    if (!['before', 'entry', 'exit'].includes(kind)) throw new HttpError(400, 'Screenshot type must be before, entry or exit');
    if (!req.file) throw new HttpError(400, 'No image uploaded');
    const contentType = detectImageType(req.file.buffer);
    if (!contentType) throw new HttpError(400, 'Only PNG, JPEG, WEBP or GIF images are allowed');

    const old = trade.screenshots.find((s) => s.kind === kind);
    const shot = await Screenshot.create({
      userId: req.userId,
      tradeId: trade._id,
      kind,
      contentType,
      size: req.file.size,
      data: req.file.buffer,
    });
    trade.screenshots = [
      ...trade.screenshots.filter((s) => s.kind !== kind),
      { screenshotId: shot._id, kind, contentType, size: req.file.size, uploadedAt: new Date() },
    ];
    await trade.save();
    if (old) await Screenshot.deleteOne({ _id: old.screenshotId, userId: req.userId });
    res.status(201).json({ trade: withCompliance(trade.toObject()) });
  })
);

router.delete(
  '/:id/screenshots/:kind',
  asyncHandler(async (req, res) => {
    const trade = await findOwnedTrade(req);
    const ref = trade.screenshots.find((s) => s.kind === req.params.kind);
    if (!ref) throw new HttpError(404, 'Screenshot not found');
    trade.screenshots = trade.screenshots.filter((s) => s.kind !== req.params.kind);
    await trade.save();
    await Screenshot.deleteOne({ _id: ref.screenshotId, userId: req.userId });
    res.json({ trade: withCompliance(trade.toObject()) });
  })
);

module.exports = router;
module.exports.buildFilter = buildFilter;
