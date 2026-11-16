// Tracking mode pieces shared by Home, Insights and Settings: the category detail sheet,
// the suggested limits review, and the label for a category name.
import { apiGet, apiPost, errorMessage } from './api.js';
import { cycleTitle, money, parseNumber, shortDate } from './format.js';
import { button, h, listRow, moneyNode, numberInput, openSheet, sectionTitle, skeleton, toast } from './ui.js';

export function categoryLabel(name) {
  return name === 'Uncategorized' ? 'Not categorized yet' : name;
}

export function periodTitle(t) {
  return cycleTitle(t.start, t.end);
}

// Thin bar for a share from 0 to 1.
export function shareBar(fraction) {
  const width = Math.min(Math.max(Number(fraction) || 0, 0), 1) * 100;
  return h('div', { class: 'share' }, h('span', { class: 'share-fill', style: { width: `${width}%` } }));
}

// Bottom sheet for one category: totals, averages, merchants, then each purchase in the period.
export function openCategorySheet(cat, tracking, currency) {
  const purchases = h('div', null, skeleton(3));
  const merchants = cat.merchants || [];
  const top = Math.max(...merchants.map((m) => m.total), 0);
  const body = h('div', { class: 'stack tsheet' },
    h('div', { class: 'tsheet-figs' },
      h('p', { class: 'tsheet-total' }, moneyNode(cat.spent, { currency })),
      h('p', { class: 'quiet' },
        `${Math.round(cat.share * 100)}% of your spending · ${cat.count} ${cat.count === 1 ? 'purchase' : 'purchases'}`)),
    h('div', { class: 'avg-grid' },
      avgCell('A day', cat.daily_avg),
      avgCell('A week', cat.weekly_avg),
      avgCell('A month', cat.monthly_avg)),
    merchants.length
      ? h('section', null,
        sectionTitle('Where'),
        h('div', { class: 'card flush' }, merchants.map((m) => h('div', { class: 'meter' },
          h('span', { class: 'meter-name', dir: 'auto' }, m.display_name || m.merchant),
          h('div', { class: 'meter-track' }, h('span', { class: 'meter-fill', style: { width: `${top > 0 ? (m.total / top) * 100 : 0}%` } })),
          h('span', { class: 'meter-end' },
            h('span', { class: 'meter-fig mono' }, money(m.total), h('span', { class: 'money-unit' }, currency)),
            h('span', { class: 'meter-sub mono' }, `${m.count}×`))))))
      : null,
    h('section', null, sectionTitle('Purchases'), purchases));

  openSheet(body, { title: categoryLabel(cat.name) });

  apiGet('transactions', { category: cat.name, from: tracking.start, to: tracking.end })
    .then((data) => {
      const rows = (data.transactions || []).filter((t) => t.status !== 'ignored' && t.direction === 'out');
      purchases.replaceChildren(rows.length
        ? h('div', { class: 'card flush' }, h('div', { class: 'list' }, rows.map((t) => listRow({
          title: t.display_name || t.merchant || t.merchant_raw,
          sub: [shortDate(t.txn_at), t.note].filter(Boolean).join(' · '),
          end: moneyNode(t.amount_sar !== '' && t.amount_sar !== null ? t.amount_sar : t.amount, { currency }),
        }))))
        : h('p', { class: 'quiet' }, 'No purchases found'));
    })
    .catch((err) => purchases.replaceChildren(h('p', { class: 'quiet' }, errorMessage(err))));
}

function avgCell(label, value) {
  return h('div', { class: 'avg' },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'avg-fig mono' }, `~${money(Math.round(value))}`));
}

// Review the suggested limits (monthly average rounded up to 50), change any, then save them
// as budgets and turn budget mode on. onDone runs after a successful save.
export function openLimitsSheet(tracking, currency, onDone) {
  const rows = (tracking.suggestions || []).map((s) => ({ ...s, text: String(s.suggested) }));
  const status = h('p', { class: 'status', role: 'status' });
  const save = button({ label: 'Save limits and turn on budgets', variant: 'primary', block: true, onClick: submit });
  const keep = button({ label: 'Keep tracking for now', variant: 'quiet', block: true, onClick: () => sheet.close() });

  const list = h('div', { class: 'card flush' }, rows.map((r) => {
    const input = numberInput({
      value: r.text,
      'aria-label': `Limit for ${r.name}`,
      onInput: (e) => {
        r.text = e.target.value;
        check();
      },
    });
    return h('div', { class: 'limit' },
      h('div', { class: 'limit-main' },
        h('span', { class: 'limit-name', dir: 'auto' }, r.name),
        h('span', { class: 'quiet' }, r.monthly_avg > 0 ? `You spent ~${money(Math.round(r.monthly_avg))} a month` : 'Nothing spent')),
      h('div', { class: 'limit-input' }, input, h('span', { class: 'money-unit' }, currency)));
  }));

  function values() {
    const budgets = {};
    for (const r of rows) {
      const n = parseNumber(r.text);
      if (!(Number.isFinite(n) && n >= 0)) return null;
      budgets[r.name] = n;
    }
    return budgets;
  }

  function check() {
    const ok = values() !== null;
    save.disabled = !ok;
    status.textContent = ok ? '' : 'Enter 0 or more for every category';
    status.dataset.state = ok ? '' : 'error';
  }

  async function submit() {
    const budgets = values();
    if (!budgets) return;
    save.disabled = true;
    save.textContent = 'Saving';
    try {
      await apiPost('settings', { budgets, mode: 'budget' });
      sheet.close();
      toast('Limits saved. Budgets are on.');
      onDone?.();
    } catch (err) {
      save.disabled = false;
      save.textContent = 'Save limits and turn on budgets';
      status.textContent = errorMessage(err);
      status.dataset.state = 'error';
    }
  }

  const sheet = openSheet(h('div', { class: 'stack' },
    h('p', { class: 'quiet' },
      `Each limit is what you spent per month from ${periodTitle(tracking)}, rounded up to the next 50. Change any number.`),
    list,
    h('div', { class: 'section-body' }, status, save, keep)), { title: 'Set your monthly limits' });
}
