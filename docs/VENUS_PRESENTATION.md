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
