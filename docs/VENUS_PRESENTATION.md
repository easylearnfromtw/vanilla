# Venus 2.0 — 安全多型態回覆呈現

Venus 是 Detroit 的呈現層，不是新增的常駐推論模型。爾雅決定回答內容，Venus 決定呈現形式；Merlin 原始需求仍為完成條件。

## 實作範圍

- 一般對話繼續支援 Markdown/GFM：標題、清單、引用、程式碼與原生表格。
- 新增結構化元件：metrics 指標、cards 比較卡、timeline 時間軸、tabs 分頁、checklist 勾選、quiz 測驗、chart 長條／折線、gallery 圖庫。
- 僅在比較、流程、圖表、清單等有意義的問題、且不是小型裝置端模型的情境，提示模型可以選用元件。日常問題、寫作和程式任務保持純文字快速流程。
- 只接受封閉的 venus 標籤 JSON code fence，單段最多 3 個經驗證元件；不合規或未輸出完成的區塊，保留原始文字。
- 原有 CREAM / Sheets / Retina / 來源卡的實作原封保留，避免重複圖表。
- 響應式排版、深色樣式、無障礙標籤及低動態偏好。
- HTTPS 無帳密 URL 白名單、手動外站圖片載入和 no-referrer、React 文字安全跳脫；禁止任意 HTML／JS／網路自動執行。

## Venus 協議範例

通常先回答普通文字，再追加一段 venus JSON code fence。以下為範例，數值僅作介面展示：

    〈三個反引號〉venus
    {"kind":"chart","title":"範例數據","chartType":"bar","labels":["A","B"],"values":[10,20],"unit":"件","source":"示範資料"}
    〈三個反引號〉

或：

    〈三個反引號〉venus
    {"kind":"tabs","title":"方案比較","items":[{"label":"方案 A","content":"特點 A"},{"label":"方案 B","content":"特點 B"}]}
    〈三個反引號〉

chart 必須帶有來源標籤，但標籤仍可能是模型提供的資訊，並未由 UI 獨立查證。無可核對資料時不能虛構數字、圖片或來源，直接使用 Markdown 即可。

## 邊界與後續

此項是 Vanilla 原生 UI，並非 ChatGPT 私有 UI 協議的複製。目前沒有自動地圖／地理編碼、影音播放與生成、外部互動 App 沙盒、購物／預約或即時金融資訊。這些需要合法來源與 Diana／Athena 適配器，不得由呈現層憑空產生。

小型 iPhone 本地模型仍以 Markdown 為主，不增加大量 JSON 輸出成本。私密模式不會自動連外；gallery 由使用者手動同意載入指定外部 URL。

## 驗證

運行 npm run test:chat-ui 和 npm run build。合併 main、更新 PWA 版本與 GitHub Pages 實際上線是不同階段，應分別確認。


## Venus 3.0 追加元件

Venus 3.0 依自然語言自動判斷輸出種類（chooseVenusIntent），接上原有對話 Markdown。仍是前端呈現協議，不是新的 AI 模型或地理／影片搜尋 API；Diana 和其他工具需要先取得真實資料，再由 Venus 呈現。

- map：1–8 個已知經緯度點，切換地點後按鈕載入 OpenStreetMap 地圖。座標由回答提供，UI 不會假裝已反查地址。
- video：經 ID 格式驗證的 YouTube／Vimeo 播放器，點擊才載入受 sandbox 限制的 iframe。合法 ID 不保證真實影片存在。
- math：基本 LaTeX 轉離線 MathML（分數、開根號、上下標、希臘字母等），禁止 eval 和任意巨集，不支援的式子保留原文。
- live：裝置端時鐘和 ISO 8601 帶明確時區的倒數計時，不是網路即時數據。
- gallery：圖片集合額外顯示來源連結；每張外站圖片仍由使用者決定是否載入。

安全原則：座標／影片／圖片不得虛構，真實圖片搜尋及地理編碼需要額外合法 API／Diana 適配器；本次只增加確定性渲染與互動介面，外部內容僅於點擊後載入。

驗證：執行 npm run test:chat-ui 和 npm run build、GitHub CI 與 Quirinus 安全檢查；上線版本需分別確認 main 合併、PWA 標記同步及實際部署。

## Venus 3.0 — multimodal / dynamic presentation

新增 schema 驗證後的原生互動元件：

- **map**：最多 8 個已提供的真實座標；本機切換地點，點按才載入 OpenStreetMap 互動地圖。不執行地理編碼、不聲稱行車時間或導航結果。
- **video**：YouTube 11 碼 ID 或 Vimeo 6–12 碼數字 ID；只允許兩種提供者的固定 HTTPS iframe，需點按才載入。Video ID 存在性不能僅靠格式驗證。
- **math**：常用 LaTeX 字母、上下標、分數、根號、希臘字母與算子轉成本機 MathML。無支援的指令將保留原文，不執行 HTML/JavaScript，也不是完整 TeX 引擎。
- **live**：用裝置時間更新 Asia/Taipei 或 UTC 時鐘，或帶時區的 ISO 8601 倒數。非行情／氣象／運輸的即時後端資料。
- **gallery**：在原本的 HTTPS 圖片卡新增圖片出處連結。請求「搜尋／找 XX 照片」時，非私密模式可直接以 Wikimedia Commons 公開 API 查詢，使用 API 回傳的 upload.wikimedia.org 縮圖與 commons.wikimedia.org 原始出處頁。搜尋只傳遞使用者的查詢文字，不傳附件，不提前載入圖片位元組，並在每張圖片另需人工點按。搜尋結果可能為零，不回填虛構照片。
- **Diana 路由**：明確的地圖、影片、數學、時鐘、圖庫需求優先由 Venus 呈現；原有 CREAM 數據驗證、Scouts 網頁引用與 Athena 隱私權限照舊。Venus 負責呈現，不取代已授權工具或直接宣稱完成外站操作。

手動結構化內容範例：

    三個反引號 venus
    {"kind":"map","title":"臺北地點","points":[{"label":"臺北101","lat":25.0339,"lon":121.5645,"description":"示例座標，正式使用需核對"}]}
    三個反引號

    三個反引號 venus
    {"kind":"math","title":"二次公式","expression":"\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}"}
    三個反引號

    三個反引號 venus
    {"kind":"live","title":"台北時間","mode":"clock","timezone":"Asia/Taipei"}
    三個反引號

校驗：npm run test:chat-ui、npm run test:diana、npm run build，並確認 Quirinus CI、安全提示和 Safari 實際播放器／地圖服務的可用性。**第三方圖片與影片始終保留來源與手動同意條件。**

仍未提供 ChatGPT 的全套媒體服務、地點搜尋／路徑規劃、全球圖片索引或任何未整合的即時外部資料。
