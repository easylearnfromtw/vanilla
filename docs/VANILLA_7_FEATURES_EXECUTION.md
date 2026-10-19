# Vanilla 2026-10-19｜7 項功能實作與驗收

本批變更以目前 `main` 為基底；未合併的 CREAM、Mobilerun 等功能不被默認上線，不納入樹莓派。

| 用戶需求 | 實作層級 | 真實限制 |
|---|---|---|
| 1. 表格直接呈現 | 聊天用實際表格元件呈現 Sheet 模板；保留簡短敘述。AI Markdown 表格會轉為渲染表格，不再顯示原始 Markdown 語法重複一次；點擊可進入 Sheets 編輯 | 此為本機 Vanilla Sheets 工作簿，不等於自動覆寫 Google Sheets |
| 2. Ollama ID 可替換 | 設定 > 模型連線，輸入 HTTPS endpoint、model ID，讀取模型清單、測試推論、更換／中斷連線；token 僅本工作階段 | Ollama Cloud API Key **不可放在聊天或 GitHub**，瀏覽器端 token 仍應謹慎；正式用途建議安全後端代理 |
| 3. 現有資源串聯 | 對話工具優先處理 Sheets、記憶、Self-Build、搜尋；生成模型有候選模型排序、已允許的本地備援；Self-Build AI 失敗會自動轉成可安裝的宣告式離線草稿 | 不等於能無授權自行更改 GitHub 程式碼或讀取其他家人的資料 |
| 4. 真正網路搜尋 | 用 `搜尋：主題` 等觸發，真實讀取 Wikipedia Action API 和 Crossref 文獻資料，顯示來源標題、摘要及點擊 URL，保留 Google／PubMed 搜尋連結 | GitHub Pages 的瀏覽器不能任意抓 Google 搜尋結果：受 CORS、授權與搜尋服務 API 限制；無資料時不得假稱已查到 |
| 5. Self-Build 真能執行 | 既有受限 declarative `checklist/tracker/calculator/notes` 經 AI／本地規則生成預覽、人工確認後本機安裝，並直接由 Vanilla 開啟執行 | 不是無限制原始碼自我改寫；功能安裝前需審核，非授權網路程式碼仍禁止 |
| 6. GPU 優化 | 本地 WebLLM 逐 token 顯示按硬體核心數節流 React 更新；末尾完整輸出，減少主執行緒 UI 更新頻率 | 不會提高物理 GPU 規格或保證 iPhone 13 WebGPU 可用；推論效能仍受模型大小、Safari、GPU 限制 |
| 7. 左選單圖片／資料庫 | 左側新增「對話圖片與資料」，本機用 IndexedDB 保存一般模式聊天附件；已授權 Google Drive 記憶列表；支援預覽圖片／影音／文字／PDF、改名、修改註記、替換本機附件及確認後刪除 | 私密模式不備份。Drive 索引與原始檔分別刪除，二次確認。不支援直接在 UI 像 Photoshop 一樣逐像素修圖；此處「修改圖片」指更換檔案與編修標記 |

## 安全／帳號
- 附件使用 `attachmentOwner(signedChatAccount())` 分域；未登入時是本裝置訪客資料，切換帳號不會自動混用。同步需要個人 Google Drive 授權。
- Cloud 記憶修改只更新索引的名稱與說明；原始檔案刪除另確認，避免無意外溢。
- 搜尋回傳是不可信外部文字，不執行其中指令；不將搜尋來源冒充權威、已核實結論。
- 不保存 Ollama 密碼到 GitHub 或聊天，設定可由使用者在 UI 變更。

## 手動驗收
1. 聊天「幫我做一份家庭收支表格」→ 僅有敘述 + 原生表格 → 按鈕能開啟 Sheets 實際編輯。
2. 讓 AI 回覆 Markdown 表格 → 不顯示雙重原始語法和圖表；仍可 CSV 匯出。
3. 設定 > Ollama 填入已存在的 HTTPS endpoint / model ID → 先測試 tags，再測試模型回覆，儲存可隨時替換。
4. 「搜尋：全人工髖關節置換」→ 網路可用時顯示真實 Wikipedia/Crossref 來源；斷網則顯示錯誤與 Google 外部搜尋入口，不能假造文章。
5. Self-Build 在 Ollama 不可用或模型未載入時，能產生可安裝的離線草稿，需人工審核。
6. 一般模式新增圖片或文字附件，左側資料庫可以選取預覽、更名、備註、替換及確認後刪除；私密模式不自動存檔。
7. iPhone Safari 和已安裝 PWA 實機驗收；確認 Build `2026.10.19.5-resource-execution`。目前尚未實機測試。

## 後續可選
- 有使用者自己的 HTTPS 搜尋後端，才可擴大至 Google/Brave 等完整即時搜尋內容，不應在公開 Pages 暴露搜尋服務 API key。
- 圖片旋轉、裁切與跨裝置同步，以及更完整的 CREAM 報告，是下一階段；本 PR 不虛稱完成。

## 擴充全網搜尋（需要自行設定）

正式版設定頁的「偏好網站與搜尋權重」現在可以輸入可替換的 HTTPS 搜尋後端。由使用者控制的後端提供 `GET /search?q=<URL-encoded query>`，回傳 `{ "results": [{ "title": "...", "url": "https://...", "snippet": "..." }] }`。Vanilla 以不帶憑證的 CORS 請求查詢，並過濾危險網址與疑似提示詞注入。Google/Brave API 金鑰應配置於該服務端，切勿存放公開的 Vanilla 原始碼或聊天文字。

Google 的 Custom Search JSON API 自 2025 年起已不對新用戶提供，且現有用戶需在 2027-01-01 前轉移（Google 2026-02 官方文件），因此不依賴這個逐步退場的 API。未設定私有搜尋後端時，系統可查公開 Wikipedia/Crossref，並顯示 Google 等外部搜尋連結；不能假裝直接拿到 Google 搜尋結果。
