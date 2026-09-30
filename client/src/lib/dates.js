const pad = (n) => String(n).padStart(2, '0');

/** Current date/time parts in a given IANA timezone (falls back to the browser's zone). */
export function nowInTimezone(timezone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
  }
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Date ranges (inclusive YYYY-MM-DD strings) relative to "today" in the user's timezone. */
export function rangeFor(period, timezone) {
  const { date } = nowInTimezone(timezone);
  const [y, m, d] = date.split('-').map(Number);
  // Same day N months back, clamped to that month's last day (May 31 − 3 months = Feb 28/29).
  const monthsBack = (n) => {
    const lastDay = new Date(y, m - 1 - n + 1, 0).getDate();
    return toStr(new Date(y, m - 1 - n, Math.min(d, lastDay)));
  };
  switch (period) {
    case 'this_month':
      return { from: toStr(new Date(y, m - 1, 1)), to: date };
    case 'last_month':
      return { from: toStr(new Date(y, m - 2, 1)), to: toStr(new Date(y, m - 1, 0)) };
    case 'last_3_months':
      return { from: monthsBack(3), to: date };
    case 'last_6_months':
      return { from: monthsBack(6), to: date };
    case 'this_year':
      return { from: `${y}-01-01`, to: date };
    default:
      return { from: '', to: '' };
  }
}

export const PERIODS = [
  { value: 'all', label: 'All time' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'this_year', label: 'This year' },
];

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Day of week of the 1st, Monday = 0. */
export function firstWeekday(month) {
  const [y, m] = month.split('-').map(Number);
  return (new Date(y, m - 1, 1).getDay() + 6) % 7;
}

export const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York'];
  }
})();
