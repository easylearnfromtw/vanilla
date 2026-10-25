# SLIME · 本機 AI 模型工具（Owner 端）

## 新增功能

SLIME Owner 桌面程式增加一個「**本機工具 · AI 模型管理／LoRA 訓練**」入口，作為 SLIME 的其中一項功能，不另開公開網站或遠端執行 API。

在 Windows、macOS、Linux Slime Owner（非 Friend）桌面介面，可：

- 掃描 **七種 Qwen3 官方規格**：0.6B、1.7B、4B、8B、14B、30B MoE、32B；僅查詢本機 `127.0.0.1:11434/api/tags`，不會下載模型、不對外開埠。
- 選擇已安裝的模型，以本機 `/api/chat` 實際請求小量回答；成功回傳完整訊息才標示「通過推論」。列表已安裝不代表模型已微調。
- 透過檔案選取器指定自己的 Vanilla Git checkout 與**真正經人類審核、獲准使用的 JSONL 教材**，填入官方 Qwen3 HF commit SHA，執行 `actual_gpu_execution_gate.py` 檢查 CUDA、顯存、資料、已固定版本基底權重是否就緒。
- 本機 Owner 再次點擊、親自確認後，才可在這**一台本機**呼叫已有的 `training/atuber/multisize_train.py`。採取固定 argv 的 `subprocess.Popen`（非 Shell 指令），訓練輸出與日誌放在 `~/.vanilla/slime/local-ai-training`；不會自動從 Hugging Face 下載，除非 Owner 額外勾選明確允許下載。
- 程序啟動只顯示「已啟動、尚未驗證」，必須等完成、檢查 `adapter/adapter_model.safetensors` 及 `training-provenance.json` 才能報告真正更新語言模型權重。

入口：`services/slime/desktop.py` → `services/slime/local_model_window.py` → `services/slime/local_model_tools.py`。這三個檔案由 SLIME 的 PyInstaller 桌面包一同打包，不要求把完整 Qwen3 原始權重裝入 Slime EXE。

## 取得本地模型（自行選擇是否下載）

先在你的電腦安裝 <https://ollama.com/download>，使用你自己的終端機手動安裝模型：

```powershell
ollama pull qwen3:1.7b
ollama pull qwen3:4b
ollama pull qwen3:8b
ollama list
```

重新打開 SLIME Owner → 本機工具 → 掃描本機模型 → 選擇規格 → 實際生成測試。這些基底模型沒有自動接受 October 的微調。若 GPU 有限，建議先測 1.7B／4B，勿讓 30B／32B 自動下載到手機或其他節點。

## 在本機啟動 LoRA

本機還須另行安裝 NVIDIA CUDA、Python 環境及 `training/atuber/requirements.txt`，並確保有官方原始 Qwen3 模型版本與至少 100 筆有合法授權且真正審核的 JSONL。SLIME 本身不提供 CUDA，也不會替使用者從電腦上蒐集私人文件建立訓練集。

本次 PR **沒有**真的下載新的 30B 模型、租用 GPU、啟動語言模型訓練或部署 adapter。前一階段 GitHub 的 7 規格檢查結果顯示當時 CUDA 與合格資料不足。Slime 新功能只是讓使用者在**自己具備上述條件的裝置**進行本機操作。

### 安全界線

- **Friend 版無模型管理／訓練按鈕**，即使嘗試直接呼叫工具函式，也需 Owner 與本機明確確認。
- Telegram、WeiGuo、Slime 遠端任務 API 不新增任何「下載模型／開始訓練」指令，不能藉助配對權限在朋友電腦上執行。
- Ollama API 固定連接 `127.0.0.1:11434`，本機 HTTP 採不使用系統 Proxy 的 opener；不能將 URL 改成任意遠端主機。
- 啟動訓練前強制通過實際本機 `GPU／人工教材／基底權重` 預檢；拒絕以 fake CPU sandbox、未審核草稿或假權重宣稱完成。
- 啟動的訓練進程**不繼承** `SLIME_NODE_TOKEN`、`VANILLA_API_KEY`、`VANILLA_SERVER_URL`、`GECKO_ENROLLMENT_TOKEN`；不會傳送設備配對秘密到訓練環境。
- 關閉 Slime 桌面不等於取消 Owner 自己明確啟動的 GPU 訓練；可透過本機 PID、日誌查看或在本機終端機管理進程。**請勿在不知道目前狀態時手動刪除訓練檔案。**

## 驗證

離線單元測試：

```bash
python -m unittest discover -s tests -p "test_slime_local_model_tools.py" -v
```

桌面包：`.github/workflows/slime-desktop.yml` 已加入打包前的安全測試；`.github/workflows/slime-local-ai-tools.yml` 會在 Windows／macOS／Linux 三平台跑離線回歸。

**部署狀態（2026-10-25）：** 此功能已透過整合 PR #323 合併至正式 `main`，並發布 `slime-v20261025-75e47da5af4d` 三平台版本。另有本期 Owner 工具快捷啟動更新。此處的「已發布」只指可下載安裝包，**不代表已安裝到使用者電腦**；仍沒有真正新訓練的 Qwen 語言模型權重。使用方式見 `docs/SLIME_UNIFIED_SANDBOX_RELEASE.md`。
