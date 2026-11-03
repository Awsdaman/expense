# Tasks: Iqtifaa personal expense tracker

**Input**: `spec.md`, `plan.md`, `contracts/*.md` in this folder. `[P]` = parallel-safe (disjoint files). `[A#]` = agent work package.

## Phase 0: Setup (orchestrator)
- [x] T001 Spec Kit artifacts: constitution, spec, plan, contracts, tasks
- [x] T002 `package.json` (type module, vitest, clasp, scripts), `.gitignore`, `CLAUDE.md`, `vitest.config.js`
- [x] T003 `scripts/build-appsscript.js` (concatenate `src/parser` + `src/core` into `apps-script/lib/Lib.js`), `scripts/deploy.sh`

## Phase 1: Parser (US1) [A1]
- [x] T010 [A1] Fixtures + expected JSON in `tests/fixtures/sms/` (contracts/parser.md list)
- [x] T011 [A1] `tests/parser.test.js` (fixture loop + helper unit tests), confirm it fails
- [x] T012 [A1] `src/parser/normalize.js`, `amount.js`, `dates.js`, `merchant.js`, `redact.js`, `ignore.js`
- [x] T013 [A1] `src/parser/banks/{barq,alrajhi,snb}.js`, `src/parser/index.js`; all parser tests pass

## Phase 2: Core helpers (US1–US6) [A2] [P]
- [x] T020 [A2] `tests/core.test.js` first, then `src/core/settings.js`, `format.js`, `cycle.js`, `hash.js`
- [x] T021 [A2] `src/core/rules.js` (US3), `summary.js` (US4–US6), `report.js` (US6); all core tests pass

## Phase 3: API handler + dev store (US1–US5) [A3] [P]
- [x] T030 [A3] `src/dev/memory-store.js`, `tests/api.test.js` covering Plan.md §12 checklist items that run without a phone
- [x] T031 [A3] `src/core/api.js` all actions per contracts/api.md; all api tests pass

## Phase 4: Apps Script adapter (US1–US6) [A4] [P]
- [x] T040 [A4] `apps-script/appsscript.json`, `Code.js`, `sheet/SheetStore.js`, `sheet/Setup.js`, `triggers/Triggers.js`, `.claspignore`

## Phase 5: Dev server + seed (US4) [A5] [P]
- [x] T050 [A5] `src/dev/seed.js` (two cycles of realistic data), `scripts/dev-server.js`

## Phase 6: Dashboard foundation (US4) [A6] [P]
- [x] T060 [A6] `dashboard/index.html`, `styles.css`, `manifest.webmanifest`, `sw.js`, `scripts/make-icons.js` + generated icons
- [x] T061 [A6] `dashboard/src/app.js`, `api.js`, `format.js`, `ui.js`, `screens/setup.js`, `screens/home.js`

## Phase 7: Dashboard screens (US4–US6) [A7] [A8] — after A6
- [x] T070 [A7] `dashboard/src/screens/inbox.js`, `screens/transactions.js`
- [x] T071 [A8] `dashboard/src/screens/insights.js`, `screens/settings.js`

## Phase 8: Docs [A9] [P]
- [x] T080 [A9] `docs/sheet-setup.md`, `docs/shortcut-setup.md`, `README.md`

## Phase 9: Verification (orchestrator)
- [x] T090 `npm test` green; `npm run build` produces `apps-script/lib/Lib.js` that parses as a classic script (`node --check`)
- [x] T091 Run the dev server, drive the dashboard in the browser: setup, home, inbox categorize + ignore, transactions edit, insights, settings save; light and dark; phone width
- [x] T092 Review pass against the constitution and the unslop checklist; fix findings
