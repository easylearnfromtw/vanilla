# OCTUBER 30B / 60B — GPU 沙盤訓練（模型參數）

**現況：沙盤工具可執行；30B / 60B 專屬模型權重均未訓練。**
30B 和 60B 指神經網路 checkpoint 的總參數級距，不是 GPU 規格、API 計費級距或 Ollama 別名。

## 有來源的開放權重基底

| 目標 | 基底 | 總參數 | 活躍參數 | 授權 |
|---|---|---|---|---|
| SUMPTUOUS 30B | Qwen/Qwen3-30B-A3B-Instruct-2507 | 30.5B | 3.3B | Apache-2.0 |
| OCTUBER 60B | MultiverseComputingCAI/HyperNova-60B | 約 59B | 約 4.8B | Apache-2.0 |

Qwen official: https://huggingface.co/Qwen/Qwen3-30B-A3B-Instruct-2507
HyperNova official: https://huggingface.co/MultiverseComputingCAI/HyperNova-60B

HyperNova-60B 是 pruned gpt-oss MoE / MXFP4，不是 60B Dense、兩個 30B 模型合併或未證實的 Qwen3-60B。上游提供推論範例，但是 Vanilla 尚未驗證 60B MXFP4/PEFT 真正梯度微調相容性。

## 沙盤執行，不下載大型權重

需要 Python 3.10+。plan 模式只有 Python 標準庫；toy-cpu / toy-cuda 必須具備相容版 PyTorch：

~~~bash
# 容量沙盤：模擬 80 GiB 單卡，僅估算權重儲存空間
python3 training/octuber-gpu-sandbox/sandbox.py --models all --mode plan --scenario-vram-gib 80

# 真正有梯度更新、但只有 1,682 參數的 CPU 小模型測試
python3 training/octuber-gpu-sandbox/sandbox.py --models all --mode toy-cpu --steps 20

# 真實 CUDA GPU 上的同一種 1,682 參數小模型訓練煙霧測試
# 沒有 CUDA 時強制失敗，絕不標成 GPU 成功
python3 training/octuber-gpu-sandbox/sandbox.py --models all --mode toy-cuda --steps 20 \
  --output private/octuber-gpu-smoke-report.json
~~~

報告區分 (a) 虛擬 GPU 記憶體預估 (b) CPU 小模型實測 (c) CUDA 小模型實測 (d) 真正 30B/60B 權重訓練。這四件事不能混淆。沙盤完全不下載 30B / 60B 權重、不扣款、不創建大型模型 adapter，預設沒有資料集，沒有自動存取私人資料。

30B 約 14.2 GiB、60B 約 27.5 GiB 是四位元權重的純數學儲存下限，不能代表實際 MXFP4 記憶體使用，更不含 activation、梯度、optimizer、碎片或多卡同步成本。40 GiB（30B）與 96 GiB（60B）只是粗略的單卡訓練前篩選值，完全不保證足夠或訓練相容。

## 接上真正 30B 微調

既有程式 training/octuber-sumptuous/train.py 會在真實 CUDA 主機上執行 QLoRA SFT。必須提供真正經審核與同意的資料集，以及上游 immutable 40 hex commit revision。無資料或無 CUDA 都無法開始訓練。

~~~bash
python3 -m pip install -r training/octuber-sumptuous/requirements.txt

python3 training/octuber-sumptuous/train.py \
  --dataset private/reviewed-sumptuous-30b.jsonl --validate-only

# ACTUAL_BASE_SHA 必須換成官方 Qwen 上游實際 commit，不能亂填
python3 training/octuber-sumptuous/train.py \
  --dataset private/reviewed-sumptuous-30b.jsonl \
  --base-revision ACTUAL_BASE_SHA \
  --output artifacts/octuber-sumptuous-30b-adapter \
  --allow-model-download --ack-license-and-data-rights --train
~~~

產生真實 adapter 後，才是 30B 既有 merge.py、package.py、GGUF 及人工基準評測流程。需要真正 GPU 訓練成功回條才能更新模型發布狀態。

## 60B 真正微調的待完成技術關卡

1. 在 owner-approved CUDA 主機上讀取 HyperNova 的固定版本、gpt-oss/MXFP4 層命名、LoRA target modules，先實測相容性。不能把 Qwen 30B 訓練程式換一個模型名稱就說 60B 訓練完成。
2. 確定模型可更新 adapter 後，才允許用經審核的資料執行少量 SFT 及檢查真實 tensor/損失變化。
3. 完成 checkpoint lineage、合併、獨立推論與評測、權利核對才可更新 models/octuber-60b/manifest.json。目前 60B 真實訓練器及發行版權重尚不存在。

## 連接 Hermes 與 Firecrawl

只有 training/octuber-knowledge/ 正式審核過權利、來源、人工問答與資料切分的 JSONL 才能作為模型訓練候選資料。爬取網頁或讀 210 項 Hermes 技能 ≠ 模型已學會，也不自動啟動五小時訓練工作。

## CI

~~~bash
python3 -m unittest discover -s tests -p 'test_octuber_gpu_sandbox.py'
~~~

此測試不使用付費 GPU、不下載大型權重、不更新正式模型 manifest。GitHub Pages 是前端站點，不能在使用者未授權的 GPU 上悄悄執行訓練。
