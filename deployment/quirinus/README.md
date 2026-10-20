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

## Autonomous Quirinus (GitHub Actions)

The isolated scanner runs automatically:
- On pull requests targeting main that change source, tests, deployment/quirinus,
  or the scanner workflow. A PR has read-only GitHub permissions. The scanner
  Docker image is built from the trusted base commit; the PR merge revision is
  read as untrusted data only, in a network-disabled, non-root container.
- On matching pushes to main (existing behavior).
- Daily at 01:19 UTC (09:19 Taiwan), including days with no source change.
  GitHub may delay or skip scheduled jobs; this is a best-effort schedule.
- By manual dispatch, including the owner-approved WeiGuo two-stage flow.
  Manual chat invocation still needs per-scan approval.

The successful main/scheduled scan launches a separate alert-owner job, which
has issue-write permission but never executes code from a PR head. Only the
same workflow run's aggregate JSON is downloaded. The deterministic validator
checks exact severity keys, integer counts, completeness flags, count equality,
and the report's no-evidence/no-path/no-backlog fields. The GitHub issue body
contains only counts and the workflow URL.

A single stable GitHub Issue is opened on High/Critical findings or a truncated
report; later changes update it only when the severity fingerprint changes.
Identical counts do not generate repetitive notifications. The workflow does
not automatically close tickets if later counts are zero: human review is
needed before declaring remediation. PR reports are available in Actions
summaries but never generate Issues or carry write authority.

These are static-rule hits, not confirmed exploits. No sensitive source,
finding locations, evidence, keys, or untrusted model prompts are public.
No unattended code modifications, patch generation, PR creation, auto-merge,
secret rotation, active web probing or Railway production deploy. Existing
Athena approval and maintainer controls continue to govern those actions.

Validate the normal workflow and autonomous redaction with
python3 -m unittest discover -s services/weiguo -p 'test_quirinus_autonomous.py'.

## Validation and limits

`python3 -m unittest discover -s services/weiguo -p 'test_quirinus_actions.py'`

Run the workflow and check the result. A passing job proves the pinned scanner
executed against the mounted checkout on the Actions runner. It does not attest
to any other deployment, automatically patch vulnerabilities or guarantee no
remaining weaknesses.

`python:3.12-slim-bookworm` and the pip dependency are version-qualified but
not digest/hash pinned. Before long-term production use, review supply-chain
updates and pin image digests and dependency hashes.
