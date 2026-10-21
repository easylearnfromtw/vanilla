# Slime Google signup credits and wallet metering

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
The initial setting is 100,000. Owner can inspect recipients, total issued,
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
