# Slime Node · 安裝、網路安全與可靠性規格

適用：Windows 10/11、macOS、Linux。這是面向裝置擁有人的透明操作說明，不是作業系統核准證書，也不能取代程式碼簽章／公證。

## 唯一配對碼來源

- **只有**登入並授權的 Ceres Telegram Owner 管理頁可以核發 `XXXX-XXXX-XXXX` 格式、有效 10 分鐘且一次性使用的 Slime 配對碼。
- Vanilla 公開網頁右側只是同一組配對碼的**唯讀顯示**。空白時提示「尚未收到配對碼」，不會憑空生成另一組碼。
- Windows/macOS/Linux 安裝程式要求裝置名稱、短碼、持有人明確同意；`/v1/slime/node/pair` 成功回傳獨立節點身分及權杖，客戶端先原子保存，再向 `/v1/slime/node/heartbeat` 驗證。
- 配對成功與首次心跳失敗需分別顯示。**已儲存有效憑證時不要重新索取短碼**；重新啟動節點會重試連線。若伺服器已消耗短碼，但回應在傳輸途中遺失，可能仍需由 Telegram 重新核發。
- 模型 API Key、GitHub PAT、Gemini Key、舊版 Detroit Windows Node 授權均不是配對碼。

## 透明網路政策（不規避防火牆）

| 用途 | 通訊 | 安全邊界 |
|---|---|---|
| 節點註冊、心跳、核准模型查詢與派工 | **對外 HTTPS/TCP 443**，預設 `weiguo-browser-production.up.railway.app` | 系統 TLS 憑證驗證、依 OS 授權的 HTTPS Proxy；不開放主機入站 |
| Ollama 模型執行 | **本機回環 HTTP** `127.0.0.1:11434` | 不通過任何代理，不映射外網或開放 11434 到公網 |
| 發行版下載 | 使用者自行開啟官方 GitHub Releases | 版本與 SHA-256 校驗；正式信任還需簽章／公證 |

不得以本程式：添加寬鬆的防火牆排除、停用 Defender/Gatekeeper、防毒、終端偵測、繞過企業限制、建立隱藏代理或向外公開 Ollama。若組織政策禁止此連線，應由網路或裝置管理員核准 `HTTPS 443` 指定網域。這不是保證所有環境都會放行的「防火牆豁免」。

### Windows
- 使用官方、可驗證 SHA-256 的 `Slime-Owner.exe`／`Slime-Friend.exe`。目前程式碼尚無 Windows Authenticode 簽章；SmartScreen 可能警示，不應要求使用者停用保護。
- 完成配對後，**自願選用**隨發行檔提供的 `Slime-Windows-Autostart.ps1`，在一般使用者權限下建立 Task Scheduler 工作。安裝、解除自啟可在 Windows 工作排程器查看與移除；PowerShell 執行原則／公司設備政策仍應遵守。
- 自啟目前為**使用者登入時**，支援顯示器關閉、已登入但鎖定狀態。Windows 尚未登入前需要另外設計、簽章和授權的服務，並**未實作**。

### macOS
- 下載 `Slime-Owner-macos.zip` 或 `Slime-Friend-macos.zip`，依原有 `.command` 腳本配對；macOS Gatekeeper 的要求必須遵守。正式公開商用品項仍需 Developer ID 簽章與 notarization。
- 配對後自願執行封裝內 `install-macos-autostart.sh owner install` 或 `friend install`。安裝的是**當前使用者的** LaunchAgent，可透過 `launchctl` 管理；不需要管理員權限，不會解除螢幕鎖定或禁用省電功能。
- 對應移除：`sh install-macos-autostart.sh owner remove`（Friend 改 `friend`）。

### Linux
- 正式壓縮包內含 `install-linux-autostart.sh`；先在互動模式完成配對，再執行 `sh install-linux-autostart.sh owner install`（或 `friend`）。
- 僅建立 systemd **user service**，隨使用者 session 啟動。可使用 `systemctl --user status vanilla-slime-owner.service` 查詢、`sh install-linux-autostart.sh owner remove` 移除。
- 不會自動設定 `loginctl enable-linger`、修改 iptables/ufw、取得 root 權限或將 Ollama 開放至其他主機；若需要尚未登入便啟動，需另行取得裝置持有人與系統管理員批准。

## Headless 與節能邊界

- 可以在已獲同意、執行 Slime 的主機上**關閉顯示器**並維持計算；主機睡眠/休眠、斷網或關機時無法繼續。螢幕關閉不等於主機睡眠，也不保證 GPU／風扇／電源燈不亮。
- 不會修改 BIOS、硬體或機殼燈號、不會隱藏系統服務狀態、不會防止使用者停止共享／解除安裝。
- 後端只會指派至**目前在線、裝置同意共享、Owner 核准推論、可提供指定模型**的節點。模型不能用時不可冒稱已可運算。
- 真正的 30B 切分、多機 Tensor Parallel、遠端電源開機/WoL 尚未完成，不可當作現成功能宣稱。

## 模型更新與系統重啟後的可靠性

- 同一台機器配對後的節點憑證留存在 `~/.vanilla/slime/<role>.json`（Windows 是使用者設定目錄），**不隨 AI 模型下載或作業系統更新而重新配對**，前提是該使用者設定檔與後端狀態都保留、憑證沒有撤銷。
- 客戶端斷線會自動重試；核准推論且本地 Ollama 可用時，會週期性重新偵測本地模型並向後端報到。此功能不會自行下載不明權重或執行遠端更新腳本。
- 自啟屬**明確選裝**的使用者工作；安裝包已複製至穩定的使用者資料路徑。程式更新應停止既有工作、驗證官方發行檔 SHA-256／正式簽章（如已提供）、再受控替換和重新啟動。**目前沒有無人值守的自動二進位更新器**。
- Railway 後端 SQLite 路徑必須放在持久化 Volume（例如 `SLIME_DB_PATH=/data/vanilla-slime.db`），避免容器重新部署使節點登錄與短碼遺失。後端 `SLIME_ENABLED=true`、`VANILLA_SLIME_RUNNER_ENABLED=true` 是否啟用要由實際環境確認，不能只看 GitHub 程式碼推斷。

## 撤銷、刪除和使用者控制

- 遠端 Owner 管理端必須經 Telegram Owner 身分驗證與操作確認。**初次配對碼不可兼作刪除碼**。
- 目前刪除入口統一為 **Ceres Telegram 私聊**：輸入「撤銷 <裝置 ID 或名稱>」，再回覆 Bot 當次核發的獨立 **8 位確認碼**（指令格式「確認 <8 位碼>」）。公開 Slime 網頁與 Mini App 都不允許直接繞過 Telegram 撤銷。
- 無論管理端設定如何，**每位裝置持有人**都可以立即停止計算、取消自啟、解除安裝、或申請註銷自己的裝置憑證；不能強制要求 Telegram Owner 允許才能卸載或停止。
- Telegram 命令僅改變**已核准**節點的派工／撤銷策略；不提供遠端 Shell、鍵盤、螢幕存取或隱形程式部署。

## 上線驗收（不得省略）

1. Owner 核發真實的短配對碼；使用者完成配對，CLI 顯示「✓ 配對已綁定 · WeiGuo 心跳已驗證」。
2. Telegram 節點清單看到相同電腦、在線與 RAM/GPU 能力資料；本機模型尚不可用時不得當成可推論。
3. Owner 在 Telegram **另外核准推論**，節點 Ollama 啟動並回報模型，確認 Gateway 的模型清單。
4. 使用 Ceres Mini App「測試真實模型回覆」，經 Owner 授權的固定測試提示交由 Slime Runner 處理，確認回傳模型名稱、實際 Token 數；每位 Owner 每 10 分鐘最多兩次。只顯示綠燈或已在線不能當作完成測試。
5. 關閉/重開節點程式，確認無需新碼即可重連；若已**自願設定**自啟，於登出登入或重啟後確認服務恢復。
6. 暫時停用授權與執行撤銷，驗證後端不能再指派工作、憑證失效；裝置擁有人仍能退出與解除安裝。
