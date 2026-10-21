# Slime Desktop Installation and Vanilla Pairing

## Public Vanilla website

Open Vanilla → Slime 算力網路. Choose 我的電腦 / 朋友的電腦 and the desktop OS.
The website queries official GitHub Releases and selects the newest verified slime-v* release, not an unrelated Vanilla release. It links only to exact matching asset names. No asset means no download claim.
The invite link from Ceres Telegram uses a single-use token in the #slime= fragment; the website opens the Slime download panel and removes the fragment from the address bar, retaining the invite in memory for optional copy.

## First run

1. Owner uses @SignWell_bot privately to create a single-use /slime invite. Share it only with the consenting device operator. Invitations expire after 10 minutes.
2. Windows: run Slime-Owner.exe or Slime-Friend.exe from the verified GitHub Release. macOS: unzip and open the corresponding .command (Python 3.10+ required). Linux: extract tarball, run start-slime.sh (Python 3.10+ required).
3. Enter the WeiGuo HTTPS backend URL (default production value), a friendly computer name, and the Telegram Slime invitation link. Confirm consent with y.
4. On successful backend join, a unique node credential is saved locally under ~/.vanilla/slime/owner.json or friend.json. On Unix, file mode 0600 and atomic replacement are used. On Windows, confidentiality relies on the logged-in user's filesystem ACL; secrets are NOT OS-keychain encrypted.
5. Reopening the application reuses that pairing (no fresh invitation). Ctrl+C stops the runner; --status inspects authorization; --leave revokes the server pairing and then erases local credentials. If server revocation fails, keep the token so the operator can retry safely or request Telegram Owner revocation.
6. In Ceres Telegram /hub → Slime node status, the Owner checks the node. Inference requires installed local Ollama, an available local model, explicit per-node Owner permission, and separate off-by-default server feature flags. A connected node is not yet a model server.

## Release publication

GitHub Actions .github/workflows/slime-release.yml runs Windows PyInstaller, macOS source ZIP, and Linux TAR packaging on workflow_dispatch (test artifacts) or tags slime-v* (publish). It creates: Slime-Owner.exe, Slime-Friend.exe, Slime-Owner-macos.zip, Slime-Friend-macos.zip, Slime-Owner-linux.tar.gz, Slime-Friend-linux.tar.gz and SHA256SUMS.txt.
Those assets become downloadable ONLY after a successful tagged release. Merely merging the workflow does not publish executables. Windows files are unsigned and macOS packages unnotarized; do not encourage disabling malware protection or bypassing platform security.

## Integration and network safety

The desktop runner makes outbound HTTPS requests to WeiGuo and accesses Ollama only at 127.0.0.1:11434. Never forward 11434 to the internet.
Device role is an installer label, not a privilege grant. Server-side identity comes from a one-time invitation and subsequent node bearer token. The administrator must separately approve inference; a friend's laptop should never process third-party prompts without explicit informed consent.
Vanilla Gateway per-key daily/monthly Token and RPM quotas remain separate from local Ollama generation caps. See docs/SLIME_MODEL_RUNNER_TOKEN_LIMITS.md.

## Unfinished prerequisites

Do not claim the desktop agent is an automatically signed installer; Windows is terminal-based onboarding. macOS/Linux still require Python. There is no auto-install of Ollama, no 30B tensor-parallel multi-node model, and no automatic always-on background service.
Keep VANILLA_PUBLIC_API_ENABLED=false and VANILLA_SLIME_RUNNER_ENABLED=false in production until an actual consented computer is paired and an end-to-end local model generation is verified.

## Troubleshooting

Cannot download: inspect GitHub Releases and tag publish job; the site never fabricates a download.
Invite expired: issue a fresh single-use invite via the Owner bot; verify the correct WeiGuo backend.
Node offline: check program still runs, internet connectivity, Slime enabled status and durable Slime DB.
Node online but no models: check Ollama availability, model installation, Owner inference approval and runtime feature flags.
Leaving offline: ask the Owner to revoke the node in Telegram, then rerun --leave when connectivity returns.
## 短碼配對（預設）

在 @SignWell_bot 輸入 `/hub` → `Slime 節點` → `產生新節點配對碼`，或 `/slime pair`。機器人會提供 12 位高熵配對碼，顯示為 `XXXX-XXXX-XXXX`，另有 Telegram 原生複製按鈕、私聊 QR 圖像及備用邀請連結。短碼只有 10 分鐘有效、用後即失效、後端只存 SHA-256 雜湊；公開配對端點具備每來源 IP 及全站 10 分鐘失敗次數限制。安裝端輸入短碼時呼叫 `/v1/slime/node/pair`，核銷成功後才取得長期節點 Token。既有長邀請連結仍可透過 `/v1/slime/node/join` 配對。QR 完全在 WeiGuo 伺服器本地生成，再送到驗證過的 Owner Telegram 私聊，不經第三方 QR 網站。

配對成功不等於已核准推論，模型權限仍需 Owner 另行同意。請勿轉傳短碼或 QR 到公開頻道。


## Slime 獨立安裝網頁

- 預設入口：https://easylearnfromtw.github.io/vanilla/slime/（GitHub Pages 實際部署成功後才能視為可用）。
- Vanilla 左側「Slime 算力網路」在獨立新分頁開啟安裝頁，並對舊的 #slime= 一次性邀請連結提供導向相容。
- Telegram @SignWell_bot → /hub → Slime 節點有「Slime 獨立安裝網頁」。建立短碼後，私聊卡片的開啟按鈕與 QR 也指向新頁。
- 獨立頁包含 Owner/Friend 與 Windows/macOS/Linux 選擇、GitHub 實際發行版本下載、12 位短配對碼和複製、Telegram 授權及裝置退出說明。
- 網頁只把短碼存入當次頁面的記憶體，讀取網址片段後立即清除 fragment，無 localStorage/sessionStorage 或第三方 QR/追蹤 SDK。它沒有管理權限，也不能從網頁直接核發長期節點 Token。
- 後端獨立變數 SLIME_PAIRING_PAGE_URL 只用於建立對外分享的 HTTPS 專屬網頁連結；它與 WeiGuo API 的 SLIME_PUBLIC_API_ORIGIN 不同，請勿混為一談。
- 真正設備配對仍只由使用者在本人電腦上啟動 Slime Runner，向 WeiGuo HTTPS /v1/slime/node/pair 換取專用裝置 Token。

## Telegram 專用的 Slime 私人管理 Mini App

在已核准的 `@SignWell_bot` Owner 私聊輸入 `/hub`，點「◎ Slime 私人管理頁」，即可在 Telegram 內開啟獨立 Mini App（非 Vanilla 公開下載頁）。網址由已配置的 `CERES_ADMIN_WEBAPP_URL` 同源產生，預設路徑 `/v1/ceres/slime/webapp`，必須以 Telegram 的 `web_app` 按鈕開啟，不能用公開網址登入。

Mini App 分為「總覽／節點／配對」三個分頁：
- 總覽：註冊、在線與 Owner 核准推論的數量；明確區分心跳和實際模型成功推論。
- 節點：裝置角色、作業系統、CPU／GPU／RAM（裝置自報）、在線狀態、共享同意與推論授權；停用、推論權限變更、撤銷需要兩階段確認與 2 分鐘一次性確認 Token。
- 配對：由 Owner 產生 10 分鐘、僅使用一次的 12 位短碼，並提供複製、備用邀請連結和由伺服器**本地生成**的 QR；此 App 不會顯示節點長期憑證。

**權限界線：** 所有資料與操作 API 必須驗證 Telegram 簽名的 `initData`、5 分鐘時效、Owner Telegram chat ID 和伺服器綁定的 Google Owner sub，並依 Owner sub 限制節點。直接用普通瀏覽器開啟網址只會看到要求身分驗證的畫面，不能呼叫私人操作。私密功能**沒有**回填到公開 Slime 網站，且公開頁面不提供 Telegram 管理按鈕。

**部署注意：** WeiGuo Dockerfile 需包含 `ceres_slime_web.py`，應確認 `CERES_ADMIN_WEBAPP_URL`、`SLIME_ENABLED`、`CERES_FAMILY_LINKS_JSON`、`WEIGUO_FAMILY_ACL_JSON` 和持久化的 `SLIME_DB_PATH` 均正確配置。Mini App 不會自動開放 `VANILLA_PUBLIC_API_ENABLED` 或 `VANILLA_SLIME_RUNNER_ENABLED`。打開超過 5 分鐘後，Telegram initData 可能逾時，請從 Bot 重新開啟。

## Ceres 歡迎與首次使用（Telegram Owner 專用）

- 在已授權的 @SignWell_bot 私聊點 Telegram「Start／開始」，或輸入 `/start`／`/help`，看到 Ceres 歡迎卡及「✦ 開始使用 →」。點選後，同一則訊息會切換為 Ceres Hub；輸入 `/menu`、`/hub` 或「開始使用」也可以進入主控台。未加入 Owner 白名單的帳號不會看到管理內容。聊天指令不觸發 AI 任務執行。
- 由 Hub 的「◎ Slime 私人管理頁」開啟 Telegram Mini App。已在 Telegram 取得簽署 initData 的人會先看到深色 Ceres / Slime 歡迎畫面與短版功能提示；按「開始使用」後，工作台立即切換為全白黑字的 iOS 風格，並於 Telegram Mini App API 支援時同步要求白色 WebApp header/background/bottom-bar。
- **限制**：Telegram Bot API 不能改變使用者的普通 Telegram 聊天室桌布；全白背景只作用於我們自己的 Slime Mini App。Mini App 歡迎視圖每次重新開啟都會顯示，沒有把邀請碼、密鑰或驗證資料存進 localStorage/sessionStorage。
- 沒有有效 Telegram initData 時禁止進入管理操作；背景白色不代表已登入。配對碼依舊只由已驗證 Owner 發行，推論授權與撤銷仍需二次確認。公開 Slime 下載頁依舊不包含任何私人 Telegram 後台入口。
- 操作驗收：Telegram 私聊送 `/start` → 歡迎卡 → 點「開始使用」 → 原訊息更新為 Hub → 點 Slime 私人管理頁 → 顯示深色歡迎畫面 → 點「開始使用」 → 全白工作台 → 查看節點／配對。驗收不能以 CI 成功代替手機實際操作。
