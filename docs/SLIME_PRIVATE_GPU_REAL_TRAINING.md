# SLIME × GitHub × GPU：實際訓練專用部署（私有 Runner）

## 現況核對

`easylearnfromtw/vanilla` 目前為**公開 GitHub 倉庫**。不要直接把包含私人教材、HF Token、模型權重與持久性 NVIDIA 主機的 GitHub self-hosted Runner 註冊到這個公開倉庫。GitHub 官方特別警告：公開 PR 的不可信程式碼可能持續感染長駐自架 Runner。[GitHub Secure Use](https://docs.github.com/en/actions/reference/security/secure-use)。

**現階段實際已完成**：
- [Qwen3-0.6B CPU LoRA](https://github.com/easylearnfromtw/vanilla/actions/runs/40162780843)：單篇具來源權利核對的 arXiv 論文、2 次真正 optimizer updates、adapter `adapter_model.safetensors` 約 1.16 MB，SHA-256 為 `a39201a42c934ae5a4e5ef2a07245802da7555884b89ab89b7d24872529a5cd8`。
- [SLIME CPU 沙盤](https://github.com/easylearnfromtw/vanilla/actions/runs/40167149245)：100 萬次購物決策沙盤、1,000 次歷史價位分類 NN 更新、20,000 次 Detroit 五維小模型 SGD。**不是 Qwen3 20,000 次梯度更新**。
- **Qwen3 CUDA GPU 的可信成功紀錄為零**。有工作流並不代表有 GPU、已安裝模型、已授權資料或已完成訓練。

## 安全執行架構

```text
公開 vanilla（原始碼、單元測試、CPU 沙盤）
                │
                │ 受審核、固定 commit SHA
                ▼
另一個 GitHub 私有倉庫（只有 Owner 能修改訓練 workflow）
                │
                │ workflow_dispatch + slime-gpu-training 環境核准
                ▼
私有臨時 NVIDIA Linux GPU VM（slime-private-gpu Runner）
                │
                ├─ /srv/slime-private/datasets/*.jsonl  合法審核後私有教材
                ├─ /srv/slime-private/hf-cache         固定 Qwen3 基底
                └─ /srv/slime-private/outputs/          已驗證 LoRA + 訓練報告
```

新增、已經寫好的工作流模板：`deployment/slime/private-gpu-qlora.workflow.yml`。

### 先由 Owner 完成的一次性步驟

1. **另外建立一個私有 GitHub 儲存庫**，不要把私有模型資料複製到公開的 `vanilla`。將模板複製到該私有倉庫的 `.github/workflows/slime-private-gpu-qlora.yml`。絕對不要直接在公開 `vanilla` 註冊長駐自架 GPU Runner。
2. 在私有倉庫 `Settings → Environments → slime-gpu-training` 設定 **Required Reviewers**，限制只接受受信任的 `main` 分支。
3. 自行準備具 NVIDIA CUDA 的**授權 GPU Linux 主機**，安裝受信任的 GitHub Actions Runner，限制在此**私有倉庫**，標籤為 `self-hosted, linux, x64, slime-private-gpu`。建議一次性／隔離 VM，不與 Telegram、WeiGuo、生產環境共用帳戶和敏感憑證。GPU VM 必須允許 Owner 控制執行費用及停止實例。這**不是**指 GitHub 的免費 `ubuntu-latest`。
4. 在此 GPU VM 建立只限 Owner 讀取的 `/srv/slime-private/datasets`、`/srv/slime-private/hf-cache`、`/srv/slime-private/outputs`。安裝並驗證 NVIDIA Driver、CUDA PyTorch、`transformers`、`trl`、`peft`、`bitsandbytes` 等與你的硬體相容的套件。
5. 將**已真正審核、有使用權、至少 100 個合格對話且保留未見任務家族**的 JSONL 放入 GPU VM，例如 `/srv/slime-private/datasets/reviewed.jsonl`。不要把 Secret、私人帳戶資料、敏感檔案放進 Actions repository、issue、PR、artifact、log。
6. 在私有倉庫的 Actions Variables 設定：`SLIME_GPU_DATASET_PATH` 指向上述絕對路徑；`VANILLA_APPROVED_SOURCE_SHA` 填入**已人工查核**公開 Vanilla 的 40 位 commit SHA，不能只填 `main`。必須對照真實基底模型 `Qwen/Qwen3-X` 的 40 位 Hugging Face commit。
7. 人工選擇 **Actions → SLIME private Owner GPU QLoRA → Run workflow**；選 `main`、模型大小（先從 0.6B 或 1.7B）、真實 optimizer steps（先 16 次）、固定基底 revision。**預設不准下載模型**，要真正下載官方指定版本才另外核准 `allow_download=true`。
8. 執行後必須看到 **real CUDA GPU name、非零真實 optimizer steps、`adapter/adapter_model.safetensors`、`training-provenance.json`、adapter SHA256**；工作流不會上傳模型或私有語料到公開 GitHub，也不會直接部署 SLIME／October。先做獨立評估、審核資料權利及 WebLLM／Ollama 相容轉換。

### 不能把 GitHub 當免費 GPU

GitHub 標準 `ubuntu-latest` 是 CPU 環境。官方 **GitHub-hosted GPU Larger Runner** 當前提供 NVIDIA Tesla T4 16 GiB，但只適用 GitHub Team／Enterprise 的**組織或企業**，而且 GPU Larger Runner 按使用分鐘計費；個人使用者倉庫沒有可直接按鈕啟用的免費 T4。參見 [官方 Larger Runner 規格](https://docs.github.com/en/actions/reference/runners/larger-runners) 與 [使用資格](https://docs.github.com/en/actions/concepts/runners/larger-runners)。

私人 GPU VM 的算力通常也會計費。沒有 Owner 明確授權支付費用及啟用主機，本專案只提供安全執行工作流，不會幫忙建立付費執行個體或冒充已完成 GPU LoRA。

## 訓練產物與評量

每個尺寸各自保存不同 LoRA adapter；0.6B LoRA 不可改名宣稱 8B 或 30B。30B MoE 也不能把其 attention adapter 和 32B Dense 同樣處理。模型是否有效，需以**未見來源與人類測試問題**對照未微調原版進行評估。只有 `real trainer.train()` 梯度更新與實際 `safetensors` 經過 SHA256 核對後，才算語言權重更新。

公開 repo 的原有 `slime-real-gpu-qlora.yml` 和 `atuber-approved-cuda-qlora.yml` 已增加 **public repository 不啟動 self-hosted GPU job** 安全條件；真實的私人 GPU Runner 改用這份私有模板。
