# Vanilla 功能實況（真實能力自述）

## 背景
使用者問「你能做什麼？」「你有哪些功能？」「你能控制 iPhone 嗎？」時，小型 LLM 不知道目前 GitHub Pages 實際部署了哪些功能，可能幻覺聲稱 CREAM、Mobilerun、全自動網頁抓取或其他未完成能力。

## 實作
- `src/assistant/capability-report.ts`：功能登錄表 + 判定是否為**詢問能力**的明確規則。重要資訊從實際對話時的 Snapshot 生成，不讓 LLM 自行編造。
- `src/local-ai/LocalChat.tsx`：在模型選擇及工具執行之前，先處理詢問本身能力的問題；無需消耗 token／雲端 API。
- `src/assistant/AssistantTools.tsx`：工作列新增「功能實況」快捷鍵。
- `tests/capabilities.test.mjs`：驗證概述、逐項狀態、私密／離線／模型未載入情況，以及不攔截一般使用者的表格、搜尋及功能開發請求。

## 回答的狀態定義
- **目前可用**：程式已在正式主線實作，必要本機狀態符合；這仍不表示每個外部 API 交易已成功。
- **需要設定／授權**：需要下載模型、登入 Drive、開啟網路或授權後才可能使用。
- **部分功能**：程式只完成局部能力，必須說明明確邊界。
- **尚未上線**：目前只有候選 PR、規劃書或尚未整合至正式主線的程式。

## 維護原則
- CREAM 內嵌圖表 PR、Mobilerun 手機代理 PR **尚未合併**時，必須顯示尚未上線。
- 若日後合併這些功能，請同步修改 `capability-report.ts`、補上回歸測試及必要的真正執行／授權檢查；不能因為 GitHub 上有草稿 PR 就宣稱使用者可立即使用。
- 外部服務憑證**已設定**不等於 API 測試**成功**，不把 OAuth 身分或醫療、財務資訊輸出到能力清單。
- 功能問答必須保留舊的意圖路由：「幫我做表格」「搜尋：」「新增功能：」都不可被「自我介紹」功能劫持。
- Vanilla 仍以 GitHub Pages + iPhone 本地模型 + 使用者授權的 Google Drive 為主，不新增 Raspberry Pi。
