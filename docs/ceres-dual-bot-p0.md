# Ceres Dual Bot P0 — Implementation Contract

Status: design baseline; not deployed.

## Two Telegram identities
- **Admin Bot**: existing @SignWell_bot, private owner console for Vanilla, Detroit, Diana and Slime. Owner Telegram user IDs must be configured server-side; default deny.
- **Store Bot**: @VanillaAPIStore_bot, separately registered public Telegram bot for model catalog, plans, purchase, API keys, usage, invoices and customer support. Its username/token are not yet provisioned.
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

## P1 — Commercial store and customer provisioning (approved scope)
- Store Bot model catalog, plan selection, cart/checkout, order history, renewals, cancellations and customer support.
- Telegram Stars-compliant digital-goods purchase path where applicable; verify successful payment updates server-side, record Telegram payment charge IDs and prevent replay.
- Sandbox/test-mode first; never activate live charges without provider setup and explicit operational review.
- Transactional order state machine: draft -> pending_payment -> paid -> provisioned; failed/refunded/reversed states; idempotent provisioning and quota reversal.
- Create API entitlements and customer-scoped keys only after verified payment; protected one-time key reveal and rotation.
- Admin Bot revenue, orders, refund review, pricing, gross margin, customer suspension and support handoff.
- Tests: duplicate payment, out-of-order webhook, failed provisioning retry, refund after consumption, concurrent purchases and revoked user.

## P2 — Mini Apps, intelligence and operations (approved scope)
- Separate iOS-inspired white/black Telegram Mini Apps: owner operations hub and customer developer/store portal; keyboard navigation and mobile accessibility.
- Customer portal: API key inventory (never show stored secret), token ledger, usage charts, invoices, project-specific caps, subscription management, model/API documentation and test requests.
- Owner portal: customer segmentation, revenue/cost dashboards, key abuse detection, model publishing workflow, Slime fleet status and alert review.
- Agentic customer support constrained to customer entitlements; escalate to owner with sanitized context; no privileged tool access.
- Scheduled notices for quota thresholds, expirations, renewals, failed payments, outages and model deprecations with notification preferences.
- Catalog synchronization from versioned Detroit/Slime/cloud model inventory with human approval gates for pricing and breaking changes.
- Optional dynamic pricing recommendations based on measured inference cost and utilization; do not auto-change live prices without approval.
- Tests: Mini App initData verification and replay limits, cross-account access, privacy/redaction, webhook-to-portal consistency, accessibility and graceful fallback to chat menus.

## Release gates
- P0/P1/P2 are all **in scope**, but inclusion in this plan does not mean implemented, merged or deployed.
- Release P1 only after P0 isolation, ledger and billing tests pass; release P2 only after P1 payment and entitlement reconciliation passes.
- Store Bot username is confirmed as @VanillaAPIStore_bot. User reports the new bot token was added to the deployment environment, but runtime secret availability, webhook connectivity, payment credentials and live payment configuration have not been verified.
