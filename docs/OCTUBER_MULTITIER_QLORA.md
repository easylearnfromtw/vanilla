# October / 阿土伯多模型 QLoRA 操作說明

最新、實際可執行的五規格訓練及斷點續訓指令，請參閱 [OCTUBER_MULTITIER_QLORA_TRAINING.md](OCTUBER_MULTITIER_QLORA_TRAINING.md)。

原本的「--approve-gpu-and-download」已被拆成三種**獨立授權**：

- --approve-gpu-compute：確認使用你授權的 CUDA 運算資源
- --ack-model-license：確認模型使用和微調權利
- --allow-model-download：只有確實允許下載原始模型時才額外加入；否則預設離線

超過 5,000 步還需 --approve-150k。現在訓練與驗證資料必須放在兩份獨立的、經審核 JSONL，分別傳入 --dataset 和 --eval-dataset。

此處說明的是可供授權 GPU 主機使用的訓練器，尚未在 GitHub Actions 完成任何 Qwen3 大模型權重訓練。
