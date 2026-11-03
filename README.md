# Iqtifaa

A personal expense tracker for one person and one iPhone. Bank SMS messages for card purchases are captured by an iOS Shortcut automation. Each purchase asks one question, "what was this for?", and the answer is saved with one tap. Everything is stored in a Google Sheet and shown in a home-screen dashboard with monthly budgets and a savings target. The cost is zero.

## Architecture

1. An iOS Message automation runs the **Log Expense** Shortcut when a bank SMS arrives. The Shortcut only forwards the text.
2. A Google Apps Script Web App parses the SMS, dedupes it, learns merchants, and returns the category choices.
3. The Google Sheet is the database, with five tabs.
4. The Shortcut sends the chosen category back to the same Web App.
5. A static PWA dashboard reads the Web App with the token and shows budgets, the inbox and transactions.

## Repository layout

```
src/parser/        pure JS SMS parser (source of truth)
src/core/          pure JS API logic, summaries, rules, cycles
apps-script/       Apps Script adapter (router, Sheet store, lock, triggers)
dashboard/         PWA (static files)
scripts/           build, dev server, deploy
tests/             vitest tests and SMS fixtures
docs/              setup guides
specs/             technical plan and contracts
```

## Commands

- `npm install`: install dependencies (Node 20 or newer).
- `npm test`: run the tests with vitest.
- `npm run dev`: start the local server at http://localhost:5173 with an in-memory store. Use the token `dev-token`.
- `npm run build`: regenerate `apps-script/lib/Lib.js` from `src/`.
- `npm run deploy`: run the tests, build, push to Apps Script, and redeploy the existing Web App. Needs `.deployment-id` at the repo root.

## Documentation

- [docs/sheet-setup.md](docs/sheet-setup.md): create the Sheet, the Apps Script project, the token, the triggers and the first deployment.
- [docs/shortcut-setup.md](docs/shortcut-setup.md): build the Log Expense Shortcut, the bank automations, the evening reminder and the recovery Shortcut.
- [Plan.md](Plan.md): the product plan, data model, API and phases.
- [specs/001-expense-tracker/](specs/001-expense-tracker/): the technical plan and the contracts for the API and core modules.

Secrets and private files stay out of git: `.clasp.json`, `.deployment-id`, `.env`, and any SMS fixture with real data.

## Hosting the dashboard on GitHub Pages

The dashboard is the `dashboard/` folder. It contains no data and no secrets, so the repo can be public.

1. In the repo settings, open **Pages** and set the source to **GitHub Actions**.
2. Add a Pages workflow that uploads the `dashboard/` folder as the Pages artifact (for example with `actions/upload-pages-artifact` and `actions/deploy-pages`). This workflow is not in the repo yet.
3. After the workflow runs, the dashboard is at `https://<your-user>.github.io/<repo>/`.

Install it on the iPhone:

1. Open the dashboard URL in Safari.
2. Tap **Share**, then **Add to Home Screen**.
3. Open the new icon from the Home Screen.

First run: the dashboard asks for two values once. Paste the **Web App URL** (`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`) and the **API token** from `docs/sheet-setup.md`. They are stored in the browser on the phone only. Nothing is written to the repo.
