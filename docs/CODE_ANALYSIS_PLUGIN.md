# Code Analysis Plugin — integration plan

Goal: analyze codebases on demand from within Vanilla AI, retain findings across sessions, and compare later revisions. The analyzer should be a Detroit tool invoked by Diana, not a replacement for the chat UI.

## First code artifact
`src/lib/codeAnalysisHistory.ts` defines typed findings, revision snapshots, trend comparison (new/persistent/resolved), and a volatile in-memory history store. **It is not wired to the app and does not persist across reloads.**

## Planned tool contract
- `analyze_code({repository, revision, paths?, focus?, baselineId?})`
- Input via user-authorized GitHub repository or uploaded source archive.
- Output: findings with `path:line`, severity, evidence, suggested fix, and snapshot ID.
- Analysis engines: static lint/typecheck first; model-based reasoning second. Findings must be grounded in actual code.
- Save snapshots to a durable, access-controlled store keyed by user, repository and revision. Avoid localStorage for sensitive source code.
- On follow-up, load previous snapshots and show regressions, persistent issues, and resolved issues.
- Never imply continuous monitoring without a configured schedule/webhook.
- Never modify code or open PRs without an explicit user action.

## Apple-inspired visual language
Apply Apple HIG-informed spacing, semantic typography, responsive split-view, restrained translucent surfaces, keyboard access, dark mode, reduced motion and accessible contrast. Do not copy Apple trademarks or claim Apple affiliation. The referenced apple-design-skill is a design review reference, **not a visual component library**.

## Required before release
1. Inspect existing Detroit/Diana registry and attach the tool adapter.
2. Implement authenticated durable history and retention controls.
3. Add real repository traversal with file limits, secret redaction and injection defenses.
4. Build a results panel with file/line navigation and historical trend views.
5. Add automated tests, run project build, security review and deploy only after verification.
