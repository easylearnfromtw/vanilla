# 阿土伯 × 中華古典思想：轉成可驗證的 AI 工程策略

- 研究記錄：2026-10-21
- 原則：**前景不卡頓 > 次要效能指標；可證實 > 名稱好聽**。
- 歷史說明：「上下五萬年」不可視為有連續五萬年文字史的事實。本設計只引用具傳世文獻的古典思想以及現代 AI 科學，且**文獻思想與工程類比嚴格分開**。
- 與主研究文件 `ATUBER_NEURO_WORMHOLE_BLACKHOLE_NOBEL_2007_2026.md` 互補。僅保存提案，**沒有修改/部署 AI 執行程式**。

## I. 七個可實作的工程轉譯

| 源頭（實際文獻） | 核心原意 | AI 轉譯假說 | 接入點與優先 |
|---|---|---|---|
| 《孫子·虛實》：兵無常勢、水無常形、避實擊虛 | 依地形、敵情而變 | 壓力感知之推論排程（避免與前景渲染爭 CPU/GPU/VRAM）；有滯後控制避免頻繁切換 | `src/local-ai/engine.ts` / Ollama 服務，P0 |
| 《莊子·養生主》：庖丁解牛 | 順應結構和間隙，減少硬碰硬 | 「庖丁上下文」：把附檔、近期問題、工具結果、歷史訊息依原有語義結構分組，必要資訊完整保留，冗餘部分縮減 | `src/ai/context-budget.ts`，P0-P1 |
| 《道德經》第37章：無為而無不為 | 順勢而行，不做多餘干預（哲學） | Event-driven runtime：沒請求就不推論，事件觸發的監控與後台整理，避免熱輪詢/重複預載；不是不做正當必要工作 | runtime，P1 |
| 《墨子·非命上》：「言必有三表」 | 歷史依據、實際觀察、是否有益 | 三重工程閘門：Baseline 有來源、真機測量、有可衡量使用價值。證據不足不部署 | LUCA / CI，P0 |
| 《九章算術·盈不足》 | 由盈與不足等條件推算未知量 | 對 batch/context/CPU 限額做**有界迭代尋參**：過載則減小下一請求工作量，閒置且穩定則探索提高；不是宣稱現代二分搜尋由此直接發明 | 參數調校工具，P1 |
| 《史記·孫子吳起列傳》：田忌賽馬 | 資源依對手/任務順序配對 | Task↔resource matching：靜態規則/已知結果不進 LLM，真正需要生成的請求才喚起阿土伯；不預設再啟動第二個模型 | 工具與任務路由，P1 |
| 圍棋傳統（現代 AI 參考 AlphaGo 2016） | 長短期及局部/全局決策 | 對困難題才進行額外檢索／工具驗證；不要對每句話並行 tree-search，以免 0.6B 的本機負擔倍增 | 品質策略，P2 |

## II. 與先前黑洞／蟲洞／腦神經系統合併

### Wormhole × 庖丁：預填充與快取
1. 固定的 system prompt 前綴，確保 token 完全一致時才重用 KV cache（須 runtime 確認）。
2. 庖丁 ContextBudget 在 request 邊界分割語義塊，優先剔除重複工具輸出與不相關的舊訊息；必須保留當前指令、引用資料和結構化程式碼。
3. **不能**在「語意相近」時跨 prompt 強行復用 KV cache；也不能跨使用者共享敏感資訊。

### Blackhole × 道家：有界回收
1. 不運行就不增加另一個常駐「黑洞模型」；使用 TTL、LRU、記憶體高水位策略。
2. Worker、GPU、RAM 壓力高時停止非必要預取、延後新請求；不得中途任意清空使用中 KV。
3. 閒置清理須防止「反覆 unload/reload」造成第二種卡頓。

### 腦神經 × 孫子：事件驅動與資源回授
- 測量長任務、p95/p99 frame time、TTFT、tokens/s、RAM/VRAM 峰值，不把降低 TDP 等同不卡頓。
- 設 ingress/egress 閾值（hysteresis）和狀態冷卻期，避免排程器震盪。
- GPU 上 WebGPU Worker 不代表 GPU 本身與前景渲染隔離，因此同時測桌面/頁面幀時間。

### 墨家三表：三重上線閘門
**第一表：有本**：對照既有 Vanilla main 的 README、MODEL_TUNING、engine、context-budget、orchestrator，不複製既有 WebLLM 快取/佇列。
**第二表：有原**：真實設備同一 prompt、同一模型版本、同等品質要求下反覆測。
**第三表：有用**：只在前景卡頓減少且品質維持時啟用；即使 tok/s 上升、但掉幀惡化仍退回。

## III. 具體的自適應設定範例（政策，不是實際已啟用的參數）

```text
每個請求開始前：
  if 可驗證的完全相同前綴命中且 runtime 支援重用：
    重用部分 prefill KV
  context = 由「當前任務+必要指令+有用的引用資料」組成
  if GPU 記憶體緊張 / 前景近期幀時間惡化：
    不新增第二個平行推論；選擇低峰值的 batch/profile
  else:
    使用已測試、較快且安全的 profile
  送入獨立 Worker/推論程序，支援取消和串流
生成完成後：
  記錄 p95 UI delay、TTFT、RAM/VRAM 峰值、回答有效性
  有界更新下一請求的策略；不在生成中高頻重新載入模型
```

注意：「針對單一 prompt 改變 batch、ctx、GPU offload」不一定被 WebLLM/Ollama 的現有 API 支援，應先檢查各引擎實際能力。支持程度不足就採固定的 per-engine 安全模式，而不是承諾無法實現的動態行為。

## IV. 先做的工程試驗

| A/B 試驗 | 對照 | 有效定義 |
|---|---|---|
| A. Web Worker 失敗路徑 | 現有 fallback vs 不回退 UI 重型推論 | 長任務/掉幀不增加，失敗原因清楚 |
| B. 有界 prefill | 既有 prompt vs 依結構去重之 prompt | 正確性/引用不下降，TTFT/p95 掉幀改善 |
| C. 負載回饋 | 固定 profile vs 壓力門檻/冷卻期 | 系統繁忙情境幀時間改善；不頻繁重新載入 |
| D. Wormhole KV reuse | cache miss vs exact prefix hit | 命中可驗證，VRAM 不額外無界成長 |
| E. Blackhole GC | 不整理 vs TTL/LRU 空閒整理 | 長時間運作無 RAM 增長、無清理尖峰 |
| F. 任務資源匹配 | 一律 LLM vs deterministic task bypass | 不犧牲需要推理任務的品質 |

## V. 不採用項目
- 《易經》卜筮、風水、五行等不當作可直接使 GPU 加速或提高答案準確的科學證據。
- 「兵法／道家／庖丁」都只是可幫助設計的**比喻**；真實收益需要效能測試證實。
- 不因「道法自然」就關閉安全策略或刪除用戶歷史；不使用史籍代替軟體驗證。
- 不為多模組取名另增常駐推論實例，避免將本來要消除的卡頓加劇。

## VI. 可查證的一手／原始文獻和現代實作
1. 《孫子兵法》〈虛實〉：https://ctext.org/art-of-war/weak-points-and-strong/zh
2. 《莊子》〈養生主〉：https://zh.wikisource.org/zh-hant/莊子/養生主
3. 《道德經》（王弼本）第 37 章：https://zh.wikisource.org/zh-hant/道德經_(王弼本)
4. 《墨子》〈非命上〉「三表」：https://zh.wikisource.org/zh-hant/墨子/非命上
5. 《九章算術》〈盈不足〉：https://zh.wikisource.org/zh-hant/九章算術
6. 《史記》〈孫子吳起列傳〉（田忌賽馬）：https://ctext.org/shiji/sun-zi-wu-qi-lie-zhuan/zh
7. Silver et al., 2016, AlphaGo (Nature)：https://www.nature.com/articles/nature16961
8. 真實專案基礎：`docs/MODEL_TUNING.md`, `src/local-ai/engine.ts`, `src/ai/context-budget.ts`, `src/ai/model-orchestrator.ts`

### 性質聲明
這是建議架構與歷史思想轉譯，不是聲稱任何相關歷史人物做出現代 CPU/GPU 技術；尚未修改 Vanilla production 程式碼或實測真機。
