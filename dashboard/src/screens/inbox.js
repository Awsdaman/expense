// Inbox: pending purchases to categorize or ignore, then bank SMS the parser could not read.
import { apiGet, apiPost, errorMessage } from '../api.js';
import { parseNumber, shortDate, time } from '../format.js';
import { button, emptyState, errorState, field, h, icon, moneyNode, numberInput, offlineLine, openSheet, pageHead, selectInput, sectionTitle, skeleton, textInput, toast } from '../ui.js';

const SWIPE_DISTANCE = 80;

export async function render(root, ctx) {
  root.replaceChildren(skeleton(4));
  let inbox;
  let config;
  try {
    [inbox, config] = await Promise.all([apiGet('transactions', { status: 'pending' }), apiGet('config')]);
  } catch (err) {
    root.replaceChildren(errorState({ message: errorMessage(err), onRetry: () => render(root, ctx) }));
    return;
  }

  const categories = config.categories.filter((c) => c.active).sort((a, b) => a.sort - b.sort).map((c) => c.name);
  const state = {
    pending: inbox.transactions,
    errors: inbox.parse_errors,
    stale: Boolean(inbox.stale),
    cachedAt: inbox.cachedAt,
  };
  paint();

  function paint() {
    const parts = [pageHead('Inbox'), state.stale ? offlineLine(state.cachedAt) : null];
    if (state.pending.length === 0 && state.errors.length === 0) {
      parts.push(emptyState({ title: 'Nothing to review', text: "New purchases you haven't categorized show up here" }));
    }
    if (state.pending.length > 0) {
      parts.push(h('div', { class: 'card flush' }, state.pending.map(pendingRow)));
    }
    if (state.errors.length > 0) {
      parts.push(h('section', null,
        sectionTitle("Couldn't read"),
        h('div', { class: 'card flush' }, state.errors.map(errorRow))));
    }
    root.replaceChildren(h('div', { class: 'stack' }, parts));
  }

  function pendingRow(txn) {
    const content = h('button', {
      class: 'row row-action swipe-row',
      type: 'button',
      onClick: () => {
        if (content.dataset.moved !== '1') openTransaction(txn);
      },
    },
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title', dir: 'auto' }, displayName(txn)),
      h('span', { class: 'row-sub' }, `${shortDate(txn.txn_at)} · ${time(txn.txn_at)}`)),
    h('span', { class: 'row-end' }, moneyNode(txn.amount, { currency: txn.currency, sign: txn.direction === 'in' })));
    attachSwipe(content, async () => {
      if (!(await ignore(txn))) springBack(content);
    });
    return h('div', { class: 'swipe' },
      h('span', { class: 'swipe-bg', 'aria-hidden': 'true' }, icon('x'), 'Ignore'),
      content);
  }

  function errorRow(err) {
    return h('button', { class: 'row row-action', type: 'button', onClick: () => openError(err) },
      h('span', { class: 'row-lead' }, h('span', { class: 'state-dot', dataset: { state: 'warn' } })),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title', dir: 'auto' }, firstLine(err.raw_sms)),
        h('span', { class: 'row-sub' }, `${shortDate(err.received_at)} · ${time(err.received_at)}`)));
  }

  async function ignore(txn) {
    try {
      await apiPost('update', { id: txn.id, fields: { status: 'ignored' } });
    } catch (err) {
      toast(errorMessage(err));
      return false;
    }
    state.pending = state.pending.filter((t) => t.id !== txn.id);
    ctx.refreshBadge();
    paint();
    toast('Ignored', { action: 'Undo', onAction: () => undo(txn) });
    return true;
  }

  async function undo(txn) {
    try {
      await apiPost('update', { id: txn.id, fields: { status: 'pending' } });
    } catch (err) {
      toast(errorMessage(err));
      return;
    }
    ctx.refreshBadge();
    await render(root, ctx);
  }

  function openTransaction(txn) {
    let chosen = null;
    const note = textInput({ placeholder: 'Optional', 'aria-label': 'Note' });
    const choose = (name) => {
      chosen = name;
      choiceButtons.forEach((el, i) => el.setAttribute('aria-pressed', String(categories[i] === name)));
      save.disabled = false;
    };
    const choiceButtons = categories.map((name) => h('button', {
      class: 'row row-action choice',
      type: 'button',
      'aria-pressed': 'false',
      onClick: () => choose(name),
    },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title', dir: 'auto' }, name)),
    h('span', { class: 'row-end choice-check' }, icon('check'))));
    const save = button({ label: 'Save', variant: 'primary', block: true, disabled: true, onClick: () => saveCategory() });
    const ignoreBtn = button({
      label: 'Ignore',
      variant: 'quiet',
      block: true,
      onClick: async () => {
        if (await ignore(txn)) sheet.close();
      },
    });

    async function saveCategory() {
      save.disabled = true;
      const body = { id: txn.id, category: chosen };
      const text = note.value.trim();
      if (text) body.note = text;
      let res;
      try {
        res = await apiPost('categorize', body);
      } catch (err) {
        save.disabled = false;
        toast(errorMessage(err));
        return;
      }
      sheet.close();
      state.pending = state.pending.filter((t) => t.id !== txn.id);
      ctx.refreshBadge();
      paint();
      if (res.alert) toast(res.alert);
    }

    const content = h('div', { class: 'form-stack' },
      h('p', { class: 'sheet-amount' }, moneyNode(txn.amount, { currency: txn.currency, sign: txn.direction === 'in' })),
      h('p', { class: 'sheet-sub' }, `${shortDate(txn.txn_at)} · ${time(txn.txn_at)}`),
      sectionTitle('Category'),
      h('div', { class: 'card flush' }, choiceButtons),
      field({ label: 'Note', control: note }),
      h('div', { class: 'sheet-actions' }, save, ignoreBtn));
    const sheet = openSheet(content, { title: displayName(txn) });
  }

  function openError(err) {
    let category = '';
    const amount = numberInput({ placeholder: '0.00', 'aria-label': 'Amount' });
    const merchant = textInput({ placeholder: 'Merchant', 'aria-label': 'Merchant' });
    const date = h('input', { class: 'input', type: 'date', value: err.received_at.slice(0, 10), 'aria-label': 'Date' });
    const pick = selectInput({
      label: 'Category',
      value: '',
      options: [{ value: '', label: 'Choose a category' }, ...categories.map((n) => ({ value: n, label: n }))],
      onChange: (v) => {
        category = v;
      },
    });
    const error = h('p', { class: 'field-error' });
    const add = button({ label: 'Add transaction', variant: 'primary', block: true, onClick: () => addManually() });
    const dismiss = button({ label: 'Dismiss', variant: 'quiet', block: true, onClick: () => dismissError() });

    function fail(message) {
      error.textContent = message;
    }

    async function addManually() {
      const value = parseNumber(amount.value);
      if (!(value > 0)) return fail('Enter the amount');
      if (!merchant.value.trim()) return fail('Enter the merchant');
      if (!date.value) return fail('Pick a date');
      if (!category) return fail('Choose a category');
      error.textContent = '';
      add.disabled = true;
      try {
        await apiPost('create', {
          fields: {
            amount: value,
            merchant_raw: merchant.value.trim(),
            txn_at: `${date.value}T12:00:00+03:00`,
            category,
          },
          error_id: err.id,
        });
      } catch (e) {
        add.disabled = false;
        toast(errorMessage(e));
        return;
      }
      sheet.close();
      removeError(err);
      toast('Transaction added');
    }

    async function dismissError() {
      dismiss.disabled = true;
      try {
        await apiPost('dismiss_error', { id: err.id });
      } catch (e) {
        dismiss.disabled = false;
        toast(errorMessage(e));
        return;
      }
      sheet.close();
      removeError(err);
    }

    function removeError(item) {
      state.errors = state.errors.filter((e) => e.id !== item.id);
      ctx.refreshBadge();
      paint();
    }

    const content = h('div', { class: 'form-stack' },
      h('p', { class: 'sms-block', dir: 'auto' }, err.raw_sms),
      sectionTitle('Add manually'),
      field({ label: 'Amount', control: amount }),
      field({ label: 'Merchant', control: merchant }),
      field({ label: 'Date', control: date }),
      field({ label: 'Category', control: pick }),
      error,
      h('div', { class: 'sheet-actions' }, add, dismiss));
    const sheet = openSheet(content, { title: "Couldn't read this SMS" });
  }
}

function displayName(txn) {
  return txn.display_name || txn.merchant || txn.merchant_raw;
}

function firstLine(text) {
  return String(text || '').split('\n')[0] || 'Unreadable SMS';
}

function springBack(el) {
  el.style.transition = '';
  el.style.transform = '';
}

// Horizontal swipe left on one row: the row follows the finger. Past 80px on release it calls onIgnore,
// otherwise it springs back. Vertical movement hands the gesture to the page scroll (touch-action: pan-y).
function attachSwipe(el, onIgnore) {
  let drag = null;

  el.addEventListener('pointerdown', (e) => {
    if (drag) return;
    delete el.dataset.moved;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, dx: 0 };
  });

  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const mx = e.clientX - drag.x;
    const my = e.clientY - drag.y;
    if (drag.axis === null) {
      if (Math.hypot(mx, my) < 6) return;
      el.dataset.moved = '1';
      drag.axis = mx < 0 && Math.abs(mx) > Math.abs(my) * 1.5 ? 'x' : 'y';
      if (drag.axis === 'x') {
        el.setPointerCapture(e.pointerId);
        el.style.transition = 'none';
      }
    }
    if (drag.axis !== 'x') return;
    drag.dx = Math.min(0, mx);
    el.style.transform = `translateX(${drag.dx}px)`;
  });

  const release = (e, cancelled) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { axis, dx } = drag;
    drag = null;
    if (axis !== 'x') return;
    if (!cancelled && dx < -SWIPE_DISTANCE) {
      el.style.transition = 'transform 200ms var(--ease-out)';
      el.style.transform = 'translateX(-100%)';
      onIgnore();
      return;
    }
    el.style.transition = 'transform 200ms var(--ease-out)';
    springBack(el);
  };

  el.addEventListener('pointerup', (e) => release(e, false));
  el.addEventListener('pointercancel', (e) => release(e, true));
}
