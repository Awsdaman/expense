# Contract: SMS parser (`src/parser/`)

Pure ES modules. Named exports only, single-line imports, top-level code is only `function` declarations and `const` literals. Every top-level name must be unique across `src/` (files are concatenated for Apps Script).

## `normalize.js`
- `normalizeText(text) -> string`
  1. Remove U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069, U+FEFF.
  2. Remove tatweel U+0640.
  3. Arabic-Indic `٠-٩` (U+0660–0669) and Persian `۰-۹` (U+06F0–06F9) → `0-9`.
  4. `٫` (U+066B) → `.`, `٬` (U+066C) → `,`, `،` (U+060C) → `,`.
  5. `\r\n` and `\r` → `\n`; collapse runs of spaces/tabs inside a line to one space; trim each line; drop empty lines.
- `toLines(text) -> string[]`: `normalizeText(text).split('\n')`, `[]` for empty.

## `amount.js`
- `parseAmount(str) -> number|null`: `"1,250.50"` → `1250.5`, `"45"` → `45`, `"6.9"` → `6.9`. Commas are thousands separators.
- `parseMoney(str) -> {amount, currency}|null`. Accepts currency before or after the number: `SAR 81.60`, `14 SAR`, `SAR45`, `SR45`, `45 ريال`, `45 ر.س`, `USD 12.99`. `SR`, `ريال`, `ر.س` → `SAR`. No currency at all → `SAR`. Core regex from Plan.md: `(?:([A-Z]{3})\s*)?(\d[\d,]*(?:\.\d+)?)(?:\s*([A-Z]{3}))?` extended for the aliases.

## `dates.js`
All output is Riyadh local time with a fixed `+03:00` offset, format `YYYY-MM-DDTHH:MM:00+03:00`.
- `parseSlashDate(str) -> string|null`: day-first `d/m/yy HH:MM` or `dd/mm/yyyy HH:MM`, leading zeros optional, two-digit years → `20yy`. `"03/11/26 18:50"` → `"2026-11-03T18:50:00+03:00"`, `"3/11/26 18:31"` → `"2026-11-03T18:31:00+03:00"`. Finds the date anywhere in the string. Invalid day/month → null.
- `parseIsoLikeDate(str) -> string|null`: `"2026-10-03 20:32"` → `"2026-10-03T20:32:00+03:00"`.

## `merchant.js`
- `normalizeMerchant(raw) -> string`: trim, collapse spaces, uppercase (Latin only; Arabic unchanged), then strip one leading store code matching `^[A-Z]?\d{2,5}\s+`. `"S175 Tami"` → `"TAMI"`, `"khush sha"` → `"KHUSH SHA"`, `"OPENAI"` → `"OPENAI"`. If stripping would leave an empty string, keep the unstripped value.

## `redact.js`
- `redactSms(text) -> string`: works on the original text, keeps its lines (normalizes `\r\n` to `\n` and removes the invisible bidi characters from §normalize step 1, nothing else).
  - Drop whole lines that report a balance: English `/\bbalance\b/i`, Arabic `/رصيد/`.
  - Drop whole lines that start with an account reference: `/^\s*(A\/C|Acc(?:oun)?t)\b/i`, `/^\s*(ال)?حساب/`.
  - Replace IBANs `/\bSA\d{2}[A-Z0-9 ]{18,30}/gi` with `[IBAN]`.
  - Replace any run of 12–19 digits (spaces or dashes allowed between groups) with `**` + its last 4 digits.
  - Already-masked numbers like `**3333` or `*1111` are kept.

## `ignore.js`
- `ignoreReason(normalizedText) -> 'otp'|'declined'|'login'|'marketing'|null`, checked in this order:
  - otp: `/\bOTP\b|one[- ]time (pass|code)|verification code|رمز التحقق|رمز التفعيل|كلمة المرور لمرة واحدة|رمز سري مؤقت/i`
  - declined: `/declined|rejected|unsuccessful|insufficient|مرفوض|رفض|لم تتم|غير ناجح|عملية فاشلة/i`
  - login: `/\blog(?:ged)?[- ]?in\b|sign[- ]in|تسجيل (?:ال)?دخول/i`
  - marketing: `/unsubscribe|promo code|عرض خاص|لإلغاء الاشتراك/i`
  - Do NOT treat `خصم` as marketing: banks use it for "debited".

## Bank parsers (`banks/*.js`)
Each exports one object (unique names: `barqParser`, `alrajhiParser`, `snbParser`):
```js
export const snbParser = {
  id: 'snb',
  senders: ['SNB', 'ALAHLI', 'SNB-ALAHLI'],   // uppercase, matched with includes()
  match(lines) { /* boolean */ },
  parse(lines) { /* txn object or null */ },
};
```
`lines` is `toLines(text)` output. Formats, detection and field rules are exactly Plan.md §5 "Known bank formats". Payment methods: text containing `ابل` or `apple` → `Mada Apple Pay`; `مدى` otherwise → `Mada card`; Barq `VISA card` on `Online Purchase` → `Visa online`. Barq ignores the `Balance` and `A/C` lines.
- Barq senders `['BARQ']`, Al Rajhi `['ALRAJHI', 'RAJHI', 'ALRAJHIBANK']`.

## `index.js`
- `parseSms(text, opts = {}) -> Txn | {ignored: true, reason} | null`
  1. `lines = toLines(text)`; empty → null.
  2. `reason = ignoreReason(lines.join('\n'))` → `{ ignored: true, reason }`.
  3. Parser order Barq → Al Rajhi → SNB. If `opts.sender` (uppercased) includes one of a parser's `senders`, try that parser first.
  4. First parser whose `match(lines)` is true: return its `parse(lines)` (which may be null). No match → null.

### `Txn`
```js
{
  type: 'purchase'|'online'|'atm'|'transfer_out'|'refund'|'credit'|'fee'|'unknown',
  direction: 'out'|'in',
  amount: 14,                 // positive number
  currency: 'SAR',
  amount_sar: 14,             // number, or null when foreign without SAR equivalent
  merchant_raw: 'khush sha',  // as in SMS, trimmed
  merchant: 'KHUSH SHA',      // normalizeMerchant(merchant_raw)
  card_last4: '1111',         // string or null
  payment_method: 'Mada Apple Pay', // string or null
  txn_at: '2026-11-03T18:50:00+03:00', // string or null
  bank: 'snb'
}
```

## Fixtures (`tests/fixtures/sms/`)
`<name>.txt` holds the SMS exactly (UTF-8, keep invisible characters); `<name>.json` holds the expected `parseSms` result (`null` allowed). Optional `<name>.sender` holds a sender string. `tests/parser.test.js` loops over every `.txt`, and also unit-tests `normalizeText`, `parseMoney`, `parseSlashDate`, `normalizeMerchant`, `redactSms`, `ignoreReason`.

Required fixtures: `snb-pos-apple-pay`, `alrajhi-pos-apple-pay` (with U+061C before the date line, as in Plan.md), `barq-online-usd`, plus synthetic variants clearly named `synthetic-*`: `synthetic-snb-arabic-digits` (amount and date in `٠-٩`), `synthetic-alrajhi-thousands` (`SAR 1,250.50`), `synthetic-barq-sar` (no bracket, SAR), `synthetic-otp-ar`, `synthetic-otp-en`, `synthetic-declined-ar`, `synthetic-unknown` (an unrelated bank message → `null`).
