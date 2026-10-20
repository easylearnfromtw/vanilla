# Vanilla / Detroit — Windows RTX 3050 Node Kit

**狀態：可執行的 Windows 檢查與 Ollama/Tailscale 連線配套；不是已部署的 24 小時多機叢集。**

為既有 **RTX 3050 筆電（6GB VRAM；RAM 待確認）** 預備。Raspberry Pi 4 可在未來作為協調節點；低效能 Microsoft 電腦可做輕量工具工作。**不必先購買 Mac mini。**

## 套件內容

- `Preflight-WindowsNode.ps1`：只讀 CPU、RAM、NVIDIA VRAM（`nvidia-smi`）、Ollama 已下載模型與 Tailscale 狀態；預設僅輸出本機 JSON，不傳雲端、不儲存憑證。
- `Connect-OllamaTailnet.ps1`：預設**預覽模式**。只有使用者確認 tailnet ACL，明確帶 `-Apply` 才設定 Tailscale Serve，將本機 Ollama 分享給授權 tailnet 裝置，絕不使用 Funnel。
- `src/detroit/node-scheduler.ts`：Diana/Zeus 後續適配的純函式。依已認證的節點快照、心跳、模型、可用 RAM/VRAM、負載、電源及授權選出候選節點，不宣稱已執行任務。
- `tests/node-scheduler.test.mjs`：節點選擇與安全守門測試。

## 步驟 A — Windows 預檢（不需先買硬體）

在你的 Windows 電腦下載本資料夾的兩支 `.ps1`，以 PowerShell 一般使用者身分執行：

```powershell
cd <儲存腳本的資料夾>
& .\Preflight-WindowsNode.ps1
# 可選：輸出本機 JSON（含 CPU、GPU 型號及已安裝模型名稱）
& .\Preflight-WindowsNode.ps1 -OutputPath .\windows-node-profile.json
```

若 Windows 因執行原則拒絕腳本，先核對來源及內容；不要全域停用 PowerShell 安全機制。

**RTX 3050 筆電是 6GB VRAM，不代表主機有 32GB RAM。** 請先查 RAM 總量與可擴充性。GPU 適合 3B–8B 量化模型；30B Q4 通常需要約 18–20GB 權重及額外的 KV cache、OS 和推論記憶體。若 CPU 卸載，性能須實測；本套件不保證 30B 可流暢執行。

## 步驟 B — 本機 Ollama

1. 根據 [Ollama 官方 Windows 文件](https://github.com/ollama/ollama/blob/main/docs/windows.mdx) 安裝相容版本及更新 NVIDIA 驅動。
2. 先下載合適的**小模型**；RAM 未查清以前，不要一次下載大量 30B 權重。
3. 驗證：

```powershell
ollama list
Invoke-RestMethod http://127.0.0.1:11434/api/tags
& .\Preflight-WindowsNode.ps1
```

若 Windows 睡眠、合上筆電休眠或網路中斷，Vanilla 遠端推論就會斷線。建議插電且保持散熱；**不要關閉溫度保護**。

## 步驟 C — 只在私有 tailnet 開啟 HTTPS

1. 安裝及登入 Tailscale。先在 Tailscale 管理後台將 ACL / grants 限制為**只有自己的 iPhone、Pi 4 或授權管理裝置**可存取 Windows 的 Serve。
2. 確認 Ollama 只監聽 `127.0.0.1:11434`；不要設 `OLLAMA_HOST=0.0.0.0`，不要做 router port forwarding，也**不要使用 Funnel**。
3. 先預覽，確定 ACL 後才啟用：

```powershell
& .\Connect-OllamaTailnet.ps1
# 確認 ACL 正確後，才執行：
& .\Connect-OllamaTailnet.ps1 -Apply
```

4. 使用 `tailscale serve status` 回報的**真實** `https://...ts.net` 網址，填至 Vanilla → 系統設定 → Ollama，按「測試連線／取得模型」，選擇已下載的模型。
5. 在 iPhone 登入同一 tailnet 再測試聊天。若遇 CORS，應在受信任的代理上正確設定 `OLLAMA_ORIGINS`；**CORS 不是認證**。Windows 端的 Tailscale Serve 可能需要管理員終端機權限，視安裝版本而定。

注意：Ollama API 本身沒有逐使用者驗證。Tailscale 的 ACL 很重要，但仍須確保 tailnet 裝置與帳號都是可信的。分享給整個家庭 tailnet 並不等同只分享給特定人。

## 步驟 D — Detroit 自動調度：架構已預留，尚未接線

Diana 決定**使用什麼工具**；Zeus/後端決定**在哪台受信任機器執行**。後續由 Pi 4 或其他常駐主機建立可驗證的心跳收集器，定期取得 RAM、VRAM、負載、模型、延遲與電源狀態，再把快照交給 `planDetroitNode()`。

- **模型任務**：僅選已確認下載的模型；30B 的 RAM 預算必須來自實測 profile，不應憑模型名稱猜測。
- **工具任務**：只能交給已具備可驗證 executor 的節點；發送郵件、刪檔、寫程式或其他高影響操作仍要單次批准、稽核及隔離。
- **私密模式**：維持 Vanilla 現有定義，只走 iPhone WebLLM，不向 Windows、Pi、Mac 或雲端傳送。
- **節點故障**：心跳超過 45 秒、資源未知、負載滿或授權不足時返回 unavailable，不能把「已排程」寫成「已完成」。
- **筆電電池**：預設不選擇正在以電池供電的節點；Wake-on-LAN 僅在硬體/BIOS/網卡及供電支持時可另行部署。

| 現有裝置 | 職責 | 建議運行方式 |
| --- | --- | --- |
| Raspberry Pi 4 | 未來的協調、佇列、心跳、Ceres 入口 | 加風扇和穩定供電後可常駐 |
| RTX 3050 6GB Windows 筆電 | Ollama 小模型、CUDA 類工作 | 插電、按需推論 |
| 低效能 Microsoft 電腦 | CPU／輕量文件與背景工作 | 需要才加入 |
| Mac mini M1 | 暫時不買 | 只在需要省電獨立主機時評估 |

## 測試、限制與安全性

```sh
node --experimental-strip-types --test tests/node-scheduler.test.mjs
```

測試只涵蓋節點**規劃**邏輯。PowerShell 腳本還需要在你自己的 Windows 實機驗收；未部署前無法宣稱 Windows 已接上 Detroit，也不代表已實現遠端程式執行、自動喚醒、心跳收集或完整多機自動調度。

套件目前不修改既有 `src/ai/ollama.ts` 或原有聊天流程，**預設完全不生效**。這確保現在的 Vanilla 功能不會因尚未配置的 Windows 節點被干擾。
