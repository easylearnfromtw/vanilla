# OCTUBER 新聞知識工程：2006–2026 × 五個市場 × 2,000 萬篇

**專案狀態（2026-10-25）**：已提供候選新聞事件探勘、去重索引、授權門檻、分市場統計及模型訓練資料匯出；**尚未取得或訓練 2,000 萬篇，沒有新增權重或 GPU 執行證據**。所有數字以實際 `report.json` 為準，不能把計畫配額視為完成量。

## 目標與定義

| 市場 | 目標新聞篇數（規劃，非已取得） | 主要語文 |
| --- | ---: | --- |
| 台灣 TW | 4,000,000 | zh-Hant |
| 中國 CN | 4,000,000 | zh-Hans |
| 日本 JP | 4,000,000 | ja |
| 韓國 KR | 4,000,000 | ko |
| 美國 US | 4,000,000 | en |
| **合計** | **20,000,000** | |

日期範圍 **2006-10-25 至 2026-10-25**，以文章實際刊出日期為準。市場由經審核的新聞出版者歸屬或文章主題欄位指定，不得單憑網域、語言或事件參與者國籍當成文章來源國。

本專案採三個不混淆的計數器：

1. **GDELT event/candidate**：事件與 URL 線索，沒有可訓練全文；一篇新聞可產生多條事件。
2. **metadata_indexed**：日期、市場、標題、新聞來源、文章原址可查證、URL 去重的新聞紀錄。
3. **rights_reviewed_unique_full_articles**：具備至少 200 字元全文、獨立全文雜湊、授權依據、具體權利證明、人工審核標記的可用樣本；這才計入 2,000 萬目標，但仍**不代表模型已訓練**。

## 真實資料來源策略

- **GDELT 1.0**：可用於 2006 年起事件回溯；2006 至 2013-03 的月檔可能缺少 SOURCEURL，所以只能建立事件史，不得把事件數加進文章數。2013-04 後日檔有來源 URL 時，可產生候選線索。官方：https://data.gdeltproject.org/events/
- **GDELT 2.0/GKG**：2015 年後多語言事件、實體、地點、語氣。可作事件鏈、交叉驗證與新聞 URL 線索，不是全文授權。官方：https://www.gdeltproject.org/
- **Common Crawl CC-NEWS**：自 2016 年的 WARC 新聞網頁供 *discovery*、合法性審查與經准許的內容抽取；檔案公開可讀**不代表原新聞全文可自由再散布或訓練**。2006–2015 的全文缺口必須依合法典藏與媒體授權補足。官方：https://commoncrawl.org/blog/news-dataset-available
- **Wikinews**：個別語種、文章授權另查；英語站 2005-09-25 至 2024-12-16 內容通常 CC BY 2.5，2024-12-16 後 CC BY 4.0，可審核匯入並保留署名與授權。參見：https://en.wikinews.org/wiki/Wikinews:Copyright
- **新聞媒體直接授權、合法歷史資料庫、原創編寫資料**：解決早期十年的缺口；必須有書面權利證明。不得繞過付費牆、停用 robots 限制或隱藏來源。

新聞報導可能有偏差或錯誤，後續模型資料應保留時點、原始來源、不同立場與更正歷史；模型在面對當代事件時仍需要即時驗證。

## 先探勘 GDELT 歷史事件（不會偷抓全文）

```bash
# 預設 dry-run，不使用網路
python3 training/octuber-news-20y/gdelt_candidates.py \
  --period 200610 --output private/octuber-news/candidates-200610.jsonl

# 明確同意下載單一歷史月檔（上限 64 MiB、20 萬事件），此月可能沒有新聞 URL
python3 training/octuber-news-20y/gdelt_candidates.py \
  --period 200610 --output private/octuber-news/candidates-200610.jsonl --execute

# 2015-05-03 日檔候選 URL；仍沒有全文，也沒有授權
python3 training/octuber-news-20y/gdelt_candidates.py \
  --period 20150503 --output private/octuber-news/candidates-20150503.jsonl --execute
```

**注意**：候選檔 `about_markets` 只由事件參與者代碼判定，不是新聞發行國；不可直接傳進下列權利審核管線冒充真正的文章。

## 經授權全文匯入（真實樣本，非虛構沙盤）

建立自己的 `private/octuber-news/input.jsonl`，每行一篇新聞，格式如下（範例是佔位文字，**不是**實際文章）：

```json
{"url":"https://publisher.example/story/001","published_at":"2020-05-06","market":"TW","title":"有來源可核實的文章標題","source":"授權媒體名稱","text":"此處放經授權且經審核的真正全文（至少200個字元）","rights_basis":"permission","rights_reference":"具體書面授權合約編號或可稽核證明","reviewed":true,"training_approved":true}
```

`rights_basis` 必須為 `owned` / `permission` / `compatible-license` 之一；若選兼容授權，需要逐篇填寫 `license`（例如 `CC-BY-4.0`），保留版權與署名要求。**程式能檢查紀錄格式，不能自行證實授權文字是真的。**未授權、未審核、未取得全文者只進 metadata 索引，正文不保存在索引庫。

```bash
python3 training/octuber-news-20y/pipeline.py \
  --input private/octuber-news/input.jsonl \
  --db private/octuber-news/articles.sqlite \
  --output private/octuber-news/pretrain-approved.jsonl \
  --report private/octuber-news/report.json

# 查看實際篇數、分國累積量及20年資料缺口
python3 training/octuber-news-20y/pipeline.py --status \
  --db private/octuber-news/articles.sqlite
```

使用 SQLite 持續去重，輸出 JSONL 是純文字 continued-pretraining 候選格式，**並非既有七欄人工編寫 SFT 格式**。不可把這個檔案直接餵給 `training/octuber-sumptuous/train.py`；那個模型需要由 `training/octuber-knowledge/review.py` 審核並轉成專用 SFT 問答。下一階段才是獨立的多語言持續預訓練（DAPT）與經審核指令微調、時間切分評測。

## 驗收條件與模型訓練界線

- 匯入不少於 **20,000,000** 篇獨立、已審核、可合法用於訓練的新聞全文（不是 GDELT 事件或僅有網址的紀錄）。
- 分市場持續報告，五區建議各達 4,000,000；基礎防偏門檻為每區至少 1,000,000。
- 2006–2026 各年度都有合格文章；時序 holdout 必須避免把未來資訊帶入過去的股市、事件預測。
- 後續以獲授權 GPU、可重現的資料雜湊、checkpoint、實際 token 計數、驗證損失、獨立多語言/事實性評測，才能寫入「已訓練」狀態。
- 新聞原文不得在 AI 回答中長篇重現，依原權利與媒體條款處理引用、歸屬與移除請求。
- 禁止把尚未通過上面條件的資料量寫進 models manifest 當成已完成的 20M corpus 訓練。

## 離線測試

```bash
python3 -m unittest discover -s tests -p 'test_octuber_news_20y.py' -v
```

此模組沒有背景排程、沒有實際大型資料下載，也沒有 GPU 自動扣費。請先以小規模已授權試料驗證，再把資料採購、歷史回填、訓練算力納入明確資源排程。
