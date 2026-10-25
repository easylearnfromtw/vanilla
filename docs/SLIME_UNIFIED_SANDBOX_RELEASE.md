# SLIME Owner：本機 AI／沙盤中心使用與正式發布

## 這個版本包含哪些沙盤？

由最新 Vanilla `main` 封裝，含 **17 項已納管、需本機 Owner 確認才能執行的實驗**：

- 底特律／阿土伯：五維 Penteract 1,000 萬次合成 SGD 投影器；
- 30B／60B：GPU 容量規劃、小型 CPU／CUDA 梯度沙盤、虛擬主機排程、100,000 次小參數機制演練；
- 柳岸書城：書目索引、書名 100 萬次、授權正文 100 萬次、模糊檢索 100 萬次及兩種開放資料試驗；
- 霞海書院：符合來源與授權檢核的 arXiv 論文試驗；
- October：100 萬次模擬真人購物、價格區間小神經模型；
- 阿土伯：未審核語言教材草稿、七種尺寸的 GPU／QLoRA 正式訓練條件預檢。

**此數量是已登記的本機實驗，不是 17 個完成訓練的語言模型。** 其他沙盤腳本也會被找出並列為「未納管」，直到有明確輸入、執行權限與評估依據前，不會擅自執行。未經許可的書籍／論文全文、個人訓練資料、模型權重都不會被封裝進公開套件。

## 下載（Owner 版本）

正式安裝來源：[SLIME GitHub Releases](https://github.com/easylearnfromtw/vanilla/releases)。每次更新以最新版 Release 的檔名及 `SHA256SUMS.txt` 為準，不能用舊版宣稱更新成功。

### Windows

在**同一個資料夾**放入 `Slime-Owner.exe` 和 `Slime-Owner-Tools.cmd`，雙擊 **`Slime-Owner-Tools.cmd`** 即可開啟本機工具視窗；或在 PowerShell 執行：

```powershell
.\Slime-Owner.exe --tools
```

建議先確認兩個檔案的 SHA-256：

```powershell
Get-FileHash -Algorithm SHA256 .\Slime-Owner.exe
```

首次開啟可能因為安裝包未簽章而出現系統安全提示；請自行核對下載來源與簽章／校驗值，不要直接關閉系統安全機制。雙擊 `Slime-Owner.exe` 而不加參數，仍然走原有 SLIME 連線／配對流程，**不會自動跑沙盤**。

### macOS

先解壓 `Slime-Owner-macos.zip`，在檔案總管使用 `Slime-Owner-Tools.command`，或在終端機執行：

```bash
cd /path/to/Slime-Owner
./Slime-Owner-Tools.command
```

需要 `python3` 並允許系統建立 Tk 視窗。首次執行時依 macOS 的安全流程自行驗證檔案來源；此套件沒有 Apple 官方簽章／公證。

### Linux

解壓 `Slime-Owner-linux.tar.gz`，從終端機執行：

```bash
./start-slime-tools.sh
```

需要 Python3、Tkinter 與圖形桌面（未安裝者依發行版安裝 `python3-tk`）。如為純伺服器，則可使用唯讀盤點：

```bash
python3 services/slime/sandbox_center.py --repo . --list
```

### 跨平台沙盤原始碼

另下載 `Slime-Sandbox-Toolkit.zip` 並**單獨解壓**，在 SLIME Owner 沙盤中心選取解壓後的 `Slime-Sandbox-Toolkit` 目錄。它是沙盤原始碼與規則，不是獨立安裝程式；依需要安裝 Node.js 22、Python3、Ollama 或 CUDA 訓練套件。可用檔案和缺少的資料會在盤點中逐項顯示。

要執行有輸入要求的沙盤，需主動指定本機 **CSV、SQLite** 或 arXiv ID。大型訓練需另勾選高負載同意、連網試驗需另勾選連線同意，最後再確認。程式將產生獨立的日誌及報告資料夾；**只顯示啟動成功並不代表已訓練完成**。所有受控任務固定腳本參數，不支援從聊天或配對節點下傳 shell 指令。

## 權重與部署範圍

- SLIME 的 QLoRA 工具是 Owner 本機管理入口，基底模型包含 Qwen3 0.6B、1.7B、4B、8B、14B、30B MoE、32B Dense；本套件**沒有下載它們或更新任何 Qwen3 語言權重**。
- 五維、小型書名、價格區間模型的沙盤更新與 Qwen3 本體權重完全分開計數。
- 公開包不包含商業比價網站當日報價、客戶資料、未授權正文或私人 API Key。
- Friend 版不包含 Owner 工具捷徑；在本機執行需使用有權限的 Owner 版本。任何遠端 Slime Friend 配對／網路分享不會啟動上述操作。
- Release 是提供可下載套件，**不代表已靜默安裝至任何使用者電腦或已完成模型微調**。
