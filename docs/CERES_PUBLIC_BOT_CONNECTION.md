# Telegram 公開 Bot 連線及換行排查

## 先辨別 Bot 身分

- [公開 Vanilla API Store / Academy](https://t.me/VanillaAPIStore_bot)：`CERES_STORE_*`，Webhook `/v1/ceres/store/telegram/webhook`。歡迎畫面顯示 `VANILLA / AI PLATFORM`。
- [Owner Ceres 管理中心](https://t.me/SignWell_bot)：`CERES_TELEGRAM_*`，Webhook `/v1/ceres/telegram/webhook`。兩個 Bot 的 token、secret、Webhook 不可混用。

**GitHub Pages 只發布 Vanilla 前端，更新 GitHub 不會自動更新後端 Telegram Bot。**
在正確的後端執行環境部署 `services/weiguo` 後，才會載入 Python 修改；不要將 BotFather token 寫進 GitHub Pages、PWA、GitHub Actions 公開變數或 Telegram 聊天訊息。

## 啟用公開 Bot 的 Webhook（後端環境變數）

| 變數 | 檢查項目 |
| --- | --- |
| `CERES_STORE_BOT_TOKEN` | 只儲存在後端，屬於 `VanillaAPIStore_bot`，不是 `SignWell_bot` |
| `CERES_STORE_WEBHOOK_SECRET` | 獨立隨機 32–256 字元，保密且不與 Owner Bot 共用 |
| `CERES_STORE_WEBHOOK_URL` | 後端實際 HTTPS origin 加 `/v1/ceres/store/telegram/webhook`，路徑必須完全相同 |
| `CERES_STORE_ALLOWED_HOSTS` | 逗號分隔的合法 HTTPS 主機名稱（只填 hostname，不含協定或路徑） |
| `CERES_STORE_REGISTER_WEBHOOK` | 設為 `true` 後，後端下次啟動時才向 Telegram 註冊並驗證 |

程式採取 **fail-closed**：如果 `getMe` 的 Bot 帳號不是 `VanillaAPIStore_bot`、現有 Telegram Webhook 指向別處、URL 不在核准主機清單或密鑰設定不完整，不會覆寫既有 Webhook。

後端啟動紀錄應出現 `Ceres Store: webhook registration verified`。若看到 `registration disabled`，請檢查啟用旗標；若看到 `configuration incomplete`，請逐項核對上述設定。若看到 `existing different webhook; refusing override`，先由管理員透過 Telegram 官方 Bot API 的 `getWebhookInfo` 確認目前 URL，釐清所有權再更改，**不要盲目改寫**。不要將包含 Bot token 的 API 完整網址貼到任何聊天室或日誌。

## 驗收操作

1. 在 Telegram 開啟 [`@VanillaAPIStore_bot`](https://t.me/VanillaAPIStore_bot)，點 **Start** 或私聊輸入 `/start`。
2. 畫面應有 `VANILLA / AI PLATFORM`、真正分行的歡迎詞與 Academy 等互動按鈕，不應看到印在同一行的 `\n`。
3. 點選 **Academy · 學習中心**，應收到課程等級選單；再點模型或返回主選單，確認 callback 正常。
4. 若沒有任何回覆：檢查後端程序是否執行、Webhook 註冊狀態、Telegram webhook 最近錯誤、後端是否收到路徑 `/v1/ceres/store/telegram/webhook` 的 POST，以及是否回覆 HTTP 2xx。
5. 若有回覆但內容仍出現 `\n`：確認目前部署包含 `ceres_store_bot._hub_display` 的程式碼，而不是僅更新前端；再確認 `sendMessage.text` 使用真正的 LF 而非跳脫字元。

程式會在**公開 Hub 靜態文字**傳送前自動修復一次或二次跳脫的 `\n`／`\r\n`；但不會修改學習課程中本來就需要顯示的程式碼字串。請執行：

```sh
python3 -m unittest discover -s services/weiguo -p 'test_ceres_store_connection.py'
python3 -m unittest discover -s services/weiguo -p 'test_ceres_academy.py'
```

不能透過 GitHub Pages 的部署成功，推論 Telegram Webhook 已經成功連線；必須另查後端日誌及 Telegram 實際對話。
