# Scouts 對話搜尋與網頁閱讀（2026-10-20）

## 實際架構

1. 使用者以自然語言說「幫我查一下……」、「根據最新官方資料……」，或輸入 `/搜尋 ...`，`chat-router.ts` 路由至 Scouts。
2. `live-search.ts` 優先查詢已設定的 **通用 HTTPS 搜尋後端**；Wikipedia 只是百科後備來源，Crossref 僅用於學術文獻查詢，且不應把 Crossref 中繼資料當作已閱讀的論文。
3. `web-reader.ts` 在已設定後端時優先呼叫配對的 `/read?url=...`，避免 iPhone Safari 對第三方網頁的 CORS 限制。若後端暫時失效，仍可嘗試瀏覽器直接讀取。
4. 真實取得的全文標示為 `full`，未取得全文的搜尋摘要標示為 `snippet`；有可用模型時附帶來源交由模型統整，沒有模型時顯示來源索引，不虛構閱讀或證據。

## 為什麼仍需要後端

公開的 GitHub Pages / iPhone PWA 無法繞過第三方網站 CORS，也不能在前端安全地保存 Brave、Google 或其他搜尋 API 金鑰。本次變更改善觸發條件、優先順序、錯誤與超時處理，**不會自動替使用者啟用、付費或部署第三方搜尋服務**。

程式庫提供 `services/web-research-worker/index.mjs` 作為自架 Cloudflare Worker 範例。必須由部署者設定：

- `BRAVE_API_KEY`：通用搜尋 API 金鑰（僅保存在 Worker Secret）。
- `WEB_READER_TOKEN`：HTTPS Worker 的 Bearer 權杖（不得提交 GitHub 或加入前端 bundle）。
- `ALLOWED_ORIGIN`：實際 GitHub Pages 的來源，例如 `https://easylearnfromtw.github.io`，需要精確對應 `Origin`。
- `GET /search?q=<query>`：回傳 `{"results":[{"title":"...","url":"https://...","snippet":"..."}]}`。
- `GET /read?url=<encoded-public-https-url>`：回傳 `{"title":"...","url":"https://...","text":"..."}`。

部署後在 Vanilla「來源設定」填入完整 `https://<worker-domain>/search`，並輸入 Worker 專用權杖，先按「儲存搜尋設定」，再按「實測搜尋後端」。HTTP 401 通常代表權杖錯誤；403 多半代表 Worker 不允許目前 PWA 的 `Origin`；422/429/5xx 則需要檢查服務日誌、搜尋配額及網頁限制。

**權限與安全：** 網頁內容是不可信資料，經 Athena prompt-injection 檢查，外部引用不能指示工具執行命令。僅允許公開 HTTPS 來源；對私人 IP、需要登入、付費牆、JS 動態頁面與禁止自動抓取的網站，不能保證取得全文。未授權的代理、驗證碼繞過及私人資料擷取不在此功能內。私密模式完全禁止 Scouts 網路搜尋。

## 最小驗收

- 「幫我查一下 2027 年 PGY 招募公告」→ 自動走 Scouts、取得可核對網址。
- 「根據最新官方資料整理政策」→ 觸發自動搜尋。
- 「請幫我閱讀 https://example.com/article 然後整理重點」→ 先讀正文；實際可讀與否以網站和後端為準。
- 「只根據文件摘要，不要上網」→ 不自動呼叫搜尋。
- 配置 Worker 後以「實測搜尋後端」驗證，確認搜尋結果有來源網址，再檢查模型是否顯示 `full`/ `snippet` 標記。

相關測試：`npm run test:chat-router`、`npm run test:web-workflows`，以及 `npm run build`。
