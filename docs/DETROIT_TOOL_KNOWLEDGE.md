# Detroit／Vanilla 內部工具知識問答

## 目的
Vanilla 使用者直接在聊天詢問「底特律是什麼」、「我的工具有哪些」、「Diana 做什麼」、「Quirinus 是否已上線」等問題時，應提供可驗證的說明。工具是 AI 內部原生能力，不必由使用者手動開啟才能知道它的功能。

## 資料依據
- Detroit／Factory／Orchestra：`src/detroit/capability-bus.ts` 整合引擎、選用工具與 Craft 工具的登錄資料。
- 實際執行狀態：`detroitAvailability()` 與已註冊的本機 executor；登錄 `active`、`adapter` 不代表遠端後端已部署。
- 衞國：`src/weiguo/registry.ts` 的內建宣告式登錄；使用者自訂設定不自動上傳或公開。

## 對話流程
1. `routeMessage` 優先辨識高信心的工具知識問題，`LocalChat` 直接用 `toolKnowledgeAnswer` 回覆，不要求模型已載入、連網、打開獨立工具頁面。
2. 比較、錯誤、整合、較複雜的問題保留正常模型回答；`toolKnowledgeGuidance` 依提到的工具加入有界、唯讀的程式事實，讓模型回答而非猜測。
3. 實際製作、執行、編輯、網頁搜尋仍走既有 Diana／Scouts／CREAM／Self-Build 路由，不能由知識查詢觸發危險動作。
4. 私密模式可以讀取內建靜態工具目錄；不會因此連線或自動讀取其他帳號、專案、歷史對話。

## 回答準則
- 優先給用途、分工、介面入口、必要授權及限制；不要回答「找不到這個工具」除非登錄確實缺席。
- 分清「工具已登錄」、「本機具 executor」、「遠端服務已部署」、「本次執行成功」四層狀態。
- 沒有可驗證執行回執，不說已啟用後端、完成檔案或成功存取資料。
- 未登錄的跨專案私有工具，不能自動假設存在或已部署；需由專案、記憶或實際 API 資料補充。

## 測試
`npm run test:tool-knowledge`
測試 FAQ、各類工具說明、離線／私密模式，以及不可攔截工作指令和故障排查。