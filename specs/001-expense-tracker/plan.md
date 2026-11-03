# Implementation Plan: Iqtifaa personal expense tracker

**Branch**: `001-expense-tracker` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)

## Summary
Bank SMS → iOS Shortcut → Apps Script Web App → Google Sheet, read by a static PWA. The key technical choice beyond Plan.md: **the whole API is a pure function** `handleRequest(req, store, env)` in `src/core/api.js`. Apps Script supplies a Sheet-backed store, a lock and the token; the local dev server supplies an in-memory store. That makes every endpoint testable with vitest and lets the dashboard run against a real API locally before anything is deployed.

## Technical Context
**Language**: JavaScript (ES2022 modules), Node 20+ for tooling
**Dependencies**: `vitest` (tests), `@google/clasp` (deploy). Dashboard: no framework, no build step
**Storage**: Google Sheet, five tabs (Plan.md §3), accessed by header name
**Testing**: vitest; parser fixtures in `tests/fixtures/sms/`
**Target**: Apps Script V8 runtime; iPhone Safari PWA
**Constraints**: Apps Script has no modules, so `scripts/build-appsscript.js` concatenates `src/parser` + `src/core` into `apps-script/lib/Lib.js` (see constitution constraints)

## Constitution Check
I Pure core: API logic in `src/core/api.js`, platforms are adapters. ✅
II Fixture first: parser tasks write fixtures and tests before parsers. ✅
III Headers: store interface is header-keyed objects only. ✅
IV Locked writes: `apps-script/Code.js` wraps every POST in `LockService`. ✅
V Privacy: `redactSms` before storage; token in Script Properties. ✅
VI Logic-free Shortcut: Shortcut reads `ask`, `message`, `prompt`, `categories`, `alert` only. ✅
VII Simplicity: no framework, no build for the dashboard. ✅

## Project Structure
```
apps-script/        appsscript.json, Code.js, sheet/SheetStore.js, sheet/Setup.js, triggers/Triggers.js, lib/Lib.js (generated)
src/parser/         normalize.js amount.js dates.js merchant.js redact.js ignore.js index.js banks/{barq,alrajhi,snb}.js
src/core/           settings.js format.js cycle.js hash.js rules.js summary.js report.js api.js
src/dev/            memory-store.js seed.js   (not shipped to Apps Script)
dashboard/          index.html manifest.webmanifest sw.js styles.css icons/ src/{app,api,ui,format}.js src/screens/*.js
scripts/            build-appsscript.js deploy.sh dev-server.js make-icons.js
tests/              parser.test.js core.test.js api.test.js fixtures/sms/
docs/               sheet-setup.md shortcut-setup.md
```

## Contracts
- [contracts/parser.md](contracts/parser.md): `parseSms` and its helpers
- [contracts/core.md](contracts/core.md): settings, cycles, hashing, rules, summary, reports
- [contracts/api.md](contracts/api.md): store interface, every action's request and response, adapters
- [contracts/dashboard.md](contracts/dashboard.md): design direction, screens, client

## Phases
Plan.md phases map to tasks.md phases. Phase 0 (scaffold) is done by the orchestrator. Phases 1 to 6 are code and are built together because the pure core makes them independent of phone testing; the phone-only acceptance steps (real purchase, locked phone, Shortcut build) stay manual and are documented in `docs/`.
