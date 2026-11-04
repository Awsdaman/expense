# iPhone Shortcuts setup

This guide builds the Shortcuts and the automations on the iPhone. The Shortcuts hold no business logic. They send the SMS text to the API, show the choices the API returns, and send the answer back. Parsing, dedupe and learning all happen on the server (Plan.md §6).

Before you start, you need:
- The Web App URL and the API token from `docs/sheet-setup.md`, Part 4 and Part 3b.
- The exact sender names of your banks as they appear in Messages (for example `AlRajhiBank`). Fill these in at step B1. You can read them from an SMS thread: the name at the top of the thread is the sender.
- Your salary day for the Sheet (`cycle_start_day`). This is set in the Sheet, not here.

Menu and button labels below are the iOS 17 and later labels. If your iOS version shows a different label, use the one that matches the meaning. Action names are the names the Shortcuts app shows when you search for them in the action picker.

Throughout this guide:
- `API_URL` means the Web App URL, `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`.
- `TOKEN` means the API token.
- A "magic variable" is a blue or purple chip you pick from the list above the keyboard. Pick the variable, do not type its name.

---

## Quick install (replaces Parts A, C1 and D)

The three Shortcuts are ready-made, signed files. They hold no URL or token.

1. On the iPhone, open https://awsdaman.github.io/expense/shortcuts/index.html in Safari. The dashboard also links to it, under Settings → Connection.
2. Tap **1. Log Expense**. Tap **Allow** or **Download** if Safari asks, then **Add Shortcut**.
3. When it asks, paste the Web App URL (`API_URL`), then the token (`TOKEN`).
4. Repeat for **2. Iqtifaa Pending**, which asks for the same two values, and **3. Log last bank SMS**, which asks for nothing.
5. Build the automations by hand: Part B for each bank, then Part C2. Apple does not let automations be imported.

To change the URL or token later, open the Shortcut in the Shortcuts app and edit its first two Text actions.

Log Expense skips the optional note in step 17. It also notifies you when the API rejects a request, for example after a token change.

The sources are in `shortcuts/*.cherri`. To rebuild the files, run `scripts/build-shortcuts.js` (see its header). Rebuilding sends the Shortcut, with no URL or token, to RoutineHub's HubSign service, because signing on Windows needs it.

Parts A, C1 and D below describe the same Shortcuts built by hand.

---

## Part A: Build "Log Expense"

This Shortcut is run by the bank automations (Part B) and by the recovery Shortcut (Part D). It takes the SMS text as its input.

Create it: open the **Shortcuts** app, tap **+**, then tap the Shortcut name at the top and rename it **Log Expense**.

### A1. Store the URL and the token

1. Add action **Text**. Paste the Web App URL (`API_URL`) into the text box.
2. Add action **Set Variable**. Name it `ApiUrl`. The Set Variable action takes the input from the previous action, so the Text is stored.
3. Add action **Text**. Paste the token (`TOKEN`).
4. Add action **Set Variable**. Name it `Token`.

Keep these four actions at the top. To rotate the token or change the URL later, you change only these two Text actions.

### A2. Send the SMS to the API

5. Add action **Get Contents of URL**.
   - **URL**: tap the field, then choose the variable `ApiUrl`.
   - Tap **Show More** if needed, then set **Method** to **POST**.
   - **Request Body**: choose **JSON**.
6. Add three fields to the JSON body. Tap **Add new field** for each one:
   - Key `action`, type **Text**, value `ingest`.
   - Key `token`, type **Text**, value: the variable `Token`.
   - Key `sms`, type **Text**, value: the magic variable **Shortcut Input**.

   Do not add a `sender` field. The Shortcut cannot read the sender reliably. The server works without it.

   If your iOS version only offers **File** for the request body, add a **Dictionary** action first with these keys (`action` text `ingest`, `token` variable `Token`, `sms` variable **Shortcut Input**), then set **Request Body** to **File** and choose the Dictionary variable.

Note: the Web App URL redirects once. Shortcuts follows the redirect automatically. The token is in the JSON body for this POST.

7. Add action **Get Dictionary from**. Its input is the **Contents of URL** magic variable from step 5. The output is a Dictionary with the API response.

### A3. Stop when there is nothing to ask

8. Add action **Get Dictionary Value**. Key: `ignored`. Input: **Dictionary** from step 7.
9. Add action **If**. Condition: the **Dictionary Value** from step 8 **is** `true`.
   - Inside the If: add action **Stop This Shortcut**.
   - Add action **End If**.

   The server always sends `ignored` and `ask` as true/false. `ignored` is true for OTPs, declined payments, login alerts and marketing.

10. Add action **Get Dictionary Value**. Key: `ask`. Input: **Dictionary**.
11. Add action **If**. Condition: the **Dictionary Value** from step 10 **is** `false`.
    - Inside the If, add action **Get Dictionary Value**. Key: `message`. Input: **Dictionary**.
    - Add action **Show Notification**. Title: `Iqtifaa`. Body: the **Dictionary Value** (`message`).
    - Add action **Stop This Shortcut**.
    - Add action **End If**.

    `ask` is `false` for auto-categorized purchases, incoming money, refunds with a known category, and SMS that could not be parsed. The `message` says which one. For an unparsed SMS, the message tells you it is waiting in the dashboard inbox.

### A4. Ask for the category

12. Add action **Get Dictionary Value**. Key: `prompt`. Input: **Dictionary**.
13. Add action **Get Dictionary Value**. Key: `categories`. Input: **Dictionary**.
14. Add action **Get Dictionary Value**. Key: `txn`. Input: **Dictionary**.
15. Add action **Get Dictionary Value**. Key: `id`. Input: the **Dictionary Value** from step 14 (`txn`).

    This is the transaction id you send back in step 22.

16. Add action **Choose from List**.
    - **List**: the **Dictionary Value** from step 13 (`categories`).
    - **Prompt**: the **Dictionary Value** from step 12 (`prompt`).
    - Leave **Select Multiple** off.

    The server returns the categories with the suggested one first, and `Uncategorized` last. Tap a category to choose it.

    If you tap outside the list or cancel, the Shortcut stops. The purchase stays `pending` and shows in the dashboard inbox. This is the safety net.

17. Optional: add action **Ask for Input**.
    - **Input Type**: **Text**.
    - **Prompt**: `Note (optional)`.
    - **Default Answer**: leave empty.

    Tapping **Done** with an empty field is fine. To skip this step entirely, delete the action and leave `note` out of step 22. Decide this during the Phase 2 tests.

### A5. Send the choice back

18. Add action **Get Contents of URL**.
    - **URL**: the variable `ApiUrl`.
    - **Method**: **POST**.
    - **Request Body**: **JSON**.
19. Add field: key `action`, type **Text**, value `categorize`.
20. Add field: key `token`, type **Text**, value the variable `Token`.
21. Add field: key `id`, type **Text**, value the **Dictionary Value** from step 15 (`id`).
22. Add field: key `category`, type **Text**, value the **Chosen Item** magic variable from step 16.
23. Add field: key `note`, type **Text**, value the **Provided Input** magic variable from step 17. If you skipped step 17, leave this field out.
24. Add action **Get Dictionary from**. Input: **Contents of URL** from step 18.
25. Add action **Get Dictionary Value**. Key: `alert`. Input: **Dictionary** from step 24.
26. Add action **If**. Condition: the **Dictionary Value** from step 25 **has any value**.
    - Inside the If, add action **Show Notification**. Title: `Iqtifaa`. Body: the **Dictionary Value** from step 25.
    - Add action **End If**.

    `alert` appears only when the category is at or above the alert threshold, for example `Food & Restaurants: 82% of budget used`.

27. Optional: add a check for failures. Get Dictionary Value with key `ok`, then an If with condition **is** `false`, and inside it a Show Notification with the body `Not saved. Check the dashboard inbox.` The server response has `ok` on every reply.

Save the Shortcut. Tap the name at the top, then **Done**.

---

## Part B: Bank automations (one per bank)

Create one automation for each bank. The Message trigger must be set up separately for each sender name.

Create one: open the **Shortcuts** app, tap the **Automation** tab at the bottom, tap **+**, then **Create Personal Automation**.

### B1. Set up the Message trigger for one bank

1. Choose **Message**.
2. Tap **Sender**, then **Add Sender**. Type the bank's sender name exactly as it shows in Messages (for example `AlRajhiBank`). If the field only offers contacts, type the name in the search field and pick the sender name when it appears. Do not add a contact.

   **Fill in the sender names for each bank here.** You need one automation for each:
   - SNB: `<SNB sender name>`
   - Al Rajhi Bank: `<Al Rajhi sender name>`
   - Barq: `<Barq sender name>`

3. Leave **Message Contains** empty. Filtering is done on the server.
4. Tap **Next**.
5. Tap **Add Action**, search for **Run Shortcut**, and choose it.
6. Set the shortcut to **Log Expense**.
7. Make sure the input of **Run Shortcut** is the message from the trigger. If the input shows **None**, tap the input field and choose **Shortcut Input**.
8. Tap **Next**.
9. Turn **Run Immediately** on.
10. Turn **Notify When Run** off.
11. Tap **Done**.

Repeat for each bank. Use a separate automation for each sender.

Check: the three automations are listed in the Automation tab. Open one: the sender name matches the one in Messages.

---

## Part C: Evening reminder

This is a separate Shortcut that asks the API how many purchases are waiting, and reminds you at 9:30 PM.

### C1. Build "Iqtifaa Pending"

Create it: tap **+** in the Shortcuts app, rename it **Iqtifaa Pending**.

1. Add action **Text**. Type the full URL as one line, with the Web App URL and the token filled in:

   `API_URL?action=pending_count&token=TOKEN`

   GET requests carry the token in the URL query, so this is the only place it goes in this Shortcut. The notification does not show it.

2. Add action **Get Contents of URL**. The method is GET (the default). URL: the **Text** from step 1.
3. Add action **Get Dictionary from**. Input: **Contents of URL**.
4. Add action **Get Dictionary Value**. Key: `count`. Input: **Dictionary**.
5. Add action **If**. Condition: **Dictionary Value** (`count`) **is greater than** `0`.
   - Inside the If, add action **Show Notification**. Title: `Iqtifaa`. Body: `You have` followed by the **Dictionary Value** (`count`) followed by `items to check in the Iqtifaa inbox.`
   - Add action **Open URLs**. URL: your dashboard URL (the GitHub Pages address from the README).

     This makes Safari open the dashboard when the reminder fires. A notification tap alone cannot open a web page. Remove this action if you want the notification only.
   - Add action **End If**.

### C2. Create the automation

1. In the **Automation** tab, tap **+**, then **Create Personal Automation**.
2. Choose **Time of Day**. Set the time to **9:30 PM**. Choose **Daily**.
3. Tap **Next**, then **Add Action**, search for **Run Shortcut**, and choose **Iqtifaa Pending**.
4. Tap **Next**.
5. Turn **Run Immediately** on.
6. Turn **Notify When Run** off.
7. Tap **Done**.

Check: run **Iqtifaa Pending** once by hand. With no pending items it shows nothing. With pending items, it shows the notification.

---

## Part D: Recovery Shortcut "Log last bank SMS"

Use this when a bank SMS was not logged. Typical causes: no network at the time (airplane mode), or the automation failed.

1. Open the bank SMS in Messages. Tap and hold the message text, then tap **Copy**. Copy only the message body.
2. Create a Shortcut named **Log last bank SMS**.
3. Add action **Get Clipboard**.
4. Add action **Run Shortcut**. Set it to **Log Expense**. The input is the **Clipboard** magic variable from step 3. If the input shows **None**, tap the input field and choose the **Clipboard** variable.
5. Save.

Run it from the Shortcuts app or from the Home Screen. The same questions appear as in the automatic flow.

Note: a message that was already logged is caught by the server's dedupe within 10 minutes. The response returns the existing transaction with `ask` false, so you are not asked a second time. If it is still uncategorized, clear it from the dashboard inbox.

---

## Part E: Phase 2 tests on the phone

Run these after Parts A to C are built, and after the API passes the checks in `docs/sheet-setup.md`, Part 5. Check the Sheet after each test.

1. **Real small purchase**: make a small card purchase (or a small online payment). Within a few seconds, the notification or category list appears. Pick a category. Check that the row is in `Transactions` with `status` = `categorized` and the right `category`.
2. **Locked phone**: lock the phone, then make a real purchase. The automation runs. If it needs you to unlock to answer the list, unlock and answer. Check the row. If you leave it unanswered, the row stays `pending` and shows in the dashboard inbox and in the 9:30 PM reminder.
3. **Two SMS back to back**: trigger two purchases within a minute. Both rows appear, with different `id` values and no mixing of data. If the second one arrives while the first list is open, answer the first, then the second.
4. **Airplane mode**: turn airplane mode on, make a purchase, wait for the SMS to arrive, then turn airplane mode off. The Shortcut fails, but the SMS stays in Messages. Run **Log last bank SMS** (Part D) to recover it. Check the row exists once.
5. **Repeat SMS**: trigger the same automation with the same SMS text within 10 minutes (Part D works for this). Only one row appears in `Transactions`.
6. **Ignored message**: send an OTP-style text from the bank sender, or use a message type the server ignores. No prompt appears. The Shortcut stops silently.
7. **Reminder**: leave one purchase `pending`. Run **Iqtifaa Pending** by hand. The notification shows the count. Check that the count matches the Sheet.
8. **Rules learning**: categorize the same merchant to the same category three times. The fourth purchase from that merchant is categorized automatically, with a notification that says `(auto)`.
9. **Budget alert**: when a category crosses 80 percent of its budget, the notification with the `alert` text appears right after the purchase.

Record anything that fails. Fix the server first if the API response is wrong, or the Shortcut if the response is right and the action is wrong.
