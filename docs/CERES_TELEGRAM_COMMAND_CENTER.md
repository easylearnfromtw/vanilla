# Ceres Telegram Command Center — Owner-only GitHub discovery and Detroit navigation

## Scope

Adds a **single private Telegram command entrance** to the existing Ceres webhook,
without replacing verified `/admin` / Slime controls or introducing a second bot.
The source of truth remains WeiGuo/Detroit; the Telegram UI is an operator view, not
a second permissions database or a generic terminal.

### Commands and buttons

| Telegram command | Behavior |
|---|---|
| `/start`, `/hub`, `控制中心` | Inline-button command center |
| `/hub status`, `系統狀態` | Live *configuration* flags (not proof of uptime) |
| `/hub tools`, `功能清單` | Scope-aware capability summary: implemented vs pending |
| `/hub nodes` | Calls the existing verified Slime status handler |
| `/hub accounts` | Delegates to the existing `/admin users` |
| `/hub providers` | Delegates to the existing `/admin providers` |
| `/hub github telegram agent` | Read-only GitHub Search API, 5 repo metadata matches |
| `/hub sources` | Curated projects with license caveats |

The Telegram bot continues to offer ordinary AI chat, `/calc`, `/cream`,
`/scouts`, Slime approvals, and the encrypted provider-key WebApp. New hub
messages and callbacks are deduplicated and **excluded from the AI request queue**.

### Supply-chain policy

External GitHub search is **information only**. It does **not** clone, download,
pip/npm install, dynamically import, run, commit, push, configure actions or
merge any project; no GitHub PAT is required. Results contain repository name,
summary, stars, license hint and canonical GitHub URL. The public endpoint is
pinned to `https://api.github.com/search/repositories`, with strict input
validation, response limits, no redirects, short timeouts and three searches
per owner per minute. Disable with `CERES_GITHUB_DISCOVERY_ENABLED=false`.

Potential upstream sources, to be assessed at the time of adoption:

- [OpenClaw](https://github.com/openclaw/openclaw): MIT; agent gateway ideas
- [aiogram](https://github.com/aiogram/aiogram): MIT; Python Telegram bot API
- [grammY](https://github.com/grammyjs/grammY): MIT; TypeScript bot API
- [AstrBot](https://github.com/AstrBotDevs/AstrBot): AGPL-3.0; architecture reference only
- [n8n](https://github.com/n8n-io/n8n): Sustainable Use License, not permissive open source; evaluate restrictions

Do not assume that a GitHub API license label settles the project's legal
status. Audit `LICENSE`, copied dependencies, transitive licensing,
vulnerability advisories and upstream revision before bringing code into
Vanilla. No third-party code is vendored by this PR.

### Existing security boundaries

1. Webhook secret header + Telegram private-chat sender ID + server allowlist.
2. Owner Telegram user ID **linked** to the immutable Google subject and current
   owner role; each message/callback re-verifies this.
3. No provider keys, device tokens or owner identity details are sent to GitHub.
4. Telegram chat requests are untrusted. Results cannot authorize deployment,
   arbitrary tool execution, payment, email, or changes to GitHub.
5. Slime's destructive actions still require their existing single-use approvals.
6. `/admin` manages Gmail and provider settings via its existing confirmations
   and Telegram-signed secure WebApp; do not send API keys in chat.
7. Telegram bot chats are not end-to-end encrypted.

### Not included in this change

- A full Telegram Mini App dashboard (currently only the secure API vault WebApp)
- Automatic installation or execution of third-party GitHub code
- Full independent backend execution of every Detroit module
- Unattended GitHub commits/deployments, autonomous code mutation or arbitrary shell access
- An assurance that a configured model or node is actually online

Those capabilities require separately reviewed adapters, scoped tool
permissions, high-impact approvals, isolated runners, artifact provenance,
rollback and deployment validation.

### Tests and rollout

```bash
python3 -m unittest discover -s services/weiguo -p 'test_ceres_command_center.py'
python3 -m unittest discover -s services/weiguo -p 'test_ceres_*.py'
npm run build
```

Stage in a test bot / staging WeiGuo environment. Verify owner-only handling,
callback deduplication, GitHub public API rate limits, original AI/Slime flows,
and absence of secrets in logs. Merging alone does **not** register a
Telegram webhook, configure owner mappings, deploy Railway or activate
a server model. Retain `CERES_ENABLED`, `CERES_OUTBOUND_ENABLED` and
`CERES_SERVER_AGENT_ENABLED` as existing operator-controlled gates.
