# Vanilla 聊天 UI v2｜GPT 風格的左右滑動與並排成果

## 本次新增（未改變模型回應／內容資料的所有權）
- 使用者訊息為右側柔和氣泡，AI 回覆採閱讀欄位，支援 **Markdown 標題、清單、粗體、程式碼區塊、引用、連結與 GFM 表格**。使用 `react-markdown` 與 `remark-gfm`，不允許直接注入外部 HTML。
- AI 回答中的**實際成果**（CREAM 互動圖表、Vanilla Sheets 工作簿、表格、網路引用）使用內嵌 Swipe Deck 展示：桌面兩欄並排、iPhone 每次一張、原生 CSS scroll snap 左右滑、前後導覽箭頭與目前頁數。
- 雙模型比較沿用同一套 Swipe Deck；可從 Gemini、DeepSeek、Ollama 等已允許的兩個候選中選擇優勝答案，仍保存原有 NOODLES 記錄機制。
- 在成果卡中，表格可直接開啟 Vanilla Sheets 編輯，CREAM 保留原有互動，引用可點原始網址，資料來源標示全文／摘要。
- AI 回覆若有表格，只保留文字敘述＋**單一實際表格**，Markdown 原始表格不重複顯示。
- 手機支援安全區、橫向滑動、動畫減量 `prefers-reduced-motion`、可鍵盤聚焦的成果區、按鈕明確文字／aria-label。
- 版本 `2026.10.19.10-swipe-chat`。

## 效能和風險
- 原本 model streaming/NOODLES/CREAM/Drive/WebLLM 系統提示詞順序不修改；主要改動在 React render 和 CSS。
- 沒有模仿 ChatGPT 私有模型能力、服務接口或聲稱視覺 100% 一樣；只採相似的對話排版模式。
- 使用標準 Markdown component renderer，不渲染 raw HTML，無 `dangerouslySetInnerHTML`。
- 滑動卡片僅是同一訊息中的不同成果；**不會把不同對話誤當成同一條可滑輪播**。
- **對話分支、GPT 式歷史搜尋、影音即時串流、圖片裁切編輯**沒有在本次實作；必要時應獨立設計並更新驗收清單。

## GitHub CI 驗收
- `npm run test:chat-ui`：滑動目標計算／引用網址保護／單一表格／Markdown 安全／雙模型比較維持可選擇。
- 原有所有 NOODLES、CREAM、Google Analytics、Self-Build、Sheets、WebLLM 回歸測試。
- TypeScript `tsc -b` 與 Vite Production build。
- iPhone Safari 實機觸控仍需驗證，尤其手勢、WebGPU 效能與 375px 螢幕寬度。
