# Detroit Native Capability Bus (2026-10-20)

## Product contract

All modules installed for Vanilla AI are **owned by Detroit**, not independent chat commands. Merlin identifies the intent, Diana selects the capability, Zeus coordinates execution, Athena enforces authorization/trust boundaries, and Venus presents verifiable results. Tool invocation is ordinarily automatic; `@Tool` and slash commands are optional overrides. An adapter listing, API registry entry, or open-studio event **is not** proof of tool execution.

## Authoritative inventory

`src/detroit/capability-bus.ts` combines `DETROIT_ENGINES`, `DETROIT_FACTORY_TOOLS`, `ORCHESTRA_TOOLS` and JENSEN HUANG. Victoria is registered from the active Detroit core. Every descriptor has `owner:"detroit"`, `state`, `requiresNetwork`, and `requiresApproval`. Each tool executes only after a concrete process-local executor has been registered. `detroitAvailability()` differentiates `runnable`, `not-connected` and `planned`.

This migration does **not** claim that all optional backends are deployed. Active local AI roles (Merlin, Erya, Venus etc.) are existing chat/model operations, not separate network models. Their ownership is registered; only callable deterministic actions have new bus adapters.

## Implemented native executors (browser)

| Capability | Operation | Boundaries |
| --- | --- | --- |
| Scouts | Live search via configured HTTPS backend and supported public sources | Private mode blocks network; search hits are not claims of verified full-page reads; failed fetches remain visible |
| CREAM | Local CSV parse and deterministic statistical analysis | Input size/rows constrained by existing CREAM code; no arbitrary evaluation |
| Retina | Local PDF, DOCX, PPTX artifact export | Triggered only after explicit output intent; the file is actually built before completion is reported |
| Janus | Local HTML email template | Actual HTML file; **no sending**, no hosted-editor activation, no recipient access |
| LUNA | Offline template-based PNG poster plus optional locally editable draft | Does not claim neural image generation; private mode never saves into normal workspace |
| Victoria | Bounded same-account retrieval from local normal-mode archived chats | Off until account-specific opt-in; private chat never read; external model transmission requires separate opt-in |

Additional gated executors now exist for Bard, Medusa, Quirinus, LUCA and Ceres. These are **not** evidence that the user's server is deployed, signed in or authorized. Bard requires an actual configured Gemini image API and per-generation expense consent; Medusa requires an enabled, connected, owner-only sandbox and per-run code transfer consent; Quirinus uses the owner-only fixed-scope prepare/one-time approval-token flow and reports only dispatch acceptance until its workflow finishes; LUCA retrieves owner-only backend diagnostics; Ceres reads authorized external message events as untrusted data and never auto-replies or executes message instructions. Other optional integrations (GridCraft, Moli, native Craft backends, etc.) remain unavailable without separate verified runtime integration.

## Chat execution

- Native Scouts search is invoked through the same Detroit bus used by the deterministic tools, and its real sources reach model context.
- Affirmative requests to **make and output** a PDF/DOCX/PPTX or email newsletter draft can compose with the selected model, then call Retina/Janus in the same turn, and return a success/error receipt. If the model is missing, no invented artifact is emitted.
- Affirmative poster requests use LUNA's existing offline renderer and offer a PNG download; in normal mode the editable project is saved to the current local account if capacity allows.
- Public research for a requested document can gather Scouts evidence before drafting. Private mode, no-web instructions, uploaded sensitive data and quoted instructions still stop automatic web research.
- Deterministic tools never execute model-produced JavaScript, arbitrary URLs, external services, authentication changes, mail sends or code writes.
- A chat action selects and calls the matching executor directly; opening tool-specific studios is not a completion strategy. Users only need the conversation plus account/data settings. Specialist workspaces remain internal and can be explicitly opened for troubleshooting or advanced editing, not exposed as default tool navigation.
- Optional remote connectors execute only after the required backend identity, privilege, privacy and approval checks. A registered executor is not a guaranteed working external service.
- For code modifications, unsupported cloud integrations or unavailable tool backends, Merlin/Diana preserve the original question and state exactly which work could or could not be completed rather than claiming a deployment.

## Next integration phase

Complete health-verified integration of remaining optional adapters (e.g. GridCraft sheets and Moli reader) with concrete authenticated `DetroitExecutor` implementations and backend health checks; gate high-impact actions by existing Athena policies and explicit approval. Do not register one as runnable merely on the basis of a server URL or an environment variable.

## Verification

```sh
npm run build
node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/detroit-capability-bus.test.mjs
npm run test:detroit-conversation
npm run test:victoria
npm run test:diana
npm run test:retina
npm run test:luna
```
