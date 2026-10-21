# October（阿土伯）v0.3 — Sign Well autonomous model

## 阿土伯、爾雅、維納斯角色契約（2026-10-21）

[PERSONA_DESIGN_CONTRACT.md](PERSONA_DESIGN_CONTRACT.md) 由使用者正式指定：阿土伯是誠懇、親切而有專業判斷的虛構企業顧問／專案經理，Detroit 負責受授權執行、阿土伯負責可驗證建議與協調；爾雅維持精準自然、避免囉嗦；維納斯以包豪斯、iOS、低調毛玻璃及資料可視化品質把關。角色的學歷、執照、政商職位及夫妻關係**皆為虛構世界觀，不是真實身份或執業證明**。

- `src/ai/october-persona.ts` + `src/ai/prompts.ts` + `src/ai/ollama.ts`：只有明確選用 `october:*` 模型才插入專屬角色提示，其他 Vanilla 助理及結構化 JSON 輸出不受影響。
- `src/erya/humanize.ts`：阿土伯語氣、忠於原文及數字來源。
- `src/venus/presentation.ts` + `presentation.css`：內容優先、專業網頁／平面設計標準、無障礙與深淺模式。
- `tests/october-persona.test.mjs`：回歸測試。執行 `npm run test:october-persona`；再執行 `npm run test:erya`、`npm run test:chat-ui`、`npm run build` 進行相容性驗收。

修改 GitHub `Modelfile` **不會自動更新你已安裝的 October 模型**。於已安裝 Ollama 且取得最新版檔案的設備重新執行：

```sh
ollama create october:0.3 -f training/october/Modelfile
# 若使用低 VRAM 模型
ollama create october:lite -f training/october/Modelfile.lite
```

這只更新 Ollama 模型配置／提示詞，不代表底層 Qwen 權重被重新訓練、正式 Detroit Agent 或背景任務已上線；正式服務需要獨立的 CI／功能／權限與 Owner Gate 驗收。

## 50 題正式決策與交付文件（2026-10-21）

50 個決策槽位已完成訪談：**49 題由使用者確認，Q24 略過且未經另行確認不得自動補選**。第 50 題採 **D：證據驅動的分階段交付與產品驗收治理**。

- [DECISIONS_50.md](DECISIONS_50.md)：49 項確定的產品決策及 Q24 skipped。
- [ARCHITECTURE_DELIVERY_PLAN.md](ARCHITECTURE_DELIVERY_PLAN.md)：系統架構依賴、實況證據、MVP 定義、M0–M7 Gate、Owner 權限與驗收規則。
- [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md)：Q01–Q50 追蹤矩陣、驗收焦點、實作／測試／部署狀態定義。
- [IMPLEMENTATION_BACKLOG.md](IMPLEMENTATION_BACKLOG.md)：OC-000–OC-023 共 24 個候選工程 Epic，包含優先級、依賴、拒絕／復原測試與 DoD。
- [OC000_BASELINE_20261021.md](OC000_BASELINE_20261021.md)：第一輪只讀程式盤點、已知 P0 權限落差（含 Self-Build 舊有前端 Draft PR 入口）及尚未完成的 runtime 驗收。
- [delivery-gate.mjs](delivery-gate.mjs) 與 [delivery-gate.test.mjs](delivery-gate.test.mjs)：用 `npm run test:october-delivery` 執行**文件治理**負面測試，不代表完整 October、Ceres 或 Slime 已通過端到端測試。

**狀態界線**：以上是 GitHub 上的設計與工程 Backlog，**並不證明** October 的完整自主 Agent、Slime 多機 30B、Ceres 全域管理、SDK、真實訂閱收費、跨平台安裝器或跨平台資料移轉已正式可用。依每項程式碼、測試、真正 Provider Receipt 與部署記錄逐一更新狀態。Self-Build 僅可信後端背景可觸發；全域高風險操作仍需本人 Ceres Telegram 核准。

Official independent model ID: `october:0.3`. Display name: **October（阿土伯）**.

October combines three components. **Ollama LLM**: configuration based on `qwen3:4b` for economic, management, financial, accounting, and actuarial planning; foundation weights NOT yet fine-tuned. **Trained policy head**: independent supervised MLP learns permitted mock task decision patterns. **Detroit scoped runtime**: proposed future integration; requires server-verified authorization, durable scheduling, real tool execution, audit and policy checks. In this pull request the policy is a simulated, read-only recommendation, NOT a commercial job executor.

## Real learning completed (submodel, not base LLM)

The CPU-trained classification policy head learned from **12,000 synthetic scenarios**, with 1,600 validation cases and 2,000 unseen synthetic hold-outs, over 55 epochs. MLP: 15 features, 48 and 32 hidden units, 8 output classes, **2,600 trained parameters**. Before training blind accuracy was **10.15%**; afterward **99.50%** (cross-entropy 0.01937). These numbers ONLY apply to generated task-decision labels, not accounting/actuarial reasoning or actual customer action outcomes. This is genuine supervised weight learning, but not LoRA fine-tuning of Qwen.

Reproduce (CPU, after installing PyTorch):
```sh
python training/october/train_policy.py --output training/october/weights/october-policy-v0.1.json
node --test training/october/policy.test.mjs
node training/october/policy.mjs
```

The training script exports portable JSON weights. Download the verified, already-trained weight file separately from the October archive provided in ChatGPT; the GitHub training workflow can also generate model artifacts. The JS policy always enforces deterministic scope/tenant/due/privileged gates, never grants execution rights.

## October 認證後端回執（獨立選用的候選功能，預設 OFF）

本分支新增 `services/weiguo/october_readonly.py`，整合進現有 FastAPI `app.py`。此後端與瀏覽器本機 October→Diana→Detroit→Verifier 是**兩個不同執行環境**，不能把前端計算視為已自動送到伺服器。只有部署、驗證設定且使用者主動呼叫新 API，後端才會真正執行 Python 唯讀 CSV 核算並建立可查詢回執。

- `POST /v1/family/october/csv`：以衞國短效 Google 家庭 Bearer session 驗證真正 `sub`；只允許 `owner/member`，Ceres Gmail ACL 強制開啟時須具備 `chat` scope。只接受固定 `csv-descriptive-statistics`、`task_id`、`source`、最多 200 KB CSV；不接受前端自報 tenant/role/tool/script。CSV 不會當程式碼執行。
- `GET /v1/family/october/receipts/{task_id}`：只允許相同經驗證 `sub` 查詢任務 metadata，跨租戶回 404；DB 僅保存原始 CSV 的 SHA-256、報表 digest、任務 ID、時間與 HMAC 簽章，**不持久保存原始 CSV／統計輸出**。
- 同一 `sub+task_id` 相同內容重送回覆 `replayed: true` 及相同回執，不生成第二筆；使用相同 ID 傳不同資料回 409。每位使用者每分鐘最多 12 筆新回執，保留期 30 日。
- 結果來自後端 Python 標準程式的真正本機數值核算並核對，並非根據瀏覽器回傳的 `verified`、模型文字或虛構 provider receipt。這是 server-authenticated receipt，**不代表多步 durable DAG、完整工具授權或 24/7 背景運作**。

必要伺服器配置（僅後端環境／secret manager；切勿放進瀏覽器或 Git）：

```dotenv
OCTOBER_SERVER_READONLY_ENABLED=true
OCTOBER_RECEIPT_SECRET=<independent-random-at-least-32-characters>
```

`OCTOBER_RECEIPT_SECRET` 必須與 `WEIGUO_SESSION_SECRET`、`WEIGUO_ADMIN_TOKEN` 不同；未設定或不符合規則時，後端回 503，絕不降級為無簽章的成功。伺服器必須配置既有 Google 登入、獨立簽章 Session、家庭／Gmail ACL、TLS、持久化 `CERES_DB_PATH`（預設暫存路徑不適合正式部署）；密鑰輪換會使舊回執無法通過目前的驗簽，需制訂輪換與留存程序。新 API **目前未配置、未對外開放**。

端對端驗收命令：

```sh
python3 -m unittest discover -s services/weiguo -p 'test_october_readonly.py'
# 以及完整衞國 suite
python3 -m unittest discover -s services/weiguo -p 'test_*.py'
npm run test:october-readonly
npm run build
```

所有測試結果須看本 PR 最新 commit 的 GitHub Actions / 真實服務回執；CI 通過也**不等於**已建立正式線上服務。正式發佈仍依 Ceres Owner 指定版本核准、撤權演練與 rollback gate。

## October OC-003/OC-004/OC-005｜第一個本機唯讀垂直切片（2026-10-21）

開發分支新增 `src/detroit/october-readonly.ts`，並將 `src/local-ai/LocalChat.tsx` 的「貼上 CSV」路徑接入。流程只處理明確的 `csv-descriptive-statistics` 任務：

`October 結構化任務檢查（無 LLM）→ Diana 確認 cream 白名單 → Detroit Capability Bus 呼叫原有本機 CREAM executor → 獨立 Verifier 以 Welford 演算法重算數值 → verified / blocked / failed`。

- 真實執行：透過現有 `detroitBus.execute("cream", …)` 取得本機 CREAM 的實際執行回執；不是模型假想的工具結果。保留原先 CSV 視覺化與明確要求時的本機匯出；**只有核驗後**，一般模式才會依既有使用者設定嘗試保存 CREAM 歷史；私密模式不持久化。
- 驗證邊界：驗算欄位、列數、預覽、n、缺失、加總、平均、中位數、極值、樣本標準差與可見點數；無數值欄、來源被竄改、報表失配、執行失敗或中止都不提供已驗證報告。**這不是外部內容語意正確性的保證**；來源與 CSV 數字仍需由使用者核對。
- 安全邊界：僅瀏覽器同源本機資料；不連外、不讀私人帳號、不呼叫 Qwen、不支付費用、不啟動插件寫入、不啟動 Self-Build；`modelInvoked: false` 清楚標明此階段是確定性規劃，並非 October 模型真的進行 LLM tool calling。
- 可追查欄位：`taskId`、`runId`、四階段狀態、固定理由碼、唯讀執行範圍；流程稽核狀態不複製整份私密 CSV 或例外訊息。這不是 durable server receipt / 独立身份信任根。
- 回歸測試：`npm run test:october-readonly`（12 個案例），已加入 `.github/workflows/ci.yml`。需要在 CI runner 確認 PASS 與 `npm run build` 之後才能將 verification 標為 passed。

**目前是 M1 的前端本機部分切片，不是已完成完整 M1**。仍缺可信後端身份與跨租戶 ACL、真實授權後端執行器、耐久 Task/Step Receipt、Provider 級重試及冪等、Backend Verifier／Audit，及 Ceres Owner 高風險版本核准。正式部署保持關閉。GitHub PR 目前未合併；不得將「已提交 code」等同正式上線。

## October P0 安全預檢（2026-10-21）

`training/october/policy.mjs` 現在先根據可信後端 context 做確定性的 tenant/scope/due/privilege/sensitivity 檢查，再決定是否需要讀取訓練權重。未授權、跨租戶、未到期、高權限情形均不依賴 Ollama/GPU/權重，亦不允許後續模型信心覆寫。高風險旗標必須是布林值；非布林值視為輸入錯誤，拒絕推論。

權重檔缺失／受損、分類不在允許集合、推論信心不足時，以 `ESCALATE` 回報且 `authorizedToExecute: false`。回傳新增 `inferenceUsed`，純規則阻擋或權重不可用時 `confidence: null`，不得對外顯示為已完成模型推論。**這仍只是一個離線模擬決策元件，不是可信後端的授權系統，也沒有實際工具執行**；`ctx.actorTenantId` 和 `ctx.scopes` 必須由未來受信的後端填入，不得取信模型字串或前端傳入身份。

不需要權重或網路即可跑安全負例：

```sh
node --test training/october/policy.preflight.test.mjs
```

本次於 Node.js v22.16.0 使用與 GitHub 相同 blob SHA 的源碼及測試，在隔離工作目錄執行 **8/8 PASS**：
- `policy.mjs` SHA：`3321c626e778114d998758b6e908d9fcd3dc7315`
- `policy.preflight.test.mjs` SHA：`786ab8b3df285250d30bd53b30b814bea0f53077`

CI 的 October training workflow 已加入此安全測試，安排在 PyTorch 安裝及 CPU 權重訓練之前。GitHub CI 是否成功、真實權重盲測、`npm run build`、Detroit 接入、Ceres 授權與正式部署，須看各自執行回執，不因本次單元測試通過而推定。

## Ollama local model

```sh
ollama pull qwen3:4b
ollama create october:0.3 -f training/october/Modelfile
ollama run october:0.3
```

This creates an independent named Ollama configuration only. The trained task policy must be routed by Detroit separately; it is NOT merged into Qwen weights by this command.

## Full Qwen LoRA / QLoRA learning still requires a GPU

Sandbox educational tasks and separated datasets live in `training/agent_sandbox/`. Run `node training/agent_sandbox/integrated-dataset.mjs` and `node training/agent_sandbox/to-noodles.mjs`, then review before submitting to `training/noodles_train.py` on a GPU host. Suggested first checkpoint: `Qwen/Qwen3-0.6B` (Apache-2.0). Existing trainer provides `--check-only` and explicit `--run-training` modes, but GPU execution is unverified; 4B requires additional VRAM. This environment had no GPU, Hugging Face model weights or network download; no Qwen LoRA is claimed.

Use a matched base checkpoint and validate target Ollama import; do not assume PEFT adapters can be added to arbitrary quantized runtimes. Consult current official docs: https://docs.ollama.com/modelfile and https://docs.ollama.com/import.

## Windows install / low-VRAM alternative

PowerShell after installing Ollama:

```powershell
powershell -ExecutionPolicy Bypass -File training/october/install-october.ps1
```

If 4B is too large for your hardware:

```sh
ollama pull qwen3:0.6b
ollama create october:lite -f training/october/Modelfile.lite
ollama run october:lite
```

**The 2,600 learned policy-head weights are a separate module**, not inside the Ollama base model. GitHub action [October Policy Real Training](https://github.com/easylearnfromtw/vanilla/actions/runs/39420897057) has successfully re-trained the component on a GitHub CPU runner and published `october-policy-cpu-trained-v0.1` (download artifact from run details; expires after retention period).

## Commercial safeguards

Model classification is never authorization. Backend identity, per-tenant checks, real scheduler persistence, scoped tools, audit, idempotency, replay, manual approval for high impact operations, emergency stop and data provenance are required before any real customer use. No customer data or regulated financial transaction in this training corpus.
