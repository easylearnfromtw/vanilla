# Detroit 開源能力索引 / Awesome Python

## 已實作
- Detroit Studio →「開源工具索引」新增可見的唯讀介面；原先 API Registry 有程式碼，但未出現在 Studio 導覽。
- 支援手動讀取 https://github.com/vinta/awesome-python 的公開 README。只解析 Projects 內的 Python 工具名稱、描述、分類與 GitHub 儲存庫網址；不抓取或執行專案程式碼。
- 沿用 API-mega-list 的四個分類，保持來源分離與來源註記。Zeus 依名稱、描述及分類搜尋；Diana／Zeus 顯示適用模組建議（AI Agent → Diana、Code Analysis → Quirinus、Data Analysis → CREAM、Local LLM → Slime）。**這是規劃建議，不是執行。**
- Athena／Quirinus 提示授權、相依套件、供應鏈、Python 後端相容性、隱私及付費風險。候選均為 unverified、executionEnabled=false；不註冊 Capability Bus 執行器。
- Detroit Studio 的索引仍需手動按「載入公開目錄」；但在聊天室明確要求「推薦 Python 套件／框架」時，Diana → Zeus 也會直接讀取固定公開來源，整理候選工具與原始專案網址，不需使用者切換介面。私人模式及離線禁用，無對話文字或憑證上傳。來源連結經白名單、清理、大小與數量限制，疑似提示注入內容略過。

## 如何使用
1. Vanilla → Detroit Studio → 開源工具索引。
2. 選「Awesome Python · 函式庫」，在一般模式且有網路時按「載入公開目錄」。
3. 搜尋 langgraph、agent、Code Analysis 等；按「Athena 審核」檢視風險。
4. 「原始頁面」只會開啟經正規化的 GitHub 專案主頁，不會下載或啟用程式。

## 安全與功能界線
- 清單收錄不等於套件有安全認證。Python 版本、依賴、LICENSE、維護與安全公告必須逐項重新驗證。
- 聊天僅對明確的 Python 工具推薦意圖進行即時唯讀查詢，不會在無關對話中背景同步；此版本**沒有**安裝／執行 Python 程式或部署 Python runner，不能聲稱已透過 Diana 實際呼叫第三方程式。
- 目錄只是候選資訊；若未來需要執行，需先有受控且隔離的後端／Slime 節點、供應鏈掃描、管理員授權和可查證回執。
- Vanilla 是 TypeScript 瀏覽器 PWA，不能直接在裝置上載入一般 Python 套件。
- 上游 Markdown 格式若改變，解析器可能拒絕或返回空清單，不能捏造條目或啟用狀態。

## 檢查
- npm run test:api-registry
- npm run test:detroit
- npm run build

## 待評估（非已上線功能）
- 後端隔離的 Python runtime、固定版本 manifests、授權審核與安全掃描。
- 經明確授權、測試和實際執行回執的 Diana / Detroit 原生能力接入。

## 既有 API Registry
既有 API-mega-list 保持 Apify 類型的唯讀搜尋；加上 Python 目錄不改變其執行權限或資料保護邊界。
