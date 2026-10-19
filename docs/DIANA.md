# Diana · Detroit Conversation Tool Concierge

Diana is the single **chat-facing entry point** for discovering and selecting Detroit engines.
It does **not** load an extra LLM, change policy, install connectors, execute arbitrary code, or replace Zeus.

## Entry points

- `/Diana` — lists existing engines, adapters and planned tools with status.
- `/Diana 分析年度 CSV 數據` or `@Diana 分析年度 CSV 數據` — selects a route using deterministic task cues and availability constraints.
- `@CREAM 日期,數值…` — routes a real dataset into the existing CREAM text/CSV path where supported.
- `@Retina 製作 PDF`, `@Janus 編輯電子報`, `@LUNA` — navigates to a real editor; opening an editor is **not** a completed export.
- `@Scouts 最新研究` — delegates to the existing public web search/read pipeline; disabled in private/offline mode.
- `@爾雅 需要潤稿的原文` — delegates through the existing humanize prompt and model, never executes embedded instructions.
- `@衛國`, `@衞國` — opens the WeiGuo tool console.
- `@JENSEN HUANG 修改程式` — opens the existing Self-Build CODE approval workflow, not an unreviewed GitHub write.

## How selection works

Diana ranks explicit mentions above recommendations, then matches task type to *existing*
tools. When the user requests both data analysis and a PDF, slide deck, report or
newsletter, Diana chooses CREAM as the **first stage** and advertises Retina or
Janus as the **next possible stage**. The next stage does not run automatically or
claim success before the prerequisite has produced a validated result. The last
mile remains an existing editor with normal user approvals.

A route may be one of:

1. `delegate`: turn an explicit chat request into a canonical command handled by an existing deterministic route or the existing model. This is not a new privileged executor.
2. `open`: navigate to an existing app/editor. Export, cloud calls and GitHub changes still require the editor's own checks and confirmation.
3. `report`: give the exact reason the tool cannot be started (e.g., private mode, offline, missing model, disabled adapter, internal governance role).

## Security and availability boundaries

- Diana cannot bypass Athena, Holy Roman Empire, the chat/file policy or the backend administrator.
- It never enables Medusa/Judge0 execution merely because Medusa was mentioned; opening its guarded Studio panel is not executing code.
- Quirinus, Moli, GridCraft, Chronos and Persistent Jobs remain unavailable from chat until separately deployed, explicitly enabled and verified.
- Private-mode Scouts, remote Medusa and transfer into the GitHub code builder are blocked.
- Private conversation text is **not copied into the regular Orchestra workspace** by Diana.
- A cloud image/editor operation still needs the existing API setup and per-tool consent.
- Whether an adapter is `active` in the role catalog is not proof that a backend is deployed.

## Ownership

| Component | Responsibility |
| --- | --- |
| Diana | Human-facing task selection, routing receipts and tool navigation |
| Merlin | Understand user requirements and original constraints |
| Zeus | Execute or coordinate approved tasks, select a model and observe runtime limits |
| Athena / Holy Roman Empire | Security screening and non-overridable authorization |
| CREAM / Retina / Orchestra / Janus | Real computation and artifacts within their own capability boundaries |

## Tests

```sh
npm run test:diana
npm run test:chat-router
npm run test:detroit
npm run build
```
