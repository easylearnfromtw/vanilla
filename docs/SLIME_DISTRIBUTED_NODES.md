# Slime — Vanilla / Detroit 分散式節點（預覽版）

## 產品定位
Slime 是 Detroit 底下由 Diana／Zeus 使用的**選用算力資源池**。Owner 可使用自己電腦，也可邀請願意共享閒置算力的朋友。**本次實作為註冊與監測 MVP，不是可使用的分散式 30B 推論系統。** 前端不得把候選清單當成已執行模型。

### 低摩擦使用者流程
- Vanilla → Detroit Studio → **Slime 節點**。
- 「我的電腦」、「朋友的電腦」分開下載；選 Windows / macOS / Linux。
- Owner 僅透過已驗證身分的 **Telegram 私人對話** 建立一次性邀請（10 分鐘有效）；Vanilla 前端不提供管理按鈕。
- 朋友開啟 Slime，貼上**一個**邀請連結，勾選同意並連線，不需要 API Key、資料庫帳密、OpenAI 帳號、設定路由器或執行 shell 指令。
- 裝置 UI 清楚呈現「暫停共享」和「退出並撤銷配對」；預設**不設置開機自動啟動、系統服務或背景常駐**。關閉視窗後一段時間自動轉離線。
- 目前桌面程式為不需 Python 的獨立執行檔**建置配方**。只有 GitHub Actions 成功編譯、建立 slime-v* 發行版後，網站才顯示可下載的實際檔案；發行前不可宣稱二進位檔已存在。初期執行檔未簽章或 macOS 公證，需對簽章做正式產品化。

### 已實作 API
伺服器：`services/weiguo/slime.py`，由原有衞國 FastAPI 掛載。啟用環境（必須設定在受信任後端）：

```
SLIME_ENABLED=true
SLIME_PUBLIC_API_ORIGIN=https://api.your-domain.example
SLIME_DB_PATH=/var/lib/weiguo/slime.sqlite3
```

使用持久性磁碟掛載 `/var/lib/weiguo`，否則重啟可能遺失邀請／節點註冊。原有 `WEIGUO_GOOGLE_CLIENT_ID`、`WEIGUO_FAMILY_ACL_JSON`、`WEIGUO_SESSION_SECRET`、`WEIGUO_CORS_ORIGINS` 仍需正確配置；帳號權限一律為家庭 owner 身分，不把管理令牌暴露到 PWA。

Owner 管理路由（保留 Python 函式供內部及既有生命週期測試，但 **FastAPI 不再掛載**，不對網頁開放；Owner 請由 Telegram 對話操作）：
- `POST /v1/family/slime/invite`：單次邀請，600 秒內有效，至多 10 個待使用邀請。
- `GET /v1/family/slime/status`：服務能力真實狀態。
- `GET /v1/family/slime/nodes`：最多 50 個節點 CPU、RAM、GPU、OS、心跳與授權旗標。
- `POST /v1/family/slime/nodes/{id}/policy`：啟用或停用調度資格。
- `POST /v1/family/slime/nodes/{id}/revoke`：立即撤銷節點 token。
- `POST /v1/family/slime/route`：依在線與授權狀態回傳**候選名單**，`executed:false`，無遠端模型推論。

朋友設備 API（僅裝置 token／一次性邀請）：
- `POST /v1/slime/node/join`：消耗單次邀請、核發 scoped node token。
- `POST /v1/slime/node/heartbeat`：每 60 秒送出有限硬體資訊與分享開關。只能回報自己節點，不能操作任何其他節點。
- `POST /v1/slime/node/leave`：朋友主動撤銷自己的註冊。

### 線上、離線、刪除執行檔
若刪除程式、結束程序、拔網路或關機，中央都無法直接分辨原因；在最後一次心跳超過 **150 秒**後，節點顯示「未連線」，`schedulable=false`，所有路由預覽會排除它。此狀態**不是**實體電源狀態，也不保證 OS 在所有平台允許刪除正在執行的 binary。Owner 可自行撤銷舊節點。若將來加入實際推論派工，工作開始與每個分片執行前都必須重新驗證節點 lease，並在心跳失效時中斷派工。

## 建置
發行前先在受信任測試環境執行：
```
python -m unittest discover -s services/weiguo -p 'test_slime.py'
npm run build
```
GitHub Actions `.github/workflows/slime-desktop.yml`：可手動跑預覽 artifact，或由 `slime-v*` tag 觸發 Windows / macOS / Linux 的 Owner、Friend 兩個發行版以及 SHA256。**尚未執行 CI / 未發行前，不提供假下載連結**。

## 權限與安全
- 邀請片段置於 URL `#slime=...`，不會進入一般 HTTP request path；只給認識的人，不發公開社群。短時單次使用。
- Owner Google 身分與節點裝置 token 分離；伺服器只儲存 SHA256 token 雜湊，角色隔離。
- Friend 收到的僅是自己的節點 token；沒有後端操作員權限，也沒有讀取檔案、桌面、瀏覽器資料的能力。
- 目前沒有下載模型、執行任何 remote code、接受 shell 命令、強迫關機、遠端更新程式、執行 GPU 推論。
- 節點規格只是設備自行回報，不能以此推斷可信 GPU 環境。正式推論需沙箱、模型工件 hash 校驗、節點能力量測、端到端 TLS、配對撤銷、個人資料隔離、審計和最小權限。
- 朋友節點預設不承載私人聊天、醫療資訊、個資或 API keys；公開／已脫敏任務也仍需獨立驗證安全性。

## 電源、螢幕與自動化（待開發，UI 不得虛稱已啟用）
目標為每台機器明確授權的**節能控制**，而非取得朋友桌面遠端管理權：

1. **一鍵暫停/恢復調度：已具備。** 不等於關閉電腦，也不會改變電源。
2. **螢幕關閉：待開發。** Windows/macOS/Linux 的 API 不同，必須先讓裝置所有者在當地選擇允許，才能派發固定的 `display_sleep` 指令。喚醒顯示器通常需要實際登入／輸入設備，不能保證遠端點亮。
3. **電腦關機／睡眠：待開發。** 需裝置所有者單獨 opt-in、時間緩衝可取消、審計與拒絕使用者正在操作的設備；不允許任意命令執行。
4. **遠端開機：待開發。** Wake-on-LAN 受主機板、BIOS、網卡、電源與網路限制；跨家庭網路通常需要當地常駐 relay（例如經授權 Pi 4）及正確防火牆設定，完全斷電不能保證啟動。
5. **Diana／Zeus 自動派工：僅完成候選選擇 API。** 未來接模型 runner、租約、重試與測速後才正式自動 dispatch。避免用 10 台低階機器硬拼單一 30B 卻受 WAN 延遲拖垮；先區分工具平行工作與大型模型分片。
6. **自動節能：待開發。** 依裝置的空閒、電池、溫度、能耗與經授權時段決策；不得繞過朋友手動停止。

### 技術路線
優先「安全心跳與觀測」→「OS 驗證、朋友端一鍵退出及發行簽章」→「本地網多設備推論 smoke test」→「跨家庭安全傳輸與可取消模型分片」→「按能力與能源成本調度」→「獨立授權的可控電源動作」。

30B 是模型規模，不是把多個小模型參數簡單相加；能否實際運行與 tokens/s 必須實測。
