# 衞國（WeiGuo）受限瀏覽器後端

由 FastAPI + Playwright 建立隔離的短生命週期瀏覽器，不需手機 Safari 保持開啟；可選用內網 Ollama 生成**未授權的唯讀操作草稿**。Zeus 與 Athena 仍負責權限判斷，CREAM 處理數值，Venus/爾雅產出對話結果。這套系統不是第二個手機端 AI 模型，也不會取得 admin 權限。

## 本地部署

1. 先設定你控制的網域：`WEIGUO_ALLOWED_HOSTS=example.org,www.example.org`。預設空值時瀏覽請求會拒絕。
2. 建立隨機的 >=32 字元 `WEIGUO_ADMIN_TOKEN`，**只放在受信任伺服器端**，切勿寫入 GitHub Pages、PWA、聊天或前端 localStorage。
3. 安裝 Docker/Playwright，複製 `docker-compose.example.yml` 為本地 compose 檔，設定私密 .env，再 `docker compose up --build`。
4. 在私有 VPN 或經 OAuth 代理保護的後端呼叫 `GET /health`、`POST /v1/plan`、`POST /v1/execute`。規劃功能需要內部 `WEIGUO_OLLAMA_URL` 與 `WEIGUO_OLLAMA_MODEL`，否則回應 503 而不虛構模型執行結果。
5. 從公開 PWA 連線需另外實作 Google/OIDC 登入、每位家庭成員的 owner ACL、每操作審核及專用代理 API。**不能把 Bearer token 直接下發到 Safari**。

## 已實作安全約束

- 靜態 HTTPS 網域白名單，不接受內部 URL、自訂 port、密碼 URL；操作前檢查 DNS 公網位址及導覽後網址
- 預設唯讀瀏覽、正文擷取、捲動與跳轉；點擊／填入預設禁用，需後端設置且單次明確核准
- 禁止付款、刪除帳號、密碼等高風險互動；不執行來自頁面或 LLM 的系統指令
- 限制步驟數、DOM 回傳長度、輸入長度，拒絕下載；單次執行使用無持久 cookie 的 Playwright Context
- 自訂工具只保存**元資料**，不得自動載入 JS、Python 或未知二進位
- **這仍非完整網路隔離沙箱**：正式部署必須限制容器 egress、Cloud metadata、內部網段並設定速率限制。IP/DNS 重綁定等仍需網路層封鎖。

## 可用端點
`GET /health`: 服務配置狀態（不揭露金鑰）；`POST /v1/tools`: 驗證工具登錄 metadata；
`POST /v1/plan`: 可選本地 Ollama 唯讀規劃；
`POST /v1/execute`: 授權後執行已驗證瀏覽步驟，並回傳受限來源與事件紀錄。

## 現實限制
原專案在 GitHub Pages 上是靜態網站，無法直接啟動長時間 Playwright。此服務**程式碼可部署但目前並未部署或與 PWA 連接**。要做到真正自然語言跨網站工作及 24/7 排程，還須可信任後端登入、會話核准與 Persistent Jobs/Chronos 工作隊列，不能宣稱單憑此 repo 已具備全部能力。
