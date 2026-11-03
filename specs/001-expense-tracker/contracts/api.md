# Contract: API (`src/core/api.js`) and adapters

## Entry point
```js
export function handleRequest(params, store, env) -> object   // always JSON-serializable
```
- `params`: merged query string (GET) or parsed JSON body (POST). Routing is by `params.action` only; the HTTP method does not matter.
- `env`: `{ token: string, nowIso: () => 'YYYY-MM-DDTHH:MM:SS+03:00', random: () => number }`.
- No `action` → `{ ok: true, service: 'iqtifaa' }` without a token check (Phase 0 health check).
- Any other action: `safeEqual(params.token, env.token)` must be true, else `{ ok: false, error: 'unauthorized' }` and nothing is read or written.
- Unknown action → `{ ok: false, error: 'unknown_action' }`. Missing/invalid inputs → `{ ok: false, error: 'bad_request' }`. Unknown id → `{ ok: false, error: 'not_found' }`.
- `handleRequest` does not catch exceptions; adapters catch and return `{ ok: false, error: 'server_error' }` without details.

## Store interface (header-keyed, implemented by `SheetStore` and `createMemoryStore`)
```js
store.rows(tab) -> object[]          // one plain object per data row, keys = headers, empty cells = ''
store.append(tab, obj)               // writes obj under the tab's headers; missing keys → ''; unknown keys ignored
store.update(tab, match, fields) -> number   // every row where String(row[k]) === String(match[k]) for all k in match gets fields; returns count
```
Tabs and headers: `TAB_HEADERS` in `src/core/settings.js`. Values written are strings, numbers or booleans. `amount`, `amount_sar`, `monthly_budget`, `hits`, `sort` are numbers; `active`, `auto` are booleans; everything else strings (including `card_last4`, `cycle`, dates).

## Actions

### `ingest` `{ token, sms, sender?, received_at? }`
1. `sms` must be a non-empty string.
2. `received = received_at || env.nowIso()`.
3. `parsed = parseSms(sms, { sender })`. `{ignored}` → `{ ok: true, ignored: true, ask: false, reason }`.
4. `hash = hashText(normalizeText(sms))`. A `Transactions` row with the same `dedupe_hash` and `received_at` within 10 minutes of `received` → return the ingest response for that row plus `duplicate: true` (no write).
5. `parsed === null` → append `ParseErrors` `{ id: makeId('e'), received_at, raw_sms: redactSms(sms), error: 'no_parser', status: 'open' }` → `{ ok: true, ignored: false, ask: false, parsed: false, message: "Couldn't read this bank SMS. It's waiting in the dashboard inbox." }`.
6. Row: `id makeId('t')`, `txn_at = parsed.txn_at || received`, `cycle = cycleLabel(txn_at, settings.cycle_start_day)`, `amount_sar` (`''` when null), `card_last4`/`payment_method` (`''` when null), `note ''`, `raw_sms = redactSms(sms)`, `dedupe_hash`.
7. Category and status:
   - `type 'credit'` (or any `direction 'in'` other than refund): `category 'Income'`, `status 'auto'`, `ask false`, message `Received 5,000 SAR`.
   - `type 'refund'`: category = latest non-ignored `out` transaction at the same merchant that has a category, else `suggestCategory`; `status 'auto'` when found else `'pending'`; `ask false`; message `Refund 45 SAR from STARBUCKS`.
   - out with `autoCategory` → `status 'auto'`, `ask false`, message `⛽ 120 SAR at ALDREES → Fuel & Car (auto)` (category emoji, then `formatMoney`, then display name or merchant).
   - otherwise `status 'pending'`, `ask true`, `suggested_category = suggestCategory(...)`.
8. Response:
Every ingest response carries the booleans `ignored` and `ask`, so the Shortcut can branch on them without "has any value" checks. A duplicate (step 4) always answers `ask: false` and `prompt: ''`: an automation that fires twice must not prompt twice.
```js
{ ok: true, ignored: false, txn: { id, type, amount, currency, merchant }, // merchant = display name or merchant
  status, ask, suggested_category,                       // string or null
  categories: ['Coffee', 'Food & Restaurants', ...],     // active names by sort, suggested first, then 'Uncategorized' last
  prompt: '45 SAR at STARBUCKS — what was this for?',
  message }                                              // for ask:true, message = '45 SAR at STARBUCKS'
```

### `categorize` `{ token, id, category, note? }`
- `category` must be an active category name or `'Uncategorized'`.
- Update the row: `category`, `status 'categorized'`, `note` when given.
- Unless `'Uncategorized'`: `learnRule(...)` with `settings.auto_threshold`, upsert each returned row (update by `{merchant, category}`, append when the update count is 0).
- Spend for that category in the row's cycle via `computeSummary`. Response `{ ok: true, budget: { category, spent, budget, pct } }` plus `alert` when `pct >= alert_threshold`: `Food & Restaurants: 82% of budget used`, or `Food & Restaurants: over budget (112%)` when `pct >= 1`.

### `update` `{ token, id, fields }`
Allowed fields: `amount, amount_sar, currency, category, note, status, txn_at, display_name`. Others are ignored.
- `amount` with `currency 'SAR'` also sets `amount_sar`.
- `txn_at` recomputes `cycle`.
- `status` must be `pending | categorized | ignored`.
- `category` different from the current one: `status 'categorized'` and `learnRule` as in `categorize` (this resets an auto rule).
- `display_name` updates every `MerchantRules` row of the transaction's merchant; when there is none, appends `{ merchant, display_name, category: '', hits: 0, auto: false, updated_at }`.
- Response `{ ok: true, txn }` (the full updated row, with `display_name`).

### `create` `{ token, fields: { amount, currency?, merchant_raw, txn_at?, type?, category?, note? }, error_id? }`
Manual transaction: `bank 'manual'`, `type` default `'purchase'`, `direction` `'in'` for `refund`/`credit` else `'out'`, `currency` default `settings.currency`, `amount_sar` = amount for SAR, `merchant = normalizeMerchant(merchant_raw)`, `status 'categorized'` when a category is given else `'pending'`, `received_at = nowIso`, `txn_at` default now, `dedupe_hash ''`, `raw_sms ''`. With `error_id`, that `ParseErrors` row gets `status 'resolved'`. Response `{ ok: true, txn }`.

### `dismiss_error` `{ token, id }` → `ParseErrors.status = 'dismissed'`, `{ ok: true }`.

### `settings` `{ token, savings_target?, cycle_start_day?, alert_threshold?, auto_threshold?, budgets?, categories? }`
- Scalar keys: update the `Settings` row by `key`, append when missing. `cycle_start_day` must be 1–31; when it changes, recompute `cycle` for every transaction.
- `budgets`: `{ [categoryName]: number }` → `Categories.monthly_budget`.
- `categories`: `[{ name, emoji?, monthly_budget?, kind?, active?, sort?, rename_from? }]`. `rename_from` renames that category in `Categories`, `Transactions.category` and `MerchantRules.category`. A name not present is appended (defaults: emoji `''`, budget 0, kind `'want'`, active true, sort = max + 1).
- Response: same as `config`.

### `config` → `{ ok: true, settings, categories }` (settings from `readSettings`; all category rows sorted, typed).

### `summary` `{ token, cycle? }` → `{ ok: true, ...computeSummary(...) }`; `cycle` defaults to the current one.

### `transactions` `{ token, cycle?, status?, q? }`
Filters apply only when given. `q` matches `merchant`, `merchant_raw`, `display_name`, `note`, `category` (case-insensitive substring). Sorted by `txn_at` desc. Response `{ ok: true, transactions: [row + display_name], parse_errors: [open ParseErrors rows, newest first] }`.

### `pending_count` → `{ ok: true, count }` = pending transactions + open parse errors.

## Apps Script adapter (`apps-script/`)
- `Code.js`: `doGet(e)` uses `e.parameter`; `doPost(e)` parses `e.postData.contents` (invalid JSON → `bad_request`). Rate limit: `CacheService.getScriptCache()` counter per minute key, > 60 → `{ ok: false, error: 'rate_limited' }`. POST runs inside `LockService.getScriptLock().waitLock(20000)`. Exceptions → `server_error` (log only the action name and error message, never params). Output via `ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON)`.
- `env.token`: Script Property `API_TOKEN`. `env.nowIso`: `Utilities.formatDate(new Date(), 'Asia/Riyadh', "yyyy-MM-dd'T'HH:mm:ssXXX")`.
- Spreadsheet: Script Property `SHEET_ID` when set (`SpreadsheetApp.openById`), else `SpreadsheetApp.getActiveSpreadsheet()`.
- `sheet/SheetStore.js`: `createSheetStore(ss)` implements the store; headers read from row 1 and cached per call; `Date` cell values are converted back to the ISO format above. `append` uses `appendRow`; `update` writes each changed row with one `setValues` call.
- `sheet/Setup.js`: `setupSheet()` creates missing tabs with headers, sets every non-numeric column's number format to `@` (plain text) so `cycle`, dates and `card_last4` are not auto-converted, freezes row 1, seeds `Categories` and `Settings` when empty. `createApiToken()` stores a 48-char random token in `API_TOKEN` and logs it once for the owner. `installTriggers()` removes and recreates the time triggers below.
- `triggers/Triggers.js`: `dailyReportTrigger()` (daily 08:00, sends `monthlyReport` for the cycle that just ended when today is the cycle start day), `weeklyNudgeTrigger()` (Thursday 20:00), `healthCheckTrigger()` (daily 22:00, emails `healthWarning` when not null), `backupTrigger()` (weekly: copy the spreadsheet into a Drive folder `Backups`, keep the newest 8). Mail goes to `Session.getEffectiveUser().getEmail()` via `MailApp.sendEmail`.

## Dev adapter (`scripts/dev-server.js`)
Node `http` server, port `5173` (env `PORT`). `/api` → `handleRequest` over `createMemoryStore(seed)` with token `dev-token` and real clock; GET reads the query, POST reads a `text/plain` JSON body; responds JSON with `Access-Control-Allow-Origin: *`. Everything else serves `dashboard/` statically (correct MIME types incl. `.webmanifest`, `.svg`, `.png`). `--empty` starts without seed data.
