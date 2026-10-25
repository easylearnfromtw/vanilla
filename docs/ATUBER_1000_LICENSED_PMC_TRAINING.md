# 阿土伯 1,000 篇合法學術全文訓練驗收

正式主機工作：`.github/workflows/atuber-1000-real-fulltext-train.yml`

此工作在 GitHub Actions CPU VM **執行真正的 Qwen3-0.6B LoRA**；它不代表模型已具備臨床可靠性或消費者問答準確率保證。

## 真實資料來源與授權

- 直接從 PMC 官方 OAI-PMH / JATS `https://pmc.ncbi.nlm.nih.gov/api/oai/v1/mh/` 取得全文，不用假造文章、隨機產生句子或把摘要冒充全文。
- 每篇必須具有相同的官方 OAI PMCID、JATS PMCID、實際 body，以及明確的 CC0 或 CC BY 授權；NC、ND、SA、無授權或不一致記錄不納入。
- SQLite 保存正文段落、每段 SHA-256、作者、PMCID、DOI、來源 URL、授權來源及全文 SHA-256。
- 此次索引**僅以 1,000 篇真正核實授權全文為成功**；測試用的 1,000 個合成 fixture 不能計入這個數字。若官方 API 限速、停機或合法全文不足，工作應呈現失敗及實際篇數。

## 訓練與測試

- 啟動正式工作前，必須審核 1,000 個不重複 PMCID，且所有段落雜湊有效。
- 按整篇文章的固定 SHA-256 bucket 切分訓練與測試；測試論文的任何正文段落不參與模型 optimizer。
- 使用 CPU float32 LoRA (Qwen3-0.6B, r=4, q_proj/v_proj)，最多 1,250 步的資源保護，**本工作指定執行 1,000 個 optimizer steps**。
- 至少每篇訓練論文有一段進入權重更新；使用整篇未見論文比較訓練前後 next-token loss。
- 最後必須產生真實 `adapter_model.safetensors`，確認非零梯度、參數變化、檔案完整性及 SHA-256。
- 本次產生的是 **新的獨立實驗 adapter**，不是把前一次 100 篇 adapter 繼續微調後的結果，不能把兩次的 step 數合併聲稱為同一個模型。

## VANILLA Evidence ID

工作輸出 `vanilla-evidence-1000.jsonl`，每篇都有：
- `VE-PMC-<官方 PMCID 數字>` 獨立來源 ID。
- DOI、論文標題、作者、PMC 官方來源 URL、CC 授權、正文 SHA-256。
- `rating_status=provenance-verified-not-factual-accuracy-scored`；這**不是**已自動算出科學證據品質 100 分制評級。

出於資料最小化原則，GitHub 的公開 artifact 只保存摘要、來源 ID metadata manifest 和 LoRA adapter，不把整套論文全文公開為 artifact；如需長期保留全文，需另設具備適當授權審查、存取控制及備份策略的儲存庫。

## 成功標準與限制

請以最新的 GitHub Actions **正式 main 分支成功回條**作證，而不是只看 PR 測試成功：
`https://github.com/easylearnfromtw/vanilla/actions/workflows/atuber-1000-real-fulltext-train.yml`

成功需要同時確認：`licensed_fulltexts_indexed=1000`、`audited_licensed_papers=1000`、`actual_optimizer_steps=1000`、`weight_delta_verified=true`、並有可核實的 adapter SHA-256 與訓練和整篇測試論文的 loss 報告。

本模型尚須另行做 RAG 來源引用、撤稿核實、醫學問答題庫、幻覺率及人工覆核，**不得僅憑 loss 改善直接發佈為可信賴的醫療專家**。
