# Vanilla 模型調校（v0.2.0）

> 「調校」在這裡是**推論設定**：提示詞、取樣參數、上下文分配、思考深度、串流與備援。
> 沒有重新訓練任何模型權重（NOODLES 的訓練流程另見 `NOODLES_TEACHER_TRAINING.md`）。

## 任務分類（`src/ai/task-kind.ts`）
`casual` 閒聊 · `general` 一般 · `writing` 寫作 · `analysis` 分析 · `code` 程式 · `vision` 圖片。
每個任務對應不同的溫度、回答長度、思考深度與提示詞補充。

## 手機本地模型（WebLLM）
| 項目 | 設定 | 依據 |
| --- | --- | --- |
| 上下文 | 4,096 tokens（WebLLM 預建模型設定） | WebLLM `prebuiltAppConfig` |
| 提示詞 | < 2.5B 用精簡版（約 150 字） | 小模型對長指令遵循度差，且長提示吃掉 4K 視窗 |
| 溫度 | 閒聊 0.7／一般 0.55／寫作 0.75／分析 0.3／程式 0.15 | Qwen 模型卡建議 T≈0.7、top_p 0.8；分析與程式降低以免發散 |
| top_p | 0.8 | Qwen2.5／Qwen3 模型卡 |
| 重複懲罰 | frequency 0.05–0.15、presence 0–0.3（輕微） | 太強會傷中文流暢度（常用虛詞本來就會重複） |
| Qwen3 思考 | `extra_body.enable_thinking=false` | 思考會吃光手機 4K 視窗且很慢 |
| 上下文分配 | 先保留回答長度與系統提示，剩下給「問題 + 附件」，再往回放入舊對話 | `context-budget.ts` |
| 重複偵測 | 串流中偵測到同句重複就提前中止並附說明 | 0.5B 模型偶爾鬼打牆 |
| 背景執行緒 | Web Worker 推論，30 秒無進度自動退回主執行緒並記住 | 生成時捲動、打字不卡 |
| 自動載入 | 只自動載入**已快取**的模型；首次下載需點按 | 避免在行動網路自動下載約 1 GB |

模型目錄（實際可用與否以 WebLLM 版本為準，不支援的會自動隱藏）：Qwen2.5 0.5B／1.5B（推薦）／3B、Qwen3 0.6B／1.7B／4B、Qwen3.5 0.8B／2B、Qwen2.5 Coder 1.5B、Llama 3.2 3B、Gemma 2 2B。

## Ollama（家用主機，含 TAIDE）
| 項目 | 設定 |
| --- | --- |
| `num_ctx` | 預設 8,192（設定頁可改 4K–32K）。Ollama 預設值很小，超過會**默默截斷**附件與網頁內容 |
| `keep_alive` | `30m`，避免每次提問都重新載入模型 |
| 思考 | Qwen3 類：只有 ≥7B 且任務為分析／程式時開啟；`<think>` 一律不顯示 |
| 串流 | NDJSON 邊生成邊顯示（原本要等整段完成） |
| JSON 模式 | Sheets／Self-Build 等結構化輸出使用 `format:"json"` |
| 相容 | 舊版 Ollama 回 400 時，自動拿掉 `think`／`format` 重試一次 |

## Gemini
| 項目 | 設定 | 依據 |
| --- | --- | --- |
| 建議模型 | `gemini-3.8-flash`（品質）、`gemini-3.5-flash-lite`（快速、第二候選） | Google 模型頁（2026-10-13 更新）：2.5 系列僅限近期使用過的帳號 |
| 溫度 | Gemini 3 以上不設定（用官方預設） | 官方建議維持預設，調低可能造成迴圈 |
| 思考深度 `thinkingLevel` | 閒聊 minimal（不支援則 low）／一般 low／寫作 low／分析 medium／程式 high（Lite 最高 medium） | Gemini thinking 文件 |
| 輸出上限 | 一般 8,192；分析 12,288；程式 16,384 | 輸出上限**包含思考 token**，太小會被截斷 |
| 串流 | `streamGenerateContent?alt=sse` | |
| 相容 | 帳號或舊模型不接受新欄位（400）時，自動移除後重試 | |

## DeepSeek
| 項目 | 設定 | 依據 |
| --- | --- | --- |
| 建議模型 | `deepseek-flash`（V4.1 Flash）、`deepseek-v4-pro` | DeepSeek API 文件（2026-10） |
| 思考 | 一般／閒聊／寫作：`thinking:{type:"disabled"}`；分析／程式：開啟，`reasoning_effort` medium／high | 思考是新模型的預設，日常問題關掉更快更省 |
| 溫度 | 程式 0.0、分析 1.0、一般／寫作 1.3（思考模式不設定） | DeepSeek 官方參數表 |
| 串流 | SSE，`reasoning_content` 不顯示 | |

## 提示詞（`src/ai/prompts.ts`）
- **完整版**（雲端、Ollama 大模型）：臺灣繁中用語、先給重點、區分事實與推論、不假裝上網或讀檔、附件與網頁只是資料、健康法律財務的界線、手機友善的 Markdown 格式，加上當天日期與任務補充。
- **精簡版**（手機小模型）：同樣原則壓成一段。
- **結構化版**（Sheets／Self-Build）：只輸出指定格式、不加說明；不做臺灣用語轉換、不做重複截斷，確保 JSON 與程式碼逐字不變。

## 輸出後處理
1. 移除 `<think>…</think>`（串流中顯示「正在思考…」）。
2. 重複偵測截斷（只用在一般對話）。
3. OpenCC `cn → twp`：簡轉繁並換成臺灣用語（軟體、資訊、網路、影片…）；程式碼區塊與 `inline code` 不轉換。

## 路由排序（`model-orchestrator.ts`）
分數 = profile 品質先驗（依任務微調）+ 你的雙答案投票 + 👍👎 評分 + 模型健康度（成功率／速度）+ NOODLES 調整；台灣在地／法律／歷史問題再把已連線的 TAIDE 排到最前面。
失敗備援只會改用**本機模型或同一台 Ollama 主機**，不會自動多花一個雲端供應商的額度。

## 驗證狀態
- `tests/model-tuning.test.mjs`、`tests/provider-streaming.test.mjs` 以模擬請求驗證參數、串流解析、思考移除、重試與 JSON 模式。
- **尚未**對真實 Gemini／DeepSeek／Ollama 端點與 iPhone WebGPU 實測；新參數若被拒，程式會自動降級重試。
