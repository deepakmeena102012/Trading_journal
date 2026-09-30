const { z } = require('zod');
const mongoose = require('mongoose');
const { CURRENCIES, MARKETS } = require('../models/User');

const emptyToNull = (v) => (v === '' || v === undefined || v === null ? null : v);

/** Optional numeric field that accepts numbers or numeric strings; '' / null => null. */
const optNum = (label) =>
  z.preprocess(
    (v) => {
      const e = emptyToNull(v);
      if (e === null) return null;
      return typeof e === 'number' ? e : Number(String(e).replace(/,/g, '').trim());
    },
    z.number({ invalid_type_error: `${label} must be a number` }).finite(`${label} must be a valid number`).nullable()
  );

const reqNum = (label) =>
  z.preprocess(
    (v) => {
      const e = emptyToNull(v);
      if (e === null) return undefined;
      return typeof e === 'number' ? e : Number(String(e).replace(/,/g, '').trim());
    },
    z.number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` }).finite(`${label} must be a valid number`)
  );

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');
const optText = (max) => z.preprocess((v) => (v === null || v === undefined ? '' : v), z.string().trim().max(max));

function isRealDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1970;
}

const dateString = z
  .string({ required_error: 'Trade date is required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(isRealDate, 'Invalid date')
  .refine((s) => {
    const tomorrow = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
    return s <= tomorrow;
  }, 'Trade date cannot be in the future');

const timeString = z.preprocess(
  (v) => (v === null || v === undefined ? '' : String(v).slice(0, 5)),
  z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:MM format')
);

const tradeInputSchema = z.object({
  date: dateString,
  time: timeString,
  asset: z.string({ required_error: 'Asset is required' }).trim().min(1, 'Asset is required').max(40),
  market: z.enum(MARKETS, { errorMap: () => ({ message: 'Select a valid market' }) }),
  direction: z.enum(['long', 'short'], { errorMap: () => ({ message: 'Direction must be Long or Short' }) }),
  strategyId: z.preprocess(emptyToNull, objectId.nullable()),
  setup: optText(100),
  timeframe: optText(20),
  session: optText(40),

  entryPrice: reqNum('Entry price'),
  stopLoss: optNum('Stop loss'),
  takeProfit: optNum('Take profit'),
  exitPrice: optNum('Exit price'),
  positionSize: reqNum('Position size'),
  multiplier: optNum('Multiplier'),
  fees: optNum('Fees'),
  swap: optNum('Swap/Funding'),
  slippage: optNum('Slippage'),

  accountBalance: optNum('Account balance'),
  riskAmount: optNum('Risk amount'),
  riskPercentage: optNum('Risk %'),

  manualGrossPnL: optNum('Gross P&L'),
  manualResult: z.preprocess(emptyToNull, z.enum(['win', 'loss', 'breakeven']).nullable()),

  checklistResults: z
    .array(z.object({ conditionId: objectId, value: z.enum(['yes', 'no', 'na']) }))
    .max(100)
    .default([]),

  beforeNotes: z
    .object({
      idea: optText(5000),
      marketCondition: optText(5000),
      reason: optText(5000),
      confirmation: optText(5000),
      invalidation: optText(5000),
    })
    .partial()
    .default({}),
  afterNotes: z
    .object({
      whatHappened: optText(5000),
      followedStrategy: z.preprocess((v) => v ?? '', z.enum(['yes', 'partial', 'no', ''])),
      mistakes: optText(5000),
      lessons: optText(5000),
    })
    .partial()
    .default({}),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

const strategyInputSchema = z.object({
  name: z.string({ required_error: 'Strategy name is required' }).trim().min(1, 'Strategy name is required').max(100),
  description: optText(2000),
  entryRules: optText(5000),
  exitRules: optText(5000),
  riskRules: optText(5000),
  notes: optText(5000),
  active: z.boolean().default(true),
  conditions: z
    .array(
      z.object({
        _id: z.preprocess(emptyToNull, objectId.nullable()).optional(),
        text: z.string().trim().min(1, 'Condition text cannot be empty').max(200),
      })
    )
    .max(50, 'A strategy can have at most 50 conditions')
    .default([]),
});

const registerSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).trim().min(1, 'Name is required').max(80),
  email: z.string({ required_error: 'Email is required' }).trim().toLowerCase().email('Enter a valid email'),
  password: z.string({ required_error: 'Password is required' }).min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

const settingsSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80),
    accountName: optText(80),
    baseCurrency: z.enum(CURRENCIES),
    startingBalance: reqNum('Starting balance').refine((n) => n >= 0, 'Starting balance cannot be negative'),
    defaultRiskPercentage: reqNum('Default risk %').refine((n) => n >= 0 && n <= 100, 'Default risk % must be between 0 and 100'),
    timezone: z
      .string()
      .trim()
      .max(64)
      .refine((tz) => {
        try {
          Intl.DateTimeFormat('en-US', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, 'Invalid timezone'),
    defaultMarket: z.enum(MARKETS),
    defaultTimeframe: optText(20),
  })
  .partial();

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
});

module.exports = {
  tradeInputSchema,
  strategyInputSchema,
  registerSchema,
  loginSchema,
  settingsSchema,
  passwordChangeSchema,
  isRealDate,
};
