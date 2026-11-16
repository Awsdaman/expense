import { activeCategories, OWN_ACCOUNT_KIND } from './settings.js';
import { round2 } from './format.js';
import { riyadhDate, cycleBounds, shiftCycle, daysBetween, daysLeft } from './cycle.js';
import { displayNameFor } from './rules.js';

function summaryAddTo(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

function summaryAddDays(date, n) {
  return new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

function summaryMedian(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ownNames: categories for transfers to your own accounts, left out of every total.
function summaryAggregate(transactions, label, ownNames) {
  const agg = { spent: 0, refunds: 0, income: 0, count: 0, byCategory: new Map(), byMerchant: new Map(), byDate: new Map() };
  for (const t of transactions || []) {
    if (t.cycle !== label || t.status === 'ignored') continue;
    if (ownNames && ownNames.has(t.category)) continue;
    const amt = spendAmount(t);
    if (t.type === 'refund') {
      agg.refunds += amt;
      summaryAddTo(agg.byCategory, t.category || '', -amt);
    } else if (t.direction === 'out') {
      agg.spent += amt;
      agg.count += 1;
      summaryAddTo(agg.byCategory, t.category || '', amt);
      const m = agg.byMerchant.get(t.merchant) || { total: 0, count: 0 };
      m.total += amt;
      m.count += 1;
      agg.byMerchant.set(t.merchant, m);
      summaryAddTo(agg.byDate, riyadhDate(t.txn_at || t.received_at), amt);
    } else if (t.direction === 'in') {
      agg.income += amt;
    }
  }
  return agg;
}

export function spendAmount(txn) {
  const sar = txn.amount_sar;
  if (sar !== '' && sar !== null && sar !== undefined && Number.isFinite(Number(sar))) return Number(sar);
  if (txn.currency === 'SAR') return Number(txn.amount) || 0;
  return 0;
}

export function budgetStatus(spent, budget, threshold) {
  const b = Number(budget) || 0;
  if (b <= 0) return { pct: null, state: 'ok' };
  const pct = round2(Number(spent) / b);
  return { pct, state: pct >= 1 ? 'over' : pct >= Number(threshold) ? 'warn' : 'ok' };
}

export function computeSummary({ transactions, categories, rules, settings, cycle, nowIso, parseErrors }) {
  const startDay = Number(settings.cycle_start_day);
  const threshold = Number(settings.alert_threshold);
  const target = Number(settings.savings_target);
  const { start, end } = cycleBounds(cycle, startDay);
  const ownNames = new Set((categories || []).filter((c) => c.kind === OWN_ACCOUNT_KIND).map((c) => c.name));
  const agg = summaryAggregate(transactions, cycle, ownNames);
  const net = agg.spent - agg.refunds;
  const left = daysLeft(nowIso, cycle, startDay);
  const safe = round2(agg.income - target - net);

  const kindByName = new Map((categories || []).map((c) => [c.name, c.kind]));
  const activeNames = new Set(activeCategories(categories).map((c) => c.name));
  const spentOf = (name) => round2(agg.byCategory.get(name) || 0);
  const categoryRows = activeCategories((categories || []).map((c) => ({ ...c, active: true })))
    .filter((c) => c.kind !== OWN_ACCOUNT_KIND)
    .filter((c) => activeNames.has(c.name) || spentOf(c.name) !== 0)
    .map((c) => {
      const spent = spentOf(c.name);
      const status = budgetStatus(spent, c.monthly_budget, threshold);
      return { name: c.name, emoji: c.emoji, kind: c.kind, budget: c.monthly_budget, spent, pct: status.pct, state: status.state };
    });

  const needsWants = { need: 0, want: 0, other: 0 };
  for (const [name, amt] of agg.byCategory) {
    const kind = kindByName.get(name);
    needsWants[kind === 'need' || kind === 'want' ? kind : 'other'] += amt;
  }

  const topMerchants = [...agg.byMerchant.entries()]
    .sort((a, b) => (b[1].total - a[1].total) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, 10)
    .map(([merchant, m]) => ({ merchant, display_name: displayNameFor(rules || [], merchant), total: round2(m.total), count: m.count }));

  const today = riyadhDate(nowIso);
  const lastDay = summaryAddDays(end, -1);
  const last = today < lastDay ? today : lastDay;
  const daily = [];
  for (let d = start; d <= last; d = summaryAddDays(d, 1)) {
    daily.push({ date: d, spent: round2(agg.byDate.get(d) || 0) });
  }

  const activeList = activeCategories(categories);
  const history = [3, 2, 1].map((back) => {
    const label = shiftCycle(cycle, -back);
    const past = summaryAggregate(transactions, label, ownNames);
    const catSpend = {};
    for (const c of activeList) catSpend[c.name] = round2(past.byCategory.get(c.name) || 0);
    return { cycle: label, total: round2(past.spent - past.refunds), categories: catSpend };
  });

  return {
    cycle,
    start,
    end,
    days_total: daysBetween(start, end),
    days_left: left,
    currency: settings.currency || 'SAR',
    totals: {
      spent: round2(agg.spent),
      refunds: round2(agg.refunds),
      net_spent: round2(net),
      income: round2(agg.income),
      uncategorized: round2(spentOf('') + spentOf('Uncategorized')),
      count: agg.count,
    },
    savings: { target, safe_to_spend: safe, per_day: left > 0 ? round2(Math.max(0, safe) / left) : 0 },
    categories: categoryRows,
    top_merchants: topMerchants,
    daily,
    needs_wants: { need: round2(needsWants.need), want: round2(needsWants.want), other: round2(needsWants.other) },
    history,
    recurring: detectRecurring(transactions, rules, cycle),
    pending_count: (transactions || []).filter((t) => t.status === 'pending').length,
    parse_error_count: (parseErrors || []).filter((e) => e.status === 'open').length,
  };
}

export function detectRecurring(transactions, rules, cycle) {
  const windowLabels = [0, 1, 2, 3].map((back) => shiftCycle(cycle, -back));
  const groups = new Map();
  for (const t of transactions || []) {
    if (t.status === 'ignored' || t.type === 'refund' || t.direction !== 'out') continue;
    if (!windowLabels.includes(t.cycle)) continue;
    const list = groups.get(t.merchant) || [];
    list.push({ cycle: t.cycle, amount: spendAmount(t) });
    groups.set(t.merchant, list);
  }
  const rows = [];
  for (const [merchant, charges] of groups) {
    const cycles = [...new Set(charges.map((c) => c.cycle))].sort();
    if (cycles.length < 2) continue;
    const median = summaryMedian(charges.map((c) => c.amount));
    if (!charges.every((c) => Math.abs(c.amount - median) <= 0.1 * median)) continue;
    rows.push({ merchant, display_name: displayNameFor(rules || [], merchant), amount: round2(median), cycles });
  }
  return rows.sort((a, b) => (b.amount - a.amount) || (a.merchant < b.merchant ? -1 : a.merchant > b.merchant ? 1 : 0));
}
