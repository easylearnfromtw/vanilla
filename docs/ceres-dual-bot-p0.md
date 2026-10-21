# Ceres Dual Bot P0 — Implementation Contract

Status: design baseline; not deployed.

## Two Telegram identities
- **Admin Bot**: existing @SignWell_bot, private owner console for Vanilla, Detroit, Diana and Slime. Owner Telegram user IDs must be configured server-side; default deny.
- **Store Bot**: separately registered public Telegram bot for model catalog, plans, purchase, API keys, usage, invoices and customer support. Its username/token are not yet provisioned.
- Distinct bot tokens, webhook secrets, routes, roles, command handlers and audit scopes. Never authorize admin operations based on client-supplied role fields.

## Core service boundaries
1. Telegram adapters: verify webhook secret and deduplicate update_id; route to owner/customer command handlers.
2. Identity and RBAC: Telegram ID to customer account; verified email linkage when needed; owner allowlist isolated from customer roles.
3. Model catalog: versioned available models from approved Slime/cloud routing inventory; admin review before selling.
4. API Gateway: OpenAI-compatible endpoint, hashed API key lookup, per-key model allowlist, revocation, expiration, RPM/TPM and concurrency limits.
5. Usage ledger: server-side measured input/output tokens, idempotent debits, immutable adjustment events; transactional quota reservation and reconciliation.
6. Commerce: price plans, orders, payment-provider verification, refund/reversal, entitlement grants; payment webhook signature verification and idempotency.
7. Audit and operations: privileged commands require explicit confirmation; structured logs with redaction and alerts.

## Security invariants
- Never embed bot tokens, payment secrets or API key plaintext in git, frontend or Telegram chat history.
- Generate customer API keys using cryptographic randomness; show secret once via protected web flow, persist only hash/prefix.
- Store Bot cannot invoke owner/Detroit privileged tools; enforce on backend, not just Telegram UI.
- Rate limit, prevent replay and use database transactions for payment and quota updates.
- Start with a sandbox payment provider and mock inference; no live charges until reviewed.
- Follow Telegram rules for digital goods and the selected payment channel.
- Do not copy code from archived shopbot or other repositories without license review.

## Acceptance tests
- Public customer cannot access admin actions, including forged callback payloads.
- Unauthorized Telegram ID cannot invoke owner commands.
- Duplicate payment events cannot grant duplicate quota.
- Concurrent requests cannot overspend token balance.
- Key rotation invalidates old key and audit log contains no secret.
- Model update does not silently break pinned customer API model versions.
- Store Bot outage does not block Admin Bot and vice versa.

## Delivery sequence
P0a: inventory current Ceres routes, authentication, schema and API Gateway.
P0b: add dual bot adapters and RBAC with tests.
P0c: add key issuance, quota ledger and compatible inference proxy with tests.
P1: sandbox store orders, payment and provisioning.
P2: Telegram Mini App, analytics, support and automatic catalog updates.

## Configuration placeholders
CERES_ADMIN_BOT_TOKEN, CERES_ADMIN_WEBHOOK_SECRET,
CERES_STORE_BOT_TOKEN, CERES_STORE_WEBHOOK_SECRET,
CERES_OWNER_TELEGRAM_IDS, CERES_PUBLIC_BASE_URL.
Do not fill these with sample production credentials.
