# 阿土伯三層模型部署（Phase 2）

本專案把 **阿土伯對話主控** 分為：iPhone Qwen3 0.6B、已核准的自架 Ollama 中小型 4B、中大型 14B、大型 30B (MoE)。三個型號共用阿土伯的身份與權限邏輯，但**不是新訓練的權重或融合後的單一模型**。

| 層級 | 設定名稱 | 官方基底 | 模型權重檔（約） | 預設用途 |
|---|---|---|---|---|
| 手機微型 | Qwen3-0.6B-q4f16_1-MLC | Qwen3 0.6B | WebLLM 下載 | 離線聊天 |
| 中小型 | october:sm | qwen3:4b | 2.5GB | 寫作、一般工作 |
| 中大型 | october:ml | qwen3:14b | 9.3GB | 財經、研究、數學 |
| 大型 | october:lg | qwen3:30b | 19GB | 程式與複雜推理 |

Ollama 官方規格：<https://ollama.com/library/qwen3>。以上是量化權重**下載檔案**大小，不是實際 VRAM 或總 RAM 消耗。30B 的 19GB 不適合直接全部塞入 6GB GPU；Ollama 可部分 CPU offload，但可能很慢。分散多台 3B 節點**不會**自動拼成一個 30B 模型。

## 使用者自行授權的主機上安裝

不在公開網站、CI 或朋友電腦上自動下載權重。使用已取得持有人同意的 Ollama 主機：

```sh
# 於 repo 根目錄，在你授權的主機執行；每條命令會使用網路/磁碟
ollama pull qwen3:4b
ollama create october:sm -f deployment/ollama/Modelfile.atuber-sm

ollama pull qwen3:14b
ollama create october:ml -f deployment/ollama/Modelfile.atuber-ml

ollama pull qwen3:30b
ollama create october:lg -f deployment/ollama/Modelfile.atuber-lg

ollama list
ollama run october:sm "1+1等於幾？"
```

在 Vanilla 的 **Ollama 連線設定** 設定使用者批准的 HTTPS 代理，模型欄位加入 `october:sm`、`october:ml`、`october:lg`。不得將 11434 直接暴露公網，也不能把 API token 提交 GitHub。裝置本地 0.6B 繼續由瀏覽器手動下載。

## 自動路由（只有已登記且可連線的型號才真正能推論）

- casual/general：裝置端優先，否則最小已配置 October 主機；
- writing：中小型優先；
- analysis（含財經）：中大型優先；
- code：大型優先；
- 已判斷不適合 0.6B 的事實問題：中大型優先。
- 目標型號未配置則改用 **同一家且已核准的阿土伯主機模型**，不可默默叫用第三方付費模型。
- Private / local-only：只准裝置端 0.6B；不足以作答則保守拒絕。
- 使用既有 Ollama host 配置路由，不表示 `ollama list` 已通過、模型已下載、推論服務在線或 Token 額度足夠。**成功生成回覆才是上線驗證。**

### 模型服務與配額

外部 API 應經由既有 Vanilla Owner API + Ceres / Slime 的 Owner 授權與 Token 上限檢查（見 `docs/SLIME_MODEL_RUNNER_TOKEN_LIMITS.md`）。本期沒有啟動對外公共推論、購買 GPU、出租算力或繞過 Owner 核准。真實 Live Benchmark 尚須接通主機後執行。

### 上線檢核

1. GitHub CI `npm run test:model-tuning` 應通過三層模型政策回歸。
2. 每台裝置確認 `ollama list`、對應模型與 HTTPS 代理連線。
3. 用同題盲測輸出醫學／法律／財經／程式成績，記錄模型、硬體、版本、延遲、來源與失敗率；目前沒有聲稱專業能力提升。
4. 經 Owner 明確啟用，再逐步上線模型服務與配額。因模型檔可能很大，啟用前先檢查磁碟、RAM、散熱與電費。

## 實際主機預檢與推論驗證（Phase 2.1）

在已授權、且安裝 Node.js 22 以上的 Ollama 主機，從本倉庫執行：

```bash
npm run preflight:atuber
```

這是**唯讀檢查**：偵測主機實體記憶體、目前工作目錄所在磁碟剩餘空間、可辨識的 NVIDIA GPU，以及本機 `127.0.0.1:11434/api/tags` 中已安裝的模型。不會下載模型、啟用公開 API、取得任何 Slime node token 或代替使用者租用 GPU。

- 保守 RAM 建議：4B ≥6GiB、14B ≥16GiB、30B ≥32GiB；實際硬體需求仍依量化、上下文、GPU offload 和其他負載而異。
- 報告的 `readyForInferenceCheck=true` 只表示通過**初步資源與列表檢查**；`inferenceVerified` 永遠為 `false`，必須由真實生成另行確認。
- 磁碟預檢是保守容量估計，不能代替 NVIDIA VRAM、散熱或長時間壓力測試。
- 如主機由朋友持有，必須取得其明確同意，不能遠端私自安裝權重。
- 在 Vanilla 模型面板確認已設定自架 HTTPS Ollama 主機後，按每個級距旁的「**實際推論測試**」。系統逐一檢查 `/api/tags` 中模型別名及 `/api/chat` 的實際生成回覆，回報耗時；此測試需要使用者自行按鈕觸發，不會背景自動耗算力。
- 正式對外 API 與 Token 配額仍受 Slime/Ceres 權限和 `VANILLA_PUBLIC_API_ENABLED` 開關控制。

目前的財經測試仍採 `npm run eval:atuber-finance -- --run`，可產生原始答案與延遲；**人工核對 rubric 前不可聲稱已獲得財經測試總分**。未下載的 14B／30B 模型不得因 GitHub Pages 部署成功而標成已就緒。
