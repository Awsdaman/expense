# Iqtifaa Constitution

## Core Principles

### I. Pure core, thin platforms
All parsing and business logic lives in `src/parser/` and `src/core/` as pure ES modules with no Apps Script globals, no DOM and no Node built-ins. Apps Script (`apps-script/`) and the local dev server (`scripts/dev-server.js`) are thin adapters that supply a store, a clock, a lock and a token. If logic seems to need a platform API, pass the result in as an argument.

### II. Fixture first (non-negotiable for the parser)
Every SMS format gets a fixture in `tests/fixtures/sms/` with an expected JSON before the parser change that handles it. Unknown formats return `null`; the parser never guesses. All tests pass before every deploy.

### III. Headers, not positions
Sheet columns are read and written by header name only. Adding a column never breaks code.

### IV. Locked writes
Every Sheet write runs inside `LockService`. Two SMS arriving together never corrupt rows.

### V. Privacy by construction
Never store or log full card numbers, IBANs, account numbers, balances or OTPs. The API token lives in Script Properties and the dashboard's `localStorage`, never in git. `.clasp.json`, `.env` and real SMS stay out of git.

### VI. Logic-free Shortcut
The iOS Shortcut only forwards the SMS and shows what the API returns. Any change that seems to need Shortcut edits moves into the API instead.

### VII. Simplicity
Minimum code for the current phase. No frameworks in the dashboard, no speculative options, no abstractions with one caller.

## Constraints

- Node 20+, ES modules, `vitest` for tests, `@google/clasp` for deploy.
- Files in `src/` are concatenated into Apps Script by `scripts/build-appsscript.js`, so: named exports only, single-line `import { a, b } from './x.js'` statements, every top-level name unique across `src/`, top-level code limited to `function` declarations and `const` literals.
- Deploy only through `scripts/deploy.sh` (tests, build, push, redeploy the same deployment ID).

## Governance

This constitution overrides other guidance in the repo. `Plan.md` is the product source of truth; `specs/001-expense-tracker/` records the technical decisions taken from it. Changes to a contract in `specs/001-expense-tracker/contracts/` update the contract file in the same change.

**Version**: 1.0.0 | **Ratified**: 2026-11-03 | **Last Amended**: 2026-11-03
