// Tracking mode: no budgets, only where the money goes over one fixed period
// (tracking_start up to, not including, tracking_end). Feeds Home, Insights and the
// suggested limits shown when the period is over.
import { OWN_ACCOUNT_KIND } from './settings.js';
import { round2 } from './format.js';
import { riyadhDate, daysBetween, cycleLabel } from './cycle.js';
import { displayNameFor } from './rules.js';
import { spendAmount, detectRecurring } from './summary.js';

const TRACK_DAY_MS = 86400000;
const TRACK_DAYS_PER_MONTH = 30.44;
const TRACK_LIMIT_STEP = 50;
const TRACK_UNCATEGORIZED = 'Uncategorized';
const TRACK_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TRACK_TIMES = [
  { key: 'morning', label: 'Morning', from: 5, to: 12 },
  { key: 'afternoon', label: 'Afternoon', from: 12, to: 17 },
  { key: 'evening', label: 'Evening', from: 17, to: 22 },
  { key: 'night', label: 'Night', from: 22, to: 29 },
];
const TRACK_SIZES = [
  { key: 'small', label: 'Under 50', min: 0, max: 50 },
  { key: 'medium', label: '50 to 199', min: 50, max: 200 },
  { key: 'large', label: '200 to 999', min: 200, max: 1000 },
  { key: 'xlarge', label: '1,000 and over', min: 1000, max: Infinity },
];

function trackAddDays(date, n) {
  return new Date(Date.parse(date + 'T00:00:00Z') + n * TRACK_DAY_MS).toISOString().slice(0, 10);
}

function trackHour(iso) {
  return new Date(Date.parse(iso) + 3 * 3600000).getUTCHours();
}

function trackTimeKey(hour) {
  const h = hour < 5 ? hour + 24 : hour;
  const band = TRACK_TIMES.find((b) => h >= b.from && h < b.to);
  return band ? band.key : 'night';
}

function trackSizeKey(amount) {
  const band = TRACK_SIZES.find((b) => amount >= b.min && amount < b.max);
  return band ? band.key : 'xlarge';
}

function trackBump(map, key, amount) {
  const entry = map.get(key) || { total: 0, count: 0 };
  entry.total += amount;
  entry.count += 1;
  map.set(key, entry);
}

// Rounded up to the next 50, so a 1,212 average becomes a 1,250 limit.
export function suggestLimit(monthlyAverage) {
  const n = Number(monthlyAverage) || 0;
  if (n <= 0) return 0;
  return Math.ceil(n / TRACK_LIMIT_STEP) * TRACK_LIMIT_STEP;
}

// Days counted so far: 0 before the start, the full length once the end is reached.
export function trackingElapsed(start, end, today) {
  if (today < start) return 0;
  if (today >= end) return daysBetween(start, end);
  return daysBetween(start, today) + 1;
}

export function computeTracking({ transactions, categories, rules, settings, nowIso }) {
  const start = String(settings.tracking_start);
  const end = String(settings.tracking_end);
  const today = riyadhDate(nowIso);
  const daysTotal = daysBetween(start, end);
  const elapsed = trackingElapsed(start, end, today);

  const cats = categories || [];
  const catByName = new Map(cats.map((c) => [c.name, c]));
  const isOwn = (name) => (catByName.get(name) || {}).kind === OWN_ACCOUNT_KIND;

  let spent = 0;
  let refunds = 0;
  let income = 0;
  let count = 0;
  const byCategory = new Map();
  const merchantsByCategory = new Map();
  const byMerchant = new Map();
  const byWeek = new Map();
  const byWeekday = new Map();
  const byTime = new Map();
  const bySize = new Map();
  const spendByMerchant = new Map();

  for (const t of transactions || []) {
    if (t.status === 'ignored') continue;
    const date = riyadhDate(t.txn_at || t.received_at);
    if (date < start || date >= end) continue;
    const category = t.category ? String(t.category) : TRACK_UNCATEGORIZED;
    if (isOwn(category)) continue;
    const amt = spendAmount(t);

    if (t.type === 'refund') {
      refunds += amt;
      const c = byCategory.get(category) || { spent: 0, count: 0 };
      c.spent -= amt;
      byCategory.set(category, c);
      continue;
    }
    if (t.direction === 'in') {
      income += amt;
      continue;
    }
    if (t.direction !== 'out') continue;

    spent += amt;
    count += 1;
    const c = byCategory.get(category) || { spent: 0, count: 0 };
    c.spent += amt;
    c.count += 1;
    byCategory.set(category, c);

    const perCat = merchantsByCategory.get(category) || new Map();
    trackBump(perCat, t.merchant, amt);
    merchantsByCategory.set(category, perCat);
    trackBump(byMerchant, t.merchant, amt);
    spendByMerchant.set(t.merchant, (spendByMerchant.get(t.merchant) || 0) + amt);

    const week = Math.floor(daysBetween(start, date) / 7);
    const w = byWeek.get(week) || { total: 0, categories: new Map() };
    w.total += amt;
    w.categories.set(category, (w.categories.get(category) || 0) + amt);
    byWeek.set(week, w);

    trackBump(byWeekday, new Date(date + 'T00:00:00Z').getUTCDay(), amt);
    trackBump(byTime, trackTimeKey(trackHour(t.txn_at || t.received_at)), amt);
    trackBump(bySize, trackSizeKey(amt), amt);
  }

  const net = spent - refunds;
  const perDay = (n) => (elapsed > 0 ? round2(n / elapsed) : 0);
  const perMonth = (n) => (elapsed > 0 ? round2((n / elapsed) * TRACK_DAYS_PER_MONTH) : 0);
  const merchantRow = ([merchant, m]) => ({
    merchant, display_name: displayNameFor(rules || [], merchant), total: round2(m.total), count: m.count,
  });
  const byTotal = (a, b) => (b[1].total - a[1].total) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

  const categoryRows = [...byCategory.entries()]
    .filter(([, c]) => round2(c.spent) !== 0)
    .map(([name, c]) => {
      const cat = catByName.get(name) || {};
      return {
        name,
        emoji: cat.emoji || '',
        kind: cat.kind || '',
        spent: round2(c.spent),
        share: net > 0 ? round2(c.spent / net) : 0,
        count: c.count,
        daily_avg: perDay(c.spent),
        weekly_avg: perDay(c.spent * 7),
        monthly_avg: perMonth(c.spent),
        merchants: [...(merchantsByCategory.get(name) || new Map()).entries()].sort(byTotal).map(merchantRow),
      };
    })
    .sort((a, b) => b.spent - a.spent || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const weekCount = Math.ceil(daysTotal / 7);
  const weeks = [];
  for (let i = 0; i < weekCount; i++) {
    const wStart = trackAddDays(start, i * 7);
    if (wStart > today) break;
    const wEndRaw = trackAddDays(start, i * 7 + 7);
    const wEnd = wEndRaw < end ? wEndRaw : end;
    const w = byWeek.get(i) || { total: 0, categories: new Map() };
    const catTotals = {};
    for (const [name, amt] of w.categories) catTotals[name] = round2(amt);
    weeks.push({
      start: wStart,
      end: wEnd,
      days: daysBetween(wStart, wEnd),
      days_counted: Math.min(daysBetween(wStart, wEnd), Math.max(0, daysBetween(wStart, today) + 1)),
      total: round2(w.total),
      categories: catTotals,
    });
  }

  const recurring = detectRecurring(transactions, rules, cycleLabel(nowIso, settings.cycle_start_day))
    .filter((r) => spendByMerchant.has(r.merchant));
  const fixed = recurring.reduce((sum, r) => sum + (spendByMerchant.get(r.merchant) || 0), 0);

  const needsWants = { need: 0, want: 0, other: 0 };
  for (const [name, c] of byCategory) {
    const kind = (catByName.get(name) || {}).kind;
    needsWants[kind === 'need' || kind === 'want' ? kind : 'other'] += c.spent;
  }

  const suggestions = cats
    .filter((c) => c.kind !== OWN_ACCOUNT_KIND && (c.active === true || byCategory.has(c.name)))
    .map((c) => {
      const row = categoryRows.find((r) => r.name === c.name);
      const monthly = row ? row.monthly_avg : 0;
      return {
        name: c.name,
        emoji: c.emoji || '',
        monthly_avg: monthly,
        suggested: suggestLimit(monthly),
        current_budget: Number(c.monthly_budget) || 0,
      };
    })
    .sort((a, b) => b.monthly_avg - a.monthly_avg || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return {
    start,
    end,
    days_total: daysTotal,
    days_elapsed: elapsed,
    days_left: Math.max(0, daysTotal - elapsed),
    done: today >= end,
    totals: {
      spent: round2(spent),
      refunds: round2(refunds),
      net_spent: round2(net),
      income: round2(income),
      left_over: round2(income - net),
      daily_avg: perDay(net),
      weekly_avg: perDay(net * 7),
      monthly_avg: perMonth(net),
      count,
      uncategorized: round2((byCategory.get(TRACK_UNCATEGORIZED) || { spent: 0 }).spent),
    },
    categories: categoryRows,
    top_merchants: [...byMerchant.entries()].sort(byTotal).slice(0, 10).map(merchantRow),
    weeks,
    patterns: {
      weekdays: TRACK_WEEKDAYS.map((label, day) => {
        const e = byWeekday.get(day) || { total: 0, count: 0 };
        return { day, label, total: round2(e.total), count: e.count };
      }),
      times: TRACK_TIMES.map((b) => {
        const e = byTime.get(b.key) || { total: 0, count: 0 };
        return { key: b.key, label: b.label, total: round2(e.total), count: e.count };
      }),
      sizes: TRACK_SIZES.map((b) => {
        const e = bySize.get(b.key) || { total: 0, count: 0 };
        return { key: b.key, label: b.label, total: round2(e.total), count: e.count };
      }),
      recurring: {
        fixed: round2(fixed),
        one_off: round2(spent - fixed),
        merchants: recurring.map((r) => ({ ...r, total: round2(spendByMerchant.get(r.merchant) || 0) })),
      },
    },
    needs_wants: { need: round2(needsWants.need), want: round2(needsWants.want), other: round2(needsWants.other) },
    suggestions,
  };
}
