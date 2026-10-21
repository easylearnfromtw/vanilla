# Ceres Installer — 安全初始化與 Telegram 安裝巡檢

本模組借鏡 Wiz-Installer 的「簡易初始安裝」概念，但**獨立使用 Python 開發**。未複製上游 PHP 原始碼、設計素材或資料表；不下載、執行第三方程式。上游倉庫沒有明確 LICENSE，因此不直接搬入原始碼。

## 實際加入的功能

- **本機初始化**：產生一次性的私密設定檔，拒絕覆寫既有檔案或 symlink，密鑰由安全亂數產生；POSIX 系統檔案權限為 0600。
- **九項配置巡檢**：Ceres 啟用狀態、Bot Token 和帳號格式、Webhook HTTPS 路徑、簽名密鑰、Telegram ↔ Google Owner 綁定、後端會話密鑰、Vault 金鑰、持久化資料庫路徑與公開端點限制。
- **Telegram 私人 Hub**：既有已驗證的 Owner 可以輸入 /hub install，或在 /hub 按「Ceres 安裝巡檢」。
- **絕不顯示敏感資訊**：Telegram 巡檢不包含 Token、Google sub、Chat ID、金鑰或完整 Webhook URL。
- **部署封裝**：兩個 WeiGuo Docker 映像都加入此 Python 模組。

## 可信任主機上的初始化

在 Vanilla 的私人工作副本中：

    mkdir -p private
    chmod 700 private
    python3 services/weiguo/ceres_installer.py init --file private/ceres.env
    python3 services/weiguo/ceres_installer.py doctor --env-file private/ceres.env

產生後，請在主機上透過受信任編輯器填寫 Telegram Token、精確 Webhook URL、Bot username、單一 Telegram Owner ID、CERES_FAMILY_LINKS_JSON 與 WEIGUO_FAMILY_ACL_JSON。後者必須使用**實際驗證**的 Google sub；切勿自行臆測。

安全預設：CERES_ENABLED、CERES_TELEGRAM_REGISTER_WEBHOOK、CERES_OUTBOUND_ENABLED、CERES_SERVER_AGENT_ENABLED 都是 false，並啟用 CERES_OWNER_ONLY 與 WEIGUO_PUBLIC_FAMILY_ONLY。檔案內生成的管理金鑰、Session 金鑰、Webhook 密鑰與 Fernet Vault 金鑰互不相同。

**不得上傳**私密 env 至 GitHub、Telegram、PWA 或其他公開位置。.gitignore 已排除 private/ 和 ceres.env，但仍需注意 git add -f、備份、外部同步。金鑰遺失或洩露需安全輪替；Vault 的舊資料解密能力需另行管理。

此命令**不會**啟動服務、設定 Railway、建立 volume、註冊 Telegram Webhook、驗證網域是否連得上、修改權限資料庫或部署程式。必須由運維人員在 Railway 私密 Variables／Secret Store 寫入配置、掛載私密持久 volume，再於 staging 測試後啟用。

## Telegram 使用方式

開啟已完成 Google Owner 綁定的 @SignWell_bot 私聊，輸入 /hub，按下「⚙️ Ceres 安裝巡檢」，或直接輸入 /hub install。僅回傳每項配置的通過與否；修正後可按「重新整理」。此畫面只讀，不會把密鑰顯示於 Telegram。未驗證 Owner 無權使用。

全部通過**不是** Telegram 收發、Agent 推論、Slime 節點、外網安全隔離、Railway 正式部署的成功證明。現有 Webhook 註冊器仍需獨立 opt-in，且會拒絕覆蓋已存在的不同 Webhook。

## 安全測試及上線驗收

離線測試：

    python3 -m unittest discover -s services/weiguo -p 'test_ceres_installer.py'
    python3 -m unittest discover -s services/weiguo -p 'test_ceres_command_center.py'

端到端驗收還需要 staging 驗證：HTTPS 可達、正確 Bot 身分、Webhook secret、私聊 Owner 限制、非 Owner 拒絕、資料庫持久化、完整模型診斷以及正式部署的網路策略。WEIGUO_PUBLIC_FAMILY_ONLY 不是完整的防火牆替代品。

更完整的一鍵部署功能必須經由受保護的 CI/部署身份、可回滾的版本、部署鎖與明確的操作者授權，不應直接給 Telegram 任意 shell 執行權。
