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
