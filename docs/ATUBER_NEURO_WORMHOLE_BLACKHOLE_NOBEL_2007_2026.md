# 阿土伯：腦神經、蟲洞、黑洞與諾貝爾獎啟發的 AI 技術研究（2007–2026）

- 建立日期：2026-10-21
- 狀態：研究與設計提案（尚未部署；不是性能成果聲明）
- 適用範圍：Vanilla 裝置端 WebLLM/WebGPU、Ollama 自架主機、阿土伯 Qwen3 0.6B 相關工作流程；模型別名及權重以實際安裝狀態為準
- 第一目標：**AI 執行時網站和本機仍能流暢操作**。不把降低電費或節省焦耳數設為第一 KPI。
- 文獻範圍：2007–2026 年近二十年的**精選**諾貝爾得獎工作，涵蓋六類獎項；非 20 年每位得主的完整名錄。

## 0. 已核對的 Vanilla 程式基準（不要重新發明）

依 2026-10-21 GitHub main 分支：
- `README.md`：Vanilla 為 React+Vite PWA；裝置端透過 WebLLM/WebGPU、遠端可使用 Ollama；手機 local 和遠端家用主機資源界線不同。
- `docs/MODEL_TUNING.md`：WebLLM 預設約 4096 context、小模型提示詞精簡、Qwen3 小模型關閉思考、上下文預算、串流、Worker 和備援；Ollama 使用 keep_alive=30m、串流及上下文配置；已具備取消／逾時可靠性護欄，但真實設備實測尚未完整完成。
- `src/local-ai/engine.ts`：`WebWorkerMLCEngine` 背景執行；在部分失敗路徑可切主執行緒，iOS 已有特別的安全限制；需確認 Windows/Web 桌面退回主執行緒時的互動卡頓。
- `src/ai/context-budget.ts`：已有 `estimateTokens`、`fitHistory`、`composeUserPrompt`；目前估算而非 tokenizer 精確計數。
- `src/ai/model-orchestrator.ts`：已具 `localInferenceQueue`、候選模型、偏好記錄及可靠性機制。
- 因此新設計應以**增量改良現有系統**為原則，不加兩個額外常駐 LLM。

## 1. 前述構想完整登錄表

| 名稱 / 科學啟發 | 具體工程轉換 | 適用範圍 | 對桌面流暢的實質性 | 決議 |
|---|---|---|---|---|
| 蟲洞 Wormhole：捷徑 | 完全一致 token 前綴的 KV/prefix cache；已有結果且未過期的工具結果重用；快取失效策略 | WebLLM/Ollama（須引擎支援） | 可減少重複 prefill，**不保證**每次加速 | P1 保留 |
| 黑洞 Blackhole：資源回收 | 上下文／附件預算、過期快取回收、取消時釋放不再使用資源、記憶體壓力閥值 | 兩端 | 高，須避免 GC 尖峰 | P0–P1 保留功能；不加模型 |
| 腦神經事件驅動 | 工具/監控只在事件到達才執行；推論排程避免無效輪詢 | 應用層 | 中至高 | P1 |
| 稀疏活動 | 有條件跳層、稀疏注意力、MoE | 模型結構/執行器 | 對 Qwen3 0.6B 無直接安全開關 | 研究 |
| 脈衝神經 SNN | 時序脈衝運算、神經形態晶片 | 感測/研究硬體 | 一般 GPU 不保證省資源 | 暫緩 |
| 類比/數位混合、記憶和計算共址 | 降低 CPU↔GPU 資料搬移、算子融合和量化 | 執行器/硬體 | 中至高；量測後決定 | P1 |
| 脑神經突觸可塑性 | 使用者回饋、離線評估、LoRA/蒸餾（只有離線試驗成功才更新權重） | 訓練流程 | 不直接提升前景順暢 | P2 |
| Hopfield 聯想記憶 | 可檢索的長期記憶候選方案；RAG/圖索引先行 | 記憶層 | 頻繁檢索會額外耗資源 | P2 |
| Anti-Stutter Runtime | Worker/獨立程序、批次上限、CPU 優先權、GPU/VRAM 預留、單機推論併行上限、可立即取消 | 本機推論 | **最高** | P0 |
| 黑洞搜尋 / 蟲洞物理學算法 | 物理詞語比喻，沒有已證明的現成 Qwen3 加速機制 | 不採用 | 不明 | 拒絕預設導入 |
| 20 W 大腦低功耗 | 人腦約 20 W 為生理能量消耗量級；不代表與 Transformer 或 GPU 存在可換算 FLOPS | 理論 | 不應做成績效宣稱 | 科學背景 |

## 2. 諾貝爾獎→AI 技術對照（獎項內容為事實；AI 應用為本專案的工程推論）

證據標記：**A**=直接成熟或有成熟相鄰工程實作；**B**=跨領域概念類比，需要實驗驗證；**C**=長期硬體/研究，短期不適用。標記說的是「此轉用的成熟度」，並非否認原始獲獎成果。

| 年份 / 獎項 / 得主 | 獲獎研究要點 | 對阿土伯的構想 | 級別 / 優先級 |
|---|---|---|---|
| 2007 物理：Albert Fert、Peter Grünberg | 巨磁阻效應 GMR | 儲存裝置讀取技術與資料搬移成本的硬體背景；不等於 Python 加速 | C / 暫緩 |
| 2012 經濟：Alvin Roth、Lloyd Shapley | 穩定分配與市場設計 | 候選工具/節點和任務的有約束匹配；單一模型無須另造穩定婚配引擎 | B / P2 |
| 2013 化學：Martin Karplus、Michael Levitt、Arieh Warshel | 複雜化學系統多尺度模型 | 精細處理必要部位、粗略處理其他部位；轉為「快路徑 vs 精路徑」設計，不能直接刪 Transformer 層 | B / P2 |
| 2014 醫學：John O'Keefe、May-Britt Moser、Edvard I. Moser | 位置細胞與網格細胞 | 建立語義/專案記憶索引與導航；概念類比，不宣稱 grid cells = RAG | B / P2 |
| 2016 醫學：Yoshinori Ohsumi | 自噬與回收細胞成分 | Blackhole：TTL/LRU 快取回收、孤兒工作清理、閒置緩衝釋放；勿刪正在被推論使用的 KV | A（工程已有 GC 原理，生物連結屬類比）/ P1 |
| 2017 醫學：Jeffrey Hall、Michael Rosbash、Michael Young | 生物晝夜節律 | 預測使用峰谷來安排模型載入/卸載；避免過度學習固定時間 | B / P2 |
| 2017 文學：Kazuo Ishiguro | 以敘事處理記憶、過去與不可靠理解 | 對話長期記憶須區分事實、來源、推論、遺忘；這是 UX 和品質靈感而非加速演算法 | B / P2 |
| 2018 醫學：James Allison、Tasuku Honjo | 免疫抑制性調節與檢查點 | 避免重複、不必要的工具喚起；安全政策和計算閘門分離；不應模仿解除生物「剎車」來取消安全審查 | B / P1 |
| 2018 化學：Frances Arnold | 酵素定向演化 | 離線候選參數→基準測試→保留較好版本，並設退回機制；勿在線上無限制自修改權重 | A（搜尋/選擇迴圈）/ P1 |
| 2021 醫學：David Julius、Ardem Patapoutian | 溫度與觸覺受器 | 事件門檻式感測：CPU/VRAM 壓力超標才觸發降載，但要有 hysteresis 避免抖動 | B / P0 |
| 2021 和平：Maria Ressa、Dmitry Muratov | 表達自由與可信新聞 | 結果可追溯、來源與未查證內容清楚標示；是安全及治理規範，不提高推論速度 | B / 持續 |
| 2022 經濟：Ben Bernanke、Douglas Diamond、Philip Dybvig | 銀行和金融危機 | 針對併發工作預留安全容量、排隊和斷路器；純工程類比 | B / P0 |
| 2024 物理：John Hopfield、Geoffrey Hinton | 人工神經網路的基礎發明 | Hopfield 記憶檢索；權重/學習理論；現有 Qwen3 不因此自動加速 | B / P2 |
| 2024 化學：David Baker、Demis Hassabis、John Jumper | 蛋白質設計、蛋白質結構預測 | 結構化表示、約束與不確定度報告、反覆驗證；不直接替 LLM 計算加速 | B / P2 |
| 2024 醫學：Victor Ambros、Gary Ruvkun | microRNA 的轉錄後調控 | 可插拔調節層：工具閘門、推論參數、回覆長度限制，而非重訓核心權重 | B / P1 |
| 2025 物理：John Clarke、Michel Devoret、John Martinis | 電路中的巨觀量子穿隧/能階量化 | 量子硬體研究；**不**把量子穿隧當既有 GPU LLM 加速途徑 | C / 暫緩 |
| 2025 經濟：Joel Mokyr、Philippe Aghion、Peter Howitt | 創新與創造性破壞 | 實驗性替換舊版策略，做 A/B 及回滾；不是模型自我改寫免審核 | B / P2 |
| 2026 醫學：Karl Deisseroth、Peter Hegemann、Georg Nagel | 光遺傳學與精準控制神經元活動 | **可控開關 + 消融試驗**，逐個停用快取/黑洞/預填充模組量測因果影響；不是光控電腦神經元 | B / P0（實驗方法） |
| 2026 物理：Francis Halzen | IceCube 天體高能中微子探測 | 少見訊號偵測、噪聲過濾與持續觀測；LUCA 偵測罕見掉幀/卡死；不宣稱使用中微子運算 | B / P1 |
| 2026 化學：Henri B. Kagan、Kensō Soai | 不對稱合成中的非線性效應/自催化 | 研究正回饋迴路：好路由選擇可強化，但須防止回饋放大錯誤、模式崩潰 | B / P2 |
| 2026 經濟：Robert E. Hall、Michael Woodford | 具微觀基礎的總體穩定化研究 | 有界負載控制迴圈：量測→回應→冷卻；不把總經模型直接搬成程式 | B / P1 |

> 文學與和平獎不提供可直接提升 GPU 效能的數學方法，主要用於回覆品質、來源治理與產品倫理。不可用得獎者名氣取代工程驗證。

## 3. 阿土伯 P0：真正抗卡頓的執行設計

### 3.1 明確區分兩條推論路徑
1. **瀏覽器 WebLLM/WebGPU**（含 iPhone/桌面）：採 Web Worker 優先、UI 只接串流訊息；除非符合裝置安全政策且使用者明確選擇，否則不要因 Worker 失敗而悄悄把大量運算搬到主執行緒；保留現行 iOS 安全限制。
2. **Ollama 自架桌機（例如 RTX 3050）**：推論在遠端/本機主機進程，不是 iPhone 的本地 WebLLM。調整主機上的 `num_ctx`、CPU/執行程序優先權、GPU 記憶體安全餘量、併發及模型 keep_alive；不要把 llama.cpp 指令列參數假定一定能直接作用於 WebLLM。

### 3.2 背壓 + 取消 + 資源上限
- 所有本地生成以現有 `localInferenceQueue` 串行或有限併發，防止重複同時 prefill。
- 控制 prefill 分批工作量；若引擎不支援動態設定，選擇安全的靜態上限並記錄拒絕原因。
- 「停止生成」後確認工作真的停止、資源釋放；不能僅關閉顯示。
- 實際可用 VRAM 不明時先探測，不硬編碼 RTX 3050 的 6GB/8GB/其他容量；保留顯示桌面與瀏覽器所需餘量。
- 壓力感測使用進入門檻和退出門檻（hysteresis）；避免每秒頻繁切換 GPU/CPU 或載入模型。
- 快取有大小上限與失效策略，並區分權限／私人會話，不跨不相同使用者重用內容。

### 3.3 Wormhole 精確前綴重用
- Token 前綴及模型版本、tokenizer、量化、prompt template、系統指令、adapter 等必須相容；更換配置使快取失效。
- KV cache 是**模型內部狀態**，不是一般語義相似查詢。語義相似僅允許命中帶有來源、TTL、版本與權限界線的**工具結果快取**，不得把舊文字直接冒充新推論。
- 先檢查 WebLLM/Ollama 目前底層是否已自動使用 KV/共用前綴快取；若已有便只加命中率觀測，避免「重做同一套快取」造成記憶體變多。

### 3.4 Blackhole 有界垃圾回收
- 只在請求邊界或安全的空閒時段執行清理；不可任意刪除運作中的 KV Cache。
- 非必要聊天內容可摘要，但需可追溯、保留來源/時間及最近原文；不得把推測當原始記憶。
- 以 TTL + LRU + memory-pressure high-watermark 清除過期、不使用的資源。
- 清理不得刪使用者明確保存的資料或尚待授權的機密。

## 4. 實作階段、驗收、停止條件

| 階段 | 改動 | 驗收量測 | 風險 |
|---|---|---|---|
| P0-A | Windows GPU 主機 / iPhone WebLLM / 桌面 WebLLM 三路建立基準 | p50/p95 首 token、tok/s、UI 輸入延遲、掉幀、RAM/VRAM 峰值、取消完成時間 | 裝置差異 |
| P0-B | Worker 安全與主執行緒降級政策 | Worker 失敗不悄悄造成持續掉幀；可取消且顯示真實錯誤 | 舊設備可能減少備援 |
| P0-C | 排隊、背壓、prefill 批次、記憶體水位 | 同時提問不推高 RAM 到 paging；UI 指標改善 | 吞吐可能下降 |
| P1-A | Wormhole exact-prefix/工具結果快取 | 命中率、節省 prefill 時間、快取 RAM 成本；答案一致 | 過期/權限資料 |
| P1-B | Blackhole 回收和上下文裁剪 | 長時間運作後無持續成長；重要附件不被隱形截斷 | 錯誤刪除/GC 尖峰 |
| P1-C | 自動壓力控制與 LUCA | 門檻觸發可重現，復原時無反覆震盪 | 誤判前景資源 |
| P2 | 記憶索引、LoRA/蒸餾、稀疏/SNN 實驗 | 品質對照、延遲、相容性與端到端效能 | 訓練/硬體成本 |

**建議先設驗收目標，非承諾：**
- 同一台裝置、同一模型、同一測試集的前景操作 p95 延遲及掉幀相對基準改善；長任務不凍結 UI。
- 任何優化不得造成資訊安全隔離失效、答案無聲截斷、取消後背景任務繼續佔滿資源。
- 回答品質下降或資源峰值惡化即回滾；不得用「更少 token」掩蓋答案內容缺失。
- Web Worker 崩潰、GPU OOM、下載進度卡在 `Start to fetch params`，都需保留可理解的錯誤與修復指引。

## 5. 建議工程變更位置（現有檔案，非已完成實作）
- `src/local-ai/engine.ts`：Worker/主執行緒備援、快取能力探測、資源卸載。
- `src/ai/context-budget.ts`：精確/估算 token 區分、摘要與截斷可見性。
- `src/ai/model-orchestrator.ts`：調度背壓、取消傳遞、壓力模式。
- `src/detroit/zeus`（確切入口以檔案內容為準）：現有推論佇列的容量策略。
- `src/ai/model-health.ts`（確切入口以檔案內容為準）：模型健康指標與回歸資料。
- `docs/MODEL_TUNING.md`：將測得的裝置別最佳參數記錄，而非憑空決定。

## 6. 明確不做
- 不把 20W 人腦與 GPU TFLOPS 直接比較。
- 不把黑洞、蟲洞、量子穿隧當現有 Qwen3 的捷徑運算指令。
- 不強制把 Qwen3 0.6B 改成 SNN/MoE；除非另行規劃模型重訓及相容性驗證。
- 不加兩個常駐 AI 管理模型；不對同一任務預設同時啟動多模型。
- 不在高記憶體壓力時清除進行中推論狀態；不在 iOS 不安全情況下自動搬到主執行緒。
- 不以降低功率或削減答案長度替代「不卡頓」的實際量測。

## 7. 主要文獻、官方公告與專案來源

科學原始得獎研究與 AI 應用推論需分開理解。優先採 NobelPrize.org 公告；2026 年獎項官方頁面尚未經本次工具成功擷取，故以下採 Nature、APS、ACS、Reuters 等與獎項直接相關的同期來源。

1. [2007 物理：GMR](https://www.nobelprize.org/prizes/physics/2007/summary/)
2. [2012 經濟：匹配設計](https://www.nobelprize.org/prizes/economic-sciences/2012/summary/)
3. [2013 化學：多尺度模型](https://www.nobelprize.org/prizes/chemistry/2013/summary/)
4. [2014 醫學：Place/Grid cells](https://www.nobelprize.org/prizes/medicine/2014/advanced-information/)
5. [2016 醫學：自噬](https://www.nobelprize.org/prizes/medicine/2016/press-release/)
6. [2017 醫學：生理時鐘](https://www.nobelprize.org/prizes/medicine/2017/press-release/)
7. [2017 文學：Ishiguro](https://www.nobelprize.org/prizes/literature/2017/summary/)
8. [2018 醫學：免疫抑制性調節](https://www.nobelprize.org/prizes/medicine/2018/summary/)
9. [2018 化學：定向演化](https://www.nobelprize.org/prizes/chemistry/2018/summary/)
10. [2021 醫學：溫度與觸覺](https://www.nobelprize.org/prizes/medicine/2021/summary/)
11. [2021 和平：Ressa/Muratov](https://www.nobelprize.org/prizes/peace/2021/summary/)
12. [2022 經濟：銀行危機](https://www.nobelprize.org/prizes/economic-sciences/2022/summary/)
13. [2024 物理：Hopfield/Hinton](https://www.nobelprize.org/prizes/physics/2024/summary/)
14. [2024 化學：Baker/Hassabis/Jumper](https://www.nobelprize.org/prizes/chemistry/2024/summary/)
15. [2024 醫學：microRNA](https://www.nobelprize.org/prizes/medicine/2024/summary/)
16. [2025 物理：巨觀量子電路](https://www.nobelprize.org/prizes/physics/2025/summary/)
17. [2025 經濟：創新驅動成長](https://www.nobelprize.org/prizes/economic-sciences/2025/summary/)
18. [2026 醫學：Nature 光遺傳學](https://www.nature.com/articles/d41586-026-03091-2)
19. [2026 物理：American Physical Society / Halzen](https://www.aps.org/about/news/2026/10/aps-winner-2026-nobel-physics)
20. [2026 化學：American Chemical Society / Kagan & Soai](https://www.acs.org/pressroom/newsreleases/2026/october/acs-president-comments-on-award-of-2026-nobel-prize-in-chemistry.html)
21. [2026 經濟：Reuters / Hall & Woodford](https://www.reuters.com/world/hall-woodford-win-2026-nobel-economics-prize-2026-10-12/)
22. 專案基準：[README](../README.md)、[MODEL_TUNING](MODEL_TUNING.md)、[WebLLM engine](../src/local-ai/engine.ts)、[context budget](../src/ai/context-budget.ts)、[model orchestrator](../src/ai/model-orchestrator.ts)

## 8. 本文件與上線狀態

本文件只是**留存的研究、可追溯的來源與工程驗收方案**；沒有在這個變更中修改、重訓、量化、部署阿土伯模型，也沒有真機跑分。未來若修改程式，應在獨立 PR 中附最小 diff、測試、回滾路徑、裝置實測結果。
