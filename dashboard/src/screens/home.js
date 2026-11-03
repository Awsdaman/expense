// Home: safe to spend with the cycle strip, two compact stats, category budgets, review line.
import { errorMessage, loadScreen } from '../api.js';
import { cycleTitle, money, ordinal } from '../format.js';
import { budgetBar, cycleStrip, emptyState, errorState, h, offlineLine, pageHead, sectionTitle, skeleton, stat } from '../ui.js';

export async function render(root) {
  root.replaceChildren(skeleton(5));
  try {
    await loadScreen(root, [['summary']], ([summary]) => root.replaceChildren(home(summary)));
  } catch (err) {
    root.replaceChildren(errorState({ message: errorMessage(err), onRetry: () => render(root) }));
  }
}

function home(s) {
  const { currency, start, end, days_total, days_left, savings, totals, categories, stale, cachedAt } = s;
  const safe = savings.safe_to_spend;
  const over = safe < 0;
  const review = (s.pending_count || 0) + (s.parse_error_count || 0);
  const shown = categories.filter((c) => c.budget > 0 || c.spent > 0);
  const day = ordinal(Number(end.slice(8, 10)));

  const figure = over
    ? h('p', { class: 'figure is-over' },
      h('span', { class: 'figure-prefix' }, 'Over by '),
      h('span', { class: 'figure-num mono' }, money(-safe)),
      h('span', { class: 'figure-unit' }, ` ${currency}`))
    : h('p', { class: 'figure' },
      h('span', { class: 'figure-num mono' }, money(safe)),
      h('span', { class: 'figure-unit' }, currency));

  return h('div', { class: 'stack' },
    pageHead(`Cycle ${cycleTitle(start, end)}`),
    stale ? offlineLine(cachedAt) : null,
    h('section', { class: 'hero' },
      h('p', { class: 'hero-label' }, 'Safe to spend'),
      figure,
      !over && savings.per_day > 0
        ? h('p', { class: 'hero-sub' }, '~', h('span', { class: 'mono' }, money(Math.round(savings.per_day))), ` ${currency} a day until the ${day}`)
        : null,
      cycleStrip({ days_total, days_left, end })),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Spent', value: money(totals.net_spent), unit: currency }),
      stat({ label: 'Income', value: money(totals.income), unit: currency })),
    h('section', null,
      sectionTitle('Categories'),
      shown.length
        ? h('div', { class: 'card cats' }, shown.map((c) => categoryRow(c, currency)))
        : emptyState({ title: 'No budgets or spending yet' })),
    review > 0
      ? h('p', { class: 'review' },
        h('a', { class: 'quiet-link', href: '#/inbox' }, h('span', { class: 'mono' }, String(review)), ' to review'))
      : null);
}

function categoryRow(c, currency) {
  const hasBudget = c.budget > 0;
  const figures = hasBudget
    ? `${money(c.spent)} of ${money(c.budget)} ${currency}`
    : `${money(c.spent)} ${currency} spent, no budget`;
  return h('div', { class: 'cat' },
    h('div', { class: 'cat-head' },
      h('span', { class: 'state-dot', dataset: { state: c.state } }),
      h('span', { class: 'cat-name', dir: 'auto' }, c.name),
      hasBudget ? h('span', { class: 'cat-pct' }, `${Math.round(c.pct * 100)}%`) : null),
    hasBudget ? budgetBar({ pct: c.pct, state: c.state }) : null,
    h('p', { class: 'cat-fig' }, figures));
}
