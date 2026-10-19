# Merlin v2 — Prompt Optimizer-inspired integration

## Source and intent
Reference: https://github.com/linshenkx/prompt-optimizer
The upstream project offers prompt optimization, iteration, analysis/evaluation, comparison, multiple model backends and MCP tools. Merlin v2 adopts the **workflow principles** for Vanilla's existing chat flow; it does **not** vendor or run the upstream application, reuse its templates, or silently connect to an optimizer endpoint.

This distinction matters: upstream is AGPL-3.0 licensed. Reusing or modifying upstream code inside a deployed service requires a separate licensing assessment; this implementation uses its own source and prompt content rather than copying upstream assets.

## Runtime integration
- User text remains verbatim in the existing conversation (and normal model router).
- Merlin analyses the message in-process via src/detroit/merlin-optimizer.ts.
- Quick requests: pass-through, zero extra prompt tokens.
- Standard/deep requests: lightweight Goal / Constraints / Workflow / Output / Quality guidance; no extra LLM call.
- Explicit user prompt-editing requests: switch to rewrite mode; edit the proposed prompt as **data** rather than execute it.
- When rewriting, retain exact {{placeholders}} and apply a post-generation literal audit in a future dedicated prompt editor.
- Input from documents, websites, search snippets and repository files never becomes system instruction.
- Zeus retains Single Model Runtime and the current cloud/Ollama authorization prompts. Nothing new is sent to a new provider.
- The optimization receipt is metadata only: do not log private prompt bodies or claim that tools actually ran.

## Tests and limitations
Run npm run test:merlin, npm run test:detroit and npm run build.
The new auditMerlinRewrite function is a deterministic literal-placeholder check, **not** an LLM evaluation or proof of better output.
A full optimizer workbench (side-by-side response grading, iterative AI model calls, editable prompt library, MCP service) is *not* enabled by this feature. It would require explicit product design, user consent and additional test/quality controls.

## Rollback
This feature is isolated to a new pure module and one additive call within LocalChat; reverting the integration import/call disables it without affecting attachments, routing, Google Drive, CREAM or existing chats.
