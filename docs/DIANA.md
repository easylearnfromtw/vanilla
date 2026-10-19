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

## Diana 3.0 · 主動調度（預設啟用）

Diana 現在會在一般聊天自動辨識明確的工具操作需求，**不必輸入 @Diana**。
既有的資料分析、檔案、記憶、Sheets、網路搜尋，以及爾雅潤稿路由仍優先，
因此不會把已經能直接執行的操作改成開啟空白工作區。

### 真正執行的連續工具工作

- 使用者在同一則訊息提供有效 CSV/TSV，且明確要求輸出 PDF、DOCX、PPTX 時，
  CREAM 先完成本機描述性統計；有可驗證的數值欄位後，Retina 才會接著產生並
  觸發本機下載。若 Retina 失敗，保留 CREAM 分析結果並清楚報錯。
- 若聊天中已有 CREAM 實算結果，可提出「把剛才 CREAM 結果輸出 PDF」，
  Diana 將該結果轉成純文字統計報告並直接呼叫 Retina。
- 文件僅含原始來源標記、描述性統計、統計警告與限制；聊天內的互動圖表
  **不會自動嵌入輸出檔**，也不會捏造引用或推論。
- 若沒有數值資料、數值欄位全部無效、工具缺席，Diana 不會假稱完成。

### 主動但不越權

自動工具選擇 **不等於無限制自主執行**。現有的雲端模型、雲端影像、GitHub
寫入、刪除資料、付款及外部伺服器作業仍保留同意與身分檢查；被禁用的
GridCraft、Moli、Quirinus、Chronos、Persistent Jobs 不能因為 Diana 主動化
就變成已部署。iPhone PWA 關閉後無法自行進行持續監控；必須另外部署後端。

### 測試

`npm run test:diana` 同時驗證明確及無前綴的 Diana 任務。
另須人工檢查 iPhone Safari 下載權限、CREAM 統計是否與輸出文件一致、
以及私密模式與權限同意沒有被繞過。
