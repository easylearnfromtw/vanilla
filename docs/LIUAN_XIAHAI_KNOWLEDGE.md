# 柳岸書城 × 霞海書院｜Vanilla／阿土伯雙知識來源館

## 目的與頁面

Vanilla 聊天上方有兩個可直接開啟的獨立頁面，原本五項側邊欄不變：

- 書籍索引：本網站路徑加上 \`?archive=liuan\`，名稱 **柳岸書城**
- 論文索引：本網站路徑加上 \`?archive=xiahai\`，名稱 **霞海書院**

兩館有獨立畫面、搜尋欄、結果、來源權利標籤、原始 URL。書籍搜索接 Open Library 使用者發起的公共 metadata API；論文搜索接 OpenAlex 使用者發起的公共 works API。沒有 API key 時 OpenAlex 只有基本的匿名額度；超額或 API 不可用要顯示失敗，不應偽造數據。頁面沒有秘密 API key，沒有對館藏大量抓取或下載全文。初始柳岸書城展示的兩本書是先前完成全文索引驗證的古典著作；**不代表網頁已部署 19,552 本完整 SQLite 索引**。大批書目在獨立的私有/開放書目 SQLite 及已下載資料包中。要讓網站直接瀏覽全套索引，仍需部署授權且有負載限制的查詢後端或提供靜態分頁；目前此 API 尚不存在。

## 引用名稱：品牌是索引館而不是出版者

有根據的 AI 回答可用：

「引用自柳岸書城（來源索引）｜Adam Smith，《An Inquiry into the Nature and Causes of the Wealth of Nations》｜原始出處：Project Gutenberg，原書頁面連結」

「引用自霞海書院（來源索引）｜真正作者，論文名稱及年份｜原始出處：出版期刊／DOI，原始論文連結」

Vanilla 的 Markdown 渲染器支援經資料來源工具產生的 \`bookrefs\` 和 \`paperrefs\` 結構化卡，附外部來源。此卡片**不能自稱已經用正式檢索工具確認過**：結構格式本身不證明模型沒有虛構內容，使用者要可點原始 URL 查核。沒有正文權利不得抄錄整篇電子書、現代譯本或研究論文全文，也不能假裝「書名 = 學會這本書的知識」。既有 bookrefs 只展示短小必要摘錄，學習目標是自行說明觀念。

## 霞海書院資料與大學引用優先級

OpenAlex 作品索引與 arXiv 是主要公共論文來源；本期已實作從 OpenAlex 擷取作者、期刊、年份、DOI、開放取用旗標、機構名稱的資料索引，\`training/atuber-books/xiahai_papers.py\`。要本機實際從 OpenAlex 撈取小量論文資料：

~~~bash
python3 training/atuber-books/xiahai_papers.py --query "behavioral economics consumer decisions" --output training/data/xiahai-papers.sqlite3 --per-page 10 --execute
python3 training/atuber-books/xiahai_papers.py --index training/data/xiahai-papers.sqlite3 --query "consumer" --search-index --markdown-cards
~~~

OpenAlex 的 paper metadata / abstract availability 並不代表論文全文可訓練，abstract 與其他網站的內容權利要另外判定。權重僅作「**優先查找／引用**」而不是正確率保證：

| 已核實之學校排名 | 引用權重 |
| --- | --- |
| 1–100 | 5 |
| 101–300 | 4 |
| 301–500 | 3 |
| 501–700 | 2 |
| 701 名以後／排名未知 | 1 |
| 經審核的產業權威／知名專家 | 5 |

OpenAlex 的作者機構不是 QS、THE 等獨立的正式排名資料；**若無特定年份和可信排名快照，絕不把機構直接判成全球前 100**。可以日後匯入合規授權的排名資料，逐條核實；研究本身的設計、偏差、限制、研究新舊、利益衝突和專業證據級別仍然比學校名氣重要。來源：OpenAlex API 官方文件（https://help.openalex.org/api/）、其作品欄位（https://help.openalex.org/data/works/attributes/），以及 QS 排名方法說明（https://www.qs.com/insights/world-university-rankings-methodology）。

## 從「全文學習」轉成正確專業消費建議

這一版新增 \`training/atuber-books/consumer_knowledge.py\`，是一個**需有人實際審核結論**的中間管線：專業人士在確有權利的完整書籍或研究證據上，寫出知識主張、適用情境、限制、消費者問題、用自己的話撰寫的回答、原始來源 URL 及證據 SHA-256，再由另一個審查流程標記 reviewed + training_approved。不能只拿書名或尚未核對的摘要當作證據，不得自動將抓取資料當成人工核可。產出的是實際經審核的阿土伯 SFT JSONL 候選檔案；**不是直接已訓練的 Qwen adapter**。

最少 100 筆真正不同的已審核、原文權利可用的專業 QA；不足會回報未達門檻，不會生成可供訓練的檔案。範例執行方式：

~~~bash
python3 training/atuber-books/consumer_knowledge.py --reviewed-jsonl training/data/reviewed-knowledge.jsonl --approved-fulltext-index training/data/all-approved-fulltexts.sqlite3 --output training/data/atuber-consumer-qa.jsonl --execute
python3 training/atuber/train.py --dataset training/data/atuber-consumer-qa.jsonl --validate-only
# 經 Owner 明確授權且有 CUDA 硬體時，才執行真正 SFT／QLoRA
python3 training/atuber/train.py --dataset training/data/atuber-consumer-qa.jsonl --output training/outputs/consumer-advice-v1 --train --steps 180 --max-length 512
~~~

**問答品質評估**應同時看原始來源是否存在、答覆所聲稱的結論是否被證據支持、不同研究有無矛盾、具體消費者情境是否適用、是否表示不確定。尤其股票、金融、健康或心理方面，不能因學過某本書就保證建議正確或提供不適當的個別診斷／報酬保證。對於沒有可靠資料的問題，正確行為是回覆目前證據不足並說明缺少什麼。

## 目前實際上線及非上線範圍

本期 GitHub 合併會讓 SPA 內新增的兩個來源頁面跟隨網站下一次前端部署顯示；這不等於已驗證每個生產網址已完成發版。GitHub Actions 可以驗證 TypeScript 編譯及自動測試，但沒有真實 GPU 或專有全文就**不能報告 Qwen 真正學會數十萬篇論文或 19,552 本書**。本期新增的是源追溯 UI、實際即時元資料發現以及審核型知識→專業問答訓練準備流程；原有約兩本書全文試點仍是可確認的內容索引基礎。論文資料可能需要獨立保護、API key、合法全文或後端才能支持大量持續訓練。


## 對話直接查來源與消費者建議

除分館的獨立頁面，也可以在 Vanilla 對話輸入「柳岸書城 行為經濟學」或「霞海書院 behavioral economics」來觸發實際公共書目或論文元資料查詢。結果會以帶有出處的來源卡片顯示。私密模式和離線模式不會發出此第三方查詢，來源服務查詢失敗則明確回報失敗，不會自行創造 DOI。

Open Library 或 OpenAlex 的額度、跨網域請求限制可能使即時搜尋暫不可用，屆時應使用原始來源網站或經批准的 API 連線，不應將其標成成功。

泛用阿土伯對消費者的醫療、金融、心理、投資、購買等建議，現在加上額外的依據、適用條件、風險及棄權規範。這是提示層的防錯能力，不代表 GPU 已重新訓練了 Qwen 權重或已證明金融／醫療建議正確。要強化知識，必須持續累積合法全文、真正審核過的專業發現及獨立問答盲測。


**來源雜湊硬門檻**：正式輸出 Qwen SFT 候選檔案前，每一筆人工已審核專業答案必須在 `--approved-fulltext-index` 提供的私有全文資料庫內找到同一來源 ID、原始來源 URL 和完全一致的段落 SHA256。只有自填「訓練核准」或「證據已審核」而無匹配原文，不能匯出訓練資料。此檢查確保資料確曾存在，不自動證明該專業結論的因果或外部效度，仍須人類審閱。
