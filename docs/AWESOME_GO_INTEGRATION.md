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
