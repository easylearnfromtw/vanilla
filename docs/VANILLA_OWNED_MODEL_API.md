# Vanilla Own-Model API — Architecture and deployment

## What this gateway connects
Only an owner-operated Vanilla inference backend. It never shares Gemini, OpenAI or DeepSeek provider keys with customers. Slime currently manages node registration/heartbeats, not model inference; public model serving remains DISABLED until a real inference runtime is provisioned.

## Owner administration
@SignWell_bot → /hub → 我的模型 API (or /admin myapi). A five-screen monochrome iOS-style Telegram WebApp provides Overview, Applications, Keys, Models and Usage, authenticated through signed Telegram WebApp initData and linked Google Owner identity.
Each customer/application receives its own project and distinct API key. Key secret appears only once; only its SHA256 hash is stored. Individual keys can be revoked, expire, be restricted to specific models, and have per-day/per-month token budgets, RPM and output caps.

## Railway runtime configuration — feature OFF by default
VANILLA_PUBLIC_API_ENABLED=true — set ONLY after verified owner-controlled inference is live.
VANILLA_INFERENCE_BASE_URL=https://your-trusted-model-host.example/v1
VANILLA_INFERENCE_ALLOWED_HOST=your-trusted-model-host.example — exact trusted host.
VANILLA_INFERENCE_SERVICE_KEY=<your private model-runtime bearer token>
VANILLA_INFERENCE_DEFAULT_MODEL=<optional model ID found in runtime catalog>
The configured runtime must expose GET /v1/models and POST /v1/chat/completions (non-streaming) under this fixed HTTPS host. Do not reuse third-party model provider keys. Raw-IP, private, HTTP and redirected endpoints are not supported.

## Consumer API
GET https://YOUR-WEIGUO-DOMAIN/v1/models
POST https://YOUR-WEIGUO-DOMAIN/v1/chat/completions
Authorization: Bearer vnl_YOUR_KEY
Example JSON: {"model":"vanilla-default","messages":[{"role":"user","content":"你好"}],"max_tokens":256,"stream":false}
OpenAI Python clients can set api_key to their own Vanilla key and base_url to https://YOUR-WEIGUO-DOMAIN/v1; this is not an OpenAI account/API key.

## Dynamic models
A normal /v1/models call refreshes catalog on demand every five minutes; Owner can force refresh. vanilla-default is a stable public alias resolving to a verified model; clients granted that alias need not update model IDs after a runtime switch. Explicit '*' grants allow all present and future verified models. Restricted keys never gain new model scope silently. Removed models fail closed.

## Metering, quota and security
SQLite BEGIN IMMEDIATE reserves conservative UTF-8 text-byte/token allowance plus framing overhead and requested max_tokens before inference, preventing concurrent overspending. Backend-reported prompt/completion tokens reconcile the reservation; if exact usage is unavailable, retention is explicitly marked as conservative rather than fabricated exact metering.
Per-key UTC daily/monthly limits, RPM, two-active-call ceiling, expirations, model scopes and output-token caps. 30-day KPI summary: requests, successes, failures, charged/reserved units and mean latency. This is not vendor billing. Default example: 20k tokens/day, 200k/month, 10 RPM, 512 output/request.
Do not embed vnl_ secrets in public browser JavaScript, distribute through Telegram text, or use a third-party provider as the owner-only runtime.

## Currently excluded until separate work
Real Slime inference agent/queue (Slime is registry-only today), streaming SSE, multimodal, exact tokenizer-based prepaid budgets for arbitrary models, payment billing, customer OAuth, and a deployed model runtime. A Railway healthcheck does not verify actual model generation.

## Release gate
CI: key hashing/issuance/revocation/Owner isolation, quota reservation/concurrency, model sync, API-console CSP and Docker module packaging. Production gate: runtime is configured by Owner and a real authorized generation succeeds before VANILLA_PUBLIC_API_ENABLED is turned on.