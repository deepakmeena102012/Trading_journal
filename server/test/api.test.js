/**
 * End-to-end API test against an in-memory MongoDB.
 * Covers the core workflow: register → strategy → trades with checklist → analytics → CSV → isolation.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

let mongo;
let app;
let tokenA;
let tokenB;
let strategy;

const auth = (t) => ({ Authorization: `Bearer ${t}` });

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-1234567890';
  process.env.CLIENT_URL = 'http://localhost:5173';
  await mongoose.connect(process.env.MONGODB_URI);
  app = require('../src/app');
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test('auth: register, login, me, protected routes', async () => {
  const reg = await request(app).post('/api/auth/register').send({ name: 'Alice', email: 'a@x.com', password: 'password123' });
  assert.equal(reg.status, 201);
  tokenA = reg.body.token;
  assert.equal(reg.body.user.passwordHash, undefined);

  const dup = await request(app).post('/api/auth/register').send({ name: 'A', email: 'A@x.com', password: 'password123' });
  assert.equal(dup.status, 409);

  const bad = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'wrong-pass' });
  assert.equal(bad.status, 401);

  const login = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'password123' });
  assert.equal(login.status, 200);

  assert.equal((await request(app).get('/api/trades')).status, 401);
  assert.equal((await request(app).get('/api/trades').set(auth('garbage'))).status, 401);

  const b = await request(app).post('/api/auth/register').send({ name: 'Bob', email: 'b@x.com', password: 'password123' });
  tokenB = b.body.token;
});

test('settings: starting balance and currency', async () => {
  const res = await request(app).put('/api/settings').set(auth(tokenA)).send({ startingBalance: 100000, baseCurrency: 'INR', defaultRiskPercentage: 1 });
  assert.equal(res.status, 200);
  assert.equal(res.body.settings.currentBalance, 100000);
  const bad = await request(app).put('/api/settings').set(auth(tokenA)).send({ startingBalance: -5 });
  assert.equal(bad.status, 400);
});

test('strategies: create, duplicate, toggle', async () => {
  const res = await request(app)
    .post('/api/strategies')
    .set(auth(tokenA))
    .send({ name: 'BTC Breakout', conditions: [{ text: 'HTF bullish' }, { text: 'Volume confirmation' }] });
  assert.equal(res.status, 201);
  strategy = res.body.strategy;
  assert.equal(strategy.conditions.length, 2);

  const dup = await request(app).post(`/api/strategies/${strategy._id}/duplicate`).set(auth(tokenA));
  assert.equal(dup.body.strategy.name, 'BTC Breakout (copy)');
  const off = await request(app).patch(`/api/strategies/${dup.body.strategy._id}/active`).set(auth(tokenA)).send({ active: false });
  assert.equal(off.body.strategy.active, false);
  assert.equal((await request(app).delete(`/api/strategies/${dup.body.strategy._id}`).set(auth(tokenA))).status, 200);
});

test('trades: server calculates P&L and R, validates input', async () => {
  const [c1, c2] = strategy.conditions;
  const base = { date: '2026-09-01', time: '10:00', asset: 'btcusdt', market: 'crypto', strategyId: strategy._id };

  const win = await request(app)
    .post('/api/trades')
    .set(auth(tokenA))
    .send({
      ...base,
      direction: 'long', entryPrice: '100', stopLoss: '90', takeProfit: '130', exitPrice: '130', positionSize: '100', fees: '0', accountBalance: '100000',
      // Client-sent computed values must be ignored.
      netPnL: 999999, rMultiple: 50,
      checklistResults: [{ conditionId: c1._id, value: 'yes' }, { conditionId: c2._id, value: 'yes' }],
    });
  assert.equal(win.status, 201, JSON.stringify(win.body));
  assert.equal(win.body.trade.asset, 'BTCUSDT');
  assert.equal(win.body.trade.netPnL, 3000);
  assert.equal(win.body.trade.rMultiple, 3);
  assert.equal(win.body.trade.riskPercentage, 1);
  assert.equal(win.body.trade.result, 'win');
  assert.deepEqual(win.body.trade.compliance, { satisfied: 2, applicable: 2, total: 2 });

  const loss = await request(app)
    .post('/api/trades')
    .set(auth(tokenA))
    .send({
      ...base, date: '2026-09-02', direction: 'short', entryPrice: 100, stopLoss: 110, exitPrice: 110, positionSize: 100, fees: 10,
      checklistResults: [{ conditionId: c1._id, value: 'yes' }, { conditionId: c2._id, value: 'no' }],
    });
  assert.equal(loss.status, 201);
  assert.equal(loss.body.trade.netPnL, -1010);
  assert.equal(loss.body.trade.rMultiple, -1.01);

  const open = await request(app).post('/api/trades').set(auth(tokenA)).send({ ...base, date: '2026-09-03', asset: 'ETH', direction: 'long', entryPrice: 50, stopLoss: 45, positionSize: 10 });
  assert.equal(open.body.trade.status, 'open');
  assert.equal(open.body.trade.netPnL, null);

  // Close the open trade via PUT.
  const closed = await request(app).put(`/api/trades/${open.body.trade._id}`).set(auth(tokenA)).send({ ...base, date: '2026-09-03', asset: 'ETH', direction: 'long', entryPrice: 50, stopLoss: 45, exitPrice: 50, positionSize: 10 });
  assert.equal(closed.body.trade.result, 'breakeven');

  const invalid = [
    { ...base, direction: 'long', entryPrice: 100, stopLoss: 110, positionSize: 1 },
    { ...base, direction: 'short', entryPrice: 100, takeProfit: 120, positionSize: 1 },
    { ...base, direction: 'long', entryPrice: -1, positionSize: 1 },
    { ...base, direction: 'long', entryPrice: 100, positionSize: 0 },
    { ...base, date: '2026-02-30', direction: 'long', entryPrice: 100, positionSize: 1 },
    { ...base, date: '2999-01-01', direction: 'long', entryPrice: 100, positionSize: 1 },
    { ...base, direction: 'long', entryPrice: 'abc', positionSize: 1 },
    { ...base, direction: 'long', entryPrice: 100, positionSize: 1, checklistResults: [{ conditionId: new mongoose.Types.ObjectId().toString(), value: 'yes' }] },
  ];
  for (const body of invalid) {
    const r = await request(app).post('/api/trades').set(auth(tokenA)).send(body);
    assert.equal(r.status, 400, `expected 400 for ${JSON.stringify(body)} got ${r.status}`);
  }
});

test('trades: list, filter, sort, search', async () => {
  const all = await request(app).get('/api/trades').set(auth(tokenA));
  assert.equal(all.body.total, 3);
  assert.equal(all.body.trades[0].date, '2026-09-03');
  const wins = await request(app).get('/api/trades?result=win').set(auth(tokenA));
  assert.equal(wins.body.total, 1);
  const short = await request(app).get('/api/trades?direction=short&sort=pnl_asc').set(auth(tokenA));
  assert.equal(short.body.trades[0].netPnL, -1010);
  const search = await request(app).get('/api/trades?q=eth').set(auth(tokenA));
  assert.equal(search.body.total, 1);
  const range = await request(app).get('/api/trades?from=2026-09-02&to=2026-09-02').set(auth(tokenA));
  assert.equal(range.body.total, 1);
  const injection = await request(app).get('/api/trades?asset[$ne]=x').set(auth(tokenA));
  assert.equal(injection.status, 200);
});

test('analytics: overview, strategies, checklist, monthly, calendar', async () => {
  const o = await request(app).get('/api/analytics/overview').set(auth(tokenA));
  assert.equal(o.status, 200);
  assert.equal(o.body.stats.totalTrades, 3);
  assert.equal(o.body.stats.netPnL, 1990);
  assert.equal(o.body.stats.winRate, 33.33);
  assert.equal(o.body.stats.profitFactor, 2.97);
  assert.equal(o.body.equity.currentBalance, 101990);
  assert.equal(o.body.equity.maxDrawdown, 1010);

  const s = await request(app).get('/api/analytics/strategies').set(auth(tokenA));
  assert.equal(s.body.rows[0].label, 'BTC Breakout');

  const c = await request(app).get(`/api/analytics/checklist?strategyId=${strategy._id}`).set(auth(tokenA));
  assert.equal(c.status, 200);
  assert.equal(c.body.byScore.find((r) => r.key === '2/2').winRate, 100);
  const vol = c.body.byCondition.find((x) => x.text === 'Volume confirmation');
  assert.equal(vol.no.totalTrades, 1);

  const m = await request(app).get('/api/analytics/monthly').set(auth(tokenA));
  assert.equal(m.body.rows[0].key, '2026-09');
  const cal = await request(app).get('/api/analytics/calendar?month=2026-09').set(auth(tokenA));
  assert.equal(cal.body.days.length, 3);
  const b = await request(app).get('/api/analytics/breakdown?by=direction').set(auth(tokenA));
  assert.equal(b.body.rows.length, 2);
});

test('isolation: another user cannot see or modify trades', async () => {
  const mine = await request(app).get('/api/trades').set(auth(tokenA));
  const id = mine.body.trades[0]._id;
  assert.equal((await request(app).get(`/api/trades/${id}`).set(auth(tokenB))).status, 404);
  assert.equal((await request(app).delete(`/api/trades/${id}`).set(auth(tokenB))).status, 404);
  assert.equal((await request(app).get('/api/trades').set(auth(tokenB))).body.total, 0);
  const useOthersStrategy = await request(app)
    .post('/api/trades')
    .set(auth(tokenB))
    .send({ date: '2026-09-01', asset: 'X', market: 'crypto', direction: 'long', entryPrice: 1, positionSize: 1, strategyId: strategy._id });
  assert.equal(useOthersStrategy.status, 400);
  assert.equal((await request(app).get('/api/analytics/overview').set(auth(tokenB))).body.stats.totalTrades, 0);
});

test('screenshots: upload, fetch, owner-only, reject non-images', async () => {
  const list = await request(app).get('/api/trades').set(auth(tokenA));
  const id = list.body.trades[0]._id;
  // Minimal valid PNG header + padding
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const up = await request(app).post(`/api/trades/${id}/screenshots`).set(auth(tokenA)).field('kind', 'before').attach('image', png, 'a.png');
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const shotId = up.body.trade.screenshots[0].screenshotId;
  const get = await request(app).get(`/api/screenshots/${shotId}`).set(auth(tokenA));
  assert.equal(get.status, 200);
  assert.equal(get.headers['content-type'], 'image/png');
  assert.equal((await request(app).get(`/api/screenshots/${shotId}`).set(auth(tokenB))).status, 404);
  const txt = await request(app).post(`/api/trades/${id}/screenshots`).set(auth(tokenA)).field('kind', 'exit').attach('image', Buffer.from('<svg onload=alert(1)></svg>'.padEnd(40)), 'x.png');
  assert.equal(txt.status, 400);
});

test('CSV export → import round trip, backup → restore', async () => {
  const csv = await request(app).get('/api/data/export/csv').set(auth(tokenA));
  assert.equal(csv.status, 200);
  assert.match(csv.text, /BTCUSDT/);

  const imp = await request(app).post('/api/data/import/csv').set(auth(tokenB)).attach('file', Buffer.from(csv.text.replace(/^﻿/, '')), 'trades.csv');
  assert.equal(imp.status, 200, JSON.stringify(imp.body));
  assert.equal(imp.body.imported, 3);
  assert.equal(imp.body.failed, 0);
  assert.deepEqual(imp.body.createdStrategies, ['BTC Breakout']);
  const ob = await request(app).get('/api/analytics/overview').set(auth(tokenB));
  assert.equal(ob.body.stats.netPnL, 1990);
  const strategiesB = await request(app).get('/api/strategies').set(auth(tokenB));
  const cb = await request(app).get(`/api/analytics/checklist?strategyId=${strategiesB.body.strategies[0]._id}`).set(auth(tokenB));
  assert.equal(cb.body.totalTrades, 2);

  const backup = await request(app).get('/api/data/backup').set(auth(tokenA));
  const restored = await request(app).post('/api/data/restore').set(auth(tokenB)).send({ backup: JSON.parse(backup.text), restoreSettings: true });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.equal(restored.body.restoredTrades, 3);
  const after = await request(app).get('/api/analytics/overview').set(auth(tokenB));
  assert.equal(after.body.stats.netPnL, 1990);
  assert.equal(after.body.equity.currentBalance, 101990);
});

test('deleting a strategy with trades keeps history', async () => {
  const conflict = await request(app).delete(`/api/strategies/${strategy._id}`).set(auth(tokenA));
  assert.equal(conflict.status, 409);
  const forced = await request(app).delete(`/api/strategies/${strategy._id}?force=true`).set(auth(tokenA));
  assert.equal(forced.status, 200);
  const s = await request(app).get('/api/analytics/strategies').set(auth(tokenA));
  assert.ok(s.body.rows.some((r) => r.label === 'BTC Breakout (deleted)'));
  const t = (await request(app).get('/api/trades?result=win').set(auth(tokenA))).body.trades[0];
  const detail = await request(app).get(`/api/trades/${t._id}`).set(auth(tokenA));
  // Editing keeps the deleted strategy's snapshot.
  const edit = await request(app).put(`/api/trades/${t._id}`).set(auth(tokenA)).send({ ...detail.body.trade, strategyId: null, riskAmount: null, riskPercentage: null });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(edit.body.trade.strategyName, 'BTC Breakout');
  assert.equal(edit.body.trade.checklistResults.length, 2);
});

test('account deletion requires password and removes data', async () => {
  assert.equal((await request(app).delete('/api/auth/account').set(auth(tokenB)).send({ password: 'nope' })).status, 400);
  assert.equal((await request(app).delete('/api/auth/account').set(auth(tokenB)).send({ password: 'password123' })).status, 200);
  assert.equal((await request(app).get('/api/auth/me').set(auth(tokenB))).status, 401);
});
