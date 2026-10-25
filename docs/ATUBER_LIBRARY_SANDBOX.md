# 阿土伯／October：圖書館書目沙盤

## 來源及權利界線

- [國立臺灣圖書館館藏查詢](https://cis2.ntl.edu.tw/)：人工檢索、館藏核對。**不**對網站進行大量爬取、不繞過登入或付費服務。
- [NBINet 圖書聯合目錄（政府開放資料）](https://data.gov.tw/dataset/7502)：合法開放的**書目 CSV**，頁面標示政府資料開放授權條款第 1 版；含各合作館，**不**保證每筆由國立臺灣圖書館所藏。
- [國家圖書館館藏書目資訊（政府開放資料）](https://data.gov.tw/dataset/27311)：另一個開放書目資料來源，與國立臺灣圖書館館藏系統**不是同一機構**。

以上僅證明可使用符合其條款的**書目欄位**，不證明可下載／重新訓練專有書籍正文、封面、電子書或付費內容。

## 目標數量，不是已完成訓練數量

| 分組 | 不重複書目目標 |
| --- | ---: |
| 經濟 economics | 20,000 |
| 金融 finance | 20,000 |
| 股票 stocks | 20,000 |
| 心理 psychology | 20,000 |
| 哲學 philosophy | 20,000 |
| 中文 zh 延伸閱讀 | 5,000 |
| 英文 en 延伸閱讀 | 5,000 |
| **總計** | **110,000** |

ISBN 優先去重；一筆只計入一個主要分組，跨領域保留次要標籤。五個主題採書名／如有提供的主題欄位比對，需人工抽樣檢查分類精確率；語言若書目已給定其他語文，不會依書名擅自改標中英文。若輸入 CSV 沒有足夠項目，報告將顯示實際筆數與缺口，**絕不造假灌滿 110,000**。

## 操作（在授權的 Owner 私有電腦執行）

從上述官方資料頁手動下載 CSV 至 Git 不追蹤的 training/data/ 目錄。Python 3.10+，不需要額外套件。

~~~bash
# Dry-run：不讀取資料、不聯網
python3 training/atuber-books/catalog_sandbox.py \
  --csv training/data/nbinet.csv --source nbinet \
  --output training/data/atuber-books-20261025

# 建立可稽核 SQLite 書目沙盤；這不是 LLM 權重訓練
python3 training/atuber-books/catalog_sandbox.py \
  --csv training/data/nbinet.csv --source nbinet \
  --output training/data/atuber-books-20261025 \
  --topic-target 100000 --language-target 10000 --execute

# 本機查詢書目；模型呼叫次數 0
python3 training/atuber-books/ask_atuber.py \
  --database training/data/atuber-books-20261025/catalog.sqlite3 \
  --search 金融

# 只有你允許的 Ollama 主機已安裝 october:ml 才真正推論
export ATUBER_EVAL_URL=http://127.0.0.1:11434
python3 training/atuber-books/ask_atuber.py \
  --database training/data/atuber-books-20261025/catalog.sqlite3 \
  --search 金融 --question '列出金融相關書目及其作者，附來源' \
  --model october:ml --run

# 無網路回歸測試
python3 -m unittest discover -s tests -p 'test_atuber_books_sandbox.py'
~~~

如使用 HTTPS 反向代理，可在執行環境以 ATUBER_EVAL_TOKEN 設定必要權杖，**不可提交 Git**。不得在公網暴露原生 Ollama 11434。只有正式接到主機並回覆有效答案才算模型推論成功，GitHub CI 通過不是推論成功。

輸出到資料目錄（不得覆寫）：catalog.sqlite3、metadata_holdout.jsonl、report.json。每筆明確記錄 access_level=metadata-only、training_approved=0、來源、語文證據、書目 train-index／validation／holdout 穩定切分。留測題只驗證作者書目歸屬，**不代表已學會書中知識**。報告會標明 book_full_texts_read=0 和 weight_updates=0。

要進入真正的書籍內容學習／QLoRA，需**另外**取得明確可用於該用途的全文、自有或授權內容，進入現有 training/octuber-knowledge/review.py 人工授權與雜湊審核；之後再使用已授權 GPU 訓練並完成專業問答基準的盲測。不可因書目、索引或 PR 部署完成就宣稱已閱讀 110,000 本或模型能力提高。
