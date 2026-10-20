# Vanilla Offline Schedule + Optional Notion Integration

## Product boundary

**The local model and local tasks run without internet.** Notion is only an optional helper/remote copy; it does not own scheduling, provide AI inference, authorize Detroit tools, or run a timer.

### Always available locally (once the app and chosen local model assets are cached)

- Detroit Studio → **本地排程** opens without Google login, Notion token or WeiGuo deployment.
- New tasks, due times, completion and rescheduling are stored locally in a per-account browser storage namespace.
- Diana can proactively select the **offline schedule panel** for explicit task/schedule requests. It opens the editor; it does not silently write data, invent a parsed date or send requests to Notion.
- /排程 and /Notion both open the offline panel. /Notion does not imply cloud syncing.
- Private mode uses an in-memory-only task list for the lifetime of the current page, and never stores it persistently.
- Notion network errors cannot delete or block the local task list. Existing local chat/model infrastructure does not depend on this integration.

Browser storage is device-specific and may be cleared by the user/browser. Export/backup is a separate future enhancement. Neither a due date nor a successfully synchronized Notion record means an automation is running. Reliable background execution/notifications require a separately deployed Chronos/Persistent Jobs worker.

## Optional, explicit Notion sync

The UI only sends an external request when the user **opens the optional sync section, checks consent, and explicitly clicks a sync button**. Reconnecting to the internet does not automatically send pending records. No Notion credentials appear in the PWA.

1. In Notion Settings → Connections, create a **private integration** granting read/insert/update content capabilities. Keep the token secret.
2. Create a dedicated Notion database/data source with these exact properties:
   - **Name**: Title
   - **When**: Date, including time
   - **Done**: Checkbox
   - **Vanilla Owner**: Rich text
3. Share the data source with the integration via Notion's **Add connections** menu.
4. Locate the **data source ID** (not the database ID) from the Notion API / database metadata.
5. In the trusted WeiGuo backend environment only, configure:
   - WEIGUO_NOTION_ENABLED=true
   - WEIGUO_NOTION_TOKEN=<private Notion integration secret>
   - WEIGUO_NOTION_DATA_SOURCE_ID=<data source UUID>
6. Redeploy the backend, verify the existing signed WeiGuo Google family session, then manually select tasks for Notion sync.

The Notion API uses Notion-Version 2026-03-11 and the data source endpoints. The signed family account is mapped to each task using a private HMAC owner marker. Backend calls use fixed URLs and schemas, restrict listing/mutation by verified Google identity and keep integration secrets server-side. This does not override direct permissions granted to users inside the Notion workspace itself.

## API surface (only used for opt-in sync)

| Method | Path | Action |
|---|---|---|
| GET | /v1/family/notion/status | Discover configured Notion integration |
| GET | /v1/family/notion/tasks | Read first 50 remote owned rows, without overwriting local data |
| POST | /v1/family/notion/tasks | Create a selected local record in Notion |
| POST | /v1/family/notion/tasks/{page_uuid}/complete | Mark an owned Notion record complete |
| POST | /v1/family/notion/tasks/{page_uuid}/reschedule | Update due time for an owned Notion record |

**Conflict behavior:** Local is authoritative. After successful manual upload, the local record stores a linked Notion page ID and an acknowledged local revision. Subsequent local changes mark the record as unsynced; only another explicit user click updates the remote copy. A failed or ambiguous Notion response does not erase the local record. A request that succeeded remotely but failed before receiving a response could create a duplicate if the user retries; check Notion manually in that situation.

**Not implemented:** Automatic background schedule execution, reminders, data reconciliation across devices, bidirectional conflict resolution, recurrence, external Notion webhooks, pagination beyond 50 remote items, and cross-device backup for local records.

Official references:
- https://developers.notion.com/reference/versioning
- https://developers.notion.com/reference/query-a-data-source
- https://developers.notion.com/reference/post-page
- https://developers.notion.com/reference/patch-page
