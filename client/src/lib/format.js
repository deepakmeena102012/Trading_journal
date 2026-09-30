const LOCALES = { INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB' };
const formatters = new Map();

function moneyFormatter(currency, compact) {
  const key = `${currency}-${compact}`;
  if (!formatters.has(key)) {
    formatters.set(
      key,
      new Intl.NumberFormat(LOCALES[currency] || 'en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: compact ? 0 : 2,
        maximumFractionDigits: compact ? 1 : 2,
        notation: compact ? 'compact' : 'standard',
      })
    );
  }
  return formatters.get(key);
}

const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/** Money with an explicit +/- sign when `signed` (so P&L never relies on color alone). */
export function formatMoney(value, currency = 'INR', { signed = false, compact = false } = {}) {
  if (!isNum(value)) return '—';
  const n = Number(value);
  const text = moneyFormatter(currency, compact).format(Math.abs(n));
  if (n < 0) return `−${text}`;
  if (signed && n > 0) return `+${text}`;
  return text;
}

export function formatR(value) {
  if (!isNum(value)) return '—';
  const n = Number(value);
  const text = Math.abs(n).toFixed(2);
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${text}R`;
}

export function formatPct(value, digits = 1) {
  if (!isNum(value)) return '—';
  return `${Number(value).toFixed(digits)}%`;
}

export function formatNumber(value, maxDigits = 2) {
  if (!isNum(value)) return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: maxDigits });
}

/** Prices keep their precision (up to 8 decimals) without trailing zeros. */
export function formatPrice(value) {
  if (!isNum(value)) return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 8 });
}

export function formatRatio(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(2);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Formats a YYYY-MM-DD string without timezone conversion. */
export function formatDate(s, { withYear = true } = {}) {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return withYear ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${d}`;
}

/** "2026-09" -> "September 2026" (or "Sep 26" when short). */
export function formatMonth(s, short = false) {
  if (!s || !/^\d{4}-\d{2}/.test(s)) return '—';
  const [y, m] = s.split('-').map(Number);
  return short ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : `${MONTHS_LONG[m - 1]} ${y}`;
}

/** Tailwind text color class for a signed value. */
export function pnlClass(value) {
  if (!isNum(value)) return 'text-muted';
  const n = Number(value);
  if (n > 0) return 'text-profit';
  if (n < 0) return 'text-loss';
  return 'text-neutral';
}

export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
