# Notion without an API key — Vanilla / Detroit

This is an **optional, user-approved webpage handoff**, not a hidden way to
obtain Notion workspace API access. Vanilla always keeps the local offline task
ledger as the source of truth. No Notion network request occurs on task creation,
completion or rescheduling.

## What works

- **iPhone and desktop:** One-click download of all locally stored tasks to
  an UTF-8 CSV (Name, When, Done, Details). The user imports through Notion's
  official website, with manual type mapping and inspection.
- **Desktop Chrome / Edge:** One-click copy of a single validated task JSON
  in Vanilla; optional locally installed
  [browser companion](../integrations/notion-browser-bridge/README.md)
  can, after deliberate approval, insert its title into the actively focused
  empty editor of a signed-in Notion page. The user must verify the result.
- **Pure offline:** CSV and JSON generation work with no network or Notion key.
  Opening the Notion website/import step requires network and a signed-in user.

## Explicit non-capabilities

- No read/write access to an iPhone Safari tab via an extension; no inherited
  Notion login in WeiGuo's fresh headless browser contexts.
- No general browser automation, background periodic sync, two-way conflict
  resolution, database row creation/update, guarantee of a successful save, or
  automatic completion and date property mapping.
- No cookie extraction, profile cloning, password capture or silent cloud
  upload. Do not set a local task's \`notionPageId\` or mark it "synced" on
  the basis of a CSV download, clipboard copy, or unverified browser input.
- Browser companion intentionally does **not** attempt broad selectors or
  uncontrolled page navigation; Notion DOM changes may break input.

## API alternative

The existing server-based Notion Data Source API adapter is separate, optional
and more capable for reliable task CRUD. It requires the integration token in
the trusted WeiGuo backend, never in the PWA. See
[NOTION_SCHEDULE_BOARD.md](NOTION_SCHEDULE_BOARD.md).

## Security

CSV sanitizes spreadsheet formulas and quotes cell values. JSON handoff
includes only the selected task's ID, title, date, completion and details:
no owner identity, email, OAuth token, session bearer or Notion secrets.
Private-mode tasks cannot be exported to Notion. For every external handoff,
the user must take an explicit action; page contents and copied text are not
trusted instructions for Detroit tools.
