# TAIDE：臺灣議題優先模型路由

Vanilla 的聊天模型路由新增臺灣本地／法律／歷史主題偏好：
- 台灣在地政策、生活與制度、台灣歷史與史料，以及法律問題（未指定國家時預設臺灣法）優先使用當前 Ollama 候選中名稱標示為 TAIDE 的 Chat 模型。
- 明確僅詢問外國法律或非臺灣歷史時，照常選擇其他模型。使用者可在模型設定關閉此偏好。
- 此為「候選排序」，不是模型安裝或保證回答正確：未接入 TAIDE 時，不虛構已連線；保留原本自架／付費額度、私密模式、單一主機同意、失敗後備援規則。
- 高風險台灣法律資訊應以法務部全國法規資料庫 https://law.moj.gov.tw/ 的現行條文、官方函釋與裁判為準。歷史爭議應區分史料與觀點。

## 官方模型與使用條件
- 官方模型來源與授權：https://www.taide.tw/public/download-model
- Llama-3.1-TAIDE-LX-8B-Chat：https://huggingface.co/taide/Llama-3.1-TAIDE-LX-8B-Chat
- Gemma-3-TAIDE-12b-Chat-2602：https://huggingface.co/taide/Gemma-3-TAIDE-12b-Chat-2602

GitHub https://github.com/taide-taiwan 的公開儲存庫主要是評測程式等，**不是模型推論 API**。正式權重需從官方允許來源取得並遵守授權，不要假定可以直接用 `ollama pull` 下載任一 TAIDE 版本。

## 真正啟用的方法
1. 在有足夠 GPU／RAM 的可信主機上載入官方 TAIDE Chat 權重。若需 GGUF 轉換／量化，需先查核相容性與授權；不要直接執行不明來源的第三方模型。
2. 以有權限的 HTTPS 私有代理暴露 Ollama 給 Vanilla；不可公開 Ollama 11434 或在 GitHub Pages 存放 API Key。
3. 在 Vanilla「Ollama · 可更換模型連線」測試主機，確認已載入的 TAIDE 模型 ID，勾選加入最多 4 個候選並儲存。
4. 按「測試模型實際回答」，再詢問「勞基法加班費如何計算？」核對訊息旁列出的來源與模型 ID。
5. 模型連線、授權、執行效率和最新法規／史料內容仍需真實驗收。

這次只提供 Vanilla 前端路由、設定與測試；沒有代為安裝權重、啟動 Ollama 服務或驗證外部推論成功。
