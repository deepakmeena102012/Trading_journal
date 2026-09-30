const mongoose = require('mongoose');
const { MARKETS } = require('./User');

const checklistResultSchema = new mongoose.Schema(
  {
    conditionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Snapshot of the condition text so history survives later strategy edits.
    text: { type: String, required: true, trim: true, maxlength: 200 },
    value: { type: String, enum: ['yes', 'no', 'na'], required: true },
  },
  { _id: false }
);

const screenshotRefSchema = new mongoose.Schema(
  {
    screenshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Screenshot', required: true },
    kind: { type: String, enum: ['before', 'entry', 'exit'], required: true },
    contentType: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const beforeNotesSchema = new mongoose.Schema(
  {
    idea: { type: String, trim: true, maxlength: 5000, default: '' },
    marketCondition: { type: String, trim: true, maxlength: 5000, default: '' },
    reason: { type: String, trim: true, maxlength: 5000, default: '' },
    confirmation: { type: String, trim: true, maxlength: 5000, default: '' },
    invalidation: { type: String, trim: true, maxlength: 5000, default: '' },
  },
  { _id: false }
);

const afterNotesSchema = new mongoose.Schema(
  {
    whatHappened: { type: String, trim: true, maxlength: 5000, default: '' },
    followedStrategy: { type: String, enum: ['yes', 'partial', 'no', ''], default: '' },
    mistakes: { type: String, trim: true, maxlength: 5000, default: '' },
    lessons: { type: String, trim: true, maxlength: 5000, default: '' },
  },
  { _id: false }
);

const tradeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    strategyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Strategy', default: null },
    strategyName: { type: String, trim: true, default: '' }, // snapshot for display if the strategy is deleted

    // Stored as the user's local calendar date/time strings to avoid timezone drift.
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    time: { type: String, default: '', match: /^$|^([01]\d|2[0-3]):[0-5]\d$/ },

    asset: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    market: { type: String, enum: MARKETS, required: true },
    direction: { type: String, enum: ['long', 'short'], required: true },
    setup: { type: String, trim: true, maxlength: 100, default: '' },
    timeframe: { type: String, trim: true, maxlength: 20, default: '' },
    session: { type: String, trim: true, maxlength: 40, default: '' },

    // Prices
    entryPrice: { type: Number, required: true },
    stopLoss: { type: Number, default: null },
    takeProfit: { type: Number, default: null },
    exitPrice: { type: Number, default: null },
    positionSize: { type: Number, required: true },
    multiplier: { type: Number, default: 1 },

    // Costs
    fees: { type: Number, default: 0 },
    swap: { type: Number, default: 0 },
    slippage: { type: Number, default: 0 },
    totalCosts: { type: Number, default: 0 },

    // Risk (inputs + calculated)
    accountBalance: { type: Number, default: null },
    riskAmountInput: { type: Number, default: null },
    riskPercentageInput: { type: Number, default: null },
    slRiskAmount: { type: Number, default: null },
    riskAmount: { type: Number, default: null },
    riskPercentage: { type: Number, default: null },
    riskSource: { type: String, enum: ['manual', 'stopLoss', 'percentage', null], default: null },
    potentialReward: { type: Number, default: null },
    plannedRR: { type: Number, default: null },

    // Result (calculated, with optional manual overrides)
    manualGrossPnL: { type: Number, default: null },
    manualResult: { type: String, enum: ['win', 'loss', 'breakeven', null], default: null },
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    grossPnL: { type: Number, default: null },
    netPnL: { type: Number, default: null },
    rMultiple: { type: Number, default: null },
    result: { type: String, enum: ['win', 'loss', 'breakeven', null], default: null },

    checklistResults: { type: [checklistResultSchema], default: [] },
    beforeNotes: { type: beforeNotesSchema, default: () => ({}) },
    afterNotes: { type: afterNotesSchema, default: () => ({}) },
    screenshots: { type: [screenshotRefSchema], default: [] },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

tradeSchema.index({ userId: 1, date: -1, time: -1 });
tradeSchema.index({ userId: 1, strategyId: 1 });
tradeSchema.index({ userId: 1, asset: 1 });

module.exports = mongoose.model('Trade', tradeSchema);
