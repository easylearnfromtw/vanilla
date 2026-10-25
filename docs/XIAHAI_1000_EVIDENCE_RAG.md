# 霞海書院｜1,000 篇已驗證論文真正進入來源檢索與阿土伯提示

## 原始證據與可追溯資料

本專案的 1,000 篇 CC BY PMC 開放全文與 41,796 個段落由 2026-10-25 真實成功的 [GitHub Actions](https://github.com/easylearnfromtw/vanilla/actions/runs/40168229489) 產生，完整 SQLite 保存在 artifact ID `12588893981`。其實際來源 SHA256、PMCID、DOI、作者、授權連結、每段 SHA256 均可核驗。原文來源為 PMC 官方 OAI-PMH，不是從 OpenAlex metadata 當作讀過全文。

新增 `training/scholarly/publish_xiahai_evidence.py` 將完整 SQLite 真正逐段核對 SHA256，匯出：

- `manifest.json`：剛好 1,000 個原文章 PMCID、作者、DOI、CC 授權和從完整原文計算的檢索字詞（**不包含整篇全文**）。
- `shard-00.json` 至 `shard-09.json`：每卷 100 篇，每篇最多 3 個原文短片段、每片段最多 260 個字元，包含原始 `chunk_id`／`position`／`chunk_sha256`。
- `export-report.json`：所有 1,000 篇原文檢驗與輸出雜湊、引用片段統計。

這是**完整文章已被核對索引後產出的網頁用精簡證據快照**，公開供檢索的只是短節錄，不是 1,000 篇全文內容重新發布。仍須尊重 CC BY 引用歸屬與原出版商授權。

### 發佈流程

GitHub [Xiahai Verified Evidence Pack](https://github.com/easylearnfromtw/vanilla/actions/workflows/xiahai-evidence-publish.yml) workflow 分開進行：
1. PR 上以唯讀 token 從已成功的 corpus artifact 取得真正全文 SQLite，執行 1,000 篇正文 Hash 校驗、精簡 excerpt 產生、完全零假造段落測試，成果封存到 Actions artifact。
2. **合併 main** 後同流程帶 `contents: write`，由 GitHub Actions bot 將經過上述稽核的 **精簡** `public/evidence/xiahai-1000/*.json` 提交回 `main`。只在尚未存在清單時第一次提交。後續不需要靠 14 天期的舊大型 artifact 供使用者瀏覽。若分支保護拒絕 bot push，請從該次生成的 evidence artifact 由有權限之管理者上傳至上述靜態路徑，否則前端會明確顯示「證據快照尚未發布」。

完全不把秘密金鑰、私有帳號及未核准全文推到 GitHub Pages。真實全文 SQLite 不包含在前端包裡。

### AI 實際使用方式

- 在 <https://easylearnfromtw.github.io/vanilla/?academy=xiahai> 選 **「1,000 篇原文節錄」**，以**英文**研究關鍵詞查找。結果逐篇呈現原始出處、作者、DOI、CC 授權、段落 ID、原文短節錄。
- 在 Vanilla 對話中輸入 `霞海全文 shared decision making` 或 `霞海論文問答 clinical risk communication`：程式會先讀取站內已提交的來源快照、驗證剛好 1,000 篇版本及分卷，再將實際可追溯的節錄加進阿土伯的提示脈絡，交由現有的本機／遠端可用模型生成回答。**不代表 Qwen 權重因這次輸入而更新。**
- 沒有檢索命中、快照尚未部署、來源不通或處於私密模式時，系統應明確說明，而不是以可能不存在的論文和 DOI 推測答案。
- 同樣保留 OpenAlex **即時書目**模式，不混淆與事先讀取的 PMC 正文證據庫。

### 評測與權利的限制

- Python 驗證：逐篇真實 body SHA、每個選用 chunk SHA、1000 個 PMCID、恰好 10 卷、一卷 100 篇；偽造節錄／資料不足均必須失敗。
- Node 驗證：正確原文章 URL、授權連結、來源排名、引用顯示、匿名回答的拒絕流程。
- 原本 99.987% 的結果僅屬段落文本相似性合成測試，**並非真實論文理解、臨床驗證、醫療諮詢或消費者建議的正確率**。短節錄能支持查核原文與形成專業研究的起點，不能替代整篇方法、樣本偏差、統計及最新醫療指引的專家評讀。
- **沒有執行 Qwen3 GPU LLM optimizer steps，也沒有產生新 LLM adapter**。本期是 RAG 及引文可追溯的知識串接。
