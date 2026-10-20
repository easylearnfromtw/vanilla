# Vanilla → Notion Browser Bridge (experimental, API-key-free)

This Chrome/Edge desktop companion helps transfer ONE Vanilla local task title
into an **already signed-in, already-open Notion blank page**, with explicit user
interaction. It does not use a Notion API token, administrator token, or WeiGuo server.

## Use

1. On desktop Chrome or Edge, open Extensions > Developer mode > Load unpacked,
   and select this \`integrations/notion-browser-bridge\` directory.
2. In Vanilla → 本地排程, click \`複製到 Notion 網頁橋接\` for a task.
3. Open https://www.notion.so/, sign in in the browser if needed, create a
   **new blank page**, and click its **empty title editor** (cursor visible).
4. Click this extension's toolbar icon, paste the task JSON into its text area,
   and press the explicit confirmation button.
5. Check the resulting title **inside Notion**. Then set the scheduled date,
   completion checkbox and notes manually. There is no automatic success ack
   back to Vanilla and no remote synchronization marker.

The extension uses \`activeTab\` + \`scripting\` only after the explicit click,
checks the tab is https://notion.so or https://www.notion.so, and refuses to
overwrite nonempty editors. It does not load external code, persist credentials,
read cookies, scrape other Notion pages, or automatically click submit dialogs.

**Current limits:** Notion's editing DOM is controlled by Notion and can change.
This integration fills the *currently focused empty contenteditable* field,
not a reliably discovered Notion database title field. It fails closed if
Notion rejects DOM insertion. Verify correct field and content manually. It
does **not** set date, create an entire database row, sync in both directions,
run background automations, or claim successful persistence. It is not a
general browser agent.

## iPhone / iPad and no extensions

Apple iOS Safari does not run this unpacked Chrome extension. Instead,
Vanilla → 本地排程 → \`匯出 Notion CSV\` generates a local CSV that the user can
import through Notion's supported CSV import UI. After import, verify Notion
property types (Name/title, When/date, Done/checkbox, Details/text). The
format is portable, but Notion may initially create text columns requiring
manual conversion.

Both routes are independent from optional server-side Notion Integration API
sync. A website browser session is NOT the same as an API integration token,
and WeiGuo's disposable Playwright jobs cannot assume access to the user's
Notion login.
