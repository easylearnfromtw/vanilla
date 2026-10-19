# Vanilla AI — Instructions for Claude Code / Claude

## Project identity
Vanilla is a Taiwan-oriented, privacy-conscious, mobile-first family AI PWA.
- GitHub repository: https://github.com/easylearnfromtw/vanilla
- Snapshot: `e6c4b77055211cd235331c04af3cd5ccc8d94625` (main; 2026-10-19)
- Stack: React 18, Vite 6, TypeScript, PWA; client storage (IndexedDB), Google Drive integration with user-granted OAuth; WebLLM local inference, optional Ollama / Gemini / DeepSeek.
- Hosting: GitHub Pages, under base path `/vanilla/`.
- This ZIP contains full tracked source code, tests, architecture docs and workflows, **not** dependencies, generated dist or user data.

## First steps
1. Read `README_FOR_CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/CAPABILITY_STATUS.md`, `docs/CREAM_LONGITUDINAL_PROJECT_HUB.md`, `docs/TAIDE_TAIWAN_ROUTING.md`, and the relevant files in `src`.
2. Determine what is **actually implemented**; do not assume plans in docs are working features.
3. Make changes incrementally. Before editing, identify call sites, persisted data formats, authorization boundaries and current tests.
4. Run checks where the environment permits: `npm install --no-audit --no-fund`, `npm run build`, and relevant `npm run test:*`. Node 22 is used in GitHub Actions.
5. Show meaningful code diffs and test evidence. Never claim external Drive, model or browser features were tested unless they really were.

## Architecture entry points
- `src/App.tsx`, `src/local-ai/LocalChat.tsx`: application shell (drawer, glass top bar, phone TabBar, lazy sections) and chat orchestration.
- `src/assistant/chat-router.ts`: pure, tested tool routing + slash commands. Add new chat tools here first, with tests in `tests/chat-router.test.mjs`.
- `src/ai/model-profiles.ts`, `src/ai/generation-config.ts`, `src/ai/context-budget.ts`, `src/ai/prompts.ts`: per-model tuning (see `docs/MODEL_TUNING.md`). Use `purpose:"structured"` for JSON/code generation.
- `src/local-ai/chat-session.ts`, `src/library/conversation-archive.ts`: new chat archives the current conversation; never delete history directly.
- `src/theme/vanilla-bauhaus.css`: design system (see `docs/UI_BAUHAUS_GLASS.md`). Glass only for navigation/controls; content stays opaque paper.
- `src/ai/model-orchestrator.ts`, `src/ai/taiwan-routing.ts`, `src/ai/ollama.ts`: model routing and TAIDE preference.
- `src/library/attachment-vault.ts`, `src/library/ConversationLibrary.tsx`, `src/local-ai/saved-file-resolver.ts`: local chat attachments and delete/read workflows.
- `src/memory/drive-memory.ts`, `src/workspace/cloud-drive.ts`, `src/workspace/CloudFiles.tsx`: Google Drive memory, file management and UI.
- `src/cream/`: in-chat data analysis, history, longitudinal trends.
- `src/projects/`: PROJECT HUB, source indexing and user-owned project connections.
- `src/noodles/`, `training/`: preference learning, opted-in training-data and separate real trainer; do not claim training occurred just because data was exported.
- `src/builder/`, `services/self-build-github-worker/`: guarded self-build proposals and authorized GitHub changes.
- `src/security/trust-boundary.ts`: prompt injection and untrusted content boundaries.
- `.github/workflows/ci.yml`, `.github/workflows/pages.yml`: PR and deploy gates.

## Do-not-break constraints
- Do not expose private API tokens in frontend code or the public GitHub repository. Do not put Google client secrets, GitHub PATs, private keys or Drive OAuth access tokens into this ZIP or commits.
- Multi-person family data and roles must remain isolated. Private mode must not silently access Google Drive, paid cloud providers or external model hosts.
- File delete operations must use immutable IDs, verify persisted/remote state and distinguish real deletion from stale-index cleanup. A missing file / HTTP 404 is **not** proof of deletion.
- For Drive, preserve explicit permissions, original-source checks, failure transparency and no accidental destruction of unrelated files.
- Don't run arbitrary user-supplied code or silently execute copied GitHub source; avoid model-driven unreviewed production merges.
- TAIDE is a **priority for Taiwan local/law/history**, not a magically preinstalled model. The official model must actually be hosted and available; ensure foreign-law questions and private mode are handled appropriately.
- Model output is not evidence of current law or reliable history. Taiwan legal answers should check official sources with dates and uncertainty.
- User preference: don't add Raspberry Pi as a required/default system component.
- Family-use decision (2026-10-19): no extra encryption layer is required for Drive memory/chat sync; keep the existing plaintext warnings honest.
- Avoid layout regressions for iPhone Safari and installed PWA (inputs ≥16px, safe areas, keyboard via visualViewport). Respect existing navigation and conversational CREAM output rather than replacing it with a separate dashboard.

## Suggested priorities (only implement tasks actually requested by user)
1. Robust file reading, real deletion and account-safe resynchronization across IndexedDB and Drive.
2. Thorough automated tests for auth failures, indexed records and UI state after changes.
3. CREAM conversational outputs, charts, reliable longitudinal provenance, meaningful statistical reasoning.
4. TAIDE local-topic model preference, visibility of actual selected model and safe fallback.
5. Performance, accessibility and responsive user experience.

## Change delivery
- Explain what you changed, affected files, how to test it, any known limitations, and rollback approach.
- Prefer changes on a feature branch / PR, not overwriting production or mixing unrelated fixes.
- Never invent successful deployments or live integration tests.
