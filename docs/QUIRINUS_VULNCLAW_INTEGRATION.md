# Quirinus — optional Detroit Factory source-security tool

**Status:** Quirinus metadata and the private operator CodeScan adapter are integrated into Vanilla. **Disabled by default; no VulnClaw binary or scanner worker is installed by this PR.** This is not an always-on security monitor and does not make Vanilla safe by itself.

Upstream: [Netw0rkNoob/VulnClaw](https://github.com/Netw0rkNoob/VulnClaw), MIT License (copyright UncleC, 2026). The command contract was reviewed against the v0.4.1 upstream `vulnclaw/cli/code.py` source. No upstream code was copied into this repository.

## Responsibility and routing

- **Detroit / Zeus** discovers the Quirinus tool and can propose its use in future dispatchers, but metadata alone never starts it.
- **Athena** authorizes operators, reviews scope and guards prompt injection.
- **Quirinus** runs deterministic **L1 regex + L2 structural static source scanning** only.
- **JENSEN HUANG** may use sanitized findings for a future human-reviewed fix proposal. **CREAM** can summarize validated results.
- **Medusa** stays an independently isolated code-execution adapter; Quirinus does not submit PoCs to Medusa automatically.
- **衞國** exposes an operator-only endpoint; the family PWA only shows a discoverable disabled catalog entry, not a scanner button with elevated permissions.

## Private API

`POST /v1/operator/quirinus/scan`, with `Authorization: Bearer <WEIGUO_ADMIN_TOKEN>`. **No request body or target/path input is accepted.** The API is hidden on deployments where `WEIGUO_PUBLIC_FAMILY_ONLY=true` by the existing operator boundary. Only deploy this endpoint on a private, operator-restricted backend.

The adapter launches exactly:

```bash
/opt/quirinus/bin/vulnclaw code scan /workspace/vanilla --layer L1,L2 --format json --no-progress
```

- Preflight rejects symlink-containing trees, more than 3,000 files and more than 128 MiB of source content; a real filesystem sandbox remains mandatory.\n- Fixed local source root: `/workspace/vanilla`; no user-controlled path, remote URL, shell or command flags.
- Fixed binary: `/opt/quirinus/bin/vulnclaw`; do not substitute arbitrary user executables.
- L3/LLM, `run`, `solve`, `persistent`, `recon`, `scan` (network), `exploit`, interactive shell, browser, payload generation and remote network targets are **out of scope**.
- Bounded scan: serialized requests per service process, 35 s subprocess timeout, 512 KiB report cap, 100 returned findings (with total and truncation flag). Exit 1 indicates Critical/High scanner findings and is parsed as a completed scan, **not a clean bill of health**. Other exit codes fail closed.
- Response excludes source snippets, raw `evidence`, subprocess `stderr`, credentials, and arbitrary host paths. Output contains severity, rule, relative location, CWE and general remediation. False positives are possible; a clean scan does not prove security.
- Quirinus is stateless in this adapter; reports are not persisted. No confidential source is submitted to an LLM by this code path.

## Operator deployment requirements

Keep Quirinus **OFF** until ALL controls are independently verified:

1. Review/pin a trusted VulnClaw v0.4.1 dependency build and install it in an isolated operator scanner runtime so the executable is at `/opt/quirinus/bin/vulnclaw`. A dedicated venv is suitable; the normal WeiGuo image does not install it.
2. Mount an **approved source-only repository checkout** read-only at `/workspace/vanilla`. No host directories, secrets, `.env`, home folders, private keys, user documents or Google/Drive credentials may be mounted. Use a separately scrubbed source tree if necessary.
3. Use a real *deny-all outbound network policy* at container/VM level (including loopback/private networks, DNS, host gateway, metadata services). Application flags do **not** enforce this. Execute with a nonroot identity; do not mount Docker sockets or give elevated container privileges. Give the runner strict CPU, memory, PID, file and disk limits.
4. Run Quirinus only on a **private operator backend**. Never expose the admin token in PWA, frontend storage, GitHub Pages, or public family endpoint. Use `WEIGUO_PUBLIC_FAMILY_ONLY=true` on any public family service.
5. After actually verifying the above, set these **server-only** attestations:

```dotenv
QUIRINUS_ENABLED=true
QUIRINUS_EGRESS_BLOCKED=true
QUIRINUS_SOURCE_READONLY=true
```

The three booleans only confirm operator review. **They are not a firewall, read-only mount, or sandbox.** A trustworthy external runner with a narrow authenticated adapter is recommended before production enablement.

## Testing

```bash
npm run test:detroit-factory
python3 -m unittest discover -s services/weiguo -p 'test_*.py'
```

Tests use a fake subprocess; they do not install VulnClaw, scan a target, or claim end-to-end production readiness. CI must finish before merge. Review upstream MIT license notice when redistributing upstream binaries/code.
