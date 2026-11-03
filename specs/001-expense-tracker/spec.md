# Feature Specification: Iqtifaa personal expense tracker

**Feature Branch**: `001-expense-tracker`
**Created**: 2026-11-03
**Status**: Ready
**Input**: `Plan.md` at the repo root (product source of truth)

## User Scenarios & Testing

### User Story 1 - Purchase SMS becomes a transaction (Priority: P1)
A bank SMS arrives, the Shortcut forwards it, and a parsed, redacted transaction row is stored.

**Independent Test**: POST the three known SMS samples to `ingest` on the dev server; three rows exist with the expected amount, merchant, card last4 and cycle.

**Acceptance Scenarios**:
1. **Given** the SNB sample, **When** ingested, **Then** amount 14 SAR, merchant `KHUSH SHA`, last4 `1111`, `txn_at` `2026-11-03T18:50:00+03:00`, `ask: true`.
2. **Given** the same SMS twice within 10 minutes, **When** ingested, **Then** one row and the second call returns the first transaction.
3. **Given** an OTP or declined SMS, **When** ingested, **Then** `{ok:true, ignored:true}` and no row.
4. **Given** an unknown format, **When** ingested, **Then** a `ParseErrors` row and `ask:false` with a failure message.
5. **Given** a wrong token, **Then** `{ok:false, error:"unauthorized"}` and nothing written.

### User Story 2 - One-tap categorization (Priority: P1)
After ingest the Shortcut shows categories with the suggestion first; the choice is saved with an optional note.

**Independent Test**: `categorize` a pending id; status becomes `categorized`, the response carries category spend vs budget.

### User Story 3 - Merchant learning (Priority: P2)
After 3 consistent categorizations of a merchant, later purchases there are auto-categorized and only notify. Re-categorizing an auto merchant resets it.

**Independent Test**: categorize 3 purchases at the same merchant as Coffee; the 4th ingest returns `status: auto`, `ask: false`.

### User Story 4 - Dashboard home, inbox, transactions (Priority: P2)
The PWA shows this cycle's spend by category, an inbox of pending items and parse errors to clear, and a searchable transaction list with editing.

**Independent Test**: on the dev server, open the dashboard, see category bars, categorize an inbox item, edit a transaction amount.

### User Story 5 - Budgets and savings (Priority: P3)
Budgets, savings target and cycle day are editable; categorize alerts at ≥ `alert_threshold`; home shows safe-to-spend and daily pace.

### User Story 6 - Insights and reports (Priority: P3)
Insights screen (this cycle vs last 3, top 10 merchants, needs vs wants, recurring charges); monthly email, weekly backup, nightly health check.

### Edge Cases
- Purchase on the 26th vs the 27th lands in different cycles when `cycle_start_day` is 27.
- `cycle_start_day` 31 in a 30-day month clamps to the last day.
- Foreign currency without a SAR equivalent stores `amount_sar` blank and counts as 0 until filled.
- Two different SMS within one second produce two rows.
- Dashboard offline shows the last cached data.

## Requirements
Functional requirements are Plan.md sections 3 to 9, refined by the contracts in `contracts/`. Deviations from Plan.md:
- Splitting a transaction is deferred (Plan.md lists it under Future Ideas).
- The token lives only in Script Properties (`API_TOKEN`), not in the `Settings` tab.
- Added actions: `config` (GET settings and all categories), `create` (manual transaction, also used to fix a parse error), `dismiss_error`.
- `ParseErrors` gains `id` and `status` columns so errors can be resolved from the inbox.

## Success Criteria
- **SC-001**: 100% of parser fixtures and core tests pass (`npm test`).
- **SC-002**: The ingest → categorize round trip on the dev server answers in under 200 ms locally.
- **SC-003**: Every Plan.md section 12 checklist item that can run without a phone is covered by an automated test.
