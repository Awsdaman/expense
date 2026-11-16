// Home. Tracking mode: spent so far, income and left over, the biggest category, and every category's
// share (tap for detail). Budget mode: safe to spend with the cycle strip, two stats, category budgets.
import { errorMessage, loadScreen } from '../api.js';
import { cycleTitle, money, ordinal } from '../format.js';
import { categoryLabel, openCategorySheet, openLimitsSheet, periodTitle, shareBar } from '../tracking.js';
import { budgetBar, button, card, cycleStrip, emptyState, errorState, h, offlineLine, pageHead, sectionTitle, skeleton, stat } from '../ui.js';

export async function render(root, ctx) {
  root.replaceChildren(skeleton(5));
  try {
    await loadScreen(root, [['summary']], ([summary]) => root.replaceChildren(
      summary.mode === 'tracking' && summary.tracking ? trackingHome(summary, ctx) : home(summary)));
  } catch (err) {
    root.replaceChildren(errorState({ message: errorMessage(err), onRetry: () => render(root, ctx) }));
  }
}

function reviewLine(s) {
  const review = (s.pending_count || 0) + (s.parse_error_count || 0);
  return review > 0
    ? h('p', { class: 'review' },
      h('a', { class: 'quiet-link', href: '#/inbox' }, h('span', { class: 'mono' }, String(review)), ' to review'))
    : null;
}

function trackingHome(s, ctx) {
  const { currency, stale, cachedAt } = s;
  const t = s.tracking;
  const { totals } = t;
  const cats = t.categories.filter((c) => c.spent > 0);
  const biggest = cats.find((c) => c.name !== 'Uncategorized');
  const leftOver = totals.left_over;
  const started = t.days_elapsed > 0;

  return h('div', { class: 'stack' },
    pageHead('Where your money goes', `Tracking ${periodTitle(t)}, no budgets`),
    stale ? offlineLine(cachedAt) : null,
    t.done
      ? card(h('div', { class: 'done' },
        h('p', { class: 'done-title' }, 'Your tracking period is done'),
        h('p', { class: 'quiet' }, 'See a monthly limit for each category, based on what you really spent.'),
        button({
          label: 'Review suggested limits',
          variant: 'primary',
          block: true,
          onClick: () => openLimitsSheet(t, currency, () => ctx.navigate('#/home')),
        })))
      : null,
    h('section', { class: 'hero' },
      h('p', { class: 'hero-label' }, t.done ? 'Spent while tracking' : 'Spent so far'),
      h('p', { class: 'figure' },
        h('span', { class: 'figure-num mono' }, money(totals.net_spent)),
        h('span', { class: 'figure-unit' }, currency)),
      started
        ? h('p', { class: 'hero-sub' }, '~', h('span', { class: 'mono' }, money(Math.round(totals.daily_avg))), ` ${currency} a day on average`)
        : h('p', { class: 'hero-sub' }, `Tracking starts on ${periodTitle(t).split(' – ')[0]}`),
      cycleStrip({
        days_total: t.days_total,
        days_left: t.days_left,
        end: t.end,
        label: t.done ? 'Tracking finished' : `Day ${t.days_elapsed} of ${t.days_total}`,
      })),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Income', value: money(totals.income), unit: currency }),
      stat({ label: 'Left over', value: money(leftOver), unit: currency, state: leftOver < 0 ? 'over' : undefined })),
    biggest
      ? h('p', { class: 'lead' },
        'Most of it went to ', h('strong', { dir: 'auto' }, biggest.name), ': ',
        h('span', { class: 'mono' }, `${Math.round(biggest.share * 100)}%`))
      : null,
    h('section', null,
      sectionTitle('Categories'),
      cats.length
        ? h('div', null,
          h('div', { class: 'card flush' }, cats.map((c) => trackingRow(c, t, currency))),
          h('p', { class: 'quiet cmp-caption' }, 'Tap a category to see where it went'))
        : emptyState({ title: 'No spending yet', text: 'Purchases from your bank SMS show up here.' })),
    reviewLine(s));
}

function trackingRow(c, t, currency) {
  return h('button', { class: 'tcat', type: 'button', onClick: () => openCategorySheet(c, t, currency) },
    h('span', { class: 'tcat-head' },
      h('span', { class: 'cat-name', dir: 'auto' }, categoryLabel(c.name)),
      h('span', { class: 'cat-pct' }, `${Math.round(c.share * 100)}%`)),
    shareBar(c.share),
    h('span', { class: 'cat-fig' },
      `${money(c.spent)} ${currency} · ~${money(Math.round(c.weekly_avg))} a week`));
}

function home(s) {
  const { currency, start, end, days_total, days_left, savings, totals, categories, stale, cachedAt } = s;
  const safe = savings.safe_to_spend;
  const over = safe < 0;
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
    reviewLine(s));
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
