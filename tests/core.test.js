import { describe, it, expect } from 'vitest';
import { TAB_HEADERS, DEFAULT_SETTINGS, STARTER_CATEGORIES, readSettings, isTruthy, activeCategories } from '../src/core/settings.js';
import { round2, formatAmount, formatMoney } from '../src/core/format.js';
import { riyadhDate, cycleStartDate, cycleLabel, cycleBounds, shiftCycle, daysBetween, daysLeft } from '../src/core/cycle.js';
import { hashText, makeId, safeEqual } from '../src/core/hash.js';
import { merchantRules, suggestCategory, autoCategory, displayNameFor, learnRule } from '../src/core/rules.js';
import { spendAmount, budgetStatus, computeSummary, detectRecurring } from '../src/core/summary.js';
import { monthlyReport, weeklyNudge, healthWarning } from '../src/core/report.js';

const NOW = '2026-11-03T18:50:00+03:00';

function tx(over) {
  return {
    id: 't', received_at: '', txn_at: '', type: 'purchase', direction: 'out', amount: 0, currency: 'SAR',
    amount_sar: '', merchant_raw: '', merchant: '', category: '', status: 'categorized', cycle: '2026-10',
    ...over,
  };
}

const CATEGORIES = [
  { name: 'Food & Restaurants', emoji: '🍔', monthly_budget: '200', kind: 'want', active: 'TRUE', sort: '1' },
  { name: 'Groceries', emoji: '🛒', monthly_budget: 500, kind: 'need', active: true, sort: 2 },
  { name: 'Coffee', emoji: '☕', monthly_budget: 0, kind: 'want', active: true, sort: 3 },
  { name: 'Old Store', emoji: '🏚️', monthly_budget: 200, kind: 'want', active: false, sort: 9 },
  { name: 'Retired', emoji: '📦', monthly_budget: 0, kind: 'want', active: false, sort: 10 },
];

const RULES = [
  { merchant: 'TAMIMI', display_name: 'Tamimi Markets', category: 'Groceries', hits: 3, auto: 'TRUE', updated_at: '2026-09-01T00:00:00Z' },
];

const TXNS = [
  tx({ id: 'a', received_at: '2026-10-28T13:00:00+03:00', txn_at: '2026-10-28T13:00:00+03:00', amount: 300, merchant: 'TAMIMI', merchant_raw: 'TAMIMI S175', category: 'Groceries' }),
  tx({ id: 'b', received_at: '2026-10-30T19:00:00+03:00', txn_at: '2026-10-30T19:00:00+03:00', amount: 250, merchant: 'BURGER LAB', category: 'Food & Restaurants' }),
  tx({ id: 'c', received_at: '2026-11-02T09:00:00+03:00', txn_at: '2026-11-02T09:00:00+03:00', type: 'atm', amount: 100, merchant: 'ATM CASH', category: '', status: 'pending' }),
  tx({ id: 'd', received_at: '2026-10-29T08:00:00+03:00', txn_at: '2026-10-29T08:00:00+03:00', amount: 50, merchant: 'OLD SHOP', category: 'Old Store' }),
  tx({ id: 'e', received_at: '2026-11-02T10:00:00+03:00', txn_at: '2026-11-02T10:00:00+03:00', amount: 30, merchant: 'NAMAA', category: 'Coffee', status: 'auto' }),
  tx({ id: 'f', received_at: '2026-11-02T11:00:00+03:00', txn_at: '2026-11-02T11:00:00+03:00', amount: 10, currency: 'USD', amount_sar: 37.5, merchant: 'STARBUCKS', category: 'Coffee' }),
  tx({ id: 'g', received_at: '2026-11-01T12:00:00+03:00', txn_at: '2026-11-01T12:00:00+03:00', amount: 100, merchant: 'TAMIMI', category: 'Groceries' }),
  tx({ id: 'r', received_at: '2026-10-31T10:00:00+03:00', txn_at: '2026-10-31T10:00:00+03:00', type: 'refund', direction: 'in', amount: 40, merchant: 'BURGER LAB', category: 'Food & Restaurants' }),
  tx({ id: 's', received_at: '2026-10-27T00:00:00+03:00', txn_at: '2026-10-27T00:00:00+03:00', type: 'credit', direction: 'in', amount: 5000, merchant: 'SALARY', category: '' }),
  tx({ id: 'i', received_at: '2026-11-02T12:00:00+03:00', txn_at: '2026-11-02T12:00:00+03:00', amount: 999, merchant: 'IGNORED', category: 'Groceries', status: 'ignored' }),
  tx({ id: 'o', received_at: '2026-11-10T10:00:00+03:00', txn_at: '2026-11-10T10:00:00+03:00', amount: 123, merchant: 'LATER', category: 'Groceries', status: 'pending', cycle: '2026-11' }),
  tx({ id: 'h1', received_at: '2026-09-29T10:00:00+03:00', txn_at: '2026-09-29T10:00:00+03:00', amount: 777, merchant: 'HYPERPANDA', category: 'Groceries', cycle: '2026-09' }),
  tx({ id: 'h2', received_at: '2026-09-15T10:00:00+03:00', txn_at: '2026-09-15T10:00:00+03:00', amount: 100, merchant: 'FOOD TRUCK', category: 'Food & Restaurants', cycle: '2026-09' }),
  tx({ id: 'h3', received_at: '2026-09-05T10:00:00+03:00', txn_at: '2026-09-05T10:00:00+03:00', amount: 46, merchant: 'NETFLIX', category: '', cycle: '2026-09' }),
  tx({ id: 'h4', received_at: '2026-08-20T10:00:00+03:00', txn_at: '2026-08-20T10:00:00+03:00', amount: 300, merchant: 'HYPERPANDA', category: 'Groceries', cycle: '2026-08' }),
  tx({ id: 'h5', received_at: '2026-08-05T10:00:00+03:00', txn_at: '2026-08-05T10:00:00+03:00', amount: 45, merchant: 'NETFLIX', category: '', cycle: '2026-08' }),
  tx({ id: 'h6', received_at: '2026-06-20T10:00:00+03:00', txn_at: '2026-06-20T10:00:00+03:00', amount: 5000, merchant: 'HYPERPANDA', category: 'Groceries', cycle: '2026-06' }),
];

const PARSE_ERRORS = [{ status: 'open' }, { status: 'open' }, { status: 'resolved' }];

function dataset() {
  return computeSummary({
    transactions: TXNS, categories: CATEGORIES, rules: RULES, settings: DEFAULT_SETTINGS,
    cycle: '2026-10', nowIso: NOW, parseErrors: PARSE_ERRORS,
  });
}

describe('settings', () => {
  it('exposes the five tab header lists and 14 starter categories', () => {
    expect(TAB_HEADERS.Transactions).toContain('dedupe_hash');
    expect(TAB_HEADERS.Transactions[0]).toBe('id');
    expect(TAB_HEADERS.Settings).toEqual(['key', 'value']);
    expect(Object.keys(TAB_HEADERS)).toHaveLength(5);
    expect(STARTER_CATEGORIES).toHaveLength(14);
    expect(STARTER_CATEGORIES[0].name).toBe('Food & Restaurants');
    expect(STARTER_CATEGORIES[13].name).toBe('Other');
    expect(DEFAULT_SETTINGS.cycle_start_day).toBe(27);
  });

  it('readSettings overlays rows on defaults, coerces numbers, hides api_token', () => {
    const s = readSettings([
      { key: 'cycle_start_day', value: '25' },
      { key: 'savings_target', value: '3500' },
      { key: 'api_token', value: 'secret' },
      { key: 'custom_flag', value: 'x' },
    ]);
    expect(s.cycle_start_day).toBe(25);
    expect(s.savings_target).toBe(3500);
    expect(s.alert_threshold).toBe(0.8);
    expect(s.custom_flag).toBe('x');
    expect('api_token' in s).toBe(false);
  });

  it('isTruthy accepts only the listed true values', () => {
    for (const v of [true, 'TRUE', 'true', 1, '1']) expect(isTruthy(v)).toBe(true);
    for (const v of [false, 'FALSE', 0, '', null, undefined, 'yes']) expect(isTruthy(v)).toBe(false);
  });

  it('activeCategories filters, sorts by sort then name, coerces budgets', () => {
    const rows = [
      { name: 'B', sort: '2', active: 'TRUE', monthly_budget: '' },
      { name: 'A', sort: '2', active: true, monthly_budget: '300' },
      { name: 'C', sort: 1, active: false, monthly_budget: 10 },
      { name: 'D', sort: '1', active: '1', monthly_budget: 50 },
    ];
    const out = activeCategories(rows);
    expect(out.map((r) => r.name)).toEqual(['D', 'A', 'B']);
    expect(out[1].monthly_budget).toBe(300);
    expect(out[2].monthly_budget).toBe(0);
  });
});

describe('format', () => {
  it('round2 rounds to 2 decimals', () => {
    expect(round2(81.6000001)).toBe(81.6);
    expect(round2(10 / 3)).toBe(3.33);
  });

  it('formatAmount follows the contract examples', () => {
    expect(formatAmount(14)).toBe('14');
    expect(formatAmount(81.6)).toBe('81.60');
    expect(formatAmount(1250.5)).toBe('1,250.50');
    expect(formatAmount(1234567)).toBe('1,234,567');
    expect(formatAmount(0)).toBe('0');
    expect(formatAmount(999.999)).toBe('1,000');
    expect(formatAmount(-1250.5)).toBe('-1,250.50');
  });

  it('formatMoney appends the currency', () => {
    expect(formatMoney(81.6, 'SAR')).toBe('81.60 SAR');
  });
});

describe('cycle', () => {
  it('riyadhDate converts Z and offset timestamps to the Riyadh calendar date', () => {
    expect(riyadhDate('2026-10-26T22:00:00Z')).toBe('2026-10-27');
    expect(riyadhDate(NOW)).toBe('2026-11-03');
  });

  it('cycleStartDate clamps the start day to the month length', () => {
    expect(cycleStartDate(2026, 10, 27)).toBe('2026-10-27');
    expect(cycleStartDate(2026, 2, 31)).toBe('2026-02-28');
    expect(cycleStartDate(2026, 4, 31)).toBe('2026-04-30');
  });

  it('cycleLabel matches the contract examples (start day 27)', () => {
    expect(cycleLabel('2026-11-03T18:50:00+03:00', 27)).toBe('2026-10');
    expect(cycleLabel('2026-10-26T23:59:00+03:00', 27)).toBe('2026-09');
    expect(cycleLabel('2026-10-27T00:00:00+03:00', 27)).toBe('2026-10');
    expect(cycleLabel('2026-10-26T22:00:00Z', 27)).toBe('2026-10');
  });

  it('cycleLabel with start day 31 uses the clamped start in short months', () => {
    expect(cycleLabel('2027-02-27T12:00:00+03:00', 31)).toBe('2027-01');
    expect(cycleLabel('2027-02-28T00:00:00+03:00', 31)).toBe('2027-02');
    expect(cycleLabel('2026-04-29T12:00:00+03:00', 31)).toBe('2026-03');
    expect(cycleLabel('2026-04-30T00:00:00+03:00', 31)).toBe('2026-04');
  });

  it('cycleLabel and cycleBounds handle a UTC timestamp that is the next Riyadh day', () => {
    // 2026-10-26 22:00 UTC is 2026-10-27 01:00 in Riyadh, so it belongs to cycle 2026-10
    expect(cycleLabel('2026-10-26T22:00:00Z', 27)).toBe('2026-10');
    // and 2026-10-26 20:00 UTC is 2026-10-26 23:00 Riyadh, still cycle 2026-09
    expect(cycleLabel('2026-10-26T20:00:00Z', 27)).toBe('2026-09');
  });

  it('cycleBounds returns start and exclusive end, clamped', () => {
    expect(cycleBounds('2026-10', 27)).toEqual({ start: '2026-10-27', end: '2026-11-27' });
    expect(cycleBounds('2027-01', 31)).toEqual({ start: '2027-01-31', end: '2027-02-28' });
    expect(cycleBounds('2026-04', 31)).toEqual({ start: '2026-04-30', end: '2026-05-31' });
  });

  it('shiftCycle moves across years', () => {
    expect(shiftCycle('2026-01', -1)).toBe('2025-12');
    expect(shiftCycle('2026-11', 3)).toBe('2027-02');
    expect(shiftCycle('2026-10', -3)).toBe('2026-07');
  });

  it('daysBetween counts whole days', () => {
    expect(daysBetween('2026-10-27', '2026-11-27')).toBe(31);
    expect(daysBetween('2026-11-27', '2026-10-27')).toBe(-31);
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
  });

  it('daysLeft for a running, a finished and a future cycle', () => {
    expect(daysLeft(NOW, '2026-10', 27)).toBe(24);
    expect(daysLeft('2026-12-01T00:00:00+03:00', '2026-10', 27)).toBe(0);
    expect(daysLeft('2026-10-01T00:00:00+03:00', '2026-10', 27)).toBe(31);
    expect(daysLeft('2026-10-27T00:00:00+03:00', '2026-10', 27)).toBe(31);
  });
});

describe('hash', () => {
  it('hashText is deterministic 16 lowercase hex chars', () => {
    const h = hashText('Purchase of 81.60 SAR at TAMIMI');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(hashText('Purchase of 81.60 SAR at TAMIMI')).toBe(h);
    expect(hashText('Purchase of 81.61 SAR at TAMIMI')).not.toBe(h);
  });

  it('makeId draws 6 characters from the injected random function', () => {
    const picks = [0, 1, 25, 26, 35, 10]; // a, b, z, 0, 9, k
    let i = 0;
    const random = () => (picks[i++] + 0.5) / 36;
    expect(makeId('t', random)).toBe('t_abz09k');
    expect(i).toBe(6);
    expect(makeId('t', () => 0)).toBe('t_aaaaaa');
  });

  it('safeEqual compares strings and rejects non-strings and empty values', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
    expect(safeEqual('ab', 'abc')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
    expect(safeEqual(null, 'a')).toBe(false);
    expect(safeEqual('a', 1)).toBe(false);
  });
});

describe('rules', () => {
  it('merchantRules returns the rows for one merchant', () => {
    const rules = [
      { merchant: 'A', category: 'X', hits: 1 },
      { merchant: 'B', category: 'Y', hits: 1 },
      { merchant: 'A', category: 'Z', hits: 0 },
    ];
    expect(merchantRules(rules, 'A')).toHaveLength(2);
  });

  it('suggestCategory picks the most hits, ties go to the latest updated_at', () => {
    const rules = [
      { merchant: 'X', category: 'Coffee', hits: '2', updated_at: '2026-01-01T00:00:00Z' },
      { merchant: 'X', category: 'Food', hits: 2, updated_at: '2026-03-01T00:00:00Z' },
      { merchant: 'X', category: 'Shop', hits: 1, updated_at: '2026-09-01T00:00:00Z' },
    ];
    expect(suggestCategory(rules, 'X')).toBe('Food');
    expect(suggestCategory(rules, 'X')).not.toBe(null);
  });

  it('suggestCategory ignores zero-hit rows and returns null when none qualify', () => {
    expect(suggestCategory([{ merchant: 'X', category: 'Shop', hits: 0 }], 'X')).toBe(null);
    expect(suggestCategory([], 'X')).toBe(null);
  });

  it('autoCategory returns the category of an auto row', () => {
    expect(autoCategory([{ merchant: 'X', category: 'Coffee', auto: 'TRUE' }], 'X')).toBe('Coffee');
    expect(autoCategory([{ merchant: 'X', category: 'Coffee', auto: false }], 'X')).toBe(null);
  });

  it('displayNameFor returns the first non-empty display name', () => {
    const rules = [
      { merchant: 'S', display_name: '', category: 'A' },
      { merchant: 'S', display_name: 'Tamimi Markets', category: 'B' },
    ];
    expect(displayNameFor(rules, 'S')).toBe('Tamimi Markets');
    expect(displayNameFor(rules, 'Q')).toBe(null);
  });

  it('learnRule: three Coffee answers set auto; a different answer resets the streak', () => {
    let rules = [];
    const now = '2026-10-30T10:00:00+03:00';
    const answer = (cat) => {
      const rows = learnRule(rules, 'NAMAA', cat, now, 3);
      rules = [...rules.filter((r) => r.merchant !== 'NAMAA'), ...rows];
    };
    answer('Coffee');
    answer('Coffee');
    answer('Coffee');
    expect(merchantRules(rules, 'NAMAA').find((r) => r.category === 'Coffee')).toMatchObject({ hits: 3, auto: true, updated_at: now });

    answer('Food & Restaurants');
    expect(merchantRules(rules, 'NAMAA').find((r) => r.category === 'Coffee')).toMatchObject({ hits: 0, auto: false });
    expect(merchantRules(rules, 'NAMAA').find((r) => r.category === 'Food & Restaurants')).toMatchObject({ hits: 1, auto: false });
  });

  it('learnRule copies display_name onto returned rows and keeps display-name-only rows unchanged', () => {
    const only = { merchant: 'NAMAA', display_name: 'Namaa Cafe', category: '', hits: 0, auto: false, updated_at: '' };
    const out = learnRule([only], 'NAMAA', 'Coffee', '2026-10-30T10:00:00+03:00', 3);
    expect(out.find((r) => r.category === '')).toEqual(only);
    expect(out.find((r) => r.category === 'Coffee')).toMatchObject({ display_name: 'Namaa Cafe', hits: 1, auto: false });
  });

  it('learnRule reads string hits from the sheet', () => {
    const rules = [{ merchant: 'M', category: 'Coffee', hits: '2', auto: 'FALSE', display_name: '' }];
    const out = learnRule(rules, 'M', 'Coffee', '2026-10-30T10:00:00+03:00', 3);
    expect(out.find((r) => r.category === 'Coffee')).toMatchObject({ hits: 3, auto: true });
  });
});

describe('summary', () => {
  it('spendAmount prefers amount_sar, falls back to amount for SAR, else 0', () => {
    expect(spendAmount(tx({ amount: 10, currency: 'USD', amount_sar: '37.5' }))).toBe(37.5);
    expect(spendAmount(tx({ amount: 81.6, amount_sar: '' }))).toBe(81.6);
    expect(spendAmount(tx({ amount: 10, currency: 'USD', amount_sar: '' }))).toBe(0);
    expect(spendAmount(tx({ amount: 10, currency: 'USD', amount_sar: 'n/a' }))).toBe(0);
  });

  it('budgetStatus gives pct and warn/over/ok states, and null for no budget', () => {
    expect(budgetStatus(700, 1000, 0.8)).toEqual({ pct: 0.7, state: 'ok' });
    expect(budgetStatus(800, 1000, 0.8)).toEqual({ pct: 0.8, state: 'warn' });
    expect(budgetStatus(1000, 1000, 0.8)).toEqual({ pct: 1, state: 'over' });
    expect(budgetStatus(1200, 1000, 0.8)).toEqual({ pct: 1.2, state: 'over' });
    expect(budgetStatus(50, 0, 0.8)).toEqual({ pct: null, state: 'ok' });
  });

  it('computeSummary totals, refunds, income, uncategorized and counts', () => {
    const s = dataset();
    expect(s).toMatchObject({
      cycle: '2026-10', start: '2026-10-27', end: '2026-11-27', days_total: 31, days_left: 24, currency: 'SAR',
    });
    expect(s.totals).toEqual({ spent: 867.5, refunds: 40, net_spent: 827.5, income: 5000, uncategorized: 100, count: 7 });
  });

  it('computeSummary categories: net of refunds, budget states, inactive only when spent', () => {
    const s = dataset();
    expect(s.categories.map((c) => c.name)).toEqual(['Food & Restaurants', 'Groceries', 'Coffee', 'Old Store']);
    expect(s.categories[0]).toEqual({ name: 'Food & Restaurants', emoji: '🍔', kind: 'want', budget: 200, spent: 210, pct: 1.05, state: 'over' });
    expect(s.categories[1]).toMatchObject({ name: 'Groceries', spent: 400, budget: 500, pct: 0.8, state: 'warn' });
    expect(s.categories[2]).toMatchObject({ name: 'Coffee', spent: 67.5, budget: 0, pct: null, state: 'ok' });
    expect(s.categories[3]).toMatchObject({ name: 'Old Store', spent: 50, state: 'ok' });
  });

  it('computeSummary savings and needs vs wants', () => {
    const s = dataset();
    expect(s.savings).toEqual({ target: 3000, safe_to_spend: 1172.5, per_day: 48.85 });
    expect(s.needs_wants).toEqual({ need: 400, want: 327.5, other: 100 });
    expect(s.needs_wants.need + s.needs_wants.want + s.needs_wants.other).toBe(s.totals.net_spent);
  });

  it('computeSummary top merchants use display_name and gross out spend', () => {
    const s = dataset();
    expect(s.top_merchants[0]).toEqual({ merchant: 'TAMIMI', display_name: 'Tamimi Markets', total: 400, count: 2 });
    expect(s.top_merchants.map((m) => m.merchant)).toEqual(['TAMIMI', 'BURGER LAB', 'ATM CASH', 'OLD SHOP', 'STARBUCKS', 'NAMAA']);
    expect(s.top_merchants[1].display_name).toBe(null);
  });

  it('computeSummary daily runs from start to today, refunds and ignored rows excluded', () => {
    const s = dataset();
    expect(s.daily).toHaveLength(8);
    expect(s.daily[0]).toEqual({ date: '2026-10-27', spent: 0 });
    expect(s.daily.map((d) => d.spent)).toEqual([0, 300, 50, 250, 0, 100, 167.5, 0]);
    expect(s.daily[s.daily.length - 1].date).toBe('2026-11-03');
  });

  it('computeSummary history has the 3 previous cycles oldest first', () => {
    const s = dataset();
    expect(s.history.map((h) => h.cycle)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(s.history.map((h) => h.total)).toEqual([0, 345, 923]);
    expect(s.history[2].categories).toEqual({ 'Food & Restaurants': 100, Groceries: 777, Coffee: 0 });
  });

  it('computeSummary counts pending in any cycle and open parse errors', () => {
    const s = dataset();
    expect(s.pending_count).toBe(2);
    expect(s.parse_error_count).toBe(2);
  });

  it('computeSummary recurring lists NETFLIX only', () => {
    const s = dataset();
    expect(s.recurring).toEqual([{ merchant: 'NETFLIX', display_name: null, amount: 45.5, cycles: ['2026-08', '2026-09'] }]);
  });

  it('detectRecurring needs 2 cycles and every charge within 10% of the median', () => {
    const txns = [
      tx({ amount: 100, cycle: '2026-09', merchant: 'WIFI' }),
      tx({ amount: 104, cycle: '2026-08', merchant: 'WIFI' }),
      tx({ amount: 100, cycle: '2026-09', merchant: 'GYM' }),
      tx({ amount: 130, cycle: '2026-08', merchant: 'GYM' }),
      tx({ amount: 50, cycle: '2026-10', merchant: 'ONCE' }),
      tx({ amount: 50, cycle: '2026-10', merchant: 'ONCE' }),
      tx({ amount: 60, cycle: '2026-05', merchant: 'OLDONLY' }),
      tx({ amount: 60, cycle: '2026-04', merchant: 'OLDONLY' }),
    ];
    expect(detectRecurring(txns, [], '2026-10')).toEqual([
      { merchant: 'WIFI', display_name: null, amount: 102, cycles: ['2026-08', '2026-09'] },
    ]);
  });

  it('computeSummary keeps a future cycle at zero spend and an empty daily series', () => {
    const s = computeSummary({
      transactions: TXNS, categories: CATEGORIES, rules: RULES, settings: DEFAULT_SETTINGS,
      cycle: '2026-12', nowIso: NOW, parseErrors: [],
    });
    expect(s.totals.spent).toBe(0);
    expect(s.daily).toEqual([]);
    expect(s.days_left).toBe(31);
    expect(s.savings.per_day).toBe(0);
  });
});

describe('healthWarning', () => {
  const DAY = 86400000;
  const newest = Date.parse('2026-10-20T10:00:00+03:00');
  const burst = (count) => Array.from({ length: count }, (_, i) => ({
    received_at: new Date(newest - i * DAY / 2).toISOString(),
  }));

  it('warns when the newest SMS is over 5 days old and 10+ came in the 30 days before it', () => {
    const msg = healthWarning(burst(12), NOW);
    expect(typeof msg).toBe('string');
    expect(msg).toContain('14 days');
  });

  it('returns null with fewer than 10 earlier transactions', () => {
    expect(healthWarning(burst(9), NOW)).toBe(null);
  });

  it('returns null when the newest SMS is 5 days old or fewer', () => {
    expect(healthWarning(burst(12), '2026-10-25T10:00:00+03:00')).toBe(null);
  });

  it('returns null with no transactions', () => {
    expect(healthWarning([], NOW)).toBe(null);
  });
});

describe('report', () => {
  it('monthlyReport subject, lines and biggest increase vs previous', () => {
    const s = dataset();
    const previous = { categories: [{ name: 'Food & Restaurants', spent: 100 }, { name: 'Groceries', spent: 777 }] };
    const r = monthlyReport(s, previous);
    expect(r.subject).toBe('Iqtifaa: cycle 2026-10 summary');
    expect(r.text).toContain('Spent (after refunds): 827.50 SAR');
    expect(r.text).toContain('Income: 5,000 SAR');
    expect(r.text).toContain('Saved: 4,172.50 SAR (target 3,000 SAR)');
    expect(r.text).toContain('- Groceries: 400 SAR');
    expect(r.text).toContain('- Food & Restaurants: 210 SAR');
    expect(r.text).toContain('- Coffee: 67.50 SAR');
    expect(r.text).not.toContain('- Old Store');
    expect(r.text).toContain('Biggest increase vs previous cycle: Food & Restaurants (+110 SAR)');
    expect(r.text).not.toMatch(/[☀-➿]|[\u{1F300}-\u{1FAFF}]/u);
  });

  it('monthlyReport skips the increase line when previous is null', () => {
    const r = monthlyReport(dataset(), null);
    expect(r.text).not.toContain('Biggest increase');
  });

  it('weeklyNudge shows spent so far, safe to spend, pace and days left', () => {
    const r = weeklyNudge(dataset());
    expect(r.subject).toBe('Iqtifaa: cycle 2026-10 pace');
    expect(r.text).toContain('Spent so far: 827.50 SAR');
    expect(r.text).toContain('Safe to spend: 1,172.50 SAR');
    expect(r.text).toContain('Per day: 48.85 SAR');
    expect(r.text).toContain('Days left: 24');
  });
});
