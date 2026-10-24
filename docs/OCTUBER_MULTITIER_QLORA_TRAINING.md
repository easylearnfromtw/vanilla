# October 五規格 QLoRA：真正的權重訓練

這是實際 CUDA、4-bit NF4、LoRA 權重更新的訓練器，與 150,000 次沙盤規則式模擬不同。**截至本次提交，不表示任何 Qwen 主模型已訓練。**

## 模型與運算門檻

| tier | 顯示名稱 | Hugging Face 基底 | 單 GPU 記憶體預檢建議 |
|---|---|---|---|
| 0.6b | OCTUBER PHONE | Qwen/Qwen3-0.6B | 6 GiB |
| 4b | OCTUBER FLATTERING | Qwen/Qwen3-4B | 12 GiB |
| 14b | OCTUBER MODEST | Qwen/Qwen3-14B | 24 GiB |
| 30b-moe | OCTUBER SUMPTUOUS | Qwen/Qwen3-30B-A3B | 48 GiB |
| 32b | OCTUBER SUMPTUOUS 32B | Qwen/Qwen3-32B | 48 GiB |

這些是程式門檻、**不是保證能順利訓練**。30B MoE 的 experts、LoRA target modules、PEFT、bitsandbytes 需要在實際 GPU 上驗證。多台 Slime 電腦不能自動合併 VRAM；目前流程使用單張 CUDA GPU。Ollama GGUF 推論檔不能直接當成 HF QLoRA 訓練權重。

## 資料條件

請在已授權的訓練主機準備兩份不重疊的 JSONL：
- private/octuber-train.jsonl：經人工審核與授權的訓練資料；超過 5,000 步至少 1,000 筆。
- private/octuber-eval.jsonl：獨立、未出現在訓練資料的評測資料；至少 100 筆。

每列依照 training/atuber/dataset.py 格式包含 id、user、assistant、domain、source、reviewed、consent。來源必須經核准，不能直接把合成沙盤紀錄當成已審核資料；重複或洩漏的題目需要另外人工排除。程式會檢查 ID 和完全相同的正規化題目，但**無法保證語意相近的題目不會洩漏**。

## 唯讀規劃與驗證：0 次梯度更新

~~~bash
python training/atuber/multitier_train.py --tier 4b --steps 150000
python training/atuber/multitier_train.py --tier 4b --steps 150000 --validate-data --dataset private/octuber-train.jsonl --eval-dataset private/octuber-eval.jsonl
~~~

第一條只輸出可用性和設定，第二條只核驗資料，兩者均不會訓練權重或下載模型。

## 真正啟動 150,000 步 QLoRA

在**持有人授權的 CUDA 主機**先安裝 Python 3.11 以上及 training/atuber/requirements.txt 的 CUDA 相容依賴。

~~~bash
python training/atuber/multitier_train.py --tier 4b --train --steps 150000 --dataset private/octuber-train.jsonl --eval-dataset private/octuber-eval.jsonl --output artifacts/atuber-4b-150k --approve-gpu-compute --ack-model-license --approve-150k
~~~

此指令預設只載入已在 Hugging Face 快取中的基底權重。若持有人同意下載，請**另外明確加入** --allow-model-download。

斷點恢復使用與原訓練**完全相同**的資料與超參數，加上 --resume：

~~~bash
python training/atuber/multitier_train.py --tier 4b --train --steps 150000 --resume --dataset private/octuber-train.jsonl --eval-dataset private/octuber-eval.jsonl --output artifacts/atuber-4b-150k --approve-gpu-compute --ack-model-license --approve-150k
~~~

每 500 步保存檢查點（含 optimizer 與 scheduler），每 2,000 步執行驗證，最多保留最近三個檢查點。必須由最後的 training-provenance.json 內 completed_optimizer_steps、訓練／驗證 loss、adapter SHA-256 以及 adapter_model.safetensors 檔案驗明真正完成。

**150,000 optimizer steps × 8 次梯度累積 ≈ 1,200,000 次樣本呈現**，不代表 120 萬個不同訓練案例。小資料集反覆跑 150,000 步極容易過擬合；先跑 100–500 步、評估獨立盲測成績，再決定要不要延長長程訓練。

沒有授權不可自動租用 GPU、使用朋友電腦、下載多十 GB 的權重、上傳任何資料或部署新模型。每個 tier 的 LoRA adapter 必須獨立建立與驗證；0.6B adapter 無法直接給 4B、14B、30B MoE 或 32B 使用。

本專案主模型的 models/atuber/manifest.json 仍標記 bootstrap-only，除非真正完成權重訓練、獨立驗證並核准發布，否則不能宣稱已訓練。
