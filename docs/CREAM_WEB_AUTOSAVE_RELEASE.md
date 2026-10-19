# Vanilla 2026-10-19｜網頁全文閱讀、CREAM P0 上線、對話自動儲存

## 目前已串接的動作
1. **CREAM 正式上線 P0**：貼上 `CREAM：月份,銷售額\n一月,10\n二月,20`，或上傳 CSV／XLSX，聊天內直接產生統計 KPI、互動圖表與資料來源，不另開 Dashboard。描述統計 n、缺失、平均、SD 等由本地程式計算。這只是原 14 模組藍圖中的 P0 Data/Stats/Charts/Trace/Quality 基礎，不等於完整研究報告、系統性回顧或推論統計已完成。
2. **自然語言存檔**：「把剛剛的回答存成檔案，叫做整理筆記.md」、「把這個對話儲存成檔案」。將內容真正寫入瀏覽器 IndexedDB；一般模式 Google Drive 已授權時，再直接上傳檔案並新增記憶索引。不會假稱儲存成功；若 Drive 失敗，仍應顯示本機成功與遠端失敗。
3. **附加檔案的自動保存**：一般模式附加的檔案先本機保存；若有效 Drive 連線則同時上傳 Google Drive。私密模式仍維持不自動存檔。
4. **網頁閱讀**：「讀取 https://example.com/news 並統整」會讀取真正的 HTML/text 正文，標示來源再交給已啟用模型依據文本摘要；讀不到時說明原因，不把搜尋摘要當成全文。
5. **跨網域搜尋**：「上網搜尋：主題」可結合公開 Wikipedia/Crossref 結果與使用者另外部署的全網域搜尋後端。先嘗試讀來源正文，無法讀取的項目只根據搜尋 snippet。附上來源 URL 與「已讀正文／僅搜尋摘要」區分。

## 為何無法只用 GitHub Pages 達成像 ChatGPT 的全網搜尋與閱讀
GitHub Pages 是靜態前端，Safari 對許多網站受 CORS 限制；Google 搜尋結果頁也不能被公開前端自由擷取。需真正的伺服器：**目前已加入 Cloudflare Workers 範例，但尚未部署或寫入搜尋金鑰**。沒有服務端時，只有允許瀏覽器直接讀取的網站全文和公開索引能實際運作；未聲稱已全面搜尋所有網站。

### Cloudflare Workers 安全部署（獨立於 Pages）
程式：`services/web-research-worker/index.mjs`；正式環境須設定：
- `BRAVE_API_KEY`：Brave 搜尋 API 金鑰，以 Worker secret 配置；不能放到前端。
- `WEB_READER_TOKEN`：你自己的存取權杖，以 Worker secret 配置；用戶端在 Vanilla「設定→偏好網站與搜尋」的權杖欄輸入，僅暫存於 sessionStorage。
- `ALLOWED_ORIGIN=https://easylearnfromtw.github.io`：限制瀏覽器的 CORS Origin；注意 CORS 不是身分驗證，因此仍需前述 token。
- Worker route 應提供 `GET /search?q=<query>`、`GET /read?url=<encoded https URL>`。設定 HTTPS 搜尋後端時請填入以 `/search` 結尾的網址。
- API 金鑰和 Worker token 不應提交到 GitHub、放在聊天內容或放在公開 JavaScript 中。
- 建議加設 Cloudflare 限速、使用量上限、站點 robots/服務條款評估；不要用此服務讀取登入後、付費牆、內網或未授權內容。

本次 Worker 是部署範例，**不代表已上線 Worker**。服務受網站政策、封鎖、JS 動態渲染、反爬或費用限制；無法承諾任何網站均可全文存取。

## 安全及資料保護
- 使用者提供的外部 HTML、文字與網頁摘要一律視作不可信來源；閱讀內容以限定長度、公開 HTTPS、明確來源為原則，不執行來源頁面腳本。
- 私密模式不自動將附件／回答上傳 Drive；一般模式只有使用者已授權 Drive 才能自動雲端儲存。
- 存檔需要真正的 IndexedDB 成功確認，不只回覆一段 Markdown；不能將本機存檔冒充雲端同步。
- Google Drive／跨設備聊天室同步的限制仍存在；CREAM 結構化互動圖表的 Google Drive 跨裝置同步待後續版本，不能說已完整支援。

## 驗收
- [ ] CSV 聊天／CSV 附件／XLSX 附件直接出現 CREAM 互動統計卡
- [ ] 後續「把圖改成折線圖」能在聊天室修改圖型
- [ ] 「把上一則回答存成檔案」真的在左側附件庫建立 .md，登入 Drive 時上傳至個人帳戶
- [ ] 設定 Worker 後，在非預設網站查詢並讀取全文，回答附可點擊的來源 URL
- [ ] 未設定 Worker 時，遭 CORS 封鎖的網址不會假稱讀取成功
- [ ] 原有模型、WebLLM prompt order、Sheets、14+2、家庭隔離、PWA 全部 CI 通過
- [ ] iPhone 實機測試以及 GitHub Pages 最新部署驗證
