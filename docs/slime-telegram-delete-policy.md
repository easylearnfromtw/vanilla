# Slime — Telegram-gated Owner deletion (2026-10-21)

## Protection boundary

**Owner-initiated server-side revocation** requires a one-time code delivered
inside the authenticated Ceres Telegram Owner conversation. This policy does
not trap a contributing device or prevent its owner from uninstalling Slime.

| Operation | Telegram proof | Result |
|---|---|---|
| Ceres chat `移除 <node-id>` | Issues proof; requires confirmation | Removes server registration and invalidates token |
| Ceres Mini App > Devices > 撤銷配對 | Required, entered in private Mini App | Same server-side revocation |
| Family REST `POST /v1/family/slime/nodes/{id}/revoke` | Required as JSON `{"code":"..."}` | Same server-side revocation |
| Device-held `POST /v1/slime/node/leave` | Not required; holder's token required | Voluntary exit |
| OS uninstall of Slime on any device | Never required | The owner retains local device control |
| Pause/resume or inference approval | Existing separate confirmation | Does not remove device |

### How to revoke safely

1. In @SignWell_bot **private Owner chat**, open Slime nodes and tap
   **刪除驗證碼** for the exact device, or type `移除 <node-id>`.
2. Ceres issues a **12-character hexadecimal code** after validating chat↔
   Google Owner ACL and resolving the node uniquely. The code is 3 minutes
   valid, single-use, bound to Owner + Telegram chat + node ID + `revoke`.
3. Either reply `確認 <code>` to the **same private chat**, or return to the
   signed Slime Mini App and paste the code in the revoke dialog.
   The Family Owner API can also consume a matching code for the same node.
4. On success, the backend atomically removes the node, consumes the proof,
   and appends to `slime_telegram_audit`. All later node heartbeats using
   the previous token fail. Rejoining needs an entirely new Owner-issued invite.

Five incorrect attempts invalidate the proof. A second use, an expired proof,
wrong node, unauthorized chat or wrong Owner never deletes a device. The
Mini App's own per-action approval token remains a separate check.

### Consent and failure policy

- Node holders, especially friends, can withdraw consent and exit without a
  remotely-issued Owner code. No kernel/registry hooks or uninstall blockers.
- Server revocation is immediate for server-side registration and token validity;
  deleting local files from a friend's computer is **not** performed remotely.
- The device's local `leave` command requires its own device token, not a
  Telegram Owner credential. The owner must not prevent the device holder
  from using OS uninstall in offline conditions.
- Telegram bot messages are not end-to-end encrypted; no long-lived API key
  or node bearer token is included in the confirmation messages.
- Do **not** persist OTP codes in LocalStorage, logs, Analytics or a public
  page. The code is hashed in SQLite; wipe transient UI input after success
  or cancel.
- If Telegram or the Owner ACL is down, remote revocation fails **closed**.
  Suspend the affected node first using the existing authorized console, or
  withdraw the relevant server-side secrets using an emergency documented
  operator process. Never silently bypass the proof.

### Migration and rollout

1. Deploy `slime_revoke_gate.py` together with `slime_telegram.py`,
   `slime.py`, `ceres_slime_web.py` and `ceres_command_center.py`.
2. Provide valid `SLIME_ENABLED=true`, `CERES_FAMILY_LINKS_JSON`,
   `WEIGUO_FAMILY_ACL_JSON` and Telegram bot configuration.
3. Existing confirmation rows gain the `attempts` column at first gated
   revocation; pending legacy 8-hex codes live only through their TTL.
4. Validate with:
   `python -m pytest tests/test_slime_revoke_gate.py -q`
   `node --test tests/slime-telegram-delete.test.mjs`
5. Stage an Owner and a consenting Friend node. Exercise correct, wrong,
   expired, replayed, wrong-node codes on all three owner paths; verify audit
   and 401 heartbeat after deletion. Ensure Friend voluntary exit still works.
6. Deploy public page/installed node independently; no change is required
   to the friend installer for this server-side owner deletion rule.

The GitHub PR is source code, **not an assertion that a production bot or
service has already been deployed**.
