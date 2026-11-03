# Personal Expense Tracker — Build Plan

> A single-user expense tracker for iPhone. Bank SMS messages are captured automatically, each purchase is categorized with one tap, and everything feeds a Google Sheet plus a home-screen dashboard with monthly budgets and a savings target.
>
> This plan is written for building with **Claude Code**. Each phase lists what to build, the acceptance criteria, and a starter prompt for Claude Code.

---

## 1. Goals and Non-Goals

**Goals**
- Capture every card purchase from bank SMS with zero manual typing.
- Ask "what was this for?" right after each purchase, and make answering take under 3 seconds.
- Learn merchants over time, so repeat merchants (e.g. the same gas station) get categorized automatically.
- Show where money goes each month, against category budgets and a savings target.
- Keep the system cheap (free), private, and easy to maintain by one person.

**Non-Goals (for v1)**
- No App Store app, no Apple developer account.
- No multi-user support, no bank API integrations (Open Banking), no investment tracking.
- No reading of SMS directly. iOS forbids this; we rely on Shortcuts automations instead.

---

## 2. Architecture

```
┌──────────────┐   bank SMS    ┌─────────────────────────┐
│  Bank        │ ────────────▶ │ iPhone Messages         │
└──────────────┘               └───────────┬─────────────┘
                                           │ Personal Automation
                                           │ "Message from <bank> contains …"
                                           ▼
                               ┌─────────────────────────┐
                               │ Shortcut: "Log Expense" │
                               │ (thin client, no logic) │
                               └───────────┬─────────────┘
                     POST raw SMS + token  │  ▲ JSON: txn id, amount,
                                           ▼  │ merchant, suggested category
                               ┌─────────────────────────┐
                               │ Google Apps Script API  │
                               │ parse · dedupe · learn  │
                               └───────────┬─────────────┘
                                           ▼
                               ┌─────────────────────────┐
                               │ Google Sheet (database) │
                               └───────────┬─────────────┘
                                           │ read via API (GET + token)
                                           ▼
                               ┌─────────────────────────┐
                               │ Dashboard (PWA on home  │
                               │ screen, static hosting) │
                               └─────────────────────────┘
```

### Key design decisions (and why)

| Decision | Reason |
|---|---|
| **Parsing happens on the server (Apps Script), not in the Shortcut.** The Shortcut only forwards the raw SMS. | Shortcuts are painful to edit and impossible to unit test. When the bank changes its SMS format, we fix one regex in code, not on the phone. |
| **Google Sheet is the database.** | Free, viewable and editable from anywhere, easy to fix mistakes by hand, easy to export. Volume (a few hundred rows/month) is tiny. |
| **Apps Script is the API layer.** | Free, lives next to the Sheet, no server to run. |
| **Parser is a pure JS module with local unit tests.** | It is the riskiest part. Tests run locally with Node; the same file is deployed to Apps Script via `clasp`. |
| **Categories are served by the API.** The Shortcut builds its menu from the API response. | Adding or renaming a category never requires touching the Shortcut. |
| **Dashboard is a static PWA**, hosted on GitHub Pages (or Cloudflare Pages). | Looks and feels like a real app when added to the home screen. Apps Script `HtmlService` pages run inside an iframe with a Google banner and feel clunky. |
| **Budget cycle follows salary day, not calendar month.** | In Saudi Arabia salaries commonly arrive around the 27th. A cycle from salary to salary reflects real spending far better than the 1st–30th. Configurable. |

---

## 3. Data Model (Google Sheet)

One spreadsheet, five tabs. Row 1 is headers. Code must look up columns **by header name**, never by position, so adding a column never breaks anything.

### `Transactions`
| Column | Type | Notes |
|---|---|---|
| `id` | string | Short unique id (e.g. `t_8f3k2a`). |
| `received_at` | ISO datetime | When the API received the SMS. |
| `txn_at` | ISO datetime | Date/time stated inside the SMS, if present; else `received_at`. |
| `type` | enum | `purchase`, `online`, `atm`, `transfer_out`, `refund`, `credit`, `fee`, `unknown`. |
| `direction` | enum | `out` or `in`. |
| `amount` | number | Always positive. Direction says the sign. |
| `currency` | string | `SAR` by default. |
| `amount_sar` | number | Equal to `amount` for SAR; for foreign currency, the SAR equivalent if the SMS gives it, else blank (filled manually). |
| `merchant_raw` | string | Exactly as in the SMS. |
| `merchant` | string | Normalized (trimmed, uppercased, branch numbers stripped), used for learning. |
| `card_last4` | string | Last 4 digits only. Never store full numbers. |
| `payment_method` | string | e.g. `Mada Apple Pay`, `Visa online`, `Mada card`. |
| `bank` | string | Which parser matched. |
| `category` | string | Blank until categorized; `Uncategorized` if skipped. |
| `note` | string | Optional free text. |
| `status` | enum | `pending`, `categorized`, `auto`, `ignored`. |
| `cycle` | string | Budget cycle label, e.g. `2026-10` (cycle that started on salary day in Oct). |
| `dedupe_hash` | string | Hash of normalized SMS text. |
| `raw_sms` | string | Original text, with balance and card numbers redacted. Kept for re-parsing. |

### `Categories`
| `name` | `emoji` | `monthly_budget` | `kind` | `active` | `sort` |
|---|---|---|---|---|---|
| Food & Restaurants | 🍔 | 1500 | want | TRUE | 1 |
| Groceries | 🛒 | 2000 | need | TRUE | 2 |
| Fuel & Car | ⛽ | 600 | need | TRUE | 3 |

Starter categories: Food & Restaurants, Coffee, Groceries, Fuel & Car, Transport, Shopping, Bills & Subscriptions, Health, Family, Home, Entertainment, Travel, Gifts & Charity, Other.
`kind` (`need` / `want`) powers a simple needs-vs-wants view.

### `MerchantRules`
| `merchant` | `display_name` | `category` | `hits` | `auto` | `updated_at` |
|---|---|---|---|---|---|
- `display_name` lets you turn bank-truncated names into readable ones (`S175 TAMI` → `Tamimi Markets`). The dashboard shows `display_name` when set.
- Each time you categorize a merchant, `hits` for that (merchant, category) increases.
- After **3 consistent hits** the rule flips to `auto = TRUE`: future purchases from that merchant are categorized automatically and you just get a confirmation notification.
- If you ever re-categorize an auto merchant, `auto` resets to FALSE.

### `Settings` (key / value)
| key | example |
|---|---|
| `api_token` | long random string (also stored in Script Properties; see Security) |
| `currency` | SAR |
| `cycle_start_day` | 27 |
| `savings_target` | 3000 |
| `alert_threshold` | 0.8 |
| `auto_threshold` | 3 |
| `timezone` | Asia/Riyadh |

### `ParseErrors`
`received_at`, `raw_sms`, `error`. Any SMS the parser could not understand lands here instead of being lost. The dashboard shows a count so nothing slips through.

---

## 4. API (Google Apps Script Web App)

Deployed as a Web App: **Execute as: Me**, **Who has access: Anyone**. Access is protected by a token (see Security).

> **Apps Script gotchas to design around**
> - `doPost(e)` / `doGet(e)` **cannot read HTTP headers**, so the token goes in the JSON body (POST) or query string (GET).
> - All requests go to one URL; route by an `action` field.
> - From a browser, send POST bodies as `Content-Type: text/plain` to avoid a CORS preflight, which Apps Script doesn't support. Parse JSON from `e.postData.contents`.
> - Responses redirect through `script.googleusercontent.com`; `fetch` follows this automatically. Shortcuts does too.
> - Use `LockService` around writes so two SMS arriving at once don't collide.

### Endpoints (all `POST` unless noted)

| action | Input | Output |
|---|---|---|
| `ingest` | `{ token, sms, sender?, received_at? }` | `{ ok, txn: {id, type, amount, currency, merchant}, status, suggested_category, categories[], ask: bool, message }` |
| `categorize` | `{ token, id, category, note? }` | `{ ok, budget: {category, spent, budget, pct}, alert?: string }` |
| `summary` (GET) | `?token=…&cycle=2026-10` | totals, per-category spend vs budget, top merchants, daily series, savings status |
| `transactions` (GET) | `?token=…&cycle=…&status=pending` | list for the dashboard |
| `pending_count` (GET) | `?token=…` | `{ count }` for the evening reminder |
| `update` | `{ token, id, fields }` | edit amount/category/note/merchant from the dashboard |
| `settings` | `{ token, budgets?, savings_target?, cycle_start_day? }` | update budgets and settings from the dashboard |

### `ingest` logic
1. Validate token. Reject otherwise (return generic error, no detail).
2. Normalize text: convert Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩ → 0–9), unify commas/decimal points, collapse whitespace.
3. **Ignore list:** OTPs, verification codes, login alerts, marketing, declined transactions → return `{ ok, ignored: true }`, do not ask.
4. Compute `dedupe_hash`; if seen in the last 10 minutes, return the existing transaction (protects against the automation firing twice).
5. Run parsers in order until one matches. No match → write to `ParseErrors`, return `ask: false` with a message telling you it failed.
6. Look up `MerchantRules`:
   - `auto = TRUE` → set category, `status = auto`, `ask = false`, message like "⛽ 120 SAR at ALDREES → Fuel & Car (auto)".
   - otherwise → `status = pending`, `ask = true`, `suggested_category` = best previous rule if any.
7. Incoming money (`credit`, `refund`) → recorded, never asks. Refunds are linked as negative spend in their category when possible.
8. Append row, return response.

---

## 5. SMS Parser

`src/parser/` — pure functions, **no Apps Script APIs** inside, so they run in Node tests and in Apps Script unchanged.

```
parseSms(text) -> { type, direction, amount, currency, amount_sar?, merchant_raw,
                    card_last4?, txn_at?, bank } | { ignored: true, reason } | null
```

- One parser per bank/format (`alrajhi.js`, `snb.js`, …), each exporting `match(text)` and `parse(text)`.
- Must handle both **Arabic and English** variants of each message type, plus:
  - Amounts like `1,250.50`, `SAR 45`, `45.00 SAR`, `45 ريال`, `SR45`.
  - Foreign currency purchases (`USD 12.99`), with SAR equivalent if present.
  - Merchant names that contain digits or Arabic text.
  - Online purchases, Apple Pay / Mada POS, ATM withdrawals, transfers.
- **Redaction** before storage: remove available balance, keep only last 4 card digits, remove IBANs/account numbers.

### Normalization rules (learned from real samples)
Apply these in `normalize.js` **before** any bank parser runs:
- **Strip invisible bidi characters**: U+061C (Arabic letter mark, present in Al Rajhi messages before the date), U+200E, U+200F, U+202A–U+202E, U+2066–U+2069, U+FEFF. They are invisible but break regexes.
- **Strip tatweel** (U+0640 `ـ`): `بـ14` → `ب14`, `لـS175` → `لS175`. Regexes then match plain letters.
- Convert Arabic-Indic digits (`٠-٩`) and Persian digits (`۰-۹`) to `0-9`.
- Normalize line endings to `\n`; trim each line; drop empty lines.
- Keep the original text separately for `raw_sms` (after redaction).

### Known bank formats

Card digits below are anonymized. Use these exact structures as the first fixtures.

#### SNB (Saudi National Bank) — `banks/snb.js`
```
شراء-POS
بـ14 SAR
من khush sha
مدى-ابل*1111
في 03/11/26 18:50
```
| Field | Rule |
|---|---|
| Detect | First line starts with `شراء` and contains `POS` (case-insensitive), **and** a line starts with `من ` |
| Type | `شراء-POS` → `purchase` |
| Amount | Line `ب<amount> <CUR>` → amount **before** currency (`14`, `SAR`) |
| Merchant | Line after `من ` → `khush sha` (often truncated by the bank) |
| Card / method | `مدى-ابل*1111` → method `Mada Apple Pay`, last4 `1111` |
| Date | `في dd/mm/yy HH:MM` → `2026-11-03T18:50+03:00` |

#### Al Rajhi Bank — `banks/alrajhi.js`
```
شراء PoS
عبر:2222;مدى-ابل باي
بـSAR 81.60
لـS175 Tami
‏3/11/26 18:31
```
| Field | Rule |
|---|---|
| Detect | First line starts with `شراء` and contains `PoS`, **and** a line starts with `عبر:` |
| Type | `شراء PoS` → `purchase` |
| Amount | Line `ب<CUR> <amount>` → currency **before** amount (`SAR`, `81.60`) |
| Merchant | Line after `ل` → `S175 Tami` (store code + truncated name, here Tamimi Markets branch S175) |
| Card / method | `عبر:2222;مدى-ابل باي` → last4 `2222`, method `Mada Apple Pay` |
| Date | `d/m/yy HH:MM`, **no leading zeros**, preceded by an invisible U+061C → `2026-11-03T18:31+03:00` |

#### Barq — `banks/barq.js`
```
Online Purchase
VISA card **3333
Amount 6.9 USD (25.91 SAR)
Balance 11.97
At OPENAI
A/C **4444
2026-10-03 20:32
```
| Field | Rule |
|---|---|
| Detect | English; first line `Online Purchase` (later: other English types), a line starting `Amount ` and a line starting `At ` |
| Type | `Online Purchase` → `online` |
| Amount | `Amount 6.9 USD (25.91 SAR)` → amount `6.9`, currency `USD`, `amount_sar` `25.91`. If no brackets, currency is SAR and `amount_sar = amount` |
| Merchant | Line after `At ` → `OPENAI` |
| Card / method | `VISA card **3333` → method `Visa online`, last4 `3333` |
| Redact | `Balance …` line removed entirely; `A/C **4444` removed (account number) |
| Date | ISO-like `yyyy-mm-dd HH:MM` → treat as Asia/Riyadh |

#### Cross-bank observations
- **Two Arabic banks, two amount orders**: SNB puts currency after the number, Al Rajhi before. The amount regex must accept both: `(?:([A-Z]{3})\s*)?(\d[\d,]*(?:\.\d+)?)(?:\s*([A-Z]{3}))?`.
- **Two date formats**: `dd/mm/yy` (with or without leading zeros) and `yyyy-mm-dd`. Always day-first for slash dates (Saudi convention). Two-digit years → `20yy`.
- **Merchants are truncated and messy** (`khush sha`, `S175 Tami`). The same store may appear with different branch codes. Normalize by uppercasing, collapsing spaces and stripping leading store codes matching `^[A-Z]?\d{2,5}\s+`, and let the user set a friendly name (see `display_name` in `MerchantRules`).
- **Payment method is worth keeping** (Apple Pay vs physical card vs online), stored in a new `payment_method` column.
- Detection order: Barq (English) → Al Rajhi (`عبر:`) → SNB (`من `). Also use the SMS **sender name** when the Shortcut passes it, as a strong hint.

### Test fixtures
`tests/fixtures/sms/*.txt` — real messages, anonymized (fake merchant if desired, but keep the exact structure and punctuation). Each fixture has an expected JSON next to it. **Every new format found in the wild gets a fixture before the fix.** Target: 100% of fixtures pass before every deploy.

---

## 6. iPhone Shortcut ("Log Expense")

Claude Code cannot generate a signed `.shortcut` file reliably, so the Shortcut is built by hand. **Keep it dumb**: all logic lives in the API. Claude Code should produce an exact, step-by-step build guide (`docs/shortcut-setup.md`) based on this outline.

**Automation trigger** (Shortcuts → Automation → New → Message)
- Sender: your bank's SMS sender name (e.g. `AlRajhiBank`). One automation per bank.
- Message contains: leave empty or a broad keyword. Filtering is the server's job.
- **Run Immediately** ON, **Notify When Run** OFF.

**Shortcut actions**
1. Receive the message content from the automation input.
2. `Get Contents of URL` → POST to the API URL, JSON body `{ action: "ingest", token, sms: <message> }`.
3. Get dictionary from the response.
4. If `ignored` → stop.
5. If `ask` is false → `Show Notification` with `message` → stop.
6. Otherwise → `Choose from List` using `categories` (prompt: "💳 45 SAR at STARBUCKS — what was this for?"). Put `suggested_category` first.
7. Optional: `Ask for Input` for a note (can be skipped with an empty answer; make this a setting if it gets annoying).
8. POST `{ action: "categorize", id, category, note }`.
9. If response has `alert` → `Show Notification` (e.g. "⚠️ Food & Restaurants: 82% of budget used").

**Second automation — evening reminder** (Time of Day, 9:30 PM daily)
- GET `pending_count`; if > 0 → notification "You have 3 uncategorized purchases" that opens the dashboard.

**Known iOS behavior to verify early (Phase 2):**
- Interactive actions (`Choose from List`) in an automation appear as a banner/sheet; if the phone is locked you may need to unlock to answer. Anything unanswered stays `pending` and shows in the dashboard inbox. That is the safety net.
- Store the API URL and token in the Shortcut as text actions at the top so they are easy to rotate.

---

## 7. Dashboard (PWA)

Static site, mobile-first, installable via Safari → Share → Add to Home Screen. Plain HTML/CSS/JS or a small Vite build. No framework is needed. Dark mode supported. Arabic-friendly font for merchant names.

**First-run setup screen:** paste API URL + token once; stored in `localStorage` on the phone. Nothing secret is committed to the repo.

**Screens**
1. **Home (current cycle)**
   - Big number: spent this cycle / income this cycle.
   - Savings card: target vs "safe to spend" = income − savings target − spent.
   - Per-day pace: "You can spend ~180 SAR/day until the 27th."
   - Category bars with budget %, colored green / amber (≥80%) / red (≥100%).
2. **Inbox** — pending + `ParseErrors` items; tap to categorize or fix. Swipe to mark ignored.
3. **Transactions** — searchable, filterable list; tap to edit amount, category, note, or split a transaction.
4. **Insights** — this cycle vs last 3 cycles per category, top 10 merchants, needs vs wants split, recurring charges detected (same merchant, similar amount, ~monthly).
5. **Budgets & Settings** — edit category budgets, savings target, cycle start day, categories (add/rename/archive).

---

## 8. Reports and Automation (Apps Script time triggers)

- **Monthly report** — on cycle start day, email a summary of the finished cycle to your Gmail: total spent, saved vs target, top categories, biggest change vs last cycle.
- **Weekly nudge (optional)** — Thursday evening email: spending so far this cycle and pace.
- **Nightly health check** — if no SMS ingested in 5+ days while you normally spend daily, email a warning (automation may be broken, e.g. after an iOS update).

---

## 9. Security and Privacy

- **Token**: 32+ random chars, stored in Apps Script **Script Properties** (not in the code, not in git). Compare in constant time. Rotate if leaked; update Shortcut and dashboard.
- **Never store**: full card numbers, IBANs, available balance, OTPs.
- **Google account**: 2-step verification on. The Sheet is private (not "anyone with link").
- **Repo**: public is fine for the dashboard code since it contains no data or secrets; `.clasp.json`, `.env`, and any fixture with real data stay out of git (`.gitignore`). Prefer a private repo if unsure.
- **Rate limiting**: reject more than ~60 requests/minute (cheap protection if the URL leaks).
- **Backups**: weekly Apps Script trigger copies the Sheet into a `Backups` Drive folder and keeps the last 8.

---

## 10. Repository Layout

```
expense-tracker/
├── apps-script/
│   ├── appsscript.json
│   ├── .clasp.json            # gitignored
│   ├── Code.js                # doGet/doPost router
│   ├── api/                   # ingest, categorize, summary, …
│   ├── sheet/                 # header-based row read/write helpers
│   ├── triggers/              # monthly report, backups, health check
│   └── parser/                # copied/built from /src/parser at deploy
├── src/parser/                # pure JS parser (source of truth)
│   ├── index.js
│   ├── normalize.js
│   ├── redact.js
│   └── banks/
├── dashboard/                 # PWA
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── src/
├── tests/
│   ├── fixtures/sms/
│   └── parser.test.js
├── docs/
│   ├── shortcut-setup.md
│   └── sheet-setup.md
├── scripts/
│   ├── build-appsscript.js    # copies parser into apps-script/
│   └── deploy.sh              # test → build → clasp push → clasp deploy
├── package.json
└── CLAUDE.md                  # project rules for Claude Code
```

**Tooling:** Node 20+, `@google/clasp`, `vitest` for tests. Deploy = `npm test && npm run build && clasp push && clasp deploy -i <deploymentId>` (re-using the same deployment ID keeps the URL stable, so the Shortcut never needs updating).

---

## 11. Phased Delivery

Each phase ends with something usable. Don't start the next phase until the current one's acceptance criteria pass.

### Phase 0 — Setup (½ day)
- Create the Google Sheet with the five tabs and headers; seed `Categories` and `Settings`.
- Create the repo, install Node, `clasp login`, link the Apps Script project.
- Write `CLAUDE.md` with the project rules in section 13.

**Done when:** `clasp push` works and an empty `doGet` returns `{ok:true}` from the deployed URL.

> **Claude Code prompt:** "Read plan.md. Set up Phase 0: scaffold the repo layout from section 10, create package.json with vitest and clasp scripts, a CLAUDE.md with the rules from section 13, and docs/sheet-setup.md with exact steps to create the Sheet tabs and headers from section 3. Then create a minimal Apps Script router that returns {ok:true}."

### Phase 1 — Parser with tests (1 day) ⭐ most important
- Collect 10–20 real bank SMS (purchases, online, ATM, refund, transfer, salary, OTP, declined) in Arabic and English. Anonymize.
- Build `normalize`, `redact`, bank parsers, and the ignore list.

**Done when:** all fixtures pass; unknown formats return `null` instead of guessing.

> **Claude Code prompt:** "Implement Phase 1 from plan.md. Here are my bank SMS samples: [paste]. Create one fixture + expected JSON per sample, write failing tests first, then implement the parser until all pass. Handle Arabic-Indic digits and both languages."

### Phase 2 — Ingest + Shortcut (1 day)
- Implement `ingest` and `categorize` with locking, dedupe, header-based writes.
- Write `docs/shortcut-setup.md`; build the Shortcut and automation on the iPhone.
- Make a real small purchase and test end to end. Also test: phone locked, two SMS back to back, airplane mode (Shortcut fails → SMS still in Messages; add a manual "Log last bank SMS" Shortcut for recovery).

**Done when:** a real purchase appears in the Sheet within seconds and the category you pick is saved.

### Phase 3 — Merchant learning (½ day)
- `MerchantRules` with hit counting and auto-categorize after N consistent hits; suggested category ordering.

**Done when:** the 4th coffee at the same café is auto-categorized with just a notification.

### Phase 4 — Dashboard v1 (1–2 days)
- `summary`, `transactions`, `update`, `pending_count` endpoints.
- PWA with Home, Inbox, Transactions; deploy to GitHub Pages; add to home screen.

**Done when:** you can see this cycle's spending by category and clear the inbox from the phone.

### Phase 5 — Budgets and savings (1 day) — start after ~2 weeks of real data
- Settings screen for budgets, savings target, cycle day.
- Budget % in `categorize` response → threshold alerts in the Shortcut.
- "Safe to spend" and daily pace on Home.

**Done when:** crossing 80% of a category budget triggers a notification right after the purchase.

### Phase 6 — Insights and reports (1 day)
- Insights screen (trends, top merchants, needs vs wants, recurring charges).
- Monthly email report, weekly backup, health check.

---

## 12. Testing Checklist

- [ ] Parser fixtures: every message type, both languages, foreign currency, odd merchant names.
- [ ] Duplicate SMS within 10 minutes → one row.
- [ ] Two different SMS within 1 second → two rows, no corruption.
- [ ] Wrong token → rejected, nothing written.
- [ ] OTP / declined / marketing SMS → ignored, no prompt.
- [ ] Unparseable SMS → lands in `ParseErrors`, visible in dashboard inbox.
- [ ] Skipped prompt → stays `pending`, appears in inbox and evening reminder.
- [ ] Cycle boundaries: purchase on the 26th vs 27th lands in the right cycle.
- [ ] Re-categorizing an auto merchant resets its rule.
- [ ] Dashboard works offline (shows last cached data) and in dark mode.

---

## 13. Rules for Claude Code (put in `CLAUDE.md`)

1. Read `plan.md` before starting any phase; work one phase at a time.
2. Parser code is pure JS with no Apps Script globals. Write the fixture and failing test before any parser fix.
3. Access Sheet columns by header name only.
4. Wrap every Sheet write in `LockService`.
5. Never commit secrets, `.clasp.json`, or real SMS data. Token lives in Script Properties.
6. Never log full SMS text or amounts with card numbers to Stackdriver/console in production.
7. Deploy only through `scripts/deploy.sh`, which runs tests first and reuses the existing deployment ID.
8. Keep the iOS Shortcut logic-free; if a change seems to need Shortcut edits, move the logic into the API instead.

---

## 14. Future Ideas (after v1 is stable)

- Split one transaction into multiple categories (e.g. supermarket: groceries + home).
- Cash expenses via a "Log Cash" Shortcut or dashboard button.
- Saving goals with progress bars (e.g. travel, emergency fund = 3–6 months of expenses).
- Annual view and yearly subscriptions calendar.
- Siri: "Hey Siri, how much did I spend on food this month?" via a Shortcut calling `summary`.
- Widget-like view using a Shortcut that shows "safe to spend today".

---

## 15. Open Items

- [x] First purchase samples received: SNB (Mada Apple Pay POS), Al Rajhi (Mada Apple Pay POS), Barq (Visa online, foreign currency). **Phase 1 can start.**
- [ ] More samples, collected as they arrive, one fixture each: online purchases from SNB and Al Rajhi, physical card (not Apple Pay) purchases, ATM withdrawal, refund/reversal, transfer out, incoming transfer/salary, declined transaction, OTP, and any English versions. Until then, unknown formats go to `ParseErrors` and the dashboard inbox.
- [ ] Bank sender names as they appear in Messages (SNB, Al Rajhi, Barq). Needed for the three automations in Phase 2.
- [ ] Salary day, to set `cycle_start_day`.
- [ ] Final category list and initial budgets (can wait until Phase 5).
