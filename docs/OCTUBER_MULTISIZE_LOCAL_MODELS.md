# October／阿土伯多尺寸本地語言模型（2026-10-25）

## 目前擴充結果

以正式 Qwen3 模型家族為主；這裡的每個 **base model** 指官方基底模型，不是 October 已訓練出的新權重。可使用 Ollama 在使用者自己批准的本地電腦上推論，也可在有足夠 NVIDIA CUDA 資源的本地訓練主機上用 QLoRA 更新**各別**模型的 LoRA adapter。

| 模型 | 官方 Hugging Face 基底 | Ollama 本機標籤 | 量化下載大小約 | 推論角色 |
|---|---|---|---|---|
| 0.6B | Qwen/Qwen3-0.6B | `qwen3:0.6b` | 0.523 GB | 手機既有 WebLLM 0.6B／微型電腦 |
| 1.7B | Qwen/Qwen3-1.7B | `qwen3:1.7b` | 1.4 GB | 低資源筆電 |
| 4B | Qwen/Qwen3-4B | `qwen3:4b` | 2.5 GB | FLATTERING |
| 8B | Qwen/Qwen3-8B | `qwen3:8b` | 5.2 GB | 均衡本地版本 |
| 14B | Qwen/Qwen3-14B | `qwen3:14b` | 9.3 GB | MODEST |
| 30B MoE | Qwen/Qwen3-30B-A3B | `qwen3:30b` | 19 GB | SUMPTUOUS MoE |
| 32B Dense | Qwen/Qwen3-32B | `qwen3:32b` | 20 GB | SUMPTUOUS 大型稠密 |

上表的 GB 指 **Ollama 約略下載檔案大小**，**不是**完整推論 RAM、VRAM 或微調 GPU 需求。上下文記憶體、CPU offload、長序列、背景程序等會額外增加硬體需求。對應官方標籤清單：<https://ollama.com/library/qwen3/tags>。Qwen3 模型結構：https://github.com/QwenLM/Qwen3 。

**沒有官方 Qwen3 60B 的對應標籤**，因此本期不把不存在的「Qwen3 60B」硬套成模型，也不將多台小型模型合併宣稱為單一 60B 網路。後續若增加其他家族，必須獨立登記準確的模型 ID、授權、架構與硬體需求。

## 在你自己的 Ollama 主機上安裝

**以下會真的下載模型，請依磁碟與記憶體選擇，程式沒有自動下載：**

```bash
ollama pull qwen3:1.7b
ollama pull qwen3:4b
ollama pull qwen3:8b
# RAM/磁碟足夠才選：
ollama pull qwen3:14b
ollama pull qwen3:30b
ollama pull qwen3:32b

ollama list
ollama run qwen3:8b "請說明 CREAM 報價統計需要哪些實際執行證據？"
```

模型下載只會將**官方基底模型**裝入 Ollama；不代表已接受 October 的價格知識微調。對話介面：先在設定內填入經授權的自架 Ollama HTTPS 代理或同機 `localhost`，將模型名稱加入清單，按「實際推論測試」。只出現在 `/api/tags` 的模型仍然**不可稱為已就緒**，需要實際 `/api/chat` 產生答案。iPhone WebLLM 和電腦 Ollama 是不同執行環境；Ollama 的 32B 不會下載到手機。

本期將單一主機的模型清單設定上限由 4 個提高到 10 個。原有 `october:sm`、`october:ml`、`october:lg` 別名繼續有效；1.7B 和 8B 使用官方標籤即可，亦可在自架主機由本人建立 `octuber:compact-1.7b` 與 `octuber:balanced-8b` 別名。

快速硬體清點：

```bash
npm run preflight:atuber
```

會列出 **0.6／1.7／4／8／14／30／32B** 的配置、RAM／磁碟估算和 Ollama 清單。這個預檢是唯讀的，不會租用雲端機器、不會下載權重；「可以開始推論檢查」仍**不代表成功推論**。

## 真正更新不同大小模型的語言權重

程式：`training/atuber/multisize_train.py`。只接受人工審核、確認同意與可合法使用的 JSONL，例如 `private/reviewed-atuber.jsonl`，不得拿合成沙盤直接湊數、也不可用網頁私訊冒充經核准完整資料集。

先在不下載模型的 CPU 上檢查：

```bash
python training/atuber/multisize_train.py --model-size 1.7b \
  --dataset private/reviewed-atuber.jsonl --validate-only
```

在**真的有 CUDA GPU 且本機已具備依賴**的主機：

```bash
python -m pip install -r training/atuber/requirements.txt

# 先到 Hugging Face 確認正式基底的 40 位 commit SHA，鎖定權重版本
python training/atuber/multisize_train.py \
  --model-size 1.7b \
  --dataset private/reviewed-atuber.jsonl \
  --base-revision <ACTUAL_40_HEX_HF_COMMIT_SHA> \
  --output artifacts/atuber-1_7b-lora-v1 \
  --train --steps 180 --max-length 512
```

只有在準備好明確批准從官方 Hub 下載該版本的權重時，加上 `--allow-download`；**預設僅使用已快取的官方權重**，不自行觸發遠端下載。換成 `--model-size 4b`、`8b`、`14b`、`30b`、`32b` 時，同時需要對應的官方 HF revision、乾淨的新輸出資料夾與更充足的 VRAM。30B 為 MoE，LoRA 僅作用在已知 attention 模組，不能假定 Dense 模型的專家網路路徑相同。

### 保守 GPU VRAM 前置引導（QLoRA，非規格保證）

| 模型 | 保守訓練顯存引導 |
|---|---:|
| 0.6B | 6 GiB |
| 1.7B | 8 GiB |
| 4B | 12 GiB |
| 8B | 16 GiB |
| 14B | 28 GiB |
| 30B MoE | 48 GiB |
| 32B Dense | 64 GiB |

這些是**預檢門檻與風險提示，不是實測最低規格**。在低於提示值的環境，訓練器會停止，除非明確加入 `--ack-low-vram-risk`；即使加入，仍可能發生 OOM。任何 GPU 型號都必須通過實際載入、梯度更新、保存 adapter 及獨立評測。

實際訓練完成的唯一判準包含 `adapter/adapter_model.safetensors`、`adapter/adapter_config.json`、`training-provenance.json`、基底模型版本、輸入資料 SHA256、真實 optimizer 次數及有限的 train/eval loss。每一尺寸**分別產生自己的 LoRA adapter**；不同尺寸不能把同一份 adapter 改名混用。

輸出的 adapter 還不是能直接給 Ollama 使用的完整 GGUF。後續需將它與**完全相同 commit 的基底權重**合併、轉成 GGUF、量化，再實際在 Ollama 載入驗證；手機 WebLLM 則需要獨立 MLC 轉換與 iPhone 實機測試。上述工序不會因 CI 通過而自動完成。

## 資料與價格能力限制

先前 100 萬次模擬購物、100 萬次工具意圖與 CREAM／Detroit 的本機工具回條，**不是**任何大小 Qwen3 模型的權重更新。自動生成的 180 條價格工具教材仍標為 `reviewed:false`，不得直接用于正式 LoRA。模型的「歷史價格上下限分類 99.525%」也不是近期真實商品估價準確率；更新語言權重不會自動取得新賣家報價。

多尺寸擴充只建立**已核實的模型能力路由與可執行的真實 QLoRA 程式**。當 CUDA、基底權重、人工審核語料與正式回歸測試就緒，才可個別訓練與發行。
