# Ceres Owner Console — P0–P2

## Entry points
- Telegram `/admin` opens the existing signed WebApp; now has a responsive dashboard with four health indicators, diagnostics, metered probe and comparison controls, usage/cost ledger and Owner change preview.
- Telegram `/hub diagnostics`, `/hub usage`, `/hub plan Gemini 速度優先`, `/hub plan Gemini 開啟備援`; exact-form natural language shortcuts may generate a proposal but never auto-apply.
- API routes: `POST /v1/ceres/admin/ops/{health,diagnostics,usage,recommend,probe,compare,price,plan,approve}`. Every call requires fresh, signed Telegram WebApp `init_data` and current linked Owner role. No access by arbitrary Gmail viewers or unauthenticated web clients.

## P0
- **Health:** webhook configuration, Agent readiness, last observed inbound and last verified outbound timestamps, 24h failed Agent jobs. A configured or running container is **not** displayed as a successful live Telegram end-to-end test. The dashboard exposes `liveEndToEndNow=not_tested`.
- **Probe:** an explicit Owner action sends a short, fixed generation prompt through official provider endpoints (Gemini generateContent; OpenAI/DeepSeek Chat Completions), bounded to 32 output tokens and an 18-second timeout. It reports success, safe failure code and elapsed time, not the generated content. Results may incur usage fees.
- **Diagnosis:** latest per-model failure codes; no raw token, URL, prompt or reply in the database or logs. Telegram `sendMessage` logs safe delivery status codes and does not treat HTTP 200 as proof of `ok:true`.

## P1
- **Routing advice:** deterministic provider model names plus observed successful single-call latency; no invented quality benchmark. Existing speed/balanced/quality/manual preferences remain the control for configured provider.
- **Owner conversational controls:** a narrowly parsed deterministic grammar proposes model strategy or opt-in failover. Pending changes expire after 120 seconds and require one-time confirmation through the signed WebApp or Telegram owner callback. No LLM prompt may directly change the configuration.
- **Mini App:** existing secure vault is restyled and extended. Secrets still enter only by HTTPS form, not Telegram messages.
- **Cost visibility:** rolling 30-day counts, observed input/output tokens when supplied by the provider; estimated USD **only** when Owner configures verified input/output USD per million token rates. Not a full vendor invoice, and unpriced calls are explicitly marked.

## P2
- **Comparison:** exactly two explicitly chosen models, both must be in the discovered list; two bounded real prompts sequentially. An observed latency comparison is not a controlled benchmark and no unvalidated quality rating is made. Rate-limited.
- **Failover:** initially disabled. When Owner enables it, the Telegram model worker may retry **once** using a different model from the *same provider* that passed an explicit probe within the last 24 hours and is still in the discovered catalog. Cross-provider failover and access to an unapproved key are not permitted; two model calls might be charged. This never overrides private-mode restrictions.

## Invariants and operations
- Preserve existing `CERES_DB_PATH` mounted /data volume, provider vault encryption, owner ACL, and existing Telegram delivery worker.
- No automatic paid probing at startup or when opening dashboard. Probes: six per Owner per ten minutes; comparison: twice per 15 minutes and additionally consumes probe quota.
- No claims of total-account cost without vendor billing data.
- New files `ceres_model_ops.py` and `ceres_model_ops_routes.py` must be explicitly copied into both WeiGuo Docker images; build-time import check prevents the prior missing-module incident.
- Release gate: unit regressions, Docker smoke, Quirinus, Railway deployment SHA, health endpoint, owner `/hub` and signed WebApp interaction. Do not consider a container healthcheck to be proof of Telegram response functionality.
- Limitation: the health panel uses prior verified events, not an independently initiated live Telegram echo. Quality comparison uses one fixed minimal prompt; more comprehensive evaluation, invoicing integration and automatic budget enforcement are out of scope for this version.
