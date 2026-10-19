# Vanilla Self-Build CODE × NOODLES — 真正的程式碼開發與受控自主迭代

## 確切已實作的能力（分清前端部署與後端已啟用）

Vanilla 原有 **Self-Build 快速模式** 確實能在瀏覽器安裝、更新、備份、還原四種宣告式功能（checklist／tracker／calculator／notes）。本版本新添 **CODE 模式**：

1. 由對話輸入「自主迭代：改善 NOODLES 的模型路由」、「修改你的原始碼：修復某項 Bug」，或到 **Self-Build → 自主修改程式碼／GitHub CI**。
2. 使用者先設定自己的受保護 HTTPS GitHub Worker，Worker Secret 儲存 Github token，iPhone 上只填 **Worker 專屬會話權杖**。未連線不得聲稱已寫入 GitHub。
3. Vanilla 讀取真實 `easylearnfromtw/vanilla` `main` 上指定的 `src/`、`tests/` 或 `docs/` 檔案；回傳整份原始碼及 Git blob SHA，禁止截斷大型檔案後無意覆蓋。
4. 指定 Gemini／DeepSeek／Ollama／已載入的 WebLLM 產生整個可修改檔案 JSON。外部模型每次產生初始方案前須使用者明確同意發送程式碼。
5. 前端檢查來源檔路徑、內容與 blob SHA，呈現**完整程式碼變更預覽**，使用者批准後才呼叫 Worker。
6. Worker 從 Github 最新 main 建立 Git Tree/Commit（原子），開獨立 `autobuild/…` 分支與 Draft PR；**不可直接改 main、合併 PR、部署網站、修改 `.github` secrets 和工作流程**。
7. GitHub CI 真正測試原始碼，CODE 模式每 15 秒檢查一次狀態。若 CI fail 且提供確切錯誤註記，使用者原先同意的「自動修正」最多執行 2 輪，更新同一條 PR 分支並重新跑 CI；否則停止並要求人工審核。網頁關閉時**不會**繼續在背景編輯。
8. 只有使用者在 GitHub 審查與批准合併，才由原有 GitHub Pages workflow 自動編譯與部署正式版本。

NOODLES 已由本機帳戶範圍模型回饋資料辨識重複（≥2 次）的人工標記問題，提出較可能有價值的 source file + 改善任務，例如文獻引用、格式、工具意圖、模型選擇。這是**測量數據驅動的修改候選**，不能把「使用者感覺更好」當作模型底層權重已改變。

另外新 `.github/workflows/noodles-baseline.yml` 每天會自動執行客觀回歸測試及編譯。此排程不會自行花錢叫 API、不會自動編寫程式、PR、合併或部署；它是**自主品質驗證**，不是無條件自主改寫。

## 安裝 Cloudflare Worker（部署程式碼已納入 Repository）
必要：可登入 Cloudflare Workers 的帳號、持有 Vanilla Repository 權限的 GitHub fine-grained PAT、你自訂的長隨機 Worker 存取權杖。**GitHub Pages 是純靜態網站，不能安全代管這兩項 secrets；所以沒有設定這些時，CODE 工作台只是已發布的 UI，不能真的寫入 GitHub。**

### 1. GitHub token 權限
到 https://github.com/settings/personal-access-tokens/new 建立 **Fine-grained personal access token**：
- Repository access: **Only select repositories → easylearnfromtw/vanilla**
- Contents: **Read and write**（僅供建立獨立 autobuild 分支）
- Pull requests: **Read and write**
- Checks: **Read**（CI 診斷）
- Actions: **Read**（若日後加入更進階 CI 分析）
- Metadata: Read（自動）
- 建議有效期短且定期輪替，開啟 GitHub branch protection／rulesets 禁止機器人直接寫 main。
- **不要把 GitHub PAT 貼到 ChatGPT、Vanilla 對話、Repository、GitHub Pages 或 Google Drive**。

### 2A. 直接用 GitHub Actions 部署（只有 iPhone 也能操作）

本專案額外提供 GitHub Actions **`Deploy Self-Build GitHub Worker`**，可代替電腦終端機。注意：仍需有自己的 Cloudflare 帳戶與 Token。

1. 從 GitHub Repository 的 **Settings → Secrets and variables → Actions** 新增四個 **Repository secrets**（建議於 `selfbuild-worker` Environment 設定環境審核）：
   - `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID。
   - `CLOUDFLARE_API_TOKEN`：Cloudflare 受限 API Token，至少具 Workers Scripts Edit 權限，僅選必要帳戶。
   - `SELFBUILD_GITHUB_PAT`：只授權 easylearnfromtw/vanilla 的 Fine-grained GitHub PAT，Contents／Pull requests Read & write、Checks Read。
   - `SELFBUILD_ACCESS_TOKEN`：自行生成的長隨機字串（建議至少 32 bytes 等級，使用密碼管理器生成），作為 Vanilla 控制 Worker 的授權權杖。
2. 到 GitHub Repository **Actions → Deploy Self-Build GitHub Worker → Run workflow**，選 `main`，手動執行。
3. 只有 Action 的 Worker 部署與兩個 Secret 設置步驟均成功，才算真正將後端部署到 Cloudflare。取得該 run 實際顯示的 `https://….workers.dev` 網址。
4. 在 Vanilla 的 **Self-Build → CODE** 貼入這個部署 URL 及你持有的 `SELFBUILD_ACCESS_TOKEN`，點「連線並驗證安全後端」。
5. 再從 GitHub 讀取 `src/noodles/core.ts`，測試建立真正 Draft PR 與 CI。部署成功與 GitHub 實際 PR 測試是兩個不同驗收步驟。

**禁止**把四項值貼到對話、Commit、公開 `wrangler.jsonc`；GitHub Actions Secrets 只透過 Runner 環境變數傳入 Wrangler。Workflow 必須由 Repository owner 在 main 上手動啟動，不能由網頁自行啟動。建議在 GitHub Settings → Environments 建立 `selfbuild-worker` 審核規則。

### 2. 部署 Worker 並設定 secrets
程式位置 `services/self-build-github-worker/index.mjs`，設定檔 `wrangler.jsonc`，其 CORS origin 只允許 `https://easylearnfromtw.github.io`。

可在自己的終端機操作：

```bash
cd services/self-build-github-worker
npx wrangler login
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put BUILDER_ACCESS_TOKEN
npx wrangler deploy
```

這兩個 Secret 的值要由你在本機終端機安全輸入；`BUILDER_ACCESS_TOKEN` 請使用足夠長的亂數字串。Cloudflare Workers 部署 URL 大致長得像 `https://vanilla-selfbuild-github.<subdomain>.workers.dev`，**請使用平台真實回傳的網址，不要手動猜網域**。

Worker 裡已有：Origin、Bearer、固定 Repository、檔案路徑白名單、整份 SHA 比對、更新量／大小上限、Git Tree 原子 Commit、Draft PR、兩次修正上限與不允許 API merge 的限制。公開 Worker 還需要 Cloudflare 端 Rate Limiting／防濫用保護。儘管程式不能在正常路徑直改 main，GitHub PAT 本身具有 Contents 寫入權，因此 GitHub branch protection 是必要的第二層保護。

### 3. Vanilla 啟用並真實驗證
1. 打開 https://easylearnfromtw.github.io/vanilla/。
2. 左側進入 **Self-Build → 自主修改程式碼／GitHub CI**。
3. 填入 Cloudflare 回傳的 **真實 HTTPS Worker URL** 以及自訂 `BUILDER_ACCESS_TOKEN`（這不是 GitHub PAT）。
4. 點 **連線並驗證安全後端**；應實際回傳 `repo: easylearnfromtw/vanilla` 且 `mode: draft-pr-only`。
5. 輸入 `src/noodles/core.ts` 並點「從 GitHub 讀取原始碼」，看到 SHA 和完整檔案內容才算真正連上 GitHub。
6. 輸入改善要求，選擇已正確連接的 AI 模型，檢查修改內容，按「建立 GitHub Draft PR」。PR 必須存在 GitHub，且完成真正 CI 測試，才可說該次操作成功。
7. 成功 CI 後仍**不會**自動發布正式網站；只會保留待你合併的 Draft PR。

## 已部署不等於完全可用的界線
- **已實作並納入 GitHub Pages**：介面、命令路由、程式 JSON 生成、校驗、Worker 客戶端、NOODLES 候選、CI 查詢與限次自修。
- **另外需要外部所有者設定才真正寫 GitHub**：Cloudflare Worker、Secrets、GitHub PAT／Repository 權限、模型權限。
- **尚未聲稱已上線**：沒有使用者動作的全天候程式自主改寫；第三方 Gemini／DeepSeek 模型權重自動訓練；跨所有 GitHub Repos 任意修改；100% 無失敗或無需審查的自動部署。

## 安全及驗收
- CI：`npm run test:autocode`、原本 `test:builder`、`test:noodles`、`test:security`、`test:local-chat` 與 `npm run build`。
- Worker 測試使用**模擬的 GitHub API**，不需要真實 GitHub PAT，不會修改 Repository。
- 實機：iPhone Safari/PWA 取得來源、模型產生修改、手動確認、真正 PR 及 CI、2 次修正上限。
- Private mode 訊息只有經明確轉移確認才會帶入一般 Builder；Worker secret 不進入模型 prompts。
