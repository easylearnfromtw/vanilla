# Vanilla 1.0 — Detroit Core release gate

This P0 gate is an executable **release blocker**, not proof of operational
reliability across all devices.

## Run

```bash
npm install
node scripts/core-release-gate.mjs
```

The command runs essential existing suites in order: local chat, WebLLM
disposed-engine recovery and system-message validation, provider streaming,
file lifecycle, Drive deletion verification, chat routing, Athena security,
Detroit/Diana orchestration, release readiness, PWA updates, and TypeScript
production build. Any failure stops the gate with a nonzero exit code.

A JSON report is written to `artifacts/core-release-gate.json`, or to
`VANILLA_CORE_GATE_REPORT` when set. An unexecuted suite is never marked as
passed. Never upload reports with user content or secrets.

## Acceptance and limits

A PASS verifies automated regression and build only. It does **not** verify:
real iPhone GPU and Safari lifecycle behavior; a real logged-in Drive account;
network outages; persistent background workers; end-to-end external-model
credentials; or that every proposed Detroit plugin is deployed.

Before publishing, additionally smoke-test Safari/PWA, real file upload/read/
delete, model handoff, and background-job persistence. Mark each deployment
as `candidate` until those checks pass.
