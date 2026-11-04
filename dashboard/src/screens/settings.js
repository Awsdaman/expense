// Settings: budget cycle, category editor with one save, connection.
import { apiPost, clearConfig, errorMessage, loadConfig, loadScreen } from '../api.js';
import { parseNumber } from '../format.js';
import { button, card, errorState, h, numberInput, offlineLine, pageHead, sectionTitle, segmented, skeleton, textInput, toast } from '../ui.js';

const KINDS = [{ value: 'need', label: 'Need' }, { value: 'want', label: 'Want' }];

export async function render(root, ctx) {
  root.replaceChildren(skeleton(6));
  try {
    await loadScreen(root, [['config']], ([data]) => root.replaceChildren(screen(data, root, ctx)));
  } catch (err) {
    root.replaceChildren(errorState({ message: errorMessage(err), onRetry: () => render(root, ctx) }));
  }
}

function screen(data, root, ctx) {
  const { settings, categories = [], stale, cachedAt } = data;
  const currency = settings.currency || 'SAR';
  const orig = {
    cycle_start_day: Number(settings.cycle_start_day),
    savings_target: Number(settings.savings_target) || 0,
    alert_threshold: Number(settings.alert_threshold),
  };
  const state = {
    cycle: String(settings.cycle_start_day ?? ''),
    savings: String(orig.savings_target),
    alert: percentText(settings.alert_threshold),
    rows: categories.map(toRow),
    saving: false,
  };

  const fields = {
    cycle: fieldBox({
      label: 'Cycle start day',
      hint: 'Usually your salary day',
      control: numberInput({ value: state.cycle, inputmode: 'numeric', onInput: (e) => { state.cycle = e.target.value; refresh(); } }),
    }),
    savings: fieldBox({
      label: `Savings target (${currency})`,
      control: numberInput({ value: state.savings, onInput: (e) => { state.savings = e.target.value; refresh(); } }),
    }),
    alert: fieldBox({
      label: 'Alert threshold (%)',
      hint: 'Warn when a category reaches this share of its budget',
      control: numberInput({ value: state.alert, onInput: (e) => { state.alert = e.target.value; refresh(); } }),
    }),
  };

  const list = h('div', { class: 'card flush' });
  const status = h('p', { class: 'status', role: 'status' });
  const saveBtn = button({ label: 'Save changes', variant: 'primary', block: true, onClick: save });

  function rowEl(row) {
    const nameErr = h('span', { class: 'field-error', hidden: true });
    const budget = fieldBox({
      label: `Budget (${currency})`,
      control: numberInput({ value: row.budget, onInput: (e) => { row.budget = e.target.value; refresh(); } }),
    });
    const kind = fieldBox({
      label: 'Kind',
      control: segmented({ options: KINDS, value: row.kind, label: 'Kind', onChange: (v) => { row.kind = v; refresh(); } }),
    });

    let nameNode;
    if (row.renaming) {
      let done = false;
      const finish = (keep) => {
        if (done) return;
        done = true;
        if (keep) row.name = nameNode.value.trim();
        row.renaming = false;
        replaceRow(row);
      };
      nameNode = textInput({
        class: 'input cedit-input',
        value: row.name,
        dir: 'auto',
        autocomplete: 'off',
        'aria-label': 'Category name',
        onBlur: () => finish(true),
        onKeydown: (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
          } else if (e.key === 'Escape') {
            finish(false);
          }
        },
      });
    } else {
      nameNode = h('button', {
        class: row.name ? 'cedit-name' : 'cedit-name is-empty',
        type: 'button',
        dir: 'auto',
        onClick: () => {
          row.renaming = true;
          replaceRow(row, true);
        },
      }, row.name || 'Add a name');
    }

    const action = row.isNew
      ? button({
        label: 'Remove',
        variant: 'quiet',
        onClick: () => {
          state.rows = state.rows.filter((r) => r !== row);
          drawList();
        },
      })
      : button({
        label: row.active ? 'Archive' : 'Restore',
        variant: 'quiet',
        onClick: () => {
          row.active = !row.active;
          drawList();
        },
      });

    row.ui = { nameErr, budget };
    return h('div', { class: row.active ? 'cedit' : 'cedit is-archived' },
      h('div', { class: 'cedit-head' }, nameNode, action),
      nameErr,
      h('div', { class: 'cedit-fields' }, budget.el, kind.el));
  }

  // Active rows first, then archived. New rows sit after the active ones.
  function drawList() {
    const ordered = [...state.rows.filter((r) => r.active), ...state.rows.filter((r) => !r.active)];
    for (const row of ordered) row.el = rowEl(row);
    list.replaceChildren(...(ordered.length
      ? ordered.map((r) => r.el)
      : [h('p', { class: 'quiet cedit-empty' }, 'No categories yet')]));
    refresh();
  }

  function replaceRow(row, focus = false) {
    const next = rowEl(row);
    row.el.replaceWith(next);
    row.el = next;
    if (focus) {
      const input = next.querySelector('.cedit-input');
      if (input) {
        input.focus();
        input.select();
      }
    }
    refresh();
  }

  function addRow() {
    state.rows.push({
      orig: null,
      isNew: true,
      name: '',
      budget: '0',
      kind: 'want',
      active: true,
      renaming: true,
      ui: null,
      el: null,
    });
    drawList();
    const input = list.querySelector('.cedit-input');
    if (input) input.focus();
  }

  // Validates everything and builds the request body. Nothing is sent from here.
  function evaluate() {
    const errors = {};
    const body = {};

    const day = parseDay(state.cycle);
    errors.cycle = day.error || null;
    if (!day.error && day.value !== orig.cycle_start_day) body.cycle_start_day = day.value;

    const savings = parseAmount(state.savings);
    errors.savings = savings.error || null;
    if (!savings.error && savings.value !== orig.savings_target) body.savings_target = savings.value;

    const alert = parsePercent(state.alert);
    errors.alert = alert.error || null;
    if (!alert.error && Math.abs(alert.value - orig.alert_threshold) > 1e-9) body.alert_threshold = alert.value;

    const counts = new Map();
    for (const row of state.rows) {
      const key = row.name.trim().toLowerCase();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }

    const rowErrors = new Map();
    const categories = [];
    let rowsValid = true;
    for (const row of state.rows) {
      const name = row.name.trim();
      const budget = parseAmount(row.budget);
      const err = { name: null, budget: budget.error || null };
      if (!name) err.name = 'Enter a name';
      else if (counts.get(name.toLowerCase()) > 1) err.name = 'Another category has this name';
      if (err.name || err.budget) rowsValid = false;
      rowErrors.set(row, err);

      const changed = row.isNew || !row.orig
        || name !== row.orig.name
        || budget.value !== row.orig.monthly_budget
        || row.kind !== row.orig.kind
        || row.active !== row.orig.active;
      if (!changed) continue;

      const item = { name, monthly_budget: budget.error ? 0 : budget.value, kind: row.kind, active: row.active };
      if (!row.isNew && row.orig && name !== row.orig.name) item.rename_from = row.orig.name;
      categories.push(item);
    }
    if (categories.length) body.categories = categories;

    const valid = !errors.cycle && !errors.savings && !errors.alert && rowsValid;
    return { errors, rowErrors, body, dirty: Object.keys(body).length > 0, valid };
  }

  function refresh() {
    const result = evaluate();
    fields.cycle.setError(result.errors.cycle);
    fields.savings.setError(result.errors.savings);
    fields.alert.setError(result.errors.alert);
    for (const row of state.rows) {
      if (!row.ui) continue;
      const err = result.rowErrors.get(row) || {};
      row.ui.nameErr.textContent = err.name || '';
      row.ui.nameErr.hidden = !err.name;
      row.ui.budget.setError(err.budget);
    }
    saveBtn.disabled = state.saving || !(result.dirty && result.valid);
    return result;
  }

  async function save() {
    const result = evaluate();
    if (state.saving || !result.valid || !result.dirty) return;
    state.saving = true;
    saveBtn.textContent = 'Saving';
    status.textContent = '';
    status.dataset.state = '';
    refresh();
    try {
      const fresh = await apiPost('settings', result.body);
      toast('Saved');
      root.replaceChildren(screen(fresh, root, ctx));
    } catch (err) {
      state.saving = false;
      saveBtn.textContent = 'Save changes';
      status.textContent = errorMessage(err);
      status.dataset.state = 'error';
      refresh();
    }
  }

  drawList();

  return h('div', { class: 'stack' },
    pageHead('Settings'),
    stale ? offlineLine(cachedAt) : null,
    h('section', null,
      sectionTitle('Budget cycle'),
      card(h('div', { class: 'form-stack' }, fields.cycle.el, fields.savings.el, fields.alert.el))),
    h('section', null,
      sectionTitle('Categories'),
      h('div', { class: 'section-body' },
        list,
        button({ label: 'Add category', variant: 'secondary', iconName: 'plus', block: true, onClick: addRow }))),
    h('section', null,
      sectionTitle('Connection'),
      connection(ctx),
      h('a', { class: 'quiet-link', href: './shortcuts/index.html' }, 'Install the iPhone Shortcuts')),
    h('div', { class: 'savebar' }, status, saveBtn));
}

function connection(ctx) {
  const cfg = loadConfig();
  return card(h('div', { class: 'conn' },
    h('div', { class: 'conn-main' },
      h('span', { class: 'field-label' }, 'API host'),
      h('span', { class: 'conn-host mono', dir: 'ltr' }, hostOf(cfg?.url))),
    button({
      label: 'Disconnect',
      variant: 'quiet',
      onClick: () => {
        clearConfig();
        ctx.navigate('#/setup');
      },
    })));
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function toRow(c) {
  const budget = Number(c.monthly_budget) || 0;
  const active = c.active === true || c.active === 1 || c.active === '1' || c.active === 'TRUE' || c.active === 'true';
  return {
    orig: { name: c.name, monthly_budget: budget, kind: c.kind, active },
    isNew: false,
    name: c.name,
    budget: String(budget),
    kind: c.kind === 'need' ? 'need' : 'want',
    active,
    renaming: false,
    ui: null,
    el: null,
  };
}

// Label, optional hint (hidden while an error shows), and one error line under the control.
function fieldBox({ label, hint, control }) {
  const hintEl = hint ? h('span', { class: 'field-hint' }, hint) : null;
  const errEl = h('span', { class: 'field-error', hidden: true });
  if (control.tagName === 'INPUT' && !control.hasAttribute('aria-label')) control.setAttribute('aria-label', label);
  const el = h('div', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hintEl,
    errEl);
  return {
    el,
    setError(msg) {
      errEl.textContent = msg || '';
      errEl.hidden = !msg;
      if (hintEl) hintEl.hidden = Boolean(msg);
      if (control.tagName === 'INPUT') control.setAttribute('aria-invalid', String(Boolean(msg)));
    },
  };
}

function percentText(fraction) {
  const pct = Math.round(Number(fraction) * 10000) / 100;
  return Number.isFinite(pct) ? String(pct) : '';
}

function parseDay(text) {
  const n = parseNumber(text);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? { value: n } : { error: 'Enter a day from 1 to 31' };
}

function parseAmount(text) {
  const n = parseNumber(text);
  return Number.isFinite(n) && n >= 0 ? { value: n } : { error: 'Enter 0 or more' };
}

// Percent as typed (80) -> fraction (0.8) for the API.
function parsePercent(text) {
  const n = parseNumber(text);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? { value: n / 100 } : { error: 'Enter a percent from 0 to 100' };
}
