# Awesome Go → Vanilla / Detroit reference catalog

Source: https://github.com/avelino/awesome-go

## Scope

This change adds a **curated, offline, read-only Go technology selection catalog**, not Go runtime code or installed packages. Vanilla remains React/Vite/TypeScript with existing Python-backed services. The original Awesome Go catalog lists third-party work; each candidate's license and security posture must be verified from its original repository before adoption.

## User-facing paths

- Ask `Awesome Go 是什麼` or `推薦 Slime 的 Go 套件`: the existing `tool-knowledge` route produces a deterministic answer without fetching or executing external code.
- Ask `@Diana 評估 Ceres Go 通訊套件`: Diana returns a research-only technical selection report without creating capabilities, starting processes, or crossing a privacy boundary.
- Longer, complex Go technology comparisons are grounded through `toolKnowledgeGuidance` while keeping the existing model route.
- Source links are references only; entries are **not** proofs of installed binaries, compatible versions, working APIs, or deployed services.

## Curated mapping

| Detroit module | Research candidates | Adoption gate |
| --- | --- | --- |
| Diana / Detroit | mcp-go, Resty | Review MCP protocol and auth scopes, avoid replacing Detroit Capability Bus |
| Slime | Ollama, OllamaFarm, NATS | Confirm actual node-runtime requirements; load balancing is not tensor/model parallelism |
| Ceres | NATS, Resty | Verify event ordering, tenant isolation, Telegram/LINE rate limits, service overhead |
| LUCA | otellix | Review telemetry export paths; no silent trace uploads |
| Quirinus | Syft | SBOM alone is not a vulnerability scanner; use approved risk analysis |

All candidate descriptions are **selection hypotheses**. For entries that only link to the Awesome Go source, find and verify the upstream project before testing.

## Architecture and guardrails

- `src/detroit/awesome-go.ts`: curated metadata, deterministic module/keyword ranking, limited output, explicit reference-only status.
- `src/assistant/tool-knowledge.ts`: existing offline QA and contextual grounding.
- `src/detroit/diana.ts`: reference-only Diana report for technology research; operational install/deploy/change requests bypass it and retain existing guarded workflows.
- No third-party Go code, secrets, network requests, dependency installation, GitHub source execution, model invocation or background jobs are introduced by the selector.
- Before installation or production use: verify project URL, publisher/release and maintenance, exact license, vulnerabilities and transitive dependencies, test compatibility and performance, evaluate private-data handling, and require the usual Quirinus / human review.
- Curated entries are maintained manually; this is **not** automatic GitHub syncing and the ranking is a deterministic heuristic, not a measured benchmark.

## Tests

```bash
npm run test:awesome-go
npm run test:tool-knowledge
npm run test:diana
npm run build
```

The Awesome Go regression suite is wired into `.github/workflows/ci.yml`. CI passing does not prove production deployment or that a third-party technology is secure.

## Rollback

Revert the PR. This integration introduces no database schema migration, stored account records, Go module dependencies, or new external service to clean up.


## Functional audit upgrade (2026-10-24)

The old curated Go catalog was text-only. The new **Awesome Discovery → Go / Executable Next Step** flow now performs real on-demand public GitHub API calls for module-specific candidates, computes metadata-based maintenance/licensing gates using the existing Awesome Discovery reviewer, and exposes a visible action for turning a verified candidate into a scoped Self-Build code task.

1. Open Detroit → Awesome Discovery (or ask Diana to recommend a Go library). Choose Slime, Ceres, LUCA, Quirinus, Diana, or Detroit.
2. Click **查核實際 GitHub 候選**. Only then are public repository metadata requests made. No prompt history or tokens are sent.
3. Projects linking only to a list fragment are explicitly marked **unresolved**, not invented as installable libraries. Missing license / archived projects are **blocked**.
4. Only a license-identified, non-archived candidate may be transferred to Self-Build. The app sends a bounded task to the existing **code** mode. An authenticated review-only Worker is still required to make a real PR.
5. CI runs offline deterministic tests using injected mock audits. A passing CI does **not** certify any third-party project or deploy a Go runtime.

### What this still does NOT do

It does not load or execute Go packages, start a Go server, run a GitHub workflow on behalf of the user, change the actual Slime dispatcher, or train language-model weights. GitHub Pages cannot run Go server binaries. Real Go runtime integration needs an approved compute host, a safe adapter, telemetry and capability receipts, and an independently reviewed deployment. The Self-Build handoff is a **task**, not proof that a PR was created.

### Acceptance test

- On the production PWA, the Go audit button should produce cards with actual GitHub stars, last push date and detected license, or an explicit API/error/unresolved state.
- Try Slime: index-only OllamaFarm must show unresolved; Ollama can be audited against its actual GitHub repo.
- Try Quirinus: Syft should be audited; if GitHub rate limits or license metadata is unavailable, explain the blocker rather than fabricate approval.
- The **交給 Self-Build 建立實作 PR** button must send a real pending engineering task and switch to code mode, without directly merging or installing anything.
- In private mode, public API calls and external code-workspace handoff must be blocked.

Run `npm run test:awesome-go`, `npm run test:chat-router`, `npm run test:diana`, and `npm run build`.
