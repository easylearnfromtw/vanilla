# Quirinus offline deployment: GitHub Actions

This is the **deployable source-auditing runtime** for Vanilla Quirinus. It
does not publish an HTTP service or need any API/Google/Drive/admin tokens.

- A GitHub push to `main` touching source/tests/services (or the workflow)
  triggers `Quirinus Offline Source Scan`. Authorized maintainers can also
  launch it via **Actions → Quirinus Offline Source Scan → Run workflow**.
- A pinned `vulnclaw==0.4.1` CLI is installed into a scanner Docker image.
  The image builds online, but the actual **runtime container** uses
  `--network none`, `--read-only`, `--cap-drop ALL`,
  `--security-opt no-new-privileges`, unprivileged UID 10001, cgroup
  memory/CPU/PID limits and a 64 MiB ephemeral tmpfs.
- Only repository `src/`, `services/`, `tests/` are mounted read-only.
  No entire checkout, Docker socket, `.git/`, private files, or credentials.
  The scanner can write only sanitized aggregate JSON/Markdown to an ephemeral
  output mount; reports contain counts, **not vulnerable file locations, raw
  evidence, code, keys, payloads, or JENSEN remediation tasks**.
- Uses existing `quirinus_adapter.py` for L1/L2 fixed argv, source preflight,
  35-second wall clock, output bounds and source-content validation; then uses
  `detroit_quirinus_dispatcher.py` for deterministic CREAM aggregation.
- Findings do not fail the job: VulnClaw exit 1 denotes high/critical
  findings and is treated as an *informational* completed scan. Scanner
  infrastructure failures fail the workflow.
- Public GitHub Actions reports are visible to readers of the public repo.
  This is **why only aggregate counts are published**. The detailed
  JENSEN remediation backlog remains restricted to the operator-only private
  Detroit API and is not uploaded to GitHub artifacts.
- GitHub Actions is ephemeral, so this runner is not an always-on private
  operator API or a PWA button. It also does not unblock Quirinus on Railway.

## Validation and limits

`python3 -m unittest discover -s services/weiguo -p 'test_quirinus_actions.py'`

Run the workflow and check the result. A passing job proves the pinned scanner
executed against the mounted checkout on the Actions runner. It does not attest
to any other deployment, automatically patch vulnerabilities or guarantee no
remaining weaknesses.

`python:3.12-slim-bookworm` and the pip dependency are version-qualified but
not digest/hash pinned. Before long-term production use, review supply-chain
updates and pin image digests and dependency hashes.
