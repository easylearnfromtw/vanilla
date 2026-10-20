# Victoria — Detroit 跨對話脈絡協調引擎（第一階段）

## 角色與責任
Victoria 不另行載入模型，也不是偷偷讀取外部聊天紀錄的服務。它在聊天流程中與 **Merlin** 合作：

- **Merlin**：解讀目前需求、辨識限制、必要追問與交付條件。
- **Victoria**：在**使用者明確啟用**跨對話引用後，對本裝置目前帳號的「一般模式」封存對話進行本地關鍵字比對，選出最多三段相關的舊對話節錄；沒有足夠相關性時不引用。
- **Zeus / Diana**：仍按既有權限與工具政策派工；Victoria 的歷史資料不會觸發工具，也不會形成操作授權。
- **Athena**：外來、舊對話及檔案資料都是低優先權資料；不得憑舊對話偽裝 system 指令或越過隱私界線。

## 實際資料來源與使用方法
1. 正常開啟「模型與工具」，在「自動附加資料」中勾選 **Victoria · 跨對話脈絡** 並確認說明；預設關閉。
2. 下一次一般對話回答時，Victoria 依本題對話語詞在 IndexedDB 的本機封存中搜尋相關項目。
3. 符合的節錄透過 `composeUserPrompt` 的模型上下文預算加入；模型太小時可能被截短或略過，聊天回覆的「contexts/notice」會顯示。
4. Detroit 深度分析的階段記錄會區分：找到相關封存、沒有符合資料、未授權、私密模式或資料庫讀取失敗。

過去的目前對話本身由既有的 `history` / `fitHistory` 流程傳入模型，Victoria 只補充跨封存脈絡。**目前使用者的指示永遠優先於過去的聊天內容**。

## 權限、同意及限制
- 授權開關儲存在裝置的 localStorage，key 包含目前帳號的 owner scope；不會因 A 家庭成員啟用而替 B 成員啟用。
- 查詢使用 `ArchiveStore.all(owner, "normal")`；絕不自動讀取其他家庭帳號或私密模式封存。
- 私密模式完全略過跨對話查詢。關閉開關後不再存取過去封存，也不會建立新的 Victoria 跨對話資料庫。
- 若當次選用的是雲端模型或遠端 Ollama，啟用的 Victoria 節錄可能依既有的供應商授權政策發送；開啟 Victoria 時有獨立的告知與同意。
- 只搜尋**本裝置已封存**的對話；沒有其他裝置資料、已刪除對話、沒有保存的聊天資料、其他獨立平台聊天室，也不會自動調用 ChatGPT 對話歷史。
- 採用保守的本機字詞重疊檢索，不是語意向量索引、主觀推理評分或完整長期記憶系統。
- 舊答案可能有錯、過時或脫離原始情境；檢索結果不得用來替代新證據、執行刪除／分享／付款操作，或當成後端審核授權。
- 封存最多 40 筆，由現有 ArchiveStore 保留策略決定；Victoria 不會擴大保存期限。

## 驗收與回復
- `node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/victoria.test.mjs`
- `npm run test:merlin`
- `npm run test:detroit`
- `npm run build`

停用方式：關閉「Victoria · 跨對話脈絡」開關。程式回復可移除 `src/detroit/victoria.ts`、`LocalChat.tsx` 的接線、`core.ts` 中的註冊與對應測試。此功能不需要額外外部服務。
