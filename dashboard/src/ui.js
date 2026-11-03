// Shared DOM helpers and components. No framework: every builder returns an element.
import { money, ordinal, time } from './format.js';

const ICONS = {
  house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  'chart-column': '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'wifi-off': '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
};

// Element helper. Props: class, style (object, custom properties allowed), dataset, on<Event> handlers,
// boolean attrs (true sets the attribute, false/null/undefined skips). Children: nodes, strings, numbers, arrays.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'style') {
      for (const [prop, val] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
      if (key === 'value') el.value = String(value);
      if (key === 'checked') el.checked = true;
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// Inline lucide icon: 18px, 1.5 stroke, currentColor.
export function icon(name) {
  const template = document.createElement('template');
  template.innerHTML = `<svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return template.content.firstElementChild;
}

// Figure with a muted currency unit: "1,250.50 SAR". Use for amounts in lists and cards.
export function moneyNode(n, { currency = 'SAR', sign = false } = {}) {
  return h('span', { class: 'money' }, money(n, { sign }), h('span', { class: 'money-unit' }, currency));
}

export function pageHead(title, sub) {
  return h('header', { class: 'page-head' },
    h('h1', { class: 'page-title', dir: 'auto' }, title),
    sub ? h('p', { class: 'page-sub' }, sub) : null);
}

export function sectionTitle(text) {
  return h('h2', { class: 'section-title' }, text);
}

// Card surface. Add the 'flush' class (h('div', {class: 'card flush'})) when it holds list rows.
export function card(...children) {
  return h('div', { class: 'card' }, ...children);
}

// 56px row. Give onClick (button) or href (link) to make it tappable.
export function listRow({ lead, title, sub, end, onClick, href }) {
  const tag = onClick ? 'button' : href ? 'a' : 'div';
  return h(tag, {
    class: onClick || href ? 'row row-action' : 'row',
    type: onClick ? 'button' : null,
    href,
    onClick,
  },
  lead ? h('span', { class: 'row-lead' }, lead) : null,
  h('span', { class: 'row-main' },
    h('span', { class: 'row-title', dir: 'auto' }, title),
    sub ? h('span', { class: 'row-sub', dir: 'auto' }, sub) : null),
  end ? h('span', { class: 'row-end' }, end) : null);
}

// Budget bar. pct is spent / budget (null when there is no budget); state is ok | warn | over.
export function budgetBar({ pct, state = 'ok' }) {
  const width = pct === null || pct === undefined ? 0 : Math.min(Math.max(pct, 0), 1) * 100;
  return h('div', { class: 'bar', dataset: { state } },
    h('div', { class: 'bar-fill', style: { width: `${width}%` } }));
}

// Compact stat: label, mono figure, optional unit. state 'over' turns the figure red.
export function stat({ label, value, unit, state }) {
  return h('div', { class: 'card stat', dataset: state ? { state } : undefined },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, value),
    unit ? h('span', { class: 'stat-unit' }, unit) : null);
}

// Two to four options, one selected (aria-pressed). onChange gets the new value.
export function segmented({ options, value, onChange, label }) {
  let current = value;
  const group = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
  const draw = () => group.replaceChildren(...options.map((option) => h('button', {
    type: 'button',
    class: 'seg',
    'aria-pressed': String(option.value === current),
    onClick: () => {
      current = option.value;
      draw();
      onChange?.(option.value);
    },
  }, option.label)));
  draw();
  return group;
}

export function textInput({ value = '', ...attrs } = {}) {
  return h('input', { class: 'input', type: 'text', ...attrs, value });
}

// Amounts: text input with the decimal keypad. Read it with parseNumber from format.js.
export function numberInput({ value = '', ...attrs } = {}) {
  return h('input', { class: 'input mono', type: 'text', inputmode: 'decimal', autocomplete: 'off', ...attrs, value });
}

export function selectInput({ options, value, onChange, label }) {
  return h('select', {
    class: 'select',
    'aria-label': label,
    onChange: (e) => onChange?.(e.target.value),
  }, options.map((option) => h('option', { value: option.value, selected: option.value === value }, option.label)));
}

// Label above any control (input, select, segmented).
export function field({ label, control, hint }) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null);
}

// variant: primary (accent, one per screen) | secondary | quiet.
export function button({ label, variant = 'secondary', onClick, iconName, type = 'button', block = false, disabled = false }) {
  return h('button', {
    class: `btn btn-${variant}${block ? ' btn-block' : ''}`,
    type,
    disabled,
    onClick,
  }, iconName ? icon(iconName) : null, label);
}

export function emptyState({ title, text, action }) {
  return h('div', { class: 'empty' },
    h('p', { class: 'empty-title' }, title),
    text ? h('p', { class: 'empty-text' }, text) : null,
    action || null);
}

export function errorState({ message, onRetry }) {
  return emptyState({
    title: "Couldn't load this",
    text: message,
    action: button({ label: 'Try again', variant: 'secondary', onClick: onRetry }),
  });
}

// Loading placeholder. Shimmer is the only looping animation and stops under reduced motion.
export function skeleton(lines = 4) {
  const widths = ['40%', '90%', '70%', '100%', '55%'];
  return h('div', { class: 'skeleton', 'aria-hidden': 'true' },
    Array.from({ length: lines }, (_, i) => h('span', { class: 'skel', style: { width: widths[i % widths.length] } })));
}

// "Offline, showing data from 18:50". cachedAt is the ISO time of the cached copy.
export function offlineLine(cachedAt) {
  return h('p', { class: 'offline' }, icon('wifi-off'), `Offline, showing data from ${time(cachedAt)}`);
}

// Cycle strip: a thin line with one tick per day, filled to today, and a label.
// days_total / days_left come from summary; end is the exclusive end date (the next salary day).
export function cycleStrip({ days_total, days_left, end }) {
  const total = Math.max(1, days_total);
  const elapsed = Math.min(total, Math.max(0, total - days_left));
  const pct = (elapsed / total) * 100;
  const day = ordinal(Number(end.slice(8, 10)));
  const ticks = Array.from({ length: total }, (_, i) => h('span', { class: i < elapsed ? 'strip-tick is-past' : 'strip-tick' }));
  const label = days_left > 0
    ? h('p', { class: 'strip-label' }, h('span', { class: 'mono' }, String(days_left)), ` ${days_left === 1 ? 'day' : 'days'} to the ${day}`)
    : h('p', { class: 'strip-label' }, `Cycle ended on the ${day}`);
  return h('div', { class: 'strip' },
    h('div', { class: 'strip-track' },
      h('span', { class: 'strip-rule' }),
      h('span', { class: 'strip-fill', style: { width: `${pct}%` } }),
      h('span', { class: 'strip-ticks' }, ticks),
      h('span', { class: 'strip-now', style: { left: `${pct}%` } })),
    label);
}

const TABS = [
  ['home', 'Home', 'house'],
  ['inbox', 'Inbox', 'inbox'],
  ['transactions', 'Activity', 'list'],
  ['insights', 'Insights', 'chart-column'],
  ['settings', 'Settings', 'settings'],
];

// The five tab links for #tabbar. badge is the open count shown on Inbox (0 hides it).
export function tabLinks({ current, badge = 0 }) {
  return TABS.map(([name, label, iconName]) => h('a', {
    class: 'tab',
    href: `#/${name}`,
    'aria-current': name === current ? 'page' : null,
  },
  h('span', { class: 'tab-icon' },
    icon(iconName),
    name === 'inbox' && badge > 0 ? h('span', { class: 'tab-badge' }, String(badge)) : null),
  h('span', { class: 'tab-label' }, label)));
}

// Bottom sheet with backdrop, drag handle and Escape to close. Returns { close }.
export function openSheet(contentEl, { title = '' } = {}) {
  const root = document.getElementById('sheet-root');
  let closed = false;

  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Details', tabindex: '-1' },
    h('div', { class: 'sheet-grip' }),
    h('div', { class: 'sheet-head' },
      h('h2', { class: 'sheet-title', dir: 'auto' }, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onClick: () => close() }, icon('x'))),
    h('div', { class: 'sheet-body' }, contentEl));
  const wrap = h('div', { class: 'sheet-wrap' },
    h('div', { class: 'sheet-backdrop', onClick: () => close() }),
    panel);

  root.append(wrap);
  panel.focus({ preventScroll: true });
  void panel.offsetHeight; // commit the closed style so the open class animates
  wrap.classList.add('is-open');

  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  dragToDismiss(panel, [panel.querySelector('.sheet-grip'), panel.querySelector('.sheet-head')], () => close());

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    wrap.classList.remove('is-open');
    setTimeout(() => wrap.remove(), 300);
  }

  return { close };
}

// Drag down on the handle or header to dismiss. Dismiss past 80px, or a flick faster than 0.11 px/ms.
function dragToDismiss(panel, handles, onDismiss) {
  let pointer = null;
  let startY = 0;
  let startT = 0;
  let dy = 0;

  const end = (e) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    const speed = dy / Math.max(1, performance.now() - startT);
    panel.style.transition = '';
    if (dy > 80 || (dy > 12 && speed > 0.11)) {
      panel.style.transform = 'translateY(100%)';
      onDismiss();
    } else {
      panel.style.transform = '';
    }
  };

  for (const handle of handles) {
    handle.addEventListener('pointerdown', (e) => {
      if (pointer !== null || e.target.closest('button')) return;
      pointer = e.pointerId;
      startY = e.clientY;
      startT = performance.now();
      dy = 0;
      handle.setPointerCapture(pointer);
      panel.style.transition = 'none';
    });
    handle.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointer) return;
      dy = Math.max(0, e.clientY - startY);
      panel.style.transform = `translateY(${dy}px)`;
    });
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}

// Toast with an optional action (Undo). Stacks above the tab bar. Returns { dismiss }.
export function toast(text, { action, onAction, duration } = {}) {
  const root = document.getElementById('toast-root');
  let gone = false;
  let timer = null;

  const node = h('div', { class: 'toast', role: 'status' },
    h('span', { class: 'toast-text', dir: 'auto' }, text),
    action ? h('button', {
      class: 'toast-action',
      type: 'button',
      onClick: () => {
        onAction?.();
        dismiss();
      },
    }, action) : null);

  root.append(node);
  void node.offsetHeight; // commit the closed style so the open class animates
  node.classList.add('is-open');

  function dismiss() {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    node.classList.remove('is-open');
    setTimeout(() => node.remove(), 220);
  }

  timer = setTimeout(dismiss, duration || (action ? 6000 : 3500));
  return { dismiss };
}
