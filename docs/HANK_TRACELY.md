# Hank × Tracely — 多輪情境回歸測試與 Ceres 警報

[Tracely-ai](https://github.com/jwuthri-cloud/Tracely-ai) (MIT) 已作為 **Hank 選用的第二種測試引擎**接線，不取代 Giskard v3、Quirinus 或 LUCA。

## 目前完成與未完成

- 新增選用 Tracely GitHub Actions job、候選 Git SHA 精確比對、CI 失敗判定、匿名 JSON 報告、Ceres Telegram 通知、離線測試與 OTel Collector 設定範例。
- **預設完全關閉**：無自架 Tracely 服務、API Key、測試 scenarios、測試 endpoint 時，不會執行真實多輪測試，更不能宣稱通過。
- 仍需操作者自行部署 Tracely（ClickHouse/PostgreSQL/Redis/MinIO）及候選 Agent；**不是**把 Tracely 裝在公開 PWA、手機或 Slime 節點。
- Tracely simulate 呼叫的是註冊的 HTTP endpoint，**不是**直接讀取 PR 程式碼。Hank 會驗證同一候選部署的 revision API 回傳該 PR SHA，但維運者仍需確保 Tracely 登記的 agent URL 指向這個候選部署。兩者不一致，就不具 PR 版本證明。

## 1. LUCA → Tracely 的安全監控模式

LUCA 現有預設為 `LUCA_ENABLED=false`，且 `LUCA_OTLP_ENDPOINT` 僅允許本機／內部 Collector；本次**不修改 LUCA 程式原有隱私保護**。

1. 將 Tracely 自架在可信主機，採正式認證，建立專屬 ingest key；生產環境不得使用其 `AUTH_MODE=dev`、`tracely_dev_key`。
2. 在和 WeiGuo 同一 private Docker network 中啟動 [Collector 範例](../deploy/hank-tracely/otel-collector.yaml)，服務名 `otel-collector`，**不要把 4318 映射到公網**。在 Collector 私密環境放 `TRACELY_API=https://your-tracely-host` 與 `TRACELY_KEY`。
3. WeiGuo 設 `LUCA_ENABLED=true`、`LUCA_OTLP_ENDPOINT=http://otel-collector:4318/v1/traces`，確認該版本的 OTel Collector 配置語法與網路隔離。
4. Collector 只放行 `luca.operation`，只保留 `component`、`operation`、`status_code`、`duration_ms`、`service.name`。不含原始 prompt、回答、用戶身分、headers、金鑰、system prompt、附件。

**重要：** LUCA metadata-only spans 只能供結構化監控與故障聚類，**不能重播語意對話或自動形成完整 AI 答案測試**。要把正式問題提升成 regression case，必須另用經 owner 明確核准的**合成／去識別化 staging 測試會話**，檢查必要輸入、fixture 不含私人資訊，再在私有 Tracely workspace 建立 case/scenario；禁止未經允許蒐集真實用戶對話。

## 2. Hank GitHub Actions 設定

GitHub Settings → Secrets and variables → Actions：

| 類型 | 設定名稱 | 用途 |
|---|---|---|
| Variable | `HANK_TRACELY_ENABLED` | 填 `true` 才啟動 |
| Variable | `HANK_TRACELY_PR_GATE_ENABLED` | 填 `true` 才對同 repo 的 PR 執行情境測試，必須先有 preview 部署 |
| Variable | `HANK_TRACELY_API` | Tracely 正式 HTTPS API 根 URL |
| Variable | `HANK_TRACELY_AGENTS` | 已在 Tracely 登記 scenario 與 endpoint 的 slug，例如 `vanilla-ai`，可逗點分隔 |
| Variable | `HANK_TRACELY_REVISION_URL` | 與 Tracely scenario agent **同一候選部署**的 HTTPS 版本 URL |
| Secret | `HANK_TRACELY_KEY` | 專屬 Tracely API 金鑰 |

版本 endpoint 須回 HTTP 200、`application/json`，格式：

```json
{"sha":"<實際部署完整 40 個小寫十六進位 Git commit SHA>"}
```

PR 的預期 SHA 為 `github.event.pull_request.head.sha`，main push 為 `github.sha`。版本不符、設定缺失、測試未完成，均視為 ERROR，絕不宣稱 PASS。測試前需完成候選部署；revision URL 只能驗證該 URL，**仍需確保 Tracely registered endpoint 指向同部署**。

Hank 仍採重大 AI 變更自動測試；小修僅能手動 `workflow_dispatch` 或在 PR 打 `ai-major` 強制。Tracely job 又受 `HANK_TRACELY_ENABLED` 控制；fork PR 不提供金鑰也不執行遠端測試。

Tracely SDK 固定於特定經審查的上游 commit，不使用浮動的第三方 action。CI 使用 `tracely simulate --agent ... --env ci --no-github`，輸出只有狀態及原因，不公開模型對話，失敗/不完整則非零退出。

**CI 紅燈不代表實際禁止合併。** 管理者仍須在 GitHub branch protection / rulesets 指定 required status checks，並驗證 skipped job 的策略；本 PR 不修改 repo 規則。

## 3. Ceres 的 Telegram 失敗通知（選用）

在 GitHub Secrets 放 `HANK_CERES_BOT_TOKEN` 與 `HANK_CERES_OWNER_CHAT_ID`；請先於既有 Ceres 驗證 chat ID 是 owner。CI 使用同一 Telegram bot，僅在 Giskard／Tracely／model live scan 失敗時發送**固定警報類別及 GitHub Actions URL**，不含測試對話、PR title、stack trace、身分資料或 API 內容。

這是 **CI → Ceres Bot 的單向通知**，沒有新增 Telegram 操作 GitHub 的權限或管理按鈕。未設定則不寄；失敗通知的傳送狀態不改變原本 AI 測試失敗判定。

## 測試與驗收

```bash
python3 -m unittest discover -s tests -p 'test_hank_tracely.py'
python3 -m unittest discover -s tests -p 'test_giskard_change_detector.py'
```

實際 staging 還須驗證同 SHA 部署、Tracely 空 scenarios 不會被視為 PASS、Collector 欄位確實只在白名單內及 Ceres 通知已送達本人。未自架配置前不能宣稱這些端到端測試已通過。
