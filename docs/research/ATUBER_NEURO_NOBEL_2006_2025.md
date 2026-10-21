# 阿土伯 Neuro-Inspired AI：蟲洞、黑洞、腦神經與近二十年諾貝爾研究轉譯

> 研究／工程設計紀錄 v1.0｜2026-10-21｜狀態：提案，尚未改動推論程式  
> 範圍：以 Vanilla 本地 Qwen3 0.6B 級阿土伯為主；同時考慮 WebLLM/WebGPU 與 Ollama 家用 GPU。  
> **首要目標：前景 UI、瀏覽器、桌面不因本地 AI 推論而卡頓；不是追求電費最低。**

## 0. 來源與證據規則

- 專案實況依倉庫 README.md、docs/MODEL_TUNING.md（2026-10-21 讀取），不是假設程式碼已完成。
- 「已研究的科學原理」不等於「已在阿土伯部署」；「借用設計理念」不等於諾貝爾得主提出該 AI 工程方法。
- 研究範圍選 2006–2025 共 20 個**已可查核的得獎年度**；為跨六個類別的相關性篩選，**不是宣稱逐人逐獎盤點這 20 年所有得主**。2026 年獎項未在本次資料檢索中可靠核實，不納入名單。
- 經濟學獎的正式名稱為「瑞典央行紀念阿爾弗雷德・諾貝爾經濟學獎」；與原設五項諾貝爾獎在歷史來源上不同。
- 來源類別：A 直接研究／成熟工程原理；B 經研究支持的跨領域轉譯；C 僅設計類比；D 無值得現階段採用的模型效能方案。
- 最終是否採用以阿土伯真機 A/B 測試決定，禁止將概念比喻列為效能增益證據。

## 1. 專案已有功能：先減少重造

根據 docs/MODEL_TUNING.md：WebLLM 既有 4,096 token 視窗、精簡提示詞、Qwen3 小模型關閉思考模式、Web Worker、串流、上下文預算與取消／逾時護欄；Worker 30 秒無進度時會嘗試回到主執行緒。Ollama 已有 num_ctx 預設 8192、keep_alive 30m、NDJSON 串流、停止與備援策略。Vanilla 可用 iPhone/WebGPU、Ollama 和使用者授權的 API；有雙答案比較模式。

**第一個待查風險：Worker 失效回到主執行緒可能直接導致前景 UI 長任務。** 應先重現、收集堆疊與效能指標，再考慮改成 UI 友善的安全降級（顯示錯誤、暫停／在同意範圍下轉 Ollama），而非無條件主執行緒推論。Web Worker 不會隔離 WebGPU 硬體爭用，仍須測 FPS。

雙答案比較若並行兩個本機生成任務，可能造成瞬間 VRAM／GPU 壓力：本機流暢模式預設序列化或暫停第二答案，不應破壞使用者主動要求的比較。

## 2. 所有概念完整留存

| 代號 | 想法 | 工程轉譯 | 狀態 |
|---|---|---|---|
| WORMHOLE | 「蟲洞」縮短路徑 | 穩定提示前綴、KV cache 同前綴重用、可驗證結果快取 | P1、現有引擎能力核實 |
| BLACKHOLE | 「黑洞」吸收無用資訊 | 上下文壓縮／淘汰、記憶體壓力監控、取消時資源回收 | P1，**不建獨立常駐 AI** |
| NEURON-SPARSE | 稀疏神經元 | 條件運算／原生 MoE、規則工具有需要才啟動 | 本機工作流程 P1；改模型結構 P3 |
| NEURON-EVENT | 事件驅動 | 無事件不輪詢、工具觸發式執行、低成本預處理 | P1 |
| NEURON-PLASTIC | 神經可塑性 | 👍👎 回饋形成可審核評估資料；必要時離線 LoRA 訓練 | P2，不在即時回覆時修改權重 |
| NEURON-MEMORY | 聯想及情節記憶 | 相關資訊檢索／位置錨點／短長期記憶分工 | P2 |
| NEURON-LOCALITY | 計算與記憶靠近 | 盡量少搬資料、壓低上下文、GPU/CPU 預算 | P0 |
| NEURON-ENERGY | 大腦約 20 W、約 860 億神經元 | 研究用比較；**不能據此將人腦轉換成 GPU FLOPS** | 背景研究 |
| SNN | 脈衝神經網路 | 事件編碼與專用硬體試驗 | P3，不替換 Qwen3 0.6B |
| MoE | 按 token 選專家 | 使用原生 MoE 模型或重新訓練 | P3；不可無訓練隨意刪 Transformer 層 |
| BitNet | 1.58 bit 權重架構 | 對照原生訓練 BitNet 模型 | P3；**不能將任意 GGUF 轉 Q4 就宣稱 BitNet** |
| ANTI-STUTTER | 「防卡頓執行核心」 | 推論與 UI 分離、限制搶佔、負載感知排程、可中止 | **P0 首要** |
| SLIME | 分散式／閒置節點 | 可選遠端推論及狀態監控 | 選配；並非本機不卡頓的必要條件 |

**黑洞與物理黑洞無需直接關聯**；2017 年 LIGO 的黑洞併合偵測可借鑑極弱訊號測量紀律，但不會產生「黑洞 AI 算法」。**蟲洞不是可直接增加 Transformer 算力的物理機制**；在此僅保留產品技術代號。

### Wormhole：嚴格快取正確性

- KV cache 僅在**模型版本、tokenizer、量化、精確 token 前綴、系統提示及會話隔離條件**匹配時重用；不能拿語意近似問題直接重用 Transformer KV。
- 確認實際 WebLLM 多輪 KV cache 能力，避免雙重實作；Ollama/llama.cpp 依實際後端的 prompt cache 或 prefix reuse 參數驗證。
- 使用者身分或私密上下文禁止跨使用者共用推論快取；工具結果另有來源、TTL、權限校驗。
- 量測 cache hit、prefill time、TTFT、RAM/VRAM；失配直接正常計算，寧可慢也不能答錯。

### Blackhole：安全的資訊生命週期管理

- 先固定必須保留的 system policy、最新用戶需求、尚未完成的工具狀態與引用來源；再按 token 預算整理過長歷史。
- 黑洞「刪除」指從**當次提示上下文**移出或釋放過期 runtime cache，**不是擅自刪除使用者對話、專案檔案或私人記憶**。
- 只能在引擎支援的安全時點釋放 KV／workspace；生成中的 cache 不得任意清空。
- 避免在 UI 忙碌期間啟動另一個模型來摘要；必要時放到閒置或背景安全程序，並防範壓縮時遺失重要指令與證據。

## 3. 2006–2025：六類獎項的可轉譯技術地圖（相關作品選）

讀表原則：「可轉譯」是我們自己的工程假說，**不是該得主的原研究結論**。

| 類別／年度、得主 | 真正獲獎研究 | 在 AI 的可轉譯應用 | 強度／處置 |
|---|---|---|---|
| 物理 2024，John Hopfield | 聯想記憶／模式恢復的神經網路基礎 | 研究可檢索聯想記憶、抗雜訊召回；不是把現有 Qwen3 換成 Hopfield 網路 | A 對研究，P2 |
| 物理 2024，Geoffrey Hinton | 以統計物理建立學習網路，包括 Boltzmann machine | 機率評估／表徵學習、蒸餾研究；不保證即時推論更省資源 | A 對研究，P3 |
| 物理 2021，Syukuro Manabe／Klaus Hasselmann | 複雜氣候系統模型與可預測性 | 建立長短期負載模型，區分噪音與趨勢 | B，P2 |
| 物理 2021，Giorgio Parisi | 無序系統與隨機波動的物理 | 研究隨機、非穩態條件下的性能分布，不只量平均值 | B，P2 |
| 物理 2017，Rainer Weiss／Barry Barish／Kip Thorne | LIGO 重力波偵測 | 儀器校準、雜訊排除、獨立指標交叉驗證的量測紀律 | B，P0 |
| 化學 2024，David Baker | 計算蛋白質設計 | 先定義需求與限制再找可行結構；工程設計方法論 | C，P2 |
| 化學 2024，Demis Hassabis／John Jumper | 蛋白質結構預測（AlphaFold） | 領域知識 + 模型結構 + 可評估的信心指標；可設計外部驗證器，不是讓 0.6B 自評就可信 | A 對 AI 方法，P2 |
| 化學 2020，Emmanuelle Charpentier／Jennifer Doudna | 基因組編輯 | 借鏡「精確、可回滾」的模組修補：版本化設定、功能旗標；非 CRISPR 演算法 | C，P2 |
| 化學 2022，Carolyn Bertozzi／Morten Meldal／K. Barry Sharpless | Click／生物正交化學 | 借鏡界面清晰、低副作用的工具連接契約；不是化學直接加速 LLM | C，P2 |
| 化學 2025，Susumu Kitagawa／Richard Robson／Omar Yaghi | 金屬有機框架（MOF） | 目前找不到可靠的阿土伯低卡頓直接路線 | D，暫不採用 |
| 生醫 2014，John O'Keefe／May-Britt Moser／Edvard Moser | 位置細胞、網格細胞 | 語義／專案場景的記憶位置索引、錨點檢索（不等於真的複製 grid cell） | B，P2 |
| 生醫 2017，Jeffrey Hall／Michael Rosbash／Michael Young | 晝夜節律分子機制 | 非即時工作在可預測的閒置時段執行；避免在人操作時預載模型 | B，P1 |
| 生醫 2019，William Kaelin／Peter Ratcliffe／Gregg Semenza | 細胞感知氧氣與適應 | 資源壓力回授：VRAM/RAM 壓力、GPU 忙碌時調低新任務負載 | B，P0 |
| 生醫 2021，David Julius／Ardem Patapoutian | 溫度與觸覺受器 | 事件觸發的狀態感測、門檻與 hysteresis；不要每毫秒反覆更動設定 | B，P1 |
| 生醫 2024，Victor Ambros／Gary Ruvkun | microRNA 基因表現調控 | 以外部控制訊號決定何時開啟功能／工具；不聲稱等同神經元 | C，P2 |
| 生醫 2025，Mary Brunkow／Fred Ramsdell／Shimon Sakaguchi | 周邊免疫耐受 | 受限權限、抑制錯誤動作的安全守門設計；不直接提升推論吞吐 | C，P2 |
| 經濟 2019，Abhijit Banerjee／Esther Duflo／Michael Kremer | 實驗方法評估減貧方案 | 隨機對照／分層 A/B 評估效能優化，避免測試偏誤 | B，P0 |
| 經濟 2020，Paul Milgrom／Robert Wilson | 拍賣理論與機制設計 | 多工作負載競爭 GPU 時的資源分配規則（非必要採拍賣演算法） | B，P2 |
| 經濟 2009，Elinor Ostrom／Oliver Williamson | 治理公地、組織交易 | Slime 多節點的權限、資源公平與可撤銷權；阿土伯單機非核心 | C，P2 |
| 經濟 2024，Daron Acemoglu／Simon Johnson／James Robinson | 制度與繁榮 | 管理員權限、回饋可追溯與治理架構；不是模型加速方法 | C，P2 |
| 經濟 2025，Joel Mokyr／Philippe Aghion／Peter Howitt | 創新帶動成長、創造性破壞 | 用基準測試與回退機制淘汰不佳的演算法，而非累積死功能 | B，P1 |
| 文學 2015，Svetlana Alexievich | 多聲部記述（polyphonic writings） | 多來源交叉驗證、不同觀點與引用分開；**與運算卡頓無直接關係** | C，內容品質 P2 |
| 和平 2024，日本原水爆被害者團體協議會 Nihon Hidankyo | 原爆倖存者見證、核武人道風險 | 來源可追溯、重大風險情境避免只依單一模型陳述；**不是 AI 效能論文** | C，安全 P2 |

### 哪些不應硬套

- 量子穿隧、量子糾纏、黑洞、MOF 等物理／化學成果**不能**直接當作「CPU 或 RTX 3050 更快」的軟體解法。
- Hopfield 網路的「能量函數」是數學目標函數，不是 GPU 耗電瓦數。
- 神經元尖峰活動 ≠ GPU 自然會事件驅動運算；沒有稀疏 kernel／合適硬體，SNN 可能更慢。
- 以 Q4 壓縮 Qwen3 的權重 ≠ 原生 BitNet 1.58-bit 網路；改 MoE／跳層不經驗證可能損失品質。
- 諾貝爾獎的跨領域類比不是科學驗證；任何功能都不能用得主的名聲代替基準測試。

## 4. 真正優先改寫阿土伯的執行策略

### P0：Anti-Stutter Runtime（不動權重）

1. **量測先行**：Web 前景 RAF frame time、Long Tasks、互動延遲近似指標、頁面可用 RAM（瀏覽器支援時）、TTFT、prefill/s、decode tokens/s、取消延遲。Windows Ollama 主機另量 GPU 利用率、VRAM、CPU 使用、整機可用 RAM、同時執行的前景程式；不從單一 GPU utilization 判定「電腦不卡」。
2. **Worker 不退回 UI 主線程**：針對現有「30 秒無進度自動退回主執行緒」建立回歸測試；設備支援時採 Worker，Worker 失敗應明示受控降級，不應在主線程進行會阻塞輸入的推論。
3. **非阻塞佇列**：本機預設一次只有 1 個活躍生成；具取消語意和最新請求優先；相同請求去重但不可跨權限。
4. **控制 prefill 尖峰**：在支援的 runtime 透過 prefill chunk／batch／microbatch 調參；限制一次長提示；但不能盲目把大 batch 越切越碎導致 TTFT 大幅變慢。
5. **GPU / RAM headroom**：由真機 VRAM 實測決定安全餘量，不預設 RTX 3050 一定 6 GB 或 8 GB；避免記憶體溢出與桌面 compositor 擠壓。
6. **回退**：任何優化旗標可快速關閉；不因追求速度犧牲輸出正確性、隱私或使用者允許的推論邊界。

### P1：Wormhole、Blackhole、負載回授

- 穩定提示詞前綴與可行後端 KV reuse；維持 hit/miss 計數與跨會話隔離測試。
- 以 token-budget 壓縮過長輸入；附帶原始來源、不得合成不存在的引用。
- 動態負載閾值與遲滯 (hysteresis)：超出多次連續量測才啟用流暢模式，恢復也需連續回穩；避免來回切換造成重載。
- 空閒時整理／回收不需要的快取；正在推論時不強制清空 KV 或重新載入模型。
- 既有模型 keep_alive=30m 作為實測起點：縮短會節省常駐記憶體但可能增加重載卡頓，需比較。

### P2：聯想記憶、神經可塑性與回饋

- 將長期記憶放在外部索引，按問題需求檢索（RAG／持久知識庫）；不是增加阿土伯常駐參數。
- LUCA 將 👍👎、答案品質、工具成功率與效能觀測分離；不把一個主觀好評直接當訓練標籤。
- 離線訓練／蒸餾受人工檢查與固定測試集約束。禁止每次請求即時微調引發卡頓。
- 多觀點模型評論、引用核驗可提升品質但增加 token；只在需要時執行。

### P3：模型研究（不列為生產保證）

- 原生 MoE、實際 sparse inference、BitNet 原生模型、SNN 與專用硬體；另列品質、相容性、記憶體、latency、WebGPU 支援成本。
- 只有在相同問題集上同時改善「前景不卡 + 答案不退化」才考慮遷移。

## 5. 量測及驗收契約

基線至少包含：空閒桌面、瀏覽器滑動、播放影片、Vanilla 動畫＋阿土伯短 prompt、長 prompt、連續 10 回合、取消中途生成、Worker 初始化失敗、低 VRAM 壓力、Ollama 模型載入、雙答案比較。

- 優先量 **p95/p99 frame time**、Long Task > 50ms 數量、主執行緒被占用時間、TTFT、tokens/s、OOM／WebGPU device lost、取消後仍持續計算之時間、RAM/VRAM 峰值。
- 初步工程門檻（是提議的測試標準，不是已達成結果）：優化後對照原基線，前景 p95 幀時間與長任務至少不能變差，目標減少高峰掉幀 25%；沒有跨會話資料洩漏、不能錯誤重用 KV；不新增未獲同意的外部模型或付費 API。
- 以「正確性／品質通過率」為硬閘門，再以 UI 流暢度改善決定是否部署；GPU 功率與電費只列次要診斷資訊。
- 針對 RTX 3050 的硬體容量及 Windows 驅動先收集事實，不推定最佳 threads／batch／VRAM 數字。

## 6. 擬建模組與對應現有架構

- **src/ai/runtime/anti-stutter.ts**（擬新增）：任務佇列、front-end 壓力訊號、取消、限制並行、回退開關；不可在前端維持無界輪詢。
- **src/ai/runtime/wormhole-cache.ts**（擬新增或接入引擎）：KV cache 支援探測、提示前綴指紋、per-session scope、TTL；避免重複已存在的 WebLLM cache。
- **src/ai/runtime/blackhole-budget.ts**（擬新增或擴充 context-budget.ts）：上下文分段、必留資料保護、記憶體回收政策、來源 metadata。
- **src/ai/runtime/neuro-signals.ts**（擬新增）：event-trigger、hysteresis、行為變更紀錄。
- **LUCA**：前景延遲、TTFT、VRAM、工作失敗與回答品質分開報表。
- **測試**：保留 npm run test:webllm-guard／test:model-tuning／test:reliability，新增主執行緒阻塞、OOM 退化、KV cross-user isolation 及取消實測。

以上路徑僅為設計草案，不代表已建立程式檔或已部署。

## 7. 優先決策紀錄（可變更）

- ACCEPT：Wormhole 嚴格前綴快取；Blackhole 上下文預算與回收；Anti-Stutter、事件驅動工具；嚴謹 A/B 測試。
- HOLD：Hopfield-inspired 記憶、Grid-cell-inspired 索引、免疫/miRNA 式規則守門、原生 MoE、SNN、BitNet 替換。
- REJECT for now：為「黑洞」額外常駐模型、任意 Transformer 層跳躍、聲稱普通量化等於 BitNet、從黑洞/蟲洞物理學直接推導出 GPU 加速。
- **禁止把研究文件當成已完成部署**。下一步應開 P0 性能回歸測試的獨立 PR。

## 8. 科學及實作參考（核對日 2026-10-21）

### 諾貝爾官方來源
1. 2024 物理／Hopfield、Hinton：https://www.nobelprize.org/prizes/physics/2024/press-release/
2. 2024 化學／Baker、Hassabis、Jumper：https://www.nobelprize.org/prizes/chemistry/2024/press-release/
3. 2014 生醫／Place/Grid cells：https://www.nobelprize.org/prizes/medicine/2014/advanced-information/
4. 2017 生醫／Circadian rhythms：https://www.nobelprize.org/prizes/medicine/2017/advanced-information/
5. 2019 生醫／Oxygen sensing：https://www.nobelprize.org/prizes/medicine/2019/advanced-information/
6. 2021 生醫／Temperature and touch：https://www.nobelprize.org/prizes/medicine/2021/advanced-information/
7. 2024 生醫／microRNA：https://www.nobelprize.org/prizes/medicine/2024/summary/
8. 2025 生醫／Peripheral immune tolerance：https://www.nobelprize.org/prizes/medicine/all-nobel-laureates-in-physiology-or-medicine/
9. 2021 物理／Complex systems：https://www.nobelprize.org/prizes/physics/2021/press-release/
10. 2017 物理／LIGO：https://www.nobelprize.org/prizes/physics/2017/press-release/
11. 2020 化學／CRISPR：https://www.nobelprize.org/prizes/chemistry/2020/summary/
12. 2022 化學／Click chemistry：https://www.nobelprize.org/prizes/chemistry/2022/summary/
13. 2025 化學／MOF：https://www.nobelprize.org/prizes/chemistry/2025/press-release/
14. 2019 經濟／Experiment：https://www.nobelprize.org/prizes/economic-sciences/2019/summary/
15. 2020 經濟／Auctions：https://www.nobelprize.org/prizes/economic-sciences/2020/press-release/
16. 2009 經濟／Governance：https://www.nobelprize.org/prizes/economic-sciences/2009/press-release/
17. 2024 經濟／Institutions：https://www.nobelprize.org/prizes/economic-sciences/2024/press-release/
18. 2025 經濟／Innovation：https://www.nobelprize.org/prizes/economic-sciences/2025/press-release/
19. 2015 文學／Alexievich：https://www.nobelprize.org/prizes/literature/2015/summary/
20. 2024 和平／Nihon Hidankyo：https://www.nobelprize.org/prizes/peace/2024/summary/

### AI 推論實作來源
21. WebLLM Web Worker & multi-round KV cache：https://github.com/mlc-ai/web-llm
22. llama.cpp server KV reuse：https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
23. BitNet 原生模型／工具鏈：https://github.com/microsoft/BitNet
24. 專案自身紀錄：README.md；docs/MODEL_TUNING.md

> 文件為研究與提案，不代表諾貝爾研究直接證實其中跨領域功能有效。