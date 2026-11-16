// Insights. Tracking mode: week by week, days and times, purchase sizes, recurring vs one-off, top merchants,
// needs and wants over the tracking period. Budget mode: this cycle against the last 3 cycles and the same lists.
import { errorMessage, loadScreen } from '../api.js';
import { cycleTitle, money, shortDate } from '../format.js';
import { categoryLabel, periodTitle } from '../tracking.js';
import { card, cycleStrip, errorState, h, listRow, moneyNode, offlineLine, pageHead, sectionTitle, skeleton } from '../ui.js';

const MINUS = '−';

export async function render(root) {
  root.replaceChildren(skeleton(6));
  try {
    await loadScreen(root, [['summary']], ([summary]) => root.replaceChildren(
      summary.mode === 'tracking' && summary.tracking ? trackingInsights(summary) : insights(summary)));
  } catch (err) {
    root.replaceChildren(errorState({ message: errorMessage(err), onRetry: () => render(root) }));
  }
}

function insights(s) {
  const { currency, start, end, days_total, days_left, categories = [], history = [], top_merchants = [], needs_wants, recurring = [], stale, cachedAt } = s;
  return h('div', { class: 'stack' },
    pageHead(`Cycle ${cycleTitle(start, end)}`),
    stale ? offlineLine(cachedAt) : null,
    cycleStrip({ days_total, days_left, end }),
    h('section', null,
      sectionTitle('This cycle vs your average'),
      comparison(categories, history, currency, days_total ? (days_total - days_left) / days_total : 1)),
    h('section', null,
      sectionTitle('Top merchants'),
      merchants(top_merchants.slice(0, 10), currency)),
    h('section', null,
      sectionTitle('Needs and wants'),
      split(needs_wants || {}, currency)),
    h('section', null,
      sectionTitle('Recurring charges'),
      recurringList(recurring, currency)));
}

function trackingInsights(s) {
  const { currency, stale, cachedAt } = s;
  const t = s.tracking;
  const p = t.patterns;
  const empty = t.totals.count === 0;
  return h('div', { class: 'stack' },
    pageHead('Insights', `Tracking ${periodTitle(t)}`),
    stale ? offlineLine(cachedAt) : null,
    empty ? quietCard('Nothing spent in the tracking period yet. Patterns show up after a few purchases.') : null,
    h('section', null,
      sectionTitle('Week by week'),
      weekList(t.weeks, currency)),
    h('section', null,
      sectionTitle('Days of the week'),
      meterList(p.weekdays.map((d) => ({ name: d.label, total: d.total, sub: countText(d.count) })), currency)),
    h('section', null,
      sectionTitle('Time of day'),
      meterList(p.times.map((b) => ({ name: b.label, total: b.total, sub: countText(b.count) })), currency)),
    h('section', null,
      sectionTitle('Purchase sizes'),
      meterList(p.sizes.map((b) => ({ name: sizeLabel(b.key, currency), total: b.total, sub: countText(b.count) })), currency),
      h('p', { class: 'quiet cmp-caption' }, 'Many small purchases can add up to more than one big one')),
    h('section', null,
      sectionTitle('Recurring and one-off'),
      fixedSplit(p.recurring, currency)),
    h('section', null,
      sectionTitle('Top merchants'),
      merchants(t.top_merchants, currency)),
    h('section', null,
      sectionTitle('Needs and wants'),
      split(t.needs_wants || {}, currency)));
}

function sizeLabel(key, currency) {
  return ({
    small: `Under 50 ${currency}`,
    medium: `50 to 199 ${currency}`,
    large: `200 to 999 ${currency}`,
    xlarge: `1,000 ${currency} or more`,
  })[key] || key;
}

function countText(n) {
  return `${n} ${n === 1 ? 'purchase' : 'purchases'}`;
}

// Name, a bar scaled to the largest row, figure and a small line under it.
function meterList(rows, currency) {
  const top = Math.max(...rows.map((r) => Number(r.total) || 0), 0);
  if (top <= 0) return quietCard('Nothing yet');
  return h('div', { class: 'card flush' }, rows.map((r) => h('div', { class: 'meter' },
    h('span', { class: 'meter-name', dir: 'auto' }, r.name),
    h('div', { class: 'meter-track' }, h('span', { class: 'meter-fill', style: { width: `${(r.total / top) * 100}%` } })),
    h('span', { class: 'meter-end' },
      h('span', { class: 'meter-fig mono' }, money(r.total), h('span', { class: 'money-unit' }, currency)),
      r.sub ? h('span', { class: 'meter-sub mono' }, r.sub) : null))));
}

// One row per 7-day week: total, change from the week before and the category that took the most.
function weekList(weeks, currency) {
  if (!weeks.length) return quietCard('The first week has not started yet');
  const top = Math.max(...weeks.map((w) => w.total), 0);
  return h('div', { class: 'card flush' }, weeks.map((w, i) => {
    const last = new Date(Date.parse(`${w.end}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const partial = w.days_counted < w.days;
    const lead = Object.entries(w.categories).sort((a, b) => b[1] - a[1])[0];
    const prev = i > 0 ? weeks[i - 1].total : null;
    const delta = prev > 0 && !partial ? Math.round(((w.total - prev) / prev) * 100) : null;
    const bits = [];
    if (lead) bits.push(`mostly ${categoryLabel(lead[0])}`);
    if (partial) bits.push(`${w.days_counted} of ${w.days} days so far`);
    else if (delta !== null) bits.push(`${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)}% vs week before`);
    return h('div', { class: 'meter' },
      h('span', { class: 'meter-name' }, `${shortDate(w.start)} – ${shortDate(last)}`),
      h('div', { class: 'meter-track' }, h('span', { class: 'meter-fill', style: { width: `${top > 0 ? (w.total / top) * 100 : 0}%` } })),
      h('span', { class: 'meter-end' },
        h('span', { class: 'meter-fig mono' }, money(w.total), h('span', { class: 'money-unit' }, currency))),
      bits.length ? h('span', { class: 'meter-note', dir: 'auto' }, bits.join(' · ')) : null);
  }));
}

function fixedSplit(r, currency) {
  const total = r.fixed + r.one_off;
  if (total <= 0) return quietCard('Nothing spent yet');
  const parts = [['need', 'Recurring', r.fixed], ['other', 'One-off', r.one_off]];
  return h('div', { class: 'section-body' },
    card(
      h('div', { class: 'split-bar', role: 'img', 'aria-label': parts.map(([, l, v]) => `${l} ${money(v)} ${currency}`).join(', ') },
        parts.map(([kind, , v]) => h('span', { class: 'split-seg', dataset: { kind }, style: { width: `${(v / total) * 100}%` } }))),
      h('ul', { class: 'split-legend' }, parts.map(([kind, label, v]) => h('li', { class: 'split-item' },
        h('span', { class: 'swatch', dataset: { kind } }),
        h('span', { class: 'split-label' }, label),
        h('span', { class: 'split-fig mono' }, money(v), h('span', { class: 'money-unit' }, currency)),
        h('span', { class: 'split-pct mono' }, `${Math.round((v / total) * 100)}%`))))),
    r.merchants.length
      ? h('div', { class: 'card flush' }, h('div', { class: 'list' }, r.merchants.map((m) => listRow({
        title: m.display_name || m.merchant,
        sub: `about ${money(m.amount)} ${currency} each time`,
        end: moneyNode(m.total, { currency }),
      }))))
      : h('p', { class: 'quiet' }, 'Recurring charges show up once the same merchant charges a similar amount in two different months'));
}

function quietCard(text) {
  return card(h('p', { class: 'quiet' }, text));
}

// One row per category with spend now or in the history. Fill = this cycle, marker = average, both on one scale.
// A running cycle is compared with the average scaled to the share of the cycle gone so far,
// otherwise a week-old cycle always reads far below a full one.
function comparison(categories, history, currency, elapsed) {
  const past = history.filter((c) => Number(c.total) > 0);
  const share = Math.min(1, Math.max(0, elapsed));
  const avgOf = (name) => (past.length
    ? (past.reduce((sum, c) => sum + (Number(c.categories?.[name]) || 0), 0) / past.length) * share
    : 0);
  const spentOf = new Map(categories.map((c) => [c.name, Number(c.spent) || 0]));
  const names = new Set([...spentOf.keys()]);
  for (const c of history) for (const name of Object.keys(c.categories || {})) names.add(name);

  const rows = [...names]
    .map((name) => ({ name, spent: spentOf.get(name) || 0, avg: avgOf(name) }))
    .filter((r) => r.spent > 0 || r.avg > 0)
    .sort((a, b) => b.spent - a.spent || b.avg - a.avg || a.name.localeCompare(b.name));

  if (!rows.length) return quietCard('No spending in this cycle yet');

  const max = Math.max(...rows.flatMap((r) => [r.spent, r.avg]));
  return h('div', null,
    h('div', { class: 'card flush cmp-list' }, rows.map((r) => compareRow(r, max, currency))),
    h('p', { class: 'quiet cmp-caption' }, share < 1
      ? `Marker: what you usually spend by this day, from the last ${past.length} ${past.length === 1 ? 'cycle' : 'cycles'}`
      : `Marker: average of the last ${past.length} ${past.length === 1 ? 'cycle' : 'cycles'}`));
}

function compareRow(r, max, currency) {
  const fill = max > 0 ? (r.spent / max) * 100 : 0;
  const mark = max > 0 ? (r.avg / max) * 100 : 0;
  const delta = r.avg > 0 ? Math.round(((r.spent - r.avg) / r.avg) * 100) : null;
  const sign = delta > 0 ? '+' : delta < 0 ? MINUS : '';
  return h('div', { class: 'cmp' },
    h('span', { class: 'cmp-name', dir: 'auto' }, r.name),
    h('div', {
      class: 'cmp-track',
      role: 'img',
      'aria-label': `${money(r.spent)} this cycle, ${money(r.avg)} average`,
    },
    h('span', { class: 'cmp-fill', style: { width: `${fill}%` } }),
    r.avg > 0 ? h('span', { class: 'cmp-avg', style: { left: `${mark}%` } }) : null),
    h('span', { class: 'cmp-end' },
      h('span', { class: 'cmp-fig mono' }, money(r.spent), h('span', { class: 'money-unit' }, currency)),
      delta === null ? null : h('span', { class: 'cmp-delta mono' }, `${sign}${Math.abs(delta)}% vs avg`)));
}

// Ranked list, thin neutral bars scaled to the top merchant.
function merchants(rows, currency) {
  if (!rows.length) return quietCard('No merchants in this cycle yet');
  const top = Math.max(...rows.map((r) => Number(r.total) || 0), 0);
  return h('div', { class: 'card flush' }, rows.map((m, i) => {
    const total = Number(m.total) || 0;
    const count = Number(m.count) || 0;
    const width = top > 0 ? (total / top) * 100 : 0;
    return h('div', { class: 'rank' },
      h('span', { class: 'rank-no mono' }, String(i + 1)),
      h('span', { class: 'rank-name', dir: 'auto' }, m.display_name || m.merchant),
      h('div', { class: 'rank-track' }, h('span', { class: 'rank-fill', style: { width: `${width}%` } })),
      h('span', { class: 'rank-end' },
        h('span', { class: 'rank-fig mono' }, money(total), h('span', { class: 'money-unit' }, currency)),
        h('span', { class: 'rank-count mono' }, `${count} ${count === 1 ? 'transaction' : 'transactions'}`)));
  }));
}

// One stacked bar for the cycle's spend split, with a legend of figures and shares.
function split(nw, currency) {
  const values = [
    ['need', 'Needs', Number(nw.need) || 0],
    ['want', 'Wants', Number(nw.want) || 0],
    ['other', 'Other', Number(nw.other) || 0],
  ];
  const total = values.reduce((sum, [, , v]) => sum + v, 0);
  if (total <= 0) return quietCard('No spending in this cycle yet');
  const describe = values.map(([, label, v]) => `${label} ${money(v)} ${currency}`).join(', ');
  return card(
    h('div', { class: 'split-bar', role: 'img', 'aria-label': describe },
      values.map(([kind, , v]) => h('span', { class: 'split-seg', dataset: { kind }, style: { width: `${(v / total) * 100}%` } }))),
    h('ul', { class: 'split-legend' },
      values.map(([kind, label, v]) => h('li', { class: 'split-item' },
        h('span', { class: 'swatch', dataset: { kind } }),
        h('span', { class: 'split-label' }, label),
        h('span', { class: 'split-fig mono' }, money(v), h('span', { class: 'money-unit' }, currency)),
        h('span', { class: 'split-pct mono' }, `${Math.round((v / total) * 100)}%`)))));
}

function recurringList(rows, currency) {
  if (!rows.length) return quietCard('No recurring charges yet');
  return h('div', { class: 'card flush' },
    h('div', { class: 'list' }, rows.map((r) => {
      const cycles = Array.isArray(r.cycles) ? r.cycles.length : Number(r.cycles) || 0;
      return listRow({
        title: r.display_name || r.merchant,
        sub: `monthly · ${cycles} cycles`,
        end: moneyNode(r.amount, { currency }),
      });
    })));
}
