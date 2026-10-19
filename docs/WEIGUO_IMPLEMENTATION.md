# 衞國（WeiGuo）— Vanilla / Detroit 瀏覽器操作系統

2026-10-19：整合入 Vanilla AI 的工具選單與可部署的獨立瀏覽器後端。

## 已合併到前端的能力
- 工具選單新增「衞國系統」；可展示 Playwright、Browser Use、Scouts、CREAM、Atriensis、Persistent Jobs 的分工與可用狀態。
- 可以登錄自行新增的工具名稱、ID、能力與用途，在裝置上保存**非執行性的元資料**，並複製為 JSON 交由工程後端審核。並未授予未知程式系統權限。
- 按現有 Detroit/Zeus、Athena 權限模型編排規格。前端不放後端 Token；未部署後端時明示「需後端連線」，不宣稱已執行網頁操作。

## 獨立瀏覽器操作後端
`services/weiguo` 是 FastAPI + Playwright 受控執行器。可接受授權後的有限步驟（navigate / extract / scroll），可選連接私有 Ollama 產生**草稿計畫**；互動 click/fill 預設禁止，即使已授權也須管理端主動開啟並在單次操作上明確同意，禁止付款與刪除等敏感操作。

- 不依賴 iPhone Safari 開啟；每次瀏覽使用全新 Playwright Context。
- 只允許後端設定的 HTTPS 正確主機；擷取前 DNS 檢查 + 每次 request 重新限制來源。
- 透過邏輯型 tool registry 與行動稽核編排，不能執行附件中 JavaScript/Python 系統命令。
- 瀏覽器取得的文字一律作為不可信資料，不能改寫 Zeus/Admin/Athena 政策。
- 背景長期排程應結合 Persistent Jobs，並由 Chronos 建立有身份驗證的工作隊列。

**重要限制**：目前仍未有已驗證的 Railway 或其他實際部署服務。此服務的程式碼與 Docker 設定可以使用，但沒有與 GitHub Pages PWA 直接互通的安全 OAuth Gateway。不可把後端管理 Token 下放到 PWA；正式上線前需要私有主機、網路防火牆、登入與工作所有權隔離、操作明細核准、發送結果通知與真機驗收。參閱 `services/weiguo/README.md`。

## 單模型原則
Zeus 維持 iPhone 本地只有一個主要推論模型。Merlin、衞國、Scouts、CREAM、Atriensis、Retina、Venus 等是流程專業模組；有運算需求時可使用手機模型或**明確核准**的雲端/Ollama 模型，不能假設能平行載入多個手機端大型模型。

## 介面與 CREAM
- CREAM 新增可切換的圓餅圖與數線圖（Number Line）；現有折線圖、長條圖及 XY 散佈圖保留。
- 圓餅圖不接受負值、總和為 0；目前圖表僅對可見的最多 48 筆點計算分類總和，明示此限制。數線圖以實際數值定位，重複值堆疊。
- 可從聊天輸入「幫我畫圓餅圖\n分類,數量\nA,30\nB,70」或貼上 CSV 再在圖卡內切換。
- 移除空白聊天畫面下方 RECENT 清單，保留側邊欄中的完整對話入口，縮短 iPhone 輸入框與鍵盤間距。Detroit 階段改為助理回覆下方的收合進度條，可展開具體操作紀錄，絕不顯示模型私有推理文字。

## 後續真實驗收
1. 完整 CI、TypeScript/Vite Build、CREAM/衞國單元測試。
2. GitHub Pages 發布 + iPhone Safari 及已加入主畫面的 PWA 測試。
3. 私有後端正式部署與 OAuth、每位家人的 ACL、來源稽核及通知送達測試。
4. 針對手機鍵盤升起／收起、橫豎屏、縮放、安全區域做真機驗收。

## Google OIDC 家庭登入代理（後續實作）

採用 Vanilla 現有 Web OAuth Client ID，新增 Google Identity Services 身分按鈕，僅將短暫有效的 Google **ID token** 送到衞國 HTTPS 後端驗證；不傳送 Google Drive access token。後端依 Google `sub` 在私人 ACL 對照家庭成員與角色，再核發 15 分鐘獨立簽章 session。前端 session 僅存在記憶體，帳號不同或登出時清除。家庭只能執行唯讀的網頁擷取任務，且稽核資料以 Google `sub` 隔離；不取得 admin token。

**尚需實際操作**：部署後端並於私有環境設定 `WEIGUO_SESSION_SECRET`、`WEIGUO_GOOGLE_CLIENT_ID`、`WEIGUO_FAMILY_ACL_JSON`、`WEIGUO_CORS_ORIGINS`、`WEIGUO_ALLOWED_HOSTS` 與舊有管理憑證。GitHub Actions 變數 `WEIGUO_API_URL` 指向真實 HTTPS 網域。沒有這些設定，iPhone 介面會保持未連線，不能宣稱實際任務已送出。請參閱 `services/weiguo/README.md`。
