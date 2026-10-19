# NOODLES Teacher Learning v0.2 | Vanilla 跨模型知識蒸餾

## 核心概念
Vanilla 不再把「其他 AI 說了什麼」一律當答案或訓練真理，而是將*經使用者明確選擇、允許訓練使用、通過基本隱私篩選*的內容轉成案例。NOODLES 分兩個層級改善：

1. **全 Vanilla 共用層：立即生效。** 原 v0.1 跨模型觀察、信心收縮的路由調整、回覆品質指引保留。本次新增可選擇的跨供應商 `teacherStyleHint`：從使用者挑選過的比較答案擷取一個短範例，只供其餘授權模型參考呈現風格，不能當事實、引用或機密指令。使用者沒允許就不呼叫。
2. **可訓練權重層：獨立 GPU 作業。** 使用者先在聊天內啟用 TEACHER 功能，從**主動挑選的勝出雙模型答案**建立 `prompt/chosen/rejected` DPO 訓練對，或用明確按讚答案建立 `prompt/completion` SFT 訓練樣本。輸出 JSONL，從你控制的 GPU（NVIDIA CUDA 或 Apple Silicon MPS）使用 `training/noodles_train.py` 真正執行 LoRA adapter 微調。必須經過獨立評估與你確認後，才會手動載入可支援的本地服務。不會自行替換 Apple WebLLM GPU 權重。

**只有第二步真正在 GPU 進行訓練，才叫更新模型權重。** 一般網站即使每次回話收集資訊，也不會直接重訓 Gemini、DeepSeek 或其他遠端基礎模型的權重。

## GitHub 參考設計
- Hugging Face [TRL](https://github.com/huggingface/trl) 的 SFTTrainer、DPOTrainer 專門將監督樣本／人類偏好轉成後訓練流程。
- Hugging Face [PEFT](https://github.com/huggingface/peft) 的 LoRA：凍結多數基礎模型權重，只訓練少量適配器參數，便於儲存與回滾。
- [Distilabel](https://github.com/lightonai/distilabel) 的合成資料品質篩選理念：使用更多生成資料不保證回答更好，須評估、篩選與審核。此專案已表明原維護團隊目前不積極開發，因此僅參考理念。

## 實際功能（此 PR）
- **對話中新增 NOODLES TEACHER 設定介面**，預設禁用所有完整回答的儲存。使用者必須勾選合法訓練權利，才能另外打開自動收錄「主動挑選／按讚」的答案；私密模式禁止收錄。
- **資料來源追溯**：標記來源為 local／ollama／gemini／deepseek 與模型名稱、任務種類、使用者的選擇方式。沒有把模仿模型的輸出偽裝成網頁已驗證事實。
- **安全規則**：每筆對話資料上限約 5000 字元、個資與常見秘密形式阻擋、重複指紋檢查、最多 60 筆、90 天資料壽命、可刪除，未登入使用當次 session 儲存。
- **SFT／DPO 各提供 train 與 eval** 四種 JSONL 下載；相同原始問題的雜湊分配到固定集合，避免明顯的 prompt-level train/eval 洩漏。
- **全模型策略層**：經額外明確開啟「跨模型回答風格參考」，Vanilla 已批准的雲端／本地模型可使用一筆短例子作答；不會直接轉送整個訓練資料庫。沒有啟用就完全不送。
- **本地 LoRA 訓練程式**：`training/noodles_train.py` 明確指令 `--check-only` 與 `--run-training`；只在有 GPU、足夠樣本及訓練／評估資料不重疊時執行。使用 TRL 與 PEFT，儲存本地 adapter、評估指標與本地 manifest，**沒有自動上傳 Hugging Face，也沒有自動更換正式模型**。

## 在 Vanilla 的使用
1. 進入 Vanilla 的聊天頁面，展開 **NOODLES TEACHER**。
2. 審閱並確認「已擁有合法訓練使用權」；請確實核對使用的每個 AI 供應商的服務條款。若未授權、輸出受限制或含第三人個資，**不得收錄**。
3. 開啟「自動收錄我主動選擇／按讚的答案」；這不是自動蒐集所有對話，而是僅當你明確主動給出人類偏好訊號時才收錄。
4. 在兩模型比較中選一個較佳回答，有兩個都完成時記錄一筆 DPO 偏好。對普通回答按讚則記錄一筆 SFT。
5. 審核、刪除有問題的資料；選擇匯出 `SFT train/eval` 或 `DPO train/eval`。
6. **先在有 GPU 的電腦執行資料驗證，再手動執行訓練**（見下方）；建議先至少數十到數百筆高品質資料，不要以十幾筆就宣稱模型優化有效。
7. 以保留測試案例和實際任務 A/B 比較 base 與 adapter 的正確率、格式、延遲、記憶、來源品質等，確認有改善後再人工決定部署。

## GPU LoRA — 可執行範例

安全、免費的資料驗證（無訓練／無 GPU）：

```bash
python3 training/noodles_train.py --mode sft \
  --train noodles-sft-train.jsonl --eval noodles-sft-eval.jsonl --check-only
```

在擁有本地 GPU 的電腦（**不是 iPhone Safari 或 GitHub Pages**）：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r training/requirements-noodles.txt
python3 training/noodles_train.py --mode sft \
  --train noodles-sft-train.jsonl --eval noodles-sft-eval.jsonl \
  --model Qwen/Qwen2.5-0.5B-Instruct \
  --output ./adapters/noodles-sft --run-training
```

DPO 用 `--mode dpo` 及 `noodles-dpo-train/eval.jsonl`。訓練前需先確認模型授權允許微調。不同 Hugging Face、TRL、PyTorch、Apple MPS 版本可能需要調整相依套件，此 PR **沒有在 GPU 上完成真實訓練試跑**。

訓練完成的 adapter 並不能直接在網頁 WebLLM 或 Ollama 上無條件套用；需依基礎模型格式執行合併、量化及適用推論 Runtime 的轉換與相容性測試。**本 PR 沒有實作自動上傳權重、跨所有供應商的原生權重訓練或模型熱更換。**

## 重要限制
- **不能保證越訓越聰明**：教師模型可能幻覺、使用者可能挑錯，訓練資料分布也可能偏移，須有不參與訓練的客觀基準、回歸評估與人工 rollback。
- **模型輸出權利**：各服務商對生成輸出之使用權不同；請確認被選答案合法使用於你的下游訓練；不得未經許可大量蒐集與蒸餾受限制模型。
- **本機資料並非加密**：本版本受明確選擇保護，但儲存在瀏覽器 localStorage，不適合私人醫療／財務、識別資訊或機密文件；專業資料必須另建加密儲存／細緻權限，不能因資料有價值就自動收錄。
- **不同家庭成員**：目前只依已登入的 Google 帳戶儲存命名空間；同帳戶多人使用時**無法保證家庭身分隔離**，應改用獨立帳戶。
- **每次對話立即有效的改善**限於原有 NOODLES 模型評分／路由、同意之後的短例子策略；不是每回合自動啟動 GPU 權重更新。
- GitHub Pages PWA 只提供資料策展與匯出功能；需要有真正的 GPU 服務才能讓可訓練的模型從範例更新權重。

## 驗收範圍
- 前端 + node 測試：私密模式防收錄、合法使用權、壞資料拒收、同題去重、固定 split、JSONL 標準結構、既有 NOODLES 路由與 System Prompt 回歸測試。
- Python CI：訓練程式語法編譯與不依賴 GPU 的 SFT／DPO JSONL `--check-only`。
- GitHub Pages 正式版：聊天中可以打開 TEACHER、審核資料與實際下載格式正確的 JSONL。
- **尚未驗收**：個人帳號實機存取、GPU 真實微調、訓練後模型推論、性能提升、提供商授權審核。
