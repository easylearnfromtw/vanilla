"""Vanilla Academy 原創繁體中文教材（依公開文件整理；不複製第三方原文）。
Each one of the 36 chapters has unique explanation, scenario, exercise, answer and sources.
All 324 lesson pages are rendered from this reviewed, versioned catalogue.
Sources are study links, not claims that live web was fetched for the learner.
"""
from __future__ import annotations
from urllib.parse import urlsplit
from ceres_academy_curriculum import LESSONS, CHAPTERS, TOPICS, STAGES

KNOWLEDGE = [
  {
    "chapter": "模型推論",
    "explain": "語言模型是依輸入與既有參數生成序列，不等於事實資料庫。請區分預測、檢索與外部工具產生的結果；重要結論需要有可核對證據。",
    "scenario": "使用者問『昨天股價是多少』：模型可提出查詢計畫，但數字應由時間戳清楚的市場來源給出，不能只靠語言模型記憶。",
    "method": "先列出問題中的時間、地點與可查證欄位，再詢問模型有哪些資料不足，最後核對來源日期與單位。",
    "practice": "完成一份五行問答：標記模型推測、可查事實以及仍缺少的證據。",
    "answer": "合格答案必須將即時資訊標為待查，並提出來源名稱、日期與核對方式。",
    "code": "print('產生答案 ≠ 完成事實查核')",
    "sources": [
      [
        "Google ML Crash Course",
        "https://developers.google.com/machine-learning/crash-course/"
      ],
      [
        "Ollama API",
        "https://docs.ollama.com/api/introduction"
      ]
    ]
  },
  {
    "chapter": "Token 與上下文",
    "explain": "Token 是分詞器處理文字的單位，並不直接等於中文字、字數或單字數。上下文包含對話、工具結果與輸出預留額度，超出視窗需摘要或檢索。",
    "scenario": "一份長病歷不可無差別貼入；先分段提取主訴、檢查與時間序列，保留可追溯段落編號。",
    "method": "量測實際模型的 token 數，而非只用字數估算；先預留輸出，再壓縮低相關段落。",
    "practice": "若視窗為 8K tokens，預留 2K 給答案，請描述你如何分配指令、檢索證據及既有對話。",
    "answer": "應留足系統指令及安全餘裕，重要證據不得只因在最前面就被粗暴截掉。",
    "code": "from collections import Counter\ntext='學習 token 不等於計算字數'\nprint(Counter(text)) # 字元計數，非 token 數",
    "sources": [
      [
        "Hugging Face Tokenizers",
        "https://github.com/huggingface/tokenizers"
      ],
      [
        "Google LLM Basics",
        "https://developers.google.com/machine-learning/crash-course/llm"
      ]
    ]
  },
  {
    "chapter": "提示詞工程",
    "explain": "有效提示詞明確指定目標、上下文、輸入資料、不可做的事情、輸出格式與驗收標準。示例能改善格式一致性，但不能替代外部事實查核。",
    "scenario": "需求『幫我優化』過於籠統；可改成『只修改此 CSS 的手機排版，保持功能，給 diff 與回歸測試』。",
    "method": "先寫最小任務與成功條件；逐輪比較輸出，將失敗案例加入評測集。",
    "practice": "將『寫個網站』改成可驗收的提示詞，至少包含目標用戶、功能、裝置限制與測試方法。",
    "answer": "合格提示詞能讓不同工程師知道完成的定義，也能回報不確定處而非自動虛構。",
    "code": "prompt='目標: 手機版排版\\n限制: 不改 API\\n輸出: 差異與測試結果'\nprint(prompt)",
    "sources": [
      [
        "OpenAI Prompting",
        "https://developers.openai.com/api/docs/guides/prompting"
      ],
      [
        "Anthropic Prompting",
        "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview"
      ]
    ]
  },
  {
    "chapter": "JSON 結構化輸出",
    "explain": "JSON 只是資料序列化格式；欄位型別、必填規則、長度與值域應由 schema 或應用程式驗證。語法正確不代表商業邏輯正確。",
    "scenario": "例如訂單 quantity 是負數，即使 JSON 能解析也應被拒絕；額度與權限另需伺服器端檢查。",
    "method": "先寫一份有效範例，再嘗試缺欄位、錯型別與越界輸入；任何解析錯誤都要安全回退。",
    "practice": "設計一個任務回傳格式：ok 為布林、evidence 為陣列、version 為字串，列出失敗樣本。",
    "answer": "驗收不只 json.loads 成功，還要逐欄驗證與禁止未知的高風險操作。",
    "code": "import json\nobj=json.loads('{\"ok\":true,\"evidence\":[]}')\nassert type(obj['ok']) is bool and isinstance(obj['evidence'],list)",
    "sources": [
      [
        "JSON Schema",
        "https://json-schema.org/learn/getting-started-step-by-step"
      ],
      [
        "Python json",
        "https://docs.python.org/3/library/json.html"
      ]
    ]
  },
  {
    "chapter": "RAG 檢索",
    "explain": "檢索增強生成先從可信文件找相關片段，再將片段連同來源交給模型產生回答。檢索命中並不等於支持結論，還需比對原文。",
    "scenario": "客服問退款政策：系統應找到現行版本條款與有效日期，不能援用前一年舊政策。",
    "method": "準備小型文件集合，建立索引，以查詢召回，再檢查引用段落是否確實回答問題。",
    "practice": "設計三段資料的 RAG，展示召回、引用段落與缺少證據時的拒答。",
    "answer": "答案必須對應可找到的原文，找不到時寫『此資料不足以回答』而非編造條款。",
    "code": "docs=['退款需七日內申請','出貨依庫存而定']\nq='退款'\nhits=[d for d in docs if q in d]\nprint(hits)",
    "sources": [
      [
        "LangChain RAG Guide",
        "https://docs.langchain.com/oss/python/langchain/rag"
      ],
      [
        "RAG from Scratch",
        "https://github.com/langchain-ai/rag-from-scratch"
      ]
    ]
  },
  {
    "chapter": "事實核查",
    "explain": "核查需看來源是否存在、日期是否適用、該段文字是否支持所宣稱的範圍。引用網址可打開但內容無關，仍是錯誤引用。",
    "scenario": "有人說『某研究證明療效 90%』；需檢查研究設計、分母、終點與統計不確定性。",
    "method": "建立『主張→來源段落→支持程度→爭議』表，遇到衝突來源保留不確定性。",
    "practice": "挑選一項帶有數字的主張，列出至少兩個獨立的核查步驟與不確定因素。",
    "answer": "合格答案應分清已證實、部分支持與資料不足，不把來源看起來權威當成直接證據。",
    "code": "claim={'text':'療效達90%','source':None}\nprint('待查證' if not claim['source'] else '需檢查原文')",
    "sources": [
      [
        "Google Search Essentials",
        "https://developers.google.com/search/docs/fundamentals/creating-helpful-content"
      ],
      [
        "Cochrane Handbook",
        "https://training.cochrane.org/handbook"
      ]
    ]
  },
  {
    "chapter": "October 架構",
    "explain": "October 在 Vanilla 是規劃中的外掛資料驅動自主執行引擎；應明確區分設計目標與已啟用能力。其核心為解析任務、選工具、驗證結果與留存可回復狀態。",
    "scenario": "『整理三篇政策』應產生可驗證的工作紀錄：三個來源、提要、資料版本、待確認衝突，不能只顯示模型說完成。",
    "method": "把一個需求畫成資料輸入→規劃→工具→核實→交付的五段流程，逐段標明授權者。",
    "practice": "為 October 草擬一個自主任務，列出資料授權、停止條件、驗證與審計方式。",
    "answer": "只有在工具回傳完成且驗證通過時才標完成；沒有部署證據的功能標示規劃中。",
    "code": "stages=['input','plan','tool','verify','deliver']\nassert stages.index('verify')<stages.index('deliver')",
    "sources": [
      [
        "Vanilla 原始碼",
        "https://github.com/easylearnfromtw/vanilla"
      ],
      [
        "LangGraph",
        "https://github.com/langchain-ai/langgraph"
      ]
    ]
  },
  {
    "chapter": "任務拆解",
    "explain": "自主任務的子工作應有依賴關係、輸入、輸出與失敗分支。把『完成研究』拆成可操作且可驗收的行為，並防止重複執行有副作用的步驟。",
    "scenario": "製作報告依序讀來源、提取資料、核查數字、寫結論；其中引用失敗必須阻止最後發布。",
    "method": "列出工作 DAG，標記可平行與需順序的步驟，為每一步寫超時及完成判準。",
    "practice": "拆解『每週整理網站更新』為四個步驟，寫出至少一條失敗恢復路徑。",
    "answer": "答案應辨認抓取失敗、來源變更與重覆發送三類風險，禁止把失敗當成功。",
    "code": "tasks={'fetch':[],'extract':['fetch'],'verify':['extract'],'publish':['verify']}\nassert 'verify' in tasks['publish']",
    "sources": [
      [
        "LangGraph Workflows",
        "https://docs.langchain.com/oss/python/langgraph/workflows-agents"
      ],
      [
        "GitHub Actions",
        "https://docs.github.com/en/actions"
      ]
    ]
  },
  {
    "chapter": "Detroit 調度",
    "explain": "Detroit 是工具協調層的設計；調度先檢查能力、權限、成本與工具健康，再把已核實輸出送回主對話。此教材不宣稱所有註冊項皆可執行。",
    "scenario": "輸入帶圖片的醫學問題時，若視覺模組不可用，要告知不能判讀，不能讓文字模型猜圖片內容。",
    "method": "對同一請求列出候選工具，依可用性與權限先過濾，再依任務特性排序並記錄原因。",
    "practice": "替搜尋、文件解析、繪圖工具定義路由規則，指定不可用時的可解釋回退。",
    "answer": "完成標準是有真實呼叫與返回結果；僅工具出現在清單不算能力已完成。",
    "code": "tools=[{'id':'search','available':False},{'id':'parse','available':True}]\nprint([x['id'] for x in tools if x['available']])",
    "sources": [
      [
        "Vanilla Detroit",
        "https://github.com/easylearnfromtw/vanilla/blob/main/src/detroit/core.ts"
      ],
      [
        "MCP Tools",
        "https://modelcontextprotocol.io/specification/2025-06-18/server/tools"
      ]
    ]
  },
  {
    "chapter": "工具呼叫",
    "explain": "每個工具應有描述、JSON Schema 參數、權限、預期輸出和錯誤格式。模型提出工具呼叫不代表已執行；由宿主完成驗證、授權與真正的 API 呼叫。",
    "scenario": "模型要求刪除資料，即使格式正確，也需獨立確認使用者授權與資源歸屬。",
    "method": "以唯讀查詢工具練習 schema 驗證、參數邊界、超時與可審計的結果。",
    "practice": "設計一個 get_status(name) 工具，描述未知 name 與服務逾時的回傳格式。",
    "answer": "不得把工具說明當成可任意執行程式碼；高權限操作必須另做權限核對。",
    "code": "def get_status(name):\n    if name not in {'queue','model'}: raise ValueError('unknown')\n    return {'name':name,'status':'unknown'}",
    "sources": [
      [
        "MCP Specification",
        "https://modelcontextprotocol.io/specification/2025-06-18/server/tools"
      ],
      [
        "Pydantic",
        "https://docs.pydantic.dev/latest/"
      ]
    ]
  },
  {
    "chapter": "Verifier 驗證",
    "explain": "驗證器應獨立於模型的『我做完了』敘述，檢查參數、資料來源、時間戳、實際工件與驗收條件。反證或缺來源時不得發布確定結論。",
    "scenario": "模型稱簡報已製作，但實際檔案不存在；Verifier 必須判定未完成並保留錯誤原因。",
    "method": "把驗收分成機器可檢測（檔案、格式、測試）與人工判讀（相關性、風險）。",
    "practice": "為『生成且部署網站』列出三個獨立成功條件，避免只靠模型自評。",
    "answer": "答案至少包含可存取工件、測試通過與實際部署回應，不得捏造成功網址。",
    "code": "report={'file_exists':True,'tests_passed':False}\nverified=all(report.values())\nprint('通過' if verified else '未驗收')",
    "sources": [
      [
        "Vanilla Veritas",
        "https://github.com/easylearnfromtw/vanilla/blob/main/src/detroit/veritas-gate.ts"
      ],
      [
        "GitHub Checks",
        "https://docs.github.com/en/rest/checks/check-runs"
      ]
    ]
  },
  {
    "chapter": "回饋與恢復",
    "explain": "失敗恢復要區分可重試的暫時問題與不可重試的驗證錯誤。工作 ID、冪等鍵、檢查點及錯誤記錄避免重複付款、寄信等副作用。",
    "scenario": "Webhook 逾時後重送相同 update_id，若沒有去重可能重複推送訊息。",
    "method": "加入已處理事件表與狀態機，只有可恢復錯誤退避重試，永久錯誤立即停止。",
    "practice": "設計一次訊息發送的重試機制：說明如何防止相同請求送出兩次。",
    "answer": "應使用事件唯一識別與持久儲存；不能只靠前端按鈕禁用避免重覆。",
    "code": "seen={123}\nupdate_id=123\nprint('略過重覆事件' if update_id in seen else '處理事件')",
    "sources": [
      [
        "SQLite Transactions",
        "https://www.sqlite.org/lang_transaction.html"
      ],
      [
        "Stripe Idempotency",
        "https://docs.stripe.com/api/idempotent_requests"
      ]
    ]
  },
  {
    "chapter": "開發環境",
    "explain": "可重現的環境要固定語言與依賴版本、清楚記錄操作系統和啟動命令。編輯器看得到檔案不等於專案能安裝或建置。",
    "scenario": "同一程式在 A 電腦可跑而 B 電腦出錯，優先對照 runtime 版本、lockfile 與環境變數。",
    "method": "記錄 python --version、node --version，建立虛擬環境並執行最小測試。",
    "practice": "寫下某個新專案的安裝步驟，別人不詢問你也能成功執行。",
    "answer": "應附版本、依賴安裝、最小啟動命令以及復現失敗所需的資訊。",
    "code": "python3 -m venv .venv\n# 啟動前先依作業系統啟用虛擬環境",
    "sources": [
      [
        "Python venv",
        "https://docs.python.org/3/library/venv.html"
      ],
      [
        "Node.js Docs",
        "https://nodejs.org/en/learn"
      ]
    ]
  },
  {
    "chapter": "需求規格",
    "explain": "可執行的需求應定義使用者情境、功能邊界、資料流、驗收測試與非功能性限制。模糊詞如『更快』要轉成可量測指標。",
    "scenario": "『讓網站快速』可轉成『首屏在指定手機網路條件下 p75 LCP 不超過目標值』，並說明測量方式。",
    "method": "先列出 must-have、out-of-scope 和 acceptance criteria，再把每條對應到測試。",
    "practice": "替 Telegram 課程頁撰寫三條可量測驗收條件與一條排除事項。",
    "answer": "合格需求能客觀判斷通過失敗，且涵蓋隱私、可用性與錯誤處理。",
    "code": "requirements={'user_can_open_lesson':True,'sources_visible':True}\nassert all(requirements.values())",
    "sources": [
      [
        "GitHub Spec Kit",
        "https://github.com/github/spec-kit"
      ],
      [
        "Web Vitals",
        "https://web.dev/articles/vitals"
      ]
    ]
  },
  {
    "chapter": "ChatGPT Coding",
    "explain": "用 ChatGPT 協作時先提供需求、相關檔案、錯誤訊息與測試方式；要求最小差異、說明改動理由及未驗證事項。產生程式碼仍需人或 CI 實際執行。",
    "scenario": "修復亂碼時，應先找資料輸入、序列化、渲染階段，而非把整個應用程式重寫。",
    "method": "請模型先提出假設和定位步驟，給出小 patch，執行測試後再審查。",
    "practice": "撰寫一段請 AI 修復 React UI 文字跳脫問題的指令，包含不改其他功能的限制。",
    "answer": "應要求現象、最小重現、精確檔案、差異、回歸測試與未確認風險。",
    "code": "instruction='只修改必要檔案；附測試；不要宣稱未跑的測試已通過'\nprint(instruction)",
    "sources": [
      [
        "OpenAI Prompting",
        "https://developers.openai.com/api/docs/guides/prompting"
      ],
      [
        "OpenAI Codex",
        "https://github.com/openai/codex"
      ]
    ]
  },
  {
    "chapter": "Claude Coding",
    "explain": "使用 Claude 進行 Coding 仍需要精確指令、上下文、變更範圍與回歸驗證；長上下文不應成為洩漏憑證或覆寫無關模組的理由。",
    "scenario": "大型專案中可先指定一個 failing test，再讓 Claude 做最小修補並驗證原有功能。",
    "method": "定義要修改的檔案與限制，提供測試錯誤，請模型先解釋 root cause。",
    "practice": "設計一則協助修復 Telegram webhook callback 的 Claude 工作指令。",
    "answer": "應避免直接貼 bot token，要求維持認證檢查與重放保護，測試成功才合併。",
    "code": "task={'scope':'webhook callback','secrets_allowed':False,'tests_required':True}\nassert task['tests_required']",
    "sources": [
      [
        "Claude Code",
        "https://github.com/anthropics/claude-code"
      ],
      [
        "Anthropic Docs",
        "https://docs.anthropic.com/en/docs/claude-code/overview"
      ]
    ]
  },
  {
    "chapter": "測試與除錯",
    "explain": "除錯先取得最小可重現步驟，再比對預期與實際，透過單元、整合、回歸測試逐層縮小。測試存在不等於已執行。",
    "scenario": "Telegram 文字 `\\\\n` 原樣顯示時，應測試字串源碼、組裝後的實際輸出及傳送 API payload。",
    "method": "設計一個會先失敗的測試，修復後執行，並再次確認舊功能沒有退化。",
    "practice": "寫出兩項 Telegram 教學故障的單元測試：換行與跳課邊界。",
    "answer": "測試要驗證真實 LF 字元和合法 lesson index，而不是只比對輸出包含某單字。",
    "code": "def render(): return '第一行\\n第二行'\nassert '\\n' in render() and '\\\\n' not in render()",
    "sources": [
      [
        "Python unittest",
        "https://docs.python.org/3/library/unittest.html"
      ],
      [
        "pytest",
        "https://docs.pytest.org/en/stable/"
      ]
    ]
  },
  {
    "chapter": "Git 與交付",
    "explain": "Git 是版本歷史管理；分支、commit、PR 與 CI 各解決不同問題。合併不等於部署，部署不等於驗證所有功能。",
    "scenario": "修復 Bot 建議由 feature branch 提交，PR 標示變更與測試，合併後另驗證 Railway 實際服務。",
    "method": "在獨立分支完成最小修補、提交、開 PR、檢查 CI，再進行受控部署。",
    "practice": "規劃一個 Git 修復流程，描述如何回滾造成教材中斷的改動。",
    "answer": "答案要有提交 SHA、測試證據與部署確認，不可把 PR 已建立說成已上線。",
    "code": "git switch -c fix/lesson-newline\n# 修改、測試後再 git add 與 git commit",
    "sources": [
      [
        "Git Book",
        "https://git-scm.com/book/en/v2"
      ],
      [
        "GitHub PR Docs",
        "https://docs.github.com/en/pull-requests"
      ]
    ]
  },
  {
    "chapter": "HTTP 基礎",
    "explain": "HTTP 方法表達操作語意；狀態碼表示回應結果。GET 不應有副作用，POST 可產生狀態，TLS 保護傳輸，但不自動提供權限控管。",
    "scenario": "GET /lessons/1 與 POST /progress 行為不同；404 表示資源不存在，401/403 通常涉及驗證或授權。",
    "method": "觀察 request method、URL、header、body、status，區分網路失敗與伺服器錯誤。",
    "practice": "設計一組課程 API，說明 GET 列表與 POST 更新進度的回應與錯誤情境。",
    "answer": "答案須說明 200/201/400/401/403/404/429/500 的適用時機與避免重覆寫入。",
    "code": "status=404\nprint('資源不存在' if status==404 else '需看狀態碼')",
    "sources": [
      [
        "MDN HTTP",
        "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview"
      ],
      [
        "HTTP Semantics RFC9110",
        "https://httpwg.org/specs/rfc9110.html"
      ]
    ]
  },
  {
    "chapter": "API Key 認證",
    "explain": "API Key 代表可計費或授權的憑證，必須儲存在受信任後端，透過標頭傳遞，能撤銷、輪替並採最小權限。前端/Telegram 公開訊息不可存長期秘密。",
    "scenario": "把 API Key 直接打包進 PWA，任何人都可能從網頁原始碼取出並濫用；必須由後端代管。",
    "method": "定義 key_id、雜湊驗證、作用範圍、到期、額度與審計；提供撤銷流程。",
    "practice": "設計一個每位 Vanilla 使用者都可撤銷的 API 金鑰生命週期。",
    "answer": "應有伺服器端驗證與 per-key 權限、token 限額；顯示一次明文後只保留安全雜湊。",
    "code": "import os\napi_key=os.environ.get('DEMO_API_KEY')\nprint('已配置' if api_key else '未配置')",
    "sources": [
      [
        "OWASP API Top 10",
        "https://api-security.owasp.org/editions/2023/en/0x11-t10/"
      ],
      [
        "GitHub Secrets",
        "https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions"
      ]
    ]
  },
  {
    "chapter": "Python 串接",
    "explain": "requests 便於同步 HTTP；應設定 timeout、raise_for_status，區分連線錯誤、HTTP 錯誤與 JSON 格式錯誤。不要把任意網站結果直接視為可信資料。",
    "scenario": "讀取公開 JSON API，若 503 應告知暫時不可用；若 401 先查權限，不應瘋狂重試。",
    "method": "先在隔離環境安裝 requests，再對可信測試網址發送請求，處理例外並驗證回傳欄位。",
    "practice": "撰寫 Python 程式取得 JSON，於網路失敗或 4xx 時顯示明確錯誤。",
    "answer": "驗收包含 timeout、狀態碼、資料結構、例外處理；不應輸出 API Key。",
    "code": "import requests\nr=requests.get('https://httpbin.org/json',timeout=8)\nr.raise_for_status()\nprint(type(r.json()).__name__)",
    "sources": [
      [
        "Requests Quickstart",
        "https://requests.readthedocs.io/en/stable/user/quickstart/"
      ],
      [
        "HTTPX",
        "https://www.python-httpx.org/quickstart/"
      ]
    ]
  },
  {
    "chapter": "JavaScript 串接",
    "explain": "fetch() 遇到 404/500 通常仍會 resolve，需讀 response.ok；AbortController 管理超時或取消。跨站 CORS 由服務端控制，不是瀏覽器錯誤可以繞過。",
    "scenario": "手機切換分頁要取消不必要的資料載入，避免使用者看到舊結果覆蓋新查詢。",
    "method": "以 async/await 發請求，檢查 response.ok，成功後再解析 JSON，錯誤回報分類。",
    "practice": "製作可取消的 fetch 範例，涵蓋 404 回應與 AbortError。",
    "answer": "合格程式有明確的取消行為、HTTP status 檢查、finally 清理；不把 key 放前端。",
    "code": "const c=new AbortController();\nconst r=await fetch('/health',{signal:c.signal});\nif(!r.ok)throw new Error('HTTP '+r.status);",
    "sources": [
      [
        "MDN Fetch",
        "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch"
      ],
      [
        "MDN AbortController",
        "https://developer.mozilla.org/en-US/docs/Web/API/AbortController"
      ]
    ]
  },
  {
    "chapter": "串流與重試",
    "explain": "串流能逐塊顯示結果，但需處理斷線、取消、partial output 與序列化邊界。429 與暫時性 5xx 可在規範允許時退避，具副作用的 POST 不可盲目重送。",
    "scenario": "長篇 AI 回答若用 SSE，連線中斷時不應把半段文字標成已完成；若已傳送通知應避免重覆送出。",
    "method": "先辨認可重試狀態、實施 capped exponential backoff，再用 request_id 去重。",
    "practice": "設計一個 429 Retry-After 的重試流程，說明如何防止多次扣款。",
    "answer": "正確方案需上限、隨機抖動、取消、冪等鍵、部分輸出標示及錯誤觀測。",
    "code": "delay=min(30,2**3)\nprint('backoff seconds:',delay)",
    "sources": [
      [
        "MDN SSE",
        "https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events"
      ],
      [
        "HTTPX Timeouts",
        "https://www.python-httpx.org/advanced/timeouts/"
      ]
    ]
  },
  {
    "chapter": "Token 額度",
    "explain": "商業 API 的 token 限額必須使用伺服器端原子計量；預約估計成本與實際扣帳可分離，防止並發超支。token、請求數、RPM/TPM 是不同約束。",
    "scenario": "兩個裝置同時消耗同一個 key 的剩餘額度，如果只在前端顯示配額，兩者都可能超額。",
    "method": "設計原子 reserve/commit/refund 流程，記錄租戶、key、模型與請求 ID。",
    "practice": "為某用戶制定每日 10,000 tokens 上限，指出遇到並發與失敗應如何計量。",
    "answer": "答案應包括資料庫交易、實際使用量核銷、到期日與公平限制，不可用簡單 localStorage 當權威。",
    "code": "limit=10000;used=8500;requested=2000\nallowed=used+requested<=limit\nprint('允許' if allowed else '拒絕或縮減')",
    "sources": [
      [
        "OWASP Resource Consumption",
        "https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/"
      ],
      [
        "PostgreSQL Transactions",
        "https://www.postgresql.org/docs/current/tutorial-transactions.html"
      ]
    ]
  },
  {
    "chapter": "Tool Calling",
    "explain": "工具呼叫是模型提議結構化參數，由宿主進行 schema 驗證與權限核對後執行；不能讓外部文字自行提高工具權限。",
    "scenario": "假設模型呼叫 search(query)，輸入只能是查詢字串；不能因網頁文字要求就改成刪檔工具。",
    "method": "先定義讀取型工具，標示工具名稱、描述、參數與結果格式，再模擬失敗。",
    "practice": "設計一個 sum(a,b) 工具 schema 及三筆正反例，說明何時需要人類授權。",
    "answer": "正確答案能區分工具選擇、參數驗證、執行結果與使用者最後看到的回答。",
    "code": "def add(a:int,b:int)->int: return a+b\nassert add(2,3)==5",
    "sources": [
      [
        "MCP Tools",
        "https://modelcontextprotocol.io/specification/2025-06-18/server/tools"
      ],
      [
        "Pydantic",
        "https://docs.pydantic.dev/latest/"
      ]
    ]
  },
  {
    "chapter": "Workflow 編排",
    "explain": "工作流程是一組可明確追蹤的狀態轉移，包含分支、重試、補償與停止條件。比起無限制代理迴圈，更適合需要可靠交付的任務。",
    "scenario": "『收集新聞→核實→寄摘要』在來源失效時應停止寄信，而非繼續生成看似正確的消息。",
    "method": "列出 start、collect、verify、publish、failed 五狀態，設計轉移規則及回復。",
    "practice": "規劃一個用戶上傳文件後的摘要工作流，包含附件讀取失敗的處理。",
    "answer": "應展示進度、錯誤事件、可恢復點，且不可在驗證前執行不可逆操作。",
    "code": "states=['start','collect','verify','publish']\nassert states.index('verify')<states.index('publish')",
    "sources": [
      [
        "LangGraph Workflows",
        "https://docs.langchain.com/oss/python/langgraph/workflows-agents"
      ],
      [
        "Temporal",
        "https://github.com/temporalio/temporal"
      ]
    ]
  },
  {
    "chapter": "資料清理",
    "explain": "資料清理需要保留原始來源、處理規則及欄位型別，尤其日期、金額與缺值不能直接猜測補齊。去重應有唯一鍵與審計。",
    "scenario": "兩列交易同 ID 但金額不同，不能只刪除其中一筆；要先確認是否為重覆或修正版本。",
    "method": "讀取樣本、確認 schema、標準化日期與空白、標記缺值並將清理記錄保存。",
    "practice": "給三列含重覆 ID 的資料，提出保留與衝突處理準則。",
    "answer": "保留每次轉換前後的資料或可追溯記錄，對衝突資料標示待人工判定。",
    "code": "rows=[{'id':1,'name':' A '},{'id':2,'name':'B'}]\nclean=[{**r,'name':r['name'].strip()} for r in rows]",
    "sources": [
      [
        "pandas User Guide",
        "https://pandas.pydata.org/docs/user_guide/index.html"
      ],
      [
        "OpenRefine",
        "https://github.com/OpenRefine/OpenRefine"
      ]
    ]
  },
  {
    "chapter": "向量搜尋",
    "explain": "Embedding 將文字映射至數值向量以便比對語義相關性；相似度高不一定代表事實正確。搜尋可用關鍵字與向量混合，對結果重排序。",
    "scenario": "查詢『醫美風險』要避免只因文章用詞接近就把未經證實的廣告排在醫療指南之前。",
    "method": "比較 BM25 關鍵字與向量召回，再用來源品質與 reranker 排序，觀察漏查案例。",
    "practice": "針對五段文件設計混合式搜尋評測，定義 top-k 相關性指標。",
    "answer": "答案應包含查詢集、標註真實相關段落、召回率與來源權威性限制。",
    "code": "a=[1.0,0.0];b=[0.8,0.6]\nsim=sum(x*y for x,y in zip(a,b))\nprint('dot:',sim)",
    "sources": [
      [
        "Google Embeddings",
        "https://developers.google.com/machine-learning/crash-course/embeddings"
      ],
      [
        "pgvector",
        "https://github.com/pgvector/pgvector"
      ]
    ]
  },
  {
    "chapter": "知識圖譜",
    "explain": "知識圖譜以實體、關係及屬性表達知識，需有來源、有效日期、版本和衝突管理。不能把模型推測的關係自動當成已驗證資料。",
    "scenario": "『A 公司收購 B 公司』可能在不同時間有效；圖譜要標示事件日期及來源，不能永久假定。",
    "method": "把文件抽出 entity/relation 並連結原句；用人工或規則驗證後才納入正式圖譜。",
    "practice": "把醫療機構、科別與醫師建立知識圖，列出來源與更新原則。",
    "answer": "答案要能追到原始證據，對同名實體做消歧，保留互相衝突的說法。",
    "code": "edges=[('診所A','提供','服務B')]\nfor subject,relation,obj in edges: print(subject,relation,obj)",
    "sources": [
      [
        "Wikidata Model",
        "https://www.wikidata.org/wiki/Wikidata:Data_model"
      ],
      [
        "Neo4j Docs",
        "https://neo4j.com/docs/getting-started/graph-database/"
      ]
    ]
  },
  {
    "chapter": "多代理協作",
    "explain": "多代理系統應定義各代理責任、可用工具、交接資料與終止條件。增加代理可能增加成本與錯誤，不一定提高答案品質。",
    "scenario": "一個 agent 搜來源、一個抽資料、一個核實；Verifier 若發現無來源必須能阻止結果發布。",
    "method": "畫出 supervisor 與 worker 的呼叫邊界，設定最大執行回合及人工核准點。",
    "practice": "設計 3 個 agent 的研究流程，指出哪一步最容易出現彼此互相誤信。",
    "answer": "合格設計要有共用 schema、錯誤處理與終止機制，避免無限互相轉交。",
    "code": "agents={'researcher':'read-only','writer':'draft','verifier':'approve'}\nassert agents['researcher']=='read-only'",
    "sources": [
      [
        "LangGraph Multi-agent",
        "https://github.com/langchain-ai/langgraph-supervisor-py"
      ],
      [
        "LangChain Learn",
        "https://docs.langchain.com/oss/python/learn"
      ]
    ]
  },
  {
    "chapter": "本地部署",
    "explain": "本地部署要區分模型檔、推論服務與前端介面；CPU、RAM、VRAM、網路及權限可能決定能否運作。手機 PWA 不能直接呼叫家中電腦的 localhost。",
    "scenario": "RTX 3050 桌機跑 Ollama 時，iPhone 需透過受保護的 HTTPS 代理連接服務，而非把 11434 裸露公網。",
    "method": "先確認硬體與 Ollama 模型支援，測量推論速度，再配置私有網路或授權代理。",
    "practice": "列出一套小模型本地部署的安全清單，包含顯存、連線與失敗回退。",
    "answer": "應避免公開未保護的 API 端口，並測試沒有 GPU 時的效能與用量限制。",
    "code": "ollama list\n# 本機命令；如尚未安裝請先依官方文件完成安裝",
    "sources": [
      [
        "Ollama",
        "https://docs.ollama.com/"
      ],
      [
        "Vanilla 自架指南",
        "https://github.com/easylearnfromtw/vanilla/blob/main/deployment/ollama/README.md"
      ]
    ]
  },
  {
    "chapter": "Docker",
    "explain": "image 是建置模板，container 是運行實例，volume 可持久保留資料；重建容器時未掛載的資料可能遺失。健康檢查和資源上限是部署一部分。",
    "scenario": "Telegram Bot SQLite 資料若只存在 `/tmp`，重啟實例或替換容器可能遺失學習進度；需使用持久化 volume。",
    "method": "建立 Dockerfile，掛載 volume，測試重新建立容器後資料仍存在。",
    "practice": "解釋 Docker Compose 服務與 volume 差別，為課程進度資料設計儲存方式。",
    "answer": "驗收至少實測重啟與重建、健康檢查、最小權限與秘密透過環境注入。",
    "code": "docker run --rm hello-world\n# 可在已安裝 Docker 的主機驗證執行環境",
    "sources": [
      [
        "Docker Getting Started",
        "https://github.com/docker/getting-started"
      ],
      [
        "Docker Volumes",
        "https://docs.docker.com/engine/storage/volumes/"
      ]
    ]
  },
  {
    "chapter": "CI/CD",
    "explain": "CI 自動執行格式檢查、單元測試與建置；CD 將經過批准的工件發佈到環境。CI 通過不等於已確認 Telegram 真實使用情境。",
    "scenario": "教材修補 PR 應測試 UTF-8、所有 324 課可生成、所有引用 URL 格式，以及 callback 行為。",
    "method": "於 PR 開啟測試工作流，記錄失敗，合併後再檢查部署 SHA 與煙霧測試。",
    "practice": "寫一個基本 CI 程序：checkout、Python syntax、unit tests、報告結果。",
    "answer": "未有測試記錄不能聲稱已驗證；部署還需確認使用中的 commit 版本。",
    "code": "python -m compileall services/weiguo\npython -m unittest discover -s services/weiguo -p 'test_*.py'",
    "sources": [
      [
        "GitHub Actions",
        "https://docs.github.com/en/actions"
      ],
      [
        "Workflow Syntax",
        "https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions"
      ]
    ]
  },
  {
    "chapter": "雲端部署",
    "explain": "雲端部署需處理 HTTPS、密鑰、健康檢查、資料持久化、可觀測性與回滾。環境變數可以保存秘密，但不應回傳給瀏覽器或聊天內容。",
    "scenario": "Railway 服務即使 GitHub 已合併，如果未自動發佈或環境變數不齊，Telegram Webhook 仍可能使用舊版本。",
    "method": "檢查建置 SHA、Webhook URL、Secret、健康端點與單次測試回覆，再逐步放量。",
    "practice": "制定 Railway 部署清單，區分程式交付、服務健康與最終使用者可操作。",
    "answer": "應驗證公開入口的 TLS、安全標頭、密鑰管理、儲存持久化及 rollback 按鈕。",
    "code": "import os\nassert os.environ.get('ENV','development') in {'development','staging','production'}",
    "sources": [
      [
        "Railway Docs",
        "https://docs.railway.com/guides/deployments"
      ],
      [
        "FastAPI Deploy",
        "https://fastapi.tiangolo.com/deployment/"
      ]
    ]
  },
  {
    "chapter": "監控與資安",
    "explain": "可靠系統需監測錯誤率、延遲、工作成功率與權限事件；日誌避免含 API Key、身分 token 或完整私密對話。告警要有抑制與故障處理流程。",
    "scenario": "教學 Bot 5xx 飆高時應看 webhook 錯誤與 callback 錯誤，不要只依機器仍在線判定正常。",
    "method": "加入結構化錯誤代碼、匿名 trace id 與慢請求追蹤，設定警報門檻。",
    "practice": "為 Telegram Academy 提出三個 KPI、一個權限拒絕事件及一項故障回應流程。",
    "answer": "答案需明確記錄而非洩漏機密，並標示監控資料的保存期限與存取權限。",
    "code": "import logging\nlogging.warning('academy callback failed: code=%s','TIMEOUT')",
    "sources": [
      [
        "OpenTelemetry",
        "https://opentelemetry.io/docs/"
      ],
      [
        "OWASP API Security",
        "https://api-security.owasp.org/editions/2023/en/0x11-t10/"
      ]
    ]
  },
  {
    "chapter": "效能與回滾",
    "explain": "效能評估至少區分 p50、p95 延遲、錯誤率和使用者感知延遲。部署應有可回復版本、資料庫遷移策略與向後相容路徑。",
    "scenario": "使用者說『教學壞掉』，要先確認是 webhook 失敗、超時、編碼、資料庫，或按鈕回呼，而非僅修改外觀。",
    "method": "做最小 smoke test，記錄基準數據，對比新版本，必要時依部署 SHA 回滾。",
    "practice": "為 Telegram 課程升版擬一份回滾演練，說明如何保留已完成課次。",
    "answer": "驗收須包含可回退程式、持久化進度、向後相容 schema 及已驗證的延遲指標。",
    "code": "samples=sorted([0.2,0.3,0.8,1.5,2.0])\nprint('最大觀測延遲:',samples[-1])",
    "sources": [
      [
        "Google SRE Book",
        "https://sre.google/sre-book/monitoring-distributed-systems/"
      ],
      [
        "PostgreSQL Migrations",
        "https://www.postgresql.org/docs/current/ddl-alter.html"
      ]
    ]
  }
]
LEVELS = {"0": "零基礎", "1": "入門", "2": "開發者", "3": "進階"}

def render_lesson(index: int, level: str = "0") -> str:
    """Render a bounded, standalone Telegram lesson, never a single generic sentence."""
    if not isinstance(index, int) or not 0 <= index < len(LESSONS):
        raise ValueError("未知課次")
    title, _, topic, chapter, stage = LESSONS[index]
    row = KNOWLEDGE[topic * 6 + chapter]
    if row["chapter"] != CHAPTERS[topic][chapter]:
        raise AssertionError("教材對照錯誤")
    heading = [
        "學習目標：能解釋定義、辨識適用範圍，並以課內案例說明限制。",
        "核心原理：按輸入→處理→輸出→驗證的順序理解機制，釐清常見誤解。",
        "應用案例：分析完整情境，分辨事實、假設、風險與交付物。",
        "操作準備：確認可用環境、來源權限及最小安全設定，再進行實作。",
        "實作步驟：以課內操作流程做最小可重現演練，逐一檢查狀態。",
        "程式範例：先判斷是可直接執行的範例或示意碼；勿在不安全環境執行。",
        "常見錯誤：對照本章風險，先重現問題，避免以猜測替代調查。",
        "實戰練習：獨立完成任務後比對參考解法，不把範例當成標準產品 API。",
        "驗收測驗：用檢核清單解題；能說明為何答案成立才算真正理解。"
    ][stage]
    focus = [
        "這一課結束時請先用一句自己的話講解核心概念，再圈出案例中需要查證的資訊。",
        "請把機制分為三段，說明每段可能出錯之處，並指出哪些是無法從模型本身證明的結果。",
        "先閱讀案例，試著提出兩種作法，評估哪個比較安全、可追蹤且符合實際需求。",
        "事前檢核：使用合規測試資料、不要貼入真實憑證；能做離線演練就不先連線正式環境。",
        "實作順序：①確認需求與資料 ②執行最小範例 ③檢查輸出 ④記錄異常 ⑤必要時回滾。",
        "範例目的在展示概念；帶有第三方套件、服務、命令列的段落需先完成相應環境準備。",
        "排查順序：先比對預期/實際，再檢查輸入、格式、權限、版本、連線與邊界值。",
        "作答前先寫出輸入、預期輸出與至少一個失敗情境；實作後按檢核標準自行檢查。",
        "作答評量：概念是否正確？步驟可否重現？錯誤是否可追蹤？來源與權限是否完整？"
    ][stage]
    part = [
        ("知識圖像", row["explain"] + "\n\n" + row["scenario"]),
        ("機轉解說", row["explain"] + "\n\n" + row["method"]),
        ("案例解析", row["scenario"] + "\n\n" + row["method"]),
        ("準備清單", row["method"] + "\n\n" + row["answer"]),
        ("逐步實作", row["method"] + "\n\n" + row["scenario"]),
        ("範例及解讀", row["code"] + "\n\n解讀：" + row["method"]),
        ("錯誤與修正", row["answer"] + "\n\n重現情境：" + row["scenario"]),
        ("自主練習", row["practice"] + "\n\n提示：" + row["method"]),
        ("參考答案及解析", row["answer"] + "\n\n依據：" + row["explain"])
    ][stage]
    refs = row["sources"]
    for label, url in refs:
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise AssertionError("教材來源必須是公開 HTTPS 參考頁")
    mode = LEVELS.get(str(level), LEVELS["0"])
    level_note = {
        "0": "新手提醒：先學會描述輸入、輸出，再研究各種專業工具的細節。",
        "1": "入門提醒：嘗試對照一個真實案例，確認何時適用及何時應停止。",
        "2": "開發者提醒：練習寫測試、記錄錯誤與保持修改範圍最小化。",
        "3": "進階提醒：特別檢查授權邊界、不可逆副作用、品質指標與失敗復原。"
    }.get(str(level), "先理解概念再延伸應用。")
    body = (
        f"主題：{TOPICS[topic]}｜{row['chapter']}\n"
        f"本課：{STAGES[stage]} · 第 {index + 1}/{len(LESSONS)} 課\n"
        f"程度：{mode}\n\n"
        f"【學習任務】\n{heading}\n{level_note}\n\n"
        f"【知識重點】\n{row['explain']}\n\n"
        f"【{part[0]}】\n{part[1]}\n\n"
        f"【真實情境與風險辨識】\n{row['scenario']}\n\n"
        f"【操作方法】\n{row['method']}\n"
        "練習時請先以匿名／測試資料進行；檢查輸入、執行回應與結果依據，"
        "遇到失敗先保留重現步驟，不要直接重試不可逆操作。\n\n"
        f"【可拆解的程式／資料示例】\n{row['code']}\n"
        "註：示例可能使用 Python、JavaScript、Shell 或偽碼；"
        "執行前必須確認語言、依賴與測試環境。範例不是已部署的 Vanilla API。\n\n"
        f"【課後動手做】\n{row['practice']}\n"
        "請提出：①輸入資料 ②期望輸出 ③可能失敗情境 ④至少一項驗證方法。\n\n"
        f"【參考解答與評量】\n{row['answer']}\n"
        "評量時請檢查是否有來源、能否重現、是否處理例外、是否區分推測與實際結果。\n\n"
        f"【自我檢核】\n{focus}\n\n"
        "【延伸資料／來源】\n"
        + "\n".join(f"• {label}\n{url}" for label, url in refs)
        + "\n\n※ 教材為原創整理；連結是可查閱的參考資料，不代表即時讀取或已部署其功能。"
    )
    if len(body) > 3900:
        raise AssertionError(f"第 {index+1} 課超出 Telegram 4096 字限制")
    return body

assert len(KNOWLEDGE) == 36
assert len(LESSONS) == 324
