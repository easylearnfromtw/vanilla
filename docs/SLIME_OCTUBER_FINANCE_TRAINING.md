# OCTUBER 金融訓練 × SLIME Owner

## 實際整合狀態

SLIME Owner 本機工具已新增 OCTUBER 1996–2026 全球前20大市場 QLoRA 訓練工作台。
程式整合和建置驗證與實際資料匯入、GPU 梯度更新、模型發佈是不同的狀態；沒有任何自動完成訓練的宣稱。

## Owner 使用流程

1. 在本人的 SLIME Owner 安裝版開啟本機工具（--tools），選「OCTUBER 全球20大股市金融 QLoRA／GPU 訓練」。
2. 選擇本機 Vanilla 原始碼目錄，以及不位於公開 Git 儲存庫之內的私密授權資料根目錄。
3. 私密資料目錄必須含 prices/（市場 CSV）、price-rights.json，以及 approved/train.jsonl、eval.jsonl、test.jsonl、approved-provenance.json。
4. 五種模型：0.6B、4B、14B、30B、32B；60B 相容性尚未驗證，禁止執行。
5. 填入基底 Hugging Face 真正的 40 位 immutable commit SHA，選擇16–5000步，模型下載預設關閉。
6. 先按「檢查 20 大市場與 GPU 前置條件」，會執行合法來源驗證、資料雜湊、時序隔離、readiness.py和 train_tiers.py 的唯讀計畫檢查。CUDA 及VRAM不足會拒絕啟動。
7. 本人需分開核准 GPU 費用、資料訓練權利、模型授權條款，再經第二次本機確認後才能啟動固定路徑 QLoRA 訓練程式。
8. 啟動回條僅代表程序建立；完成後應在該次 weights 目錄下找到 adapter/adapter_model.safetensors 與 training-provenance.json。
9. 按「檢查已產生的金融 Adapter（唯讀）」呼叫原有金融 release_gate.py 驗證SHA與來源回條；即使通過，仍需要獨立金融盲測及發布審核。

## 沙盤中心與可執行狀態

沙盤中心新增 octuber-finance-plan，使用固定參數 --tier all 只產生計畫，不下載、不更新權重。
真正訓練不經過此沙盤入口，而是在本機 Owner 專用金融視窗另外逐項核准。
Friend、Telegram 和未配對裝置都不能遠端啟動這些訓練。

## 本機資料樹

    PRIVATE-DATA-ROOT/
      prices/
        <market-id>.csv
      price-rights.json
      approved/
        train.jsonl
        eval.jsonl
        test.jsonl
        approved-provenance.json

資料檔案格式、權利聲明及時序規格詳見 training/octuber-finance/README.md。
不要使用無授權的新聞全文、FRED/ALFRED 資料或自行生成的假行情當真實訓練集。

## 安裝包與權限

Windows Owner 安裝檔含 finance_training 與 finance_training_window 兩個模組；Friend 安裝檔不含它們。
macOS 與 Linux 的 Friend 安裝壓縮檔也排除兩個金融工具檔。
公用 Slime 配對網站不存放 API 密鑰，不具備執行訓練功能。
進程使用無 shell 的固定指令與預設禁止權重下載，訓練日誌只留在 Owner 選定的本機目錄。

## 合成回歸測試

    python3 -m unittest discover -s tests -p 'test_slime_finance_training.py' -v
    python3 -m unittest discover -s tests -p 'test_slime_sandbox_center.py' -v

以上測試使用合成資料、模擬 CUDA 與 mock 程序，不能代替實際金融資料導入或 GPU 微調。
SLIME 安裝包建置成功不代表已有 Slime 正式 release tag。
