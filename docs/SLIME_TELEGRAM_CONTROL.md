# Slime — Telegram owner-only conversational administration

This phase unifies Ceres Telegram and the WeiGuo Slime registry. It **replaces
the Node Fabric frontend admin tutorial with a download-only area**.

## Division of responsibility

- **Vanilla PWA → Slime 算力網路 / Detroit Studio → Slime 下載**: download-only role and OS selector using **real GitHub Releases assets** built from `services/slime/desktop.py`. The page does not invent an EXE/ZIP link when no release exists.
- **SignWell_bot / Ceres private Telegram**: the only administrative interface.
  The admin sends plain-language Chinese messages; the deterministic
  `slime_telegram.py` interpreter identifies four bounded actions. The LLM
  does not get a database or generic command shell.
- **WeiGuo / Slime registry**: HTTPS node registration, short-lived single-use
  invitation, hashed-at-rest bearer credentials and status heartbeats. The
  FastAPI app registers **only** `/v1/slime/node/{join,heartbeat,leave}`.
  Slime's legacy /v1/family/slime administrative routes are not mounted.
- No model inference, remote command execution, sharded 30B, model downloads,
  remote file reads, auto-start or power control exist in this phase.

## Server-only configuration

Set these in your private WeiGuo deployment (e.g. Railway environment
variables), never inside GitHub/Vanilla PWA/Telegram chat:

| Setting | Required |
|---|---|
| `SLIME_ENABLED=true` | Enables the node registry and automatically gates Ceres ingress to one verified owner |
| `SLIME_DB_PATH=/data/vanilla-slime.sqlite3` | Persistent private filesystem volume |
| `SLIME_PUBLIC_API_ORIGIN=https://your-api.example` | HTTPS origin accessible to contributors, without path/query/trailing slash |
| `CERES_ENABLED=true` | Existing signed Telegram webhook enabled |
| `CERES_OWNER_ONLY=true` | Force one verified owner even when Slime is disabled |
| `CERES_TELEGRAM_CHAT_IDS` | Your **single** verified numeric Telegram private-chat user ID |
| `CERES_FAMILY_LINKS_JSON` | One Telegram ID → immutable Google subject ID |
| `WEIGUO_FAMILY_ACL_JSON` | The same subject with role `owner` |
| `CERES_SERVER_AGENT_ENABLED=true` / `CERES_OUTBOUND_ENABLED=true` | Existing Ceres always-on worker/reply gate |
| `CERES_TELEGRAM_BOT_TOKEN`, `CERES_TELEGRAM_WEBHOOK_SECRET` | Existing server-only secrets; do not regenerate without need |

The bot URL/username must match the existing independently verified Ceres
webhook configuration. Never post your numeric subject/chat IDs, webhook
secret, bot token, OAuth tokens, or device token in a public source repository.
A configured chat ID *alone* is insufficient: the sender must match a valid
owner Google subject and signed private-chat Telegram update. In strict mode,
multiple owner mappings fail closed.

When the model is unavailable, Slime's deterministic status, invitation and
confirmation operations can still work in the always-on Ceres worker if
outbound delivery is enabled; ordinary AI questions still need a model.

## Conversational examples (type to SignWell_bot)

- 「目前有哪些電腦」 → inventory, offline/online and admin-enabled status.
- 「建立朋友邀請碼」 → privately returns a **single-use 10-minute** link.
- 「停用 PC-Study」 → asks for one-time confirmation code (3-minute expiry).
- 「確認 ab12cd34」 → only then performs the *pending* operation.
- 「恢復 PC-Study」 / 「移除 PC-Study」 → likewise require confirmation.
- 「取消」 → clears any pending confirmation.
- `/slime help` → concise overview.

Names must match the registered device's exact label or ID; ambiguous target
names are rejected. The bot never executes arbitrary natural-language admin
requests. Slime exchanges no prompts, user files, desktops or model weights.
There is a per-owner audit log without storing the invitation plaintext.
Ceres does not persist Slime replies (which could contain invitations)
in its server-side model conversation history. However, Telegram itself may
retain messages and the content is **not end-to-end encrypted** for bot chats.

## Device onboarding

Download the role-specific installer from a verified Slime GitHub Release (if published), launch it on the participating device, paste the owner's private Telegram invitation link, then explicitly accept sharing. The desktop client extracts the `#slime=` secret from the HTTPS link, reports only limited CPU/RAM/OS/optional GPU metadata, and offers pause/leave controls. No user needs to type a token or administrator credential into Vanilla's public frontend. Release artifacts are not guaranteed to exist until the signed-off release workflow succeeds. Source remains reviewable at `services/slime/desktop.py`.

## Security and verification

- Private-mode/other Telegram identities and members never gain the owner
  chat; strict Ceres ingress requires exactly one verified linked owner.
- New node tokens are returned only on registration and hashed in the DB.
  Revoked tokens cease to work. Friends can leave without an owner action.
- Status and sensitive mutations check the verified owner again per request.
- All pause/resume/revoke operations require unique pending confirmation codes.
- Production still needs ingress rate limiting, abuse monitoring, signed binary
  installers, node attestation, executable sandboxing, and bandwidth/thermal
  policy **before** enabling distributed inference.
- Python tests: `python3 -m unittest discover -s services/weiguo -p test_slime_telegram.py`
- UI tests: `npm run test:node-fabric`; full: `npm run build`.

Existing pre-Slime prototype files under `public/node-fabric/` remain for audit and backward compatibility but are not linked from the current Slime download page; they are not interoperable with the WeiGuo Slime registry.
