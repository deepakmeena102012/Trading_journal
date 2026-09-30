/**
 * Live preview of trade calculations while the user types.
 * The backend (server/src/utils/tradeCalc.js) is the source of truth and recalculates
 * every value on save; this mirrors its rules so the form shows the same numbers.
 */
const num = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const sign = value < 0 ? -1 : 1;
  const r = sign * Number(`${Math.round(Number(`${Math.abs(value)}e${decimals}`))}e-${decimals}`);
  return Object.is(r, -0) ? 0 : r;
}

export function previewTrade(f) {
  const warnings = {};
  const entry = num(f.entryPrice);
  const sl = num(f.stopLoss);
  const tp = num(f.takeProfit);
  const exit = num(f.exitPrice);
  const size = num(f.positionSize);
  const mult = num(f.multiplier) ?? 1;
  const costs = (num(f.fees) ?? 0) + (num(f.swap) ?? 0) + (num(f.slippage) ?? 0);
  const balance = num(f.accountBalance);
  const riskIn = num(f.riskAmount);
  const pctIn = num(f.riskPercentage);
  const manualGross = num(f.manualGrossPnL);
  const long = f.direction === 'long';

  if (entry !== null && sl !== null) {
    if (long && sl >= entry) warnings.stopLoss = 'Long stop loss must be below entry';
    if (!long && sl <= entry) warnings.stopLoss = 'Short stop loss must be above entry';
  }
  if (entry !== null && tp !== null) {
    if (long && tp <= entry) warnings.takeProfit = 'Long take profit must be above entry';
    if (!long && tp >= entry) warnings.takeProfit = 'Short take profit must be below entry';
  }

  const valid = entry !== null && entry > 0 && size !== null && size > 0 && mult > 0;
  const unit = valid ? size * mult : null;

  const slRisk = valid && sl !== null && !warnings.stopLoss ? round(Math.abs(entry - sl) * unit) : null;
  let risk = null;
  let riskSource = null;
  if (riskIn !== null && riskIn > 0) {
    risk = round(riskIn);
    riskSource = 'manual';
  } else if (slRisk) {
    risk = slRisk;
    riskSource = 'stopLoss';
  } else if (pctIn && balance) {
    risk = round((balance * pctIn) / 100);
    riskSource = 'percentage';
  }
  const riskPct = risk !== null && balance > 0 ? round((risk / balance) * 100) : pctIn;
  const reward = valid && tp !== null && !warnings.takeProfit ? round(Math.abs(tp - entry) * unit) : null;
  const rr = entry !== null && tp !== null && sl !== null && !warnings.stopLoss && !warnings.takeProfit && entry !== sl
    ? round(Math.abs(tp - entry) / Math.abs(entry - sl))
    : null;

  let gross = null;
  let net = null;
  let r = null;
  let result = null;
  const closed = (exit !== null && exit > 0) || manualGross !== null;
  if (valid && closed) {
    gross = manualGross !== null ? round(manualGross) : round((exit - entry) * (long ? 1 : -1) * unit);
    net = round(gross - costs);
    r = risk ? round(net / risk) : null;
    result = f.manualResult || (net > 0 ? 'win' : net < 0 ? 'loss' : 'breakeven');
  }

  return {
    warnings,
    slRisk,
    riskAmount: risk,
    riskSource,
    riskPercentage: riskPct,
    potentialReward: reward,
    plannedRR: rr,
    grossPnL: gross,
    totalCosts: round(costs),
    netPnL: net,
    rMultiple: r,
    result,
    status: closed ? 'closed' : 'open',
  };
}
