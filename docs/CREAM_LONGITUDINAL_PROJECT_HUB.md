# CREAM 長期數據追蹤 × PROJECT HUB

## 已實作的長期資料分析
CREAM 包含 deterministic 的時間序列分析、依個人帳號分離的 IndexedDB 快照、日期／單位／原始資料列來源、重複資料辨識、每日多次測量的平均、首次／最新值、差值、百分比變化、每 30 天線性斜率、異常觀測及缺漏警示、可設定目標與期限、SVG 趨勢圖、規劃建議、CSV 歷史匯出和來源快照刪除。

對話貼上日期＋數值、CSV、XLSX 等支援的附件會在非私密模式盡可能自動存入長期資料。接受長表格：日期,指標,數值,單位；或寬表格：日期,網站使用者 (人),營業額 (TWD)。文字例：2026-10-01 體重: 75 kg。沒有測量日期時可能以匯入日期作參考；介面必須揭露。沒有日期、沒有數值欄、分析失敗時，不能捏造結果。掃描 PDF 不具文字層則仍需要 OCR。

分析建議是統計規則與資料品質檢查，不等於因果結論、醫療診斷或保證達標。CREAM P0 的進階統計、十四模組完整藍圖尚未全數實作。IndexedDB 不等於雲端異地備份，重要資料請匯出。

## PROJECT HUB
透過 GitHub 官方公開 API，真正列出 easylearnfromtw 帳號下公開專案並選擇程式碼索引。CITYMUS 可能與 citymusic、musiccity、musictown 專案有關；不會猜測未找到的「稜角」Repo。單一 Repo 可以選最多十二個可讀取的源碼檔案；全專案索引會按實際公開 Repo 尋找最多兩個代表檔案，受 GitHub API 配額與網路限制。

已索引的擁有者原始碼會形成有路徑、函式、版本 SHA、來源網址的 RAG 知識索引；上傳的程式檔案也可以本機保存。相關聊天問題自動召回部分索引與來源。這是知識檢索，**不是任意上傳程式就可以直接執行或自動更新基礎模型權重**。

可匯出原始碼 RAG JSON，或以真實程式碼續寫案例匯出分開 train/eval 的 SFT JSONL，對可使用的自有程式碼進行受控 GPU LoRA 訓練。相同檔案不會同時進入訓練與驗證集。訓練後必須以保留測試與基礎模型比較，確認效能和安全沒有退步後再由本人決定載入。專案索引本身沒有執行訓練。

OpenAPI 3.x JSON 可以匯入並列出明確定義的公開 HTTPS GET 方法。只有使用者點選時才真正呼叫，能解析成數據列的 JSON 回應可加入 CREAM。POST、DELETE、付費或含私密 Token 的 API 仍需要有權限的獨立後端 Adapter；不會在公開 GitHub Pages 暴露 GitHub PAT 或 API Secrets。

整合專案功能會將選定的真實專案與檔案清單傳給 Self-Build CODE。真正寫 GitHub PR 需已部署受保護 GitHub Worker；不會在 iPhone Browser 任意 eval 第三方原始碼，也不會跳過 CI／合併審核。

## 驗收
- CREAM：匯入至少三個不同日期的數據，比較變化，建立目標，重新開啟 App 應能看到歷史。
- PROJECT HUB：選取本人 GitHub 真實 Repo，檢查索引含真實路徑與 GitHub 原始連結。
- Code Learning：匯出 SFT JSONL 後只可以聲稱生成資料，GPU 訓練需另行實測。
- API：只有真實 GET 2xx JSON 資料符合日期與數值列時才能宣稱新增 CREAM 歷史。
- CI：所有回歸測試、TypeScript、Vite 與正式 GitHub Pages 部署須成功。

Security: code comments and external API responses are untrusted input, not trusted instructions. Training-data usage rights and third-party dependency licenses must be respected.