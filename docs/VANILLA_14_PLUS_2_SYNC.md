# Vanilla AI｜14 項需求＋2 項追加優化的同步基準（2026-10-19）

> 這份文件是跨開發分支的**需求對照表**，不是「16 項全部已實作」的完成證明。正式開發主線是 `easylearnfromtw/vanilla` 的 `main`；不要把開發分支當成不同的 Vanilla 產品或獨立部署。現在不納入樹莓派。

## 原訂 14 項需求與現況

| # | 需求 | 現況（以 main 2026-10-19 程式碼為基準） |
|---|---|---|
| 1 | 將已完成但尚未上線的功能安全整合部署 | **部分**：數個獨立 Draft PR 尚未合併；必須先解衝突與完成回歸測試 |
| 2 | 優化聊天內建立、預覽、修改表格 | **已有基礎**：聊天可建立本機 Sheet 草稿、審核逐格修改；完整進階編輯功能待整合 |
| 3 | 減少正常對話過度拒答，不用任意敏感詞過濾一般問題 | **部分**：強化臺灣自然語氣及正常技術問答；仍保留必要的權限、資料外洩及 Prompt Injection 防護 |
| 4 | 以 iPhone/PWA 現有設備優先，不使用樹莓派 | **已納入架構**：WebLLM/React/Vite/PWA；模型效果須實機測試 |
| 5 | 串聯既有 GitHub 專案作為不干擾主要聊天的隱藏／可按需使用能力 | **部分**：Project registry、Self-Build；真實跨專案資料與授權尚需逐項驗證 |
| 6 | 圖片、文件、網站、影片可輸入、理解、記錄並備份 | **部分**：圖片及部分文件上傳、網頁連結和盡力而為的網頁文字抽取；影片解析與自動學習非完整功能 |
| 7 | 家庭成員的對話、記憶和分析統整，但資料嚴格隔離 | **部分**：帳號範圍聊天／Drive 記憶；完整家庭角色 RBAC、跨帳號共享授權尚未完成 |
| 8 | 用自然語言提出整合 AI、API 或新增功能的需求 | **已有規劃工具**：Self-Build 和 API 串接需求轉送；不能等同已自動部署、授權並執行任意 API |
| 9 | 優化 Google 登入、Drive 資料存取與同步 | **部分**：Google Drive 連接、Cloud Files、聊天快照；仍須處理不同裝置衝突與授權 |
| 10 | 優化雲端文件、模型與服務連動 | **部分**：Cloud Files、模型提供商和 Google Drive；完整任務編排尚未全上線 |
| 11 | Vanilla 自行路由模型、輕量本地模型自動載入，弱化人工選模 | **部分**：模型排序／比較與小模型載入；UI 仍保留手動選模，並非全自動 |
| 12 | 讓表單、旅行、健康等模組按需求出現，主畫面保持聊天為主 | **部分**：核心聊天界面簡化，部分模組仍是佔位或專用工作區 |
| 13 | 將圖片與檔案長期保存為私人 AI 知識來源 | **部分**：Google Drive 保存、RAG/記憶檢索；這不是對本地基礎模型進行訓練或微調 |
| 14 | 可設定網站搜尋來源、偏好及權重 | **部分**：來源偏好與搜尋入口；尚不能宣稱已實際取得、驗證所有網站結果 |

## 兩項追加優化（依已找到的近期程式提交紀錄）

A. **Prompt Injection 防護與管理員檔案隔離**：外部文件、圖片／OCR、網站及工具回傳屬不可信來源；拒絕被外部內容冒充系統命令、讀取憑證或繞過權限。保留正常安全技術討論，不當作全面言論過濾。相關原始碼：`src/security/trust-boundary.ts`，測試：`tests/security-language.test.mjs`。

B. **臺灣繁體中文語感與自適應對話**：支援自然臺灣日常用語，在專業／醫療／開發任務保持正確術語；不可依家庭成員年齡預設同一種俚語。相關原始碼：`src/ai/taiwan-pragmatics.ts`、`src/ai/tone-adaptation.ts`。

> 註：目前能從歷史對話確定原本的 14 項清單；「+2」原始逐字說法不完整。此處採用程式提交紀錄確定實際存在的兩項追加優化，並未宣稱它們就是原句。

## 同步規則

- 唯一正式產品 Repository：`https://github.com/easylearnfromtw/vanilla`。
- `main` 是已部署程式碼來源；其他 `feature/*` 是候選功能，必須經過編譯、原有／新測試及權限驗證後合併。
- **保留 14+2**：任何 feature branch 都必須先繼承最新 `main` 的 WebLLM 單一 System Prompt 組裝、單次恢復重試、PWA cache 版本、外部資料邊界、防護測試。
- 若要建立另一個獨立 GitHub Repository，必須有明確的 repo 網址，**不要**自行挑選 `Builder`、`test` 等其他專案覆寫。
- Vanilla 家庭身分：哲愷／哲緯／曉芬資訊分域；不可無意串讀彼此的健康、財務、行程、偏好。正式權限必須由可驗證的身分及伺服器／雲端服務執行，不是前端角色文字。
- 以目前 iPhone + GitHub Pages + Google Drive 為主要基礎；不使用樹莓派。
- Mobilerun 仍是受監督的選用功能：Safari/PWA 本身無權跨 iOS App 操作；iPhone 控制須 Mac/Xcode/WebDriverAgent 或獨立安全橋接。

## 相關審核

- [Mobilerun 裝置 Agent 草稿 PR #4](https://github.com/easylearnfromtw/vanilla/pull/4)
- [Vanilla Sheets 草稿 PR #3](https://github.com/easylearnfromtw/vanilla/pull/3)
- [家庭工具 SDK 草稿 PR #2](https://github.com/easylearnfromtw/vanilla/pull/2)
- [WebLLM System Prompt 修復 PR #5（已合併）](https://github.com/easylearnfromtw/vanilla/pull/5)
