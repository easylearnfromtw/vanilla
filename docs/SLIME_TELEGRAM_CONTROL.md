# Slime — Telegram owner-only conversational administration

This phase unifies Ceres Telegram and the WeiGuo Slime registry. It **replaces
the Node Fabric frontend admin tutorial with a download-only area**.

## Division of responsibility

- **Vanilla PWA → Detroit Studio → Slime 下載**: only two downloadable Python
  3.10+ opt-in programs: `slime-my-computer.py` and `slime-friend.py`.
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

Download the role-specific source from the Vanilla Slime download area.
On the participant-owned computer install Python 3.10+, then run (Windows
substitute `py -3` for `python3`):

```sh
python3 slime-friend.py probe
python3 slime-friend.py join --url https://your-api.example --invite INVITE_CODE --consent
python3 slime-friend.py run
# Ctrl+C to stop; to revoke identity and delete local credentials:
python3 slime-friend.py leave
```

For a personal device replace filename with `slime-my-computer.py`. The
pairing link sent by the owner can be pasted into `--invite`; only the
`#slime=` fragment token is used. `--url` must be the trusted HTTPS API
origin separately supplied by the owner. The program only reports detected
CPU cores, RAM size, OS and optional NVIDIA GPU metadata. It does not run
tasks, throttle hardware or automatically consume CPU/GPU shares.

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

Existing pre-Slime prototype files under `public/node-fabric/` remain
present for audit/backward compatibility but are no longer linked from the
current frontend and are not interoperable with the new WeiGuo Slime registry.
