# October / 阿土伯多模型真實 QLoRA 訓練（尚未執行 GPU 訓練）

此分支增加 **0.6B、4B、14B、30B MoE、32B** 五種基礎模型的訓練設定與實際 CUDA LoRA 訓練入口。這些規格各自是基於 Hugging Face 的 Qwen3 原始模型，**不能用既有 Ollama GGUF 權重直接微調**。舊有 150,000 次 CPU 小型決策網路更新與本項大語言模型微調是兩件事。

| tier | October 品牌 | HF 基底 | 估計 VRAM 規劃提醒 |
|---|---|---|---|
| 0.6b | OCTUBER PHONE | Qwen/Qwen3-0.6B | 約 6 GiB |
| 4b | OCTUBER FLATTERING | Qwen/Qwen3-4B | 約 12 GiB |
| 14b | OCTUBER MODEST | Qwen/Qwen3-14B | 約 24 GiB |
| 30b-moe | OCTUBER SUMPTUOUS | Qwen/Qwen3-30B-A3B | 約 48 GiB |
| 32b | OCTUBER SUMPTUOUS 32B | Qwen/Qwen3-32B | 約 48 GiB |

VRAM 僅是**規劃估算，不是可運行保證**；實際需求取決於 seq length、模型架構、量化、CUDA 和 GPU 等。30B MoE 先只微調共通 attention projections，MoE 專家層需另行確認。

## 先進行不消耗 GPU 的檢查

```bash
python training/atuber/multitier_train.py --tier 4b --steps 150000
python training/atuber/multitier_train.py --tier 14b --dataset private/reviewed-atuber.jsonl --validate-data
python -m unittest discover -s tests -p 'test_octuber_multitier.py'
```

程式只有在 `--train`、`--approve-gpu-and-download`、已核准資料與可用 CUDA GPU 同時成立時才載入／下載模型。任何超過 5,000 更新步數的執行，另外要求 `--approve-150k`。

## 真正訓練流程（僅於已授權 GPU 主機）

```bash
python3 -m venv .venv-atuber
. .venv-atuber/bin/activate
pip install -r training/atuber/requirements.txt

# 先以 20 次真正的 gradient/optimizer 更新確認 transformers/TRL/模型相容性
python training/atuber/multitier_train.py --tier 4b \
 --dataset private/reviewed-atuber.jsonl --output artifacts/octuber-4b-smoke \
 --steps 20 --checkpoint-every 10 --eval-every 10 \
 --train --approve-gpu-and-download

# 確認 smoke test 真正生成 adapter_model.safetensors、loss、GPU 資源後
python training/atuber/multitier_train.py --tier 4b \
 --dataset private/reviewed-atuber.jsonl --output artifacts/octuber-4b-150k \
 --steps 150000 --checkpoint-every 500 --eval-every 2000 \
 --train --approve-gpu-and-download --approve-150k

# 中斷後以完全相同參數、資料及輸出目錄續訓
python training/atuber/multitier_train.py --tier 4b \
 --dataset private/reviewed-atuber.jsonl --output artifacts/octuber-4b-150k \
 --steps 150000 --checkpoint-every 500 --eval-every 2000 \
 --train --resume --approve-gpu-and-download --approve-150k
```

14B / 30B / 32B 必須更換 `--tier`，並各自使用**獨立輸出目錄**，不得混用 adapter。首次訓練不允許覆寫舊權重。續訓檢查 `training-request.json` 中的模型、參數及訓練資料 SHA256，找到含 `trainer_state.json` 的最近 checkpoint，使用 Trainer 正規續訓，而非將多次 5,000 步宣稱為連續更新。

## 真實完成認證

只有在 `trainer.state.global_step` 等於要求的 optimizer 更新步數，且保存 `adapter/adapter_model.safetensors`，並取得有限值 train/eval loss 後，才產生 `training-provenance.json` 與 adapter SHA256。此驗證屬於產物存在性，**不能證明醫療、財務或專業推論品質提高**，還需獨立人工評分、不重複的持出測試集、與原始模型比較。

目前尚未下載任何基底權重、取得核准的 CUDA 訓練節點或人為審核 SFT JSONL。不可宣稱已完成 Qwen3 4B/14B/30B/32B 模型權重更新。使用者原先 CPU 10,759 參數決策網路的 150,000 步不等於這些大模型的更新。

注意：在預設累積 8 的設定下，150,000 次 optimizer 更新會使用約 1,200,000 個 microbatches 的資料曝光次數，**不代表有 150 萬筆獨立訓練資料**。只有少數資料時訓練如此久通常會嚴重過度擬合，應先以 20、200、2,000 步試驗並查看獨立評估曲線。不要把未審核沙盤、醫療紀錄、私密聊天或憑證納入訓練。

參考：Hugging Face [TRL SFT Trainer](https://huggingface.co/docs/trl/sft_trainer)。
