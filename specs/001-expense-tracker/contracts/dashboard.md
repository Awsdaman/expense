# Contract: dashboard PWA (`dashboard/`)

Static files, no framework, no build. ES modules loaded with `<script type="module">`. Works from any static host (GitHub Pages) and from `scripts/dev-server.js`. Every path is relative (`./src/app.js`) so it works under a sub-path like `/iqtifaa/`.

## Direction (from the unslop skill; every screen follows it)
- **Product**: Iqtifaa tracks one person's card spending from bank SMS against a salary-to-salary budget.
- **Character**: exact, calm, a little warm.
- **World**: the bank SMS and the till receipt: monospaced figures, thin rules, paper and ink.
- **Moments**: (1) Home's "safe to spend" figure with the cycle strip under it; (2) the category budget bars. Everything else stays quiet.
- **Signature**: the **cycle strip**, a thin line from salary day to salary day, ticks for each day, a filled section up to today and a short label `24 days to the 27th`. It appears on Home and at the top of Insights, nowhere else.

## Tokens (`dashboard/styles.css`, all as CSS custom properties on `:root`)
- Neutrals: graphite ramp. Light: bg `#fafafa`, card `#ffffff`, raised `#f4f4f5`, text `#171717`, secondary `#525252`, muted `#737373`, hairline `rgba(23,23,23,.08)`. Dark (`prefers-color-scheme: dark`): bg `#141415`, card `#19191b`, raised `#232325`, text `#ededed`, secondary `#a1a1a6`, muted `#85858b`, hairline `rgba(237,237,237,.08)`.
- Accent (moss green, from "money kept"): light `#2f6f4f` (white text passes 4.5:1), dark `#7cc49a` (dark text on it). Used for the primary button, the selected tab and the safe-to-spend figure only.
- States: warn light `#b45309` dark `#f0b35a`; over light `#dc2626` dark `#e5484d`; ok bars use the text color at 70%.
- Type: `IBM Plex Sans Arabic` 400/500/600 for the interface (covers Latin and Arabic merchant names), `IBM Plex Mono` 400/500 for every amount, date and count. Google Fonts. `font-variant-numeric: tabular-nums` on figures. Sizes 12/13/15/17/22/40, line heights from the unslop token table. Sentence case, no uppercase tracked labels, weights 400–600.
- Spacing: 4px grid (4, 8, 12, 16, 20, 24, 32, 40). Page gutter 16, cards padding 16–20, list rows 56 tall with 12/16 padding.
- Radius: controls 10, cards 16, sheet 20 (top corners).
- Motion (emil-design-eng): `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`. Press `transform: scale(0.97)` 120ms; sheets slide up 280ms with the drawer curve and fade the backdrop; toasts fade and rise 8px in 200ms. No entrance animation on tab switches (seen tens of times a day). Never `transition: all`. `@media (prefers-reduced-motion: reduce)` turns transforms off and keeps opacity.
- Icons: inline lucide SVG paths, 18px, stroke 1.5, `currentColor`, muted/secondary role. No emoji anywhere in the UI, including category names' emoji from the API (categories show a 8px dot in their budget-state color instead).
- Copy: no exclamation marks, no trailing periods on labels, no greetings. Titles name the context: `Cycle 27 Oct – 26 Nov`.
- Dark mode, `theme-color` meta for both schemes, `viewport-fit=cover` and `env(safe-area-inset-*)` paddings, tap targets ≥ 44px, `dir="auto"` on merchant names.

## Files
```
dashboard/index.html            shell: header slot, <main id="view">, bottom tab bar, sheet + toast containers
dashboard/manifest.webmanifest  name "Iqtifaa", display standalone, start_url "./", icons 192/512, theme/background colors
dashboard/sw.js                 cache-first for the app shell (versioned cache name), network-only for API calls
dashboard/styles.css            tokens + components (card, row, bar, button, input, sheet, toast, tabbar, strip)
dashboard/icons/                icon.svg, icon-180.png (apple-touch-icon), icon-192.png, icon-512.png from scripts/make-icons.js
dashboard/src/app.js            boot, config check, hash router, tab bar state, inbox badge, SW registration
dashboard/src/api.js            client + offline cache
dashboard/src/format.js         money/date formatting for the UI
dashboard/src/ui.js             h() element helper, icons, openSheet(), toast(), confirm-free undo toast
dashboard/src/screens/setup.js  first run: API URL + token, "Test connection", saves config
dashboard/src/screens/home.js
dashboard/src/screens/inbox.js
dashboard/src/screens/transactions.js
dashboard/src/screens/insights.js
dashboard/src/screens/settings.js
```

## Module interfaces
- `api.js`
  - `loadConfig() -> {url, token}|null`, `saveConfig(cfg)`, `clearConfig()` (localStorage key `iq:config`; all access in try/catch).
  - `apiGet(action, params = {}) -> Promise<object>`: `fetch(url + '?' + URLSearchParams({action, token, ...params}))`. On success caches the JSON in localStorage under `iq:cache:<action>:<sorted params without token>`. On network failure returns the cached copy with `stale: true`, or throws. `{ok:false}` responses throw `Error(error)`.
  - `apiPost(action, body = {}) -> Promise<object>`: POST `JSON.stringify({action, token, ...body})` with header `Content-Type: text/plain;charset=utf-8` (no CORS preflight). Throws on `{ok:false}`.
- `format.js`: `money(n, {currency='SAR', sign=false})` → `"1,250.50"` style figures (same rule as `formatAmount` in core) with the currency as a separate muted span when rendered; `shortDate('2026-11-03T18:50:00+03:00')` → `"3 Nov"`, `time(...)` → `"18:50"`, `cycleTitle(start, end)` → `"27 Oct – 26 Nov"`. Riyadh time, `Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh' })`.
- `ui.js`: `h(tag, props, ...children)`, `icon(name)` (house, inbox, list, chart-column, settings, search, x, check, undo, chevron-right, alert-triangle, wifi-off), `openSheet(contentEl, {title}) -> {close}`, `toast(text, {action, onAction})`.
- Every screen: `export async function render(root, ctx)` where `ctx = { navigate(hash), refreshBadge(), cfg }`. Screens render a loading skeleton first, then data; on error a quiet inline message with a retry button. When a response has `stale: true`, show a small `wifi-off` line "Offline, showing data from 18:50".

## Screens (Plan.md §7)
1. **Home** `#/home` (`summary`): title = cycle range; the moment: `Safe to spend` figure (accent), `~180 SAR a day until the 27th` under it, the cycle strip; a row of two compact stats `Spent` / `Income`; category list with budget bars (spent / budget, % at right, state color for warn ≥ alert threshold and over ≥ 100%); a quiet line `3 to review` linking to Inbox when `pending_count + parse_error_count > 0`.
2. **Inbox** `#/inbox` (`transactions?status=pending`): pending transactions then parse errors. Tap a transaction → sheet with category choices (suggested first), optional note, Save → `categorize`, shows the `alert` as a toast. Horizontal swipe left (pointer events, 80px threshold, the row follows the finger) or an `Ignore` button in the sheet → `update {status:'ignored'}` with an Undo toast (`update {status:'pending'}`). Parse error → sheet showing the redacted SMS in mono with an `Add manually` form (amount, merchant, date, category → `create` with `error_id`) and `Dismiss` (`dismiss_error`). Empty state: `Nothing to review`.
3. **Transactions** `#/transactions` (`transactions?cycle=…&q=…`): search field (debounced 250ms), cycle switcher (previous/next), list grouped by day with merchant (display name), category, time, amount. Tap → edit sheet: amount, category, note, display name for the merchant, status (ignored toggle) → `update`.
4. **Insights** `#/insights` (`summary` for the current cycle; history comes inside it): cycle strip, per-category comparison this cycle vs average of last 3 (one horizontal bar per category, the current cycle in accent, the average as a thin muted marker), top 10 merchants ranked list with thin bars, needs vs wants as one stacked bar, recurring charges list.
5. **Settings** `#/settings` (`config`): savings target, cycle start day, alert threshold; categories list with budget input, kind toggle (need/want), archive toggle, rename, `Add category`; Save → `settings`. Connection section: shows the API host, `Disconnect` clears config.

Tab bar: Home, Inbox (count badge from `pending_count`), Activity (= Transactions), Insights, Settings.
