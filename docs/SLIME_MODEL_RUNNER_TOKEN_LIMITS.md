# Slime Model Runner · 本地與雲端共用 Token 配額

此版本新增真正的 **Slime 模型推論通道**，不是只有節點心跳或名義上的 API。公網模型 API 預設仍關閉，直到 Owner 完成本地測試與核准。

## 兩層限額

- Vanilla Gateway：每把 `vnl_` 金鑰的模型許可、每日／每月 Token、RPM、每次最多輸出 Token 和同時請求數。在 SQLite 交易內先保守預留，以防併發超額；成功後採用真實模型回報的輸入／輸出 Token 結算。模型未回報確切數據則保留預留額度，不捏造精確數值。
- Slime Model Runner：在本機 Ollama `http://127.0.0.1:11434/api/chat` 透過 `num_predict` 和 `num_ctx` 限制生成與上下文，取 `prompt_eval_count` 及 `eval_count` 回傳後端驗證／記帳。沒有精確數據就拒收其「成功」結果。

## 本地運作流程

1. 自己的 Windows／Linux／macOS 裝置安裝 Ollama 並在本機下載模型（例如 `ollama pull llama3.2:3b`）。此步驟不由 Telegram 對遠端朋友的電腦偷偷執行。
2. 用 Slime 既有一次性邀請配對節點，取得該裝置專屬 `SLIME_NODE_TOKEN`。設定 `SLIME_ENABLED=true` 和持久化 `SLIME_DB_PATH` 於 WeiGuo 服務。**注意：節點憑證不得放在網頁前端或公開 GitHub。**
3. 在 Telegram 私聊 `@SignWell_bot` 查詢 `/nodes`，找到節點完整 ID。傳送 `/slime infer <節點ID> on`，再依 Bot 給的單次確認碼回覆 `確認 xxxxxxxx`；允許推論前需告知電腦持有人外部使用者的提示將會傳送到其電腦。撤銷用 `/slime infer <節點ID> off`。
4. 由**節點本機**執行倉庫 `services/weiguo/slime_runner_agent.py`（Python 3.10+，僅使用標準函式庫）。設定本機環境變數 `VANILLA_SERVER_URL=https://YOUR-WEIGUO-DOMAIN`、`SLIME_NODE_TOKEN=<節點專屬長期秘密>`，確保 `ollama serve` 可連線。Runner 只從節點向 WeiGuo 發起 HTTPS 連線，無須向網路開放 Ollama 11434。
5. WeiGuo 在 **自架推論端就緒並完成測試後**，才設定 `VANILLA_SLIME_RUNNER_ENABLED=true`、`VANILLA_INFERENCE_MODE=slime_pull`、`VANILLA_PUBLIC_API_ENABLED=true`。未啟用時 Gateway 仍會拒絕對外推論。
6. 透過 Vanilla 的 `/v1/models` 查看此 Owner 旗下已核准、近期註冊且心跳在線的模型。API Key 可使用 `vanilla-default` 穩定別名，隨上線 Runner 的型號更新，按金鑰既有的模型權限存取。

## 安全界線

- 任一 Slime 節點即使宣稱 `role=owner`，在 Owner 明確開啟其 `inference_enabled` 前也**不能**接收提示。
- 後端發放任務時依 Google Owner `sub` 隔離，只有指定且已授權的 node bearer token 能領取與回傳；跨 Owner 節點不得領取其他人的工作。
- Runner 不拿使用者的 Vanilla API Key、Google ID 或第三方模型金鑰。任務完成後即清除資料庫中的原始提示；不保留輸入和完整回覆紀錄，僅保留最低限度的 Token／狀態 KPI。
- 本地服務固定為 `127.0.0.1:11434`，禁止任意 URL 指令與遠端程式下載。HTTPS 端點需由 Owner 自行設定，嚴禁將 Slime node token 給其他人使用。
- 已排程任務在節點停用後未必能撤回已領取的文字；高敏感內容不應送到朋友節點。這個初版沒有端對端加密到模型處理器（WeiGuo 能讀取待執行提示）。
- 不提供跨機分割單一 30B 模型權重；此版是獨立模型節點的推論派送，而非 tensor-parallel 或 pipeline-parallel。
- Windows Runner 是 Python 原始碼，**並非已簽章的 Windows 安裝包或自動安裝程式**。首次啟用需要現場完成配對和 Ollama 安裝。

## 驗收標準

- 新節點未由 Owner 核准前：模型不可見、Runner 無法註冊推論。
- 核准後：Runner 模型列表出現，API Gateway 只對已授權模型派送。
- 實際 Ollama 執行：`num_predict` 限制輸出長度，`prompt_eval_count` 和 `eval_count` 計入該 API Key KPI；超預留 Token 則不得當作成功。
- 節點取消共享、離線、管理者停用、憑證撤銷：無法領取新工作。
- CI 測試包含驗證、跨 Owner 隔離、同一筆 job 不能重複回報、Token 結算、停用與 Docker 模組打包；正式環境部署也需檢查健康、Webhook 與完全隔離的 OFF 開關。

## 一次性短碼與模型推論許可

使用 Telegram `/hub` → Slime 節點 → 產生新節點配對碼，取得 12 位 `XXXX-XXXX-XXXX` 短碼。有效 10 分鐘、單次使用；桌面安裝器會用短碼向 `/v1/slime/node/pair` 換取長期裝置 Token（原始短碼不儲存於伺服器）。Telegram 提供 Owner 專用本地生成 QR 和備用邀請連結。推論權限仍獨立，必須由 Owner 另行核准，且 Vanilla 公開 API 安全開關不會因配對成功而打開。
