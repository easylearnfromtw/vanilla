"""Academy course catalog."""
TOPICS = ["AI 基礎", "October", "AI Coding", "API 串聯", "Agent 工程", "部署營運"]
STAGES = ["學習目標", "核心原理", "應用案例", "操作準備", "實作步驟", "程式範例", "常見錯誤", "實戰練習", "驗收測驗"]

CHAPTERS = [["模型推論","Token 與上下文","提示詞工程","JSON 結構化輸出","RAG 檢索","事實核查"],["October 架構","任務拆解","Detroit 調度","工具呼叫","Verifier 驗證","回饋與恢復"],["開發環境","需求規格","ChatGPT Coding","Claude Coding","測試與除錯","Git 與交付"],["HTTP 基礎","API Key 認證","Python 串接","JavaScript 串接","串流與重試","Token 額度"],["Tool Calling","Workflow 編排","資料清理","向量搜尋","知識圖譜","多代理協作"],["本地部署","Docker","CI/CD","雲端部署","監控與資安","效能與回滾"]]
CONCEPTS = [["模型輸出依上下文產生，不能視為已查證事實","Token 是模型處理與計量單位，長對話需控管上下文","有效指令包含目標、背景、限制、格式及驗收條件","JSON 欄位需型別、必填與解析驗證","先檢索可靠來源，再以證據回答","檢查引用存在、版本、時效及支持程度"],["自主執行引擎以資料、工具和驗證為核心，此為產品定位","定義依賴、輸入、輸出、失敗分支及成功條件","依權限、可用性、成本和能力選擇工具","以 schema 驗證參數，限制逾時與副作用","獨立核對工具結果與引用，不只相信模型自評","用冪等鍵、檢查點和可刪除回饋改善流程"],["確認語言版本、依賴及可重現環境","先寫需求、邊界條件與驗收標準再動工","讓 ChatGPT 先規劃、再產生最小變更及測試","給 Claude 必要檔案與錯誤資訊，要求最小差異","以最小重現、單元測試與回歸測試定位錯誤","用分支、提交、PR 審查與 README 交付"],["理解方法、狀態碼、JSON、timeout 與冪等性","API Key 應存後端環境變數並支援撤銷","使用 requests、timeout 與 raise_for_status","使用 fetch、response.ok 和 AbortController","處理 SSE、中斷、429 退避與 5xx 重試","按租戶與金鑰計量，防止超額及競態"],["工具必須定義參數、權限、結果和錯誤","用狀態機處理分支、重試及補償","規範缺值、去重、來源與欄位格式","比較關鍵字、向量檢索和 rerank","使用實體、關係、版本與來源追蹤","定義代理責任、交接與終止條件"],["確認硬體、記憶體與模型資源","分清 image、container、volume 與健康檢查","自動執行 lint、test、build 和部署閘門","配置 TLS、環境變數、健康檢查與回滾","觀測延遲、錯誤率、日誌與密鑰安全","量測 p95、成本與故障復原時間"]]
LESSONS = []
for topic_idx, chapters in enumerate(CHAPTERS):
    for chapter_idx, chapter in enumerate(chapters):
        concept = CONCEPTS[topic_idx][chapter_idx]
        for stage_idx, stage in enumerate(STAGES):
            prompts = [
                f"學習目標：理解{chapter}。重點：{concept}。完成後應能用自己的話解釋用途。",
                f"核心原理：{concept}。辨認輸入、處理、輸出和限制，避免把設計目標當成既有能力。",
                f"案例：將{chapter}用於一個真實專案，列出使用者、資料來源、預期結果與風險。",
                f"準備：確認環境版本、權限、測試資料及回滾方式。禁止貼出密碼、Token 或 API Key。",
                f"步驟：一、定義需求；二、準備最小輸入；三、執行；四、檢查輸出；五、記錄錯誤。任務：{chapter}。",
                f'教學資料格式示例：input={{"task":"{chapter}"}}；output={{"ok":true,"evidence":[]}}。這不是已驗證的產品 API。',
                f"常見錯誤：版本不符、權限不足、格式錯誤、逾時與錯誤假設。先找最小重現案例。",
                f"實作練習：針對{chapter}寫一份包含輸入、輸出、失敗情境及測試方法的小型方案。",
                f"驗收：可重現、結果可檢查、失敗可追蹤、無敏感資料洩漏。延伸：新增一項自動測試。"
            ]
            LESSONS.append((f"{chapter}｜{stage}", prompts[stage_idx], topic_idx, chapter_idx, stage_idx))
assert len(TOPICS) == 6 and len(LESSONS) == 324
