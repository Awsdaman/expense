import { round2, formatMoney } from './format.js';
import { riyadhDate } from './cycle.js';

// tracking: the tracking block while tracking mode is on (no savings target then), else null.
export function monthlyReport(summary, previous, tracking) {
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
    tracking ? `Saved: ${money(saved)}` : `Saved: ${money(saved)} (target ${money(savings.target)})`,
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

export function weeklyNudge(summary, tracking) {
  const { cycle, totals, savings, days_left: daysLeft, currency } = summary;
  const money = (n) => formatMoney(n, currency);
  if (tracking) return trackingNudge(tracking, currency);
  const text = [
    `Spent so far: ${money(totals.net_spent)}`,
    `Safe to spend: ${money(savings.safe_to_spend)}`,
    `Per day: ${money(savings.per_day)}`,
    `Days left: ${daysLeft}`,
  ].join('\n');
  return { subject: `Iqtifaa: cycle ${cycle} pace`, text };
}

function reportShareLine(c, money) {
  return `- ${c.name === 'Uncategorized' ? 'Not categorized yet' : c.name}: ${money(c.spent)} (${Math.round(c.share * 100)}%)`;
}

// Weekly email while tracking: where the money went so far, no budgets or pace.
export function trackingNudge(tracking, currency) {
  const money = (n) => formatMoney(n, currency);
  const { totals, categories, days_elapsed: elapsed, days_total: total } = tracking;
  const lines = [
    `Day ${elapsed} of ${total}`,
    `Spent so far: ${money(totals.net_spent)}`,
    `Daily average: ${money(totals.daily_avg)}`,
    `Income: ${money(totals.income)}`,
    '',
    'Where it went:',
    ...categories.filter((c) => c.spent > 0).slice(0, 5).map((c) => reportShareLine(c, money)),
  ];
  return { subject: 'Iqtifaa: where your money went this week', text: lines.join('\n') };
}

// Sent on the day the tracking period ends.
export function trackingDoneEmail(tracking, currency) {
  const money = (n) => formatMoney(n, currency);
  const lines = [
    `Your tracking period (${tracking.start} to ${tracking.end}) is over.`,
    `Spent: ${money(tracking.totals.net_spent)}, about ${money(tracking.totals.monthly_avg)} a month.`,
    '',
    'Suggested monthly limits:',
    ...tracking.suggestions.filter((s) => s.suggested > 0).map((s) => `- ${s.name}: ${money(s.suggested)} (average ${money(s.monthly_avg)})`),
    '',
    'Open the dashboard to change them and turn budgets on.',
  ];
  return { subject: 'Iqtifaa: your 2 months of tracking are done', text: lines.join('\n') };
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
