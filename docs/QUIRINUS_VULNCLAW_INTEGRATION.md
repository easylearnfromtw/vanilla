# Quirinus — optional Detroit Factory security tool

**Status: adapter code integrated, OFF by default; VulnClaw is NOT installed or activated.**

Upstream: https://github.com/Netw0rkNoob/VulnClaw (MIT, version 0.4.1 as inspected 2026-10-20).
Quirinus is a separate **tool**, not another language model and not a replacement for Athena.

## Division of responsibility

- **Detroit / Zeus:** may request a Quirinus review, but discovery metadata does not dispatch work.
- **Athena:** checks permission, suspicious inputs, scope and security policy. Athena cannot be bypassed by Quirinus.
- **Quirinus:** optional operator-only static source audit using VulnClaw `code scan` L1/L2 without L3, networking or arbitrary shell.
- **JENSEN HUANG:** proposes patches based on human-reviewed reports; no automatic production edits.
- **Medusa:** future isolated regression reproduction for approved test cases, NOT automatically connected.
- **CREAM:** future deduplication and trend analysis of normalized findings.
- **LUCA:** future audit trail and run metadata when a trusted dispatcher exists.

## Implemented

- Registered under `src/detroit/factory.ts` and `src/weiguo/registry.ts`, visible in the existing 衞國 tools catalog with `enabled=false`.
- `services/weiguo/quirinus_adapter.py` creates **operator-only** routes:
  - `GET /v1/operator/quirinus/status` — reports enabled status without secrets.
  - `POST /v1/operator/quirinus/scan` — accepts **no user path, URL, command, model or scan parameters**. Scans only `/scan-src` mounted by the operator.
- Existing `WEIGUO_ADMIN_TOKEN` bearer and `WEIGUO_PUBLIC_FAMILY_ONLY=true` protections apply. PWA and family accounts have no scan execution access.
- Fixed argv: `/usr/local/bin/vulnclaw code scan /scan-src --layer L1,L2 --format json --no-progress`. L1/L2 are offline static rules; exit code 1 indicates high/critical findings and is handled as a completed scan, not a tool failure.
- Bounded runtime (35 seconds), a single concurrent scan per worker, 3,000-file / 128 MiB source preflight, incrementally enforced 512 KiB stdout cap (kills the process if exceeded), 80 returned finding previews, and strict status parsing. Raw source/evidence/stdout/stderr are **never returned** by the API. Symlink-containing trees and parent-directory paths in scanner findings fail closed or are redacted.
- No active website reconnaissance, exploits, credential use, L3 cloud source uploads, plugin installation, or dynamic agent commands.

## IMPORTANT: separate isolated deployment required

**DO NOT** run unreviewed VulnClaw with access to the regular browser server's credentials, home directory, app files, mounted volumes or Docker socket. The adapter and its environment flags do *not* create OS isolation.

1. Create a **separate private, operator-only** service/container. Use the existing Weiguo app only as its API surface, with a distinct admin token and without production Google/Drive secrets or open public ingress. Public-family deployments must keep `WEIGUO_PUBLIC_FAMILY_ONLY=true`.
2. Review and pin the upstream dependency, e.g. `pip install vulnclaw==0.4.1` into a custom, trusted image. Verify that the executable is exactly `/usr/local/bin/vulnclaw`. Do not install a floating version or execute a repo install script at request time.
3. Mount an **exported, secret-reviewed** repository snapshot *read-only* at `/scan-src`. Exclude `.env`, service account credentials, `.git`, personal uploads, node_modules, live host paths and symlinks. Do not mount the host repository or Docker socket directly. The scan process should be non-root.
4. Enforce **real network egress deny** using container/orchestrator network policy, including loopback, private/metadata services, DNS and proxy paths; enforce CPU/memory/process/file/disk caps, read-only filesystem and no-new-privileges. The flags below are attestations, **not enforcement**.
5. Only after verifying the above in the isolated environment, set:
   ```dotenv
   QUIRINUS_ENABLED=true
   QUIRINUS_ISOLATED=true
   QUIRINUS_SOURCE_READONLY=true
   ```
   Leave them unset/false in standard Vanilla deployment; the ordinary WeiGuo image deliberately **does not bundle VulnClaw**.
6. From your trusted private operator environment, call `POST /v1/operator/quirinus/scan` with `Authorization: Bearer <WEIGUO_ADMIN_TOKEN>` and **no request body**.
7. Review severity, rule, file, line and remediation. No findings does not equal proof of safety; rule-based scanners have both false positives and false negatives.

## Planned, not implemented

- A trusted, authenticated Detroit dispatcher that requires explicit task-specific approval before invoking Quirinus.
- Optional SARIF export and comparisons in CREAM, LUCA audit logs, GitHub PR annotations.
- A separate authorized-target active assessment service after user scoping, target ownership verification, firewall rules, rate limits and consent. None of `run`, `exploit`, `persistent`, `shell_command`, `python_execute` is accessible here.
- Frontend run button: intentionally absent, because operator credentials must never be exposed in the public PWA.

## Tests

```bash
npm run test:detroit-factory
python3 -m unittest discover -s services/weiguo -p 'test_*.py'
```

Upstream MIT copyright and license obligations apply if distributing any portion of upstream software. This integration contains a thin original adapter only; it does not vendor upstream code.

## Detroit-approved Quirinus workflow (second-stage integration)

**Status: implemented in code, disabled by default; not a deployed/connected scanner.**
An operator-only workflow coordinates `Athena -> Quirinus -> CREAM -> JENSEN HUANG` without adding a new local LLM or granting the PWA any admin access.

- `POST /v1/operator/detroit/quirinus/prepare` checks that Quirinus is deployed and returns a source-content SHA-256 plus an in-memory one-time approval token (expires in 120 seconds). The operator must inspect the source scope and explicitly approve the request; tokens are never included in source code or frontend state.
- `POST /v1/operator/detroit/quirinus/execute` accepts `{"approval_token":"<one-time-token>","approved":true}`. It consumes the token before rechecking the approved bytes and running the existing fixed L1/L2 Quirinus scanner. Expired/replayed tokens or modified source snapshots are rejected.
- These routes inherit the WeiGuo `WEIGUO_ADMIN_TOKEN` operator dependency and `WEIGUO_PUBLIC_FAMILY_ONLY` 404 filtering, plus no-store response headers. Keep them private and single-worker; ephemeral approvals do not survive restart or work across multiple workers.
- **CREAM** deterministically validates totals and severities, computes a small non-clinical priority score, and emits a bounded summary.
- **JENSEN HUANG** receives a deduplicated, data-only remediation backlog with predefined generic fixes; no raw evidence, source lines, LLM prompt, shell command or autonomous patching is allowed. `autoPatch=false`, `autoMerge=false`, `llmInvoked=false`. The next trusted human-reviewed development workflow is a separate action.
- **LUCA** can record static operation names and status codes if its existing privacy-first telemetry is enabled; approval tokens and findings are never sent to LUCA.

Activation requires an already isolated trusted Quirinus operator environment **plus** server-only `DETROIT_QUIRINUS_DISPATCH_ENABLED=true`. This is not a frontend feature switch and does not provision VulnClaw. No internet penetration-testing commands, model code uploads, access to personal files, or unrestricted background monitoring.

Tests: `python -m unittest discover -s services/weiguo -p 'test_detroit_quirinus_dispatcher.py'`.
