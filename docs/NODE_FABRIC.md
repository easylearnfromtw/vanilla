# Detroit Node Fabric — owner / friend node prototype

## Scope and non-goals

Detroit Studio now includes a **Node Fabric 節點** tab, with separate
**我的電腦** (owner) and **朋友的電腦** (contributor) downloads:

- `public/node-fabric/vanilla-owner.py`: small Python 3.10+ HTTP coordinator;
  registers invited devices, returns a heartbeat-based roster, rotates invite
  codes and revokes nodes.
- `public/node-fabric/vanilla-friend.py`: opt-in device agent; local system
  capability probe, joins a private HTTPS endpoint and sends periodic heartbeat.
- Both are human-readable standalone **Python programs**, not signed EXE/DMG
  installers. The downloads are served directly by the Vanilla PWA after deploy.
- **No inference pipeline has been implemented**. Model shards, GPUs, 30B/70B
  distributed execution, remote desktop/control, automatic start, persistent
  task assignments and live PWA telemetry are **not supported**. No code or
  model weights are remotely downloaded and no remote shell commands execute.

This is a secure-by-default first step. The browser UI displays instructions
and direct downloads only. It does not fetch private nodes or store tokens.

## Owner setup (Windows PowerShell)

1. Install Python 3.10 or newer, then download `vanilla-owner.py`.
2. `py -3 vanilla-owner.py init` — creates
   `~/.vanilla/node-fabric-owner.json` with restrictive permissions. Do not
   publish this file. Never paste its owner credential into the browser.
3. `py -3 vanilla-owner.py serve` — listens at **127.0.0.1:8765** only.
4. To invite a friend on a different network, deploy an **authenticated
   HTTPS private-network reverse proxy**, for example Tailscale Serve,
   pointing at localhost:8765. Keep your tailnet ACL limited to invited peers.
   Do not expose the raw HTTP port with router port forwarding.
5. `py -3 vanilla-owner.py invite` — privately send the pairing code to the
   friend (never the owner token). After each friend joins,
   `py -3 vanilla-owner.py rotate-invite` invalidates the previous code.
6. `py -3 vanilla-owner.py nodes` to check the devices;
   `py -3 vanilla-owner.py revoke NODE_ID` to revoke one.

On macOS/Linux, use `python3` instead of `py -3`.

## Contributor setup (friend's own terminal)

1. Review `vanilla-friend.py` before running. Download it from Vanilla.
2. `py -3 vanilla-friend.py probe` — prints the **limited hardware
   metadata** that will be shared. It does not send network requests.
3. Agree to participate, then use the owner's private endpoint and
   **invite code**, not an owner/admin token:

```powershell
py -3 vanilla-friend.py join --url https://YOUR-PRIVATE-ENDPOINT --pair INVITE_CODE --cpu 30 --gpu 30 --consent
py -3 vanilla-friend.py run
```

`run` keeps a **foreground-only** 60-second heartbeat; Ctrl+C stops it
immediately. `py -3 vanilla-friend.py leave` revokes the node token and
removes local pairing data. The CPU/GPU settings are **future limits metadata**
only: the prototype performs **zero** model computation.

The contributor sends the OS name, logical CPU count, detected total RAM,
and (if `nvidia-smi` exists) one GPU model/memory string. This is not a
memory scanner and does not read personal documents, chat data or browsing
history. However, joined nodes can reveal device capability metadata to
the owner; use only with informed consent.

## Security boundary and risk

- No unsolicited connections or automatic background service on the friend
  device. A friend initiates each join and chooses whether to run the agent.
- Owner JSON secrets never enter the GitHub Pages app. Contributor tokens are
  stored locally under `~/.vanilla/node-fabric-friend.json`; protect this file.
- Owner responds to `/public-health`, `/api/join`, `/api/heartbeat`,
  `/api/leave` and owner-token-gated `/api/nodes`. Other paths return 404.
- Remote URL must use HTTPS. The HTTP exception exists only for localhost
  development; never place the owner port directly on the public Internet.
- Tokens should be revoked if compromised. The rotating invite token isn't a
  per-user identity system. A production release requires authenticated
  identity, TLS endpoint trust, rate limiting, audit logs, stronger pairing,
  update signing, consent UX and threat modeling before enabling job dispatch.
- Owner's file permissions attempt `0600`. On Windows use filesystem ACLs
  to protect your home folder. Tokens must never be logged or placed in URLs.
- Current heartbeat sends no prompts or model data. **Future tensor exchange
  will not automatically be privacy-preserving**; prohibit medical/private
  prompts on friends' devices unless a separately approved privacy design exists.

## Subsequent phases (not shipped)

1. Signed node binaries/installers for Windows/macOS/Linux, signed updates,
   version negotiation, authenticated HTTPS API with per-account device trust.
2. Owner-only, authenticated LUCA live status panel and LUCA health events.
3. Diana/Zeus capability-aware scheduling for *independent* tasks.
4. Benchmark real model splitting (llama.cpp RPC, EXO or comparable runtimes)
   in a trusted LAN first; dynamically refuse slow/unreliable remote shards.
5. Fault tolerance, model integrity checking, explicit model/thermal/data caps,
   bandwidth estimates, per-job opt-in, revocation, and graceful recovery.
6. Only then enable 30B/70B (depending on pooled RAM/VRAM, CPU/GPU and
   network latency; 10 × 3B is not itself one 30B).

## Test

```sh
python3 -m unittest discover -s tests -p 'test_node_fabric.py'
node --test tests/node-fabric-ui.test.mjs
npm run build
```
