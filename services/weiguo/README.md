# 衞國 / WeiGuo — Single Backend Contract

Canonical FastAPI application: app:app. The older server:app module is now an import alias. Only one web authentication and browser policy exists.

Deployment status: Source and tests exist. The persistent browser service, trusted per-person login gateway, and ongoing scheduler have not been deployed. Never put server tokens in GitHub Pages, the PWA or chat content.

## Setup

1. On a trusted Docker host, copy docker-compose.example.yml into a private deployment configuration.
2. Set a random WEIGUO_ADMIN_TOKEN of 32+ characters in private server environment variables.
3. Set WEIGUO_ALLOWED_HOSTS to exact public HTTPS destination hosts, such as example.org,www.example.org. No wildcard domains. Empty list blocks browser tasks.
4. Configure a host/VPC egress firewall to deny private/loopback/link-local/metadata networks, even if DNS changes. Application URL checks are not a complete network sandbox.
5. Run docker compose up --build. The example binds only the host loopback interface at port 9080 and persists short-task logs in a private Docker volume.
6. Confirm the server-side GET /v1/health and authenticated POST /v1/tasks, then check GET /v1/tasks/{id}. Only an OAuth/OIDC family-owner gateway should eventually expose this function to Vanilla users.

## Supported API

- GET /v1/health and GET /health: basic configuration status without secrets.
- POST /v1/tools: validate safe tool metadata (does not install code).
- POST /v1/plan: optional Ollama proposal, never executed automatically.
- POST /v1/execute: synchronous controlled Playwright steps, server-admin authorization required.
- POST /v1/tasks: QUEUE approved read-only navigate/extract/scroll steps, durable SQLite status.
- GET /v1/tasks/{id}: lookup queued/running/completed/failed state and bounded operation record.

Example body for POST /v1/tasks:
{"start_url":"https://example.org/info","steps":[{"action":"extract"}]}

The background queue always blocks click/fill, even if supplied with client approval fields. Synchronous click/fill are off by default; only a trusted operator can enable them, and irreversible or sensitive actions remain blocked.

## Server-only environment

WEIGUO_ADMIN_TOKEN: 32+ random characters, never distributed to the browser.
WEIGUO_ALLOWED_HOSTS: comma-separated exact public HTTPS origins.
WEIGUO_TASK_DB: SQLite path, /data/weiguo-tasks.sqlite3 in Docker.
WEIGUO_ALLOW_JAVASCRIPT=false: secure-by-default, but JavaScript-only websites may not render.
WEIGUO_ALLOW_MUTATIONS=false: prohibit interactive click/fill.
WEIGUO_OLLAMA_URL, WEIGUO_OLLAMA_MODEL: optional trusted internal Ollama, no additional iPhone model.

## Limitations

A single task runs per service process, with up to 12 steps, restricted domains and bounded extracted text. Jobs are preserved in a SQLite audit but do NOT resume on restart (interrupted status becomes failed); old records expire after seven days. This is not an always-on Persistent Jobs Cron engine or push service.

Browser network request interception and URL checks alone cannot prevent every DNS rebinding or WebSocket escape. Keep the service private, set outbound firewall controls and do not enable execution of untrusted code. No public browser CORS/admin credentials are provided; household ACL, rate limits, login and high-risk approvals require a separately verified trusted gateway.

Before production, smoke-test Chromium, blocked destinations, audit persistence, browser redirects and network egress restrictions on the actual host.
