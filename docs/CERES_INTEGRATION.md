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
