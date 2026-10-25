# SLIME × GitHub：真實 CPU 訓練與 Owner GPU Qwen3 LoRA

## 已確認的真實訓練證據

- [Qwen3-0.6B 實際 CPU LoRA](https://github.com/easylearnfromtw/vanilla/actions/runs/40162780843)：實際執行 2 次 optimizer 梯度更新，生成約 1.16 MB 的真實 `adapter_model.safetensors`，權重 SHA256 `a39201a42c934ae5a4e5ef2a07245802da7555884b89ab89b7d24872529a5cd8`。資料只含**一篇 arXiv 官方許可紀錄核對過的論文**，保留同篇文章段落測試，並無獨立論文／專業問答驗收。這是「模型真的改了權重」的技術證明，**不是已訓練完整專業知識**，沒有 CUDA GPU。
- Detroit 五維及 October 購物沙盤的多次成功測試仍是 **小型神經模型或沙盤任務**，與 Qwen3 語言模型權重分開。

## 立即可在 GitHub 標準虛擬主機執行的真實 CPU 訓練

工作流：[`SLIME Actual CPU Sandbox Training`](https://github.com/easylearnfromtw/vanilla/actions/workflows/slime-real-training.yml)。

它會自動使用官方 NDC 歷史價格 CSV（不是今日商店報價），經資料真實性檢查後：

1. **1,000,000 次模擬人類購物決策**：不會將它算成神經權重更新。
2. **1,000 次真實 NumPy Adam optimizer 更新**：小型歷史價格區間分類政策；使用未見過商品名稱作為保留測試，需通過既有 92% 門檻。此任務有 100% 的簡單 `if/else` 參考解，絕不代表真實估價準確率達標。
3. **20,000 次真實 Detroit 5D 小參數 SGD 更新**：獨立導出五維權重和合成案例測試。
4. 驗證每個任務的梯度次數、權重 checksum、資料來源、GPU 使用狀態；將非機密的報告與小模型檔保存在 GitHub Action artifacts，**不自動更新正式模型**。

標準 `ubuntu-latest` 有 CPU，但預設並不提供 NVIDIA GPU。此 CPU 工作流的 Qwen3 CUDA 梯度次數明確為 **0**。

柳岸書城圖書排名、霞海書院開放論文和 Qwen3-0.6B CPU LoRA 有既有獨立流程，不為了湊計數而重複下載沒有授權審核的正文，也不會把其他模型的權重冒充 Qwen3。對於書籍原著公共領域候選清單，必須獨立審核具體版本／翻譯及管轄權後才能用於正式微調。

## 如何使用 GitHub GPU 進行真正 Qwen3 微調

工作流：[`SLIME Real GPU Qwen3 QLoRA (Owner Approval)`](https://github.com/easylearnfromtw/vanilla/actions/workflows/slime-real-gpu-qlora.yml)。此流程**只允許手動 Workflow Dispatch**，不會因為推送程式、PR、Telegram 訊息或 SLIME Friend 配對而自動租用 GPU。

### 安全更新：GPU 務必改用另一個私有訓練倉庫（2026-10-25）

**原始 `easylearnfromtw/vanilla` 是公開倉庫，切勿把長駐自架 NVIDIA GPU 主機直接登記到公開 repo。** 這個原有 GitHub GPU workflow 現在對公開倉庫明確停用，以防公開 PR 攻擊私有算力與私有資料。請使用 `deployment/slime/private-gpu-qlora.workflow.yml` 複製到另外的**私有 GitHub 倉庫**執行，並照 `docs/SLIME_PRIVATE_GPU_REAL_TRAINING.md` 設置 Runner、environment approvals、審核資料及固定模型來源。下方是原先的技術參考，**不能直接套用到公開 repo**。GitHub 官方警示：https://docs.github.com/en/actions/reference/security/secure-use 。

### Owner 一次性設定（僅適用私有部署）

1. 準備真正具備 NVIDIA CUDA 的**自己或已授權的** Linux x64 GPU 伺服器。將 Self-hosted Actions Runner 登記到**另一個 Owner 控制的私有訓練 repo**，使用 `self-hosted`、`linux`、`x64`、`slime-private-gpu` 標籤；**不要登記到公開 `easylearnfromtw/vanilla`**。不能只是把 CPU 主機貼上 GPU 標籤；私有工作流仍會驗證真實 `nvidia-smi`、`torch.cuda.is_available()`。
2. 在 GitHub Repository → Settings → Environments 建立 `slime-gpu-training`，建議設定 Required Reviewers、允許 `main` 分支執行並設定計算費用上限。工作流每次僅允許 16、32 或 64 個真實 optimizer steps，最多 90 分鐘。
3. 將至少 100 筆**獲得資料使用權且經人工審核**的 JSONL 放在 GPU 主機上的絕對路徑（不放 Git 倉庫、GitHub Artifact 或公開工作日誌）。在 GitHub Repository → Settings → Actions → Variables 加入 `SLIME_GPU_DATASET_PATH`，其值為主機上的實際檔案絕對路徑，例如 `/home/owner/private/atuber-reviewed.jsonl`。
4. 確認 GPU 主機有 Python、CUDA PyTorch、PEFT、TRL、bitsandbytes、Transformers 等依賴；推薦在固定的 Python 虛擬環境中啟動該 Runner。確認 Qwen3 官方 Hugging Face 模型的**完整 40 位 commit SHA**，避免版本漂移。大尺寸 30B／32B 需要遠高於一般 16 GiB 顯存的硬體；單張 Tesla T4 只適合從 0.6B／1.7B 或符合實測記憶體的小模型開始，且不能保證成功。
5. 在 GitHub Actions 頁面手動選擇 `SLIME Real GPU Qwen3 QLoRA (Owner Approval)` → **Run workflow**，選擇 `main`、模型尺寸、基底 SHA 與計算步數。除非真的允許官方模型權重下載且了解費用，否則保持 `allow_download=false`。
6. 工作流會確認真正 GPU、合法檔案、基底來源、資料分組和可訓練情況，再開始真正 CUDA QLoRA。生成的 `adapter/adapter_model.safetensors` 和 `training-provenance.json` **只保留在 GPU Runner Owner 帳戶的** `~/.vanilla/slime/gpu-training/<GitHub_RUN_ID>-<attempt>-<size>`，不會發布到公開 artifacts，也不會自動覆蓋 SLIME／October。
7. **訓練後的釋出驗收**仍需獨立未見樣本測試、隱私／授權審查、基底模型和 adapter 版本一致性、Ollama 或 WebLLM 轉換與真實載入驗證。

### 安全、能力和部署現況

- GitHub 可以作為**自動排程、訓練執行及證據保存平台**，但一般免費 GitHub 虛擬主機不會自帶 CUDA。GitHub 提供另外付費／由組織開通的 GPU Larger Runners，包括 Tesla T4 16 GiB；如果尚未設定 Runner 與付款權限，僅加入工作流並不會讓 GPU 自動出現。參考官方文件：<https://docs.github.com/en/actions/reference/runners/larger-runners>。
- 由於目前無法從此介面讀取專案私有 GPU Runner 的設定，**不宣稱已經租到 GPU 或啟動了 CUDA Qwen 微調**。GPU 工作流是經人為核准後才會執行的正式入口。
- 公開 GitHub Actions 不得上傳未經授權的書籍全文、個人聊天紀錄、醫療紀錄或 API Keys 作為訓練資料。沙盤不等於已取得完整資料授權。
- SLIME 的模型管理、底特律、柳岸書城、霞海書院仍可照原本的 Owner 本機工具流程運作；GitHub 的工作流只補上可驗證的**雲端 CPU 執行**和可銜接真正 GPU 的本機 Runner。
