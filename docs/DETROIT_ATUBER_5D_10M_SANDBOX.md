# 底特律工廠 × 阿土伯 × 5D：1,000 萬次微調沙盤

**實作範圍：** Detroit 內既有的 Penteract 5D 可訓練影子投影器，並非阿土伯 0.6B 語言模型（Qwen3-0.6B）或 OCTUBER 30B／60B 的語言模型權重。

## 1. 本次 1,000 萬次究竟更新了什麼？

- 現有程式 `src/detroit/penteract-learned.ts` 的相容架構：Unicode n-gram 384 個哈希特徵 → 5 維可學習投影 → 6 個五維單純形專家座標。
- **實際可訓練數值參數 1,925 個：** 384 × 5 權重加上 5 個偏置。
- 使用 `scripts/train-penteract-10m.mjs`，20,000 筆明確標註為 **GPT-authored synthetic** 的示例，重複 500 epochs，嚴格累計 10,000,000 次實際 SGD 權重更新。
- 獨立製作 240 筆不同文字模板的合成留出集，只衡量影子幾何路由在合成例子上的損失，**非真實使用者、正式模型的準確率**。
- 不下載任何基礎模型，不使用 CUDA，不花雲端 GPU 費用，也不修改 0.6B、30B、60B 的神經權重。

## 2. 可重現的完整運算與驗證

在 Node.js 22 環境的 Vanilla 原始碼根目錄：

~~~sh
node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
  scripts/train-penteract-10m.mjs --steps 10000000 --out-dir artifacts/penteract-10m

node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
  --test tests/penteract-10m.test.mjs
~~~

訓練程式會生成 `five-d-weights.json` 與 `five-d-sandbox-report.json`，包含真實更新次數、參數數量、合成留出損失、資料生成雜湊、訓練過程與硬體宣告。既有輸出檔**拒絕覆寫**。

GitHub Actions 工作流程 `.github/workflows/octuber-penteract-10m.yml` 在 PR 和主要版本更新時執行完整 1,000 萬次訓練，再用機械檢查確認更新次數、下降的合成留出損失、false 權限與 false 0.6B／30B／60B 權重宣告。成功時，可至 Actions 對應工作下載 `octuber-detroit-atuber-5d-10m-synthetic-weights` 檔案。報告不可被當作 0.6B／30B／60B 模型權重訓練證明。

## 3. Detroit 與阿土伯如何串聯？

1. 打開 Vanilla → Detroit Studio → **五維 Penteract**，在「可訓練五維投影器」手動載入 GitHub Actions 下載的 `five-d-weights.json`。
2. 比對原有五維影子路由與合成資料訓練的五維影子候選。
3. 點選 **啟用阿土伯 × Detroit 唯讀影子串聯**；這是明確同意、當前頁面生命週期內有效的**暫存**設定，關閉或重新整理頁面會遺失。
4. 只有輸入類似「**阿土伯：五維分析 幫我修復 Python API**」這種明確的請求時，`planAtuberReadOnly` 才會建立唯讀計畫；`executeAtuberReadOnly` 在受限證據中同時附上原有幾何與已選擇的影子模型結果。
5. 即使模型給出任何分類，仍維持 `grantedPermissions:false`、`readOnly:true`、`networkUsed:false`、`modelInvoked:false`，不授權 Diana、Ceres、Slime，也不讓底特律工廠自動執行外部工具。

五維訓練的 JSON 檔案只做結構檢查，**未驗證來源簽章**；外部模型檔案不是可信任的政策或權限。此橋接無 `localStorage`、無網路請求及背景工作，不會收集或保留私有對話。

## 4. 禁止混為一談

| 對象 | 實際狀態 |
|---|---|
| Detroit Penteract 5D（1,925 參數） | 合成資料 CPU 1,000 萬次真實 SGD 沙盤；有獨立權重 JSON |
| 阿土伯 0.6B | 可以讀取使用者啟用的**唯讀 5D 影子建議**；0.6B 基底權重不因此改變 |
| OCTUBER 30B／60B | 此工作沒有變更任何大型模型權重 |
| 底特律工廠工具 | 僅由既有正式授權規則控制；影子模型不提供工具權限 |

### 下一階段的正式路由門檻

必須使用**合法授權、與合成訓練資料完全獨立的真人審核測集**，比較五維學習器與原版幾何影子路由、阿土伯原路由，在正確性、誤判、棄權、效能和隱私上達成事先訂好的條件，才能另行討論是否可以切正式路由。這次沒有修改正式路由。
