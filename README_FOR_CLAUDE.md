# Vanilla AI — Claude 接手開發說明

## 這份 ZIP 是什麼？
這是 GitHub `easylearnfromtw/vanilla` 的完整**可編輯原始碼快照**，取自 2026-10-19 的 `main`，Commit：`e6c4b77055211cd235331c04af3cd5ccc8d94625`。額外加入 Claude 開發指引、交接說明、版本清單與 `.gitignore`，原始檔未被重寫。

**包含：** `src/`、`public/`、`services/`、`training/`、`tests/`、`docs/`、`.github/workflows/`、`package.json`、TypeScript / Vite 設定。

**不包含：** `node_modules/`、編譯後的 `dist/`、Git 紀錄 `.git/`、使用者在 iPhone 的 IndexedDB / 聊天紀錄、Google Drive 雲端資料、私密 API Key。

## 如何交給 Claude
- **Claude Code：** 解壓縮後打開 `Vanilla-AI/`，Claude Code 會讀取根目錄 `CLAUDE.md`。
- **Claude 對話或 Projects：** 上傳 ZIP，並要求 Claude 先讀 `CLAUDE.md` 和本檔，再依需求修改原始碼、回傳完整更新後檔案或 patch。若對話功能不支援直接檢視 ZIP，請解壓後上傳資料夾或主要檔案。
- **在本機測試：** Node 22+，`npm install`、`npm run build`、`npm run dev`。GitHub CI 有其他 `npm run test:*`；先跑與修改範圍相關的測試，再跑全套。
- **與 GitHub 同步：** 這是沒有 `.git/` 的來源快照。要送回正式儲存庫，推薦先在新 clone 的 repo 上開分支，把修改檔案複製進去後 PR；請勿把 ZIP 解壓後直接當成已連結的 Git 工作樹。

## 最新修復狀態（此版本）
0. 2026-10-19 v0.2.0（Build `2026.10.19.20-bauhaus-glass-tuning`）：Bauhaus × Liquid Glass 介面、可測試的工具路由與 `/` 指令、對話封存（新對話不再刪除）、每個模型的推論調校與全供應商串流、iOS PWA 改善。詳見 `CHANGELOG.md`、`docs/MODEL_TUNING.md`、`docs/UI_BAUHAUS_GLASS.md`。這一版在沒有 node_modules 的環境完成：單元測試 143 項通過（`test:file-lifecycle` 需要 `npm install` 後的 fake-indexeddb 才能跑），TypeScript 以型別墊片檢查通過，**正式 `npm run build` 與實機／真實 API 尚未驗證**。
1. 2026-10-19 PR #28：修復 Vanilla 文件庫雲端記憶殘留、以 Drive 檔案 ID 確認原始附件、區分已驗證刪除與僅刪失效索引，以及同名副本處理；有模擬 Drive 整合測試。**不能假設使用者真實 Drive 中的舊檔已被刪除**。
2. 2026-10-19 PR #27：新增台灣在地議題／法律／歷史的 TAIDE 模型優先路由與設定。**模型權重及 Ollama 服務需要另外安裝，並非 ZIP 自帶。**
3. CREAM 長期數據追蹤、PROJECT HUB 原始碼索引、NOODLES 與 Self-Build 已有部分實作，但應閱讀能力清單並逐項真實測試。

## 給 Claude 的第一個指令（可直接貼上）
> 請把這個 Vanilla AI 專案視為既有正在使用的產品，而非從頭重做。先讀 CLAUDE.md、README_FOR_CLAUDE.md、相關架構文件與實際程式碼，列出已完成功能、真實缺口、關鍵安全風險及可小步迭代的優化計畫。若我指定功能，請完成可運作的修改、補回歸測試、驗證 TypeScript build，說明修改檔案與部署方式。保持家庭資料隔離、私密模式、Google Drive 真正的檔案刪除及 iPhone PWA 相容性，不要假稱已連上外部模型或已刪除我的雲端資料。

## 核心命令
```bash
npm install --no-audit --no-fund
npm run build
npm run test:file-lifecycle
npm run test:drive-orphan
npm run test:taide
npm run dev
```

GitHub: https://github.com/easylearnfromtw/vanilla
網站: https://easylearnfromtw.github.io/vanilla/
