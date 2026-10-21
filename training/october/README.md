# October（阿土伯）v0.4 — Sign Well autonomous model

## v0.4：GPT-6 教師精化、節省 Token 與實測對照（2026-10-21）

**三種交付須嚴格區分：**

1. **推論行為調校**：october-persona.ts / prompts.ts 依任務產生精簡的證據優先提示詞；只有被問到人物背景才提供虛構履歷。model-profiles.ts 將 october:0.3 判定為 Qwen3 4B、october:lite 判定為 0.6B，依任務限制輸出長度。ollama.ts 增加實際 token/耗時的 onMetrics callback（不蒐集聊天內容）。Modelfile 也已精簡；使用者自己的 Ollama 主機仍需重新 create，**這不是微調基礎模型權重**。
2. **教師資料與 CPU 路由訓練**：teacher-cases.mjs 產生 **38 個 GPT-6 撰寫的 SFT 範例**及 **10 個獨立驗證題**，含財金、統計、工程、醫療證據、法遵與 UX。GitHub Actions 已用 NOODLES check-only 驗證 schema 與題目不重疊。另有 PyTorch 2,600 參數 Policy Head 真正完成 CPU 訓練，合成路由任務盲測正確率 **99.5%**；該分數不代表 Qwen 財金或醫學答題正確率。
3. **公平 A/B 測試工具**：benchmark.mjs 可在本地 Ollama 對 october:0.3 與 qwen3:4b 以相同參數、同一批 holdout 題、預熱流程進行比較，採用 provider 回傳的 prompt_eval_count / eval_count、經過時間、tokens/s 與簡單安全概念 rubric；後者僅為啟發式檢查，不能取代人工審核。

### 重現資料驗證（不需要 GPU）

~~~sh
npm run test:october-quality
npm run test:october-persona
npm run build
node training/october/teacher-cases.mjs
python training/noodles_train.py --mode sft --train training/october/generated/october-teacher-sft-train.jsonl --eval training/october/generated/october-teacher-sft-eval.jsonl --check-only
~~~

### 在使用者已安裝 Qwen3:4b 與 October 的本機執行真實模型比較

~~~sh
node training/october/benchmark.mjs --models october:0.3,qwen3:4b --cases 10 --output training/october/generated/october-benchmark.json
~~~

Benchmark 預設只允許本機 loopback Ollama API，不自動下載模型、不送到雲端，也不儲存完整 prompt／completion。數值須來自真實 Ollama 服務執行紀錄，不能把離線 mock 測試數字當作模型品質。

Windows PowerShell 的 train-qwen-qlora.ps1 已改用 October 專用 SFT，預設只做格式檢查。真正的 QLoRA 必須明確指定 -RunTraining -AcknowledgedModelLicense，需可用 CUDA 設備、授權模型權重與套件；訓練完成後需另行評估 adapter，不能自動上線。38 題遠不足以證明廣泛領域能力，更不能宣稱「最強 AI」。

正式的 Claude 比較須使用同一時間的專業新題、同等工具權限、盲法人工審查、引用來源稽核、延遲與費用數據。沒有上述實驗回執時，兩者優劣**尚未驗證**。


## 真正 October Qwen 受限規劃 → Diana → Detroit → Verifier

由使用者**明確在 Vanilla 對話指定**以下其中一個第一行指令，後接標題列與數值 CSV：

- `阿土伯規劃分析CSV`：先本機解析列數及欄數，只把**不含原始 CSV 的資料概要**送入已選定的 `october:0.3`／`october:lite` Ollama 模型，請 Qwen 產生嚴格 JSON 唯讀建議。獨立程式驗證 `decision/analyze + tool/cream + readOnly/true` 且禁止任何額外欄位，再由現有 Diana／Detroit CREAM executor 真正計算、Verifier 重算。模型建議永遠**不是權限授予**。
- `阿土伯伺服器驗證CSV`：不耗費 LLM token；使用已驗證的衞國 Google 家庭 Bearer session，且須明確為一般模式及後端選用啟用。先本機 CREAM，再以限定的 CSV 取得 Python 伺服器獨立回執，前端對照雜湊／欄位／統計；HMAC 密鑰僅在伺服器。
- `阿土伯規劃並伺服器驗證CSV`：**兩條路徑合併**，模型真正提出唯讀工具建議、本機重新驗算、後端驗證。任一步模型不可用、未登入、結果差異、私密模式、未啟用或錯誤都顯示未完成，**不會偷偷降級成假成功**。

**呼叫前提**：只有在 Vanilla 已選用可用的 October Ollama 模型，且前端公開非私密模式下，模型規劃路徑才可能真正完成；無模型時回 `OCTOBER_MODEL_NOT_SELECTED` 或 `OCTOBER_MODEL_UNAVAILABLE`。後端路徑只接受明確的第一行指令，預設關閉，與一般使用者貼 CSV 無關。後端服務不可用時絕不以假回執取代。

評估 `npm run test:october-quality`（模型 JSON 安全閘、流出 CSV 防護、SHA 與數值交叉核對、教師資料留出組、基準回歸）及完整 CI。**未連線真實 Ollama 主機時只能宣稱流程已實作與測試，不可宣稱已成功跑過現實 Qwen 的規劃、延遲或答題測試。**正式部署與 PR 合併仍受 Owner Gate 限制。

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
- 同一 `sub+task_id` 相同內容重送回覆 `replayed: true` 及相同回執，不生成第二筆；使用相同 ID 傳不同資料回 409。每位使用者每分鐘最多 **12 筆新回執**、**60 次總 POST 請求**（包括同任務重送及資料衝突），兩個額度分別依後端驗證的身分計算；入站限流在 CPU 密集 CSV 計算前完成，使用 SQLite 跨 worker 共用計數。回執保留期 30 日，過期不得查詢或以舊 ID 重播。為減少 SQLite 長期運作掃描成本，建立回執時間、租戶＋時間及請求計數時間索引。
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


## October v0.4 品質驗證與微調限制（2026-10-21）

這些證據必須分別報告，不可混為模型準確率：

- 工程 CI：run 39579723455 通過前後端測試、建置與 Detroit 發佈檢查；不代表正式部署。
- 分離訓練的 Policy Head：2,600 參數、12,000 合成訓練例；GitHub run 39577841690 記錄的合成盲測分類正確率為 99.5%。它不是 October 4B 的知識問答正確率。
- Prompt 預算：同一 CI 的五類系統提示詞靜態估算平均減少 38.3% Token；這不是 Ollama 實際計數，也不是推論速度提高 38.3%。
- Qwen / Claude 真正 A/B：尚未取得具有同題、同硬體、同條件且已完成的推論回執；不可聲稱已勝過其他模型。

訓練資料：teacher-cases.mjs 含 38 筆示範及 10 筆隔離 holdout；teacher-preferences.mjs 含 24 筆 chosen/rejected 偏好及 6 筆隔離驗證題。這些是 GPT-6 生成的實驗級合成資料，尚未經財經、醫療或法律領域專家完整審查，也不是真實使用者資料。CI 中使用 NOODLES --check-only 驗證格式與分割，絕不等於完成 Qwen 權重微調；資料量也不足以主張跨領域高準確率。

有本機 Ollama 且同時安裝 October/Qwen3 時，才可執行實際比較：

    ollama pull qwen3:4b
    ollama create october:0.3 -f training/october/Modelfile
    node training/october/benchmark.mjs --models october:0.3,qwen3:4b --cases 10 --output ./october-ab-results.json

benchmark.mjs 限定 loopback Ollama，兩組固定 temperature、top_p、seed、num_ctx、num_predict、think:false。紀錄實際 prompt_eval_count、eval_count、elapsed time 和 token/s。回答超時、截斷或錯誤視為失敗。字詞評分只是啟發式覆蓋率，不是語意正確率；報告預設不儲存提示詞或回答全文。需要外部測試題、人工雙盲評審與多次重複才可作為產品選型依據。

生成與驗證資料的命令：

    node training/october/teacher-cases.mjs
    node training/october/teacher-preferences.mjs
    python training/noodles_train.py --mode sft --train training/october/generated/october-teacher-sft-train.jsonl --eval training/october/generated/october-teacher-sft-eval.jsonl --check-only
    python training/noodles_train.py --mode dpo --train training/october/generated/october-preference-train.jsonl --eval training/october/generated/october-preference-eval.jsonl --check-only

真正執行 LoRA / DPO 需 GPU、相容基礎模型權重、合法授權、明確 --run-training 與外部基準測試。未經 Owner 審核，不合併或正式部署。


## v0.5 數值推理精化套件（開發中）

新增 `quant-benchmark.mjs`：10 類、50 題可精確核算的數學／財金挑戰。每題由固定種子建立，但題目與答案不預先發給待評測模型；只接受最終 JSON `{value, unit}`，核對數值（兩位小數容差）、單位和完整 Schema。它避免以字詞命中率冒充計算正確率。此評測涵蓋營收成長率、毛利率、轉換率、損益平衡、加權平均、中位數、樣本標準差、兩期 NPV、現金可支應月數及絕對風險降低。

新增 `quant-sft.mjs`：運用**可由確定性公式重算**的數學標籤，產生 250 筆 SFT 訓練題與 100 筆獨立亂數種子驗證題；同時檢查題目重複、驗證答案正確性，並排除 50 題 benchmark 的相同完整題目。來源是公式，不是 GPT-6／Qwen 的猜測。

**適用範圍限制：**上述訓練、驗證與 benchmark 共享相似的算式家族及指令格式，僅能評估同類型新數字的內插表現，**不是不同題型的獨立泛化能力證明**。這些資料是實驗性的狹義數值資料集，不能代表醫療、法律、投資決策的完整能力；大量 JSON 計算例若直接混入一般顧問 SFT，可能損害自然對話品質，因此目前預設**不**混入阿土伯一般 QLoRA 訓練，需明確指定不同 adapter。

生成並驗證（僅 CPU / Node，無權重更新）：

    node training/october/quant-sft.mjs
    node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test training/october/quant-benchmark.test.mjs training/october/quant-sft.test.mjs
    python training/noodles_train.py --mode sft --train training/october/generated/october-numeric-sft-train.jsonl --eval training/october/generated/october-numeric-sft-eval.jsonl --check-only

若在已準備好的合法授權 CUDA QLoRA 主機嘗試訓練獨立的數值 adapter，請明確選用：

    powershell -ExecutionPolicy Bypass -File training/october/train-qwen-qlora.ps1 -UseVerifiedNumeracyCurriculum

上述指令預設僅驗證；要實際 GPU 訓練還需 `-RunTraining -AcknowledgedModelLicense`，如需下載模型另加 `-AllowModelDownload`。對 Qwen3-0.6B 的可行性仍取決於 CUDA、VRAM、PyTorch 及依賴版本，不能保證在所有 RTX 3050 環境通過。未完成 GPU 訓練、獨立 benchmark、人工驗收前，不應替換正式模型。

對比 October / Qwen3 的窄領域數值能力（**需真正本機 Ollama，沒有執行就沒有得分**）：

    node training/october/quant-benchmark.mjs --models october:0.3,qwen3:4b --cases 50 --output ./october-quant-report.json

輸出只保留任務代碼、精確判分、時間與 token 統計，不會把題目和回答全文放進報表；考慮評測再現性，兩模型套用相同的 `think:false`、seed、輸出上限及 JSON 輸出。計算準確率不等於通用模型評分。
