# LUCA — Detroit 可觀測性子系統（第一版）

LUCA = **Local Unified Context & Analytics**。以 Pydantic Logfire SDK 作為可選 OpenTelemetry 追蹤層，搭配 Vanilla 自有的資料最小化聚合器。LUCA 是程式監控工具，不是獨立的語言模型或自動除錯代理。

## 已落地的程式範圍

- 衞國 FastAPI 已接入固定路由範本的 HTTP 狀態及延遲記錄，及後端 browser background job 成功/失敗/耗時統計。
- `services/weiguo/luca.py` 維持最近 **300** 筆無使用者識別的低敏事件（記憶體），可選擇透過 `LUCA_DB` 寫入每日低基數彙總（保留至多 30 日；UI 顯示最近 14 日）。
- 每次記錄只有 UTC 時間、受控元件／動作名稱、HTTP 狀態、毫秒耗時；日彙總只有日期、元件、筆數、非成功筆數、耗時總和。
- `GET /v1/family/luca/summary` 使用現有短期 Google 家庭身分工作階段，**僅 owner** 可讀；設定 `Cache-Control: private, no-store`。
- Detroit Studio 的「LUCA 監控」顯示真實後端統計、CREAM 可分析的 14 日日趨勢、診斷提示。私人模式不連線，未啟用時明確標示狀態。

## 手機端異常監控（獨立擴充）

手機端可由 [LUCA 手機端錯誤紀錄](LUCA_CLIENT_DIAGNOSTICS.md) 獨立開啟：無需部署或啟用後端 LUCA，依帳戶在瀏覽器留存經白名單限制的分類異常，供人工診斷、手動匯出／清除。不會把原始錯誤內容送往後端，也不能宣稱能觀測所有 Detroit 子系統。

## 回答品質回饋（本機 LUCA 擴充）

- 對話中由使用者**明確點擊**「讚」「倒讚」，或在雙模型比較選取一個較喜歡的答案時，才產生品質回饋事件。串流中、單純產出答案、或模型自評均不計入。
- 每筆紀錄僅含隨機事件 ID、UTC 時間、回饋類型（`up`／`down`／`chosen`）、受控任務類型，以及模型**來源類別**（本機／Ollama／Gemini／DeepSeek／其他）。不存提問、回答、對話識別碼、模型型號、附件、權杖或使用者身分於事件內容。
- 使用者帳號各自儲存於該裝置的瀏覽器 localStorage；未登入訪客僅存在分頁記憶體。最多 500 筆、90 天，超出即淘汰。私人模式完全不記錄、不讀取、不匯出。
- Detroit Studio → LUCA 監控 →「回答品質」提供讚、倒讚、選擇回答計數、任務／來源分類、明細，及**手動** JSON 匯出、清除。LUCA 回饋紀錄的清除不會同步刪除 NOODLES、模型評分或對話歷史。
- LUCA 回饋**不需要**啟用 `LUCA_ENABLED` 或部署衞國後端，不自動傳送資料；LUCA 只做記錄與分析，原有 NOODLES／模型排序仍處理本機偏好。回饋不代表模型權重已接受訓練。
- 現有評價僅對帶有模型來源的可評分 AI 回答開放；一般工具訊息不會被誤算為使用者評分。

## 選用的 Hank × Tracely 資料通道

可透過獨立內網 OTel Collector 將既有 LUCA metadata-only spans 送至**自行架設**的 Tracely；這不授權收集使用者原始對話、模型回答或私人資料，也不能直接形成語意對話的重播測試。預設仍為關閉。詳見 [Hank × Tracely](HANK_TRACELY.md) 的 Collector 配置與安全限制。

## 設定方式

```env
LUCA_ENABLED=true
LUCA_DB=/data/luca.sqlite3
# 可選，只有內部主機允許（且必須明確設定）
# LUCA_OTLP_ENDPOINT=http://otel-collector:4318/v1/traces
```

1. 在受信任的衞國後端配置環境變數（不要放在 GitHub Pages、網頁 JavaScript、前端 `.env`）。
2. 使用更新後的 `services/weiguo/Dockerfile` 重新部署，掛載可寫入的 `/data` volume。程式預設 `LUCA_ENABLED=false`，部署本身不會開啟資料收集。
3. LUCA 只從既有 Google 會員權限讀取 `owner`，不可用公開 PWA 或 query string 當管理憑證。
4. 開啟 Detroit Studio → LUCA 監控；指標只有後端實際請求後才會出現。
5. 選用 OTLP 時，需要自行架設具網路隔離的 OpenTelemetry Collector（僅允許 `127.0.0.1`、`localhost`、`otel-collector` 的 HTTP 4318 `/v1/traces`）。不提供外部 URL 管理介面。

## 安全與隱私保證範圍

`logfire.configure(send_to_logfire=False, console=False, inspect_arguments=False, metrics=False)`，不會自動上傳到 Logfire Cloud。未設定 OTLP 時沒有網路匯出器；手動啟用 OTLP 才送出受控 metadata-only spans。

**不記錄：** 使用者原始提問、模型答覆、鏈式思考、附件內容、登入身分、家庭成員 ID、Cookie、Token、HTTP headers、request/response body、原始網址或 query、DOM、錯誤堆疊、工具回傳內容。未知或動態路由直接忽略。第三方庫及其他服務原有的日誌不在 LUCA 防護範圍，部署者仍需自行檢查。

## 範圍與局限

- 後端 LUCA 只監控 FastAPI 衞國服務的既有路由與 browser background jobs。手機端獨立紀錄僅接線已列出的 UI / 模型 / 檔案 / CREAM 異常邊界；**不會**因為列入 Detroit 模組清單就觀察 Medusa 沙盒、Cloudflare Worker 或其他獨立部署 Agent。
- 目前還沒有跨服務分散式 Trace ID、長期 p95 存檔、Token 成本與模型效能資料（後端沒有收到這些資料，不能假造）。
- 即時計數與 p95 限最近 300 筆，後端重啟會清空；SQLite 僅存日彙總，無法還原請求個資或任務內容。
- UI 的診斷為簡單閾值判定；高錯誤率可能包含 401/403 使用者權限拒絕，不能自動推論模型故障。
- LOGFIRE SDK 和 OTLP exporter 增加部署大小與啟用後執行成本。完全不需要時保持 `LUCA_ENABLED=false`。

## 驗證

```sh
python3 -m unittest discover -s services/weiguo -p 'test_*.py'
npm run test:luca
npm run build
```

測試包含 owner 權限、禁止不安全的遠端 exporter、固定路由白名單、無敏感資料返回與日彙總。CI 會跑以上測試；實際部署、資源隔離及外部 Collector 須在使用者自己的後端另行驗收。
