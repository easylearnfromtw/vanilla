# October／阿土伯：語言模型 LoRA 權重更新流程

## 目前狀態（2026-10-25）

`models/atuber/manifest.json` 仍為 `bootstrap-only`。手機使用的是 Qwen3-0.6B 基底的 WebLLM，正式站沒有已經完成訓練、合併和部署的獨立阿土伯語言權重。

這個開發分支**沒有宣稱已更新 Qwen3 權重**。先前一百萬次購物沙盤、一百萬次工具意圖判斷與 CREAM／Detroit 本機呼叫回條，並不是 Qwen3 0.6B 的 optimizer steps。先前的獨立小型價格區間模型也不是大型語言模型的 LoRA adapter。

## 第一步：建立可人工審查的語言教材草稿

```bash
python training/atuber/price_tool_sft_candidates.py \
  --output private/atuber-price-tools-candidate.jsonl
```

產生 30 種情境 × 6 種不同問法，共 180 條**由程式生成的候選教學對話**，涵蓋：

- 台灣價格來源新舊、商品規格、運費、促銷、商家去重、幣別與來源歸屬；
- BigGo、飛比、LBJ 等資料入口與蝦皮／酷澎等實際銷售平台的區別；
- CREAM 計算是否真的執行、Detroit 是否真的授權、唯讀工具回條；
- 必須棄權的越權呼叫、沒有實際店家報價時不得聲稱已查價；
- 真正語言權重更新證據與只做 100 萬次沙盤的差別。

所有草稿一律為 `reviewed:false`、`consent:false`、`source:candidate-generated`，所以**無法用於正式 QLoRA 訓練**。它們不包含對方網站實際報價、私訊或客戶紀錄，也不是 180 筆真實的人類購買標籤。大量複製這些草稿只會放大重複樣本，不會形成一百萬筆可靠語言教學資料。

## 第二步：人工審閱，形成正式私有 JSONL

需要逐筆校對內容、授權、繁體中文風格、資料品質與模型期望回覆，移除未獲授權內容和重複情境。只有在**實際完成審查且擁有資料權利**後，才能將合法資料保存為 `private/reviewed-atuber.jsonl`，依驗證器要求提供：

`id,user,assistant,domain,source,reviewed,consent`。

`source` 僅允許 `authored` 或 `consented`；合法審核並不意味可以自稱得到第三方網站完整 AI 訓練授權。**不能用自動程式將草稿全部改成 reviewed=true/consent=true。**

腳本必須通過：

```bash
python training/atuber/train.py \
  --dataset private/reviewed-atuber.jsonl --validate-only
```

現有政策要求至少 100 條真正經審核、合法的對話，並保留足夠獨立測試。這次增加 `pricing` domain，並把 id 中 `__` 前的相同任務家族放在同一資料分組，避免同題不同問法互相洩漏。

## 第三步：在已授權的 CUDA 訓練主機實際更新語言權重

此環境沒有 CUDA GPU，也沒有本機 Qwen3 原始權重及完整 QLoRA 訓練依賴。因此不能在本對話完成 Qwen3 實際 LoRA 梯度更新。

在**擁有人核准且有足夠 CUDA VRAM 的主機**安裝所需套件後，執行：

```bash
python -m pip install -r training/atuber/requirements.txt

python training/atuber/train.py \
  --dataset private/reviewed-atuber.jsonl \
  --output artifacts/atuber-price-cream-detroit-lora-v1 \
  --train --steps 180 --max-length 512

python training/atuber/merge.py \
  --adapter-root artifacts/atuber-price-cream-detroit-lora-v1 \
  --output artifacts/atuber-price-cream-detroit-merged-v1
```

`train.py` 使用真正的 Qwen3-0.6B NF4 QLoRA：LoRA ranks、梯度更新、完成部分 loss、GPU 梯度累積與獨立驗證。這次把訓練資料整理成 `prompt` + `completion`，使用 `completion_only_loss=True`，降低依賴基底 chat template 的 assistant mask 相容性風險。

**實際更新權重的證據**應包含：`adapter/adapter_model.safetensors`、`adapter/adapter_config.json`、`training-provenance.json`、明確的基底模型和資料集 SHA-256、訓練／驗證 loss，以及與原版 Qwen3 和既有 October 主控的對照結果。沒有這些就必須標示「未訓練」。

## 第四步：發布前的真實驗收

語言模型的評估與價格分類的「已知區間判斷 99.525%」不是同一回事。至少要量測：

1. 不捏造 CREAM／Detroit 的成功回條或遠端授權。
2. 採用已驗證的實際商品名稱與規格，不將比價站誤列為商家。
3. 對舊價格、缺少運費／時間、授權不完整能適當棄權。
4. 在未見過的商品與問法上與未微調 Qwen3 0.6B 比較。
5. 變更模型在 WebLLM／Ollama 確實部署、能產生推論及可回滾。

直到這些檢查通過，**不修改 `models/atuber/manifest.json` 的 `bootstrap-only`、不把 LoRA 冒充完整 0.6B 權重、也不在正式網站宣稱已完成獨立微調**。手機 WebLLM 還需要獨立的 MLC 轉換與 iPhone 端實機測試；Ollama 的 GGUF 不能直接當成 WebLLM 權重。

## CI 驗證不等於訓練

`.github/workflows/octuber-language-sft-preflight.yml` 僅執行 CPU-only 的 JSONL 資料品質、程式語法、安全邊界和候選教材檢查，確認未審核草稿**無法**通過正式訓練驗證。CI 不下載 Qwen3 權重、沒有 GPU 訓練也不製造假的 safetensors 模型。通過此 CI 只能宣稱**訓練準備流程已驗證**，不能宣稱語言權重已更新。
