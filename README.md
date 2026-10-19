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
