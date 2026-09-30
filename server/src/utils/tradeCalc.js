const { round, money, safeDiv, toNumberOrNull } = require('./money');

class CalcValidationError extends Error {
  constructor(errors) {
    super(Object.values(errors)[0] || 'Invalid trade values');
    this.name = 'CalcValidationError';
    this.status = 400;
    this.errors = errors;
  }
}

const RESULTS = ['win', 'loss', 'breakeven'];

/**
 * Validates price/risk inputs and derives every calculated trade metric.
 * This is the single source of truth for trade math; the frontend only mirrors it for previews.
 *
 * Conventions:
 *  - positionSize: quantity in units/lots/contracts.
 *  - multiplier: value of a 1.0 price move per 1 unit of position size (default 1).
 *    e.g. 1 standard FX lot = 100000, 1 gold lot = 100, stocks/crypto = 1.
 *  - fees and slippage are costs (>= 0). swap is signed: positive = paid, negative = received.
 *  - manualGrossPnL (optional) overrides the price-based gross P&L.
 *  - manualResult (optional) overrides the automatic Win/Loss/Break-even classification.
 */
function calculateTrade(input) {
  const errors = {};
  const direction = input.direction;
  if (direction !== 'long' && direction !== 'short') errors.direction = 'Direction must be Long or Short';

  const entry = toNumberOrNull(input.entryPrice);
  const sl = toNumberOrNull(input.stopLoss);
  const tp = toNumberOrNull(input.takeProfit);
  const exit = toNumberOrNull(input.exitPrice);
  const size = toNumberOrNull(input.positionSize);
  const multiplier = toNumberOrNull(input.multiplier) ?? 1;
  const fees = toNumberOrNull(input.fees) ?? 0;
  const swap = toNumberOrNull(input.swap) ?? 0;
  const slippage = toNumberOrNull(input.slippage) ?? 0;
  const balance = toNumberOrNull(input.accountBalance);
  const riskAmountInput = toNumberOrNull(input.riskAmount);
  const riskPctInput = toNumberOrNull(input.riskPercentage);
  const manualGross = toNumberOrNull(input.manualGrossPnL);
  const manualResult = RESULTS.includes(input.manualResult) ? input.manualResult : null;

  if (entry === null || entry <= 0) errors.entryPrice = 'Entry price must be greater than 0';
  if (size === null || size <= 0) errors.positionSize = 'Position size must be greater than 0';
  if (multiplier <= 0) errors.multiplier = 'Multiplier must be greater than 0';
  if (sl !== null && sl <= 0) errors.stopLoss = 'Stop loss must be greater than 0';
  if (tp !== null && tp <= 0) errors.takeProfit = 'Take profit must be greater than 0';
  if (exit !== null && exit <= 0) errors.exitPrice = 'Exit price must be greater than 0';
  if (fees < 0) errors.fees = 'Fees cannot be negative';
  if (slippage < 0) errors.slippage = 'Slippage cannot be negative';
  if (balance !== null && balance < 0) errors.accountBalance = 'Account balance cannot be negative';
  if (riskAmountInput !== null && riskAmountInput < 0) errors.riskAmount = 'Risk amount cannot be negative';
  if (riskPctInput !== null && (riskPctInput < 0 || riskPctInput > 100)) {
    errors.riskPercentage = 'Risk % must be between 0 and 100';
  }

  if (!errors.entryPrice && !errors.direction) {
    if (sl !== null && !errors.stopLoss) {
      if (direction === 'long' && sl >= entry) errors.stopLoss = 'For a Long trade the stop loss must be below the entry price';
      if (direction === 'short' && sl <= entry) errors.stopLoss = 'For a Short trade the stop loss must be above the entry price';
    }
    if (tp !== null && !errors.takeProfit) {
      if (direction === 'long' && tp <= entry) errors.takeProfit = 'For a Long trade the take profit must be above the entry price';
      if (direction === 'short' && tp >= entry) errors.takeProfit = 'For a Short trade the take profit must be below the entry price';
    }
  }

  if (Object.keys(errors).length) throw new CalcValidationError(errors);

  const dir = direction === 'long' ? 1 : -1;
  const unitValue = size * multiplier;

  // --- Risk ---
  const slRiskAmount = sl !== null ? money(Math.abs(entry - sl) * unitValue) : null;
  let riskAmount = null;
  let riskSource = null;
  if (riskAmountInput !== null && riskAmountInput > 0) {
    riskAmount = money(riskAmountInput);
    riskSource = 'manual';
  } else if (slRiskAmount !== null && slRiskAmount > 0) {
    riskAmount = slRiskAmount;
    riskSource = 'stopLoss';
  } else if (riskPctInput !== null && riskPctInput > 0 && balance !== null && balance > 0) {
    riskAmount = money((balance * riskPctInput) / 100);
    riskSource = 'percentage';
  }

  let riskPercentage = null;
  if (riskAmount !== null && balance !== null && balance > 0) {
    riskPercentage = round((riskAmount / balance) * 100, 2);
  } else if (riskPctInput !== null) {
    riskPercentage = round(riskPctInput, 2);
  }

  const potentialReward = tp !== null ? money(Math.abs(tp - entry) * unitValue) : null;
  const plannedRR =
    tp !== null && sl !== null ? round(safeDiv(Math.abs(tp - entry), Math.abs(entry - sl), 0), 2) : null;

  // --- Result ---
  const isClosed = exit !== null || manualGross !== null;
  let grossPnL = null;
  let netPnL = null;
  let rMultiple = null;
  let result = null;
  const totalCosts = money(fees + swap + slippage);

  if (isClosed) {
    grossPnL = manualGross !== null ? money(manualGross) : money((exit - entry) * dir * unitValue);
    netPnL = money(grossPnL - totalCosts);
    const r = safeDiv(netPnL, riskAmount, null);
    rMultiple = r === null ? null : round(r, 2);
    if (manualResult) result = manualResult;
    else if (netPnL > 0) result = 'win';
    else if (netPnL < 0) result = 'loss';
    else result = 'breakeven';
  }

  return {
    status: isClosed ? 'closed' : 'open',
    multiplier,
    fees: money(fees),
    swap: money(swap),
    slippage: money(slippage),
    totalCosts,
    slRiskAmount,
    riskAmount,
    riskPercentage,
    riskSource,
    potentialReward,
    plannedRR,
    grossPnL,
    netPnL,
    rMultiple,
    result,
  };
}

module.exports = { calculateTrade, CalcValidationError, RESULTS };
