# Notion Schedule Board — Vanilla / Detroit

This is a backend-only Notion task/calendar adapter for an **opt-in** data source. It does not run a 24/7 task scheduler, send alerts, create Google Calendar events, or autonomously invoke Detroit tools. Notion persists tasks and due dates; Chronos/Persistent Jobs must be deployed separately for time-based execution.

## Components

- Merlin interprets the user's request; Diana recognizes @Notion, /Notion, /排程 and schedule intents, and opens Detroit Studio's Notion tab. No implicit cloud write occurs.
- PWA requires the existing verified WeiGuo Google identity session; family role viewer cannot list or edit tasks. Private mode blocks transmission.
- WeiGuo API holds the Notion integration token server-side. It uses Notion API version 2026-03-11 and the `data_sources` endpoints.
- The database stores Name (title), When (date), Done (checkbox), Vanilla Owner (rich_text). Every row is bound to an HMAC of the family's immutable verified Google subject, never a client-supplied name or email.

## One-time Notion setup

1. In Notion Settings → Connections, create a **private integration** granting read/insert/update content capabilities. Keep the token secret.
2. Create a dedicated **Notion database** for Vanilla tasks with the following properties (matching case exactly):
   - **Name**: Title
   - **When**: Date (include time)
   - **Done**: Checkbox
   - **Vanilla Owner**: Text / rich text
3. Share this database/data source with the integration via Notion's Add connections menu.
4. Obtain the **data source ID**, not an outdated database query endpoint ID. For current API versions, inspect the data source URL/object using Notion documentation.
5. On the **trusted WeiGuo backend only**, add environment variables `WEIGUO_NOTION_ENABLED=true`, `WEIGUO_NOTION_TOKEN=<private token>` and `WEIGUO_NOTION_DATA_SOURCE_ID=<uuid>` alongside existing authenticated family variables. Never put these values in Vite, GitHub Pages, public settings, or chat.
6. Restart/redeploy the backend and open **Detroit Studio → Notion 排程**. Sign into WeiGuo with the same Google account as Vanilla Drive and click 同步 Notion 排程. Use the checkbox before external writes.

The Notion integration credential is workspace-scoped and used by the trusted family backend. The adapter cannot guarantee a private Notion view for users who already have direct database access in Notion; the family API itself enforces row ownership using the server-side HMAC.

## Endpoints

All endpoints require a verified WeiGuo family bearer with owner/member role:

| Method | Path | Action |
|---|---|---|
| GET | /v1/family/notion/status | Discover whether server configuration exists |
| GET | /v1/family/notion/tasks | List first 50 rows belonging to the signed-in family identity |
| POST | /v1/family/notion/tasks | Create a task with title, when (offset-aware ISO 8601), optional details |
| POST | /v1/family/notion/tasks/{page_uuid}/complete | Verify ownership, mark completed |
| POST | /v1/family/notion/tasks/{page_uuid}/reschedule | Verify ownership, change scheduled time |

Write endpoints only accept fixed schema; arbitrary page IDs, database IDs, URLs, properties, code, or trigger actions cannot be supplied as commands. External calls have timeouts, disable redirects, and strip provider errors.

## Important limitations

- Adding a `When` date field does **not** create a reminder or an always-on automation. To send scheduled messages or run a workflow, install a persistent Chronos/Persistent Jobs worker with durable scheduling, deduplication, explicit authorization, and delivery verification.
- No two-way Notion webhook sync, page pagination beyond the first 50 results, recurring-job execution, or automatic Google Calendar synchronization is implemented in this stage.
- Notion API rate limiting may produce a temporary unavailable response; writes are not automatically retried to avoid duplicate tasks.
- Existing Notion pages without a valid Vanilla Owner marker will not appear in the family API.

Official references: https://developers.notion.com/reference/intro, https://developers.notion.com/reference/post-data-source-query, https://developers.notion.com/reference/post-page and https://developers.notion.com/reference/patch-page.
