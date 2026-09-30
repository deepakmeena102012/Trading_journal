const express = require('express');
const Trade = require('../models/Trade');
const { settingsSchema } = require('../validation/schemas');
const { asyncHandler } = require('../middleware/errors');
const { money } = require('../utils/money');

const router = express.Router();

async function withBalance(user) {
  const [agg] = await Trade.aggregate([
    { $match: { userId: user._id, status: 'closed' } },
    { $group: { _id: null, net: { $sum: '$netPnL' } } },
  ]);
  const realized = money(agg?.net || 0);
  return { ...user.toSafeJSON(), realizedPnL: realized, currentBalance: money(user.startingBalance + realized) };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ settings: await withBalance(req.user) });
  })
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const updates = settingsSchema.parse(req.body);
    Object.assign(req.user, updates);
    await req.user.save();
    res.json({ settings: await withBalance(req.user), user: req.user.toSafeJSON() });
  })
);

module.exports = router;
