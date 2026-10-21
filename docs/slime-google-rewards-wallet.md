# Slime Google signup credits, scored rewards and WEEKEN project enrollment

> The new policy supersedes the former flat 100,000 Token signup amount. Details below mentioning the legacy flat amount are historical context.

## Current scored policy (2026-10-21)

- On a successful authenticated capability heartbeat, freeze a reproducible node score in **1–1000** when a verified Google account claims a gift.
- Scoring (self-reported, **not hardware-attested**):
  `clamp(14 + min(cpu,32)*11 + floor(min(ram_gb,128)*2) + gpu_points,1,1000)`.
  GPU points are 90 when a GPU is recognized, plus 18 per GiB of
  reported VRAM up to 16 GiB. A node must report positive CPU and RAM first.
- Base credit gift = frozen node score × **100** by default. Ceres Telegram
  Owner changes the Token-per-score multiplier for future grants (0–10,000).
- The reward recipient can independently enroll in the **WEEKEN VPN project**.
  One-time extra gift = `ceil_to_last_digit_9(frozen_score * 100)`.
  Since the raw amount is a multiple of 100, this is `score*100+9`
  (e.g., a score of 134 grants 13,400 + 13,409 if the user opts in).
- WEEKEN consent is separately opt-in with optional contact and hardware status
  permissions. It never authorizes traffic relaying, VPN tunnel activation,
  remote file access, network history logging, or remote device control.
  Every active connection requires separate, affirmative network permission.
  Users can withdraw WEEKEN consent and optional permissions. Withdrawal
  does not erase the gift by itself; **deleting the Slime node** revokes
  both base and extra gifts.
- Telegram Owner can view project enrollment metadata (node IDs, score,
  status, grant, opt-in flags) but never raw Google ID token or device bearer.
  Backend stores a Google subject, consent version/time and user-granted flags.
- Every owner-initiated deletion still requires the existing one-time Telegram
  deletion code. A device holder can voluntarily leave locally without it.
  Both paths record a persistent node tombstone in the registry.
- A replay-safe Ceres reconciliation revokes the wallet's original signup
  and WEEKEN gifts, revokes owned API keys, closes WEEKEN enrollment, and
  writes a forfeiture audit entry. The visible signed balance can become
  negative after the user already spent some credits. A nonnegative cash
  cache plus an independent debt record implements signed arithmetic without
  rebuilding the existing production wallet table.
- New API usage is refused while spendable credit is zero / debt remains.
  Refunds first pay down negative debt, then restore spendable balance.
- Vanilla front end: **Settings → Account & Sync → My Token Wallet**.
  It uses Google Identity Services and signed ID tokens in volatile tab state,
  without exposing device credentials or API keys to the public PWA.
- Per-node hardware telemetry can be spoofed on an untrusted device. These
  credits should remain strictly promotional; do not assign cash value or
  broadly allow automated strangers to join without stronger abuse controls.

## Legacy workflow notes

## Status and release requirements

This system is a **feature-flagged implementation** and must not be advertised
as live until the WeiGuo backend and a new Slime desktop release are deployed.

Environment:
- `SLIME_ENABLED=true` — existing paired-node service.
- `SLIME_REWARDS_ENABLED=true` — **off by default**. Set only after smoke tests.
- `WEIGUO_GOOGLE_CLIENT_ID=<authorized Google web OAuth client ID>` — Google Identity Services ID-token audience, not a Google API secret.
- `SLIME_PUBLIC_API_ORIGIN=https://<weiguo-api-host>` — existing HTTPS origin.
- `CERES_FAMILY_LINKS_JSON` / `WEIGUO_FAMILY_ACL_JSON` — existing verified **owner** to Telegram chat mapping.
- `CERES_DB_PATH` — should point to a durable, backed-up, single-writer SQLite filesystem shared with the public Vanilla inference gateway.
- `SLIME_DB_PATH` — existing durable Slime node registry path.
- `VANILLA_PUBLIC_API_ENABLED=true` plus a trusted self-hosted inference runtime **when recipients are intended to spend credits**; award claims alone do not prove inference availability.

Google Cloud OAuth configuration must allow the exact WeiGuo API HTTPS origin
as an **Authorized JavaScript origin**, for GIS web sign-in.
Google signed ID tokens are verified by Google issuer, aud, email_verified and
immutable sub; **family-only ACL is NOT required for reward recipients**.

## User flow

1. Friend/Owner explicitly consents and pairs their node using the one-time invitation.
2. The desktop program validates the WeiGuo response and saves the node token with restricted permissions.
3. Using its *device* bearer token (never in a URL), it requests a **10-minute one-time reward ticket**.
4. Desktop opens a second tab at `/v1/slime/rewards#ticket=<ticket>`. The page extracts and removes the fragment **before** loading Google's SDK.
5. The participant uses Google Identity Services sign-in. Only after verified Google OIDC and a still-registered node does the backend allocate the reward.
6. Server transaction grants the configured amount (default **100,000 model tokens**), records an immutable claim and a wallet ledger credit, and creates one per-account limited `vnl_` API Key. Raw key displayed **once**.
7. The same Google sign-in page can later display reward balance, total earned/spent, per-model usage and exact/estimated split. It can rotate the key and immediately revoke the former key.
8. `Slime-Friend --reward` / `Slime-Owner --reward` can request a fresh ticket when prior one expired. Successful already-claimed nodes are refused.

Eligibility:
- One reward **per verified Google subject worldwide**, regardless of email alias.
- One reward **per Slime node ID worldwide**, regardless of which Google account signs in.
- A node that has left or was revoked cannot claim a pending ticket.
- Unauthenticated static GitHub Pages visitors cannot issue tickets.
- Reward setting changes affect **future successful claims only**. Existing balances never change retroactively.
- Google sign-in alone never enables inference permission on a contributing device.
- A ticket is not a node credential: it authorizes at most one claim, not node execution.

## Telegram Owner controls

Open **Ceres → Slime private Mini App → 獎勵**.
Set amount from 0 to 10,000,000 credits and switch eligibility on/off.
The former initial setting was 100,000; under the scored policy the multiplier is 100. Owner can inspect recipients, total issued,
and consumed credits. Setting changes are audited in `slime_reward_admin_audit`.

## Wallet ledger, atomicity and exactness

Wallet is held in the *same transaction database as the Vanilla API quota and
usage tables* (CERES_DB_PATH), not the Slime registry DB. Wallet starts with:

    earned = configured signup amount
    spent  = 0
    balance = earned

Each `vnl_` reward API inference:
1. Checks key permissions, model whitelist, RPM/concurrency/daily/monthly
   limits before any model execution.
2. Reserves `utf8_prompt_bytes + framing_allowance + max_output_tokens`,
   expressed as a **conservative reservation**, *not exact tokenization*.
   Wallet balance and API usage reservation commit atomically under
   `BEGIN IMMEDIATE`, blocking concurrent overspending.
3. On success, if provider supplied valid integer
   `prompt_tokens` + `completion_tokens` within reserved bounds:
   `actual_charge = prompt_tokens + completion_tokens`.
   Refund reserved-minus-actual atomically, leaving the wallet with actual cost.
4. If the provider did not report usable token usage, keep the whole reserved
   amount as **conservative charged tokens**. Never claim an exact tokenizer
   value. This may overestimate usage, especially for multilingual prompts.
5. On failed model inference, release the entire reward wallet reservation;
   the failed API call remains visible in the API usage audit.
6. Double settlement is a no-op because `_finish()` only processes requests
   with `status='running'`.
7. Key rotation revokes old keys for new requests while retaining historical
   key bindings so in-flight old-key settlement still refunds correctly.

`slime_reward_ledger` contains positive grant / refund deltas and negative
reservation deltas. `slime_reward_wallet` caches balance, earned and spent.
`slime_reward_claim` enforces unique Google-sub and node-id. No currency or
convertible crypto assets are offered.

### Scope and caveats

- Generic input/output tokens are charged 1:1 as promotional Vanilla credits.
  Per-model compute costs, purchased external inference tokens, token exchange,
  and cash equivalence **are not part of this release**.
- A Telegram-configured credit budget is not a promise of infinite compute.
  All requests additionally respect available node, runtime and API limits.
- Having many Google accounts (Sybil identities) is not automatically
  eliminated by Google OIDC. Before opening large incentives to strangers,
  implement Owner review, abuse signals and spending/rate ceilings.
- Persistent SQLite should have backups and single-writer coordination; moving
  to multiple replicas requires transactional durable SQL (e.g. PostgreSQL)
  before using these wallets for material financial entitlements.
- Do not enable rewards until the official Google web OAuth Client and backend
  service origin are correct. The feature stays off otherwise.

## Tests and rollout

Run `python -m unittest services/weiguo/test_slime_rewards.py` from a
configured `PYTHONPATH=services/weiguo` environment, then the entire CI suite.
Exercise correct Google login, invalid email_verified, expired ticket, duplicate
Google account, reused node, cross-node claim, disabled rewards, depleted wallet,
exact usage, conservative usage, failure refunds, key rotation during in-flight
reservation, and the Telegram Owner configuration page.

**Source merging is not a live rollout**. After CI success, deploy WeiGuo and
Ceres with the same migrations and durable database; then create and publish a
new `slime-v*` desktop release. Never include Google OAuth client secrets,
node bearer tokens or API Keys in public frontend bundles.
