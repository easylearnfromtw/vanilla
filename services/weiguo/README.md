# 衞國 / WeiGuo — Single Backend Contract

Canonical FastAPI application: app:app. The older server:app module is now an import alias. Admin bearer authentication remains server-only; a separate Google OIDC family gateway has been added for the PWA.

Deployment status: Source and tests exist, including a family login gateway and per-person task ownership. A verified production HTTPS deployment, operator-managed Google identity allowlist, and 24/7 scheduler are not supplied by this repository. Never put server tokens in GitHub Pages, the PWA or chat content.

## Setup

1. On a trusted Docker host, copy docker-compose.example.yml into a private deployment configuration.
2. Set distinct random WEIGUO_ADMIN_TOKEN and WEIGUO_SESSION_SECRET secrets (each 32+ characters) only on the server. They must never be equal.
3. Set WEIGUO_ALLOWED_HOSTS to exact public HTTPS destination hosts, such as example.org,www.example.org. No wildcard domains. Empty list blocks browser tasks.
4. Configure a host/VPC egress firewall to deny private/loopback/link-local/metadata networks, even if DNS changes. Application URL checks are not a complete network sandbox.
5. Configure WEIGUO_GOOGLE_CLIENT_ID with the same **public web OAuth client ID** as Vanilla's existing Google login. Set WEIGUO_FAMILY_ACL_JSON using immutable, verified Google `sub` values, not email or a frontend name dropdown, e.g. `{"GOOGLE_SUB_A":{"member":"Member A","role":"owner"}}`. Do not guess an account's `sub`; validate the identity privately before granting it access. Allowed roles: owner/member (read-only browser tasks) or viewer (identity only). Configure WEIGUO_CORS_ORIGINS to exactly `https://easylearnfromtw.github.io` for public Vanilla PWA.
6. Run docker compose up --build. The example binds only the host loopback interface at port 9080 and persists short-task logs in a private Docker volume. For iPhone access, place a trusted HTTPS reverse proxy on a verified custom domain with origin and network restrictions. Never expose the admin token in the proxy or web app.
7. Expose only family endpoints at public ingress where possible; enforce HTTPS, rate limits and origin restrictions.
8. Confirm GET /v1/health, POST /v1/auth/google with a real verified Google ID token, POST /v1/family/tasks, and GET /v1/family/tasks/{id} using the returned short-lived family bearer.

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

## Trust boundary

The existing Google Drive access token is **not** sent to WeiGuo. The user selects the same Google account using Google Identity Services (GIS) and supplies a short-lived **ID token** to `POST /v1/auth/google`. The backend verifies the Google-signed OIDC token and its audience against `WEIGUO_GOOGLE_CLIENT_ID`, checks `email_verified` and immutable `sub` against the **server-owned ACL**, and signs a distinct 15-minute session token in response.

The PWA holds only this task-scoped session **in JavaScript memory** (not localStorage, sessionStorage or cookies), and sends it as a Bearer header to family task endpoints. Sign-out clears this memory; already issued sessions expire within 15 minutes and can be revoked earlier by deleting the server ACL entry. ACL is consulted on **every** request. Family task rows are owned by Google `sub` and cannot be read by other members. The family API never invokes admin-only plan/execute/manifest endpoints. Tasks are limited to 6 creations per member per 60 seconds (single-process SQLite).

This is limited server-authorized access, **not** delegation of the management key or high-risk browser operations. Browser tasks are read-only, cannot click or fill, and are restricted to exact HTTPS host allowlists. Server administrators must prevent private-network egress. CORS alone is not authentication; origin restrictions and the Google session are both required.

## Google family identity gateway (new)

`POST /v1/auth/google` accepts a Google GIS **ID token** in `{"credential":"..."}`, verifies Google signature, issuer, expiry and the configured **audience**. It does not accept a Google Drive OAuth access token or trust any email, role or member name claimed by the browser. Identity is keyed by immutable Google `sub`. On a successful approved match, it returns a 15-minute HMAC-signed family session.

`GET /v1/auth/me` validates the family token; `POST /v1/family/tasks` queues strictly read-only steps and caps each Google sub at six submissions/minute. `GET /v1/family/tasks/{id}` only reveals results submitted by that exact `sub`. Roles `owner` and `member` can submit/read **their own** tasks; `viewer` can only query its own identity. Removing a `sub` from the ACL revokes access on the next request, including already-issued tokens. Old task results expire after seven days.

**Server-only setup (do not commit actual IDs, secrets or private ACL):**

- `WEIGUO_GOOGLE_CLIENT_ID`: existing Vanilla Google OAuth Web Client ID (public, matches `GOOGLE_CLIENT_ID` from `src/vault/google-auth.ts`)
- `WEIGUO_SESSION_SECRET`: independent random, server-only secret (at least 32 characters; distinct from `WEIGUO_ADMIN_TOKEN`)
- `WEIGUO_FAMILY_ACL_JSON`: JSON map of **verified** Google numeric `sub` values to `{"member":"family display name","role":"owner|member|viewer"}`; for example `{"123456789012345678901":{"member":"Demo","role":"member"}}` is illustrative only and does not authorize real Google accounts.
- `WEIGUO_CORS_ORIGINS`: exact `https://easylearnfromtw.github.io` (no path, wildcard, trailing slash or scheme downgrade)
- `WEIGUO_ALLOWED_HOSTS`: explicit public HTTPS domain names allowed for extraction.
- `WEIGUO_ADMIN_TOKEN`: independent operator-only token; the PWA must never receive it.

To identify an approved member's stable Google `sub`, use a **private server-side verified** ID-token inspection during enrollment. Do **not** rely on a user-provided email or ID, and do not log or store Google credentials. The app does not expose Google `sub` in its UI. Maintain the family ACL only in private deployment environment variables. Rotate secrets after compromise and restart workers.

**Security boundary:** CORS is not authorization; the signed family token and current ACL are checked on every family request. The admin routes still exist for backwards compatibility and must stay restricted by network policy, not merely by a hidden UI link. Rate-limit the login endpoint upstream as well, and enforce outbound private-network blocking; SSRF defenses inside Playwright are not a complete egress firewall.

## Supported API

- POST /v1/auth/google: verify Google GIS OIDC credential and exchange it for a 15-minute family-only session.
- GET /v1/auth/me: read verified family member and server-defined role.
- POST /v1/family/tasks: allow owner/member to queue a read-only task (rate-limited, account-owned).
- GET /v1/family/tasks/{id}: per-account lookup by immutable Google sub (other accounts receive 404).

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
WEIGUO_SESSION_SECRET: separate, random 32+ character HMAC key, server-only.
WEIGUO_GOOGLE_CLIENT_ID: exact Google web OAuth client ID used by GIS.
WEIGUO_FAMILY_ACL_JSON: server-owned JSON mapping immutable Google `sub` to member and role; no browser-controlled roles.
WEIGUO_PUBLIC_FAMILY_ONLY: set to true before enabling a public Railway domain; hides /v1/execute, /v1/plan, /v1/tools, operator /v1/tasks and OpenAPI. Use another private instance for operator-only workflows.
WEIGUO_CORS_ORIGINS: exact allowed HTTPS web origins, e.g. `https://easylearnfromtw.github.io`. Empty defaults to no cross-origin requests.
WEIGUO_ALLOWED_HOSTS: comma-separated exact public HTTPS origins.
WEIGUO_TASK_DB: SQLite path, /data/weiguo-tasks.sqlite3 in Docker.
WEIGUO_ALLOW_JAVASCRIPT=false: secure-by-default, but JavaScript-only websites may not render.
WEIGUO_ALLOW_MUTATIONS=false: prohibit interactive click/fill.
WEIGUO_OLLAMA_URL, WEIGUO_OLLAMA_MODEL: optional trusted internal Ollama, no additional iPhone model.

## Limitations

A single task runs per service process, with up to 12 steps, restricted domains and bounded extracted text. Jobs are preserved in a SQLite audit but do NOT resume on restart (interrupted status becomes failed); old records expire after seven days. This is not an always-on Persistent Jobs Cron engine or push service.

Browser network request interception and URL checks alone cannot prevent every DNS rebinding or WebSocket escape. Keep the service private, set outbound firewall controls and do not enable execution of untrusted code. A Google OIDC family gateway, household ACL, subject-isolated tasks, short session and per-member task rate limit are implemented. Do not claim production readiness until backend HTTPS, issuer/audience verification, CORS, private egress and iPhone end-to-end tests are performed. Higher-risk interactions and site logins are still NOT available to family sessions.

Before production, smoke-test Chromium, blocked destinations, audit persistence, browser redirects and network egress restrictions on the actual host.


## Moli hybrid browser adapter (experimental, opt-in)

Vanilla/Zeus may attempt the [Moli](https://github.com/lexmount/moli) Rust browser for a **single, read-only \`extract\` step**. On every other request (navigation chains, scrolling, clicking, filling, unapproved conditions, missing Moli executable, timeouts or failed extraction), it continues through the established Playwright Chromium path. The family Google identity gateway, immutable \`sub\` task ownership, Athena step validation, rate limits and the response event format remain unchanged. A successful Moli response includes \`"engine":"moli"\`; Chromium responses include \`"engine":"chromium"\`. Moli returns the **requested** source URL, not a verified final redirect URL.

Moli CLI is **not bundled into the normal Docker image**; the default engine remains Chromium. Do not fetch and execute a floating \`curl | sh\` installer in a production Docker build. Install an operator-reviewed, version-pinned Moli executable (and verify its official release checksum/signature where provided) into a trusted host/container, ensuring it is executable by the unprivileged \`weiguo\` user. For a Compose installation, a trusted locally installed binary can be bind-mounted read-only as \`/usr/local/bin/moli\`, ensuring the binary is compatible with the container architecture and libraries. This is optional; without it Chromium continues normally.

**Required before opt-in:** Moli's CLI does not expose the same per-request interception that this application uses with Playwright. Enforce an **independent network egress proxy/firewall**, allowing only the server-approved public HTTPS hosts and blocking all other hosts, private/loopback/link-local/metadata IP ranges, DNS rebinding, cross-host redirects and disallowed subresources. Setting the flag below does **not** implement isolation itself. Do not turn it on if you cannot verify these controls in the actual deployment.

Only after verifying outbound restrictions and Moli itself, configure these server-only settings:

\`\`\`dotenv
WEIGUO_BROWSER_ENGINE=auto
WEIGUO_MOLI_EGRESS_ISOLATED=true
WEIGUO_ALLOW_JAVASCRIPT=true
\`\`\`

- \`WEIGUO_BROWSER_ENGINE=chromium\` (default) never launches Moli; \`auto\` and \`moli\` try Moli only for the eligible read-only extraction and otherwise use Chromium.
- \`WEIGUO_MOLI_EGRESS_ISOLATED=true\` is a declaration of independently verified network isolation, not a security mechanism.
- Moli executes page JavaScript, so the adapter refuses Moli when \`WEIGUO_ALLOW_JAVASCRIPT=false\`. Normal Chromium behavior remains unchanged.
- Each Moli read is an independent subprocess with a fixed argument list (no shell), a minimal environment that excludes operator/OIDC credentials, a 20-second timeout and 64 KiB stdout cap. Only the first 10,000 characters enter the existing event log. No imported browser profile or long-lived Moli session is used.
- Moli currently supports **read-only single-page extraction only** in this adapter; its CDP, click/fill and multi-step interaction features are intentionally *not* enabled by this change.
- If Moli times out, is absent, or returns an error, the existing Chromium engine is the fallback. A fallback may repeat the same public GET; do not use this adapter for state-changing URLs.

Run tests with \`python3 -m unittest discover -s services/weiguo -p 'test_*.py'\`. Production enablement additionally requires real-browser integration tests against allowlisted pages and an outbound-network denial test. No deployment is performed by this PR.
