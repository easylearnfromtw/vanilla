# CREAM × Google Analytics 4 × Looker Studio

Vanilla 中，**CREAM 是唯一的主要分析與對話視覺呈現引擎**；Google Analytics 4 (GA4) 是外部資料來源，Google Looker Studio 是外部報表延伸。這不是獨立的 CREAM Dashboard。

## 已實作
- 在 Vanilla 對話工具區新增「CREAM × GOOGLE」面板。
- 使用 Google Identity Services 瀏覽器授權（`analytics.readonly`），不修改原有 Google Drive 授權與既有 token。
- 從 Google Analytics Admin API `accountSummaries.list` 讀取有權存取的帳戶與 GA4 Properties。
- 使用 Google Analytics Data API `properties.runReport` 讀取真實 GA4 統計資料，提供日期（最近 7／28／90 日）、維度（日期／流量來源／國家／事件）和度量值（活躍使用者、sessions、events、total users、page views）選項；型別白名單與 2,999 筆上限。
- 由 CREAM 的 `fromCreamRows` → `analyzeCream` 以本機確定性方法產生 KPI、互動圖表、樣本數及原始資料預覽。**不以模型猜測 GA4 的數值**，不自動把 GA4 資料寫入 Drive 或其他模型。
- 使用 Google Looker Studio 官方 Linking API，以已選 GA4 Property 的帳戶／資源 ID 組成 Google Analytics 資料連結，於 Google 網頁建立報表。使用者自行確認報表與分享權限。
- 測試包含 Client ID 格式、錯誤拒絕、真實 API 回傳轉換、Studio URL 參數、CREAM 計算及現有各類回歸測試。

## 使用者需設定
1. Google Cloud → APIs & Services 啟用 **Google Analytics Data API** 和 **Google Analytics Admin API**，並完成 Google OAuth consent screen 設定（測試狀態須將自己的 Google 帳戶加入測試使用者）。
2. 取得 **OAuth 2.0 Web application Client ID**（格式：數字-識別碼.apps.googleusercontent.com）；將 `https://easylearnfromtw.github.io` 放入 Authorized JavaScript origins。使用 GitHub Pages 路徑 `/vanilla/` 不改變 Origin。
3. 用具備 GA4 分析資源瀏覽權限的 Google 帳戶登入。若無 GA4 Property，面板會如實顯示 0 個，而非假設存取成功。
4. Vanilla 對話內展開「CREAM × GOOGLE」，可填入完整 **Analytics Client ID**，或留空先試 Vanilla 原有 Google OAuth Client ID（該 OAuth 專案若未啟用 GA4 API，會遭拒）。
5. 點「連接 Google Analytics（唯讀）」確認 Google 授權，選取 Property、指標、區間，再點「將 GA4 真實數據交給 CREAM 分析」。
6. 如需 Looker Studio，點擊「使用此 GA4 資源建立 Studio 報表」於 Google 的 Looker Studio 網頁操作；這不是 Vanilla 自動替你建好報表。

## OAuth Secret 安全
- 使用者曾提供兩組 `GOCSPX-` 開頭的 **Client Secret**，**絕不**將其提交 GitHub、寫入公開 GitHub Pages JS、瀏覽器 localStorage、測試或文件，也不在 log 或回答中重現。
- 由於 Client Secret 已經透過對話傳送，建議在 Google Cloud **rotate / regenerate** 這兩組值。
- 這種純前端的 Google Identity Services token model 只需要公開的 **Client ID**，**不需要 Client Secret**。
- Analytics access token 只在瀏覽器 JavaScript 記憶體，過期或重新整理頁面需要重新授權；OAuth Client ID 可自行修改，非敏感，可在本裝置保存。
- Looker Studio Linking API 在瀏覽器透過使用者 Google 工作階段處理；不需要 Studio Client Secret，也不代表已啟用受限的 Looker Studio API 資產管理。
- 如果未來需要使用 Google 的 server-side authorization code flow，Secret 只能存於可信後端的 Secret Manager／環境秘密，而非 GitHub Pages。

## 官方來源
- Google Analytics Data API `runReport`: https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
- Google Analytics Admin API `accountSummaries.list`: https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list
- Google Identity Services: https://developers.google.com/identity/oauth2/web/guides/overview
- Looker Studio Linking API: https://developers.google.com/data-studio/integrate/linking-api

## 尚未完成
- 尚未以使用者自己的真實 OAuth Client ID／Analytics Property 完成 iPhone 實機授權、資料驗收。
- 尚未將 Google Looker Studio API asset management 自動化（部分 API 受 Workspace 組織資格限制）；目前僅提供官方 Linking API 建立連結。
- CREAM 原 14 模組的完整研究、推論統計和報告產生功能，仍未全部完成。
