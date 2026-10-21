# October（阿土伯）v0.3 — Sign Well autonomous model

## 50 題正式決策與交付文件（2026-10-21）

50 個決策槽位已完成訪談：**49 題由使用者確認，Q24 略過且未經另行確認不得自動補選**。第 50 題採 **D：證據驅動的分階段交付與產品驗收治理**。

- [DECISIONS_50.md](DECISIONS_50.md)：49 項確定的產品決策及 Q24 skipped。
- [ARCHITECTURE_DELIVERY_PLAN.md](ARCHITECTURE_DELIVERY_PLAN.md)：系統架構依賴、實況證據、MVP 定義、M0–M7 Gate、Owner 權限與驗收規則。
- [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md)：Q01–Q50 追蹤矩陣、驗收焦點、實作／測試／部署狀態定義。
- [IMPLEMENTATION_BACKLOG.md](IMPLEMENTATION_BACKLOG.md)：OC-000–OC-023 共 24 個候選工程 Epic，包含優先級、依賴、拒絕／復原測試與 DoD。

**狀態界線**：以上是 GitHub 上的設計與工程 Backlog，**並不證明** October 的完整自主 Agent、Slime 多機 30B、Ceres 全域管理、SDK、真實訂閱收費、跨平台安裝器或跨平台資料移轉已正式可用。依每項程式碼、測試、真正 Provider Receipt 與部署記錄逐一更新狀態。Self-Build 僅可信後端背景可觸發；全域高風險操作仍需本人 Ceres Telegram 核准。

Official independent model ID: `october:0.3`. Display name: **October（阿土伯）**.

October combines three components. **Ollama LLM**: configuration based on `qwen3:4b` for economic, management, financial, accounting, and actuarial planning; foundation weights NOT yet fine-tuned. **Trained policy head**: independent supervised MLP learns permitted mock task decision patterns. **Detroit scoped runtime**: proposed future integration; requires server-verified authorization, durable scheduling, real tool execution, audit and policy checks. In this pull request the policy is a simulated, read-only recommendation, NOT a commercial job executor.

## Real learning completed (submodel, not base LLM)

The CPU-trained classification policy head learned from **12,000 synthetic scenarios**, with 1,600 validation cases and 2,000 unseen synthetic hold-outs, over 55 epochs. MLP: 15 features, 48 and 32 hidden units, 8 output classes, **2,600 trained parameters**. Before training blind accuracy was **10.15%**; afterward **99.50%** (cross-entropy 0.01937). These numbers ONLY apply to generated task-decision labels, not accounting/actuarial reasoning or actual customer action outcomes. This is genuine supervised weight learning, but not LoRA fine-tuning of Qwen.

Reproduce (CPU, after installing PyTorch):
```sh
python training/october/train_policy.py --output training/october/weights/october-policy-v0.1.json
node --test training/october/policy.test.mjs
node training/october/policy.mjs
```

The training script exports portable JSON weights. Download the verified, already-trained weight file separately from the October archive provided in ChatGPT; the GitHub training workflow can also generate model artifacts. The JS policy always enforces deterministic scope/tenant/due/privileged gates, never grants execution rights.

## Ollama local model

```sh
ollama pull qwen3:4b
ollama create october:0.3 -f training/october/Modelfile
ollama run october:0.3
```

This creates an independent named Ollama configuration only. The trained task policy must be routed by Detroit separately; it is NOT merged into Qwen weights by this command.

## Full Qwen LoRA / QLoRA learning still requires a GPU

Sandbox educational tasks and separated datasets live in `training/agent_sandbox/`. Run `node training/agent_sandbox/integrated-dataset.mjs` and `node training/agent_sandbox/to-noodles.mjs`, then review before submitting to `training/noodles_train.py` on a GPU host. Suggested first checkpoint: `Qwen/Qwen3-0.6B` (Apache-2.0). Existing trainer provides `--check-only` and explicit `--run-training` modes, but GPU execution is unverified; 4B requires additional VRAM. This environment had no GPU, Hugging Face model weights or network download; no Qwen LoRA is claimed.

Use a matched base checkpoint and validate target Ollama import; do not assume PEFT adapters can be added to arbitrary quantized runtimes. Consult current official docs: https://docs.ollama.com/modelfile and https://docs.ollama.com/import.

## Windows install / low-VRAM alternative

PowerShell after installing Ollama:

```powershell
powershell -ExecutionPolicy Bypass -File training/october/install-october.ps1
```

If 4B is too large for your hardware:

```sh
ollama pull qwen3:0.6b
ollama create october:lite -f training/october/Modelfile.lite
ollama run october:lite
```

**The 2,600 learned policy-head weights are a separate module**, not inside the Ollama base model. GitHub action [October Policy Real Training](https://github.com/easylearnfromtw/vanilla/actions/runs/39420897057) has successfully re-trained the component on a GitHub CPU runner and published `october-policy-cpu-trained-v0.1` (download artifact from run details; expires after retention period).

## Commercial safeguards

Model classification is never authorization. Backend identity, per-tenant checks, real scheduler persistence, scoped tools, audit, idempotency, replay, manual approval for high impact operations, emergency stop and data provenance are required before any real customer use. No customer data or regulated financial transaction in this training corpus.
