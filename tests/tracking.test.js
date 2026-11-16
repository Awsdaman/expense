import { describe, it, expect } from 'vitest';
import { computeTracking, suggestLimit, trackingElapsed } from '../src/core/tracking.js';
import { handleRequest } from '../src/core/api.js';
import { createMemoryStore } from '../src/dev/memory-store.js';
import { DEFAULT_SETTINGS, STARTER_CATEGORIES, isTracking, resolveTrackingStart } from '../src/core/settings.js';

const SETTINGS = { ...DEFAULT_SETTINGS, tracking_start: '2026-11-16', tracking_end: '2027-01-16' };
const CATEGORIES = STARTER_CATEGORIES.map((c) => ({ ...c }));

function txn(fields) {
  return {
    status: 'categorized', direction: 'out', type: 'purchase', currency: 'SAR', merchant: 'SHOP', ...fields,
    amount_sar: fields.amount, received_at: fields.txn_at,
  };
}

const TXNS = [
  txn({ txn_at: '2026-11-15T20:00:00+03:00', amount: 999, category: 'Coffee' }), // before the start
  txn({ txn_at: '2026-11-16T08:30:00+03:00', amount: 20, category: 'Coffee', merchant: 'STARBUCKS' }), // Mon morning
  txn({ txn_at: '2026-11-16T19:00:00+03:00', amount: 300, category: 'Groceries', merchant: 'TAMI' }), // Mon evening
  txn({ txn_at: '2026-11-18T13:00:00+03:00', amount: 80, category: 'Coffee', merchant: 'BARNS' }), // Wed afternoon
  txn({ txn_at: '2026-11-23T23:30:00+03:00', amount: 1500, category: 'Family', merchant: 'SARA', type: 'transfer_out' }), // week 2, night
  txn({ txn_at: '2026-11-24T10:00:00+03:00', amount: 2000, category: 'Own account', merchant: 'ME', type: 'transfer_out' }),
  txn({ txn_at: '2026-11-24T11:00:00+03:00', amount: 45, category: '', status: 'pending' }),
  txn({ txn_at: '2026-11-25T11:00:00+03:00', amount: 50, category: 'Coffee', status: 'ignored' }),
  txn({ txn_at: '2026-11-25T12:00:00+03:00', amount: 30, category: 'Groceries', merchant: 'TAMI', type: 'refund', direction: 'in' }),
  txn({ txn_at: '2026-11-27T09:00:00+03:00', amount: 9000, category: 'Income', direction: 'in', type: 'credit' }),
];

function track(nowIso, transactions = TXNS) {
  return computeTracking({ transactions, categories: CATEGORIES, rules: [], settings: SETTINGS, nowIso });
}

describe('tracking period', () => {
  it('starts by default on the day of the first transaction recorded', () => {
    const rows = [
      { txn_at: '2026-11-05T10:00:00+03:00', status: 'categorized' },
      { txn_at: '2026-10-01T10:00:00+03:00', status: 'ignored' },
      { txn_at: '2026-11-03T00:30:00+03:00', status: 'pending' },
    ];
    expect(DEFAULT_SETTINGS.tracking_start).toBe('first');
    expect(resolveTrackingStart(DEFAULT_SETTINGS, rows, '2026-11-16T12:00:00+03:00').tracking_start).toBe('2026-11-03');
    expect(resolveTrackingStart(DEFAULT_SETTINGS, [], '2026-11-16T12:00:00+03:00').tracking_start).toBe('2026-11-16');
    const pinned = { ...DEFAULT_SETTINGS, tracking_start: '2026-11-10' };
    expect(resolveTrackingStart(pinned, rows, '2026-11-16T12:00:00+03:00')).toBe(pinned);
  });

  it('is on by default until 16 Jan 2027', () => {
    expect(isTracking(resolveTrackingStart(DEFAULT_SETTINGS, [], '2026-11-16T12:00:00+03:00'))).toBe(true);
    expect(DEFAULT_SETTINGS.tracking_end).toBe('2027-01-16');
    expect(isTracking({ ...DEFAULT_SETTINGS, mode: 'budget' })).toBe(false);
    expect(isTracking({ ...DEFAULT_SETTINGS, tracking_end: '2026-11-01' })).toBe(false);
  });

  it('counts elapsed days from the start, capped at the end', () => {
    expect(trackingElapsed('2026-11-16', '2027-01-16', '2026-11-15')).toBe(0);
    expect(trackingElapsed('2026-11-16', '2027-01-16', '2026-11-16')).toBe(1);
    expect(trackingElapsed('2026-11-16', '2027-01-16', '2026-11-29')).toBe(14);
    expect(trackingElapsed('2026-11-16', '2027-01-16', '2027-03-01')).toBe(61);
  });

  it('rounds a monthly average up to the next 50', () => {
    expect(suggestLimit(0)).toBe(0);
    expect(suggestLimit(1)).toBe(50);
    expect(suggestLimit(1212.4)).toBe(1250);
    expect(suggestLimit(1250)).toBe(1250);
  });
});

describe('computeTracking', () => {
  const t = track('2026-11-29T12:00:00+03:00');

  it('totals spending inside the period, without own-account transfers or ignored rows', () => {
    expect(t).toMatchObject({ start: '2026-11-16', end: '2027-01-16', days_total: 61, days_elapsed: 14, days_left: 47, done: false });
    // 20 + 300 + 80 + 1500 + 45 = 1945 spent, minus a 30 refund.
    expect(t.totals).toMatchObject({ spent: 1945, refunds: 30, net_spent: 1915, income: 9000, left_over: 7085, count: 5, uncategorized: 45 });
    expect(t.totals.daily_avg).toBe(136.79);
  });

  it('ranks categories with their share, averages and merchants', () => {
    expect(t.categories.map((c) => c.name)).toEqual(['Family', 'Groceries', 'Coffee', 'Uncategorized']);
    const coffee = t.categories.find((c) => c.name === 'Coffee');
    expect(coffee).toMatchObject({ spent: 100, count: 2, share: 0.05, daily_avg: 7.14, weekly_avg: 50, monthly_avg: 217.43 });
    expect(coffee.merchants.map((m) => [m.merchant, m.total])).toEqual([['BARNS', 80], ['STARBUCKS', 20]]);
    const groceries = t.categories.find((c) => c.name === 'Groceries');
    expect(groceries.spent).toBe(270);
  });

  it('splits spending into 7-day weeks from the start, up to today', () => {
    expect(t.weeks.map((w) => [w.start, w.end, w.total])).toEqual([
      ['2026-11-16', '2026-11-23', 400],
      ['2026-11-23', '2026-11-30', 1545],
    ]);
    expect(t.weeks[0].categories).toEqual({ Coffee: 100, Groceries: 300 });
    expect(t.weeks[1].days_counted).toBe(7);
  });

  it('finds weekday, time of day and size patterns', () => {
    const mon = t.patterns.weekdays.find((d) => d.label === 'Mon');
    expect(mon).toMatchObject({ total: 1820, count: 3 });
    expect(t.patterns.times.map((b) => [b.key, b.count])).toEqual([['morning', 2], ['afternoon', 1], ['evening', 1], ['night', 1]]);
    expect(t.patterns.sizes.map((b) => [b.key, b.count])).toEqual([['small', 2], ['medium', 1], ['large', 1], ['xlarge', 1]]);
  });

  it('suggests a limit per category from the monthly average and skips Own account', () => {
    const coffee = t.suggestions.find((s) => s.name === 'Coffee');
    expect(coffee).toMatchObject({ monthly_avg: 217.43, suggested: 250, current_budget: 300 });
    expect(t.suggestions.some((s) => s.name === 'Own account')).toBe(false);
    expect(t.suggestions.find((s) => s.name === 'Travel').suggested).toBe(0);
  });

  it('skips rows without a usable date, such as a row cleared in the Sheet', () => {
    const blank = { id: '', txn_at: '', received_at: '', status: '', direction: '', amount: '', category: '' };
    const typed = txn({ txn_at: 'yesterday', amount: 10, category: 'Coffee' });
    const r = track('2026-11-29T12:00:00+03:00', [...TXNS, blank, typed]);
    expect(r.totals.net_spent).toBe(1915);
  });

  it('is done once today reaches the end', () => {
    expect(track('2027-01-16T08:00:00+03:00').done).toBe(true);
    expect(track('2027-01-15T23:00:00+03:00').done).toBe(false);
  });
});

const TOKEN = 'tok';
const NOW = '2026-11-20T12:00:00+03:00';
const ALRAJHI_TRANSFER = ['حوالة محلية صادرة بـSR 250', 'من4682', 'لـ5000;أحمد سالم', 'رسوم:SR 0.58', '26/11/15 18:54'].join('\n');
const SNB_SMS = ['شراء-POS', 'بـ14 SAR', 'من khush sha', 'مدى-ابل*1111', 'في 18/11/26 18:50'].join('\n');

function setup({ categories = CATEGORIES, settings = {} } = {}) {
  const store = createMemoryStore({
    Categories: categories.map((c) => ({ ...c })),
    Settings: Object.entries({ ...DEFAULT_SETTINGS, ...settings }).map(([key, value]) => ({ key, value: String(value) })),
  });
  let n = 0;
  const env = { token: TOKEN, nowIso: () => NOW, random: () => ((n += 0.137) % 1) };
  return { store, call: (p) => handleRequest({ token: TOKEN, ...p }, store, env) };
}

describe('API in tracking mode', () => {
  it('asks about a transfer and offers Own account last', () => {
    const { call } = setup();
    const res = call({ action: 'ingest', sms: ALRAJHI_TRANSFER, sender: 'AlRajhiBank' });
    expect(res.ask).toBe(true);
    expect(res.prompt).toBe('Transfer 250 SAR to أحمد سالم — what was this for?');
    expect(res.categories.slice(-2)).toEqual(['Own account', 'Uncategorized']);
  });

  it('never offers Own account for a card purchase', () => {
    const { call } = setup();
    const res = call({ action: 'ingest', sms: SNB_SMS });
    expect(res.categories).not.toContain('Own account');
  });

  it('categorize returns no budget alert, only the category total so far', () => {
    const { call } = setup();
    call({ action: 'create', fields: { amount: 1700, merchant_raw: 'Big Restaurant', category: 'Food & Restaurants', txn_at: '2026-11-17T20:00:00+03:00' } });
    const a = call({ action: 'ingest', sms: SNB_SMS });
    const res = call({ action: 'categorize', id: a.txn.id, category: 'Food & Restaurants' });
    expect(res).toEqual({ ok: true, tracking: { category: 'Food & Restaurants', spent: 1714 } });
  });

  it('a transfer put in Own account is kept but not counted', () => {
    const { call, store } = setup();
    const a = call({ action: 'ingest', sms: ALRAJHI_TRANSFER.replace('26/11/15', '26/11/17') });
    call({ action: 'categorize', id: a.txn.id, category: 'Own account' });
    expect(store.rows('Transactions')).toHaveLength(1);
    const s = call({ action: 'summary' });
    expect(s.mode).toBe('tracking');
    expect(s.tracking.totals.net_spent).toBe(0);
    expect(s.totals.net_spent).toBe(0);
    expect(s.categories.some((c) => c.name === 'Own account')).toBe(false);
  });

  it('the period starts on the first transaction recorded unless a start date is saved', () => {
    const { call } = setup();
    call({ action: 'create', fields: { amount: 30, merchant_raw: 'A', category: 'Coffee', txn_at: '2026-11-04T10:00:00+03:00' } });
    call({ action: 'create', fields: { amount: 20, merchant_raw: 'B', category: 'Coffee', txn_at: '2026-11-03T10:00:00+03:00' } });
    const s = call({ action: 'summary' });
    expect(s.tracking).toMatchObject({ start: '2026-11-03', end: '2027-01-16' });
    expect(s.tracking.totals.net_spent).toBe(50);
    expect(call({ action: 'config' }).settings.tracking_start).toBe('2026-11-03');
    call({ action: 'settings', tracking_start: '2026-11-04' });
    expect(call({ action: 'summary' }).tracking.totals.net_spent).toBe(30);
  });

  it('summary in budget mode has no tracking block', () => {
    const { call } = setup({ settings: { mode: 'budget' } });
    const s = call({ action: 'summary' });
    expect(s.mode).toBe('budget');
    expect(s.tracking).toBeNull();
  });

  it('adds the Own account category once to a Sheet that does not have it, keeping the rest', () => {
    const old = CATEGORIES.filter((c) => c.kind !== 'own');
    const { call, store } = setup({ categories: old });
    call({ action: 'config' });
    call({ action: 'config' });
    const rows = store.rows('Categories');
    expect(rows).toHaveLength(old.length + 1);
    expect(rows.filter((c) => c.kind === 'own')).toEqual([expect.objectContaining({ name: 'Own account', sort: 15, monthly_budget: 0 })]);
    expect(rows.slice(0, old.length).map((c) => c.monthly_budget)).toEqual(old.map((c) => c.monthly_budget));
  });

  it('settings switch the mode and change the period, rejecting bad dates', () => {
    const { call } = setup();
    expect(call({ action: 'settings', mode: 'off' })).toEqual({ ok: false, error: 'bad_request' });
    expect(call({ action: 'settings', tracking_end: '2026-13-01' })).toEqual({ ok: false, error: 'bad_request' });
    expect(call({ action: 'settings', tracking_end: '2026-11-01' })).toEqual({ ok: false, error: 'bad_request' });
    const res = call({ action: 'settings', tracking_start: '2026-11-10', tracking_end: '2027-01-10' });
    expect(res.settings).toMatchObject({ mode: 'tracking', tracking_start: '2026-11-10', tracking_end: '2027-01-10' });
    const done = call({ action: 'settings', mode: 'budget', budgets: { Coffee: 250 } });
    expect(done.settings.mode).toBe('budget');
    expect(done.categories.find((c) => c.name === 'Coffee').monthly_budget).toBe(250);
  });

  it('transactions filter by category and date range', () => {
    const { call, store } = setup();
    call({ action: 'create', fields: { amount: 10, merchant_raw: 'A', category: 'Coffee', txn_at: '2026-11-15T10:00:00+03:00' } });
    call({ action: 'create', fields: { amount: 20, merchant_raw: 'B', category: 'Coffee', txn_at: '2026-11-17T10:00:00+03:00' } });
    call({ action: 'create', fields: { amount: 30, merchant_raw: 'C', category: 'Groceries', txn_at: '2026-11-17T11:00:00+03:00' } });
    call({ action: 'create', fields: { amount: 40, merchant_raw: 'D', txn_at: '2026-11-18T11:00:00+03:00' } });
    store.append('Transactions', { id: 't_blank', txn_at: '', received_at: '', category: 'Coffee', amount: 5 });
    const coffee = call({ action: 'transactions', category: 'Coffee', from: '2026-11-16', to: '2027-01-16' });
    expect(coffee.transactions.map((r) => r.amount)).toEqual([20]);
    const unc = call({ action: 'transactions', category: 'Uncategorized', from: '2026-11-16' });
    expect(unc.transactions.map((r) => r.amount)).toEqual([40]);
  });
});
