# 柳岸書城｜100 本真實歷史圖書全文索引

## 完成定義

本批擴充要求是 **100 本實際取得、具長篇正文、互不重複的歷史英文圖書**，不是 100 本書名。資料來源為獨立託管的 [QualC Gutenberg English Corpus](https://huggingface.co/datasets/nandhakumarms/qualc-gutenberg-en) Parquet 電子書檔案，原始作品連結則逐本指向 Project Gutenberg 的 /ebooks/{ID}。原始資料集標示它從 Project Gutenberg 的 RDF 目錄、電子書原文清理而來，資料及版次並未經我們逐頁校訂。

程序：`training/atuber-books/liuan_100_real_books.py` → 僅從特定英文原著歷史作者清單挑選（作者在 1950 年或之前辭世）→ 每本至少 25,000 個文字字元 → 排除純作品索引、書名標註翻譯/改寫、同書名/同內容雜湊重複 → 建立 SQLite books/chunks/FTS5，逐段 SHA256 → 將真正 100 本書及原始 URL、作者、字數、內容 SHA256 保存成 `liuan100-books.json`，另存可稽核報告。

實際 GitHub Actions： [Liuan 100 Real Historical Books](https://github.com/easylearnfromtw/vanilla/actions/workflows/liuan-100-real-books.yml)。請以該 workflow **最近一次成功實測報告** 的 `real_books_indexed`、`actual_fulltext_chunks` 為唯一完成值。任一文件缺少實際文本不計數；未滿 100 本會 **失敗**，絕不填充模擬正文。可下載 Actions artifact `liuan-100-real-historical-fulltext-index`，內含私有 staging SQLite、100 本書目 JSON 及 report JSON；暫存 artifact 保存 14 天，**不表示索引已部署在網頁伺服器**。

### 執行方式

在 GitHub Actions workflow_dispatch 或具有足夠儲存空間且能訪問 Hugging Face 的經批准電腦：

```bash
python3 -m pip install pyarrow==21.0.0
python3 -m unittest discover -s tests -p 'test_liuan_100_real_books.py' -v
python3 training/atuber-books/liuan_100_real_books.py \
  --index training/data/liuan100.sqlite3 \
  --catalog training/data/liuan100-books.json \
  --report training/data/liuan100-report.json \
  --max-shards 8 --execute
```

每份 SQLite 都儲存真正來源內容及逐段雜湊；網頁柳岸書城索引使用的是**來源書目**，不會向消費者公開顯示整本書或把藏書來源誤認為出版者。為了保留原始作者及作品歸屬，書目提供 Project Gutenberg 的 landing page 和獨立整理數據來源。

### 專業知識與權利界線

這批 **歷史圖書** 具有閱讀研究價值，但由於古典小說和原始歷史文獻的比例不固定，**不能宣稱有 100 本現代專業財經/醫療指南**。標成主題關鍵詞相符的書是書名關鍵字篩查，**不是專業內容審核分類**。對消費者回答建議時，只有經專家核對之研究證據與適用條件才能升格為可執行建議，不能靠古代醫學、投資書名或重複訓練推測。

Project Gutenberg 官網明確禁止對主站進行自動大批下載，此流程只下載第三方事先編好的 Parquet 檔：<https://www.gutenberg.org/policy/terms_of_use.html>；第三方全文的版本、譯者及當地權利仍需逐本審核，完整訓練使用權不會從「作者死亡已久」自動推定。每筆 staging 權利標為 `rights-review-required`、`training_permission=false`，新的 QLoRA audit 也明確攔截它們。**真正 Qwen3、October 權重更新＝0**。如要讓 AI 學到書本專業知識，下一階段是審核版本與權利、從正文抽取具有原始段落依據的專業知識點並人工標註，才進行 QLoRA 訓練和消費者盲測。

不要把 GitHub Actions 產生的巨量臨時資料庫放進 `public/` 靜態網站，也不要讓匿名使用者隨意下載原文。
