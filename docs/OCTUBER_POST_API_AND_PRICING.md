# OCTUBER 品牌模型與價格策略（2026-10-24）

## 本次真正加入的能力
- 品牌模型名稱：**OCTUBER FLATTERING、OCTUBER MODEST、OCTUBER SUMPTUOUS**，延用現有阿土伯單一主控／嚴格權限路由。
- FLATTERING 裝置端起點是 `Qwen3-0.6B-q4f16_1-MLC`，首次進入 Vanilla 自動嘗試下載並載入；已快取會從本機載入。此模型仍是 **Qwen3 開放權重，不是已完成獨立訓練的 OCTUBER**。
- 建議本機規格可能不適用時，會用「建議您使用較大模型」彈窗提示轉向已授權 **自架伺服器**；若失敗原因是手機 GPU／記憶體，**不是改用更大的手機本機模型就能解決**。
- 支援從設定中選擇自架 4B／14B／30B 規格偏好，要求分析／程式等任務仍遵循最低能力級距；沒有自行啟動未經授權的節點。
- API 認證 UX：已核發 `vnl_` Key 可按「取得模型 → 查看額度 → 實測回答」；此外自架 Ollama 連線也有四步驗證。
- 比價中心位於「設定 → 比價與價格」，允許 CSV／JSON 報價（不含密碼）匯入，並提供多來源手動比價入口、商品比對、歷史紀錄、價格統計與**僅供參考的**建議售價。

## 公開命名與實際部署（必須區分）

| 展示名稱 | 運算設備 | 官方基底 | 新的建議別名 | 舊別名仍接受 |
| --- | --- | --- | --- | --- |
| OCTUBER FLATTERING | 裝置端 | Qwen3 0.6B | 直接以 WebLLM 識別碼載入 | 同上 |
| OCTUBER FLATTERING | 自架 Ollama | qwen3:4b | `octuber:flattering` | `october:sm` |
| OCTUBER MODEST | 自架 Ollama | qwen3:14b | `octuber:modest` | `october:ml` |
| OCTUBER SUMPTUOUS | 自架 Ollama | qwen3:30b MoE | `octuber:sumptuous` | `october:lg` |
| OCTUBER SUMPTUOUS（進階）| 自架 Ollama | qwen3:32b Dense | `octuber:sumptuous-32b` | 新增規格 |

> 這些是**展示名稱與部署別名**，不等於重新訓練、合併、通過效能測試或買了算力。介面中的容量是基底權重約略下載大小，不代表實際裝置 RAM／VRAM 需求。

### 授權的主機部署示例

以下命令只能在所有者明確同意的電腦上執行；需預先安裝 Ollama 且能連線下載。自架服務請使用私人 HTTPS 代理，避免將 `11434` 開放公網。

```sh
ollama pull qwen3:4b
ollama create octuber:flattering -f deployment/ollama/Modelfile.atuber-sm
ollama pull qwen3:14b
ollama create octuber:modest -f deployment/ollama/Modelfile.atuber-ml
ollama pull qwen3:30b
ollama create octuber:sumptuous -f deployment/ollama/Modelfile.atuber-lg
ollama pull qwen3:32b
ollama create octuber:sumptuous-32b -f deployment/ollama/Modelfile.octuber-sumptuous-32b
ollama list
```

檢視 ModelConnections 的「取得模型清單」可核對實際別名是否已安裝；通過真實回答驗證前不要視為可用。首次 0.6B 下載為網路／GPU 密集操作：瀏覽器不提供 WebGPU、Data Saver 已啟用而未快取、離線未快取時，會保守停下並允許使用者手動操作；下載成功不保證硬體能穩定推論。

## 已核發 API Key：三步啟用
1. 在「設定 → AI 模型」選「已取得 API Key？在這裡啟用」，貼上受信任的 `https://.../v1` 閘道和 `vnl_` Key。
2. 取得 `GET /v1/models`，核對模型 scope；查 `GET /v1/vanilla/usage` 配額。金鑰只存在此元件執行時的記憶體，不寫入 localStorage、聊天紀錄或 Drive。
3. 主動呼叫 `POST /v1/chat/completions` 做小額度實際推論，才顯示模型可運行。

此入口不負責**核發** Key／付款／代為配置雲端服務。既有 Owner 推論 API 預設仍關閉；只有確實啟動自有推論服務並通過 Owner 安全閘道驗證後才能對外提供。


## OCTUBER SUMPTUOUS 真正本地 30B（不需 OpenRouter）

此處「本地」指 **你自己的電腦、工作站或家用伺服器** 執行權重（Windows、macOS、Linux）。若在 iPhone 開啟 Vanilla GitHub Pages，30B **不會下載到 iPhone**，而是由你有權控制且完成授權的本地電腦運算；手機顯示答案。

1. 在電腦安裝 Ollama、下載並確認真正的 30B 模型：
   ```sh
   ollama pull qwen3:30b
   ollama run qwen3:30b "請只回答：連線成功"
   ollama list
   ```
   如果使用其他原生標籤，也可選擇 `qwen3:30b-a3b`、`qwen3:30b-a3b-instruct-2507` 或專精程式的 `qwen3-coder:30b`，前提是 **你目前的 Ollama registry 真正提供且可下載這個標籤**。32B Dense 為 `qwen3:32b`。具體模型與量化方式以 `ollama list` 為準。
2. 如果直接在同一台電腦使用 Vanilla 網頁，可以嘗試用 `http://localhost:11434`；需允許 Vanilla 網站來源通過 Ollama CORS 設定。瀏覽器可能另外限制 HTTPS 頁面對 HTTP 的存取。
3. 如果在 iPhone／另一台電腦使用，請在本地主機前加上 **有身分驗證的 HTTPS 反向代理／私人網路隧道**，切勿把 `11434` 無保護地對公網開放。iPhone 裡的 `localhost` 是 iPhone 自己，不是桌機。
4. Vanilla「設定 → AI 模型 → OCTUBER · API 與運算主機」填網址，點「測試連線／取得模型」；選擇已列出的 `qwen3:30b`，點「儲存並啟用」，最後按「測試模型實際回答」。
5. 只有在 `/api/tags` 列出模型 **且** `/api/chat` 回傳完整非空答案時，才會把原生 30B 候選納入 OCTUBER 對話路由；成功驗證後自動把規格偏好設為「SUMPTUOUS」。未驗證、重新整理、端點更換或未安裝，都不應顯示可用。使用者仍要先同意把對話傳到自己的主機。私密／只用本地（此裝置）模式不把資料傳到電腦。
6. 30B MoE Q4 通常約 19 GB 權重，執行還需要 KV 快取、記憶體／VRAM 與 Ollama runtime。桌機 24 GB GPU VRAM 或 32 GB 以上整體 RAM 是較常見起點，不是硬體保證；記憶體不足也可嘗試 CPU offload，但速度會非常慢。量化越高、上下文越長需要越多記憶體。模型名稱、安裝和測試流程不會替使用者購買 GPU，也不會憑空訓練 OCTUBER 獨立權重。

本地電腦路線與已另行提供的 OpenRouter 託管 30B **兩者並存**，沒有強迫轉向付費雲端。

## 真正可用的託管 14B／30B／32B 路徑（新增）

- 使用者可在「設定 → AI 模型 → OCTUBER 14B／30B／32B · 直接啟用雲端推論」選擇 OpenRouter 的真實 Qwen3 14B、Qwen3-30B-A3B-Instruct-2507、Qwen3 32B 模型。
- 使用者自行取得 OpenRouter Key 並填寫；只在瀏覽器執行時記憶體存放（重新整理即消失），不寫入 GitHub、localStorage、sessionStorage、Drive 或聊天內容。
- 只有 POST /chat/completions 真的取得非空回答後才將該模型登記為可用候選，聊天再以 SSE 真正生成；列出名稱不代表就緒。
- 必須允許「計費雲端 API」，並在第一次傳送對話／附件／記憶到 OpenRouter 時明確確認；私密模式與明示「只用本地」一律排除此候選。
- 託管模型運算不在 iPhone，也不是 OCTUBER 專屬訓練權重；模型服務、金鑰、配額、CORS、計費由提供商決定。沒有用戶金鑰時不能代替付費或宣稱正在執行 30B。
- OpenRouter 官方模型資訊：https://openrouter.ai/qwen/qwen3-30b-a3b-instruct-2507 ，14B：https://openrouter.ai/qwen/qwen3-14b 。
- 如需長期多使用者服務，應架設帶驗證、額度與稽核的後端代理，不應把共用 API Key 放在公開前端。

## 比價資料匯入
三個站點僅是**人工開啟的比價入口**：
- BigGo <https://biggo.com.tw/>
- 飛比 <https://feebee.com.tw/>
- 比價撿便宜 <https://www.lbj.tw/BJ/Default.aspx>

沒有經過授權不得爬取受保護的網站。若日後取得官方 API／合作來源的授權，才加入後端定期同步與完整資料憑證。現階段只處理使用者有權提供的資料，沒有聲稱站點已整合或目前價格已讀取。

匯入範例：
```csv
product,sku,merchant,source,price,observed_at
藍牙耳機 ABC,ABC-001,甲商家,biggo,1590,2026-10-24T10:00:00+08:00
藍牙耳機 ABC,ABC-001,乙商家,feebee,1690,2026-10-24T10:10:00+08:00
```

注意：`source` 欄位只是提供者的來源標記，**不代表網站已確認該筆價格**。系統目前同幣別僅支援 TWD，以 SKU 優先匹配，來源原始網址允許 HTTPS，記錄觀察時間。各店貨品型號、成色、新舊、含稅與運費仍需人工確認。

### 定價參考而非自動上架
- 需要至少 2 家獨立商家才算建議價，避免單一商家報價誤導。
- 比較中位數與最低價，報價多筆來自同一商家去重。
- 計算最低毛利率保護價格：`ceil(商品完全成本 / (1 - 最低毛利率))`。
- 調價建議以中位數為參考，單次變化限制在目前售價的 `±10%`，但不可低於最低毛利保護價；不滿足條件便拒絕給建議。
- 超過 48 小時／未提供時間，會標註資料不夠新。
- **沒有串接商家後台的商品改價 API，絕對不會自行發布售價**；調價前需人工覆核。

## 驗證命令
```sh
npm ci
npm run test:octuber-pricing
npm run test:model-tuning
npm run build
```

CI 只保證靜態／單元測試；仍需在真正 iPhone Safari、Android Chrome、桌面 WebGPU、實體 Ollama／自有 API 閘道執行下載、推論及權限安全測試。未執行真人裝置／主機測試不可宣稱驗證成功。
