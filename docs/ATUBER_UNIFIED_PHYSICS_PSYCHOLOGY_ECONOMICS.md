# 阿土伯融合架構：心理學、光學／核能、政治經濟思想、桐城派白話

> 2026-10-21｜整合設計紀錄 v1｜**非已部署的功能證明**。與同分支兩份文件配套：`ATUBER_NEURO_WORMHOLE_BLACKHOLE_NOBEL_2007_2026.md`、`ATUBER_CHINESE_CLASSICS_ENGINEERING.md`。
>
> 第一 KPI：**使用本地阿土伯（Qwen3 0.6B 級，實際型號需由設備查證）時，Vanilla 和其他前景程式維持流暢**；品質、安全及隱私不可退化。不是以電費最低或模仿名詞為目標。

## 一、統一分層：一個執行器，不是十幾個常駐 AI

| 層 | 理念/來源 | 可交付工程能力 | 對當前 0.6B 的成熟度 |
|---|---|---|---|
| 1. 表達 | 桐城派：言有物、言有序；心理學：認知負荷 | 預設白話、重點先行、清楚結構；避免空洞和冗言；不更動使用者指定風格 | **可直接落地；本 PR 已修改 prompts.ts 與測試** |
| 2. 輸入 | 庖丁解牛、Blackhole、工作記憶 | 既有 context-budget 演進：結構化分段、優先級、透明截斷與引用保護 | P1、部分已有 |
| 3. 快取 | Wormhole、神經記憶局部性 | 引擎原生 KV 重用（精確前綴）、工具結果 TTL；必須防跨使用者污染 | P1、需先確認現有後端 |
| 4. 排程 | 孫子避實擊虛、心理學有限理性、資本主義訊號 | 請求價值/緊急度與運算成本分配；前景使用者操作保留資源 | P0、需裝置實測 |
| 5. 基線保障 | 社會主義的計畫分配觀點、公共資源治理、核能縱深防禦 | 保留前景 CPU/GPU/VRAM 安全容量；排隊公平；故障時限制新工作並回退 | P0、設計 |
| 6. 模型 | 2024 物理學獎神經網路、SNN、MoE、BitNet、光子運算 | 原生模型/硬體研究；**不強行修改現有 Qwen3 權重** | 長期研究 |
| 7. 監測 | 墨家三表、定向演化、核能負回饋、LUCA | 受控實驗、壓力控制、取消回收、版本回滾，逐功能因果驗證 | P0/P1 |

### 工程上融合的意思

不為「蟲洞／黑洞／道家／光子／核能／資本市場／公有池」各開一個 Python 或 LLM 服務；以目前已存在的 `src/local-ai/engine.ts`、`src/ai/context-budget.ts`、`src/ai/model-orchestrator.ts`、`src/ai/prompts.ts`、`src/ai/tone-adaptation.ts` 為主，加必要且可測量的功能。

## 二、心理學：**最高工程價值之一**

| 概念 | 有研究基礎的原意 | 工程轉譯 | 主要風險 |
|---|---|---|---|
| Cognitive Load Theory 認知負荷 | 人類工作記憶處理能力有限；不必要資訊增加負擔 | 回覆依難度呈現、首段結論、需要時才展開；prompt 分組與摘要 | 摘要丟失關鍵證據 |
| Bounded Rationality / Satisficing 有限理性／滿意解 | 搜尋全部方案有成本，需接受有界時間與資訊限制 | **在可驗證且達到品質門檻時**停止反覆工具檢索；高風險問題不草率停止 | 「夠好就停」不得用於未查證的醫療或法律事實 |
| Attention / Signal detection 注意與訊號偵測 | 稀少但重要的訊號要高敏感度監測 | 只在有資源壓力、錯誤或重要事件時喚醒管理器 | 不恰當門檻造成漏報/誤觸 |
| Metacognition 校準 | 自我監測不一定準確，需要外部評估 | 模型聲稱不確定時核對資料；LUCA 將信心與真實正確率分開記錄 | 模型自評不得當真相 |
| 心理回饋與增強 | 反饋可調整行為，但容易被短期訊號誤導 | thumbs-up/down 作為離線資料，具抽樣偏差及回歸評估 | 不在前景即時改權重、避免 reward hacking |

參考：[Cognitive Load Theory](https://ajet.org.au/index.php/AJET/article/view/2322)、[Simon, 1955](https://doi.org/10.2307/1884852)、[Stanford Encyclopedia: Bounded Rationality](https://plato.stanford.edu/entries/bounded-rationality/)。

## 三、光能躍遷、波粒二象性、核能：從物理直接可行性劃界

「光能越遷」在此解作**電子能階躍遷、光吸收／放射**；若使用者原意是不同現象則另議。

- **電子能階躍遷**：原子的離散能階差與光子頻率有物理關係（`ΔE=hν`），**並不直接產生可在 RTX 3050 上跳過 Transformer 層的演算法**。僅可作「由明確門檻切換排程模式」的比喻，而真正演算法來源是控制論中的狀態機及閾值邏輯。科學資料：[NIST Atomic Spectroscopy](https://www.nist.gov/pml/atomic-spectroscopy-compendium-basic-ideas-notation-data-and-formulas/atomic-spectroscopy-0)。
- **波粒二象性**：量子相干與干涉屬實際物理現象；用同時多條邏輯分支比喻「量子並行」會混淆經典 GPU 與量子計算。不能將多個 agent 並行自稱量子加速。短期不對 Qwen3 推論做任何量子式優化。[National Academies: Quantum Computing: Progress and Prospects](https://www.nationalacademies.org/read/25196/chapter/4)。
- **光子計算／光學矩陣乘法**：是有實驗硬體工作的獨立研究路線。研究需處理光電介面、精度、權重儲存、模型適配；沒有對既有電腦的純軟體捷徑。[Nature 2025 photonic accelerator](https://www.nature.com/articles/s41586-025-08786-6)。
- **核分裂／核融合提供能量**：是供電技術，不會直接減少模型 Token 計算。真正有幫助的是核能工程的**負回饋、縱深防禦、故障安全和冗餘**，可做推論 OOM 及過載保護。這是跨領域類比而非核能運算本身。[IAEA Fundamental Safety Principles](https://nucleus.iaea.org/sites/nss-oui/Published%20Collections/m_b75d906c-45e6-408a-b3fc-424794b07af1/m_b75d906c-45e6-408a-b3fc-424794b07af1__1_0.Html)。

## 四、資本主義／社會主義／共產主義：中立轉成資源分配機制

不把政治意識形態寫成模型人格，不為任何陣營做政治倡導；研究的是各種資源配置**機制**的利弊。

| 思想家族中可借鏡的資源機制 | 阿土伯／Slime 工程化 | 收益 | 風險 |
|---|---|---|---|
| 市場／價格訊號（資本主義經濟運作中常見） | 待辦任務評估「品質收益／執行成本／使用者緊急度」，限制昂貴低價值工作 | 提升閒置容量的使用效率 | 只看價格/效用可能讓高成本任務餓死 |
| 中央規劃／保底配額（社會主義的一類配置方法） | 預留桌面渲染和關鍵互動的資源空間，定義明確上下限、工作負載隔離 | 保障前景體驗，避免 AI 吃滿 | 配額設太死浪費閒置能力 |
| 共同資源／按需求共享（共產主義思想中的共同所有與分配願景） | 共享快取/節點容量治理，但按使用者權限隔離資料；公平隊列、撤銷權限、反飢餓 aging | 多節點公平、授權可控 | 複雜管理成本及隱私風險 |

**工程選擇是混合制**，而非宣稱某一思想在政治經濟學上「必然最好」：

```text
第一層 (計畫式硬約束)：先預留 UI 前景與 OS 最低可用容量、權限、安全隔離。
第二層 (需求訊號)：有容量才依工作急迫性、效益/成本選擇先後。
第三層 (共享公平)：加 aging 和配額讓低優先工作不會永遠被餓死。
第四層 (反饋與回滾)：資源壓力過高時收斂到安全模式，保證新任務可取消。
```

現有電腦科學研究確實存在 market-based scheduling、fair-share resource allocation 等方法；上述混合方案仍需真機評估，不應以思想標籤取代具體排程設計：[Walsh et al. market-based distributed scheduling](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=980602)、[Decentralized fairshare scheduling](https://www.sciencedirect.com/science/article/abs/pii/S0167739X12001355)、[Survey of distributed resource allocation 2025](https://doi.org/10.1016/j.arcontrol.2024.100983)。

對 **單一 0.6B 本機推論**，這種競價或多租戶公平排程器可能比任務本身更重：優先只實作前景保護和活躍請求數量上限。多使用者/Slime 確實存在資源爭用時再引入分配機制。

## 五、桐城派口吻：現代白話，不是古文

已在本 PR 的 `src/ai/prompts.ts` 增加**只針對阿土伯啟用**的完整版與小模型精簡版提示詞，並由 `src/local-ai/engine.ts`、`src/ai/ollama.ts` 依模型名稱接入；其他 Vanilla 模型維持原有語氣：
- **言有物**：有事實、實例、計算或可查證依據；不要空泛套話。
- **言有序**：依問題適當採結論→依據→限制／作法，日常閒聊仍可自然簡短。
- **雅潔現代化**：短句、無古文腔、無誇張排比或文學引用堆疊。
- 用戶指定寫作風格、精確引用、JSON 和程式碼等**優先**，不將桐城語氣強加給格式敏感輸出。
- 不把「寫得有權威感」當作「內容確實可信」；所有實證與來源要求維持原先護欄。
- 小模型 compact 提示詞需通過原有 `estimateTokens(compact)<230` 的回歸測試。

**具體示例**
- 不佳：「本案猶如兵法運籌，宜以四兩撥千斤之策，巧妙駕馭模型。」
- 建議：「卡頓通常發生在模型載入、長提示預填充或記憶體不足時。先測哪個階段造成掉幀，再限制最嚴重的資源尖峰；不要先重訓模型。」

## 六、落地與驗收

**P0 已在 PR 修改，但仍未正式部署**：阿土伯專屬語氣提示詞、兩條推論入口接線與回歸測試；需 CI / 真機驗證。新研究設計文件合併收錄。

**下一個獨立性能改動 PR**：
1. 建立 WebLLM Worker 失敗、長 Prompt/Prefill 與多請求下的 UI p95 frame time 和 input latency 基準。
2. 排程引擎先保證前景資源硬限制（核能縱深防禦＋計畫式保底）；有可用餘額再依任務急迫性／成本進入隊列（市場式訊號）。
3. Wormhole exact-prefix cache 的現有後端能力探測，Blackhole 限制快取記憶體；不得重複建造 WebLLM 已有機制。
4. 庖丁上下文優化、心理學分段表達及 LUCA 回歸驗證；不得刪必要引用、現時使用者指令或重要資料。
5. 未通過真機實驗的概念（物理硬體、SNN、MoE 改造、量子計算）只保留研究標籤，不得在生產聲稱「已融合而提速」。

**成功條件**：在相同模型版本、相同問題集、相近答案品質下，UI p95 幀時間/掉幀和 CPU/GPU/VRAM 峰值下降；TTFT/生成速率不出現無法接受的退化；異常能取消、回滾且不漏洩記憶。效果須實測，本文沒有捏造任何改善百分比。
