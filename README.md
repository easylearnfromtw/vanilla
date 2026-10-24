# vanilla

Vanilla 是以 React + Vite 開發的家庭 AI PWA，部署在 GitHub Pages，採 **iPhone 裝置端優先** 的混合模型架構。

介面採 Bauhaus 紙感 × 液態玻璃設計（`docs/UI_BAUHAUS_GLASS.md`）；在輸入框打「/」可以叫出所有工具（搜尋、讀檔、記憶、表格、CREAM、Self-Build、私密模式、新對話）。模型調校細節見 `docs/MODEL_TUNING.md`。

## AI 模型

- **WebLLM / WebGPU**：在支援的手機或電腦瀏覽器使用本地模型。開啟「裝置端 AI」可以選擇已支援的開源權重模型、檢視下載進度。
- **Ollama**：可連接家庭電腦、樹莓派控制的主機或自行部署的 VM。Ollama 推論**發生在該主機**，不是手機端。
- **Gemini API／DeepSeek API**：由使用者自行連接金鑰，須留意各模型的免費額度或計費規則。2026-10 建議：`gemini-3.8-flash`／`gemini-3.5-flash-lite`、`deepseek-flash`。

聊天上方可選 **智慧選擇 · 本地優先**、**智慧選擇 · 品質優先**，或強制使用本地／Ollama／特定供應商。

## 雙答案比較

在「智慧選擇」模式開啟 **雙答案比較**，Vanilla 會依任務類型、可用模型及裝置的偏好統計，選擇最多兩個候選模型生成回答。使用者從 A／B 選出較好的答案，Vanilla 在本機儲存本次勝負，逐次更新之後的模型排序。

這是**本機路由偏好學習**，不會重新訓練模型，也不會自動把投票同步到其他裝置。比較模式可能同時呼叫兩個收費／限額 API；開啟前請確認配置與額度。

## 阿土伯三層模型（4B / 14B / 30B）

中小型、中大型、大型阿土伯使用 Owner 自架 Ollama 別名（`october:sm`、`october:ml`、`october:lg`），會依寫作、研究、程式等任務在已設定的主機模型中選擇。這是分級路由與部署規範，**不是權重訓練或已成功的模型推論**。安裝、硬體要求、安全限制與上線驗證請參閱 [三層部署指南](docs/ATUBER_THREE_TIER_DEPLOYMENT.md)。

財經十題測試可先執行 `npm run eval:atuber-finance` 預覽；要在本人授權 Ollama 主機上真正測試，設定 `ATUBER_EVAL_URL` 後執行 `npm run eval:atuber-finance -- --run`。答題報告不會自動標成滿分，仍須依人工 rubric 評分。

## Ollama 部署

詳細的 Docker Compose、自架主機、Oracle Always Free ARM 可行性限制及 Tailscale Serve 安全配置參見：

**[deployment/ollama/README.md](deployment/ollama/README.md)**

> 安全規則：請勿將 Ollama 的 11434 直接暴露在公網。GitHub Pages 必須透過受保護的 HTTPS 代理才能可靠存取遠端服務。iPhone 的 localhost 指 iPhone，不是家庭主機。

## 隱私界線

- **私密模式**：強制手機本地 WebLLM，不會呼叫 Ollama 或雲端模型。
- **一般模式**：可路由到你同意的外部模型；Ollama 與 Gemini／DeepSeek 都可能接收到問題和聊天上下文。
- **雙答案偏好**：保存在當前瀏覽器 localStorage。Ollama 代理權杖保存在 sessionStorage，不同步到 Drive。
- Google Drive 的加密備份與模型金鑰同步是另外的功能，兩者的安全特性不同；未完成的家庭多帳號同步和 RAG 不應視為已實作。

## 開發

```sh
npm install
npm run build
npm run dev
```

## Awesome Discovery（唯讀開源技術探索）

Detroit Studio 的 **Awesome 探索**分頁與 `/Awesome` 指令會在一般模式下、使用者主動點擊後讀取 [sindresorhus/awesome](https://github.com/sindresorhus/awesome) 的公開索引。可依主題進入各清單，再進入個別 GitHub 儲存庫，檢視公開 stars、最近推送時間、封存狀態與 GitHub API 回報的 SPDX 授權。分數只是初步篩選，**不等於安全掃描或授權審查**。

選定候選後可複製或下載 **Markdown 整合提案**，交由現有 Self-Build Worker／Quirinus 與 GitHub PR 流程人工審核；**不會自動安裝程式、執行遠端腳本、提交 PR 或部署第三方外掛**。私密模式禁止公開 GitHub 查詢。提案與輸出不加自家裝飾性浮水印，但上游的 LICENSE、NOTICE、必要署名及商標條款不得任意移除。
