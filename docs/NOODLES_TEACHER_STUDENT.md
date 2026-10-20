# NOODLES Teacher–Student Distillation（可執行流程）

**狀態：程式可執行；預設不產生教師資料、不訓練、不下載模型、不上傳、不部署。**
本文件只使用獲准的原創資料或可合法微調的開放權重模型輸出。OpenAI、Gemini、DeepSeek、Claude 等第三方供應商的回覆 **不可在未核對條款與取得授權前自動拿去蒸餾**。

## 工作方式

\`\`\`text
可合法使用的題目／證據 → 本機 Ollama 教師產生候選稿（選用）
                          ↓
                 人工核對內容、個資與授權
                          ↓
             NOODLES 資料驗證／重複與相似題檢查
                          ↓
            固定排序的 train / held-out eval 分割
                          ↓
             RTX/Apple Silicon LoRA/SFT 訓練
                          ↓
           原模型與 adapter 的本機同題生成
                          ↓
             人工盲測／分數與不支持主張記錄
                          ↓
                只生成評估報告（無自動發布）
\`\`\`

## 0. 環境與硬體

- 先在專用 Python venv 安裝依賴：\`pip install -r training/requirements-noodles.txt\`。
- 需要 CUDA 4-bit QLoRA 才另外安裝：\`pip install -r training/requirements-qlora.txt\`。
- **RTX 3050 筆電 6GB**：先用 Qwen2.5 0.5B、512 token、batch=1；1.5B 的 NF4 QLoRA 可以嘗試，但是否會 OOM 與實際 GPU、driver、CUDA、Windows/Linux 組態有關，不能保證。
- Apple Silicon Mac：可以評估非量化 LoRA/MPS，但本專案的 \`--qlora-4bit\` 只允許 CUDA。Pi 4 和 iPhone 上不執行 GPU 訓練。
- 所有模型必須先核對模型卡授權。下載權重不是訓練授權的替代。

## 1. 本機教師生成候選（可選）

先建立 \`training/data/questions.jsonl\`（此資料夾已加入 .gitignore），每行是一個物件，例如：

\`\`\`json
{"question":"請比較平均數和中位數在偏態資料的差異","context":"數值為 1、2、3、4、100；平均數為 22，中位數為 3。","task":"analysis"}
\`\`\`

先在**自己的電腦**啟動 Ollama、手動取得已核對授權的開放權重教師模型，再執行：

\`\`\`bash
python training/noodles_distill.py draft \
  --questions training/data/questions.jsonl \
  --output training/data/drafts.jsonl \
  --model qwen2.5:7b \
  --ollama http://127.0.0.1:11434 --ack-local-license
\`\`\`

只支援 loopback HTTP Ollama，拒絕外網、憑證、URL 重新導向；一次最多 25 題。這一步**不使用任何遠端付費教師模型**。輸出全部標記 \`reviewed:false\`、\`rights_confirmed:false\`、\`approved_answer:""\`，**不能直接訓練**。

## 2. 人工審核及資料權利

請對每一題檢查問題、參考資料、答案、授權及潛在敏感資訊，完成一份 \`training/data/reviewed.jsonl\`。例如：

\`\`\`json
{"question":"請比較平均數和中位數在偏態資料的差異","context":"數值為 1、2、3、4、100；平均數為 22，中位數為 3。","task":"analysis","draft_answer":"平均數是 22、中位數是 3。","approved_answer":"此例的平均數為 22，中位數為 3；極大值會拉高平均數，但中位數受單一極端值影響較小。","reviewed":true,"rights_confirmed":true,"license_note":"本例由作者原創且同意用於本機訓練","source":"human-authored","teacher_model":"human"}
\`\`\`

允許的來源：\`human-authored\` 或 \`local-open-weight\`；若是教師輸出需填入真實的本地模型 ID 和可合法使用的授權說明。**不能**單靠模型自評分數通過人工審核。資料中如包含個人醫療紀錄、帳密或第三方私有對話，不應匯入；內建敏感字樣檢查不是完整個資去識別技術。

資料至少 13 筆才能正式分出 10 筆訓練 + 3 筆測試；實務上建議至少數十至數百筆，且應有真正多樣化題型，避免只記住某個答案。

\`\`\`bash
python training/noodles_distill.py prepare \
  --input training/data/reviewed.jsonl \
  --train training/data/sft-train.jsonl \
  --eval training/data/sft-eval.jsonl \
  --manifest training/data/distillation-manifest.json
\`\`\`

\`prepare\` 會拒絕近似重複題、未審核答案、明顯秘密/個資與來源不明資料；依 prompt 的 SHA256 固定分割。輸出使用禁止覆寫模式。注意：**這不是事實查核引擎**，人工審核仍不可省略。

## 3. 訓練：標準 LoRA 或 4-bit QLoRA

第一次建議從 0.5B LoRA 開始，並讓模型權重事先下載到自己主機快取。預設離線（\`HF_HUB_OFFLINE=1\`）。若尚未下載，需自行核對模型授權，再明確帶 \`--allow-model-download\`。

\`\`\`bash
python training/noodles_train.py --mode sft \
  --train training/data/sft-train.jsonl \
  --eval training/data/sft-eval.jsonl \
  --model Qwen/Qwen2.5-0.5B-Instruct \
  --output adapters/noodles-distilled-v1 \
  --epochs 1 --max-length 512 \
  --ack-model-license --run-training
\`\`\`

在**已安裝相容 bitsandbytes/CUDA** 的 RTX 3050 上，可改用：

\`\`\`bash
python training/noodles_train.py --mode sft \
  --train training/data/sft-train.jsonl \
  --eval training/data/sft-eval.jsonl \
  --model Qwen/Qwen2.5-1.5B-Instruct \
  --output adapters/noodles-distilled-qlora-v1 \
  --epochs 1 --max-length 512 --qlora-4bit \
  --ack-model-license --run-training
\`\`\`

本流程只儲存 adapter，不擅自推送 Hugging Face。輸出 manifest 包括資料 SHA256、模型、loss、\`deployment_status: not_deployed\`，但 loss 降低不等於事實準確率提高。4-bit 目前只支援 SFT，不支援未驗證的 DPO 量化路線。

## 4. 比較真正的原模型與 LoRA 模型

\`\`\`bash
python training/noodles_infer.py \
  --eval training/data/sft-eval.jsonl \
  --adapter adapters/noodles-distilled-v1 \
  --model Qwen/Qwen2.5-0.5B-Instruct \
  --output training/benchmark/ab-review.jsonl \
  --run-inference
\`\`\`

如果訓練時使用了 \`--qlora-4bit\` 並且在 CUDA 上評估，可加入 \`--four-bit\`。這個指令從同一組保留題目依序生成 baseline 與 adapter 答案，輸出仍標記 \`reviewed:false\`，**沒有自動打分或宣稱勝利**。

獨立人工評分每個答案 0–4 分：0=錯誤／無法用，1=重要錯誤，2=部分正確，3=大致正確，4=正確完整；並標示每一個版本是否有無證據的具體主張，填入 \`baseline_score\`、\`tuned_score\`、\`baseline_unsupported\`、\`tuned_unsupported\`，最後填 \`reviewed:true\`。評測人的評分仍可能有偏差，建議盲評與複核。

\`\`\`bash
python training/noodles_benchmark.py report \
  --eval training/data/sft-eval.jsonl \
  --train training/data/sft-train.jsonl \
  --scores training/benchmark/ab-review.jsonl \
  --output training/benchmark/report.json
\`\`\`

若只想先建立評分表（沒有實際模型）：

\`\`\`bash
python training/noodles_benchmark.py template \
  --eval training/data/sft-eval.jsonl \
  --output training/benchmark/blank-review.jsonl
\`\`\`

報告只包含統計與 SHA256，**不會回傳原始提問與答案**。若測試少於 10 題、改良平均分小於 0.25、增加無證據主張，或有嚴重倒退，則不會列為可供人工發布審查。就算達標，也只會設 \`eligible_for_manual_release_review:true\`，**不會自動安裝 adapter、推送雲端或替換 Vanilla 模型**。

## 5. 測試與限制

不用下載模型或 GPU 即可在 CI 執行：

\`\`\`bash
python3 -m unittest discover -s tests -p 'test_noodles_*.py'
python3 training/noodles_distill.py prepare --input training/data/reviewed.jsonl --check-only
\`\`\`

資料準備與評分程式可運作，不代表已完成真實 0.5B/1.5B 的訓練或在 iPhone WebLLM 直接載入 adapter。**PEFT adapter 不等於 WebLLM MLC 打包權重**，若要載入網站本地模型，需要另外經過授權檢查、模型合併／量化／MLC 編譯、GPU 相容性測試與 PWA 發布驗證。現階段**不會**自動把 LoRA 發布到網頁。
