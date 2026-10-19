# Ceres — Detroit 原生跨平台通訊與插件接入層

Ceres 以獨立原創程式實作通訊機器人的共通功能，不複製 AstrBot AGPL 程式碼、圖示、商標或網頁介面。Ceres 並不是 AstrBot 的改名版本。採自家介面、不加強制浮水印，但保留必要的第三方授權聲明；仍需於商業發行前審查第三方元件、平台條款及商標。

## 模組定位與第一階段

- `Diana` 依指令選擇 Ceres；`Zeus` 保有工作執行與路由權；`Athena` 掌握外部資料安全審查。
- `src/ceres/core.ts` 以嚴格 schema 標準化平台訊息，`sourceTrust=untrusted`、`executionAllowed=false`，絕不提升訊息為系統指令。
- 插件目前只接受 JSON 描述（功能白名單），強制 `enabled:false`，**不載入、安裝或執行任何第三方程式**。
- Detroit Factory 與 UI 登錄 Ceres 為預設停用的 `adapter`，代表仍須部署，不應宣稱現有平台已連線。

## 後端 Relay（驗證階段）

選用的 `services/weiguo/ceres_gateway.py` 提供 `POST /v1/ceres/events`。未設 `CERES_GATEWAY_ENABLED=true` 時一律 503；另需設定至少 32 字元的獨立 `CERES_GATEWAY_SECRET` 與 `CERES_ALLOWED_PLATFORMS=line,telegram` 之類白名單。金鑰不得進入 PWA 或 GitHub。

受信任的**內部 Relay** 應提供 `X-Ceres-Timestamp`（Unix 秒）及 `X-Ceres-Signature: sha256=<hex>`。簽名原文為 `timestamp + "." + raw JSON bytes`；最多 16 KiB、時間差不得超過 300 秒。JSON 僅接受 `platform`、`messageId`、`tenantId`、`senderId`、`conversationId`、`text`。

目前 HTTP 202 **只表示簽章與格式驗證完成**，並不儲存、送交模型、排隊、執行或回覆。此入口**不能直接作為 LINE／Telegram／Discord 原生 Webhook**：官方平台簽章、事件格式、發送端需另寫轉接器。

## 正式啟用前還缺少

平台原生驗證／出站發送、Vanilla 家庭帳號綁定與撤銷、資料最小化與加密、跨實例事件去重和速率限制、Athena 和 Zeus 的逐次權限審查、插件沙盒及依賴授權稽核。僅有受信任 Relay 簽章不能證明外部發訊者是合法的家庭成員；外部訊息也不能帶入指令權限。尚未完成以上項目時 Ceres 不得自動執行任務。
