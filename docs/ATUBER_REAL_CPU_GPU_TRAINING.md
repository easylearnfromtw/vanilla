# 阿土伯實際訓練：GitHub CPU 校準與 Owner 專用 CUDA QLoRA

## 已完成的計算與「未完成」的權重必須嚴格區分

2026-10-25 已驗證柳岸書城沙盤有 **100 本歷史英文圖書及 37,950 段原文**。原始資料未確認每本使用地區、譯者、數據整理、當地 AI 訓練適用權利，而且大部分是歷史文學，不是經專家校驗的現代臨床與財經知識。因此**不得直接用這 100 本權利待審核的全文開始 Qwen 訓練**。GitHub Pages 不是運算主機，免費 `ubuntu-latest` 是 CPU，沒有 CUDA。

本期引入兩條不同的**實際**訓練流程：

### A. 現在即可在 GitHub 免費 CPU 執行：真實書目檢索神經／統計訓練

workflow: `.github/workflows/atuber-real-source-training.yml`

真實的 100 個 Gutenberg 來源 ID＋書名＋作者從 `src/knowledge/liuan-historical-100.ts` 讀取，轉成只有事實性書目資訊的私有 SQLite（**沒有正文 chunks 表**）。現有 `fuzzy_relevance_train.py` 以 **100 萬次真正 SGD optimizer 更新、700 萬次 scalar 權重更新**在讀者可能輸入的截斷書名、作者模糊查詢配對上訓練七個參數，紀錄書籍 ID 不重複的 validation／holdout 準確率、交叉熵、ranker.json SHA256。GitHub Actions 可儲存 report.json 與 ranker.json artifact；**CPU 真實訓練 ≠ Qwen LLM 權重微調**，正負標籤由原始真實書目**合成**，不能把合成查詢準確率當真人提問或專業建議評分。

提供可重現命令：

```bash
python3 training/atuber-books/liuan_metadata_ranker_input.py \
  --source src/knowledge/liuan-historical-100.ts \
  --index /tmp/liuan-100-metadata.sqlite3 --execute
python3 training/atuber-books/fuzzy_relevance_train.py \
  --index /tmp/liuan-100-metadata.sqlite3 \
  --output /tmp/liuan-100-ranker \
  --steps 1000000 --execute
```

### B. Owner 核准 GPU 後才執行：真正 Qwen3-0.6B QLoRA

workflow: `.github/workflows/atuber-approved-cuda-qlora.yml`。**只有 workflow_dispatch + main + 指定 GPU runner + `atuber-gpu-approval` 環境審核後才啟動**。此流程不會自動購買、租用主機、啟用付費 GPU 或使用未經授權資料。

設定方式：

1. 在 GitHub 儲存庫 *Settings → Actions → Runners* 安裝、註冊可靠**私人 NVIDIA CUDA Linux self-hosted runner**，給專屬標籤 `atuber-gpu`。也可在具有資格的 Team/Enterprise Cloud 帳戶獨立配置名稱正好是 `atuber-gpu` 的 GitHub-hosted larger GPU runner，但需注意該 runner 是**一次性主機**，必須另行掛載合規私有資料與權重持久儲存，這版 workflow 假定已有上述目錄。**沒有 runner 時，工作不會開始**。
2. *Settings → Environments* 建立 `atuber-gpu-approval`，設定 required reviewers、限制僅從受信任 main 部署；選用者需知道 GitHub Actions GPU 可能收費。從 UI **人工發起** workflow_dispatch，模式先選 `audit-only`，確認 CUDA、資料與權利審核通過。沒有經本人允許不可替使用者開通或消費 GPU。
3. 在**私人 GPU 主機**預先放置受審核內容（不入 Git）於 `/srv/atuber-private/approved-books.sqlite3`；此資料庫需經 `bulk_fulltext_ingest.py` 逐筆核准，需有至少 20 本不同書且具有可靠書內正文、使用權與人工審核。**前述權利未核對的 100 本 staging SQLite 必然應被拒絕**。
4. 模式 `licensed-books` 會在真正 CUDA 節點裝所需套件，以 Qwen3-0.6B 執行 `approved_fulltext_qlora.py --train`，產生 LoRA `adapter_model.safetensors`、本機 SHA256 和不同書籍分割的 train/eval loss；**成功回條不等於已給消費者正確專業建議**。
5. `reviewed-consumer-sft` 模式使用由 `consumer_knowledge.py` 經實際段落 SHA-256、來源 URL、權利與人類專家確認後產出的**100 筆以上真人核准知識問答**，預先放在 `/srv/atuber-private/reviewed-consumer-qa.jsonl`；會在 GPU 上執行 `training/atuber/train.py --train`，並使用獨立 holdout。請依實際 `train_loss`、`eval_loss`、`adapter_sha256` 及盲測回條驗證成果，**不以提示詞或讀取書名冒充訓練**。

GPU workflow **絕不把私有電子書或訓練 adapter 上傳至公開 GitHub Actions artifacts**。輸出保留在安全的 owner runner `/srv/atuber-private/outputs/<GITHUB_RUN_ID>-...`；如需線上推論，須由具有權限的運營者額外安裝、評測和部署該權重版本。此版沒有「30B 模型自動訓練」；16 GB NVIDIA T4 可嘗試 0.6B QLoRA，30B 仍需經硬體、量化、分散式策略評估。

### 評量：避免模型變得更自信卻更不準確

* **索引／找來源**：正確書名、作者、來源 ID、ISBN/DOI、引用區間，實際真人模糊提問召回率，應在獨立無洩漏資料上測試。
* **概念理解／消費者建議**：經專業審核的問答、反例、不確定性，金融與健康要核對新研究、時效、相關風險及具體適用條件，沒有證據必須回答不知道。
* **LLM 語言模型訓練**：只有在實際 CUDA 主機上完成 optimizer updates、有 adapter safetensors、SHA256 與有限 loss，才標示「GPU 真正訓練完成」。GitHub 行為測試、權重模擬、CPU 七參數 ranker 都不算 Qwen 微調。

GitHub 官方 GPU Larger Runners 規格參考：<https://docs.github.com/en/actions/reference/runners/larger-runners>；一般 standard runners: <https://docs.github.com/en/actions/reference/runners/github-hosted-runners>。

**注意：此 workflow 已存在不等於 runner 已存在，不等於租用成功，不等於 GPU 已訓練。**
