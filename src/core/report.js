import { round2, formatMoney } from './format.js';
import { riyadhDate } from './cycle.js';

export function monthlyReport(summary, previous) {
  const { cycle, totals, savings, categories, currency } = summary;
  const money = (n) => formatMoney(n, currency);
  const saved = round2(totals.income - totals.net_spent);
  const topThree = categories
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 3);
  const lines = [
    `Spent (after refunds): ${money(totals.net_spent)}`,
    `Income: ${money(totals.income)}`,
    `Saved: ${money(saved)} (target ${money(savings.target)})`,
    '',
    'Top categories:',
    ...topThree.map((c) => `- ${c.name}: ${money(c.spent)}`),
  ];
  if (previous) {
    const before = new Map((previous.categories || []).map((c) => [c.name, Number(c.spent) || 0]));
    let best = null;
    for (const c of categories) {
      const delta = round2(c.spent - (before.get(c.name) || 0));
      if (delta > 0 && (!best || delta > best.delta)) best = { name: c.name, delta };
    }
    if (best) lines.push('', `Biggest increase vs previous cycle: ${best.name} (+${money(best.delta)})`);
  }
  return { subject: `Iqtifaa: cycle ${cycle} summary`, text: lines.join('\n') };
}

export function weeklyNudge(summary) {
  const { cycle, totals, savings, days_left: daysLeft, currency } = summary;
  const money = (n) => formatMoney(n, currency);
  const text = [
    `Spent so far: ${money(totals.net_spent)}`,
    `Safe to spend: ${money(savings.safe_to_spend)}`,
    `Per day: ${money(savings.per_day)}`,
    `Days left: ${daysLeft}`,
  ].join('\n');
  return { subject: `Iqtifaa: cycle ${cycle} pace`, text };
}

export function healthWarning(transactions, nowIso) {
  const DAY_MS = 86400000;
  const times = (transactions || []).map((t) => Date.parse(t.received_at)).filter(Number.isFinite);
  if (times.length === 0) return null;
  const newest = times.reduce((a, b) => Math.max(a, b), -Infinity);
  const gapDays = (Date.parse(nowIso) - newest) / DAY_MS;
  if (!(gapDays > 5)) return null;
  const earlier = times.filter((t) => t < newest && t >= newest - 30 * DAY_MS).length;
  if (earlier < 10) return null;
  const last = riyadhDate(new Date(newest).toISOString());
  return `No new expense SMS for ${Math.floor(gapDays)} days (last one on ${last}). Check that the Shortcut still forwards SMS.`;
}
