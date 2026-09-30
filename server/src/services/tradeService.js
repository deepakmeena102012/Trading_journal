const Strategy = require('../models/Strategy');
const { tradeInputSchema } = require('../validation/schemas');
const { calculateTrade } = require('../utils/tradeCalc');
const { HttpError } = require('../middleware/errors');

/**
 * Validates raw trade input and returns the full set of fields to persist,
 * including all backend-calculated metrics and the strategy checklist snapshot.
 */
async function buildTradeFields(userId, rawInput, existingTrade = null, options = {}) {
  const input = tradeInputSchema.parse(rawInput);
  const calc = calculateTrade(input);

  let strategy = null;
  if (input.strategyId) {
    // Bulk operations (import/restore) pass a preloaded lookup to avoid one query per trade.
    strategy = options.strategyLookup
      ? options.strategyLookup(String(input.strategyId))
      : await Strategy.findOne({ _id: input.strategyId, userId }).lean();
    if (!strategy) throw new HttpError(400, 'Selected strategy was not found', { strategyId: 'Strategy not found' });
  }

  // Snapshot the condition text. Conditions later removed from the strategy keep their old text.
  const previous = new Map(
    (existingTrade?.checklistResults || []).map((c) => [String(c.conditionId), c.text])
  );
  const current = new Map((strategy?.conditions || []).map((c) => [String(c._id), c.text]));
  const checklistResults = [];
  const seen = new Set();
  if (strategy) {
    for (const item of input.checklistResults) {
      const id = String(item.conditionId);
      if (seen.has(id)) continue;
      const text = current.get(id) || previous.get(id);
      if (!text) throw new HttpError(400, 'Checklist contains a condition that does not belong to this strategy');
      seen.add(id);
      checklistResults.push({ conditionId: item.conditionId, text, value: item.value });
    }
  }

  // A trade whose strategy was deleted keeps its historical strategy name and checklist
  // unless the user assigns a different strategy.
  const keepDeletedStrategy = !strategy && existingTrade && !existingTrade.strategyId && existingTrade.strategyName;

  return {
    date: input.date,
    time: input.time,
    asset: input.asset.toUpperCase(),
    market: input.market,
    direction: input.direction,
    strategyId: strategy ? strategy._id : null,
    strategyName: strategy ? strategy.name : keepDeletedStrategy ? existingTrade.strategyName : '',
    setup: input.setup,
    timeframe: input.timeframe,
    session: input.session,

    entryPrice: input.entryPrice,
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit,
    exitPrice: input.exitPrice,
    positionSize: input.positionSize,
    accountBalance: input.accountBalance,
    riskAmountInput: input.riskAmount,
    riskPercentageInput: input.riskPercentage,
    manualGrossPnL: input.manualGrossPnL,
    manualResult: input.manualResult,

    ...calc,

    checklistResults: keepDeletedStrategy ? existingTrade.checklistResults : checklistResults,
    beforeNotes: input.beforeNotes,
    afterNotes: input.afterNotes,
    tags: input.tags,
  };
}

/** Checklist compliance: satisfied Yes conditions over applicable (non-N/A) conditions. */
function compliance(checklistResults = []) {
  const applicable = checklistResults.filter((c) => c.value !== 'na').length;
  const satisfied = checklistResults.filter((c) => c.value === 'yes').length;
  return { satisfied, applicable, total: checklistResults.length };
}

module.exports = { buildTradeFields, compliance };
