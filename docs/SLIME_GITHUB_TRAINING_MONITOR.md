# SLIME × GitHub — 本機真正訓練紀錄監控

SLIME Owner → 本機工具 → **GitHub 訓練紀錄／CPU LoRA 與 GPU 核准狀態**。這是對公開 easylearnfromtw/vanilla 的唯讀監控，不需要 GitHub 私密 Token，也不會下載模型、數據或啟動遠端工作。

## 顯示哪些內容

- Qwen3-0.6B 實際 CPU LoRA：GitHub workflow 的任務狀態、程式 commit、時間與原始日誌入口。若產生模型，須另外檢查 safetensors adapter。
- 100 篇、1000 篇具明確 CC0/CC-BY 條件 PMC 全文訓練 workflow：區別尚在進行與已完成工作。
- SLIME Actual CPU Sandbox Training：小型神經模型及模擬購物沙盤，不能當成 Qwen 語言權重。
- GPU Owner workflow：僅作為公開流程的唯讀審計；真正自架 GPU 在私有 Repo，這個介面沒有權限推論其作業或模型完成情況。

## 安全及證據

- 只讀取固定的 GitHub 官方 HTTPS API，最多顯示 18 筆；沒有 GitHub Token、遠端 dispatch 或長期輪詢。
- 僅接受固定允許清單中的工作流、完整 40 碼 commit SHA 與有效 GitHub run ID；原始連結由數字 ID 安全重建，絕不照搬不受信任 API 回傳 URL。
- GitHub API 無法取得時一律顯示未核實；不保存或假造成功。
- GitHub CI success 僅是流程狀態，不是權重證據。應由原有 SLIME 本機 training_evidence.py 對選取的 adapter_model.safetensors 與 training-provenance.json 校驗 SHA256、PEFT tensor、梯度次數，再進行獨立評測。
- 不會把 GPU runner 接到公開 Vanilla。只能使用另一個私有訓練 repo，保護資料、費用、模型與長期主機；部署方案請參閱 docs/SLIME_PRIVATE_GPU_REAL_TRAINING.md。

官方說明：GitHub 標準公共 ubuntu-latest 為 CPU；Tesla T4 GPU Larger Runner（16 GiB VRAM）是需組織／企業資格的另外付費選項：https://docs.github.com/en/actions/concepts/runners/larger-runners

此功能只新增 SLIME Owner 狀態 UI，不會自動進行 Qwen CUDA 更新、下載機密資料或安裝模型。