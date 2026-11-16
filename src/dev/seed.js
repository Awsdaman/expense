import { TAB_HEADERS, STARTER_CATEGORIES, DEFAULT_SETTINGS } from '../core/settings.js';
import { cycleLabel } from '../core/cycle.js';
import { hashText } from '../core/hash.js';
import { round2 } from '../core/format.js';

const SEED_HOUR_MS = 3600000;
const SEED_MINUTE_MS = 60000;
const SEED_DAY_MS = 86400000;
const SEED_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

const SEED_CARDS = {
  'Mada Apple Pay': { last4: '2222', bank: 'alrajhi' },
  'Mada card': { last4: '1111', bank: 'snb' },
  'Visa online': { last4: '3333', bank: 'barq' },
};

// Everyday merchants, drawn by weight. hits/display mirror the MerchantRules rows.
const SEED_SPENDING = [
  { merchant: 'TAMI', raws: ['S175 Tami', 'S142 TAMI', 'S201 Tami'], category: 'Groceries', type: 'purchase', methods: ['Mada Apple Pay', 'Mada card'], min: 80, max: 450, weight: 3, hits: 14, display: 'Tamimi Markets' },
  { merchant: 'ALDREES', raws: ['ALDREES 214', 'ALDREES 087'], category: 'Fuel & Car', type: 'purchase', methods: ['Mada Apple Pay', 'Mada card'], min: 60, max: 150, weight: 2, hits: 9, display: 'Aldrees Petrol' },
  { merchant: 'STARBUCKS', raws: ['S412 STARBUCKS', 'STARBUCKS 1123'], category: 'Coffee', type: 'purchase', methods: ['Mada Apple Pay'], min: 14, max: 28, weight: 3, hits: 6, display: 'Starbucks' },
  { merchant: 'BARNS', raws: ['BARNS COFFEE'], category: 'Coffee', type: 'purchase', methods: ['Mada card'], min: 14, max: 24, weight: 1, hits: 2, display: '' },
  { merchant: 'HUNGERSTATION', raws: ['HUNGERSTATION'], category: 'Food & Restaurants', type: 'online', methods: ['Visa online'], min: 35, max: 120, weight: 2, hits: 5, display: 'HungerStation' },
  { merchant: 'JAHEZ', raws: ['JAHEZ.COM'], category: 'Food & Restaurants', type: 'online', methods: ['Visa online'], min: 35, max: 120, weight: 1, hits: 2, display: '' },
  { merchant: 'NOON', raws: ['NOON.COM'], category: 'Shopping', type: 'online', methods: ['Visa online'], min: 40, max: 600, weight: 1, hits: 2, display: '' },
  { merchant: 'AMAZON.SA', raws: ['AMAZON.SA'], category: 'Shopping', type: 'online', methods: ['Visa online'], min: 30, max: 500, weight: 1, hits: 1, display: '' },
  { merchant: 'CAREEM', raws: ['CAREEM RIDE'], category: 'Transport', type: 'purchase', methods: ['Mada Apple Pay'], min: 18, max: 70, weight: 2, hits: 7, display: 'Careem' },
  { merchant: 'NAHDI', raws: ['NAHDI PHARMACY 33'], category: 'Health', type: 'purchase', methods: ['Mada card'], min: 25, max: 180, weight: 1, hits: 4, display: 'Nahdi Pharmacy' },
];

// Fixed monthly charges, placed on a day of each calendar month.
const SEED_MONTHLY = [
  { merchant: 'STC', raws: ['STC BILL'], category: 'Bills & Subscriptions', type: 'online', methods: ['Mada card'], amount: 329, day: 9, hour: 10, hits: 4, display: 'STC' },
  { merchant: 'NETFLIX', raws: ['NETFLIX.COM'], category: 'Entertainment', type: 'online', methods: ['Visa online'], amount: 56.99, day: 14, hour: 2, hits: 4, display: 'Netflix' },
  { merchant: 'OPENAI', raws: ['OPENAI'], category: 'Bills & Subscriptions', type: 'online', methods: ['Visa online'], amount: 6.9, currency: 'USD', amountSar: 25.91, day: 3, hour: 3, hits: 3, display: 'OpenAI' },
];

// Unknown merchants, left pending for the inbox. Placed minutesAgo before "now".
const SEED_PENDING = [
  { merchant: 'SAHL', raws: ['SAHL 4412'], category: '', type: 'purchase', methods: ['Mada card'], amount: 15, minutesAgo: 40 },
  { merchant: 'KHUSH SHA', raws: ['KHUSH SHA'], category: '', type: 'purchase', methods: ['Mada Apple Pay'], amount: 62.5, minutesAgo: 25 },
  { merchant: 'PANDA', raws: ['PANDA 0231'], category: '', type: 'purchase', methods: ['Mada card'], amount: 184.3, minutesAgo: 9 },
];

function seedRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Parses a Riyadh ISO string into a UTC-based "wall clock" epoch (Riyadh local time as if UTC).
function seedWall(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

function seedFormat(wall) {
  return new Date(wall).toISOString().slice(0, 16) + ':00+03:00';
}

function seedRow(tab, obj) {
  const out = {};
  for (const h of TAB_HEADERS[tab]) out[h] = obj[h] === undefined ? '' : obj[h];
  return out;
}

export function buildSeed(nowIso) {
  const rng = seedRng(20261103);
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const seedId = (prefix) => prefix + '_' + Array.from({ length: 6 }, () => SEED_ALPHABET[Math.floor(rng() * SEED_ALPHABET.length)]).join('');

  const startDay = DEFAULT_SETTINGS.cycle_start_day;
  const nowWall = seedWall(nowIso);
  const now = new Date(nowWall);
  const todayWall = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  // Four cycles of history: the current cycle and the three before it.
  const currentCycleMonth = now.getUTCDate() >= startDay ? now.getUTCMonth() : now.getUTCMonth() - 1;
  const histStart = Date.UTC(now.getUTCFullYear(), currentCycleMonth - 3, startDay);

  const autoOf = (merchant) => {
    const hit = SEED_SPENDING.concat(SEED_MONTHLY).find((x) => x.merchant === merchant);
    return Boolean(hit && hit.hits >= 3);
  };
  const totalWeight = SEED_SPENDING.reduce((sum, m) => sum + m.weight, 0);
  const weightedPick = () => {
    let r = rng() * totalWeight;
    for (const m of SEED_SPENDING) {
      r -= m.weight;
      if (r < 0) return m;
    }
    return SEED_SPENDING[SEED_SPENDING.length - 1];
  };

  const makeSpend = (wall, m) => {
    const currency = m.currency || 'SAR';
    const amount = m.amount !== undefined ? m.amount : round2(m.min + rng() * (m.max - m.min));
    const amountSar = m.amountSar !== undefined ? m.amountSar : amount;
    const raw = pick(m.raws);
    const method = pick(m.methods);
    const card = SEED_CARDS[method];
    const rawSms = currency === 'SAR'
      ? `Purchase ${amount.toFixed(2)} SAR at ${raw} ${method} **${card.last4}`
      : `Online Purchase\nVISA card **${card.last4}\nAmount ${amount.toFixed(2)} ${currency} (${amountSar.toFixed(2)} SAR)\nAt ${raw}`;
    return {
      wall,
      type: m.type,
      direction: 'out',
      amount,
      currency,
      amountSar,
      raw,
      merchant: m.merchant,
      method,
      last4: card.last4,
      bank: card.bank,
      category: m.category,
      status: autoOf(m.merchant) ? 'auto' : 'categorized',
      rawSms,
    };
  };

  const drafts = [];
  for (let t = histStart, dayIdx = 0; t < todayWall; t += SEED_DAY_MS, dayIdx += 1) {
    const dom = new Date(t).getUTCDate();
    if (dom === startDay) {
      drafts.push({
        wall: t + 6 * SEED_HOUR_MS, type: 'credit', direction: 'in', amount: 18500, currency: 'SAR', amountSar: 18500,
        raw: 'SALARY', merchant: 'SALARY', method: '', last4: '', bank: 'snb', category: 'Income', status: 'auto',
        rawSms: 'Credit 18,500.00 SAR from SALARY',
      });
    }
    if (dayIdx === 40) {
      drafts.push({
        wall: t + 19 * SEED_HOUR_MS, type: 'refund', direction: 'in', amount: 89, currency: 'SAR', amountSar: 89,
        raw: 'NOON.COM', merchant: 'NOON', method: 'Visa online', last4: '3333', bank: 'barq', category: 'Shopping', status: 'auto',
        rawSms: 'Refund 89.00 SAR at NOON.COM Visa online **3333',
      });
    }
    for (const m of SEED_MONTHLY) {
      if (m.day === dom) drafts.push(makeSpend(t + m.hour * SEED_HOUR_MS, m));
    }
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i += 1) {
      const hour = 8 + Math.floor(rng() * 15);
      const minute = Math.floor(rng() * 60);
      drafts.push(makeSpend(t + hour * SEED_HOUR_MS + minute * SEED_MINUTE_MS, weightedPick()));
    }
  }

  for (const m of SEED_PENDING) {
    const d = makeSpend(nowWall - m.minutesAgo * SEED_MINUTE_MS, m);
    d.status = 'pending';
    drafts.push(d);
  }

  drafts.sort((a, b) => a.wall - b.wall);

  const Transactions = drafts.map((d) => seedRow('Transactions', {
    id: seedId('t'),
    received_at: seedFormat(d.wall),
    txn_at: seedFormat(d.wall),
    type: d.type,
    direction: d.direction,
    amount: d.amount,
    currency: d.currency,
    amount_sar: d.amountSar,
    merchant_raw: d.raw,
    merchant: d.merchant,
    card_last4: d.last4,
    payment_method: d.method,
    bank: d.bank,
    category: d.category,
    note: '',
    status: d.status,
    cycle: cycleLabel(seedFormat(d.wall), startDay),
    dedupe_hash: hashText(d.rawSms),
    raw_sms: d.rawSms,
  }));

  const lastWall = {};
  for (const d of drafts) {
    if (lastWall[d.merchant] === undefined || d.wall > lastWall[d.merchant]) lastWall[d.merchant] = d.wall;
  }
  const MerchantRules = SEED_SPENDING.concat(SEED_MONTHLY).map((m) => seedRow('MerchantRules', {
    merchant: m.merchant,
    display_name: m.display,
    category: m.category,
    hits: m.hits,
    auto: m.hits >= 3,
    updated_at: lastWall[m.merchant] === undefined ? seedFormat(nowWall) : seedFormat(lastWall[m.merchant]),
  }));
  // A competing answer for NOON that was tried once and then dropped: hits reset to 0.
  MerchantRules.push(seedRow('MerchantRules', {
    merchant: 'NOON', display_name: '', category: 'Gifts & Charity', hits: 0, auto: false, updated_at: seedFormat(nowWall),
  }));

  const Categories = STARTER_CATEGORIES.map((c) => seedRow('Categories', c));
  // Dev only: a tracking period that started 5 weeks ago, so Home and Insights have data to show.
  const trackStart = new Date(todayWall - 35 * SEED_DAY_MS).toISOString().slice(0, 10);
  const trackEnd = new Date(todayWall + 26 * SEED_DAY_MS).toISOString().slice(0, 10);
  const seedSettings = { ...DEFAULT_SETTINGS, tracking_start: trackStart, tracking_end: trackEnd };
  const Settings = Object.keys(seedSettings).map((key) => seedRow('Settings', { key, value: seedSettings[key] }));
  const ParseErrors = [seedRow('ParseErrors', {
    id: seedId('e'),
    received_at: seedFormat(nowWall - 3 * SEED_HOUR_MS),
    raw_sms: 'Dear customer, card **5678 was used for SAR 230.00 at [merchant redacted]. Available balance: [redacted].',
    error: 'no_parser',
    status: 'open',
  })];

  return { Transactions, Categories, MerchantRules, Settings, ParseErrors };
}
