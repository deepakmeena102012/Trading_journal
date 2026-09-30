const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateTrade } = require('../src/utils/tradeCalc');
const A = require('../src/utils/analytics');
const { round } = require('../src/utils/money');

test('rounding avoids floating point artifacts', () => {
  assert.equal(round(0.1 + 0.2), 0.3);
  assert.equal(round(1.005), 1.01);
  assert.equal(round(-1.005), -1.01);
  assert.equal(round(NaN), 0);
  assert.equal(Object.is(round(-0.001), -0), false);
});

test('long winning trade: +3R', () => {
  const c = calculateTrade({ direction: 'long', entryPrice: 100, stopLoss: 90, takeProfit: 130, exitPrice: 130, positionSize: 100 });
  assert.equal(c.riskAmount, 1000);
  assert.equal(c.grossPnL, 3000);
  assert.equal(c.netPnL, 3000);
  assert.equal(c.rMultiple, 3);
  assert.equal(c.plannedRR, 3);
  assert.equal(c.potentialReward, 3000);
  assert.equal(c.result, 'win');
  assert.equal(c.status, 'closed');
});

test('long losing trade at stop: -1R', () => {
  const c = calculateTrade({ direction: 'long', entryPrice: 100, stopLoss: 90, exitPrice: 90, positionSize: 100 });
  assert.equal(c.netPnL, -1000);
  assert.equal(c.rMultiple, -1);
  assert.equal(c.result, 'loss');
});

test('short trades invert P&L', () => {
  const win = calculateTrade({ direction: 'short', entryPrice: 50000, stopLoss: 51000, takeProfit: 48000, exitPrice: 48000, positionSize: 0.5 });
  assert.equal(win.grossPnL, 1000);
  assert.equal(win.riskAmount, 500);
  assert.equal(win.rMultiple, 2);
  const loss = calculateTrade({ direction: 'short', entryPrice: 50000, stopLoss: 51000, exitPrice: 51000, positionSize: 0.5 });
  assert.equal(loss.grossPnL, -500);
  assert.equal(loss.rMultiple, -1);
});

test('fees, swap and slippage reduce net P&L and R', () => {
  const c = calculateTrade({ direction: 'long', entryPrice: 100, stopLoss: 90, exitPrice: 110, positionSize: 100, fees: 20, swap: 5, slippage: 5 });
  assert.equal(c.grossPnL, 1000);
  assert.equal(c.totalCosts, 30);
  assert.equal(c.netPnL, 970);
  assert.equal(c.rMultiple, 0.97);
});

test('break-even exit with fees becomes a small loss; exact zero is break-even', () => {
  assert.equal(calculateTrade({ direction: 'long', entryPrice: 100, exitPrice: 100, positionSize: 1, fees: 1 }).result, 'loss');
  const be = calculateTrade({ direction: 'long', entryPrice: 100, exitPrice: 100, positionSize: 1 });
  assert.equal(be.result, 'breakeven');
  assert.equal(be.netPnL, 0);
});

test('forex multiplier and float prices', () => {
  const c = calculateTrade({ direction: 'long', entryPrice: 1.1, stopLoss: 1.095, exitPrice: 1.11, positionSize: 1, multiplier: 100000 });
  assert.equal(c.grossPnL, 1000);
  assert.equal(c.riskAmount, 500);
  assert.equal(c.rMultiple, 2);
});

test('risk priority: manual amount > stop loss > percentage of balance', () => {
  const manual = calculateTrade({ direction: 'long', entryPrice: 100, stopLoss: 90, exitPrice: 120, positionSize: 10, riskAmount: 50, accountBalance: 10000 });
  assert.equal(manual.riskAmount, 50);
  assert.equal(manual.riskPercentage, 0.5);
  assert.equal(manual.slRiskAmount, 100);
  assert.equal(manual.rMultiple, 4);

  const fromPct = calculateTrade({ direction: 'long', entryPrice: 100, exitPrice: 101, positionSize: 10, riskPercentage: 1, accountBalance: 10000 });
  assert.equal(fromPct.riskAmount, 100);
  assert.equal(fromPct.riskSource, 'percentage');
  assert.equal(fromPct.rMultiple, 0.1);
});

test('no risk defined -> R multiple is null, not NaN/Infinity', () => {
  const c = calculateTrade({ direction: 'long', entryPrice: 100, exitPrice: 110, positionSize: 1 });
  assert.equal(c.riskAmount, null);
  assert.equal(c.rMultiple, null);
  assert.equal(c.riskPercentage, null);
});

test('open trade has no P&L or result', () => {
  const c = calculateTrade({ direction: 'long', entryPrice: 100, stopLoss: 95, positionSize: 1 });
  assert.equal(c.status, 'open');
  assert.equal(c.netPnL, null);
  assert.equal(c.result, null);
});

test('manual gross P&L and manual result overrides', () => {
  const c = calculateTrade({ direction: 'long', entryPrice: 100, stopLoss: 90, positionSize: 10, manualGrossPnL: 5, manualResult: 'breakeven' });
  assert.equal(c.status, 'closed');
  assert.equal(c.netPnL, 5);
  assert.equal(c.result, 'breakeven');
  assert.equal(c.rMultiple, 0.05);
});

test('rejects invalid prices and wrong-side stops/targets', () => {
  const bad = (input, field) =>
    assert.throws(() => calculateTrade(input), (e) => e.name === 'CalcValidationError' && field in e.errors);
  bad({ direction: 'long', entryPrice: 0, positionSize: 1 }, 'entryPrice');
  bad({ direction: 'long', entryPrice: 100, positionSize: -1 }, 'positionSize');
  bad({ direction: 'long', entryPrice: 100, stopLoss: 110, positionSize: 1 }, 'stopLoss');
  bad({ direction: 'short', entryPrice: 100, stopLoss: 90, positionSize: 1 }, 'stopLoss');
  bad({ direction: 'long', entryPrice: 100, takeProfit: 90, positionSize: 1 }, 'takeProfit');
  bad({ direction: 'short', entryPrice: 100, takeProfit: 110, positionSize: 1 }, 'takeProfit');
  bad({ direction: 'long', entryPrice: 100, positionSize: 1, fees: -5 }, 'fees');
  bad({ direction: 'long', entryPrice: 100, positionSize: 1, riskPercentage: 150 }, 'riskPercentage');
  bad({ direction: 'sideways', entryPrice: 100, positionSize: 1 }, 'direction');
});

// ---------------- analytics ----------------

const T = (date, netPnL, rMultiple, extra = {}) => ({
  date,
  time: '',
  status: 'closed',
  netPnL,
  rMultiple,
  result: netPnL > 0 ? 'win' : netPnL < 0 ? 'loss' : 'breakeven',
  totalCosts: 0,
  asset: 'BTC',
  ...extra,
});

test('summary statistics', () => {
  const trades = [
    T('2026-01-01', 300, 3),
    T('2026-01-02', -100, -1),
    T('2026-01-03', 200, 2),
    T('2026-01-04', 0, 0),
    T('2026-01-05', -100, -1),
    { date: '2026-01-06', status: 'open', netPnL: null, rMultiple: null, result: null },
  ];
  const s = A.summarize(trades);
  assert.equal(s.totalTrades, 5);
  assert.equal(s.wins, 2);
  assert.equal(s.losses, 2);
  assert.equal(s.breakevens, 1);
  assert.equal(s.winRate, 40);
  assert.equal(s.netPnL, 300);
  assert.equal(s.grossProfit, 500);
  assert.equal(s.grossLoss, -200);
  assert.equal(s.profitFactor, 2.5);
  assert.equal(s.avgWin, 250);
  assert.equal(s.avgLoss, -100);
  assert.equal(s.avgR, 0.6);
  assert.equal(s.expectancy, 60); // 0.4*250 - 0.4*100
  assert.equal(s.largestWin, 300);
  assert.equal(s.largestLoss, -100);
  assert.equal(s.currentLossStreak, 1);
  assert.equal(s.currentWinStreak, 0);
});

test('empty and all-winning sets do not divide by zero', () => {
  const empty = A.summarize([]);
  assert.equal(empty.winRate, 0);
  assert.equal(empty.profitFactor, null);
  assert.equal(empty.avgR, 0);
  const allWins = A.summarize([T('2026-01-01', 100, 1)]);
  assert.equal(allWins.profitFactor, null);
  assert.equal(allWins.currentWinStreak, 1);
});

test('equity curve and drawdown', () => {
  const trades = [T('2026-01-01', 1000, 1), T('2026-01-02', -500, -0.5), T('2026-01-03', -700, -0.7), T('2026-01-04', 300, 0.3)];
  const c = A.equityCurve(trades, 10000);
  assert.deepEqual(c.points.map((p) => p.equity), [10000, 11000, 10500, 9800, 10100]);
  assert.equal(c.peakEquity, 11000);
  assert.equal(c.maxDrawdown, 1200);
  assert.equal(c.maxDrawdownPct, 10.91);
  assert.equal(c.currentDrawdown, 900);
  assert.equal(c.currentEquity, 10100);

  const ranged = A.equityCurve(trades, 10000, { from: '2026-01-03' });
  assert.equal(ranged.openingBalance, 10500);
  assert.deepEqual(ranged.points.map((p) => p.equity), [10500, 9800, 10100]);
});

test('checklist analysis groups by satisfied/applicable and by condition', () => {
  const c1 = '000000000000000000000001';
  const c2 = '000000000000000000000002';
  const strategy = { conditions: [{ _id: c1, text: 'HTF trend' }, { _id: c2, text: 'Volume' }] };
  const cl = (a, b) => [{ conditionId: c1, text: 'HTF trend', value: a }, { conditionId: c2, text: 'Volume', value: b }];
  const trades = [
    T('2026-01-01', 200, 2, { checklistResults: cl('yes', 'yes') }),
    T('2026-01-02', 100, 1, { checklistResults: cl('yes', 'yes') }),
    T('2026-01-03', -100, -1, { checklistResults: cl('yes', 'no') }),
    T('2026-01-04', -100, -1, { checklistResults: cl('yes', 'na') }),
  ];
  const res = A.checklistAnalysis(trades, strategy);
  const two = res.byScore.find((r) => r.key === '2/2');
  assert.equal(two.totalTrades, 2);
  assert.equal(two.winRate, 100);
  assert.equal(res.byScore.find((r) => r.key === '1/1').totalTrades, 1);
  const vol = res.byCondition.find((c) => c.id === c2);
  assert.equal(vol.yes.totalTrades, 2);
  assert.equal(vol.no.totalTrades, 1);
  assert.equal(vol.na.totalTrades, 1);
  assert.equal(vol.yes.avgR, 1.5);
});

test('risk summary', () => {
  const trades = [
    T('2026-01-01', -150, -1.5, { riskAmount: 100, riskPercentage: 1 }),
    T('2026-01-02', 100, 1, { riskAmount: 200, riskPercentage: 2 }),
    T('2026-01-03', 100, null, {}),
  ];
  const r = A.riskSummary(trades, 1);
  assert.equal(r.avgRiskPercentage, 1.5);
  assert.equal(r.maxRiskPercentage, 2);
  assert.equal(r.avgRiskAmount, 150);
  assert.equal(r.tradesAboveDefaultRisk, 1);
  assert.equal(r.lossesBeyondOneR, 1);
  assert.equal(r.tradesWithoutRisk, 1);
});
