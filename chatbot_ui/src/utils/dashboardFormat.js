// Formatting helpers for the dashboard widgets (Components/Dashboard/*).

export function formatMoney(value, currency = 'USD', { compact = false } = {}) {
  const n = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: compact && Math.abs(n) >= 10000 ? 'compact' : 'standard',
      maximumFractionDigits: compact && Math.abs(n) >= 10000 ? 1 : 2,
      minimumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export const formatCount = (value) => Number(value || 0).toLocaleString('en-US');

let regionNames = null;
/** "BD" → "Bangladesh"; null/unknown → "Unknown". */
export function countryName(code) {
  if (!code) return 'Unknown';
  try {
    regionNames ||= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(String(code).toUpperCase()) || code;
  } catch {
    return code;
  }
}

/** % change from `previous` to `current`, or null when there's nothing to compare. */
export function percentChange(current, previous) {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  if (!p) return null;
  return ((c - p) / p) * 100;
}

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Current month as "YYYY-MM" (local time). */
export function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
