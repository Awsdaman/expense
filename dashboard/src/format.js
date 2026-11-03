// Display formatting for the dashboard. Times are Riyadh (UTC+3, no DST).

const TZ = 'Asia/Riyadh';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: TZ });
const dayMonthUtc = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ });

// Figure only, no currency: "14", "81.60", "1,250.50". Negatives use a true minus sign.
export function money(n, { sign = false } = {}) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const whole = Math.abs(abs - Math.round(abs)) < 1e-9;
  const body = abs.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  if (body === '0') return '0';
  if (v < 0) return `−${body}`;
  return sign ? `+${body}` : body;
}

// 27 -> "27th", 1 -> "1st", 12 -> "12th"
export function ordinal(day) {
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[day % 10] || 'th';
  return `${day}${suffix}`;
}

// "2026-11-03" or an ISO datetime -> "3 Nov"
export function shortDate(value) {
  return DATE_ONLY.test(value)
    ? dayMonthUtc.format(new Date(`${value}T00:00:00Z`))
    : dayMonth.format(new Date(value));
}

// ISO datetime -> "18:50"
export function time(iso) {
  return clock.format(new Date(iso));
}

// Cycle start and exclusive end dates -> "27 Oct – 26 Nov"
export function cycleTitle(start, end) {
  const last = new Date(new Date(`${end}T00:00:00Z`).getTime() - 86400000);
  return `${shortDate(start)} – ${dayMonthUtc.format(last)}`;
}

// Typed amount -> number, NaN when it is not a number. Accepts "1,250.5" and " 40 ".
export function parseNumber(text) {
  const cleaned = String(text ?? '').replace(/[,\s]/g, '');
  if (cleaned === '') return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}
