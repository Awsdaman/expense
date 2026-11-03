# Iqtifaa: rules for Claude Code

Product source of truth: `Plan.md`. Technical decisions and contracts: `specs/001-expense-tracker/` (start with `plan.md`, then `contracts/`). Project principles: `.specify/memory/constitution.md`.

1. Read `Plan.md` before starting any phase; work one phase at a time.
2. Parser code is pure JS with no Apps Script globals. Write the fixture and failing test before any parser fix.
3. Access Sheet columns by header name only.
4. Wrap every Sheet write in `LockService`.
5. Never commit secrets, `.clasp.json`, or real SMS data. Token lives in Script Properties.
6. Never log full SMS text or amounts with card numbers to Stackdriver/console in production.
7. Deploy only through `scripts/deploy.sh`, which runs tests first and reuses the existing deployment ID.
8. Keep the iOS Shortcut logic-free; if a change seems to need Shortcut edits, move the logic into the API instead.

## How the code is laid out
- `src/parser/` and `src/core/` are pure ES modules. `src/core/api.js` exports `handleRequest(params, store, env)`, the whole API.
- `scripts/build-appsscript.js` concatenates them into `apps-script/lib/Lib.js` (generated, gitignored). Because of that: named exports only, single-line imports, every top-level name unique across `src/`, top-level code only `function` declarations and `const` literals.
- `apps-script/` is a thin adapter: router, Sheet-backed store, lock, triggers.
- `scripts/dev-server.js` runs the same API over an in-memory store and serves `dashboard/` at http://localhost:5173 (token `dev-token`).

## Commands
- `npm test` runs vitest.
- `npm run dev` starts the dev server.
- `npm run build` regenerates `apps-script/lib/Lib.js`.
