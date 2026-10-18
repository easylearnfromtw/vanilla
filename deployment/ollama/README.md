# Vanilla AI + Ollama：家庭主機與免費雲端部署

本指南配合 Vanilla 的 **iPhone WebLLM → 家庭／自架 Ollama → 設定的雲端 AI** 三層架構。Ollama 模型**在伺服器上執行**，不是在 iPhone 上直接執行。與手機本地模式不同，呼叫 Ollama 會將問題及聊天上下文送到你設定的主機。

## 1. 在自己的 Linux 主機安裝

建議：64 位元 Linux、Docker Compose、SSD 儲存空間、穩定網路。樹莓派可作控制器／調度器；大型模型建議在更高記憶體或 GPU 的主機上運算。Oracle Always Free ARM VM 可能可運行小模型，但只有 CPU，容量、供應與免費政策需以帳戶與地區當下條款為準。

```sh
cd deployment/ollama
docker compose up -d
docker exec vanilla-ollama ollama pull qwen2.5:1.5b
docker exec vanilla-ollama ollama pull qwen2.5:3b
docker exec vanilla-ollama ollama list
curl http://127.0.0.1:11434/api/tags
```

若資源極低，先測試 `qwen2.5:0.5b`。大模型需要更多 RAM、硬碟與推論時間。量化、授權、模型名稱以 Ollama 實際版本與模型庫為準。

Compose 使用 `127.0.0.1:11434` 限制外部連線，**不要把 11434 直接公開到網際網路**。使用 `OLLAMA_ORIGINS=https://easylearnfromtw.github.io` 允許 Vanilla 的網頁來源跨網域呼叫；這不是身分驗證或存取授權。

## 2. iPhone 安全地連接主機（推薦 Tailscale Serve）

在主機安裝 Tailscale，登入個人 tailnet，啟用 HTTPS 憑證與 ACL（僅授權家庭成員）：

```sh
sudo tailscale up
tailscale serve --bg 11434
tailscale serve status
```

Tailscale 會顯示 `https://<設備>.<tailnet>.ts.net`（這裡是示意格式，必須使用你自己取得的實際網址）。**使用 Tailscale Serve，不是 Funnel**；Funnel 可能公開到整個網際網路。

iPhone 須登入相同 tailnet 並啟用 Tailscale 連線。到 Vanilla → **系統設定 → Ollama**，貼上 HTTPS 網址，按「測試連線／取得模型」，再選擇模型並儲存。

瀏覽器的 `localhost` 是當下手機本身，不能指向家裡電腦。GitHub Pages 網站為 HTTPS，不能依賴直接存取家中 `http://192.168.x.x:11434`。若使用其他反向代理，請確保 HTTPS、驗證、允許的 CORS Origin、訪問控制與流量限制都已配置。

## 3. Vanilla 模型自動選擇與偏好學習

- **智慧選擇**：依工作種類（程式／分析／寫作／一般）、可用模型與本機投票偏好排序。
- **雙答案比較**：可開關；打開後 Vanilla 會嘗試選出兩個不同來源的候選模型，無不同來源時可比較兩種 Gemini 模型。需要在瀏覽器明確同意外部傳送。
- **選擇 A／B**：只把獲選回答寫進一般聊天歷史。偏好投票只保存在**目前瀏覽器**的 localStorage。
- **私密模式**：強制使用手機 WebLLM，不使用 Ollama 或供應商雲端，也不會產生雙雲端答案。
- **模型偏好**：是基於任務類型的簡單路由權重調整，不是訓練 LLM，也不是跨裝置同步。

本地 WebLLM 會列出目前版本實際內建且符合條件的模型。更大模型在 iPhone 上可能因 Safari WebGPU、記憶體不足、儲存空間或溫度限制而無法執行。裝置能力需要實測。

## 4. 免費的範圍與重要限制

- WebLLM 使用自行下載的權重，推論可在裝置端完成，不收雲端推論 API 費，但有設備、電力與儲存成本。
- 自架 Ollama 不收供應商逐次推論費，但主機可能有購置費或雲端 VM 的用量費。
- Gemini API 某些模型、地區或帳戶可能有免費額度；不是保證無限制或永久免費。
- DeepSeek API 不能假定免費，使用前應查閱自己的計價／額度設定。
- Vanilla 不會替你安裝或啟動遠端主機；Ollama 端須由你實際部署。設定介面僅儲存端點並向已開機主機呼叫 API。
- Vanilla 的 API Key 連線、Google Drive API 配置目前另有隱私限制；Ollama 代理權杖只儲存於本分頁 sessionStorage，不會上傳 Google Drive。

## 5. 常見錯誤

- **無法連線 / Failed to fetch**：主機沒開、Tailscale 未連線、HTTPS 憑證錯誤、瀏覽器 CORS 或代理拒絕。
- **404 model not found**：先在主機執行 `ollama pull <名稱>`，與 Vanilla 設定模型名稱完全一致。
- **模型很慢**：ARM CPU、樹莓派的小型裝置通常只能跑較小模型；調整模型或升級主機效能。
- **WebGPU 不支援**：那是 iPhone 端本地模型的問題；與遠端 Ollama 連線本身不同。

參考：
- https://github.com/ollama/ollama/blob/main/docs/api/introduction.mdx
- https://github.com/ollama/ollama/blob/main/docs/faq.mdx
- https://tailscale.com/docs/features/tailscale-serve
