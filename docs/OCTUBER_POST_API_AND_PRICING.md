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
| OCTUBER SUMPTUOUS | 自架 Ollama | qwen3:30b | `octuber:sumptuous` | `october:lg` |

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
ollama list
```

檢視 ModelConnections 的「取得模型清單」可核對實際別名是否已安裝；通過真實回答驗證前不要視為可用。首次 0.6B 下載為網路／GPU 密集操作：瀏覽器不提供 WebGPU、Data Saver 已啟用而未快取、離線未快取時，會保守停下並允許使用者手動操作；下載成功不保證硬體能穩定推論。

## 已核發 API Key：三步啟用
1. 在「設定 → AI 模型」選「已取得 API Key？在這裡啟用」，貼上受信任的 `https://.../v1` 閘道和 `vnl_` Key。
2. 取得 `GET /v1/models`，核對模型 scope；查 `GET /v1/vanilla/usage` 配額。金鑰只存在此元件執行時的記憶體，不寫入 localStorage、聊天紀錄或 Drive。
3. 主動呼叫 `POST /v1/chat/completions` 做小額度實際推論，才顯示模型可運行。

此入口不負責**核發** Key／付款／代為配置雲端服務。既有 Owner 推論 API 預設仍關閉；只有確實啟動自有推論服務並通過 Owner 安全閘道驗證後才能對外提供。

## 比價資料匯入
三個站點僅是**人工開啟的比價入口**：
- BigGo <https://biggo.com.tw/>
- 飛比 <https://feebee.com.tw/>
- 樂天比價網 <https://www.lbj.tw/BJ/Default.aspx>

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
