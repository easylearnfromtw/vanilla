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
