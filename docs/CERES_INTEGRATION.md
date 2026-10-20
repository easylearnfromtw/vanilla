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

## Production Telegram webhook registration (opt-in)

The FastAPI service can now register the webhook **from the Railway backend at startup**.
The registration step is disabled unless both `CERES_ENABLED=true` and
`CERES_TELEGRAM_REGISTER_WEBHOOK=true` are set. This keeps the BotFather token
and `secret_token` server-only. The service does not require a user to copy
either secret into ChatGPT or a browser console.

In addition to the Phase 2 variables, set the following in Railway:

| Variable | Value |
|---|---|
| `CERES_TELEGRAM_EXPECTED_USERNAME` | `SignWell_bot` (must match Telegram getMe) |
| `CERES_TELEGRAM_WEBHOOK_URL` | `https://weiguo-browser-production.up.railway.app/v1/ceres/telegram/webhook` |
| `CERES_TELEGRAM_REGISTER_WEBHOOK` | `true` |
| `CERES_ENABLED` | `true` only after validating your private-chat allowlist and family binding |

Startup checks the token format, private-chat allowlist, linked numeric Google
sub against `WEIGUO_FAMILY_ACL_JSON`, HTTPS Railway URL and BotFather username.
If Telegram already has a **different** webhook, startup refuses to replace
it. It does not discard pending messages, and only subscribes to message
updates. Telegram getWebhookInfo is used to verify the registered URL; logs
show only sanitized status, never a token or chat ID.

A Railway SUCCESS deployment means the service started, **not** necessarily
that Telegram accepted the webhook. Check runtime logs for
`Ceres Telegram: webhook registration verified`. If the configuration
is invalid, the bot username is wrong, or Telegram is unreachable, the
registration fails closed and the normal service remains available.

## Phase 3 — Vanilla device-scoped AI reply drafting (opt-in; production PWA)

Ceres can now use the **already-connected Vanilla model router inside the PWA** to draft a reply to one selected Telegram message. This does not need backend Ollama or a Railway LLM installation. The previous backend loopback-only `/draft` endpoint remains disabled unless an operator separately deploys Ollama; enabling browser drafting does not enable it.

1. In Detroit Studio → Ceres, select an inbound message and pick an available model.
2. Model options are limited to a **loaded** on-device model or user-configured Ollama, Gemini and DeepSeek connectors. No model is selected silently, and no model weights are downloaded by opening Ceres.
3. The PWA shows whether the message stays on-device or will be sent to a self-hosted endpoint/cloud provider. Each request needs its own checked consent. A maximum of four client-side drafts per minute reduces unintentional API usage.
4. Athena text inspection rejects common prompt-injection patterns before model routing. Merlin supplies a bounded text-only drafting task and Erya-style tone selection. **This is prompt design, not a call to separate Merlin/Erya model processes.** No tools, searches, family memory, attached files, or other chats are supplied to the chosen model.
5. The generated text is **only put into the editable reply text box**. Choosing another message/model cancels pending inference and clears send approval. Editing text clears send approval. Sending still requires the separate checkbox and existing WeiGuo `/events/{id}/reply` endpoint with verified identity and one-time reservation.

**Privacy:** Choosing Gemini, DeepSeek or cloud Ollama transmits the selected Telegram message to the corresponding provider only after explicit in-UI consent and may incur charges. Phone-local means inference on the current device; loading or maintaining that model is performed from the existing Vanilla model panel. Railway holds only the Telegram bot credential and existing linked inbox. No background drafting, unreviewed Telegram sending, or automatic Detroit task dispatch is introduced.

**Deployment:** Update `src/version.ts` and `public/version.json` together to make iPhone PWA release verification reliable; the GitHub Pages workflow runs `npm run test:ceres`.

## Phase 4 — Telegram as a second Detroit conversation entrance

The WeiGuo backend now exposes a **feature-flagged foreground bridge**.
Railway handles signed inbound Telegram updates, one-use family-linked job
leases and duplicate-safe outbound Telegram delivery. On the same Google-family
account, the **currently open Vanilla PWA** may process these jobs using its
**already-loaded on-device WebLLM model**.

Before enabling `CERES_LOCAL_BRIDGE_ENABLED=true` in Railway, confirm the
existing `CERES_ENABLED`, `CERES_OUTBOUND_ENABLED`, Telegram chat allowlist,
`CERES_FAMILY_LINKS_JSON` and Google family ACL. No Telegram token or family
session secret is exposed to the browser. The PWA requires a **separate
per-Google-account device opt-in** in Detroit Studio → Ceres. Opening Ceres or
receiving Telegram messages does not silently enable local automation.

Flow:

```text
Telegram SignWell_bot (private allowlisted message)
  → signed WeiGuo /v1/ceres/telegram/webhook
  → SQLite one-use queue (new messages only)
  → Google family-authorized foreground Vanilla PWA (visible and unlocked)
  → Athena inspect untrusted text
  → Diana selects a supported read-only tool (CREAM stats or Scouts URL read)
     or Merlin/Erya uses the currently loaded phone WebLLM via Zeus
  → bounded plain-text result and single-use lease
  → WeiGuo verifies identity, link, claim and outbox reservation
  → Telegram sendMessage once (no ambiguous-failure retry)
```

Implemented safe tool paths: Diana tool catalog/routing; CREAM CSV
descriptive statistics; Scouts explicit public HTTPS URL read; Erya text editing
and Merlin short text generation over the already-loaded model. Tools that
require a browser editor or higher permission (Bard images, Retina artifacts,
GitHub code changes, Medusa execution, Quirinus, Drive mutation, email send,
payments) **do not execute automatically** and must be separately authorized in
their original Vanilla workbench. No generic tool-call JSON, arbitrary URL
execution, shell or plugin invocation is allowed through Telegram.

Operational caveats:

- **Not a 24/7 local model**: iOS suspends WebLLM when the PWA is backgrounded,
  closed or the GPU is disposed. Railway cannot wake the iPhone model.
- **No auto-download**: the local WebLLM must already be loaded in Vanilla.
- **Short-lived session**: WeiGuo's family bearer expires after 15 minutes.
  The device must reauthenticate periodically; until then polling stops.
- **Explicit opt-in** per identity/device; private-chat mode and hidden app
  prevent processing.
- Messages over five minutes old expire. Each job lease is 90 seconds and
  cannot be re-leased after timeout; accepted but failed messages remain
  available for manual review in the existing Ceres inbox.
- Exactly one outbound attempt is reserved in SQLite before calling Telegram.
  Delivery uncertainty never triggers an automatic retry.
- PWA automatically checks for newly queued jobs only while visible; there
  are no background service workers, cron agents or secrets in JavaScript.
- Audit facts are the actual registered job and send outcomes. A Railway
  successful deploy is **not** proof that the iPhone WebLLM ran.

An always-on self-hosted model requires **another independently configured
Ollama/llama.cpp daemon or approved remote model adapter** with a verified
network path, model capacity and security posture; this PR does not
pretend such a daemon exists.

## Phase 5 — Real Telegram AI conversations without keeping an iPhone awake

The original phone-local bridge was intentionally foreground-only. iOS suspends
WebLLM when switching to Telegram; the Railway logs may show a successful
Telegram webhook and **zero** `/v1/family/ceres/bridge/claim` calls. That means
there is **no AI execution**, even though the inbox and manual replies work.

WeiGuo now includes a **separate, feature-flagged server-side model worker**.
It runs during Railway's FastAPI lifespan and polls the same signed/allowlisted
Telegram SQLite inbox. This supports ordinary back-and-forth conversations
without leaving the Vanilla PWA open, **after** the operator provides a
real reachable model service.

### Required Railway Variables (weiguo-browser production)

| Variable | Example / meaning |
| --- | --- |
| `CERES_SERVER_AGENT_ENABLED` | `true` after model configuration and consent to automatic Telegram replies |
| `CERES_SERVER_MODEL_PROVIDER` | `ollama` or `openai` (OpenAI-compatible chat completions) |
| `CERES_SERVER_MODEL_BASE_URL` | e.g. `https://your-ollama-proxy.example.com/api` or `https://api.openai.com/v1` |
| `CERES_SERVER_MODEL_NAME` | The actual deployed model identifier (not a display label) |
| `CERES_SERVER_MODEL_API_KEY` | A valid server-side model API or reverse-proxy bearer key of at least 20 characters |
| `CERES_ENABLED` / `CERES_OUTBOUND_ENABLED` | Both remain `true` |
| `CERES_TELEGRAM_CHAT_IDS` / `CERES_FAMILY_LINKS_JSON` / `WEIGUO_FAMILY_ACL_JSON` | Existing verified allowlists and linked identities; do not change |

The old `CERES_LOCAL_BRIDGE_ENABLED` may remain enabled. When a valid
server-model configuration is active, **server-side processing takes
priority** and the phone-local claim endpoint is disabled to avoid competing
answers. If the server model is absent, the existing foreground bridge and
manual reply work as before.

**Self-hosted model:** Ollama itself does not require or enforce a bearer token.
Do not publish an unauthenticated Ollama port onto the public Internet.
Place an authenticated HTTPS reverse proxy (or equivalent access gateway)
before Ollama and configure `CERES_SERVER_MODEL_API_KEY` to match the proxy
credential. Railway cannot contact a model bound only to `localhost` on your
home PC. Keeping that PC and the authenticated tunnel online makes it the
persistent model worker. All bot and model credentials stay in Railway's
server-only Variables; do not paste them into chat or the PWA.

**Cloud model:** Instead of a persistent home device, an explicitly chosen
OpenAI-compatible API can provide the hosted model. That sends the selected
Telegram private-chat text and the last four successfully answered turns
to that provider, and may incur token charges. This is an **operator choice**,
not an implicit fallback; without provider settings, the server agent stays off.

### Guardrails and evidence

- Only signed Telegram **private chat** events with chat IDs on the original
  allowlist can enqueue work. Each execution **re-verifies** the Telegram-chat
  ↔ Google `sub` ↔ owner/member ACL linkage.
- Untrusted Telegram text is never given generic tool or admin authority.
  Diana can classify, CREAM executes deterministic arithmetic/statistics,
  Scouts reads **only admin-allowlisted public HTTPS hosts**, and Merlin uses
  the configured text model. GitHub, email, file write, billing and deployment
  operations always require separate Vanilla approval.
- Only the last **four successfully answered messages from the same Telegram
  chat, within 24 hours**, become model conversation context. No other chats,
  family documents, Tokens, or files are read or uploaded.
- Each event uses a durable one-use outbox reservation before sending Telegram.
  There is **no automatic retry** after ambiguous network failures. At most
  four replies per chat per minute; new items expire after five minutes.
- Backend agent status is visible only to the linked family account at
  `/v1/family/ceres/agent/status`; the Ceres Studio UI shows
  `modelConfigured`, `serverReady` and the last processing state.
- A successful Railway build and webhook registration do not prove a model
  answered. Look for sanitized `Ceres server agent: active` and
  `Ceres server agent: reply verified` in runtime logs, followed by an actual
  Telegram reply. No user text, provider URLs or keys are logged.

The server agent is disabled by default and *does not* install model weights or
create a model API key. Real model service connectivity must be verified before
claiming always-on intelligent chat is working.
