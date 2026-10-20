# LUCA — 手機端錯誤紀錄 v1

## 已接線的範圍

本功能與衞國後端 `LUCA_ENABLED` **完全獨立**。Vanilla 開啟後在一般模式下，模型手動／快取下載和載入失敗、主模型及備援推論失敗、React 介面崩潰、全域 `error` 與 `unhandledrejection` 會自動記錄到目前裝置。未經使用者手動操作，不會上傳至衞國、Logfire、GitHub 或其他平台。

- 每筆包含隨機事件 ID、UTC 時間、固定元件名稱、固定操作、分類錯誤碼與 Vanilla 建置版本；不儲存任意例外訊息。
- 每個已登入帳戶隔離其瀏覽器 localStorage 紀錄，保留最近 120 筆、至多 30 日；沒有登入帳戶時只在目前頁面記憶體暫存。
- **私人模式完全停用**自動紀錄與讀取、匯出。瀏覽器清除站台資料、無痕模式或儲存受限時，紀錄可能消失。
- 使用者透過 Detroit Studio → LUCA 監控 → 本機異常，可重新整理、手動 JSON 匯出及刪除目前帳戶紀錄。
- 匯出的 JSON 僅包含白名單 metadata，使用者仍應在分享前確認其內容。

## 限制

- 只有已接線的錯誤邊界被記錄；不會自動掌握所有 CREAM、Medusa、Cloudflare Worker 等獨立程序錯誤。
- 不記錄 prompt、回答、附件、文件、原始網址、會員 ID、Token、cookies、HTTP headers、原始錯誤字串、Stack traces 或模型名稱。
- 錯誤碼是規則式分類而非根因證明；未知錯誤以 `unknown` 表示。
- 不提供自動修復、自動回報 GitHub Issue 或在背景送出紀錄的能力；以人工檢查和授權為先。
- Safari 整個程序被系統直接終止、硬體崩潰、記憶體不足立即殺死分頁等情況可能來不及記錄。
- 跨帳號紀錄不聚合；資料保存在瀏覽器 localStorage（元資料，非加密資料庫），只在目前網域、目前裝置可見。

## 驗證

```sh
npm run test:luca
npm run build
```
