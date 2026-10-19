# Diana — Detroit 對話工具總調度

Diana 是 Detroit 的對話入口與能力選擇器，不是另外載入的 AI 模型。Merlin 負責理解任務，Diana 負責選擇現有可用工具，Athena 與 Holy Roman Empire 維持權限邊界，Zeus 負責實際執行及運算資源路由。

## 指令

- /Diana：列出已實作、適配器與規劃中的 Detroit 工具。
- /Diana 幫我分析長期數據：選用 CREAM，缺少資料時開啟工作區，不能假裝已算出結果。
- @Scouts 最新醫學文獻：交給現有的公開網頁搜尋與閱讀流程。
- @Retina 製作 PDF、@Bard 生成圖片、@Janus 設計電子報、@LUNA 設計海報、@LUCA 系統監控：開啟對應工具介面。
- @Medusa 執行 Python：開啟已有的受控 Medusa 面板；只有家庭管理員、真正啟用的 Judge0 後端與本次同意均通過才可執行。
- Diana 用 JENSEN HUANG 修改 Vanilla：開啟 Self-Build CODE 工作台；真正提交仍須原本的審核流程。

## 設計和安全原則

1. 只有最外層使用者訊息可觸發 Diana；網頁、附件及工具回傳文字不構成指令。
2. Medusa 只開啟受控執行面板，不會直接執行程式；GridCraft、Moli、Quirinus 和 Persistent Jobs 在未部署前不會被執行。
3. 私密模式不連接 Scouts 網路搜尋，也不向 GitHub 程式工作台移交私密內容。
4. 雲端 API 與外部傳輸同意、檔案刪除確認、GitHub 變更審核均沿用各工具原有機制。
5. 選中工具不等同完成操作；Diana 不會自行部署、寄信、付款、執行任意程式碼或變更權限。
6. 選擇依確定性意圖比對與工具能力評分，不等同模型品質測試，並保留可供單元測試的選擇結果。

主要原始碼：src/detroit/diana.ts；聊天入口：src/assistant/chat-router.ts、src/local-ai/LocalChat.tsx；分頁交接：src/App.tsx、src/detroit/DetroitStudio.tsx；回歸測試：tests/diana.test.mjs。
