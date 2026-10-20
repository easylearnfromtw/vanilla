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


## Detroit 原生獨立搜尋（Brave／Tavily，取代 Gemini 單點依賴）

已接入現有 Railway「衞國」後端，而不是把 Brave／Tavily 金鑰放進公開 PWA：

- 後端：`services/weiguo/scouts_search.py`，由 FastAPI `app.py` 掛載於
  `GET /v1/family/scouts/status` 與 `POST /v1/family/scouts/search`。
- 使用衞國既有 Google OIDC 家庭簽章登入，僅 owner/member 可以查詢；viewer 和未登入者不可使用。最多每人每分鐘 6 次，單次最多兩家通用搜尋供應商及一次地區補充；不保存查詢與內容。
- **在 Railway 服務環境變數**（不是 GitHub Actions 公開 Variable）設定 `WEIGUO_SCOUTS_BRAVE_API_KEY`（Brave Search API）或 `WEIGUO_SCOUTS_TAVILY_API_KEY`（Tavily Search API）。至少其中一個必須有有效金鑰；可兩個皆配置。不要傳到聊天視窗或提交 Git。
- `src/weiguo/api.ts` 透過現有記憶體內家庭 Bearer 送查詢；`src/search/live-search.ts` 排第一順位。`LocalChat.gatherWeb` 一旦拿到 Brave／Tavily 的可核對網址，會略過 Gemini Google Grounding，並將最多三筆一般資料加一筆地區來源直接交給選擇的本地 Ollama／WebLLM 模型，再讓爾雅協助整合。
- Brave 提供真正通用網頁搜尋索引與摘要；Tavily 可提供搜索與由供應商擷取的正文。若只有搜尋摘要就標 `snippet`，正文可實際取得時才標 `full`。
- **如果 Railway 沒有上述任一金鑰：本功能尚未就緒。** 系統會誠實維持既有 Google／Wikipedia／Crossref 備援。成功部署 API 程式，不等於供應商購買、設定或真實搜尋已驗證。

提供者官方文件：
- https://api-dashboard.search.brave.com/app/documentation/web-search/get-started
- https://docs.tavily.com/documentation/api-reference/endpoint/search

驗收：以已登入的 owner/member 呼叫 `/v1/family/scouts/status`，須顯示 `ready:true` 及可用提供者；用正常對話輸入「請幫我查 2027 年 PGY 招募官方資訊」，在搜尋結果看到 Brave／Tavily 的實際網址及來源標籤，然後才確認本地模型有依資料引用回答。

安全界線：只呼叫固定的已審核供應商 API 域名；不提供泛用 HTTP 代理；不將管理者金鑰、Google Drive Token 或供應商金鑰發往 PWA；不從使用者輸入構造任意抓取 URL。服務端仍需要對第三方搜尋費用做配額監控。
