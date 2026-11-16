import { riyadhDate } from './cycle.js';

export const TAB_HEADERS = {
  Transactions: ['id','received_at','txn_at','type','direction','amount','currency','amount_sar','merchant_raw','merchant','card_last4','payment_method','bank','category','note','status','cycle','dedupe_hash','raw_sms'],
  Categories: ['name','emoji','monthly_budget','kind','active','sort'],
  MerchantRules: ['merchant','display_name','category','hits','auto','updated_at'],
  Settings: ['key','value'],
  ParseErrors: ['id','received_at','raw_sms','error','status'],
};

// mode 'tracking' hides budgets and only records where the money goes, from tracking_start up to
// (not including) tracking_end. mode 'budget' is the normal budget view.
// tracking_start 'first' means the day of the first transaction recorded (see resolveTrackingStart).
export const DEFAULT_SETTINGS = {
  currency: 'SAR', cycle_start_day: 27, savings_target: 3000, alert_threshold: 0.8, auto_threshold: 3, timezone: 'Asia/Riyadh',
  mode: 'tracking', tracking_start: 'first', tracking_end: '2027-01-16',
};

// Transfers to your own accounts: recorded, never counted as spending.
export const OWN_ACCOUNT_KIND = 'own';
export const OWN_ACCOUNT_CATEGORY = { name: 'Own account', emoji: '🔁', monthly_budget: 0, kind: 'own', active: true, sort: 15 };

export const STARTER_CATEGORIES = [
  { name: 'Food & Restaurants', emoji: '🍔', monthly_budget: 1500, kind: 'want', active: true, sort: 1 },
  { name: 'Coffee', emoji: '☕', monthly_budget: 300, kind: 'want', active: true, sort: 2 },
  { name: 'Groceries', emoji: '🛒', monthly_budget: 2000, kind: 'need', active: true, sort: 3 },
  { name: 'Fuel & Car', emoji: '⛽', monthly_budget: 600, kind: 'need', active: true, sort: 4 },
  { name: 'Transport', emoji: '🚕', monthly_budget: 300, kind: 'need', active: true, sort: 5 },
  { name: 'Shopping', emoji: '🛍️', monthly_budget: 800, kind: 'want', active: true, sort: 6 },
  { name: 'Bills & Subscriptions', emoji: '🧾', monthly_budget: 900, kind: 'need', active: true, sort: 7 },
  { name: 'Health', emoji: '💊', monthly_budget: 300, kind: 'need', active: true, sort: 8 },
  { name: 'Family', emoji: '👨‍👩‍👧', monthly_budget: 1000, kind: 'need', active: true, sort: 9 },
  { name: 'Home', emoji: '🏠', monthly_budget: 500, kind: 'need', active: true, sort: 10 },
  { name: 'Entertainment', emoji: '🎬', monthly_budget: 400, kind: 'want', active: true, sort: 11 },
  { name: 'Travel', emoji: '✈️', monthly_budget: 0, kind: 'want', active: true, sort: 12 },
  { name: 'Gifts & Charity', emoji: '🎁', monthly_budget: 300, kind: 'want', active: true, sort: 13 },
  { name: 'Other', emoji: '📦', monthly_budget: 300, kind: 'want', active: true, sort: 14 },
  OWN_ACCOUNT_CATEGORY,
];

const SETTINGS_NUMERIC_KEYS = ['cycle_start_day', 'savings_target', 'alert_threshold', 'auto_threshold'];

export function readSettings(rows) {
  const out = { ...DEFAULT_SETTINGS };
  for (const row of rows || []) {
    const key = row.key;
    if (!key || key === 'api_token') continue;
    if (row.value === '' || row.value === null || row.value === undefined) continue;
    out[key] = SETTINGS_NUMERIC_KEYS.includes(key) ? Number(row.value) : row.value;
  }
  return out;
}

const SETTINGS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isTrackingDate(v) {
  return typeof v === 'string' && SETTINGS_DATE_RE.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z'));
}

// Turns tracking_start 'first' into the Riyadh date of the earliest non-ignored transaction,
// or today when there is none yet. A real date set in Settings is kept as it is.
export function resolveTrackingStart(settings, transactions, nowIso) {
  if (settings.tracking_start !== 'first') return settings;
  let first = '';
  for (const t of transactions || []) {
    if (t.status === 'ignored') continue;
    const when = t.txn_at || t.received_at;
    if (!when || isNaN(Date.parse(when))) continue;
    const day = riyadhDate(when);
    if (!first || day < first) first = day;
  }
  return { ...settings, tracking_start: first || riyadhDate(nowIso) };
}

// Tracking mode needs valid dates with the start before the end.
export function isTracking(settings) {
  const s = settings || {};
  return s.mode === 'tracking' && isTrackingDate(s.tracking_start) && isTrackingDate(s.tracking_end) && s.tracking_start < s.tracking_end;
}

export function isTruthy(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
}

export function activeCategories(rows) {
  return (rows || [])
    .filter((r) => isTruthy(r.active))
    .map((r) => ({ ...r, monthly_budget: Number(r.monthly_budget) || 0 }))
    .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
