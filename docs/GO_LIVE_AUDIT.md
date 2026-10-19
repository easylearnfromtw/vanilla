# Vanilla 正式上線驗收 — 2026-10-19

此清單以正式 repo `easylearnfromtw/vanilla`、GitHub Pages `https://easylearnfromtw.github.io/vanilla/` 為準，刻意區分已部署的前端、在使用者裝置真正可用的功能、未授權的外部服務與尚未完成的設計藍圖。

## 已核對的正式部署事實
- GitHub Pages Push workflow run [#39195285138](https://github.com/easylearnfromtw/vanilla/actions/runs/39195285138) 在 2026-10-19 完成，`build` 與 `deploy` 皆為 `success`。
- 已部署 Build `2026.10.19.10-swipe-chat` 包含主線已合併的聊天排版、Swipe UI、Vanilla Sheets、CREAM P0、NOODLES v0.1、文件庫、OAuth 串接 UI 等。
- 確認 CI 及 Pages workflow 都跑了 CREAM、NOODLES、Google Analytics、聊天介面、資源整合、security、WebLLM 回歸測試，並由 `actions/deploy-pages@v4` 發布 `dist` 產物。
- GitHub Actions `success` 證明成功部署構建產物，但**未**證明每支 iPhone 的 PWA 已更新、或每項外部服務都實際成功授權／使用。

## 本次追加的正式上線健康檢查
Vanilla **系統設定 → 正式上線健康檢查** 中，每個功能標示：
- **本機可用**：功能已在正式程式中且必要的裝置支援／狀態已確認。
- **已推出部分能力**：正式程式包含部分功能，或者已配置外部服務但未完成真實 API 驗證。
- **需要設定或授權**：缺少金鑰、連線、模型載入或 Google OAuth。
- **尚未完成**：存在設計文件或草稿，但並非可用的完整產品功能。

使用者可在自己的裝置手動按「測試」，執行安全、唯讀檢查：
1. 網站的 `version.json` 確認當前 PWA Build 是否等於線上版本。
2. Google Drive `listWorkspaceFiles`，實際測試個人雲端檔案清單，**不會刪除／新增檔案**。
3. Ollama `testOllama` 讀取模型清單並核對模型 ID，不進行付費推論。
4. 若已部署搜尋 Worker，發出一次固定查詢詞 `Vanilla AI`，實際檢查搜尋結果的 API 接通；此查詢可能產生搜尋服務額度使用。

## 仍無法聲稱完全上線的功能
- **完整跨網域搜尋**：需先部署 `services/web-research-worker/index.mjs` 至受保護的伺服器／Worker，提供搜尋供應商 API key、`WEB_READER_TOKEN`，設定 CORS。未取得金鑰或部署環境時不會直接聲稱全網可讀。
- **Google Analytics（GA4）**：必須提供完整 OAuth Client ID、設定 Web Origins、啟用 Analytics Admin/Data API 與 GA4 Property 權限。過去對話提供的是 Client Secret，不能寫入公開 repo，並建議至 Google Cloud 重新產生。
- **Google Looker Studio**：官方 Linking API 可開啟使用者建立報表頁面，但不是完整自動化管理所有 Studio 資產。
- **Ollama**：需使用者自己的 HTTPS endpoint、模型 ID、必要時的存取權杖；沒有連線資訊無法替使用者完成服務端部署。
- **CREAM 全 14 模組**：目前正式上線 P0 描述統計與圖表；研究級證據鏈、全部推論統計及完整報告生成引擎尚未實作。
- **NOODLES 2.0**：現有 v0.1 對話回饋與模型路由改善；自動跨模型 A/B 評估、可靠的標準答案測試、成本管理、第三方模型權重更新均未宣稱已完成。
- **Mobilerun／完整家庭 RBAC／全自動旅行及醫療代理**：仍須專用後端、授權或額外子系統，不能視作已部署。

## 不可跨越的安全界線
- 任何 GitHub Pages 的 JS、JSON 或公開 repo 都**不能保存 API secret**。
- Google Drive 與 GA4 連線測試不得偷偷呼叫寫入、刪除或共享 API。
- NOODLES 和資料整合需保護家庭成員隔離及私密模式。
- 不能用虛構的成功訊息替代已完成的 API 動作。
- 除非 Google／外部服務已授權並實測，不能告訴使用者「功能全部完全上線」。

## 部署測試步驟
1. 確認 GitHub Actions 最新 Push workflow 的 `build` 與 `deploy` 皆成功。
2. 開啟正式網站，檢查顯示 `Build 2026.10.19.11-launch-health`。
3. 系統設定 → 正式上線健康檢查 → 點「正式網站版本」測試，確認線上與裝置載入版本一致。
4. 有權限的帳戶逐項測試 Google Drive、Ollama、搜尋 Worker。GA4 透過「CREAM × GOOGLE」介面授權並匯入真實數值。
5. iPhone Safari／安裝版 PWA：實際測試表格、CREAM、NOODLES、左右滑動、資料保存，並檢查私密模式不外傳。

**程式成功部署 ≠ 全部整合已授權 ≠ 規劃中的所有功能已實作。**
