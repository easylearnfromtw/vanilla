# Ceres Telegram 管理中心（後端權限與金鑰遷移）

## 部署狀態與界線

本變更將**共用金鑰管理、Gmail 白名單、服務啟停與 Ceres 管理選單**實作為衞國後端功能；從 Vanilla 網站移除舊版 API Key 輸入及自動 Drive 金鑰同步。一般 Google Drive、個人加密對話備份與裝置本機模型設定仍是使用者功能，不是管理員介面。

**尚未涵蓋所有 Detroit 工具的寫入型操作**，例如節點開關機、部署、付款、Quirinus 進階動作。這些必須逐項新增後端授權 API 才能安全遷入 Telegram，不能將原本的前端按鈕直接改為 Bot 執行命令。Vanilla 是 GitHub Pages 公開 PWA，前端移除按鈕不能阻止未授權者取得靜態程式或執行自己裝置的離線推論；本變更的限制是對**衞國後端服務**生效。

## 必要後端設定（Railway 的私密 Variables）

- `CERES_ENABLED=true`、`CERES_TELEGRAM_BOT_TOKEN`、`CERES_TELEGRAM_WEBHOOK_SECRET`、`CERES_TELEGRAM_CHAT_IDS`、`CERES_FAMILY_LINKS_JSON`：沿用已驗證 Ceres 私聊架構，擁有者須同時在 `WEIGUO_FAMILY_ACL_JSON` 設 `role=owner`。
- `CERES_ADMIN_WEBAPP_URL=https://YOUR-DEPLOYMENT.up.railway.app/v1/ceres/admin/webapp`：精確 HTTPS URL，須由 Telegram Bot 的 WebApp 按鈕開啟。
- `WEIGUO_VAULT_KEY`：僅於後端配置、**32 bytes 的 URL-safe base64 Fernet key**。應在機密管理平台產生並保管備份（遺失會失去舊金鑰解密能力）。此值不可以貼 Telegram/GitHub 或在公開前端設定。
- `CERES_DB_PATH=/data/ceres-events.sqlite3`：使用持久、私有的 Railway volume；不應用可隨部署消失的 /tmp。
- `WEIGUO_PUBLIC_FAMILY_ONLY=true`：維持既有 private-operator endpoints 的防護；新的 Telegram WebApp 使用 Telegram signed initData 和已綁定的 owner 身分，**不依賴** `WEIGUO_ADMIN_TOKEN` 進行公網訪問。
- `CERES_SERVER_MODEL_PROVIDER=gemini` 與 `CERES_SERVER_MODEL_NAME=gemini-2.5-flash`：若希望 Ceres Telegram 對話使用此管理中心的 Gemini Key。其餘 Ceres 常駐 Agent 功能仍須依原文件選擇性開啟。
- `WEIGUO_GEMINI_MODEL=gemini-2.5-flash`：供 Vanilla 已驗證的 Gmail 會員透過後端代理使用；同時需管理中心啟用 Gemini。
- `WEIGUO_GMAIL_ACL_ENFORCE=true`（可選）：若已在 Telegram 新增至少一名 owner，可透過 /admin enforce on 啟用嚴格白名單；Telegram 中的設定存於持久 DB，優先於環境預設。

**Bootstrap 先後次序**：先維持既有 Google Owner ACL + Telegram ID 安全綁定，連結安全 WebApp、確認持久資料庫，再向 Bot 發 `/admin`；先將自己的 Google 信箱授權為 owner，完成 Google OIDC 驗證及動態 subject 綁定，最後再啟用強制白名單。勿在 owner 帳號尚未驗證前直接封鎖全部登入。

## Telegram 指令

- `/admin`：開啟有按鈕的管理選單。
- `/admin users`：列出已授權的 Gmail（只顯示 email、角色、功能範圍、不顯示任何 Token）。
- `/admin allow person@gmail.com member chat,gemini,files`：新增或調整；角色 `owner/member/viewer`；範圍 `chat,files,nodes,canva,gemini,automation,studio`。
- `/admin revoke person@gmail.com`：Telegram 按鈕二次確認後撤銷。
- `/admin enforce on`／`off`：確認後切換 API 白名單限制。
- `/admin providers`：查詢服務啟用狀態。
- `/admin enable gemini`、`/admin disable canva`：伺服器層啟停。
- 安全表單按鈕：Telegram WebApp 以簽名 `initData`（有效 5 分鐘）與 owner 綁定驗證，在**HTTPS POST** 遞交 API Key，使用 Fernet 加密存於後端 volume；不會傳入 Telegram 訊息內容。可輪替 Canva、Gemini、DeepSeek、OpenAI Key。**其中 DeepSeek、OpenAI 是憑證保存與啟停，不代表所有 Detroit 使用路徑都已改為讀取此金鑰。**

服務不應回傳金鑰或將其送入 Gemini Prompt、LUCA raw logs、聊天歷史、Google Drive appDataFolder。變更的稽核只記 actor Telegram ID、操作類型、被管理帳號/供應商與時間，不存明文 Key。

## Canva OAuth 注意事項

目前 Canva adapter 可以讀取新 vault 的 **Access Token**；Canva OAuth Access Token 有效期有限，單純把 Token 存起來不等同於完成 OAuth refresh flow。必須有 Canva developer app 的合法授權流程、refresh token 與 token lifecycle 才能長期自動運作。遭遇 401 時仍應顯示過期並要求安全更新，不能偷偷使用前端舊 Token。

## 功能範圍與帳號隔離

1. Google OIDC 驗證 `email_verified`、`sub` 後，將核准 email 首次綁定 immutable `sub`。改信箱、共用帳號或已撤銷 email 不可自動繼承權限。
2. 每次短期 WeiGuo bearer 驗證都重新檢查白名單；Ceres 常駐 AI 額外重新檢查 chat scope。
3. `family_user` 依後端路由檢查 chat、files、automation、studio、canva 等 scope；Gemini family proxy 獨立檢查 `gemini` scope。
4. 私密模式不得走雲端代理。模型金鑰留在後端。Vanilla 僅在驗證 Google/WeiGuo 且 Gemini 已就緒時註冊受控模型，不會從 Google Drive 自動讀取舊金鑰。
5. **Gmail email 是帳號識別，不是 Telegram owner 認證**。管理權限仍取決於 Telegram 數字 ID + 綁定 immutable Google sub + 後端 owner 角色，與 webhook secret。

## 上線與驗證

1. PR CI：執行 `python3 -m unittest discover -s services/weiguo -p 'test_ceres_admin.py'`、既有 Ceres regression 與 `npm run build`。
2. 在測試環境與 staging Bot 驗證 Telegram webhook 簽名、owner-only callback、WebApp signed initData、防重與權限撤銷。
3. 設定持久化 volume/加密金鑰與必要變數，確認 Canva、Gemini token status，不要在 Telegram 聊天直接傳 Key。
4. 先加自己 Gmail owner，再開啟 whitelist strict mode，測試未授權 Gmail 的 Google 登入以及既有 session 失效。
5. 確認 Vanilla 網站的 API Key 表單與 Ceres/Registry 管理頁已移除、既有使用者對話與個人備份可用，再正式切流。
6. 另行完成 legacy Drive appDataFolder 明文憑證清理、舊 Key 輪替、OAuth Refresh Token 以及其餘工具的 Telegram 移轉。

**部署不是提交 PR 就自動完成。** 合併、CI、Railway 變數、金鑰保管、GitHub Pages 與 Railway 實際部署狀態須另外驗證。

## API 模型自動偵測（2026-10）

Ceres 管理者可從 Telegram 發送 `/admin models`，或按管理選單的「AI 模型偵測與選擇」。安全 WebApp 輸入 Gemini、OpenAI、DeepSeek 的 API Key 後，後端會經由固定官方 HTTPS 端點查詢可見模型清單：

- Gemini：`GET https://generativelanguage.googleapis.com/v1beta/models`，只顯示有 `generateContent` 的文字模型。
- OpenAI：`GET https://api.openai.com/v1/models`，列出名稱符合支援型態的文字模型；官方模型清單不保證該模型支援目前的 Chat Completions 路徑。
- DeepSeek：`GET https://api.deepseek.com/models`，解析模型識別碼。
- Canva：是設計服務憑證，不需模型版本名稱，因此不執行模型偵測。

偵測結果僅儲存模型 ID、顯示名稱與可取得的 context metadata（不含金鑰），時間戳以 6 小時標示建議更新。只有管理者透過 Telegram 簽名 WebApp 可以查詢、重新偵測或變更模型選擇。新的金鑰輪替會先撤銷舊模型清單，避免跨帳號混用。

預設 `balanced`（均衡）以版本和 Flash/Mini 類型的啟發式規則選擇；`speed`（速度優先）、`quality`（品質優先）、`manual`（手動指定）可由管理員在 Telegram WebApp 更改，手動模式僅允許選擇 API 已列出的 ID。選定版本會供衞國 Gemini 代理及 Ceres 伺服器端模型使用，原本環境指定版本保留作為尚未成功偵測時的相容預設。

**重要限制**：`models.list` 代表可列出模型，不代表有足夠配額、可使用特定推論協議、可使用視覺功能、已測試成功，亦不含可保證的最新價格／速度／品質排名。無法列出時會明確提示，既存金鑰保留加密，但不偽稱偵測成功。請利用供應商端設定 API 預算及用量限制，品質優先可能明顯增加成本。

此功能不執行昂貴的自動 prompt 基準測試，也不會將任何 API Key、Google OIDC token 或供應商授權憑證傳回 Telegram 對話或 Vanilla PWA。
