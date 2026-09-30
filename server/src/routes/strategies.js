const express = require('express');
const mongoose = require('mongoose');
const Strategy = require('../models/Strategy');
const Trade = require('../models/Trade');
const { strategyInputSchema } = require('../validation/schemas');
const { asyncHandler, HttpError } = require('../middleware/errors');

const router = express.Router();

async function findOwned(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Strategy not found');
  const strategy = await Strategy.findOne({ _id: req.params.id, userId: req.userId });
  if (!strategy) throw new HttpError(404, 'Strategy not found');
  return strategy;
}

/** Keeps existing condition ids (so checklist history stays linked); new conditions get fresh ids. */
function mergeConditions(existing, incoming) {
  const known = new Set((existing || []).map((c) => String(c._id)));
  return incoming.map((c) =>
    c._id && known.has(String(c._id)) ? { _id: c._id, text: c.text } : { text: c.text }
  );
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = { userId: req.userId };
    if (req.query.active === 'true') filter.active = true;
    const [strategies, counts] = await Promise.all([
      Strategy.find(filter).sort({ active: -1, name: 1 }).lean(),
      Trade.aggregate([
        { $match: { userId: req.userId, strategyId: { $ne: null } } },
        { $group: { _id: '$strategyId', count: { $sum: 1 } } },
      ]),
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    res.json({ strategies: strategies.map((s) => ({ ...s, tradeCount: countMap.get(String(s._id)) || 0 })) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = strategyInputSchema.parse(req.body);
    const strategy = await Strategy.create({ ...input, conditions: mergeConditions([], input.conditions), userId: req.userId });
    res.status(201).json({ strategy });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const strategy = await findOwned(req);
    const tradeCount = await Trade.countDocuments({ userId: req.userId, strategyId: strategy._id });
    res.json({ strategy: { ...strategy.toObject(), tradeCount } });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const strategy = await findOwned(req);
    const input = strategyInputSchema.parse(req.body);
    const renamed = input.name !== strategy.name;
    strategy.set({ ...input, conditions: mergeConditions(strategy.conditions, input.conditions) });
    await strategy.save();
    if (renamed) {
      await Trade.updateMany({ userId: req.userId, strategyId: strategy._id }, { strategyName: strategy.name });
    }
    res.json({ strategy });
  })
);

router.patch(
  '/:id/active',
  asyncHandler(async (req, res) => {
    const strategy = await findOwned(req);
    strategy.active = typeof req.body?.active === 'boolean' ? req.body.active : !strategy.active;
    await strategy.save();
    res.json({ strategy });
  })
);

router.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const source = await findOwned(req);
    const copy = await Strategy.create({
      userId: req.userId,
      name: `${source.name} (copy)`.slice(0, 100),
      description: source.description,
      entryRules: source.entryRules,
      exitRules: source.exitRules,
      riskRules: source.riskRules,
      notes: source.notes,
      active: true,
      conditions: source.conditions.map((c) => ({ text: c.text })),
    });
    res.status(201).json({ strategy: copy });
  })
);

/**
 * Deleting a strategy that has trades requires ?force=true. Those trades keep their
 * strategy name and checklist snapshot, so historical analytics remain intact.
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const strategy = await findOwned(req);
    const tradeCount = await Trade.countDocuments({ userId: req.userId, strategyId: strategy._id });
    if (tradeCount > 0 && req.query.force !== 'true') {
      throw new HttpError(
        409,
        `This strategy is used by ${tradeCount} trade(s). Deactivate it instead, or confirm deletion.`,
        { tradeCount }
      );
    }
    await Trade.updateMany({ userId: req.userId, strategyId: strategy._id }, { strategyId: null, strategyName: strategy.name });
    await strategy.deleteOne();
    res.json({ message: 'Strategy deleted' });
  })
);

module.exports = router;
