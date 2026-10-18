# Vanilla Sheets + Cloud Files — 初版使用與驗收

此功能直接整合於 `easylearnfromtw/vanilla` 現有 React + Vite + GitHub Pages PWA，沿用同一登入介面與 AI 模型設定。沒有額外新帳號。

## Vanilla Sheets

從左側「Vanilla 表格」進入。可以新增或匯入工作簿，多工作表、A1–Z200 儲存格、手動輸入與跨格貼上、儲存格基本格式、復原重做。本機工作簿自動保存於瀏覽器 localStorage。

支援公式 `SUM`、`AVERAGE`、`COUNT`、`MAX`、`MIN`、`ROUND`、`IF`，並支援基本四則運算與儲存格引用。公式不使用 `eval`。CSV 匯出輸出計算結果，使用文字公式注入防護；JSON 保存所有工作表、原始公式與樣式。

AI 修改分兩層：

1. 明確位置的本機指令（如 `A1=日期` 或 `在 B2 輸入 150`），無須上傳。
2. 複雜要求（如建立分類預算表）選已連接的 Ollama 或 Gemini。使用者點選「預覽修改」後才會詢問是否將最多 120 格內容送去該服務。輸出僅允許 JSON `changes` 陣列，驗證位置 A1–Z200、100 格上限；顯示新舊內容差異，使用者再按「確認套用」。可復原。

對話內 AI 回答 Markdown 表格後，按「在 Sheets 編輯」能建立獨立的可編輯本機工作簿；若來自私密模式，另行要求同意複製到一般本機工作區。

「儲存雲端」是**手動動作**，使用 Google Drive 的 `Vanilla Workspace` 資料夾，格式 `.vanilla-sheet.json`。儲存時比對 Drive 版本，若遠端版本不同則停止覆寫，可另存副本。雲端檔案區可開啟工作簿副本；匯入時不覆寫本機同名工作簿。

## Vanilla Cloud Files

左側「雲端檔案」使用既有 Google 帳號登入，授權 `drive.appdata` 與 `drive.file`：

- Google Drive API 只列出 **Vanilla 建立或獲得授權的檔案**，不是無限制搜尋所有 Drive 資料。
- 新增 TXT、Markdown、CSV、JSON；從裝置上傳 PDF、圖片及其他檔案（單檔 15 MB 上限）。
- 搜尋檔名、文字編輯、版本安全儲存、下載、重新命名、移到垃圾桶。
- CSV 可建立 Vanilla Sheets 可編輯副本；`.vanilla-sheet.json` 直接在 Vanilla Sheets 中開啟副本。
- 支援「搜尋 報告」「新增 行程.md」「開啟 行程.md」「刪除 行程.md」「把 行程.md 改名為 旅行.md」「在 行程.md 最後加入 住宿」，先解析成操作預覽，確認後執行。
- Google Docs、Google Sheets、Google Slides 原生格式目前透過 Google 編輯器處理，不宣稱已支援其內文原位修改。

**安全性：** 一般 Google Drive 工作區中的檔案未做端對端加密，不等同現有的加密家庭保險庫；上傳包含個資或敏感資料前務必評估。私密聊天不會自動傳入雲端檔案。對於雲端同時修改，採寫入前版本檢查，但無法保證涵蓋極短時間內的所有競態。

## 驗收步驟

1. GitHub Actions `Deploy Vanilla PWA` 應完成 `npm run test:workspace`、`npm run build` 與 Pages 部署。
2. 表格建立、編輯 `A1=10`、`A2=20`、`B1=SUM(A1:A2)`，B1 應顯示 30。試 `=IF(A1>5,"是","否")`。
3. 在手機與電腦測試編輯、工作表切換、復原重做、CSV／JSON 匯入匯出。
4. 在表格助手輸入 `A1=姓名` 並按預覽，確認不會在按「確認套用」前改動儲存格。
5. 連 Google Drive，若提示重新授權，確認 `drive.file` 範圍。建立文字檔、編輯儲存、重新命名、移至垃圾桶。
6. 儲存一份 `.vanilla-sheet.json` 到 Drive，在另一裝置登入相同帳號並由 Cloud Files 開啟。
7. 在兩台裝置同時修改同一雲端檔案，後儲存者應看到版本衝突，不應默默覆蓋。
8. 從 Vanilla AI 聊天生成 Markdown 表格，點「在 Sheets 編輯」確認已產生新工作簿。

## 已知未完成項目

- 全 Google Drive 檔案的 Picker 搜尋與授權，以及 Docs／Sheets／Slides 原生內文 API 編輯。
- 完整 XLSX／DOCX／PPTX 原位編修、嵌入圖表、列印排版、多人同時協作與版本合併。
- RAG 文件向量搜尋、家庭成員分權、跨裝置自動同步與端對端加密文件倉庫。

這些功能需獨立的 Office 檔案引擎、OAuth 選檔授權、安全存儲及同步設計；不應把現有初版當成完整 Google Workspace 替代品。
