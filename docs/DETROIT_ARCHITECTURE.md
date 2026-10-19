# Detroit — Vanilla 統一 AI 任務協作架構（v0.1）

## 系統定位與現實限制
- **一個主要模型、一組各自可測試的工具模組**。Merlin、Zeus、Venus 等是角色與程式介面，不是 17 個同時運作的 AI 模型；手機 WebGPU 永遠由 `SingleInferenceQueue` 序列化。
- 簡單問題走直答；深度分析提高供應商支援的思考預算，按需要取證、統計與驗收。**使用者只看得到階段、實際執行結果和依據，不暴露模型隱藏推理。**
- 對話與檔案都可能包含 prompt injection；外部來源沒有系統或管理權限；Athena 的靜態規則不等於防毒掃描。系統管理員憑證不放到網頁前端。
- 雲端模型仍是一次由使用者授權的 API 叫用，Detroit 可以提供工具回傳的真實上下文，但**不會憑一段系統名稱就提升模型實際算力**。

## 分組與依賴
| 層次 | 引擎 | 功能 | 本版狀態 |
|---|---|---|---|
| 接收與治理 | Merlin | 意圖、附件、任務深度與成果條件 | 已接入聊天 |
| 接收與治理 | Athena | 檔名、檔案簽章、程式危險特徵、提示注入 | 首層檢測；非沙箱/防毒 |
| 接收與治理 | Holy Roman Empire | 權限不可被自然語言降級；保留核准 | 決策守門函式；其他寫入路徑待全面接線 |
| 執行與運算 | Zeus | 解析成本/速度/隱私；模型工作佇列 | 已接入單一裝置端模型 |
| 執行與運算 | Dionysus | WebLLM GPU 排隊與深度思考預算 | 已接入 |
| 資料與產出 | Scouts / Janus | 真實網頁搜尋及來源可信度 | 沿用既有搜尋工具；非背景爬網 |
| 資料與產出 | CREAM | CSV/XLSX，描述統計、雙變數散佈、長期追蹤 | 已有確定性計算核心 |
| 資料與產出 | Atriensis | 雲端/本機檔案、權限、檔案生命週期 | 沿用既有 Drive/附件庫；待統一事件介面 |
| 資料與產出 | Bard | 圖片/媒體生成與資產管理 | 介面規劃中；目前不可在 Vanilla 聊天直接生圖 |
| 資料與產出 | Retina | 報告、企劃書、簡報、PDF | 既有 Markdown/表格/列印可用，高階文件引擎待建置 |
| 資料與產出 | 爾雅 / Venus | 需求驗收、行文與視覺元件選擇 | 提示與聊天階段顯示已接線；不是第二組驗證模型 |
| 持續性 | Persistent Jobs / Chronos / Hermes | 後端排程、重試與通知 | **可部署參考 Worker**；未部署前不允許聲稱已監控或通知 |
| 記憶 | Mnemosyne | 家庭各身分記憶與歷史指標 | 使用現有已登入帳戶資料，禁止跨帳號共用 |

## 工作流程
1. Merlin 以文字、影像是否附加、檔案是否附加分級，產生稽核清單；簡單任務跳過完整流水線。
2. Athena 對每個新附件執行拒收與風險提示，讀取外部資料之後繼續將其視為不可信；高風險路徑不執行上傳程式。
3. Zeus 根據現有模型、裝置、隱私、使用者計費同意選擇單一推論來源；Dionysus 保證裝置端一次只會跑一個推論。
4. 已有 Scouts/CREAM/Atriensis 工具負責真正的搜尋、計算與檔案動作，不能由 LLM 虛構已完成。
5. 爾雅使用需求與限制說明作核對；Venus 適配既有 Markdown、圖表、表格。需要 PDF/PPTX 時 Retina 應呼叫專屬產檔器，但尚未在本版新增 PPTX 生成。

## 深度分析和「思考過程」
- UI 開啟 **Detroit 深度分析**；並顯示 Merlin → Athena → Zeus → [必要工具] → Dionysus → 爾雅 → Venus 的摘要進度。
- 本機 Qwen3 1.7B 以上在深度模式可啟用原生 thinking（仍不顯示私有推理文字）；其他小模型僅增加 token 上限。
- Ollama 支援的模型可請求 `think:true`，不支援則採現有回退；Gemini 增加 thinkingLevel；DeepSeek 增加 reasoning_effort。
- 只有工具執行紀錄、統計方法、來源、失敗及修正結果可供顯示；**不應假裝推理每一步都是獨立模組的實際運行結果**。

## 持續背景任務（參考部署）
`services/detroit-jobs/` 提供 Cloudflare Worker + D1 + Cron 的 **定期公開網頁變更監測** 最小實作。手機可關閉，Cron 在後端執行。

1. 建立 D1 資料庫，使用 `migrations.sql` 建表，將 `wrangler.example.toml` 複製至自行配置的 `wrangler.toml` 並填寫 D1 ID。
2. 設定至少 32 字元 `DETROIT_ADMIN_TOKEN` secret，列明 `DETROIT_ALLOWED_HOSTS` 精確可信主機。此憑證**絕不可加入 GitHub Pages、PWA 或聊天附件**。
3. 部署 Worker，核實 Cron 有觸發。由受信任的後端（非瀏覽器公開頁面）授權建立每位 owner 的工作。用 `/v1/jobs?owner=...` 與 `/v1/changes?owner=...` 檢查結果。
4. 範例僅做網站內容雜湊的變更檢測、每人最多 20 個、最短每 60 分鐘一次；沒有對話代理、通知推送、多使用者 OAuth、通用 AI Agent 或任務自動續跑。此類功能需要額外後端與明確授權才能上線。

## 版本發展路線
- D0（本版）：引擎註冊表、深度模式、單模型推論佇列、可檢視階段、文件/網址來源守門、參考背景排程。
- D1：每個工具回報真正的 action id、輸入來源、耗時與錯誤；爾雅自動核對完成條件。
- D2：Retina 多格式檔案、Bard 已取得授權的生圖服務、Atriensis 統一審計、Athena 沙箱/第三方防毒。
- D3：具有 OAuth / 多租戶身分驗證、通知送達與任務恢復的生產級 Persistent Jobs；部署配置後才宣稱可長期監控。

## 資料治理與可擴展性
每個模組獨立檔案、純函式決策與測試；Zeus 不得修改自己的權限或自動提交程式更新。自動優化只能產生 PR/建議，必須通過測試並由使用者明確批准。對家庭不同帳號分開保存記憶、任務與附件。

## D2 已落實（v0.2 開發）
- Detroit Studio 作為工具工作區；保留對話內的 CREAM 圖表，並可將回答直接交給 Retina 在裝置端匯出 PDF（Canvas 影像頁面）、DOCX 與 PPTX。
- Bard 依明確同意與現有 Gemini API key 啟動圖片生成，不載入第二組手機端模型。Athena 加入隔離 Worker 與檔案容器簽章掃描，不代表商用防毒。
- Persistent Jobs 具有 D1 通知 outbox 與 HMAC-SHA256 Webhook 重試設計。**需自行部署 Cloudflare + D1 + Cron + 通知接收服務**才有實際持續監控。詳細指引見 `docs/DETROIT_COMPLETION_PHASE2.md`。

## Detroit Factory / Medusa（Judge0，選用）
- Medusa 是獨立的程式執行工具，不是另外載入的模型。程式碼只能經既有衞國家庭驗證與使用者逐次核准，交給獨立隔離的 Judge0 後端。
- 本版提供手動 Detroit Studio 頁籤、驗證後端、固定語言白名單、CPU／記憶體／時間與輸出限制；預設停用，不安裝 Judge0，也不在手機執行不可信程式碼。
- Zeus 可在程式任務顯示 Medusa 這個候選階段，但不能因此假稱已執行。JENSEN HUANG／CREAM 的自動派工與測試迴圈尚未接線。
- 實際啟用前必須完成獨立 Judge0 部署和網路隔離。詳見 `docs/MEDUSA_JUDGE0_INTEGRATION.md`。
