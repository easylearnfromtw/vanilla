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


## 第二階段：一百萬次真實更新，與書本知識學習

### 1. 書名練習 + 一百萬次小型分類器 SGD 權重更新

本次 1,000,000 次是 **實際參數 optimizer 更新步驟**，作用在小型 Unicode n-gram 線性分類器，**不是 Qwen/October 0.6B、4B、14B 或 30B 神經語言模型的權重訓練**。

~~~bash
# 先使用第一階段匯入的書目資料庫，預覽不訓練
python3 training/atuber-books/title_weight_sandbox.py \
  --database training/data/atuber-books-20261025/catalog.sqlite3 \
  --output training/data/title-sgd-1m

# 實際執行 1,000,000 個 SGD 更新步驟
python3 training/atuber-books/title_weight_sandbox.py \
  --database training/data/atuber-books-20261025/catalog.sqlite3 \
  --output training/data/title-sgd-1m --steps 1000000 --execute
~~~

產出 weights.json、training_report.json、title_holdout_questions.jsonl。分開 train-index、validation、holdout，保留書籍 ID 層級隔離，記錄實際更新次數、平均書名重複曝光、前後 cross-entropy、保留集準確率、權重 SHA256。主題分類標籤只依書名關鍵字導出，衡量的是模仿標籤的能力，不是理解書中知識。200 道作者題以真實來源及書名交叉驗證，不代表模型已回答正確，也不是 200 本完整書籍閱讀。

### 2. 匯入真正可使用的書籍全文、建立可引文答題的知識庫

NBINet 書目和國立臺灣圖書館館藏系統不會自動授權全文訓練。必須先**確認每本書的權利**，將經使用者審核的 UTF-8 正文放在 Owner 私有資料夾，並提供 JSON manifest。必填：id、title、author、source_url、content_file、content_sha256（核對本地檔的 SHA256）、rights_basis、rights_reference、reviewer，以及布林值 rights_reviewed=true 和 training_permission=true。所有原文和 SQLite 索引都必須留在本地私有儲存，不能提交 GitHub 或公開部署。

欄位格式範例（不代表已取得這本書的實際授權）：

~~~json
[
  {
    "id": "approved_book_001",
    "title": "自有教材",
    "author": "作者",
    "source_url": "https://example.org/book",
    "content_file": "approved-book.txt",
    "content_sha256": "必須替換為真實64碼SHA256",
    "rights_basis": "owned",
    "rights_reference": "可核實的著作權或書面授權證明",
    "reviewer": "Owner",
    "rights_reviewed": true,
    "training_permission": true
  }
]
~~~

~~~bash
# 有明確權利、已核對雜湊的本地全文
python3 training/atuber-books/licensed_content.py \
  --root training/data/approved-books \
  --manifest training/data/approved-books-manifest.json \
  --index training/data/approved-book-knowledge.sqlite3 --execute

# 先找書籍原文段落與來源，沒有段落則不能杜撰
python3 training/atuber-books/licensed_content.py \
  --index training/data/approved-book-knowledge.sqlite3 \
  --question "書中如何解釋通貨膨脹？"

# 經 Owner 批准並已啟動的 Ollama 主機進行證據限定回答
export ATUBER_EVAL_URL=http://127.0.0.1:11434
python3 training/atuber-books/licensed_content.py \
  --index training/data/approved-book-knowledge.sqlite3 \
  --question "書中如何解釋通貨膨脹？" --model october:ml --run-ollama
~~~

這種全文檢索稱為 RAG，**不等於 LLM 權重訓練**。若要讓 0.6B 的 LoRA 權重真正學會內容，需要人工確認原文、撰寫並審核有證據的 Q&A，交現有 training/octuber-knowledge/review.py 審查並轉為 SFT 資料，再由 Owner 在 CUDA 主機上執行 training/atuber/train.py，產生可驗證的 adapter 和保留集評測報告。當前 QLoRA 管線單次最高 5,000 步；不能拿此次小分類器的一百萬步替代。4B／14B／30B 權重不會因 GitHub CI 訓練而自動更新。

提醒：[Project Gutenberg 授權政策](https://www.gutenberg.org/policy/license) 有美國與其他法域差別，也有經授權上架但非公版的書。臺灣使用者必須個別確認正文、譯文、版本及訓練權利，不得看到公開書目便假定所有正文都能使用。
