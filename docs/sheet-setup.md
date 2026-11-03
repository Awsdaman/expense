# Sheet and Apps Script setup

This guide sets up the Google Sheet (the database), the Apps Script API bound to it, and the first Web App deployment. Do the steps in order. Each step ends with something you can check.

You need:
- A Google account with 2-step verification on (Plan.md §9).
- Node.js 20 or newer (`node -v` to check).
- Git Bash or another POSIX shell for the commands below. Paths are relative to the repo root unless stated.

---

## Part 1: Create the Sheet and the bound script

1. Open https://sheets.new while signed in to your Google account.
2. Rename the spreadsheet to `Iqtifaa`.
3. Keep the sharing setting as it is. Do not share the file and do not use "Anyone with the link" (Plan.md §9).
4. In the menu, click **Extensions → Apps Script**. A script editor opens in a new tab. This is a script bound to the Sheet, so it can find the Sheet without an ID.
5. In the editor, click the gear icon **Project Settings** in the left sidebar.
6. Under **IDs**, copy the **Script ID**. It is a long string of letters, digits, `-` and `_`. This is not the deployment ID. You need it in Part 2, step 4.
7. Optional: in **Project Settings**, rename the project to `Iqtifaa API`.

Check: Project Settings shows a Script ID.

---

## Part 2: Install and push the code from the repo

1. Enable the Apps Script API for your account. Open https://script.google.com/home/usersettings and turn **Google Apps Script API** on. `clasp` needs this. Skip it and `clasp push` fails with a 403 error.
2. In a terminal at the repo root, install the dependencies:

   ```bash
   cd "/c/Users/Aous/My Apps/Iqtifaa"
   npm install
   ```

3. Log in with clasp:

   ```bash
   npx clasp login
   ```

   A browser opens. Sign in with the same Google account that owns the Sheet, and allow access. clasp stores the login outside the repo.

4. Create `.clasp.json` at the repo root. Replace `<id>` with the Script ID from Part 1, step 6. The file is gitignored, so it stays out of git.

   ```json
   {"scriptId": "<id>", "rootDir": "apps-script"}
   ```

   You can create it with a text editor, or with this command (replace `<id>` first):

   ```bash
   printf '{"scriptId": "<id>", "rootDir": "apps-script"}\n' > .clasp.json
   ```

5. Build the Apps Script bundle. This copies the pure modules in `src/` into `apps-script/lib/Lib.js`:

   ```bash
   npm run build
   ```

   Check: the command prints `Wrote .../apps-script/lib/Lib.js`.

6. Push the code to the Apps Script project:

   ```bash
   npx clasp push
   ```

   If clasp asks whether to overwrite the manifest file, type `y`.

   Check: the output lists `apps-script/Code.js`, `apps-script/lib/Lib.js` and the other files. Refresh the editor tab. The files are there.

7. Open the editor from the terminal if you prefer (optional):

   ```bash
   npx clasp open
   ```

Note: from now on, do not edit the code in the Apps Script editor. Edit in the repo, then run `npm run build` and `npx clasp push` (or `npm run deploy`, Part 4). Edits made in the editor are overwritten by the next push.

---

## Part 3: One-time setup from the Apps Script editor

Run each function below from the editor. Switch back to the editor tab. The function picker is the dropdown next to the **Run** button at the top.

### 3a. `setupSheet`

8. In the function picker, choose `setupSheet`, then click **Run**.
9. A permission dialog appears ("Authorization required"). Click **Review permissions**, choose your account, and allow access to the spreadsheet. If Google shows "Google hasn't verified this app", click **Advanced**, then **Go to Iqtifaa API (unsafe)**. This is your own script, so this is expected.
10. Wait for the Execution log at the bottom to show that the run finished without errors.

What `setupSheet` does (it is safe to run again: it only creates missing tabs and seeds empty tables):
- Creates these five tabs with headers in row 1:
  - `Transactions`: `id`, `received_at`, `txn_at`, `type`, `direction`, `amount`, `currency`, `amount_sar`, `merchant_raw`, `merchant`, `card_last4`, `payment_method`, `bank`, `category`, `note`, `status`, `cycle`, `dedupe_hash`, `raw_sms`
  - `Categories`: `name`, `emoji`, `monthly_budget`, `kind`, `active`, `sort`
  - `MerchantRules`: `merchant`, `display_name`, `category`, `hits`, `auto`, `updated_at`
  - `Settings`: `key`, `value`
  - `ParseErrors`: `id`, `received_at`, `raw_sms`, `error`, `status`
- Seeds `Categories` with the 14 starter categories (Food & Restaurants, Coffee, Groceries, Fuel & Car, Transport, Shopping, Bills & Subscriptions, Health, Family, Home, Entertainment, Travel, Gifts & Charity, Other), each with a starter monthly budget.
- Seeds `Settings` with: `currency` = SAR, `cycle_start_day` = 27, `savings_target` = 3000, `alert_threshold` = 0.8, `auto_threshold` = 3, `timezone` = Asia/Riyadh.
- Makes row 1 frozen.

Check: go to the spreadsheet tab. There are five tabs with the names above, `Categories` has 14 rows, and `Settings` has 6 rows. Edit the Settings values now if you know your salary day (`cycle_start_day`) and savings target. You can also change them later from the dashboard.

Note: `setupSheet` uses the Sheet the script is bound to. You do not need a `SHEET_ID` Script Property. Only set one if the script is ever moved to a standalone project.

### 3b. `createApiToken`

11. In the function picker, choose `createApiToken`, then click **Run**.
12. Open the **Execution log** at the bottom of the editor after the run finishes. It shows a 48-character token once. Copy it into your password manager now. Do not paste it into a chat, a repo file, or a commit.

    If you miss it, run `createApiToken` again. It replaces the token, which means the Shortcut and the dashboard must be updated (see "Rotate the token" below).

Check: the token is stored as the Script Property `API_TOKEN`. You can see it in **Project Settings → Script Properties**. Do not copy the value from there into any file in the repo.

### 3c. `installTriggers`

13. In the function picker, choose `installTriggers`, then click **Run**. Accept any new permission prompts. The script needs to send email and copy the Sheet into Drive.

    Check: click the clock icon **Triggers** in the left sidebar. There are four time-driven triggers:
    - daily at 08:00 (monthly report on cycle start day)
    - weekly on Thursday at 20:00 (weekly nudge)
    - daily at 22:00 (health check)
    - weekly backup (copies the Sheet to a `Backups` folder in Drive, keeps the newest 8)

    `installTriggers` removes and recreates these, so it is safe to run again.

---

## Part 4: First deployment (Web App)

The Web App URL is what the Shortcut and the dashboard call. Create the deployment once. After that, redeploy the same deployment so the URL does not change.

14. Click **Deploy → New deployment** (top right of the editor).
15. Click the gear icon next to **Select type**, and choose **Web app**.
16. Fill in:
    - **Description**: `v1`
    - **Execute as**: **Me** (your account)
    - **Who has access**: **Anyone**

    "Anyone" is safe here because every request still needs the token (Plan.md §4 and §9). The URL is secret only in the sense that it should not be shared.
17. Click **Deploy**. If asked to authorize again, do so.
18. Copy the **Web app URL**. It has this form:

    `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`

    The `<DEPLOYMENT_ID>` is the part between `/s/` and `/exec`.
19. Save the deployment ID to a file named `.deployment-id` at the repo root. The file must contain only the ID on one line. It is gitignored. `scripts/deploy.sh` reads it.

    ```bash
    printf '%s\n' '<DEPLOYMENT_ID>' > .deployment-id
    ```

    Replace `<DEPLOYMENT_ID>` with the real value.

Option B, from the terminal (only if `apps-script/appsscript.json` has a `webapp` block with access `ANYONE`):

```bash
npx clasp deploy -d "v1"
```

The output has a line like `- <DEPLOYMENT_ID> @1`. Use that ID in step 19. Then open **Deploy → Manage deployments** in the editor and check that the access is **Anyone** and **Execute as** is **Me**. If it is not, delete this deployment and use Option A.

Important: do not click **New deployment** again. That creates a new URL, and the Shortcut and dashboard would need to change. For every later change, use `npm run deploy` (Part 5).

---

## Part 5: Verify the deployment

Replace `<DEPLOYMENT_ID>` and `<TOKEN>` with your values. Use `-L` so curl follows the redirect that Apps Script uses. The Shortcut follows it automatically.

20. Health check (no token needed):

    ```bash
    curl -L "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec"
    ```

    Expected output: `{"ok":true,"service":"iqtifaa"}`

21. Token check:

    ```bash
    curl -L "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?action=pending_count&token=<TOKEN>"
    ```

    Expected output: `{"ok":true,"count":0}`

22. Wrong token check (should be rejected and write nothing):

    ```bash
    curl -L "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?action=pending_count&token=wrong"
    ```

    Expected output: `{"ok":false,"error":"unauthorized"}`

Check: all three responses match. If step 20 returns an HTML login page, the deployment access is not **Anyone**. Fix it in **Deploy → Manage deployments**.

---

## Part 6: Later deploys

After the first deployment, change code only through the deploy script. It runs the tests, builds the bundle, pushes, and redeploys the same deployment ID.

```bash
npm run deploy
```

This runs `npm test`, `npm run build`, `npx clasp push --force`, and `npx clasp deploy -i <DEPLOYMENT_ID>`. The URL stays the same, so the Shortcut and the dashboard do not change.

---

## Rotate the token

Use this if the token was leaked, or if you lost it.

1. In the editor, run `createApiToken`. Copy the new token from the Execution log.
2. Update the token text action in the **Log Expense** Shortcut and in the **Iqtifaa Pending** Shortcut (see `docs/shortcut-setup.md`).
3. Update the dashboard: open it on the phone and enter the new token. If the dashboard has no field for it, clear the website data for the dashboard site in Safari settings, then enter the URL and new token again.
4. Test with `curl` (Part 5, step 21) using the new token.

Note: the old token stops working as soon as `createApiToken` runs. Any SMS that arrives before step 2 is finished is not written to the Sheet. It stays in Messages, so you can log it later with the "Log last bank SMS" Shortcut.

---

## Edit by hand

The Sheet is the database, and you can edit it directly.

- Rows are safe to edit by hand. The code finds columns by header name.
- Do not rename, reorder, or delete the header row. Adding a new column is safe.
- To hide a transaction from the inbox and totals, set its `status` to `ignored`.
- To hide a parse error, set its `status` in `ParseErrors` to `dismissed`.
- To give a merchant a readable name, set `display_name` on its row in `MerchantRules`. If there is no row for the merchant yet, add one with `merchant` (in uppercase, as shown in `Transactions.merchant`) and `display_name`. Leave `hits` = 0 and `auto` = FALSE.
- If you change `amount` on a SAR transaction, also set `amount_sar` to the same number. The totals use `amount_sar`.
- To hide a category without losing its history, set `active` to FALSE in `Categories`.
- To rename a category, use the dashboard settings screen. Renaming by hand means changing the name in `Categories`, in `Transactions.category` and in `MerchantRules.category`, or the old name stops matching.
- Keep the `cycle` column as text. It is stored like `2026-10`.
