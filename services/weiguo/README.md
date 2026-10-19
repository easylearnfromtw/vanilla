# 衞國 Browser System — protected self-hosted backend

Separately hosted FastAPI + Playwright + SQLite worker. Optional Ollama on a trusted local network for read-only multi-step planning. **No headless browser is running on GitHub Pages/iPhone.**

## Startup

1. Python 3.11+: `pip install -r requirements.txt && playwright install chromium`.
2. Set `WEIGUO_ALLOW_HOSTS=example.com,www.example.com` (exact public hostnames), `WEIGUO_SESSION_TOKEN` to a random secret of 32+ characters, `WEIGUO_ALLOWED_ORIGIN=https://easylearnfromtw.github.io`, and `WEIGUO_DB` to persistent SQLite storage.
3. Run behind a trusted TLS reverse proxy: `uvicorn server:app --host 127.0.0.1 --port 8322`.
4. In Vanilla > 衞國, enter HTTPS backend address, *short-lived* session token and public HTTPS task URL.
5. Optional: `WEIGUO_OLLAMA_URL=http://127.0.0.1:11434`, `WEIGUO_OLLAMA_MODEL=qwen3:4b`; secure Ollama so it is never publicly exposed. Without Ollama, only page text/image extraction is executed.

## Security and limitations

- All navigation and network requests enforce **exact HTTPS public-host allowlist**. GET/HEAD only, no redirects outside it. Denies localhost/private address literal, executable code, account login, payment, uploads, form POST, and cookies persistence. Additional egress firewall / DNS pinning is recommended to mitigate DNS rebinding.
- The worker is single-process and serializes browser executions. The API token is never persisted in Vanilla, although it is held in React state during the open session; production deployments should use OAuth or an authenticated short-lived token broker instead of distributing the server administrator token.
- SQLite stores task history, not credentials. Tasks may stop if the backend process restarts (the previous run becomes `failed`); **this is not Persistent Jobs Cron**. External 24/7 operation and push notification require separate deployment/monitoring.
- Third-party website terms, robots policies and rate limits must be respected. A separate human approval step is needed for any non-read-only browser action. Prompt injection in page text is not trusted.
- General third-party tool manifests in the UI are **declarative only** until a reviewed server adapter is written and authorized. A JSON manifest cannot execute code.