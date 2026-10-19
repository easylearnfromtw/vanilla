# Vanilla × Mobilerun（可選模組）

## 現況

Vanilla 是 GitHub Pages 上的 React/Vite PWA；Mobilerun 是 MIT 授權的 Python 裝置 Agent 框架。**不能**把 Python Mobilerun 或 WebDriverAgent 直接包進 Safari，並因此取得跨 App 控制權。

已增加：手機操作 Agent 頁面、自然語言任務安全預覽、桌面端 CLI 複製、可選 HTTPS Bridge 客戶端、短效 Token（React memory only）、私密模式阻斷、敏感操作拒絕、外部結果 Prompt Injection 隔離。這不表示已建立 Mobilerun Bridge，也不表示已實際控制 iPhone。

## 官方本機環境

- iOS：需 macOS + Xcode + 正確簽署 WebDriverAgent，安裝 mobilerun-ios，連接並信任 iPhone，再運行官方 mobilerun-ios 本地橋接。參閱官方 docs/guides/device-setup.mdx。
- Android：需 Android 平台工具、USB debugging、Mobilerun Portal。
- 運行端使用 Python 3.11–3.13，`uv tool install mobilerun`；請勿把 LLM／Bridge 金鑰提交到此 GitHub repo。
- 若沒有任何常駐控制電腦或可信任的遠端服務，就只能使用「產生／複製指令」與 Vanilla 內部 PWA 工具，**無法**跨 App 遙控 iPhone。

## 自建 HTTPS Bridge 合約（不是官方 Mobilerun Cloud API）

前端可選擇連向你自行部署的安全服務：`POST https://<trusted-host>/api/vanilla/mobile/run`

Headers: `Authorization: Bearer <short-lived, user-bound token>`, `Content-Type: application/json`

Body:

```json
{"goal":"查看目前開啟的 App 是什麼","platform":"ios","mode":"read-only","max_steps":5}
```

Successful response:

```json
{"completed":true,"summary":"目前畫面是設定 App"}
```

伺服器尚需自行實作並完成驗證。伺服器**必須**：驗證短效使用者身分與裝置擁有權；只開放使用者自己的裝置；限制 CORS 為 Vanilla 正式來源；阻止被要求的網頁/畫面提升為指令；限制操作步數／成本／重試；逐步檢查敏感 UI／外傳行為；提供 Stop / cancel、伺服器端日誌稽核與權限撤銷；絕不允許遠端使用者指定任意 Python 程式或 Shell。

目前頁面僅允許「read-only」任務送至 Bridge，所有互動與寫入型命令停留在人工預覽。**前端檢查不是安全邊界**，Bridge 未落實上述控制前不要開放網路執行。

### iPhone 的限制

iOS 官方本機路徑通常經由 macOS USB 橋接；同一支 iPhone 上的 Safari/PWA 不能繞過 Apple 沙盒，亦無法自己代替 WebDriverAgent。瀏覽器的跨網域請求還需要 Bridge 的 HTTPS 與 CORS 設定；外部伺服器可能看到任務文字與畫面內容。

## 後續效能最佳化

1. 先利用現有 Vanilla WebLLM／模型路由進行意圖識別；對已知任務先走確定性本地工具。
2. 僅對無法用 PWA 工具完成的裝置任務使用 Mobilerun；預設不連線，避免成本與延遲。
3. 導入官方 App Cards 與螢幕無障礙樹，減少盲目截圖與無效重試。
4. 將家庭成員的帳號、Token、裝置連線與操作歷史完全隔離，並在真正的後端執行授權。
5. 追蹤「正確率、平均耗時、Token 耗用、被拒絕的高風險操作」做效能評測，才能判斷最佳化是否有效。

技術參考：https://github.com/droidrun/mobilerun
