import { describe, it, expect, vi } from 'vitest';
import { handleRequest } from '../src/core/api.js';
import { createMemoryStore } from '../src/dev/memory-store.js';
import { DEFAULT_SETTINGS, STARTER_CATEGORIES } from '../src/core/settings.js';

// Real SMS samples from Plan.md section 5. The parser knows only these purchase formats,
// so the refund and credit branches are driven through a stub that handles TEST-* texts.
vi.mock('../src/parser/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    parseSms(text, opts) {
      if (text.startsWith('TEST-CREDIT ')) {
        return {
          type: 'credit', direction: 'in', amount: 5000, currency: 'SAR', amount_sar: 5000,
          merchant_raw: 'ACME PAYROLL', merchant: 'ACME PAYROLL', card_last4: null,
          payment_method: null, txn_at: null, bank: 'alrajhi',
        };
      }
      if (text.startsWith('TEST-REFUND ')) {
        const merchant = text.slice('TEST-REFUND '.length).trim();
        return {
          type: 'refund', direction: 'in', amount: 45, currency: 'SAR', amount_sar: 45,
          merchant_raw: merchant, merchant, card_last4: '1111', payment_method: 'Mada card',
          txn_at: null, bank: 'snb',
        };
      }
      return actual.parseSms(text, opts);
    },
  };
});

const TOKEN = 't0k3n-for-tests';
const NOW = '2026-11-03T19:00:00+03:00';
const LATER = '2026-11-03T19:11:00+03:00';
const STARTER_NAMES = STARTER_CATEGORIES.map((c) => c.name);
const COFFEE_EMOJI = STARTER_CATEGORIES.find((c) => c.name === 'Coffee').emoji;

const SNB_SMS = ['شراء-POS', 'بـ14 SAR', 'من khush sha', 'مدى-ابل*1111', 'في 03/11/26 18:50'].join('\n');
const ALRAJHI_SMS = ['شراء PoS', 'عبر:2222;مدى-ابل باي', 'بـSAR 81.60', 'لـS175 Tami', '؜3/11/26 18:31'].join('\n');
const BARQ_SMS = [
  'Online Purchase', 'VISA card **3333', 'Amount 6.9 USD (25.91 SAR)', 'Balance 11.97',
  'At OPENAI', 'A/C **4444', '2026-10-03 20:32',
].join('\n');
const UNKNOWN_SMS = 'Hello, this is a random message from your friend.';

function makeRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function setup(seedExtra = {}) {
  const store = createMemoryStore({
    Categories: STARTER_CATEGORIES.map((c) => ({ ...c })),
    Settings: Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value: String(value) })),
    ...seedExtra,
  });
  const env = { token: TOKEN, nowIso: () => NOW, random: makeRandom(42) };
  const call = (params) => handleRequest({ token: TOKEN, ...params }, store, env);
  return { store, env, call };
}

function ingest(ctx, sms, receivedAt) {
  return ctx.call({ action: 'ingest', sms, received_at: receivedAt });
}

describe('health check, auth and routing', () => {
  it('no action returns the health check without a token', () => {
    const { store, env } = setup();
    expect(handleRequest({}, store, env)).toEqual({ ok: true, service: 'iqtifaa' });
  });

  it('wrong or missing token is unauthorized and nothing is written', () => {
    const ctx = setup();
    const { store, env } = ctx;
    expect(handleRequest({ action: 'ingest', sms: SNB_SMS, token: 'wrong' }, store, env))
      .toEqual({ ok: false, error: 'unauthorized' });
    expect(handleRequest({ action: 'ingest', sms: UNKNOWN_SMS }, store, env))
      .toEqual({ ok: false, error: 'unauthorized' });
    expect(handleRequest({ action: 'categorize', id: 'x', category: 'Coffee', token: 'wrong' }, store, env))
      .toEqual({ ok: false, error: 'unauthorized' });
    expect(store.rows('Transactions')).toHaveLength(0);
    expect(store.rows('ParseErrors')).toHaveLength(0);
  });

  it('unknown action is rejected', () => {
    const { call } = setup();
    expect(call({ action: 'nope' })).toEqual({ ok: false, error: 'unknown_action' });
  });

  it('ingest without sms is a bad request', () => {
    const { call } = setup();
    expect(call({ action: 'ingest', sms: '   ' })).toEqual({ ok: false, error: 'bad_request' });
  });
});

describe('ingest', () => {
  it('SNB sample is stored as pending and asks for a category', () => {
    const ctx = setup();
    const res = ingest(ctx, SNB_SMS, NOW);
    const rows = ctx.store.rows('Transactions');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      received_at: NOW,
      txn_at: '2026-11-03T18:50:00+03:00',
      type: 'purchase',
      direction: 'out',
      amount: 14,
      currency: 'SAR',
      amount_sar: 14,
      merchant_raw: 'khush sha',
      merchant: 'KHUSH SHA',
      card_last4: '1111',
      payment_method: 'Mada Apple Pay',
      bank: 'snb',
      category: '',
      note: '',
      status: 'pending',
      cycle: '2026-10',
      raw_sms: SNB_SMS,
    });
    expect(rows[0].dedupe_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(rows[0].id).toMatch(/^t_[a-z0-9]{6}$/);
    expect(res).toEqual({
      ok: true,
      ignored: false,
      txn: { id: rows[0].id, type: 'purchase', amount: 14, currency: 'SAR', merchant: 'KHUSH SHA' },
      status: 'pending',
      ask: true,
      suggested_category: null,
      categories: [...STARTER_NAMES, 'Uncategorized'],
      prompt: '14 SAR at KHUSH SHA — what was this for?',
      message: '14 SAR at KHUSH SHA',
    });
  });

  it('Al Rajhi sample strips the bidi mark and parses the date line', () => {
    const ctx = setup();
    const res = ingest(ctx, ALRAJHI_SMS, NOW);
    const [row] = ctx.store.rows('Transactions');
    expect(row).toMatchObject({
      txn_at: '2026-11-03T18:31:00+03:00',
      type: 'purchase',
      direction: 'out',
      amount: 81.6,
      currency: 'SAR',
      amount_sar: 81.6,
      merchant_raw: 'S175 Tami',
      merchant: 'TAMI',
      card_last4: '2222',
      payment_method: 'Mada Apple Pay',
      bank: 'alrajhi',
      status: 'pending',
      cycle: '2026-10',
      raw_sms: ALRAJHI_SMS.replace('؜', ''),
    });
    expect(res).toMatchObject({
      ok: true,
      ask: true,
      prompt: '81.60 SAR at TAMI — what was this for?',
      message: '81.60 SAR at TAMI',
    });
  });

  it('Barq sample keeps the USD amount, SAR equivalent and drops balance and account lines', () => {
    const ctx = setup();
    const res = ingest(ctx, BARQ_SMS, NOW);
    const [row] = ctx.store.rows('Transactions');
    expect(row).toMatchObject({
      txn_at: '2026-10-03T20:32:00+03:00',
      type: 'online',
      direction: 'out',
      amount: 6.9,
      currency: 'USD',
      amount_sar: 25.91,
      merchant: 'OPENAI',
      card_last4: '3333',
      payment_method: 'Visa online',
      bank: 'barq',
      status: 'pending',
      cycle: '2026-09',
      raw_sms: [
        'Online Purchase', 'VISA card **3333', 'Amount 6.9 USD (25.91 SAR)', 'At OPENAI', '2026-10-03 20:32',
      ].join('\n'),
    });
    expect(res).toMatchObject({
      ok: true,
      ask: true,
      prompt: '6.90 USD at OPENAI — what was this for?',
      message: '6.90 USD at OPENAI',
    });
  });

  it('the same SMS within 10 minutes returns the existing row with duplicate true', () => {
    const ctx = setup();
    const first = ingest(ctx, SNB_SMS, NOW);
    const second = ingest(ctx, SNB_SMS, '2026-11-03T19:05:00+03:00');
    expect(second).toMatchObject({ ok: true, duplicate: true, txn: { id: first.txn.id }, ask: false, prompt: '' });
    expect(ctx.store.rows('Transactions')).toHaveLength(1);
  });

  it('the same SMS 11 minutes later is stored again', () => {
    const ctx = setup();
    const first = ingest(ctx, SNB_SMS, NOW);
    const second = ingest(ctx, SNB_SMS, LATER);
    expect(second.duplicate).toBeUndefined();
    expect(second.txn.id).not.toBe(first.txn.id);
    expect(ctx.store.rows('Transactions')).toHaveLength(2);
  });

  it('two different SMS arriving at the same moment both get stored', () => {
    const ctx = setup();
    const a = ingest(ctx, SNB_SMS, NOW);
    const b = ingest(ctx, ALRAJHI_SMS, NOW);
    const rows = ctx.store.rows('Transactions');
    expect(rows).toHaveLength(2);
    expect(a.txn.id).not.toBe(b.txn.id);
  });

  it('OTP messages are ignored and nothing is written', () => {
    const ctx = setup();
    const res = ingest(ctx, 'Your OTP is 482913. Do not share it. 45 SAR purchase at STORE');
    expect(res).toEqual({ ok: true, ignored: true, ask: false, reason: 'otp' });
    expect(ctx.store.rows('Transactions')).toHaveLength(0);
    expect(ctx.store.rows('ParseErrors')).toHaveLength(0);
  });

  it('an unreadable SMS lands in ParseErrors and is not asked about', () => {
    const ctx = setup();
    const res = ingest(ctx, UNKNOWN_SMS, NOW);
    expect(res).toEqual({
      ok: true,
      ignored: false,
      ask: false,
      parsed: false,
      message: "Couldn't read this bank SMS. It's waiting in the dashboard inbox.",
    });
    const errors = ctx.store.rows('ParseErrors');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      received_at: NOW,
      raw_sms: UNKNOWN_SMS,
      error: 'no_parser',
      status: 'open',
    });
    expect(errors[0].id).toMatch(/^e_/);
    expect(ctx.store.rows('Transactions')).toHaveLength(0);
  });

  it('credit SMS is stored as income and never asks', () => {
    const ctx = setup();
    const res = ingest(ctx, 'TEST-CREDIT Acme payroll');
    expect(res).toMatchObject({
      ok: true,
      ask: false,
      status: 'auto',
      message: 'Received 5,000 SAR',
      txn: { amount: 5000, merchant: 'ACME PAYROLL' },
    });
    expect(ctx.store.rows('Transactions')[0]).toMatchObject({ direction: 'in', category: 'Income', status: 'auto' });
  });

  it('refund SMS takes the category of the latest categorized purchase at that merchant', () => {
    const ctx = setup();
    ctx.call({ action: 'create', fields: { amount: 20, merchant_raw: 'Starbucks', category: 'Coffee' } });
    const res = ingest(ctx, 'TEST-REFUND STARBUCKS');
    expect(res).toMatchObject({
      ok: true,
      ask: false,
      status: 'auto',
      message: 'Refund 45 SAR from STARBUCKS',
    });
    expect(ctx.store.rows('Transactions')[1]).toMatchObject({ direction: 'in', category: 'Coffee', status: 'auto' });
  });

  it('refund SMS with no earlier purchase stays pending and does not ask', () => {
    const ctx = setup();
    const res = ingest(ctx, 'TEST-REFUND NEWSHOP');
    expect(res).toMatchObject({ ok: true, ask: false, status: 'pending', message: 'Refund 45 SAR from NEWSHOP' });
    expect(ctx.store.rows('Transactions')[0]).toMatchObject({ category: '', status: 'pending' });
  });
});

describe('categorize', () => {
  it('sets the category and returns the budget for the cycle', () => {
    const ctx = setup();
    const a = ingest(ctx, SNB_SMS, NOW);
    const res = ctx.call({ action: 'categorize', id: a.txn.id, category: 'Coffee', note: 'latte' });
    expect(res).toEqual({
      ok: true,
      budget: { category: 'Coffee', spent: 14, budget: 300, pct: 0.05 },
    });
    expect(ctx.store.rows('Transactions')[0]).toMatchObject({ status: 'categorized', category: 'Coffee', note: 'latte' });
  });

  it('adds an alert at 80% of the budget', () => {
    const ctx = setup();
    ctx.call({ action: 'create', fields: { amount: 250, merchant_raw: 'Cafe X', category: 'Coffee' } });
    const a = ingest(ctx, SNB_SMS, NOW);
    const res = ctx.call({ action: 'categorize', id: a.txn.id, category: 'Coffee' });
    expect(res.budget).toEqual({ category: 'Coffee', spent: 264, budget: 300, pct: 0.88 });
    expect(res.alert).toBe('Coffee: 88% of budget used');
  });

  it('adds an over-budget alert at 100% or more', () => {
    const ctx = setup();
    ctx.call({ action: 'create', fields: { amount: 1700, merchant_raw: 'Big Restaurant', category: 'Food & Restaurants' } });
    const a = ingest(ctx, SNB_SMS, NOW);
    const res = ctx.call({ action: 'categorize', id: a.txn.id, category: 'Food & Restaurants' });
    expect(res.alert).toBe('Food & Restaurants: over budget (114%)');
  });

  it('Uncategorized does not learn a merchant rule', () => {
    const ctx = setup();
    const a = ingest(ctx, SNB_SMS, NOW);
    const res = ctx.call({ action: 'categorize', id: a.txn.id, category: 'Uncategorized' });
    expect(res.ok).toBe(true);
    expect(ctx.store.rows('MerchantRules')).toHaveLength(0);
    expect(ctx.store.rows('Transactions')[0].status).toBe('categorized');
  });

  it('an unknown category is a bad request and an unknown id is not found', () => {
    const ctx = setup();
    const a = ingest(ctx, SNB_SMS, NOW);
    expect(ctx.call({ action: 'categorize', id: a.txn.id, category: 'Nope' })).toEqual({ ok: false, error: 'bad_request' });
    expect(ctx.call({ action: 'categorize', id: 't_missing', category: 'Coffee' })).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('merchant learning and auto categories', () => {
  it('three consistent answers make the merchant auto; the next SMS is filed automatically', () => {
    const ctx = setup();
    const times = [NOW, LATER, '2026-11-03T19:22:00+03:00', '2026-11-03T19:33:00+03:00'];
    for (let i = 0; i < 3; i++) {
      const r = ingest(ctx, SNB_SMS, times[i]);
      ctx.call({ action: 'categorize', id: r.txn.id, category: 'Coffee' });
    }
    const rule = ctx.store.rows('MerchantRules').find((r) => r.merchant === 'KHUSH SHA' && r.category === 'Coffee');
    expect(rule).toMatchObject({ hits: 3, auto: true });

    const res = ingest(ctx, SNB_SMS, times[3]);
    expect(res).toMatchObject({
      ok: true,
      ask: false,
      status: 'auto',
      message: `${COFFEE_EMOJI} 14 SAR at KHUSH SHA → Coffee (auto)`,
    });
    expect(ctx.store.rows('Transactions')[3]).toMatchObject({ category: 'Coffee', status: 'auto' });
  });

  it('re-categorizing an auto merchant resets its rule', () => {
    const ctx = setup();
    const times = [NOW, LATER, '2026-11-03T19:22:00+03:00', '2026-11-03T19:33:00+03:00'];
    for (let i = 0; i < 3; i++) {
      const r = ingest(ctx, SNB_SMS, times[i]);
      ctx.call({ action: 'categorize', id: r.txn.id, category: 'Coffee' });
    }
    const auto = ingest(ctx, SNB_SMS, times[3]);
    expect(auto.status).toBe('auto');

    ctx.call({ action: 'update', id: auto.txn.id, fields: { category: 'Food & Restaurants' } });

    const rules = ctx.store.rows('MerchantRules');
    expect(rules.find((r) => r.category === 'Coffee')).toMatchObject({ hits: 0, auto: false });
    expect(rules.find((r) => r.category === 'Food & Restaurants')).toMatchObject({ hits: 1, auto: false });

    const next = ingest(ctx, SNB_SMS, '2026-11-03T19:44:00+03:00');
    expect(next).toMatchObject({ ask: true, status: 'pending', suggested_category: 'Food & Restaurants' });
  });
});

describe('update', () => {
  it('amount also sets amount_sar for SAR', () => {
    const ctx = setup();
    const a = ingest(ctx, SNB_SMS, NOW);
    const res = ctx.call({ action: 'update', id: a.txn.id, fields: { amount: 20 } });
    expect(res.ok).toBe(true);
    expect(res.txn).toMatchObject({ amount: 20, amount_sar: 20 });
    expect(ctx.store.rows('Transactions')[0]).toMatchObject({ amount: 20, amount_sar: 20 });
  });

  it('changing txn_at recomputes the cycle', () => {
    const ctx = setup();
    const a = ingest(ctx, SNB_SMS, NOW);
    ctx.call({ action: 'update', id: a.txn.id, fields: { txn_at: '2026-10-26T23:59:00+03:00' } });
    expect(ctx.store.rows('Transactions')[0]).toMatchObject({ txn_at: '2026-10-26T23:59:00+03:00', cycle: '2026-09' });
  });

  it('display_name creates a merchant rule and is used in later prompts', () => {
    const ctx = setup();
    const a = ingest(ctx, SNB_SMS, NOW);
    const res = ctx.call({ action: 'update', id: a.txn.id, fields: { display_name: 'Khush Shawarma' } });
    expect(res.txn.display_name).toBe('Khush Shawarma');
    expect(ctx.store.rows('MerchantRules')).toEqual([
      expect.objectContaining({ merchant: 'KHUSH SHA', display_name: 'Khush Shawarma', category: '', hits: 0, auto: false }),
    ]);
    const next = ingest(ctx, SNB_SMS, '2026-11-03T19:30:00+03:00');
    expect(next.prompt).toBe('14 SAR at Khush Shawarma — what was this for?');
  });

  it('status can be set to ignored; an invalid status is a bad request', () => {
    const ctx = setup();
    const a = ingest(ctx, SNB_SMS, NOW);
    expect(ctx.call({ action: 'update', id: a.txn.id, fields: { status: 'ignored' } }).txn.status).toBe('ignored');
    expect(ctx.call({ action: 'update', id: a.txn.id, fields: { status: 'auto' } })).toEqual({ ok: false, error: 'bad_request' });
  });

  it('an unknown id is not found', () => {
    const { call } = setup();
    expect(call({ action: 'update', id: 't_missing', fields: { note: 'x' } })).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('create, parse errors', () => {
  it('manual transaction is categorized when a category is given', () => {
    const ctx = setup();
    const res = ctx.call({
      action: 'create',
      fields: { amount: 45, merchant_raw: 'starbucks', category: 'Coffee', note: 'latte' },
    });
    expect(res.ok).toBe(true);
    expect(res.txn).toMatchObject({
      bank: 'manual',
      type: 'purchase',
      direction: 'out',
      amount: 45,
      currency: 'SAR',
      amount_sar: 45,
      merchant_raw: 'starbucks',
      merchant: 'STARBUCKS',
      status: 'categorized',
      category: 'Coffee',
      note: 'latte',
      received_at: NOW,
      txn_at: NOW,
      cycle: '2026-10',
      dedupe_hash: '',
      raw_sms: '',
    });
  });

  it('manual transaction without a category is pending', () => {
    const ctx = setup();
    const res = ctx.call({ action: 'create', fields: { amount: 30, merchant_raw: 'Bakery' } });
    expect(res.txn).toMatchObject({ status: 'pending', category: '' });
  });

  it('create with error_id resolves that parse error', () => {
    const ctx = setup();
    ingest(ctx, UNKNOWN_SMS, NOW);
    const [err] = ctx.store.rows('ParseErrors');
    const res = ctx.call({ action: 'create', fields: { amount: 30, merchant_raw: 'Bakery' }, error_id: err.id });
    expect(res.ok).toBe(true);
    expect(ctx.store.rows('ParseErrors')[0].status).toBe('resolved');
  });

  it('create with an invalid amount is a bad request', () => {
    const { call } = setup();
    expect(call({ action: 'create', fields: { amount: 0, merchant_raw: 'x' } })).toEqual({ ok: false, error: 'bad_request' });
  });

  it('dismiss_error marks the parse error dismissed; unknown id is not found', () => {
    const ctx = setup();
    ingest(ctx, UNKNOWN_SMS, NOW);
    const [err] = ctx.store.rows('ParseErrors');
    expect(ctx.call({ action: 'dismiss_error', id: err.id })).toEqual({ ok: true });
    expect(ctx.store.rows('ParseErrors')[0].status).toBe('dismissed');
    expect(ctx.call({ action: 'dismiss_error', id: 'e_missing' })).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('settings and config', () => {
  it('config returns settings without the api token and typed categories', () => {
    const { call } = setup();
    const res = call({ action: 'config' });
    expect(res.ok).toBe(true);
    expect(res.settings).toMatchObject({ savings_target: 3000, cycle_start_day: 27, currency: 'SAR' });
    expect(res.settings).not.toHaveProperty('api_token');
    expect(res.categories).toHaveLength(STARTER_CATEGORIES.length);
    expect(res.categories[0]).toMatchObject({ name: 'Food & Restaurants', monthly_budget: 1500, active: true });
  });

  it('scalar settings update the Settings rows and return config', () => {
    const ctx = setup();
    const res = ctx.call({ action: 'settings', savings_target: 4000 });
    expect(res.settings.savings_target).toBe(4000);
    expect(res.categories).toHaveLength(STARTER_CATEGORIES.length);
    expect(ctx.store.rows('Settings').find((s) => s.key === 'savings_target').value).toBe('4000');
  });

  it('a missing scalar setting is appended', () => {
    const ctx = setup({ Settings: [] });
    ctx.call({ action: 'settings', savings_target: 4000 });
    expect(ctx.store.rows('Settings')).toEqual([{ key: 'savings_target', value: '4000' }]);
  });

  it('cycle_start_day must be 1 to 31', () => {
    const ctx = setup();
    expect(ctx.call({ action: 'settings', cycle_start_day: 0 })).toEqual({ ok: false, error: 'bad_request' });
    expect(ctx.call({ action: 'settings', cycle_start_day: 32 })).toEqual({ ok: false, error: 'bad_request' });
    expect(ctx.store.rows('Settings').find((s) => s.key === 'cycle_start_day').value).toBe('27');
  });

  it('changing cycle_start_day recomputes the cycle of every transaction', () => {
    const ctx = setup();
    ingest(ctx, SNB_SMS, NOW);
    ingest(ctx, BARQ_SMS, NOW);
    ctx.call({ action: 'settings', cycle_start_day: 1 });
    const rows = ctx.store.rows('Transactions');
    expect(rows.find((t) => t.merchant === 'KHUSH SHA').cycle).toBe('2026-11');
    expect(rows.find((t) => t.merchant === 'OPENAI').cycle).toBe('2026-10');
  });

  it('budgets update Categories.monthly_budget', () => {
    const ctx = setup();
    ctx.call({ action: 'settings', budgets: { Coffee: 350 } });
    expect(ctx.store.rows('Categories').find((c) => c.name === 'Coffee').monthly_budget).toBe(350);
  });

  it('a new category is appended after the highest sort', () => {
    const ctx = setup();
    const res = ctx.call({
      action: 'settings',
      categories: [{ name: 'Pets', emoji: '🐶', monthly_budget: 200, kind: 'want' }],
    });
    expect(res.categories).toHaveLength(STARTER_CATEGORIES.length + 1);
    expect(ctx.store.rows('Categories').find((c) => c.name === 'Pets')).toEqual({
      name: 'Pets', emoji: '🐶', monthly_budget: 200, kind: 'want', active: true, sort: STARTER_CATEGORIES.length + 1,
    });
  });

  it('rename_from renames the category in Categories, Transactions and MerchantRules', () => {
    const ctx = setup();
    const a = ingest(ctx, SNB_SMS, NOW);
    ctx.call({ action: 'categorize', id: a.txn.id, category: 'Food & Restaurants' });
    ctx.call({ action: 'settings', categories: [{ name: 'Dining', rename_from: 'Food & Restaurants' }] });

    const cats = ctx.store.rows('Categories');
    expect(cats.some((c) => c.name === 'Food & Restaurants')).toBe(false);
    expect(cats.find((c) => c.name === 'Dining')).toMatchObject({ monthly_budget: 1500 });
    expect(ctx.store.rows('Transactions')[0].category).toBe('Dining');
    expect(ctx.store.rows('MerchantRules').find((r) => r.merchant === 'KHUSH SHA').category).toBe('Dining');
  });
});

describe('summary', () => {
  it('defaults to the current cycle and counts only that cycle', () => {
    const ctx = setup();
    ingest(ctx, SNB_SMS, NOW);
    ingest(ctx, ALRAJHI_SMS, NOW);
    ingest(ctx, BARQ_SMS, NOW);
    const res = ctx.call({ action: 'summary' });
    expect(res.ok).toBe(true);
    expect(res.cycle).toBe('2026-10');
    expect(res.totals.count).toBe(2);
    expect(res.totals.spent).toBeCloseTo(95.6);

    const previous = ctx.call({ action: 'summary', cycle: '2026-09' });
    expect(previous.totals.count).toBe(1);
    expect(previous.totals.spent).toBeCloseTo(25.91);
  });
});

describe('transactions and pending_count', () => {
  function seeded() {
    const ctx = setup();
    const snb = ingest(ctx, SNB_SMS, NOW);
    ingest(ctx, ALRAJHI_SMS, NOW);
    ingest(ctx, BARQ_SMS, NOW);
    ingest(ctx, UNKNOWN_SMS, NOW);
    ctx.call({ action: 'categorize', id: snb.txn.id, category: 'Food & Restaurants' });
    return ctx;
  }

  it('lists transactions newest first with open parse errors', () => {
    const ctx = seeded();
    const res = ctx.call({ action: 'transactions' });
    expect(res.ok).toBe(true);
    expect(res.transactions.map((t) => t.merchant)).toEqual(['KHUSH SHA', 'TAMI', 'OPENAI']);
    expect(res.transactions[0]).toHaveProperty('display_name');
    expect(res.parse_errors).toHaveLength(1);
    expect(res.parse_errors[0]).toMatchObject({ raw_sms: UNKNOWN_SMS, status: 'open' });
  });

  it('filters by status, cycle and q', () => {
    const ctx = seeded();
    const merchants = (params) => ctx.call({ action: 'transactions', ...params }).transactions.map((t) => t.merchant);
    expect(merchants({ status: 'pending' })).toEqual(['TAMI', 'OPENAI']);
    expect(merchants({ cycle: '2026-09' })).toEqual(['OPENAI']);
    expect(merchants({ q: 'tami' })).toEqual(['TAMI']);
    expect(merchants({ q: 'OPENAI' })).toEqual(['OPENAI']);
    expect(merchants({ q: 'food' })).toEqual(['KHUSH SHA']);
  });

  it('pending_count is pending transactions plus open parse errors', () => {
    const ctx = seeded();
    // seeded(): SNB is categorized, TAMI and OPENAI are pending, one parse error is open.
    expect(ctx.call({ action: 'pending_count' })).toEqual({ ok: true, count: 3 });
    const tami = ctx.store.rows('Transactions').find((t) => t.merchant === 'TAMI');
    ctx.call({ action: 'categorize', id: tami.id, category: 'Groceries' });
    expect(ctx.call({ action: 'pending_count' })).toEqual({ ok: true, count: 2 });
  });
});

describe('memory store', () => {
  it('rows() returns copies so callers cannot change storage', () => {
    const store = createMemoryStore({ Settings: [{ key: 'a', value: '1' }] });
    const [row] = store.rows('Settings');
    row.value = 'changed';
    expect(store.rows('Settings')[0].value).toBe('1');
  });
});
