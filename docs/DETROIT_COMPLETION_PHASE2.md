# Detroit D2 — 專用生成引擎與可部署背景通知（2026-10-19）

## 可執行模組
- **Retina** (`src/detroit/retina.ts`): 瀏覽器端從已確認的 Markdown 標題、段落與項目製作 PDF（Canvas 轉頁，圖像型、不適合搜尋全文）、Word DOCX、PowerPoint PPTX。PPTX/DOCX 以 Office Open XML 實際建立可編輯文字；不執行來自文件的 JavaScript。成果須由使用者按下匯出，資料不送雲端。
- **Bard** (`src/detroit/bard.ts`): 使用用戶已配置且授權的 Gemini 圖片 API，僅在主動勾選可能計費的遠端生成同意後呼叫。私密模式嚴禁呼叫。
- **Athena** (`src/detroit/athena-quarantine.ts`): 在解析前對附件簽章、ZIP/Office 內檔名（不解壓）、巨集與 PDF 主動內容進行檢查；專用 Web Worker 有逾時／失敗阻擋策略。**不是完整惡意軟體特徵庫或安全沙箱**。
- **Persistent Jobs** (`services/detroit-jobs`): Cloudflare D1 + Cron 的可部署公開網站變更監控，支援 HMAC 簽章 Webhook、通知重試佇列，手機 Safari 關閉仍由後端執行，但**沒有配置/部署則不會執行監控或通知**。

## 使用方式
1. 在 Vanilla 側欄開啟 **Detroit Studio**；Retina 可直接輸入報告內容選 PDF / DOCX / PPTX 下載。對話中亦有「Retina 匯出」入口，需用戶明確點選才會建立文件。
2. Bard 首先於 Vanilla 系統設定配置 Gemini API，於 Studio 勾選 API 成本/傳輸同意，再輸入提示詞生成。不得在私密模式中生圖。
3. Athena 掃描在附件處理前啟用，應將不可信內容當成資料，不應授予管理權限或自動執行程式。
4. Persistent Jobs 只能由受信任的後端管理員建立；公開 PWA 不儲存管理 API token。

## Worker 部署（需本人 Cloudflare 權限）
1. 在 Cloudflare 建立 D1 資料庫，執行 `migrations.sql` 和 `002_notifications.sql`。
2. 依 `wrangler.example.toml` 設定 `DETROIT_DB` binding，選擇可靠的 HTTPS `DETROIT_ALLOWED_HOSTS`，排程最低每小時一次。
3. 以 Cloudflare secret 配置 `DETROIT_ADMIN_TOKEN`（>=32 字元），若要通知則需 `DETROIT_NOTIFY_WEBHOOK`、`DETROIT_NOTIFY_HOST` 和 `DETROIT_NOTIFY_SECRET`（>=32 字元）。勿把 token 放在網頁、對話或 GitHub。
4. `wrangler deploy`，從受信任的伺服器後端使用 Bearer Token 呼叫 Worker `/v1/jobs` 建立 owner 任務；當網址變更時會在 Cron 排程寫入通知佇列，對接收端 POST `detroit.public_page_changed` 並附 `x-detroit-signature` HMAC-SHA256，接收端務必驗簽、防重放。
5. `GET /public-health` 可讓 PWA 不帶密碼檢查 Worker 是否在線；這不能證明 Cron、Webhook 或外部通知真的已送達。確認後台 D1 `jobs`,`job_runs`,`notification_outbox` 的結果。

## 明確限制
- GitHub Pages 無後端，不能自己接收推播或管理密鑰；必要的 Cloudflare 授權、OAuth、多租戶權限與通知端點仍需部署並測試。
- Bard 由雲端圖片模型生成，**不**是在 iPhone GPU 上跑圖片模型；沒有金鑰時不會生成。
- PDF 是畫布渲染的影像頁面，中文呈現需手機瀏覽器支援 CJK 字體；DOCX/PPTX 提供可編輯中文字。
- Athena 不聲稱 100% 阻擋木馬、惡意 PDF 或未知零時差攻擊，高風險檔案應採第三方沙箱。
- Zeus/Retina/Bard/其他分工不是多個同時載入的 LLM，本地保持 Single Model Runtime。
