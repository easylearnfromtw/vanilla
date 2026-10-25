# 霞海書院 × 阿土伯：實際授權論文匯入（2026-10-25）

本次是**真實來源下載與正文索引**，不是百萬篇完成訓練，也不是已經產生的 Qwen/阿土伯權重。

## GitHub Actions 實際流程

`.github/workflows/scholarly-real-pilot.yml`：
- Python 單元測試先驗證授權與來源政策（模擬資料，不宣稱真下載）。
- 在有權限的 GitHub PR / main push 從 arXiv 官方 OAI-PMH 查指定論文 `1410.6579` 的**即時 metadata**。
- 必須核實文章 ID 與明確 CC0 / CC BY 授權；若是 arXiv 預設授權、NC/ND/SA 或授權不詳，**不下載 PDF**。
- 從 arXiv 官方 HTTPS 下載 PDF，以 pypdf 真正抽取文字，保存到 SQLite books/chunks，記錄文章 URL、授權、全文 SHA-256、段落 SHA-256。
- 嘗試 OpenAlex 最多 10 筆 metadata；正式大量查詢需已設定 `OPENALEX_API_KEY` 作為 GitHub Secrets。
- 匯入報告及授權的 SQLite 資料庫保留 14 天於 GitHub Actions artifact；報告會寫出真實成功篇數、失敗原因，並且標示 `llm_optimizer_steps:0`。

**若來源 API 拒絕或下載失敗，流程將顯示失敗，不會製造假語料。**

## 現有 0.6B 模型實際訓練入口

`training/atuber-books/approved_fulltext_qlora.py` 已實作真正的 Qwen3-0.6B CUDA QLoRA。新的 SQLite 語料使用相容的 books/chunks schema。

在擁有 CUDA GPU 的可信任主機，先確認至少 20 篇已核實授權的全文、至少 100 訓練段落與足夠獨立篇章的 holdout：

~~~sh
python3 training/atuber-books/approved_fulltext_qlora.py \
 --index private/scholarly/approved-content.sqlite3 \
 --required-approved-books 20 --audit-only
~~~

**資料審核達標後，且僅在擁有 CUDA GPU 時，才執行真訓練：**

~~~sh
python3 training/atuber-books/approved_fulltext_qlora.py \
 --index private/scholarly/approved-content.sqlite3 \
 --required-approved-books 20 --steps 180 --max-length 512 \
 --output private/atuber-scholarly-qlora --train
~~~

執行時必須真的產生 safetensors adapter、訓練與 holdout loss、模型版本及來源 SHA-256；不能將資料庫索引當作神經網路微調。

## 百萬篇擴張限制與路線

OpenAlex 一百萬筆以上 metadata 應採官方資料快照，或已核實 API key 加 cursor；不能依賴匿名 API 一直翻頁。arXiv 大量 metadata 優先 OAI-PMH；應有合法授權、速率限制、續傳、去重及版本追蹤。

**「百萬篇書目索引」和「百萬篇已授權全文」是兩個完全不同的里程碑。** 只要有授權，權重 1–5 所有論文均可進訓練；引用順位才受機構與權威分級影響。未被確認的授權、醫學撤稿或低品質研究不能冒充可信的訓練資料。

參考：
https://help.openalex.org/api/authentication/
https://help.openalex.org/api/paging/
https://info.arxiv.org/help/oa/index.html
https://info.arxiv.org/help/bulk_data.html
