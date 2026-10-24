# Vanilla API Vault — Google Apps Script deployment & coverage

Status: **source implemented / production deployment NOT verified**. The user must
publish their own Apps Script project; no script ID, deployment URL or API secrets
are stored in this public GitHub repository.

## Scope (do not mistake key management for running Vanilla in GAS)

Vanilla browser (Google OIDC) → **WeiGuo FastAPI** (existing verified family session)
→ signed HMAC JSON → **GAS API Vault** (Script Properties)
→ fixed allowlisted third-party APIs.

- GAS stores provider credentials in Script Properties, never in GitHub/PWA/Sheets.
- GAS performs a small, non-streaming API request and returns a normalized result.
- WeiGuo performs existing Google family authentication, owner-role checks,
  explicit cloud-send confirmation, provider/action validation and signing.
- Existing Vanilla API key issuance/usage quota and Slime inference remain in
  WeiGuo/Slime; **GAS does not replace SQLite transaction metering or GPU nodes**.
- Existing Ceres Telegram webhooks and Canva OAuth grant/refresh flows remain
  on the trusted server. This GAS package does not authorize, install or deploy them.
- **Do not point a browser directly at the GAS Web App**. Anyone can see a static
  PWA bundle, so no browser may contain the GAS HMAC secret.

## Coverage inventory (implemented = API operation only, not full module migration)

| Vanilla area | GAS vault | What remains outside GAS |
| --- | --- | --- |
| Gemini | `chat` with fixed URL, model allowlist; Vanilla conversation and opt-in Ceres replies | streaming, images, WebLLM, context tools |
| DeepSeek | `chat`; Vanilla conversation and opt-in Ceres replies | streaming |
| OpenAI | `chat`; Vanilla conversation, model selection UI, opt-in Ceres replies | streaming and multimodal |
| Anthropic | `chat`; Vanilla conversation and model selection UI | streaming and multimodal |
| OpenRouter | `chat`; Vanilla conversation and model selection UI | streaming and multimodal |
| Telegram / Ceres | `send_message`, `edit_message`, `answer_callback`; opt-in server outbound sender | inbound webhook, bot registration, Mini App initData validation may still require server token |
| Canva | `profile`, `designs`, `image_generate`, `design_generate`, `job_status`; original job controller supports opt-in proxy | OAuth refresh, image bytes; actual AI credits and scopes needed |
| Notion | `search`, `query_tasks`, `read_task`, `create_task`, `update_task`; original tasks router can opt in | scheduler triggers; account-specific ownership still checked on WeiGuo |
| Brave / Scouts | `search`; original Scouts route can opt in | Scouts relevance/ranking/grounding |
| GitHub / Zeus | `repo` read-only | PR writes, installations, workflow runner |
| LUCA | WeiGuo measures route requests; GAS request counters; 5 cloud sources recorded | long-term telemetry/Logfire |
| Slime | NO direct device/compute control | local/GPU nodes and inference worker |
| Detroit / Diana / Merlin / Victoria / Orchestra | use selected cloud model via WeiGuo vault route | reasoning, offline tools and tool dispatch |
| Drive / user files | NO migration of file content | Drive OAuth, sync, user content |
| Google search grounding | NO generic browsing proxy | existing Gemini/Scouts integrations |
| API Registry (Awesome catalogs) | NO bulk external execution | remains discovery-only |

Provider operations are intentionally finite. Never add a caller-controlled
base URL, request headers, arbitrary method, `fetch any URL` operation, or a
browser-accessible token/admin endpoint. New external APIs require a new
explicit adapter and security review.

## 1. Copy into the Apps Script project you already created

1. Open [Apps Script](https://script.google.com/home) and your existing project.
2. Copy [Code.gs](../apps-script/vanilla-api-vault/Code.gs) completely into
   the project's `Code.gs` (replace the default empty function).
3. In *Project Settings*, check **Show "appsscript.json" manifest file**.
   Copy [appsscript.json](../apps-script/vanilla-api-vault/appsscript.json)
   into the editor's manifest (or keep an equivalent minimal set of scopes).
4. Save. Run `diagnoseVault` in the editor to request the permissions; initially
   `ready:false` is expected until secrets are configured.

The Google Drive connector does **not** edit a user's Apps Script source or
publish Apps Script deployments. Having created a project in the UI does not
automatically make its code writable from this chat.

## 2. Set Script Properties (only in Apps Script > Project Settings)

| Property | Value |
| --- | --- |
| `VANILLA_RELAY_SHARED_SECRET` | independent random 32–256 ASCII characters; same as backend `VANILLA_GAS_RELAY_SECRET` |
| `VAULT_KEY_GEMINI` | Gemini API credential |
| `VAULT_MODELS_GEMINI` | exact allowlisted Gemini model IDs, separated by commas |
| `VAULT_KEY_DEEPSEEK`, `VAULT_MODELS_DEEPSEEK` | DeepSeek credential + models |
| `VAULT_KEY_OPENAI`, `VAULT_MODELS_OPENAI` | OpenAI credential + models |
| `VAULT_KEY_ANTHROPIC`, `VAULT_MODELS_ANTHROPIC` | Anthropic credential + models |
| `VAULT_KEY_OPENROUTER`, `VAULT_MODELS_OPENROUTER` | OpenRouter credential + models |
| `VAULT_KEY_TELEGRAM` | Telegram bot token |
| `VAULT_TELEGRAM_CHAT_IDS` | comma-separated numeric **allowed destination chat IDs** |
| `VAULT_KEY_CANVA` | server-authorized Canva access token (may expire) |
| `VAULT_KEY_NOTION` | Notion integration token |
| `VAULT_NOTION_DATA_SOURCE_ID` | Dedicated Notion data source UUID; must match WeiGuo `WEIGUO_NOTION_DATA_SOURCE_ID` |
| `VAULT_KEY_BRAVE` | Brave Search API token |
| `VAULT_KEY_TAVILY` | Tavily Search API token |
| `VAULT_KEY_GITHUB` | least-privilege GitHub token |
| `VAULT_RPM_LIMIT` | optional: per-provider requests/minute, default `8` |
| `VAULT_DAILY_LIMIT` | optional: per-provider requests/day, default `80` |
| `VAULT_MAX_OUTPUT_TOKENS` | optional: default `1024`; upper bound `4096` |

Never paste secret property **values** into chat, GitHub PRs, screenshots,
Google Sheets, public docs or the PWA. Keys are not automatically imported
from old browser Drive backups. Rotate any key previously exposed.

For new integration begin with a **single validated model per provider**,
using the *exact* ID in its live provider account. No script defaults should
claim that a model exists or that a key is working before a real test.

To generate the relay secret locally, use e.g.
`python3 -c "import secrets; print(secrets.token_urlsafe(48))"`.
Do not use a string shown in public documentation.

## 3. Deploy the GAS Web App

Apps Script → **Deploy** → **New deployment** → **Web app**.

- Execute as: **Me** (the account storing the Script Properties).
- Who has access: **Anyone**. This is **necessary for this HMAC-authenticated
  server-to-server endpoint**, but means an anonymous attacker can reach
  `doPost`; HMAC is the authorization control, NOT "Anyone".
- Copy the deployed URL that ends in `/exec`.
- After changing the script, **deploy a new version**. Merely saving the editor
  does not update an already-deployed Web App.
- Do not expose `/dev` for production. The public `doGet` only reports
  product/version, never credentials or provider status.

For an internet-facing high-volume service, use a proper API gateway and
Secret Manager instead of GAS. GAS Apps Script executions, storage and
UrlFetchApp are quota-limited and not a secure general-purpose proxy.

## 4. Configure the existing WeiGuo / Vanilla service (SERVER ONLY)

Place the following in the trusted service's deployment secret store:

```dotenv
VANILLA_GAS_WEB_APP_URL=https://script.google.com/macros/s/YOUR_REAL_DEPLOYMENT_ID/exec
VANILLA_GAS_RELAY_SECRET=YOUR_PRIVATE_RANDOM_SECRET_FROM_STEP_2
```

These must **not** be Vite variables, GitHub Pages variables, client HTML,
Google Drive files or repository dotenv commits. The backend rejects a URL
outside the exact `https://script.google.com/macros/s/.../exec` pattern.

Deploy the updated WeiGuo `app:app` to your existing trusted HTTPS backend
and keep existing `WEIGUO_GOOGLE_CLIENT_ID`, Google ACL and session security.

Backend routes:
- `GET /v1/family/api-vault/status` — owner only, signed GAS metadata;
- `POST /v1/family/api-vault/relay` — authenticated family member, explicit
  `approved_cloud_send:true`; owner only for Telegram/Canva/Notion.

Example request body **to WeiGuo only** (after a verified Google OIDC login):

```json
{
  "provider": "gemini",
  "operation": "chat",
  "model": "THE_MODEL_YOU_ALLOWLISTED",
  "payload": {
    "messages": [{"role": "user", "content": "Reply with OK."}],
    "max_tokens": 64
  },
  "approved_cloud_send": true
}
```

An authenticated browser uses its short-lived in-memory family bearer.
Never add a GAS shared secret, provider token or administrator bearer
to this body.

## 5. Activate in Vanilla Settings

1. Use the existing Vanilla Drive account and authenticated WeiGuo Google
   login (the same identity must pass the existing server ACL).
2. Open **Settings → AI 模型 → Google Apps Script · API Vault**.
3. Click **檢查 API Vault** (owner-only): it should report each service as
   configured or unconfigured, without exposing secret values.
4. For Gemini/DeepSeek, choose an allowed model and **啟用 GAS 轉發**.
5. Click **發送測試** (small but real/billable request). Confirm a model
   reply, permissions and provider quota.
6. Confirm chat still works; private mode must continue blocking cloud calls.

All five cloud text providers appear in the AI Model settings, where the
owner can opt in. The legacy service adapters for Canva, Notion, Scouts,
Ceres model output and Telegram sending have optional GAS cutovers, controlled
server-side. Provider presence in an inventory does **not** mean live key
validation, backend cutover, OAuth refresh or a successful billable operation.

## 6. Safety & verification checklist

- `node --test tests/gas-api-vault.test.mjs` checks mock GAS signatures,
  fixed provider URLs, 120-second timestamp, nonce replay, quotas, allowlists,
  status redaction and Telegram destination control.
- `python3 -m unittest services.weiguo.test_gas_relay` checks Python envelope,
  server URL enforcement, authorization and cloud-send consent.
- Test invalid HMAC, duplicate nonce, non-allowlisted model, non-allowlisted
  Telegram chat, unknown operation, and missing API key: all must fail
  **without** a third-party call.
- GAS `doPost` deliberately returns generic codes with HTTP 200 (Content
  Service cannot reliably set custom statuses). WeiGuo maps these to HTTP
  status codes. Never trust bare HTTP 200 without checking `ok`.
- GAS nonce ledger uses Script Properties under LockService and rejects
  overflow instead of discarding live nonces. The ledger and the per-provider
  counters remain small, at the cost of throughput.
- Keep existing provider keys active during phased rollout; revoke them
  from their old location only after confirmed replacement, and do **not**
  remove the external workers necessary for existing tools.
- Apps Script Content Service may redirect replies to a Google-hosted
  content URL; WeiGuo checks final HTTPS host and does not follow arbitrary
  provider-controlled URL redirects inside GAS.

**Release status to maintain:** source ready ≠ GAS deployed ≠ provider live
test passed ≠ production migration complete.

Official references:
- [Apps Script Web Apps](https://developers.google.com/apps-script/guides/web)
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [Content Service](https://developers.google.com/apps-script/guides/content)


## 7. Complete staged cutover to GAS for original Vanilla services

Setting `VANILLA_GAS_WEB_APP_URL` and `VANILLA_GAS_RELAY_SECRET`
**does not** automatically redirect production modules. This prevents a partially
configured vault from suddenly breaking Ceres and your user-facing tools.

On the trusted WeiGuo deployment, explicitly add:

```dotenv
# Start with one provider, verify, then add more one at a time:
VANILLA_GAS_PROXY_PROVIDERS=gemini,deepseek,openai,telegram,canva,notion,brave,tavily
# Still required for Notion's fixed source and per-Google-account isolation:
WEIGUO_NOTION_DATA_SOURCE_ID=YOUR_EXISTING_NOTION_DATA_SOURCE_UUID
WEIGUO_NOTION_ENABLED=true
WEIGUO_SESSION_SECRET=YOUR_EXISTING_WEIGUO_SESSION_SECRET
# Enables original Canva generation route (separate from secret storage):
WEIGUO_CANVA_ENABLED=true
# For Ceres automatic Telegram model replies, set a real allowlisted model:
CERES_SERVER_MODEL_PROVIDER=gemini
CERES_SERVER_MODEL_NAME=YOUR_ALLOWLISTED_GEMINI_MODEL
```

Do not paste real values in public repository. Each provider on this list
must be a **separate, owner-approved** switch. Failure of a selected GAS
provider must fail closed; avoid automatically falling back to the old
provider key because that defeats centralized key custody and obscures
billing and privacy.

* **Gemini, OpenAI, DeepSeek**: `ceres_server_model`,
  `ceres_model_catalog`, and `ceres_model_ops` use the GAS path when enabled.
* **Anthropic, OpenRouter**: available as Vanilla cloud chat models through
  the authenticated family gateway. Ceres automatic model selection has not
  been extended to these.
* **Telegram**: signed outbound send, edit, and callback-acknowledgement;
  GAS `VAULT_TELEGRAM_CHAT_IDS` must include *every* approved destination
  chat ID. Existing Ceres inbound webhook registration, bot identity checks
  and Mini App cryptographic validation remain on WeiGuo; do not remove their
  server-side bot-token configuration without separately migrating those
  mechanisms.
* **Canva**: original generation/polling endpoints can use GAS; the token
  must be a valid user OAuth access token with the proper Canva scopes and
  capabilities. GAS does not yet refresh expired Canva OAuth credentials.
* **Notion**: GAS enforces one fixed data source ID, bounded task schema,
  allowed page fields and source-scoped updates. WeiGuo still enforces the
  original Google `sub`/HMAC owner tag check; Notion's database schema must
  contain `Name`, `When`, `Done`, and `Vanilla Owner`. GAS limits
  results per query to 15 entries and reports `has_more`; paging is not
  yet implemented for this proxy.
* **Brave and Tavily**: original Scouts adapter retains per-member rate
  limiting, safe HTTPS result URL filtering and regional ranking.
* **GitHub**: limited to authenticated read-only repository metadata; code
  search, PR creation and GitHub Actions retain separate authorization and
  may require independent service keys.

### Key migration and rollback

After GAS smoke tests pass, migrate one provider token at a time from the
existing WeiGuo server vault to Apps Script Script Properties. Do not delete
live Ceres webhook/OAuth secrets that are still needed locally. Replace
legacy Drive `vanilla-provider-credentials-v1.json` with managed *markers*
only; the updated sync code prevents writing plain provider API keys.
Keep a protected offline backup for rollback, and revoke old credentials
only after verifying no old caller uses them.

### What a real end-to-end acceptance must prove

1. Wrong/expired HMAC, repeated nonce, arbitrary upstream path and unapproved
   provider/model fail *without any provider request*.
2. Each selected live model returns a real answer, with metered token usage.
3. Telegram sends to an actual allowlisted chat and cannot send elsewhere.
4. Canva accepts a real, consented image/design job, whose returned job ID
   can be polled from the original owner session.
5. Notion can create, list, reschedule and complete an **owned** test task;
   a second Google family account cannot read or mutate it.
6. Scouts returns grounded Brave/Tavily links through the existing search UI.
7. LUNA, LUCA, Ceres and regular chat continue to work; private mode never
   makes a cloud call; the existing Slime GPU backend is unaffected.
8. Rollback works by removing a provider from
   `VANILLA_GAS_PROXY_PROVIDERS` or disabling it in the model panel,
   without exposing or destroying other credentials.

Successful CI verifies mocked contracts and compilation, **not** real
provider connection, paid quota availability, or GAS deployment.
