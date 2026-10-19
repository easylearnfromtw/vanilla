# 衞國 / WeiGuo — Single Backend Contract

Canonical FastAPI application: app:app. The older server:app module is now an import alias. Admin bearer authentication remains server-only; a separate Google OIDC family gateway has been added for the PWA.

Deployment status: Source and tests exist, including a family login gateway and per-person task ownership. A verified production HTTPS deployment, operator-managed Google identity allowlist, and 24/7 scheduler are not supplied by this repository. Never put server tokens in GitHub Pages, the PWA or chat content.

## Setup

1. On a trusted Docker host, copy docker-compose.example.yml into a private deployment configuration.
2. Set a random WEIGUO_ADMIN_TOKEN of 32+ characters in private server environment variables.
3. Set WEIGUO_ALLOWED_HOSTS to exact public HTTPS destination hosts, such as example.org,www.example.org. No wildcard domains. Empty list blocks browser tasks.
4. Configure a host/VPC egress firewall to deny private/loopback/link-local/metadata networks, even if DNS changes. Application URL checks are not a complete network sandbox.
5. Run docker compose up --build. The example binds only the host loopback interface at port 9080 and persists short-task logs in a private Docker volume.
6. Configure Google OIDC + family ACL below, enforce HTTPS and exact CORS origins, and put the public family endpoints behind a rate-limiting reverse proxy. Keep operator endpoints inaccessible at public ingress where possible.
7. Confirm GET /v1/health, POST /v1/auth/google with a real verified Google ID token, POST /v1/family/tasks, and GET /v1/family/tasks/{id} using the returned short-lived family bearer.

## Google identity gateway (iPhone / PWA)

- Existing Vanilla Google Drive OAuth **access_token is NEVER sent to WeiGuo**. The user signs in with the same Google account in the WeiGuo panel, using Google Identity Services `accounts.id` to obtain an **identity ID token**. Do not accept user-supplied email or role values as identity.
- POST `/v1/auth/google` verifies Google signature, `aud` (must equal the configured Web OAuth client ID), issuer, expiration and verified email, then looks up the stable Google `sub` in **server-only** `WEIGUO_FAMILY_ACL_JSON`. Unknown accounts are denied.
- Google ID token is exchanged for a **15-minute HMAC-signed family session**. The token is kept in PWA JavaScript memory only (not Drive, cookies, localStorage, sessionStorage or URLs). `WEIGUO_SESSION_SECRET` must be distinct from the admin token. ACL is re-read on every request so revocation or role demotion is effective immediately.
- GET `/v1/auth/me` returns the signed-in family identity. POST `/v1/family/tasks` and GET `/v1/family/tasks/{id}` permit read-only tasks for `owner` and `member` roles only; a `viewer` cannot queue or fetch tasks. Task lookup filters by stable Google `sub`, not email or client-provided names. A family member is limited to 6 new tasks per rolling minute (SQLite transaction protected).
- The page must be served over HTTPS, with explicit CORS origin `https://easylearnfromtw.github.io`, and the browser must point to one trusted HTTPS backend (build-time GitHub variable `WEIGUO_API_URL`; Vite exposes it as `VITE_WEIGUO_API_URL`). Do **not** put a secret in either variable. CORS is not authentication.
- Google Identity Services button may require interaction or an account chooser in iOS Safari. If logged into different Google accounts for Drive and WeiGuo, the client rejects the session. Identity session expires after 15 minutes and requires another Google confirmation.

Example server-only `.env` (replace the placeholders, and never commit the values):

```dotenv
WEIGUO_ADMIN_TOKEN=<unique-strong-operator-token-at-least-32-characters>
WEIGUO_SESSION_SECRET=<a-different-random-32-plus-character-secret>
WEIGUO_GOOGLE_CLIENT_ID=<same-public-web-client-id-used-by-Vanilla>
WEIGUO_FAMILY_ACL_JSON={"123456789012345678901":{"member":"哲愷","role":"owner"},"234567890123456789012":{"member":"哲緯","role":"member"},"345678901234567890123":{"member":"曉芬","role":"member"}}
WEIGUO_CORS_ORIGINS=https://easylearnfromtw.github.io
```

These Google `sub` numbers are EXAMPLES ONLY. Obtain and independently verify each family member’s stable subject identifier from Google `userinfo` response `id` for the intended authenticated account; never guess or use these placeholders. Restrict the Google Cloud Web OAuth JavaScript origin to the real Vanilla origin. To activate the PWA, set the GitHub **Actions variable** `WEIGUO_API_URL` to the actual public HTTPS backend origin (no path). GitHub Pages redeployment rebuilds the static bundle with that URL; it is public and contains no secret.

## Supported API

- GET /v1/health and GET /health: basic configuration status without secrets.
- POST /v1/tools: validate safe tool metadata (does not install code).
- POST /v1/plan: optional Ollama proposal, never executed automatically.
- POST /v1/execute: synchronous controlled Playwright steps, server-admin authorization required.
- POST /v1/tasks: QUEUE approved read-only navigate/extract/scroll steps, durable SQLite status.
- GET /v1/tasks/{id}: operator lookup of queued/running/completed/failed state and bounded operation record.
- POST /v1/auth/google: verify Google ID token and issue a family session.
- GET /v1/auth/me, POST /v1/family/tasks and GET /v1/family/tasks/{id}: per-Google-subject task access.

Example body for POST /v1/tasks:
{"start_url":"https://example.org/info","steps":[{"action":"extract"}]}

The background queue always blocks click/fill, even if supplied with client approval fields. Synchronous click/fill are off by default; only a trusted operator can enable them, and irreversible or sensitive actions remain blocked.

## Server-only environment

WEIGUO_ADMIN_TOKEN: 32+ random characters, never distributed to the browser.
WEIGUO_SESSION_SECRET: separate random 32+ secret, server-only.
WEIGUO_GOOGLE_CLIENT_ID: public Web OAuth client ID matching the existing Vanilla Google client.
WEIGUO_FAMILY_ACL_JSON: mapping of verified Google stable subjects to member names and owner/member/viewer roles.
WEIGUO_CORS_ORIGINS: exact HTTPS GitHub Pages origin, no wildcard.
WEIGUO_ALLOWED_HOSTS: comma-separated exact public HTTPS origins.
WEIGUO_TASK_DB: SQLite path, /data/weiguo-tasks.sqlite3 in Docker.
WEIGUO_ALLOW_JAVASCRIPT=false: secure-by-default, but JavaScript-only websites may not render.
WEIGUO_ALLOW_MUTATIONS=false: prohibit interactive click/fill.
WEIGUO_OLLAMA_URL, WEIGUO_OLLAMA_MODEL: optional trusted internal Ollama, no additional iPhone model.

## Limitations

A single task runs per service process, with up to 12 steps, restricted domains and bounded extracted text. Jobs are preserved in a SQLite audit but do NOT resume on restart (interrupted status becomes failed); old records expire after seven days. This is not an always-on Persistent Jobs Cron engine or push service.

Browser network request interception and URL checks alone cannot prevent every DNS rebinding or WebSocket escape. Keep the service private, set outbound firewall controls and do not enable execution of untrusted code. A Google OIDC family gateway, household ACL, subject-isolated tasks, short session and per-member task rate limit are implemented. Do not claim production readiness until backend HTTPS, issuer/audience verification, CORS, private egress and iPhone end-to-end tests are performed. Higher-risk interactions and site logins are still NOT available to family sessions.

Before production, smoke-test Chromium, blocked destinations, audit persistence, browser redirects and network egress restrictions on the actual host.
