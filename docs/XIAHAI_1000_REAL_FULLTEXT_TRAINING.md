# 霞海書院：1000 篇真正開放授權學術全文與訓練

## 真正的執行／數量證據

以美國國家醫學圖書館提供的 **PMC Open Access** 官方 OAI-PMH API `https://pmc.ncbi.nlm.nih.gov/api/oai/v1/mh/` 的 `set=pmc-open` 和 `metadataPrefix=pmc` 取回 JATS XML 的**文章 BODY，不只標題／摘要**。完整來源和權利以每篇 `PMC<數字>`、DOI、原作者及作品頁永久連結追蹤。

本期程式 `training/scholarly/pmc_1000_fulltexts.py`：
- 僅接受 XML `<permissions><license xlink:href=...>` 正確指向 CC BY 3.0／4.0 或 CC0 1.0 的文章；不接受沒有明確授權的開放閱讀、CC BY-NC、CC BY-ND 等。
- 至少 12 段真實論文正文、4,800 字元，排除單純摘要、缺完整正文、重複 PMCID、相同正文 SHA256。
- 每一篇存標題、作者、年份、DOI、原始 URL、授權類型、原始授權連結、正文 SHA256；全文分成 1,250 字元左右的引用索引小段並逐段計算 SHA256／建立 FTS5。
- 官方 OAI 服務每次最多 10 篇，API 上限每秒 3 次且不得併發。使用單線順序請求與至少 0.55 秒間隔。發生來源錯誤有有限次重試、單一回應大小上限，**不足恰好 1,000 篇就報錯不以 metadata 補足**。
- 每輪 GitHub Actions 的最終結果必須在 `xiahai-1000-licensed-paper-bodies.report.json` 內有 **`actual_paper_fulltexts=1000`** 和實際大於 5,000 段的原文；若 run 未成功，成果就只算已完成的部分，不能聲稱全部完成。

**實際執行與核對：** [Xiahai 1000 Real Licensed Paper Fulltexts GitHub Actions](https://github.com/easylearnfromtw/vanilla/actions/workflows/xiahai-1000-real-fulltexts.yml)。

權利與政策：[PMC 官方 OAI-PMH 文件](https://pmc.ncbi.nlm.nih.gov/tools/oai/)、[PMC Article Datasets](https://pmc.ncbi.nlm.nih.gov/tools/textmining/)。別用普通爬蟲抓非 OA PMC 文章。CC BY 代表本內容在符合署名條件下可再使用，但不代表任何研究結論適用於醫療決策。資料包需保留原始作者／論文／授權出處，亦不得把整本電子書或文章當成模型回答直接貼出。

## 兩種不同的真實「訓練」

### 1. 已可在 GitHub Actions CPU 主機運行：論文全文段落檢索 SGD

`training/scholarly/pmc_fulltext_ranker.py` 會載入 **1000 篇真正全文的所有 chunks**，每篇先依 PMCID 的 SHA256 決定 train/validation/test 分割，然後從正文產生段落及查詢字詞相似／不相似的訓練配對。真正執行 **250,000 步 SGD、1,750,000 個浮點參數更新**，輸出 `passage-ranker.json` 與 `training-report.json`，附獨立論文保留測試之準確率、交叉熵及模型 SHA256。

由正文產生的查詢樣本屬於**合成配對**，代表檢索匹配訓練，**不是研究論文事實理解／消費者醫療診斷的成績**。本流程沒有偷偷執行 Qwen／October 模型參數更新。

可獨立執行（需要合法網路和預留磁碟）：

```bash
python3 training/scholarly/pmc_1000_fulltexts.py \
  --index /private/xiahai-1000-licensed-paper-bodies.sqlite3 \
  --target 1000 --max-pages 550 --from-date 2026-01-01 --execute

python3 training/scholarly/pmc_fulltext_ranker.py \
  --index /private/xiahai-1000-licensed-paper-bodies.sqlite3 \
  --output /private/xiahai-fulltext-passage-ranker \
  --steps 250000 --execute

python3 training/scholarly/pmc_1000_fulltexts.py \
  --index /private/xiahai-1000-licensed-paper-bodies.sqlite3 \
  --query 'shared decision making'
```

### 2. 需要真實 NVIDIA GPU 與人類權利確認：Qwen3-0.6B QLoRA

此版本也提供**真 GPU 訓練的資料輸入準備**：先取得以上 1000 篇全文 SQLite，再由有權利核查能力的人逐篇覆核來源、版本及授權，並針對固定的全文 SQLite SHA256 簽署 manifest：

```json
{
  "reviewer": "Human Scholarly Reviewer",
  "reviewed_at": "2026-10-25",
  "source_database_sha256": "填入實際SQLite SHA256，64個hex字元",
  "approved_papers": 1000,
  "rights_basis": "compatible-license",
  "rights_reference": "Article-level CC BY/CC0 licenses and attributions individually reviewed for intended training use",
  "edition_and_attribution_reviewed": true,
  "training_allowed_for_this_exact_corpus": true
}
```

請自行核對每篇授權、作者、歸屬和來源（**以上純為欄位格式範例，不能冒名填好當成真實人類審核**）。再在私有運算環境生成：

```bash
python3 training/scholarly/pmc_prepare_cuda.py \
  --source /private/xiahai-1000-licensed-paper-bodies.sqlite3 \
  --review /private/paper-corpus-review.json \
  --output /srv/atuber-private/approved-papers.sqlite3 --execute
```

在 GitHub Actions `Owner-only Qwen CUDA QLoRA Real Training` 工作流程以 `workflow_dispatch`、`mode=licensed-papers` 指定 GPU runner `atuber-gpu` 並使用 `atuber-gpu-approval` 對私有權限核准，模型才會對 1000 個已審核論文正文使用 Qwen3-0.6B 更新 LoRA 權重。沒有 GPU runner／審核通過之前，**Qwen GPU 訓練步數必須回報 0**。正式成功需要私有存放的 `adapter_model.safetensors`、`training-provenance.json` 和非 NaN 的不同論文保留集 loss，不得推估、偽造或混淆 CPU 小模型梯度。

## 專業建議品質

1000 篇全文不保證每篇研究的方法可靠或無偏差。要讓消費者獲得可信建議，仍需要以 DOI、完整正文證據、研究設計、樣本數、年分、統計限制、相反證據及持續更新的專業指南綜合評價；模型應能明確說不知道並把研究證據與個別醫療／投資建議區分開來。

本期只對學術文章建立**可歸屬全文索引**與**真正的檢索參數訓練**，並提供權利審核後的 QLoRA GPU 管線。不能把這項工作宣稱為已有 1000 篇經真人專家判定正確的專業指引。
