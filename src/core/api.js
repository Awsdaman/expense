import { parseSms } from '../parser/index.js';
import { normalizeText } from '../parser/normalize.js';
import { redactSms } from '../parser/redact.js';
import { normalizeMerchant } from '../parser/merchant.js';
import { readSettings, isTruthy } from './settings.js';
import { formatMoney } from './format.js';
import { cycleLabel } from './cycle.js';
import { hashText, makeId, safeEqual } from './hash.js';
import { suggestCategory, autoCategory, displayNameFor, learnRule } from './rules.js';
import { computeSummary, budgetStatus } from './summary.js';

export function handleRequest(params, store, env) {
  const p = params || {};
  if (!p.action) return { ok: true, service: 'iqtifaa' };
  if (!safeEqual(p.token, env.token)) return { ok: false, error: 'unauthorized' };
  switch (p.action) {
    case 'ingest': return apiIngest(p, store, env);
    case 'categorize': return apiCategorize(p, store, env);
    case 'update': return apiUpdate(p, store, env);
    case 'create': return apiCreate(p, store, env);
    case 'dismiss_error': return apiDismissError(p, store);
    case 'settings': return apiUpdateSettings(p, store);
    case 'config': return apiConfig(store);
    case 'summary': return apiSummary(p, store, env);
    case 'transactions': return apiTransactions(p, store);
    case 'pending_count': return apiPendingCount(store);
    default: return { ok: false, error: 'unknown_action' };
  }
}

function apiBad() {
  return { ok: false, error: 'bad_request' };
}

function apiNotFound() {
  return { ok: false, error: 'not_found' };
}

function apiText(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function apiValidDate(v) {
  return apiText(v) && !isNaN(Date.parse(v));
}

function apiBlank(v) {
  return v === null || v === undefined ? '' : v;
}

function apiMinutesApart(a, b) {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 60000;
}

function apiSettingsOf(store) {
  return readSettings(store.rows('Settings'));
}

function apiCategoriesOf(store) {
  return store.rows('Categories').map((c) => ({
    name: String(c.name),
    emoji: String(apiBlank(c.emoji)),
    monthly_budget: Number(c.monthly_budget) || 0,
    kind: String(apiBlank(c.kind)),
    active: isTruthy(c.active),
    sort: Number(c.sort) || 0,
  })).sort((a, b) => a.sort - b.sort || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function apiActiveNames(store) {
  return apiCategoriesOf(store).filter((c) => c.active).map((c) => c.name);
}

function apiFindTxn(store, id) {
  return store.rows('Transactions').find((t) => t.id === id) || null;
}

function apiDisplayOf(store, merchant) {
  return displayNameFor(store.rows('MerchantRules'), merchant) || '';
}

function apiSummaryOf(store, cycle, settings, env) {
  return computeSummary({
    transactions: store.rows('Transactions'),
    categories: apiCategoriesOf(store),
    rules: store.rows('MerchantRules'),
    settings,
    cycle,
    nowIso: env.nowIso(),
    parseErrors: store.rows('ParseErrors'),
  });
}

// Latest categorized, non-ignored purchase at the same merchant (used for refunds).
function apiPriorCategory(txns, merchant) {
  const found = txns
    .filter((t) => t.direction === 'out' && t.status !== 'ignored' && t.merchant === merchant && apiText(t.category))
    .sort((a, b) => Date.parse(b.txn_at) - Date.parse(a.txn_at));
  return found.length ? found[0].category : null;
}

function apiDecide(row, txns, rules) {
  if (row.direction === 'in' && row.type !== 'refund') return { category: 'Income', status: 'auto' };
  if (row.direction === 'in') {
    const prior = apiPriorCategory(txns, row.merchant);
    if (prior) return { category: prior, status: 'auto' };
    return { category: suggestCategory(rules, row.merchant) || '', status: 'pending' };
  }
  const auto = autoCategory(rules, row.merchant);
  if (auto) return { category: auto, status: 'auto' };
  return { category: '', status: 'pending' };
}

// The ingest response for a stored row. Also used for duplicates.
function apiReply(row, store) {
  const rules = store.rows('MerchantRules');
  const cats = apiCategoriesOf(store);
  const names = cats.filter((c) => c.active).map((c) => c.name).filter((n) => n !== 'Uncategorized');
  const label = displayNameFor(rules, row.merchant) || row.merchant;
  const money = formatMoney(Number(row.amount), row.currency);
  const ask = row.status === 'pending' && row.direction === 'out';
  const suggested = ask ? suggestCategory(rules, row.merchant) : null;
  const ordered = (suggested && names.includes(suggested) ? [suggested] : [])
    .concat(names.filter((n) => n !== suggested), ['Uncategorized']);

  let message;
  if (ask) {
    message = money + ' at ' + label;
  } else if (row.direction === 'in') {
    message = row.type === 'refund' ? 'Refund ' + money + ' from ' + label : 'Received ' + money;
  } else {
    const cat = cats.find((c) => c.name === row.category);
    const prefix = cat && cat.emoji ? cat.emoji + ' ' : '';
    message = prefix + money + ' at ' + label + ' → ' + row.category + (row.status === 'auto' ? ' (auto)' : '');
  }

  return {
    ok: true,
    ignored: false,
    txn: { id: row.id, type: row.type, amount: Number(row.amount), currency: row.currency, merchant: label },
    status: row.status,
    ask,
    suggested_category: suggested,
    categories: ordered,
    prompt: ask ? money + ' at ' + label + ' — what was this for?' : '',
    message,
  };
}

function apiIngest(p, store, env) {
  if (!apiText(p.sms)) return apiBad();
  const received = p.received_at || env.nowIso();
  const parsed = parseSms(p.sms, { sender: p.sender || '' });
  if (parsed && parsed.ignored) return { ok: true, ignored: true, ask: false, reason: parsed.reason };

  const hash = hashText(normalizeText(p.sms));
  const txns = store.rows('Transactions');
  const seen = txns.find((t) => t.dedupe_hash === hash && apiMinutesApart(t.received_at, received) <= 10);
  // The automation fired twice: answer, but never prompt a second time.
  if (seen) return Object.assign(apiReply(seen, store), { duplicate: true, ask: false, prompt: '' });

  if (parsed === null) {
    store.append('ParseErrors', {
      id: makeId('e', env.random),
      received_at: received,
      raw_sms: redactSms(p.sms),
      error: 'no_parser',
      status: 'open',
    });
    return { ok: true, ignored: false, ask: false, parsed: false, message: "Couldn't read this bank SMS. It's waiting in the dashboard inbox." };
  }

  const settings = apiSettingsOf(store);
  const txnAt = parsed.txn_at || received;
  const row = {
    id: makeId('t', env.random),
    received_at: received,
    txn_at: txnAt,
    type: parsed.type,
    direction: parsed.direction,
    amount: parsed.amount,
    currency: parsed.currency,
    amount_sar: apiBlank(parsed.amount_sar),
    merchant_raw: parsed.merchant_raw,
    merchant: parsed.merchant,
    card_last4: apiBlank(parsed.card_last4),
    payment_method: apiBlank(parsed.payment_method),
    bank: parsed.bank,
    category: '',
    note: '',
    status: 'pending',
    cycle: cycleLabel(txnAt, settings.cycle_start_day),
    dedupe_hash: hash,
    raw_sms: redactSms(p.sms),
  };
  const decision = apiDecide(row, txns, store.rows('MerchantRules'));
  row.category = decision.category;
  row.status = decision.status;
  store.append('Transactions', row);
  return apiReply(row, store);
}

function apiLearn(store, merchant, category, nowIso, threshold) {
  const rows = learnRule(store.rows('MerchantRules'), merchant, category, nowIso, Number(threshold));
  for (const r of rows) {
    if (store.update('MerchantRules', { merchant: r.merchant, category: r.category }, r) === 0) {
      store.append('MerchantRules', r);
    }
  }
}

function apiBudgetReply(store, cycle, category, settings, env) {
  const summary = apiSummaryOf(store, cycle, settings, env);
  const entry = summary.categories.find((c) => c.name === category);
  const spent = entry ? entry.spent : 0;
  const cat = apiCategoriesOf(store).find((c) => c.name === category);
  const budget = cat ? cat.monthly_budget : 0;
  const st = budgetStatus(spent, budget, Number(settings.alert_threshold));
  const res = { ok: true, budget: { category, spent, budget, pct: st.pct } };
  if (st.state === 'over') res.alert = category + ': over budget (' + Math.round(st.pct * 100) + '%)';
  else if (st.state === 'warn') res.alert = category + ': ' + Math.round(st.pct * 100) + '% of budget used';
  return res;
}

function apiCategorize(p, store, env) {
  if (!apiText(p.id) || !apiText(p.category)) return apiBad();
  if (p.category !== 'Uncategorized' && !apiActiveNames(store).includes(p.category)) return apiBad();
  const txn = apiFindTxn(store, p.id);
  if (!txn) return apiNotFound();

  const patch = { category: p.category, status: 'categorized' };
  if (typeof p.note === 'string') patch.note = p.note;
  store.update('Transactions', { id: txn.id }, patch);

  const settings = apiSettingsOf(store);
  if (p.category !== 'Uncategorized') {
    apiLearn(store, txn.merchant, p.category, env.nowIso(), settings.auto_threshold);
  }
  return apiBudgetReply(store, txn.cycle, p.category, settings, env);
}

function apiSetDisplayName(store, merchant, name, env) {
  const n = store.update('MerchantRules', { merchant }, { display_name: name });
  if (n === 0) {
    store.append('MerchantRules', {
      merchant, display_name: name, category: '', hits: 0, auto: false, updated_at: env.nowIso(),
    });
  }
}

function apiUpdate(p, store, env) {
  if (!apiText(p.id) || !p.fields || typeof p.fields !== 'object') return apiBad();
  const txn = apiFindTxn(store, p.id);
  if (!txn) return apiNotFound();

  const f = p.fields;
  const has = (k) => f[k] !== undefined;
  const settings = apiSettingsOf(store);
  const patch = {};

  if (has('amount')) {
    const n = Number(f.amount);
    if (!(n > 0)) return apiBad();
    patch.amount = n;
  }
  if (has('currency')) {
    if (!apiText(f.currency)) return apiBad();
    patch.currency = String(f.currency);
  }
  const currency = patch.currency || txn.currency;
  if ((has('amount') || has('currency')) && currency === 'SAR') {
    patch.amount_sar = patch.amount !== undefined ? patch.amount : Number(txn.amount);
  }
  if (has('amount_sar')) {
    const n = Number(f.amount_sar);
    if (!(n >= 0)) return apiBad();
    patch.amount_sar = n;
  }
  if (has('txn_at')) {
    if (!apiValidDate(f.txn_at)) return apiBad();
    patch.txn_at = String(f.txn_at);
    patch.cycle = cycleLabel(patch.txn_at, settings.cycle_start_day);
  }
  if (has('note')) patch.note = String(apiBlank(f.note));

  const categoryChanged = has('category') && String(f.category) !== txn.category;
  if (has('category')) {
    patch.category = String(f.category);
    if (categoryChanged) patch.status = 'categorized';
  }
  if (has('status')) {
    if (['pending', 'categorized', 'ignored'].indexOf(f.status) < 0) return apiBad();
    patch.status = f.status;
  }
  if (has('display_name')) apiSetDisplayName(store, txn.merchant, String(apiBlank(f.display_name)), env);

  if (Object.keys(patch).length) store.update('Transactions', { id: txn.id }, patch);
  if (categoryChanged && patch.category !== 'Uncategorized') {
    apiLearn(store, txn.merchant, patch.category, env.nowIso(), settings.auto_threshold);
  }

  const row = apiFindTxn(store, txn.id);
  return { ok: true, txn: Object.assign({}, row, { display_name: apiDisplayOf(store, row.merchant) }) };
}

function apiCreate(p, store, env) {
  const f = p.fields;
  if (!f || typeof f !== 'object') return apiBad();
  const settings = apiSettingsOf(store);
  const amount = Number(f.amount);
  const merchantRaw = apiText(f.merchant_raw) ? f.merchant_raw.trim() : '';
  const type = apiText(f.type) ? f.type : 'purchase';
  const txnAt = apiText(f.txn_at) ? f.txn_at : env.nowIso();
  if (!(amount > 0) || !merchantRaw || !apiValidDate(txnAt)) return apiBad();

  const currency = apiText(f.currency) ? f.currency : settings.currency;
  const category = apiText(f.category) ? f.category : '';
  const now = env.nowIso();
  const row = {
    id: makeId('t', env.random),
    received_at: now,
    txn_at: txnAt,
    type,
    direction: type === 'refund' || type === 'credit' ? 'in' : 'out',
    amount,
    currency,
    amount_sar: currency === 'SAR' ? amount : '',
    merchant_raw: merchantRaw,
    merchant: normalizeMerchant(merchantRaw),
    card_last4: '',
    payment_method: '',
    bank: 'manual',
    category,
    note: typeof f.note === 'string' ? f.note : '',
    status: category ? 'categorized' : 'pending',
    cycle: cycleLabel(txnAt, settings.cycle_start_day),
    dedupe_hash: '',
    raw_sms: '',
  };
  store.append('Transactions', row);
  if (apiText(p.error_id)) store.update('ParseErrors', { id: p.error_id }, { status: 'resolved' });
  return { ok: true, txn: row };
}

function apiDismissError(p, store) {
  if (!apiText(p.id)) return apiBad();
  const n = store.update('ParseErrors', { id: p.id }, { status: 'dismissed' });
  return n ? { ok: true } : apiNotFound();
}

function apiRecomputeCycles(store, startDay) {
  for (const t of store.rows('Transactions')) {
    if (apiText(t.txn_at)) store.update('Transactions', { id: t.id }, { cycle: cycleLabel(t.txn_at, startDay) });
  }
}

function apiApplyCategory(store, item) {
  const cats = store.rows('Categories');
  const from = apiText(item.rename_from) ? item.rename_from : item.name;
  const fields = {};
  if (item.emoji !== undefined) fields.emoji = String(item.emoji);
  if (item.monthly_budget !== undefined) fields.monthly_budget = Number(item.monthly_budget) || 0;
  if (item.kind !== undefined) fields.kind = String(item.kind);
  if (item.active !== undefined) fields.active = isTruthy(item.active);
  if (item.sort !== undefined) fields.sort = Number(item.sort) || 0;

  if (!cats.some((c) => c.name === from)) {
    const sort = cats.reduce((m, c) => Math.max(m, Number(c.sort) || 0), 0) + 1;
    store.append('Categories', {
      name: item.name, emoji: '', monthly_budget: 0, kind: 'want', active: true, sort, ...fields,
    });
    return;
  }
  if (from !== item.name) {
    store.update('Transactions', { category: from }, { category: item.name });
    store.update('MerchantRules', { category: from }, { category: item.name });
    fields.name = item.name;
  }
  store.update('Categories', { name: from }, fields);
}

function apiUpdateSettings(p, store) {
  const keys = ['savings_target', 'cycle_start_day', 'alert_threshold', 'auto_threshold'];
  const scalars = keys.filter((k) => p[k] !== undefined);
  for (const k of scalars) {
    if (p[k] === '' || !isFinite(Number(p[k]))) return apiBad();
  }
  if (p.cycle_start_day !== undefined) {
    const d = Number(p.cycle_start_day);
    if (!(Number.isInteger(d) && d >= 1 && d <= 31)) return apiBad();
  }
  if (p.budgets !== undefined) {
    if (!p.budgets || typeof p.budgets !== 'object') return apiBad();
    if (Object.keys(p.budgets).some((k) => !(Number(p.budgets[k]) >= 0))) return apiBad();
  }
  if (p.categories !== undefined) {
    if (!Array.isArray(p.categories) || p.categories.some((c) => !c || !apiText(c.name))) return apiBad();
  }

  const before = apiSettingsOf(store);
  for (const k of scalars) {
    const value = String(Number(p[k]));
    if (store.update('Settings', { key: k }, { value }) === 0) store.append('Settings', { key: k, value });
  }
  if (p.cycle_start_day !== undefined && Number(p.cycle_start_day) !== before.cycle_start_day) {
    apiRecomputeCycles(store, Number(p.cycle_start_day));
  }
  if (p.budgets) {
    for (const name of Object.keys(p.budgets)) {
      store.update('Categories', { name }, { monthly_budget: Number(p.budgets[name]) });
    }
  }
  if (p.categories) {
    for (const item of p.categories) apiApplyCategory(store, item);
  }
  return apiConfig(store);
}

function apiConfig(store) {
  return { ok: true, settings: apiSettingsOf(store), categories: apiCategoriesOf(store) };
}

function apiSummary(p, store, env) {
  const settings = apiSettingsOf(store);
  const cycle = apiText(p.cycle) ? String(p.cycle) : cycleLabel(env.nowIso(), settings.cycle_start_day);
  return Object.assign({ ok: true }, apiSummaryOf(store, cycle, settings, env));
}

function apiTransactions(p, store) {
  const rules = store.rows('MerchantRules');
  let rows = store.rows('Transactions').map((t) => Object.assign({}, t, {
    display_name: displayNameFor(rules, t.merchant) || '',
  }));
  if (apiText(p.cycle)) rows = rows.filter((t) => t.cycle === String(p.cycle));
  if (apiText(p.status)) rows = rows.filter((t) => t.status === p.status);
  if (apiText(p.q)) {
    const q = String(p.q).toLowerCase();
    rows = rows.filter((t) => ['merchant', 'merchant_raw', 'display_name', 'note', 'category']
      .some((k) => String(t[k]).toLowerCase().includes(q)));
  }
  rows.sort((a, b) => Date.parse(b.txn_at) - Date.parse(a.txn_at));
  const parseErrors = store.rows('ParseErrors')
    .filter((e) => e.status === 'open')
    .sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at));
  return { ok: true, transactions: rows, parse_errors: parseErrors };
}

function apiPendingCount(store) {
  const pending = store.rows('Transactions').filter((t) => t.status === 'pending').length;
  const open = store.rows('ParseErrors').filter((e) => e.status === 'open').length;
  return { ok: true, count: pending + open };
}
