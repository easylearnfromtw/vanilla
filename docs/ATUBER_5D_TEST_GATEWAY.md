# October / 阿土伯五維測試入口

## 入口

正式 GitHub Pages 部署成功並完成版本更新後：

- URL：`https://easylearnfromtw.github.io/vanilla/?lab=5d`
- UI：Detroit Studio →「October 5D · 測試」。
- **公開唯讀入口不代表管理員登入、後端 API、工具執行或模型授權。**
- 程式碼來源：從實驗 PR #201 的最新五維分支移植純幾何、影子建議、可選本機權重載入與 SVG 視覺化；**未合併整個 PR #201，也未改寫 Diana 正式路由**。

## 供自動化瀏覽器測試的契約

開啟以上 URL 後等五維元件載入：
- 定位 `[data-testid="atuber-5d-lab"]`。
- 在 `[data-testid="atuber-5d-cases"]` 放入 JSON，點選 `[data-testid="atuber-5d-run"]`。
- 從 `[data-testid="atuber-5d-json"]` 解析唯讀報告。
- 或者在此頁 console / Playwright page.evaluate 以 `window.__vanilla5dLab.evaluate(payload)` 直接執行（僅此頁元件掛載時存在）；卸載後清理。

範例輸入：
```json
{
  "version": 1,
  "cases": [
    {"id":"code_01","question":"幫我修復 TypeScript 程式錯誤","expectedCandidate":"code"},
    {"id":"unknown_01","question":"晚安","expectedCandidate":null}
  ]
}
```

限制：
- 每次 1–48 筆，原始 JSON 介面文字最多 35KB，每筆 question 1–1024 字。
- ID 僅英數、底線、連字號，長度 1–64，不重複。
- `expectedCandidate` 可省略，或使用 `finance | research | code | design | writing | numbers | null`。
- JSON 輸出 `contract="atuber-5d-shadow-v1"`、`mode="local-readonly"`、`authorized=false`、`modelInvoked=false`、`toolsDispatched=false`，附上每筆 ID、候選、棄權原因、距離、期待匹配。
- 報告**不包含問題原文**、聊天帳號、API key、私人記憶，也不向伺服器傳輸測例；下載需使用者主動點擊。
- 由於訓練與測例目前偏實驗性合成素材，**match 比率不可宣稱已驗證的模型準確率**。

## 執行本地回歸

```sh
npm run test:detroit-studio
npm run build
```

`test:detroit-studio` 同時被 `.github/workflows/ci.yml` 及 `.github/workflows/pages.yml` 執行。

## 正式路由禁止事項

1. 測試入口的輸入、JSON 和瀏覽器 global API **只調用純計算的五維幾何影子路由**，不調用外部模型或工具。
2. 5D 猜測結果不可直接發送給 Diana/Ceres/Slime 當作已授權的工具指令，也不可寫入持久記憶。
3. 可載入的本地學習權重只是驗證宣告格式與訓練來源，**沒有密碼學證明**；不得升級成 production policy。
4. 若正式要把五維接進阿土伯決策，需與 Diana 比較使用者同意且去識別的真實人工審核題集、棄權率、誤判率、耗時及前景掉幀；全部合格後才作特性旗標控制的灰度測試。
5. 測試入口本身不可繞過既有登入與後端權限，也沒有任何後端高權限 endpoint。

## 防卡頓策略

- 五維 SVG 僅在使用者開啟對應分頁時動態載入，不新增背景推論、WebGL 長迴圈或 GPU 模型。
- 使用者離開五維 tab，React 卸載視覺化與測試 global adapter；測試資料留在當次元件狀態，並不保存。
- 這些措施僅降低額外干擾；實際 FPS/VRAM 仍需 RTX 3050 真機比對。
