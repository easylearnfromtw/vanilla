"""Vanilla Academy: 36 source-backed chapters x 9 substantive learning activities.

Sources are attributed chapter-by-chapter. Explanations are original instructional
summaries, NOT verbatim excerpts or assertions that all upstream APIs are deployed.
The catalog is static and works without requesting third-party web pages at runtime.
"""
from __future__ import annotations

from ceres_academy_curriculum import CHAPTERS, LESSONS, TOPICS

# Chapter records: principle, practical example, misconception, activity, answer.
DETAILS = [["推論不是搜尋：語言模型依輸入與已產生內容估算下一個 token 的可能性；輸出流暢不等於外部事實正確。","客服輸入『明天停班嗎』時，沒有即時資料來源的模型只能表達不確定，而不能宣稱已查證。","把模型信心語氣當作真實機率或已查證證據。","寫出『輸入、模型輸出、獨立查核』三欄，並指出哪個欄位需要外部資料。","模型能產生答案，但查核要靠可信來源或外部工具。"],["Token 是模型處理文字的單位，可能是詞的一部分、字詞或標點；上下文窗包含輸入、歷史、工具資訊及輸出預算。","長期對話突然遺漏早期要求，可能是上下文截斷而非模型故意忽略。","把 token 等同中文字數，或忘記為輸出保留空間。","設計含歷史摘要、當前任務、證據與輸出預算的上下文分配表。","優先保留與當前任務相關的證據，明示截斷資訊。"],["好的提示詞寫清目標、可用材料、限制、輸出格式及判定標準；提供例子可減少歧義。","把『分析網站』改成『列出三項 UX 問題、提供復現步驟與驗收標準』。","用含糊指令要求模型自行猜測需求、權限或外部事實。","為一項實際工作寫 5 欄提示詞，加入一個失敗案例。","驗收標準應具體到能由第三方判斷通過與否。"],["JSON 是資料表示法，JSON Schema 能對型別、必填欄位和限制做機器驗證；字串仍需跳脫特殊字元。","工具呼叫參數 {\"city\":\"Taipei\",\"days\":3} 可用 schema 檢查 days 為整數且範圍合理。","看到文字像 JSON 就直接信任，而不執行解析與欄位驗證。","設計一份含 required、type、minimum 的 schema，測試缺欄位與錯型別。","先解析再驗證，失敗要回可理解的欄位錯誤。"],["RAG 把檢索到的文件片段放入模型上下文；檢索質量、文件授權、版本與引用對應比文字華麗更重要。","詢問公司報銷規則：先取最新版制度段落，再引用條款回答。","把向量相似度當作真實性保證，或引用不存在的段落。","列出 Query→Retrieval→Rerank→Answer→Citation Check 流程與失敗點。","回答應可回溯到來源與版本；查不到就明確說查不到。"],["事實核查要區分『引用存在』『來源可信』『來源支持結論』『仍在有效期限』，模型自我評分不能替代證據。","模型引用網站聲稱 API 免費，先核對官方計價頁與更新日期。","只查是否有網址，不核對內容是否真的支持論點。","設計三欄查核表：主張、來源原文要點、判定與不確定性。","引用須支持具體主張；無資料時不要補出數字。"],["October 是 Vanilla 設計中的自主任務執行核心，不等於已上線的商業服務；區分目標架構與目前程式可驗證能力。","把定期搜尋、分析、彙整、人工審批拆成可觀測任務，而非一句『自主完成』。","把架構規格或展示介面誤認為已運作的生產功能。","依現有 GitHub 程式列出已實作、適配器、規劃中三種狀態。","只能將經程式、測試與部署核對的項目稱為已運作。"],["任務拆解需要輸入契約、依賴關係、可觀測輸出、超時、重試與終止條件；形成有向工作圖。","分析文章的工作包含讀取網址→解析文字→取出結論→審核→發送摘要。","缺乏終止條件，導致代理反覆嘗試同一失敗操作。","畫 5 個步驟的 DAG，為每一步補上錯誤分支。","每一步都需明確成功條件與失敗處理。"],["Detroit 調度以能力、權限、成本與健康狀態選工具；路由應記錄為何選擇與回退原因。","OCR 不可用時應改為要求使用者提供清楚文字，不能假裝圖片辨識成功。","把『找到工具名稱』誤當『已經執行並取得結果』。","設計一個 capability matrix，列出本地模型、網頁讀取與檔案匯出的限制。","未執行的工具不能回報成功。"],["工具呼叫必須通過參數 schema、身份授權與敏感操作審批；逾時及重送可能造成重複副作用。","發送郵件前先生成草稿，真正發送前核對收件人與確認權限。","信任模型提出的工具參數，直接執行刪除或付款。","定義 send_email 的參數、授權規則、冪等鍵與稽核欄位。","有副作用的工具不可只靠自然語言宣稱取得授權。"],["Verifier 要檢查執行紀錄、工具結果、證據與狀態，不只檢查回答語氣；可將不合格結果退回重試。","報告說『已寄出』但缺少寄件 API 成功回應，Verifier 應阻擋成功標記。","把模型產生的 JSON 當作真實系統操作日誌。","制定 4 條驗證規則：來源、結果、時效、權限。","結論須由可稽核的觀測值支持，無法驗證就標記未完成。"],["長期工作應用檢查點保存進度，用冪等鍵避免重複提交，用人工審批與補償動作處理不可逆操作。","API 暫時逾時後重試：先查 idempotency key 的結果，避免建立兩筆訂單。","單純增加重試次數卻沒有去重與終止門檻。","設計失敗恢復流程：檢查點→判定可重試→退避→人工介入。","相同任務重跑不應產生重複副作用。"],["開發環境需鎖定語言、相依套件及系統版本，讓另一個人能在乾淨環境重現執行結果。","專案使用 Python 虛擬環境及 requirements.txt，避免與系統套件互相污染。","只寫『我的電腦可執行』，卻沒有安裝與啟動指令。","列出 Python 版本、建立 venv、安裝與驗收四步。","新人依 README 可重現最小範例，不需猜測環境。"],["需求規格要界定使用者故事、非功能需求、邊界條件、權限與驗收案例。","Telegram 教材系統需定義『上一課、下一課、進度持久化、錯誤回報』。","只說『功能要更好』，沒有可測試的結果與回歸條件。","將一個功能寫成 Given/When/Then 三個驗收案例。","驗收測試應覆蓋一般路徑與失敗路徑。"],["讓程式 AI 先讀取需求、限制與既有測試，再提出最小 diff；生成程式不是已通過測試的證明。","請 AI 修正 Telegram 換行 bug 時，指定不得修改金鑰與管理員權限。","未先閱讀原始碼就要求一次大幅重構全部架構。","撰寫 coding prompt，要求『修復、測試、提交摘要、未驗證項目』。","程式變更必須能以獨立測試或人工操作重現。"],["使用 Claude 等工具協作程式時，要提供相關檔案、堆疊追蹤與重現步驟，避免洩露機密。","問題從 traceback 的出錯行出發，先建立最小重現。","把整個秘密配置檔貼進外部模型，或直接採納未測試修補。","寫出一份保留必要資訊、移除敏感值的除錯提問。","模型建議仍需在人類受控環境測試與審查。"],["測試金字塔包含單元、整合與端到端層級；回歸測試能防止修 A 又弄壞 B。","以測試確認文字不含字面反斜線 n，下一課不超出 324。","只有手動點一次按鈕，就宣稱所有流程都正常。","列出 5 個邊界測試與 1 個失敗注入測試。","測試結果需可重跑，含斷言與失敗說明。"],["Git 追蹤版本，分支隔離工作，PR 供審核差異；合併不等於生產已部署。","fix branch 提交後透過 CI 驗證，再選擇合併與正式發布。","把 PR 已建立直接當作線上服務更新完成。","撰寫 commit message、PR 驗收清單與回滾步驟。","審查者能知道改了什麼、如何測試與如何撤回。"],["HTTP 請求有方法、標頭、內容、狀態碼；客戶端必須檢查 timeout、429 和 5xx。","GET 讀取資料，POST 建立工作；服務回 503 不代表請求成功。","以為所有回應都是 JSON，或把 200 以外一律當伺服器故障。","為 GET/POST 設計狀態碼與錯誤回應表。","正確處理 2xx/4xx/5xx 並保留錯誤上下文。"],["API Key 是身份憑證，應留在伺服器秘密儲存、設定最小權限、配額及輪替機制。","不同租戶各自使用 key 的雜湊識別，停用時立即阻擋。","把 API Key 放進公開 GitHub、前端 JS 或 Telegram 對話。","設計金鑰建立、僅顯示一次、雜湊保存、撤銷和稽核流程。","使用者不能透過別人的 key 查到對方用量。"],["Python requests 可送 HTTP 請求，設定 timeout、raise_for_status 與例外分流是基本可靠性要求。","向公開測試站 GET 時，分開處理超時與 HTTP 錯誤。","把 timeout 誤當總下載時間上限，或略過 response.status_code。","設計一個只讀 GET 程式：timeout、錯誤處理、回傳欄位驗證。","非 2xx 回應不得無條件當作成功資料。"],["瀏覽器 fetch 需先檢查 response.ok，使用 AbortController 控制取消；CORS 是瀏覽器保護而不是身份驗證。","使用者切換頁面後取消舊請求，避免過期結果覆蓋新畫面。","把 fetch 成功返回 Response 當成 HTTP 200。","寫出 fetch→檢查 ok→解析 JSON→處理中止四步偽碼。","中止與網路失敗要有不同提示。"],["SSE 傳送逐段事件，客戶端須組裝串流並處理連線中斷；429 要遵守限流規範，避免無限重試。","聊天模型輸出一半斷線時，介面顯示中斷，不宣稱答案完整。","忽略 Retry-After，將 429 立即重送造成更嚴重限流。","規劃串流狀態機，包含等待、接收、完成、錯誤和取消。","必須有最大重試次數、退避與取消機制。"],["Token 額度應按租戶／金鑰／時間窗口儲存；並行請求要原子保留配額再結算，不能靠前端計數。","兩個請求同時使用剩餘 100 tokens，必須防止雙重扣除與超額。","採讀取餘額再寫入的非交易流程，出現競態條件。","畫出 reserve→execute→settle/refund 配額交易步驟。","並發操作不能讓已核配額突破硬上限。"],["Function calling 是模型提出結構化工具參數，再由程式驗證並決定執行；不是模型自帶對外操作權限。","查天氣工具接收 city、units，先驗證城市與白名單權限再查詢。","把來自模型的參數直接插入 shell 指令。","設計一個含 name、description、parameters 的工具 schema。","模型建議不等於實際執行；需有工具結果回傳。"],["工作流程以狀態與邊決定下一個步驟，必須支援分支、檢查點、超時與人類介入。","客服問題先分類，低風險讀文件，高風險轉人工審核。","沒有節點輸入輸出契約，執行錯誤時無法恢復。","畫出三分支 Agent 工作圖與每節點的成功／失敗轉移。","狀態演進需可重現，流程不能無限循環。"],["資料清理需先定義欄位語義，再處理缺值、重複值、格式錯誤及來源追蹤；不能靠猜測填真實數據。","同一客戶名稱多種寫法時先制定統一規則並保留原始值。","把未知值直接填 0，改變統計意義。","建立三欄資料清理紀錄：原值、轉換規則、清理後值。","任何非確定性補值都要標示推估。"],["向量檢索把文本映射到 embedding 空間，以距離找相似片段；檢索結果相關不代表真實。","搜尋醫學文獻時，embedding 可找語義相關文章，仍須看方法與證據等級。","把向量相似分數當作事實正確率。","規劃 keyword + vector + rerank 的融合檢索流程。","答案須驗證來源支持程度，不只看相似度。"],["知識圖譜將節點、關係與屬性結構化，適合追蹤實體關聯、資料來源與版本。","醫師→任職→醫院是一條關係，需要有效日期才能反映離職。","只有關係沒有來源與時效，導致過期資料當作現況。","畫 4 個實體、5 條關係及來源欄位的小圖譜。","每條關係應有可查核來源或明確標記推估。"],["多代理系統須定義負責範圍、交接輸入、驗收標準與停止條件；代理越多不必然越準。","Diana 分派工具，Verifier 審核證據，Ceres 回傳訊息，各司其職。","代理互相重複呼叫、無單一最終責任人。","定義規劃者→執行者→審核者的交接契約。","失敗要能追蹤到責任節點及可重試環節。"],["本地部署須檢查 CPU/GPU、RAM/VRAM、模型量化格式與容器限制；單機與叢集資源不能直接相加成單張顯卡。","一台桌機跑模型、樹莓派做協調；需要衡量實際吞吐而非只加總規格。","誤以為 3 台 3B 機器必然組成 9B 或 30B 模型。","列出節點硬體、模型大小、延遲與記憶體需求表。","先在目標裝置量測是否能載入與完成一次推論。"],["Docker image 是建置產物，container 是運行實例，volume 用於持久保存；健康檢查可偵測服務可用性。","在 Compose 中為 bot 配置 volumes 保存 SQLite 進度，避免重啟後記錄消失。","把 SQLite 放 /tmp 卻以為部署重建仍會保存。","寫出 image/container/volume/healthcheck 四項用途與一個服務草圖。","資料須跨容器重建保留才叫持久化。"],["CI 應在 PR 上自動執行語法、單元、整合及建置測試，阻止不合格版本合併。","檢查 324 課皆有來源與達到字數標準，按鈕行為測試無錯。","只測試程式能匯入，就認為 Telegram 操作已端到端可用。","設計 PR pipeline：lint→tests→build→review gate。","失敗的測試必須擋住生產發布。"],["部署需配置啟動命令、環境變數、TLS、健康檢查、持久磁碟及回滾版本。","Railway 上更新 Telegram bot 前，確認 webhook 符合正確 bot 與持久 volume。","程式合併後，沒有核對 Railway 部署版本就宣稱上線。","寫出部署前後驗證 checklist，包含 Bot /start 實測。","生產健康檢查、正確版本及真人操作三者都要確認。"],["監控須收集延遲、錯誤率、流量與飽和度，也要避免記錄 API Key、個資與完整敏感訊息。","Webhook 失敗記錄 update_id 與錯誤類型，避免把 Telegram 機密輸入寫入日誌。","只看到服務 200 就忽略教學內容錯誤、丟失進度與使用者體驗。","定義 4 個 SLI 及 2 個告警門檻，說明觀測資料保留時間。","能區分網路故障、資料錯誤與應用程式缺陷。"],["效能調校先建立基準，再量 p50/p95 延遲、記憶體、費用與故障恢復時間；優化不得犧牲正確性。","若教材送達慢，先量 API 延遲與資料庫鎖定時間再改碼。","只看平均延遲，忽略極慢請求造成的體驗。","寫一份含基準值、目標值、負載條件及回滾門檻的測試表。","新版本至少需比較 p95、錯誤率及資源消耗。"]]
# Official references or identified open-source projects; one traceable source per chapter.
SOURCES = [["Hugging Face · Text Generation","https://huggingface.co/docs/transformers/main/llm_tutorial"],["Hugging Face · Tokenizers","https://huggingface.co/docs/tokenizers/index"],["OpenAI Cookbook · Prompting examples","https://github.com/openai/openai-cookbook"],["JSON Schema · Learn","https://json-schema.org/learn/getting-started-step-by-step"],["LlamaIndex · RAG documentation","https://docs.llamaindex.ai/en/stable/"],["OpenAI Evals · 開源評測框架","https://github.com/openai/evals"],["Vanilla · Detroit 原始碼（內部案例）","https://github.com/easylearnfromtw/vanilla/tree/main/src/detroit"],["LangGraph · Workflows and agents","https://docs.langchain.com/oss/python/langgraph/overview"],["Vanilla · Detroit 原始碼（內部案例）","https://github.com/easylearnfromtw/vanilla/tree/main/src/detroit"],["OpenAI · Function calling","https://platform.openai.com/docs/guides/function-calling"],["OpenAI Evals · 開源評測框架","https://github.com/openai/evals"],["LangGraph · Persistence","https://docs.langchain.com/oss/python/langgraph/persistence"],["Python · Virtual Environments","https://docs.python.org/3/tutorial/venv.html"],["GitHub · About issues","https://docs.github.com/en/issues/tracking-your-work-with-issues/about-issues"],["OpenAI Cookbook · 開源程式範例","https://github.com/openai/openai-cookbook"],["Anthropic · Prompting best practices","https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-templates-and-variables"],["pytest · Get Started","https://docs.pytest.org/en/stable/getting-started.html"],["GitHub · Pull Requests","https://docs.github.com/en/pull-requests"],["MDN · HTTP Overview","https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview"],["OWASP · Secrets Management","https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html"],["Requests · Quickstart","https://requests.readthedocs.io/en/latest/user/quickstart/"],["MDN · Using Fetch","https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch"],["MDN · Server-sent events","https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events"],["MDN · HTTP 429","https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429"],["OpenAI · Function calling","https://platform.openai.com/docs/guides/function-calling"],["LangGraph · Overview","https://docs.langchain.com/oss/python/langgraph/overview"],["pandas · Missing data","https://pandas.pydata.org/docs/user_guide/missing_data.html"],["FAISS · 向量搜尋開源專案","https://github.com/facebookresearch/faiss"],["Neo4j · Cypher Manual","https://neo4j.com/docs/cypher-manual/current/introduction/"],["Microsoft AutoGen · 開源多代理框架","https://github.com/microsoft/autogen"],["Ollama · Documentation","https://docs.ollama.com/"],["Docker · Compose Quickstart","https://docs.docker.com/compose/gettingstarted/"],["GitHub · Continuous Integration","https://docs.github.com/en/actions/get-started/continuous-integration"],["Railway · Deployments","https://docs.railway.com/deployments"],["OWASP · Logging Cheat Sheet","https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html"],["Google SRE Workbook · Monitoring","https://sre.google/workbook/monitoring/"]]
STAGE_NAMES = ("學習目標", "核心原理", "應用案例", "操作準備", "實作步驟", "程式與資料範例", "常見錯誤", "實戰練習", "驗收測驗")
STAGE_GUIDANCE = (
    "本課目標：先分清概念、輸入、可觀測輸出與限制。完成後能向同學解釋並提出至少一項查證方法。",
    "原理推導：先問系統吃進什麼資料、根據什麼規則處理、產生什麼結果；分清理論保證與實際風險。",
    "應用案例拆解：描述誰提出需求、資料如何進來、哪一環需驗證、何時要交給人工或可信來源。",
    "操作前檢查：確認權限、版本、範例資料、可重現環境與回滾策略；切勿複製真實金鑰到公開討論。",
    "實作順序：①界定最小需求；②建立最小輸入；③執行／模擬；④核對輸出；⑤記錄失敗並重試測試。",
    "程式實務：不要把教學用的資料格式視為 Vanilla 已部署 API。以對應官方文件的範例及版本為準，先做輸入驗證。",
    "故障排查：縮小重現案例，區分資料錯誤、權限錯誤、環境錯誤及輸出不實；同時確認日誌不含機密。",
    "實戰練習：將本章概念套入一個自行選定的小專案，至少寫出可驗收的成功與失敗路徑。",
    "自我評量：不用查筆記，先回答本章題目，再比較參考解答；不要只因讀過就標記熟練。"
)
LEVEL_HINTS = (
    "零基礎：先用白話解釋每個術語，將範例中的主體／資料／結果畫成三格。",
    "入門：補上資料格式、邊界條件，嘗試改寫為可驗收的規格。",
    "開發者：把範例變成有輸入輸出契約的測試設計，包含失敗分支。",
    "進階：評估隱私、安全、延遲、成本、版本與可觀測性取捨。"
)

def lesson_metadata(index: int):
    """Return chapter-specific records without mutating the original lesson IDs."""
    if not 0 <= index < len(LESSONS):
        raise ValueError("課程編號超出範圍")
    chapter = index // 9
    title, _, topic_id, chapter_id, stage_id = LESSONS[index]
    return title, topic_id, chapter_id, stage_id, DETAILS[chapter], SOURCES[chapter]

def lesson_text(index: int, level: str = "0") -> str:
    """A Telegram-safe, line-broken, source-attributed lesson body."""
    title, topic, chapter, stage, note, source = lesson_metadata(index)
    principle, example, pitfall, task, answer = note
    source_name, source_url = source
    try:
        difficulty = int(level)
    except (ValueError, TypeError):
        difficulty = 0
    difficulty = min(3, max(0, difficulty))
    text = (
        f"📚 VANILLA ACADEMY  ·  {TOPICS[topic]}\n"
        f"第 {chapter + 1:02d}/06 章 · 第 {stage + 1:02d}/09 課 · 全部 {index + 1}/324\n"
        f"【{title}】\n\n"
        f"▍核心知識\n{principle}\n\n"
        f"▍案例解析\n{example}\n\n"
        f"▍本節深化學習\n{STAGE_GUIDANCE[stage]}\n"
        f"{LEVEL_HINTS[difficulty]}\n\n"
        f"▍動手練習\n{task}\n\n"
        f"▍常見誤區\n{pitfall}\n\n"
        f"▍閱讀來源（可點擊網址）\n{source_name}\n{source_url}\n"
        "來源用於延伸查核；本教材是重新編寫的教學摘要，不表示外部專案功能已在 Vanilla 上線。"
    )
    if len(text) > 3800:
        raise ValueError("Telegram 單則教材過長")
    return text

def quiz_text(index: int, reveal: bool = False) -> str:
    title, _, _, _, note, source = lesson_metadata(index)
    _, _, pitfall, task, answer = note
    result = f"🧩 {title}｜自我測驗\n\n問題：{task}\n\n提醒：{pitfall}"
    if reveal:
        result += f"\n\n✅ 參考解答\n{answer}\n\n來源：{source[0]}\n{source[1]}"
    else:
        result += "\n\n先自行作答，再按「顯示解析」。"
    return result

assert len(LESSONS) == len(DETAILS) * 9 == 324
assert len(SOURCES) == len(DETAILS) == 36
