# Contract: core helpers (`src/core/`)

Same module rules as the parser (named exports, single-line imports, unique top-level names, only `function` declarations and `const` literals at top level). Time zone is Asia/Riyadh = fixed UTC+3, no DST. All money is rounded with `round2`.

## `settings.js`
```js
export const TAB_HEADERS = {
  Transactions: ['id','received_at','txn_at','type','direction','amount','currency','amount_sar','merchant_raw','merchant','card_last4','payment_method','bank','category','note','status','cycle','dedupe_hash','raw_sms'],
  Categories: ['name','emoji','monthly_budget','kind','active','sort'],
  MerchantRules: ['merchant','display_name','category','hits','auto','updated_at'],
  Settings: ['key','value'],
  ParseErrors: ['id','received_at','raw_sms','error','status'],
};
export const DEFAULT_SETTINGS = { currency: 'SAR', cycle_start_day: 27, savings_target: 3000, alert_threshold: 0.8, auto_threshold: 3, timezone: 'Asia/Riyadh' };
export const STARTER_CATEGORIES = [ /* 14 rows {name, emoji, monthly_budget, kind, active: true, sort} in Plan.md §3 order:
  Food & Restaurants 🍔 1500 want, Coffee ☕ 300 want, Groceries 🛒 2000 need, Fuel & Car ⛽ 600 need, Transport 🚕 300 need,
  Shopping 🛍️ 800 want, Bills & Subscriptions 🧾 900 need, Health 💊 300 need, Family 👨‍👩‍👧 1000 need, Home 🏠 500 need,
  Entertainment 🎬 400 want, Travel ✈️ 0 want, Gifts & Charity 🎁 300 want, Other 📦 300 want */ ];
```
- `readSettings(rows) -> settings`: rows are `{key, value}`; returns `DEFAULT_SETTINGS` overlaid with the rows, numeric keys coerced with `Number`. Unknown keys are kept as strings. The key `api_token` is never returned.
- `isTruthy(v) -> boolean`: `true`, `'TRUE'`, `'true'`, `1`, `'1'` → true.
- `activeCategories(rows) -> rows`: `active` truthy, sorted by `Number(sort)` then name; `monthly_budget` coerced to number (blank → 0).

## `format.js`
- `round2(n) -> number`.
- `formatAmount(n) -> string`: thousands commas; integers without decimals, otherwise exactly 2 decimals. `14` → `"14"`, `81.6` → `"81.60"`, `1250.5` → `"1,250.50"`.
- `formatMoney(n, currency) -> string`: `"81.60 SAR"`.

## `cycle.js`
A cycle starts on `cycle_start_day` (clamped to the month's last day) at 00:00 Riyadh time and is labelled `YYYY-MM` by the month it starts in.
- `riyadhDate(iso) -> 'YYYY-MM-DD'`: the Riyadh calendar date of any ISO string (`Z` or offset).
- `cycleStartDate(year, month, startDay) -> 'YYYY-MM-DD'` (month 1–12, clamped).
- `cycleLabel(iso, startDay) -> 'YYYY-MM'`. With startDay 27: `2026-11-03T18:50:00+03:00` → `2026-10`; `2026-10-26T23:59:00+03:00` → `2026-09`; `2026-10-27T00:00:00+03:00` → `2026-10`; `2026-10-26T22:00:00Z` (= 27th 01:00 Riyadh) → `2026-10`.
- `cycleBounds(label, startDay) -> {start, end}`: dates, `end` exclusive = next cycle's start. `('2026-10', 27)` → `{start:'2026-10-27', end:'2026-11-27'}`. `('2027-01', 31)` → `{start:'2027-01-31', end:'2027-02-28'}`.
- `shiftCycle(label, delta) -> label`: `('2026-01', -1)` → `'2025-12'`.
- `daysBetween(a, b) -> integer`: whole days from date `a` to date `b` (`YYYY-MM-DD`).
- `daysLeft(nowIso, label, startDay) -> integer`: days from today (inclusive) to `end` (exclusive), 0 if the cycle is over, the full length if it has not started.

## `hash.js`
- `hashText(text) -> string`: deterministic 16-char lowercase hex (e.g. cyrb53 run with two seeds). Pure JS, no crypto API.
- `makeId(prefix, random) -> string`: `prefix + '_' + 6 chars of [a-z0-9]` drawn with `random()` (a `Math.random`-like function passed in).
- `safeEqual(a, b) -> boolean`: constant-time string compare (always loops over the longer length); false if either is not a non-empty string.

## `rules.js`
Rule row: `{ merchant, display_name, category, hits, auto, updated_at }` (values from the sheet may be strings: coerce `hits` with `Number`, `auto` with `isTruthy`).
- `merchantRules(rules, merchant) -> rows` for that merchant.
- `suggestCategory(rules, merchant) -> string|null`: the row with `category` set and the most hits (> 0); ties → latest `updated_at`.
- `autoCategory(rules, merchant) -> string|null`: category of a row with `auto` truthy and a category.
- `displayNameFor(rules, merchant) -> string|null`: first non-empty `display_name` among the merchant's rows.
- `learnRule(rules, merchant, category, nowIso, threshold) -> rows`: returns the merchant's complete rows after one manual categorization (the caller upserts them by `(merchant, category)`):
  - every other category row of this merchant: `hits = 0`, `auto = false` (a different answer breaks the streak and resets auto);
  - the chosen row (created if missing): `hits + 1`, `auto = hits >= threshold`, `updated_at = nowIso`;
  - `display_name` copied from `displayNameFor` onto every returned row.
  - Rows with an empty `category` (display-name-only rows) are returned unchanged.
  Example, threshold 3: three `Coffee` answers → hits 3, auto true. Then one `Food & Restaurants` answer → Coffee `{hits:0, auto:false}`, Food `{hits:1, auto:false}`.

## `summary.js`
- `spendAmount(txn) -> number`: `amount_sar` if it is a finite number (or numeric string); else `amount` when `currency` is `SAR`; else 0.
- `budgetStatus(spent, budget, threshold) -> {pct, state}`: `budget > 0` → `pct = round2(spent / budget)`, `state = pct >= 1 ? 'over' : pct >= threshold ? 'warn' : 'ok'`; `budget <= 0` → `{pct: null, state: 'ok'}`.
- `computeSummary({ transactions, categories, rules, settings, cycle, nowIso, parseErrors }) -> Summary`. Only transactions with `cycle === cycle` and `status !== 'ignored'` count.
  - `direction 'out'` → spent (in its category; blank category → `uncategorized`).
  - `type 'refund'` → refunds; subtracted from its category and from `net_spent`.
  - `type 'credit'` (other `direction 'in'` too, except refunds) → income.
```js
{
  cycle: '2026-10', start: '2026-10-27', end: '2026-11-27', days_total: 31, days_left: 24, currency: 'SAR',
  totals: { spent, refunds, net_spent, income, uncategorized, count },   // count = counted out transactions
  savings: { target, safe_to_spend, per_day },   // safe = income - target - net_spent; per_day = days_left > 0 ? max(0, safe) / days_left : 0
  categories: [{ name, emoji, kind, budget, spent, pct, state }],        // active categories in sort order, plus any inactive one that has spend
  top_merchants: [{ merchant, display_name, total, count }],             // top 10 by total, display_name may be null
  daily: [{ date, spent }],                                              // every date from start to min(end - 1 day, today)
  needs_wants: { need, want, other },                                    // by the category's kind; other = blank or unknown category
  history: [{ cycle, total, categories: { [name]: spent } }],            // the 3 cycles before `cycle`, oldest first
  recurring: [{ merchant, display_name, amount, cycles }],               // detectRecurring
  pending_count, parse_error_count                                       // pending txns in any cycle; parseErrors with status 'open'
}
```
- `detectRecurring(transactions, rules, cycle) -> rows`: out transactions (not ignored) in `cycle` and the 3 cycles before it, grouped by merchant; a merchant is recurring if it appears in at least 2 different cycles and every charge is within ±10% of the median charge. `amount` = median, `cycles` = sorted labels. Sorted by amount desc.

## `report.js`
- `monthlyReport(summary, previous) -> {subject, text}`: subject `Iqtifaa: cycle 2026-10 summary`. Text lines: total spent, income, saved vs target, top 3 categories, the category with the biggest increase vs `previous` (skip when `previous` is null). Plain text, no emoji.
- `weeklyNudge(summary) -> {subject, text}`: spent so far, safe to spend, per-day pace, days left.
- `healthWarning(transactions, nowIso) -> string|null`: if the newest `received_at` is more than 5 days before `nowIso` and there were at least 10 transactions in the 30 days before that newest one, return a warning sentence; else null.
