// Activity: every transaction in one cycle (or all cycles while searching), grouped by day, with an edit sheet.
import { apiGet, apiPost, errorMessage } from '../api.js';
import { cycleTitle, parseNumber, shortDate, time } from '../format.js';
import { button, emptyState, errorState, field, h, icon, moneyNode, numberInput, offlineLine, openSheet, pageHead, selectInput, skeleton, textInput, toast } from '../ui.js';

const SEARCH_DEBOUNCE = 250;

export async function render(root, ctx) {
  root.replaceChildren(skeleton(5));
  let summary;
  let config;
  try {
    [summary, config] = await Promise.all([apiGet('summary'), apiGet('config')]);
  } catch (err) {
    root.replaceChildren(errorState({ message: errorMessage(err), onRetry: () => render(root, ctx) }));
    return;
  }

  const currency = summary.currency || 'SAR';
  const categories = config.categories.filter((c) => c.active).sort((a, b) => a.sort - b.sort).map((c) => c.name);
  const state = {
    cycle: summary.cycle,
    current: summary.cycle,
    start: summary.start,
    end: summary.end,
    q: '',
    stale: false,
    cachedAt: null,
    seq: 0,
  };
  let timer = null;

  const glass = icon('search');
  glass.classList.add('search-icon');
  const search = h('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Search merchant, category or note',
    'aria-label': 'Search activity',
    autocomplete: 'off',
  });
  const title = h('p', { class: 'cycle-title' });
  const prev = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous cycle', onClick: () => step(-1) }, flipped('chevron-right'));
  const next = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next cycle', onClick: () => step(1) }, icon('chevron-right'));
  const list = h('div', { class: 'days' });

  root.replaceChildren(h('div', { class: 'stack' },
    pageHead('Activity'),
    h('div', { class: 'tools' },
      h('div', { class: 'search' }, glass, search),
      h('div', { class: 'cycle-nav' }, prev, title, next)),
    list));
  paintNav();
  await loadList();

  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = search.value.trim();
      if (q === state.q) return;
      state.q = q;
      paintNav();
      loadList();
    }, SEARCH_DEBOUNCE);
  });

  function paintNav() {
    const searching = state.q !== '';
    title.textContent = searching ? 'All cycles' : cycleTitle(state.start, state.end);
    prev.disabled = searching;
    next.disabled = searching || state.cycle >= state.current;
  }

  async function step(delta) {
    const target = shiftCycle(state.cycle, delta);
    try {
      const s = await apiGet('summary', { cycle: target });
      state.cycle = target;
      state.start = s.start;
      state.end = s.end;
    } catch (err) {
      toast(errorMessage(err));
      return;
    }
    paintNav();
    await loadList();
  }

  async function loadList() {
    const seq = ++state.seq;
    const params = state.q ? { q: state.q } : { cycle: state.cycle };
    let data;
    try {
      data = await apiGet('transactions', params);
    } catch (err) {
      if (seq === state.seq) list.replaceChildren(errorState({ message: errorMessage(err), onRetry: () => loadList() }));
      return;
    }
    if (seq !== state.seq) return;
    state.stale = Boolean(data.stale);
    state.cachedAt = data.cachedAt;
    paintList(data.transactions);
  }

  function paintList(rows) {
    const days = groupByDay(rows);
    const parts = [];
    if (state.stale) parts.push(offlineLine(state.cachedAt));
    if (days.length === 0) {
      parts.push(state.q
        ? emptyState({ title: 'Nothing found', text: `No activity matches "${state.q}"` })
        : emptyState({ title: 'No activity this cycle', text: 'Purchases from the bank SMS show up here' }));
    }
    parts.push(...days.map(dayCard));
    list.replaceChildren(...parts);
  }

  function dayCard(day) {
    return h('section', { class: 'card flush' },
      h('div', { class: 'day-head' },
        h('span', null, day.label),
        h('span', { class: 'day-total' }, moneyNode(day.total, { currency }))),
      day.rows.map(txnRow));
  }

  function txnRow(txn) {
    const ignored = txn.status === 'ignored';
    const label = ignored ? 'Ignored' : txn.status === 'pending' ? 'To review' : txn.category || 'Uncategorized';
    return h('button', {
      class: ignored ? 'row row-action is-ignored' : 'row row-action',
      type: 'button',
      onClick: () => openEdit(txn),
    },
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title', dir: 'auto' }, txn.display_name || txn.merchant || txn.merchant_raw),
      h('span', { class: 'row-sub', dir: 'auto' }, `${label} · ${time(txn.txn_at)}`)),
    h('span', { class: 'row-end' }, moneyNode(txn.amount, { currency: txn.currency, sign: txn.direction === 'in' })));
  }

  function openEdit(txn) {
    const current = txn.category || 'Uncategorized';
    const known = current === 'Uncategorized' || categories.includes(current);
    let category = current;
    let ignored = txn.status === 'ignored';

    const amount = numberInput({ value: String(txn.amount), 'aria-label': 'Amount' });
    const pick = selectInput({
      label: 'Category',
      value: current,
      options: [...(known ? [] : [current]), ...categories, 'Uncategorized'].map((n) => ({ value: n, label: n })),
      onChange: (v) => {
        category = v;
      },
    });
    const note = textInput({ value: txn.note || '', placeholder: 'Optional', 'aria-label': 'Note' });
    const name = textInput({ value: txn.display_name || '', placeholder: txn.merchant, 'aria-label': 'Display name' });
    const error = h('p', { class: 'field-error' });
    const toggle = button({
      label: ignored ? 'Restore' : 'Ignore',
      variant: 'secondary',
      block: true,
      onClick: () => {
        ignored = !ignored;
        toggle.textContent = ignored ? 'Restore' : 'Ignore';
      },
    });
    const save = button({ label: 'Save', variant: 'primary', block: true, onClick: () => saveEdit() });

    async function saveEdit() {
      const value = parseNumber(amount.value);
      if (!(value > 0)) {
        error.textContent = 'Enter an amount above zero';
        return;
      }
      const fields = {};
      if (value !== Number(txn.amount)) fields.amount = value;
      if (category !== current) fields.category = category;
      if (note.value.trim() !== (txn.note || '')) fields.note = note.value.trim();
      if (name.value.trim() !== (txn.display_name || '')) fields.display_name = name.value.trim();
      const statusChanged = ignored !== (txn.status === 'ignored');
      if (Object.keys(fields).length === 0 && !statusChanged) {
        sheet.close();
        return;
      }

      error.textContent = '';
      save.disabled = true;
      try {
        if (Object.keys(fields).length > 0) await apiPost('update', { id: txn.id, fields });
        if (statusChanged) {
          const status = ignored ? 'ignored' : category === 'Uncategorized' ? 'pending' : 'categorized';
          await apiPost('update', { id: txn.id, fields: { status } });
        }
      } catch (err) {
        save.disabled = false;
        error.textContent = errorMessage(err);
        return;
      }
      sheet.close();
      ctx.refreshBadge();
      toast('Saved');
      await loadList();
    }

    const content = h('div', { class: 'form-stack' },
      field({ label: 'Amount', control: amount }),
      field({ label: 'Category', control: pick }),
      field({ label: 'Note', control: note }),
      field({ label: 'Display name', control: name, hint: `Used for every purchase from ${txn.merchant}` }),
      error,
      h('div', { class: 'sheet-actions' }, save, toggle));
    const sheet = openSheet(content, { title: txn.display_name || txn.merchant || txn.merchant_raw });
  }
}

// Riyadh day key from the ISO string; rows arrive newest first, so each day is one run.
function groupByDay(rows) {
  const groups = [];
  for (const txn of rows) {
    const key = txn.txn_at.slice(0, 10);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: shortDate(txn.txn_at), rows: [], total: 0 };
      groups.push(group);
    }
    group.rows.push(txn);
    if (txn.direction === 'out' && txn.status !== 'ignored') group.total += Number(txn.amount) || 0;
  }
  for (const group of groups) group.total = Math.round(group.total * 100) / 100;
  return groups;
}

// "2026-11" shifted by whole months -> "2026-10" for -1.
function shiftCycle(label, months) {
  const [year, month] = label.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function flipped(name) {
  const el = icon(name);
  el.classList.add('flip');
  return el;
}
