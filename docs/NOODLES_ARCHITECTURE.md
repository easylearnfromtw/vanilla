# NOODLES — Vanilla 跨模型持續優化引擎 v0.1

NOODLES 是 Vanilla 對話內的**跨模型評估、路由、提示詞策略與運作回饋層**，不是一個新聊天機器人，亦不是雲端共用的模型權重訓練系統。CREAM 繼續負責數據統整、圖表和統計；NOODLES 負責幫 Vanilla 改善整體回答決策。

## GitHub 參考的設計
- Langfuse（https://github.com/langfuse/langfuse）：trace、score、eval、experiment。
- Promptfoo（https://github.com/promptfoo/promptfoo）：基準測試、回歸案例、安全測試與多模型比較。
- DSPy / GEPA（https://github.com/stanfordnlp/dspy）：依據評估指標優化提示詞策略。
- LiteLLM（https://github.com/BerriAI/litellm）：多提供商模型路由、故障備援與運作可靠度。（本功能不引入其後端服務或金鑰管理。）

本次吸收**模式和原則**，非複製依賴、不部署這些服務，也不宣稱裝置端能重新訓練 Gemini／DeepSeek／Ollama 遠端權重。

## v0.1 已實作
1. **每回合／跨模型觀察**：每個非私密的聊天回合只記 task metadata；各模型產生回答時記 model ID、分類、成功／失敗、延遲。含 WebLLM、Ollama、Gemini、DeepSeek，不限 Vanilla 本機模型。
2. **品質標籤**：使用者 thumbs up/down 作為唯一直接的品質評分；倒讚後可標記「內容不正確」「沒有證據」「太長／短」「格式」「工具沒完成」，只儲存分類。
3. **因任務調整模型排序**：共用現有路由器，最多 ±12 分、分母加先驗平滑；單一回合不大幅改變選擇。成功呼叫**不等於**內容正確，只更新可靠度。
4. **跨供應商提示詞改善**：相同任務收到至少兩次明確負面原因時，在**後續允許的模型請求**加上小範圍的品質指引，例如要求證據、減少冗言、避免文字重複表格、誠實回報動作完成度。
5. **可檢視／回復**：聊天內 NOODLES 小型面板，查看每模型按任務的執行／主動評價、啟用／停用、匯出匿名 JSON、清空紀錄。
6. **資料隔離**：僅本機儲存聚合 metadata，登入者依目前 Google 帳戶分域，未登入使用分頁級 sessionStorage。私密模式不寫入 NOODLES、不使用其偏好。**同一 Google 帳戶若多人共用，這不等於家庭成員層級的完全隔離**；後續需完整家庭身分權限機制。
7. **不增加 API 費用**：只沿用已同意的模型路由，不自行呼叫第二個付費模型進行裁判或影子評估，不自動改模型 API key／GitHub 原始碼／系統規則。

## 保護原則
- 模型權重不變：每次優化的是*路由、可靠性評估與可調策略*，不是每次完成聊天就 fine-tune 第三方模型。
- 在明確使用者回饋或足夠證據前，不把某個模型「完成 API 請求」當作回答正確。
- NOODLES 生成的策略僅由安全枚舉類別決定，不帶用戶敏感內容，不由網頁的 Prompt Injection 直接控制。
- 不在背景自動將資料傳送任何第三方分析平台，也不記錄聊天內容、用戶個資、附件與金鑰。
- 原有雲端 API consent、私密模式、Google Drive 存取和 WebLLM System Prompt 順序繼續生效。

## 下一階段（**本 PR 未實作**）
- 在 opt-in 安全後端上跑真正的跨模型 A/B、LLM-as-a-judge／ground-truth 測試、影子評估、DSPy 類提示詞搜尋與成本約束的策略發佈。
- 真實多裝置的匿名安全同步；家庭成員身分完全隔離，且須用戶明確授權。
- 經簽核與測試才能更新 Vanilla 的系統提示詞或程式碼，不能未經核准自我改寫。

## 驗收
- [ ] GitHub CI 包含 `test:noodles`、既有模型回歸、CREAM 和安全測試、TypeScript/Vite build。
- [ ] iPhone PWA 實際使用四模型、同意／拒絕外部發送、私密模式；測試累積 2 個同類型問題後的策略指引。
- [ ] 完成手動「按讚、倒讚、選問題原因」、查看 NOODLES 面板及停用、匯出、清除。
- [ ] 每個帳號不交叉引用其他帳號本機記錄；訪客重開分頁不被視為已永久訓練。
