# Vanilla 個人模式｜自動文件、CREAM、網站索引與自我檢查

## 此版實際實作
1. **真實讀檔**：聊天附件可抽取 PDF 有文字層內容（PDF.js；不含 OCR）、DOCX OOXML 段落與表格、PPTX OOXML 文字、XLSX 第一個工作表、CSV、TXT、MD、JSON。掃描式 PDF 無文字時如實說明沒有 OCR；帶圖的 PDF／簡報圖片也不能冒稱已分析。
2. **自動 CREAM**：若文件帶有符合 CREAM P0 結構的二維表格，附件讀取後直接計算描述統計與建立對話互動圖表，**不要求使用者輸入 CREAM 指令或有 AI 模型**。無合法數值欄時保留文字並說明限制，不捏造統計結果。
3. **重新讀取自己已保存的資料**：例如「分析已儲存的文件：report.pdf」從當前帳戶本機 IndexedDB 附件庫抓真正的 Blob，再呼叫同一抽取器，並嘗試 CREAM 分析。此操作不會讀取其他帳戶資料。Google Drive 文件仍需實際授權與符合雲端讀取 API 的內容解析。
4. **自動網站研究與索引**：明確的「搜尋」「讀取 https://...」仍支援；新增對一部分「最新法規／新聞／研究／官方公告」問題的保守自動搜尋。能夠讀取網站正文時標為 *已讀取正文*，只得到搜尋摘要時標為 *摘要*，並保留網頁標題、原始 URL 與 [1] 編號。即使未載入模型，也可看到已取得的來源索引；不會宣稱做了 AI 語意摘要。
5. **自我檢查自己的程式碼**：對話「檢查 Vanilla 程式碼」或「分析你自己的程式碼 src/noodles/core.ts」會嘗試從 GitHub 公開唯讀 API 讀取 main 原始檔、行數、具名 exports、TODO／FIXME 等靜態訊號，並提供 GitHub 原始連結。已設定授權 Worker 時優先使用 Worker 讀取。這是靜態審查，不等於已編譯、跑單元測試或微調模型。
6. **簡化介面**：聊天上方的工具、NOODLES、CREAM Google 分組折疊成單一「工具與資料」；減少頂部一直展開的面板。Teacher 學習只顯示精簡狀態，訓練匯出放進二級展開。
7. **個人預設**：非私密模式預設允許 NOODLES 收集**使用者主動按讚／挑選的本地模型回答**，不再需要逐次按訓練同意。基於來源模型條款／資訊安全，Gemini、DeepSeek、Ollama 的完整輸出不默認存入 SFT／DPO；它們仍可參與原 NOODLES 不含原文的品質評估。私密模式仍不訓練。

## 你有明確同意，但純前端仍無法解決的事情
- GitHub Pages 是公用靜態網頁，不可放入 GitHub PAT／搜尋服務 API Secret。即使只有一名使用者，也可能被他人下載 JavaScript。實際對你的 GitHub Repository **建立 PR／自修 CI**，必須由你另行部署 `services/self-build-github-worker`、將 Token 放入 Cloudflare Worker Secret、在 Vanilla 設定受保護的 URL。**公開 GitHub 原始碼的唯讀檢查**則不需要 PAT。
- 不可能在沒有 Search Worker 的情況下繞過所有網站的 CORS、登入牆、反爬措施。現在仍保留 `services/web-research-worker` Brave Search／正文 API，需由你持有部署帳戶與金鑰；不能宣稱可以無限制閱讀所有網域。
- 沒有裝置端 OCR 引擎時不會假稱已讀取影像式 PDF。PDF.js 只能擷取 PDF 文字層。
- 只有 iPhone Safari 無法真正微調所有模型權重；需要外部可訓練 GPU、樣本版權確認和獨立模型驗證，第三方模型權重不能由 Vanilla 更改。
- 此版並沒有為所有的 CREAM 研究、推論統計 14 模組自動生成完整功能；已將現有 P0 可靠連入文件附件。

## 部署驗收
- CI 包括 `npm run test:auto-docs`、既有的 CREAM、NOODLES、Self-Build、網站來源測試、TypeScript 與 Vite 正式編譯。
- 真正 PDF／DOCX／PPTX 的 iPhone 瀏覽器內容、Google Drive 存取、受限網站全文和受保護 GitHub Worker 寫入，需要在裝置與相應帳號環境逐項實測；建置成功不能取代實際驗收。
