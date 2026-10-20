# Ceres — Vanilla Native Communication Gateway (Phase 1)

## Purpose and provenance

Ceres is a new first-party communication ingress tool for Vanilla / Detroit. The high-level product goals were informed by generic multi-channel bot frameworks, including AstrBot, but Ceres contains **no copied AstrBot source, vendored dependencies, visual assets, plugin loader, trademark or watermark-removal logic**. Its first version is implemented using FastAPI, Python standard-library SQLite and existing Vanilla metadata registries.

This does **not** guarantee freedom from every copyright, trademark, patent or third-party dependency obligation. Audit all production dependencies, bot-platform terms, licenses and output assets before commercial distribution. Do not erase legally required notices. Vanilla-owned UI and files do not impose an AstrBot watermark.

## Status and trust boundary

- Telegram: implemented **inbound-only**, disabled by default.
- LINE and Discord: roadmap only; no live authentication or message handling.
- Plugin manifests: metadata-only. Validation rejects code, remote URLs, secrets, entrypoints and elevated permissions. **No arbitrary plugin execution**.
- Inbound text is untrusted and retained up to seven days in the server-only SQLite inbox. It is never directly dispatched to Zeus, Diana, CREAM, tools or models and is not used for model training.
- A server administrator can read/review messages with a separate server-only admin token. Reviewing does NOT execute the text or send a reply.
- No automatic replies, auto-install, arbitrary commands, cron polling, or background AI jobs exist in Phase 1.

## Opt-in Telegram setup

On a trusted WeiGuo FastAPI server (app:app), set these **server-only** variables:

| Variable | Purpose |
|---|---|
| CERES_ENABLED=true | Gate all webhook handling (default false) |
| CERES_TELEGRAM_WEBHOOK_SECRET | A unique 32–256-character token using A-Z, a-z, 0-9, "_" or "-" (never reuse the WeiGuo admin key) |
| CERES_TELEGRAM_CHAT_IDS | Comma-separated numeric **private chat IDs** for individually approved users (maximum 30) |
| CERES_DB_PATH=/data/ceres-events.sqlite3 | Persistent private SQLite inbox (back it up or rotate appropriately) |
| WEIGUO_ADMIN_TOKEN | Existing server-only admin bearer for operator inbox routes |

Example local deployment with Docker Compose uses a private volume mounted at /data. It **does not** automatically create a Telegram bot or register its webhook. Never commit real bot tokens or user identifiers.

Use BotFather to create a Telegram bot and obtain its bot token through the Telegram platform. Over an independently secured channel, set the official Telegram webhook URL to:

    https://YOUR-HTTPS-WEIGUO-ORIGIN/v1/ceres/telegram/webhook

Set Telegram's secret_token parameter to the same server-only CERES_TELEGRAM_WEBHOOK_SECRET. HTTPS reverse proxy must route POST to this endpoint and preserve the X-Telegram-Bot-Api-Secret-Token header. Configure network rate limiting and request-size restrictions at the proxy as well. The webhook MUST NOT share a secret with the frontend or receive an unauthenticated proxy bypass.

The endpoint currently accepts only Telegram private-chat text messages whose sender ID equals the chat ID and is explicitly allowlisted. Unsupported media, bots, groups, edits and arbitrary update types are ignored; missing/invalid secret is rejected. Responses do not contain inbound message text. Telegram update_id is used for idempotency; an event-per-minute ceiling applies per approved account.

## Operator API

Operator routes require Authorization: Bearer WEIGUO_ADMIN_TOKEN and should be reachable **only from private trusted infrastructure**, never through the public Vanilla PWA:

- GET /v1/operator/ceres/status — safe status booleans only; no tokens or chat IDs
- GET /v1/operator/ceres/events?limit=20 — latest stored events and raw UNTRUSTED text, max 50
- POST /v1/operator/ceres/events/{id}/review with {"approved":true} — mark a message reviewed without dispatching, sending or executing it

WEIGUO_PUBLIC_FAMILY_ONLY=true hides /v1/operator/ceres/* by returning HTTP 404. The independently signed public webhook can still receive incoming events; a distinct private/admin deployment or protected ingress is necessary for reviews.

Ceres must NEVER be promoted to AI system-prompt authority just because a webhook secret or allowlisted chat ID is valid. Athena must treat this material as lower-trust user text, and any future actions must require linked user identity, scoped tool permission and explicit confirmation.

## Verification

- Node: npm run test:ceres
- Python (after WeiGuo requirements): python3 -m unittest discover -s services/weiguo -p 'test_ceres_gateway.py'
- Overall CI: .github/workflows/ci.yml runs the Node Ceres tests and all WeiGuo Python test modules.
- Deploy only after verifying ingress behind HTTPS, server-owned allowlist, private operator API, idempotency, rate limits, and retention.

## Next stages (NOT shipped)

1. Explicit identity linking between a Telegram sender and one approved Vanilla family/member identity, with revocation.
2. An operator-approved, scoped outbound Telegram reply adapter and delivery-state log; never expose bot tokens to the PWA.
3. LINE (HMAC-SHA256 signature) and Discord (interaction signature) adapters with platform-specific abuse controls.
4. A reviewed, sandboxed capability-plugin SDK and signed supply-chain provenance; metadata catalog alone never installs code.
5. Diana/Zeus task handoff **only** after Athena verification, role-scoped permissions and per-action user confirmation.

Ceres is a gateway, not another language model or a second Detroit controller.


## Phase 2 — family-linked inbox, reviewed Telegram replies and optional local AI drafts

The native Ceres family gateway adds **optional** two-way Telegram messaging. It **never** automatically invokes Detroit agents, reads private Vanilla data, sends AI output unattended or installs remote plugins. LINE and Discord remain planned.

### Private operator configuration

Deploy the updated WeiGuo backend first, then configure the following **server-only** variables:

| Variable | Meaning |
|---|---|
| CERES_ENABLED | true to enable ingress (default false) |
| CERES_TELEGRAM_CHAT_IDS | comma-separated approved private Telegram user/chat IDs |
| CERES_TELEGRAM_WEBHOOK_SECRET | independent shared-secret webhook header |
| CERES_FAMILY_LINKS_JSON | map approved Telegram chat ID strings to independently verified Google subject IDs |
| CERES_OUTBOUND_ENABLED | true to allow one manual reply per received event (default false) |
| CERES_TELEGRAM_BOT_TOKEN | secret BotFather token for Telegram sendMessage |
| CERES_AI_DRAFT_ENABLED | true for a manually requested local-only AI draft (default false) |
| CERES_OLLAMA_URL | optional localhost / 127.0.0.1 HTTP endpoint including numeric port |
| CERES_OLLAMA_MODEL | optional locally installed model name, e.g. qwen3:4b |

Example shape for CERES_FAMILY_LINKS_JSON: {"123456789":"123456789012345678901"}. These identifiers are **illustrative only** and grant no access without server ACL verification. Use verified immutable Google sub values, not an email or person name; obtain the matching Telegram private-chat ID from a trusted enrollment process or the private operator Ceres inbox. Limit each verified Google subject to a single Telegram chat. Removing a link revokes access immediately.

Never store either Telegram token, real identifiers, Google credentials or admin secrets in public PWA code, GitHub files, issue comments, screenshots or client-side storage. Create a bot with Telegram BotFather, then register the webhook separately using Telegram's official HTTPS API and the shared-secret header. Source updates do **not** register or enable the bot.

AI drafting currently requires Ollama on backend loopback (127.0.0.1 or localhost), not a public or arbitrary internal-network endpoint. If Ollama is running in another container, do not weaken the URL validator to point at an untrusted host; use a reviewed loopback-only proxy arrangement.

### Family API and PWA

The following endpoints require the existing short-lived WeiGuo family bearer and role owner/member, plus a current server-side Telegram-to-Google-sub link:

- GET /v1/family/ceres/status: backend/identity capability flags without secret or numeric IDs.
- GET /v1/family/ceres/events: messages from *only the currently linked account*.
- POST /v1/family/ceres/events/{id}/draft with {"approved":true}: local model produces editable text only; nothing is sent.
- POST /v1/family/ceres/events/{id}/reply with {"approved":true,"text":"..."}: sends that exact approved text to the linked private Telegram chat.

In Vanilla, open Detroit Studio > Ceres or use @Ceres. Authenticate to WeiGuo with the **same** Google identity used by Vanilla. Select an inbound event and either write a response yourself or explicitly consent to a local AI draft. Every change to the reply clears consent. The Send button requires manual confirmation and an operator-enabled outbound connector.

All received content is treated as untrusted data, never as a system or tool instruction. Model drafting has no filesystem, web, family memory or Detroit tool privileges, and there is no automatic tool routing. Only the verified account can view and reply to its own chat. Viewer roles remain denied.

### Exactly-once and privacy limits

Every outgoing reply reserves its source event before HTTP delivery. Each event is allowed **one send attempt**; a timeout, invalid API response or other uncertain outcome is marked as unknown and is *not* automatically retried. Confirm ambiguous deliveries directly in Telegram before any manual recovery. Replies are limited to four attempts per family account per minute. AI drafts are limited to four requests per minute.

Inbound text is retained for up to seven days; outbox metadata records event ID, sender ownership and status, but not reply body. The local AI draft API does not persist generated response text. The external Telegram platform can retain messages under its own terms. Keep backend volumes private and define backup/erasure operations before production use.

Telegram's webhook secret header is not a digital signature. Keep TLS, host network restrictions, gateway request limits, verified account mappings and a trusted HTTPS reverse proxy in place. Never enable privileged routes on the public family deployment.

### Validation and remaining work

Run the full existing GitHub CI, plus the targeted tests:
- python3 -m unittest discover -s services/weiguo -p 'test_ceres_*.py'
- npm run test:ceres
- npm run build

Telegram registration, verified family enrollment, token provisioning and production deployment require a trusted operator. LINE, Discord, unattended AI replies, persistent model conversations and privileged Zeus/Diana/CREAM task execution are **not shipped in Phase 2** and require separate security reviews.

Ceres is newly authored Vanilla code. No mandatory AstrBot watermark is added, but third-party legal notices and platform terms still apply.
