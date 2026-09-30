const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const Trade = require('../models/Trade');
const Strategy = require('../models/Strategy');
const User = require('../models/User');
const Screenshot = require('../models/Screenshot');
const { buildTradeFields } = require('../services/tradeService');
const { sortChrono } = require('../utils/analytics');
const { asyncHandler, HttpError } = require('../middleware/errors');

const router = express.Router();
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const MAX_IMPORT_ROWS = 5000;

/** CSV columns. Calculated columns are exported for reference but recalculated on import. */
const COLUMNS = [
  'date', 'time', 'asset', 'market', 'direction', 'strategy', 'setup', 'timeframe', 'session',
  'entryPrice', 'stopLoss', 'takeProfit', 'exitPrice', 'positionSize', 'multiplier',
  'fees', 'swap', 'slippage', 'accountBalance', 'riskAmount', 'riskPercentage',
  'manualGrossPnL', 'manualResult',
  'status', 'grossPnL', 'netPnL', 'rMultiple', 'result', 'plannedRR',
  'checklist',
  'tradeIdea', 'marketCondition', 'reason', 'confirmation', 'invalidation',
  'whatHappened', 'followedStrategy', 'mistakes', 'lessons', 'tags',
];

const VALUE_LABEL = { yes: 'yes', no: 'no', na: 'n/a' };

function tradeToRow(t) {
  return {
    date: t.date,
    time: t.time,
    asset: t.asset,
    market: t.market,
    direction: t.direction,
    strategy: t.strategyName || '',
    setup: t.setup,
    timeframe: t.timeframe,
    session: t.session,
    entryPrice: t.entryPrice,
    stopLoss: t.stopLoss ?? '',
    takeProfit: t.takeProfit ?? '',
    exitPrice: t.exitPrice ?? '',
    positionSize: t.positionSize,
    multiplier: t.multiplier ?? 1,
    fees: t.fees ?? 0,
    swap: t.swap ?? 0,
    slippage: t.slippage ?? 0,
    accountBalance: t.accountBalance ?? '',
    riskAmount: t.riskAmount ?? '',
    riskPercentage: t.riskPercentage ?? '',
    manualGrossPnL: t.manualGrossPnL ?? '',
    manualResult: t.manualResult ?? '',
    status: t.status,
    grossPnL: t.grossPnL ?? '',
    netPnL: t.netPnL ?? '',
    rMultiple: t.rMultiple ?? '',
    result: t.result ?? '',
    plannedRR: t.plannedRR ?? '',
    checklist: (t.checklistResults || []).map((c) => `${c.text.replace(/[;=]/g, ' ')}=${VALUE_LABEL[c.value]}`).join('; '),
    tradeIdea: t.beforeNotes?.idea || '',
    marketCondition: t.beforeNotes?.marketCondition || '',
    reason: t.beforeNotes?.reason || '',
    confirmation: t.beforeNotes?.confirmation || '',
    invalidation: t.beforeNotes?.invalidation || '',
    whatHappened: t.afterNotes?.whatHappened || '',
    followedStrategy: t.afterNotes?.followedStrategy || '',
    mistakes: t.afterNotes?.mistakes || '',
    lessons: t.afterNotes?.lessons || '',
    tags: (t.tags || []).join('; '),
  };
}

/** Prevents CSV/formula injection when the file is opened in a spreadsheet application. */
function neutralizeFormula(value) {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) && !/^-?\d/.test(value) ? `'${value}` : value;
}

router.get(
  '/export/csv',
  asyncHandler(async (req, res) => {
    const trades = sortChrono(await Trade.find({ userId: req.userId }).lean());
    const rows = trades.map(tradeToRow).map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, neutralizeFormula(v)]))
    );
    const csv = stringify(rows, { header: true, columns: COLUMNS });
    const stamp = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tradejournal-trades-${stamp}.csv"`,
    });
    res.send(`﻿${csv}`);
  })
);

// ---------------- CSV import ----------------

const DIRECTION_ALIASES = { long: 'long', buy: 'long', short: 'short', sell: 'short' };
const RESULT_ALIASES = { win: 'win', loss: 'loss', breakeven: 'breakeven', 'break-even': 'breakeven', be: 'breakeven' };
const CHECK_ALIASES = { yes: 'yes', y: 'yes', true: 'yes', no: 'no', n: 'no', false: 'no', na: 'na', 'n/a': 'na' };

function normalizeDate(raw) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // DD/MM/YYYY or DD-MM-YYYY (day first, as used in India/UK/EU)
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (m) return m[1];
  return s;
}

function normalizeTime(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

function parseChecklist(raw) {
  return String(raw || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.lastIndexOf('=');
      if (idx < 1) return null;
      const value = CHECK_ALIASES[part.slice(idx + 1).trim().toLowerCase()];
      return value ? { text: part.slice(0, idx).trim(), value } : null;
    })
    .filter(Boolean);
}

const stripQuotePrefix = (v) => (typeof v === 'string' && /^'[=+\-@]/.test(v) ? v.slice(1) : v);

router.post(
  '/import/csv',
  csvUpload.single('file'),
  asyncHandler(async (req, res) => {
    const text = req.file ? req.file.buffer.toString('utf8') : typeof req.body?.csv === 'string' ? req.body.csv : '';
    if (!text.trim()) throw new HttpError(400, 'Upload a CSV file');

    let records;
    try {
      records = parse(text, { columns: (h) => h.map((c) => c.trim()), skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
    } catch (e) {
      throw new HttpError(400, `Could not read CSV: ${e.message}`);
    }
    if (!records.length) throw new HttpError(400, 'The CSV file has no data rows');
    if (records.length > MAX_IMPORT_ROWS) throw new HttpError(400, `A single import is limited to ${MAX_IMPORT_ROWS} rows`);
    const header = Object.keys(records[0]);
    for (const col of ['date', 'asset', 'direction', 'entryPrice', 'positionSize']) {
      if (!header.includes(col)) throw new HttpError(400, `Missing required column "${col}"`);
    }

    // Strategies are matched by name (case-insensitive). Unknown names are created, and
    // strategies created by this import collect the checklist conditions found in the file.
    const strategies = await Strategy.find({ userId: req.userId });
    const byName = new Map(strategies.map((s) => [s.name.toLowerCase(), s]));
    const createdHere = new Set();
    const byId = new Map(strategies.map((s) => [String(s._id), s]));
    const warnings = [];

    async function strategyFor(name, checklist) {
      const key = name.toLowerCase();
      let s = byName.get(key);
      if (!s) {
        s = new Strategy({ userId: req.userId, name: name.slice(0, 100), conditions: [] });
        byName.set(key, s);
        byId.set(String(s._id), s);
        createdHere.add(key);
      }
      if (createdHere.has(key)) {
        for (const c of checklist) {
          if (!s.conditions.some((x) => x.text.toLowerCase() === c.text.toLowerCase())) s.conditions.push({ text: c.text.slice(0, 200) });
        }
      }
      return s;
    }

    const docs = [];
    const errors = [];
    for (let i = 0; i < records.length; i += 1) {
      const r = Object.fromEntries(Object.entries(records[i]).map(([k, v]) => [k, stripQuotePrefix(v)]));
      const rowNo = i + 2; // header is row 1
      try {
        const checklist = parseChecklist(r.checklist);
        let strategy = null;
        if (r.strategy) strategy = await strategyFor(r.strategy, checklist);
        const checklistResults = [];
        if (strategy) {
          for (const c of checklist) {
            const cond = strategy.conditions.find((x) => x.text.toLowerCase() === c.text.toLowerCase());
            if (cond) checklistResults.push({ conditionId: String(cond._id), value: c.value });
            else warnings.push(`Row ${rowNo}: condition "${c.text}" is not part of strategy "${strategy.name}" and was skipped`);
          }
        }
        const input = {
          date: normalizeDate(r.date),
          time: normalizeTime(r.time),
          asset: r.asset,
          market: (r.market || 'other').toLowerCase(),
          direction: DIRECTION_ALIASES[String(r.direction || '').toLowerCase()] || r.direction,
          strategyId: strategy ? String(strategy._id) : null,
          setup: r.setup,
          timeframe: r.timeframe,
          session: r.session,
          entryPrice: r.entryPrice,
          stopLoss: r.stopLoss,
          takeProfit: r.takeProfit,
          exitPrice: r.exitPrice,
          positionSize: r.positionSize,
          multiplier: r.multiplier,
          fees: r.fees,
          swap: r.swap,
          slippage: r.slippage,
          accountBalance: r.accountBalance,
          riskAmount: r.riskAmount,
          riskPercentage: r.riskPercentage,
          manualGrossPnL: r.manualGrossPnL,
          manualResult: RESULT_ALIASES[String(r.manualResult || '').toLowerCase()] || null,
          checklistResults,
          beforeNotes: {
            idea: r.tradeIdea,
            marketCondition: r.marketCondition,
            reason: r.reason,
            confirmation: r.confirmation,
            invalidation: r.invalidation,
          },
          afterNotes: {
            whatHappened: r.whatHappened,
            followedStrategy: ['yes', 'partial', 'no'].includes(String(r.followedStrategy).toLowerCase())
              ? String(r.followedStrategy).toLowerCase()
              : '',
            mistakes: r.mistakes,
            lessons: r.lessons,
          },
          tags: String(r.tags || '').split(';').map((x) => x.trim()).filter(Boolean),
        };
        const fields = await buildTradeFields(req.userId, input, null, {
          strategyLookup: (id) => {
            const s = byId.get(id);
            return s ? s.toObject() : null;
          },
        });
        docs.push({ ...fields, userId: req.userId });
      } catch (e) {
        const message = e.errors && typeof e.errors === 'object' && !Array.isArray(e.errors)
          ? Object.entries(e.errors).map(([k, v]) => `${k}: ${v}`).join('; ')
          : e.issues
            ? e.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')
            : e.message;
        errors.push({ row: rowNo, message });
      }
    }

    // Only persist strategies that are actually used by a valid row.
    const usedStrategyIds = new Set(docs.map((d) => String(d.strategyId)).filter(Boolean));
    const newStrategies = [...createdHere].map((k) => byName.get(k)).filter((s) => usedStrategyIds.has(String(s._id)));
    if (newStrategies.length) await Strategy.insertMany(newStrategies.map((s) => s.toObject()));
    if (docs.length) await Trade.insertMany(docs);

    res.json({
      imported: docs.length,
      failed: errors.length,
      createdStrategies: newStrategies.map((s) => s.name),
      errors: errors.slice(0, 200),
      warnings: warnings.slice(0, 50),
    });
  })
);

// ---------------- JSON backup / restore ----------------

router.get(
  '/backup',
  asyncHandler(async (req, res) => {
    const [strategies, trades] = await Promise.all([
      Strategy.find({ userId: req.userId }).lean(),
      Trade.find({ userId: req.userId }).select('-screenshots').lean(),
    ]);
    const backup = {
      app: 'TradeJournal',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: req.user.toSafeJSON(),
      strategies,
      trades,
      note: 'Screenshots are not included in backups.',
    };
    const stamp = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="tradejournal-backup-${stamp}.json"`,
    });
    res.send(JSON.stringify(backup, null, 2));
  })
);

/**
 * Restores a backup, REPLACING all current strategies and trades. Every trade is re-validated
 * and all metrics are recalculated before anything is deleted.
 */
router.post(
  '/restore',
  express.json({ limit: '25mb' }),
  asyncHandler(async (req, res) => {
    const backup = req.body?.backup;
    if (!backup || backup.app !== 'TradeJournal' || !Array.isArray(backup.strategies) || !Array.isArray(backup.trades)) {
      throw new HttpError(400, 'This file is not a valid TradeJournal backup');
    }

    // 1. Rebuild strategies in memory with fresh ids (condition ids are kept so checklists still link).
    const idMap = new Map();
    const newStrategies = backup.strategies.map((s) => {
      const doc = new Strategy({
        userId: req.userId,
        name: s.name,
        description: s.description,
        entryRules: s.entryRules,
        exitRules: s.exitRules,
        riskRules: s.riskRules,
        notes: s.notes,
        active: s.active !== false,
        conditions: (s.conditions || []).map((c) =>
          mongoose.isValidObjectId(c._id) ? { _id: c._id, text: c.text } : { text: c.text }
        ),
      });
      const err = doc.validateSync();
      if (err) throw new HttpError(400, `Invalid strategy "${s.name}": ${err.message}`);
      idMap.set(String(s._id), doc);
      return doc;
    });

    // 2. Validate and recalculate every trade before touching existing data.
    const docs = [];
    for (let i = 0; i < backup.trades.length; i += 1) {
      const t = backup.trades[i];
      const strategy = t.strategyId ? idMap.get(String(t.strategyId)) : null;
      const input = {
        ...t,
        strategyId: strategy ? String(strategy._id) : null,
        riskAmount: t.riskAmountInput,
        riskPercentage: t.riskPercentageInput,
        checklistResults: strategy ? (t.checklistResults || []).map((c) => ({ conditionId: String(c.conditionId), value: c.value })) : [],
      };
      try {
        const fields = await buildTradeFields(req.userId, input, {
          strategyId: strategy ? strategy._id : null,
          strategyName: t.strategyName,
          checklistResults: t.checklistResults || [],
        }, {
          strategyLookup: (id) => (String(strategy?._id) === id ? strategy.toObject() : null),
        });
        const now = new Date();
        docs.push({ ...fields, userId: req.userId, createdAt: t.createdAt || now, updatedAt: t.updatedAt || now });
      } catch (e) {
        throw new HttpError(400, `Trade #${i + 1} (${t.date || '?'} ${t.asset || ''}) is invalid: ${e.message}`);
      }
    }

    // 3. Replace data.
    await Promise.all([
      Screenshot.deleteMany({ userId: req.userId }),
      Trade.deleteMany({ userId: req.userId }),
      Strategy.deleteMany({ userId: req.userId }),
    ]);
    if (newStrategies.length) await Strategy.insertMany(newStrategies.map((s) => s.toObject()));
    if (docs.length) await Trade.insertMany(docs, { timestamps: false });

    if (req.body.restoreSettings && backup.settings) {
      const s = backup.settings;
      const user = await User.findById(req.userId);
      for (const k of ['accountName', 'baseCurrency', 'startingBalance', 'defaultRiskPercentage', 'timezone', 'defaultMarket', 'defaultTimeframe']) {
        if (s[k] !== undefined) user[k] = s[k];
      }
      await user.save();
    }

    res.json({ restoredStrategies: newStrategies.length, restoredTrades: docs.length });
  })
);

/** Deletes all trades (and screenshots) but keeps the account and strategies. */
router.delete(
  '/trades',
  asyncHandler(async (req, res) => {
    const password = String(req.body?.password || '');
    const user = await User.findById(req.userId).select('+passwordHash');
    if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(400, 'Password is incorrect', { password: 'Incorrect password' });
    }
    const [trades] = await Promise.all([
      Trade.deleteMany({ userId: req.userId }),
      Screenshot.deleteMany({ userId: req.userId }),
    ]);
    res.json({ deleted: trades.deletedCount });
  })
);

module.exports = router;
