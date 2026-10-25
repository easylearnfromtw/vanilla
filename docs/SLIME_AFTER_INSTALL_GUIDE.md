# SLIME 下載後首次使用指南

## 1. 選擇正確安裝版本

- **Owner**：自己的電腦。安裝 `Slime-Owner`，本機另有 OCTUBER 金融訓練、QLoRA、沙盤與 GitHub 訓練紀錄工具。
- **Friend**：親友自願分享的電腦。安裝 `Slime-Friend`；不能啟動 Owner 金融訓練或取得管理權限。
- Windows：開啟 `.exe`。macOS：開啟 `.command`；Linux：從解壓縮資料夾使用 `start-slime.sh`。macOS／Linux 版本仍需 Python 3.10+ 與 Tk 圖形介面。
- 只從 GitHub 官方 Release 下載，確認 `SHA256SUMS.txt`；未簽章或未公證的安裝包可能引起作業系統警告，不應關閉防毒或略過來源驗證。

## 2. 初次配對（不需要編寫程式或輸入 API key）

新版桌面引導自動顯示 Owner／Friend 身分：

1. 從 Telegram Ceres `/hub` → SLIME 取得單次、10 分鐘有效的配對碼。
2. 為電腦命名並貼上 **同一組配對碼**。預設 WeiGuo 後端已填入，只有自行部署後端的進階使用者需要修改 HTTPS 網址。
3. 公開 IP／位置分享、可關機權限預設關閉。只有想使用時才逐一勾選；閱讀節點用途後另勾選加入授權。
4. 按 **安全配對**。成功會將憑證留在本機並檢查第一個心跳。短碼用過就不能再次使用；若心跳暫失敗，重新開啟後按檢查即可。

## 3. 三種不同的狀態

- **綁定成功**：裝置憑證存在且已取得服務核准。
- **節點心跳成功**：魏國後端確實回覆；不代表 Ollama 已安裝。
- **模型可供推論**：本機 Ollama 有模型、服務在線，且 Telegram Owner 另外明確核准推論。不要把節點心跳當作實際模型回覆。

首次配對後不會立即開始共享。按 **開始共享** 時程式會再次要求確認。按 **停止共享** 會取消新的任務輪詢；正在執行的既有本機請求可能需要完成後才完全停止。關閉視窗會結束本次共享，但保留配對供下次使用。

## 4. 常見問題

| 畫面顯示 | 處理方式 |
| --- | --- |
| 短碼失效／HTTP 401、403 | 回 Ceres `/hub` 取得新的短碼，不要貼 API key 或舊 Node Token。 |
| HTTP 429 | 稍後再試，避免連續重送。 |
| 後端 HTTP 5xx | 查看後端狀態，保留目前畫面、等網路恢復。 |
| 配對成功但心跳尚未確認 | 不要重新消耗短碼；重新開啟按「檢查網路與 Ollama」。 |
| Ollama 尚未連線 | 不影響裝置配對。確認本機 Ollama 程式與模型；沒有自動下載模型的功能。 |
| Owner 尚未核准推論 | 在 Telegram Ceres 管理節點的推論權限。 |
| Linux/macOS 無 Tk 圖形桌面 | 在終端機進入安裝目錄執行 `python3 slime_desktop.py --setup`；已配對者可用 `--status`。 |
| 設定檔損壞 | 備份 `~/.vanilla/slime/` 的裝置設定，先請 Owner 撤銷舊節點，再手動移走損壞檔案重新配對；勿直接重複耗用短碼。 |

## 5. Owner 進階使用與安全

Owner 開啟 **我的 AI／沙盤／OCTUBER 工具** 可選擇本機模型、金融 QLoRA 與沙盤實驗；這些工具都不會自動訓練大型模型。CUDA 微調需要已獲授權的來源資料、GPU 主機與本人逐項核准。

永久離開時，先按 **停止共享**，待服務實際停止，再按 **退出並撤銷配對**。裝置撤銷成功後才清除本機憑證；若後端無法連接，請由 Ceres Owner 先撤銷。

## 原本的進階 CLI 仍可使用

本機 `slime_desktop.py` 支援 `--help`、`--setup`、`--status`、`--leave`、`--reward`、`--gecko`、`--fleet`、`--tools`、`--dashboard`。電腦自動登入啟動仍須事先由裝置持有人明確授權，無隱藏常駐程式。

## 驗證

GitHub Actions `Slime Installer Release` 在 Windows、macOS、Linux 逐一執行回歸測試與打包，確認 Owner 的金融訓練工具不進入 Friend 安裝包。`tests/test_slime_first_run_gui.py` 使用純合成資料與模擬後端驗證配對、停止共享與錯誤處理；這不是對所有實際電腦的人工端對端測試。
