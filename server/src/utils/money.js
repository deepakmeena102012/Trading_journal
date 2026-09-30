/**
 * Consistent decimal handling for financial values.
 * Money is rounded to 2 decimals, ratios/R multiples to 2, percentages to 2.
 * Uses exponent-shift rounding to avoid binary floating point artifacts
 * (e.g. 1.005 -> 1.01, 0.1 + 0.2 -> 0.3) and rounds half away from zero.
 */
function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  const shifted = Math.round(Number(`${Math.abs(n)}e${decimals}`));
  const result = sign * Number(`${shifted}e-${decimals}`);
  return Object.is(result, -0) ? 0 : result;
}

const money = (v) => round(v, 2);

/** Safe division: returns `fallback` when the divisor is zero or the result is not finite. */
function safeDiv(numerator, denominator, fallback = null) {
  const a = Number(numerator);
  const b = Number(denominator);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return fallback;
  const r = a / b;
  return Number.isFinite(r) ? r : fallback;
}

/** Returns a finite number or null for empty/invalid input. */
function toNumberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/** Sum that ignores null/NaN values and rounds the total once at the end. */
function sum(values, decimals = 2) {
  let total = 0;
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) total += n;
  }
  return round(total, decimals);
}

module.exports = { round, money, safeDiv, toNumberOrNull, sum };
