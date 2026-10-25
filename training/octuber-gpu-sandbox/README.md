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


## 虛擬主機排程與故障復原沙盤（新增）

Vanilla 電腦／手機版：**設定 → AI 模型 → 虛擬 GPU 主機沙盤**。
可選 24、48、96 GiB 單 GPU，以及 2×80、8×80 GiB 多卡虛擬主機，
選取 30B / 60B，設定模擬步數與故障復原，產出標記為「純模擬」的 JSON 報告。

在電腦上 clone Vanilla 原始碼後，使用 Python 3.10+ 執行更完整的
**純標準庫、離線、零付費 GPU**虛擬機排程與檢查點流程：

~~~bash
# 預設 1x96 GiB 虛擬 GPU：兩個模型分開排程，每個模擬 20 步
python3 training/octuber-gpu-sandbox/virtual_host.py \
  --models all --host virtual-96 --steps 20 --fault-step 8

# 模擬 1x24 GiB：30B/60B 都無法通過虛擬資源前篩
python3 training/octuber-gpu-sandbox/virtual_host.py \
  --models all --host desktop-24 --steps 20

# 2x80 GiB 不等於 1x160 GiB；60B 在沒有模型分片下不能放置
python3 training/octuber-gpu-sandbox/virtual_host.py \
  --models all --host virtual-dual-80 --steps 20

# 真正保存檢查紀錄（不是 checkpoint 模型權重）
python3 training/octuber-gpu-sandbox/virtual_host.py \
  --models all --host virtual-96 --steps 20 --fault-step 8 \
  --output private/octuber-virtual-host-report.json
~~~

主要邏輯：

- **虛擬資源閘門**：各模型按每張 GPU VRAM、RAM、磁碟需求的粗略實驗前篩；不是實測規格或採購保證。
- **排程**：虛擬工作需要通過閘門才能放置到一個虛擬 GPU 插槽；同一插槽的工作 FIFO 排隊。
- **工作步數**：只是計數器與事件，不執行 30B / 60B 的神經網路 forward/backward。
- **故障注入**：在指定步數中斷、回到前一次「進度元資料」檢查點後續跑，清楚標註沒有 safetensors / optimizer-state checkpoint。
- **60B 特別限制**：即使虛擬記憶體篩選通過，實際 60B MXFP4/PEFT 訓練器仍未驗證，故不能據此上線真正 60B 權重。
- **經審核資料**：可以明確用 --dataset 傳入現有 consent/review JSONL，由同一個 SFT 驗證器檢查。沒提供資料時只模擬虛構工作量，絕不捏造訓練資料。
- **回報**：永遠把 gpu_hardware_accessed、cuda_used、real_large_model_checkpoint_created、large_model_training_completed 標記 false。
- **輸出**：不覆寫既存報告，不呼叫租雲端主機 API，沒有信用卡授權也不會產生費用。

虛擬 GPU 主機不是你真實電腦的顯示卡，也不是遠端雲端資源。
如果之後要做真正的 GPU 訓練，需另外提供已授權的 GPU 環境及人工審核資料。

~~~bash
python3 -m unittest discover -s tests -p 'test_octuber_virtual_host.py'
~~~


## 100,000 次阿土伯式核心沙盤（2026-10-25）

本次為 OCTUBER 30B 和 60B 各執行 **100,000 次微型替身模型的實際 CPU 梯度更新**，
另擴充虛擬主機排程到每個大型模型目標 100,000 個模擬步。
兩者皆不能直接證明 0.6B/30B/60B 神經網路權重訓練完成。

訓練核心與阿土伯 0.6B 保持相同 LoRA 政策來源：
training/atuber/core_contract.py 統一 rank=8、alpha=16、dropout=0.05、
至少 100 筆審核同意的 SFT 資料、至少 5 筆獨立留出樣本及資料來源雜湊。
Atuber 0.6B、OCTUBER 30B 既有訓練器現在都從此政策讀取 LoRA 設定。
**60B 真正 MXFP4/PEFT 模型微調器仍未 CUDA 驗證。**

### 可獨立重現的兩種 100k 演練

~~~bash
# 純排程：30B 和 60B 各 100,000 個模擬步；第 55,005 步故障、續跑
python3 training/octuber-gpu-sandbox/virtual_host.py \
  --models all --host virtual-96 --steps 100000 --fault-step 55005 \
  --output private/octuber-virtual-100k.json

# 真正更新參數：30B / 60B 各一個 72 參數 CPU LoRA 替身模型，各 100,000 次
python3 training/octuber-gpu-sandbox/core_sandbox.py \
  --model all --steps 100000 --output private/octuber-surrogate-100k.json

# 正式語言模型 SFT 仍需自己準備人工授權與審核通過的資料
python3 training/octuber-sumptuous/train.py \
  --dataset private/reviewed-sumptuous-30b.jsonl --validate-only
~~~

### 必須明確區分的結果

- 虛擬主機 100k 訓練排程 **不執行神經網路計算**，沒有使用實體 GPU。
- CPU 100k 梯度測試會真實計算並更新一個 **8 特徵／72 參數**的 LoRA-style 分類替身；使用獨立留出集及合成數值資料，只用來測試核心機制。
- 72 參數的損失下降不是 LLM 能力評測，也不是 0.6B、30B 或 60B 真正的模型權重微調；不得將合成資料誤標為人工核准的訓練資料。
- 核心測試會紀錄更新次數、留出損失、替身 adapter SHA-256，但不下載 Qwen、沒有 CUDA 調度與外部費用。
- 網站的 100,000 選項只執行瀏覽器的排程預覽，不進行 100,000 次大型或小型模型反向傳播。
- 三個正式模型 manifest 皆維持未訓練狀態；真實獨立權重仍需授權資料、GPU 和驗證過的架構訓練器。

~~~bash
python3 -m unittest discover -s tests -p 'test_octuber_core_100k.py'
~~~
