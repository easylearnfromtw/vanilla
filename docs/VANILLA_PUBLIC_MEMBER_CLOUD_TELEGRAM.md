# Vanilla Public + Gmail Member Cloud + Ceres Telegram

## Public policy
Vanilla PWA is publicly accessible, including offline/local AI and user-owned provider settings. Never require Gmail whitelist for loading the public PWA. Only the owner-operated cloud API proxy and private Telegram AI require verified Google OIDC membership. A user with their own API key remains independent of the owner gateway.

## Enable after staging verification
1. Keep the existing Google OIDC login and owner Telegram binding. Apply a persistent private CERES_DB_PATH volume and a private vault encryption key. Keep the current Owner mapping in CERES_TELEGRAM_CHAT_IDS, CERES_FAMILY_LINKS_JSON, and WEIGUO_FAMILY_ACL_JSON.
2. In Railway variables, set CERES_MEMBER_CHAT_ENABLED=true to opt in, plus CERES_SHARED_CLOUD_DAILY_TOKENS=12000 (default), CERES_SERVER_AGENT_ENABLED=true, CERES_ENABLED=true and CERES_OUTBOUND_ENABLED=true. Configure a working model runtime/approved cloud provider in the server vault. This feature cannot make an unconfigured model online.
3. Telegram Owner: /admin allow member@gmail.com member chat,gemini,openai,deepseek,canva — grant only required scopes; exclude provider scopes not intended. /admin quota member@gmail.com 12000 optionally customizes one verified account's daily budget.
4. Member: log into Vanilla with the same Google identity as the invite. Open Ceres panel → Generate one-time Telegram pairing → send /link vcp_... in a private chat with @SignWell_bot. Challenge lasts five minutes, usable once, revocation takes effect on subsequent callbacks/jobs. Only signed Telegram private chat ID is trusted.
5. Member may use Ceres AI private conversation and the server-side shared cloud model proxy. Owner /admin and /hub configuration remains Owner-only. Member Slime/node actions are never invoked. A shared daily conservative budget applies across Ceres Telegram model calls and Vanilla shared cloud chat; failed reservations count against the budget.
6. Run python3 -m unittest discover -s services/weiguo -p 'test_ceres_member_access.py', related regression tests, and npm run build. Stage webhook, OIDC callback, provider inference and revoke behaviour before production rollout.

## Endpoints
- POST /v1/family/ceres/telegram-link/start (authenticated verified member with chat grant)
- GET /v1/family/ceres/telegram-link/status
- POST /v1/family/models/chat (legacy Gemini shared proxy, now strictly Gmail gated)
- GET /v1/family/models/shared/status
- POST /v1/family/models/shared/chat (provider gemini/openai/deepseek, no caller key or URL)
- /v1/family/canva/... now always checks the canva scope.
- Telegram /link <code> is the only accepted pre-whitelist command. All owner commands still require owner_subject.

Cloud requests use backend-held vendor keys, a strictly pinned official vendor HTTPS endpoint and the selected model from server metadata, with explicit user consent, bounded messages and per-member budgets. Tokens are conservative reservation credits, not verified supplier billing tokens; this is a cost ceiling mechanism, not a pricing statement.

## Boundaries
- A merged PR does not deploy Railway, enable Google credentials, register a webhook, or demonstrate a real model response.
- Telegram messages are not end-to-end encrypted; do not paste upstream API credentials into chat.
- Owner provider API keys never become downstream vnl_ or vna_ API keys. Public Vanilla user keys are independent.
- The optional Owner-hosted inference gateway remains separately disabled until deployed with a trusted runtime.
