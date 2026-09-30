export const MARKETS = [
  { value: 'forex', label: 'Forex' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'gold', label: 'Gold' },
  { value: 'stocks', label: 'Stocks' },
  { value: 'other', label: 'Other' },
];

export const DIRECTIONS = [
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
];

export const RESULTS = [
  { value: 'win', label: 'Win' },
  { value: 'loss', label: 'Loss' },
  { value: 'breakeven', label: 'Break-even' },
];

export const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '1D', '1W', '1M'];
export const SESSIONS = ['Asian', 'London', 'New York', 'London/NY Overlap', 'Pre-market', 'After-hours'];
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];

export const CHECK_VALUES = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'na', label: 'N/A' },
];

export const SCREENSHOT_KINDS = [
  { value: 'before', label: 'Before entry' },
  { value: 'entry', label: 'After entry' },
  { value: 'exit', label: 'After exit' },
];

export const labelOf = (list, value) => list.find((x) => x.value === value)?.label || value || '—';
