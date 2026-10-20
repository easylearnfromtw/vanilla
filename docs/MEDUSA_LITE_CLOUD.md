# Medusa Lite — Vanilla 自建的免費增量雲端運算模組

## 定位與真實限制

**Medusa Lite 不需要 Google Cloud、Judge0、RapidAPI、Docker privileged mode 或新的 VPS。**
它直接在已部署的 Vanilla WeiGuo Railway 後端運作，因此不會增加一個新的固定月租服務；
但 **Railway 現有費用、免費額度及超額費用仍然存在，不能保證整體永遠 NT$0**。

安全模型不是「任意 Python 隔離執行」。Lite **不執行 Python 位元碼**，
不呼叫 \`eval\`、\`exec\`、\`compile\` 來執行使用者程式，也沒有 shell、檔案、
網路或 Python imports。它只使用 \`ast.parse\` 解析使用者文字，再由 Vanilla
自主實作的白名單解譯器評估特定節點。**這是 Python 的小型子集，不是完整的 Python，
也不是具備虛擬機或 OS 隔離能力的沙盒。** 真正執行完整 Python，仍建議使用專用
Google Cloud Run Sandbox／Judge0 VM，不能使用 Lite 來處理未知第三方套件或任意腳本。

## 支援內容

- \`print(40+2)\`、\`input()\`、字串、布林、整數、小數、基本四則與小型次方
- 單一變數、\`+=\` 等增量指派、\`if/else\`、\`for i in range(...)\`
- \`range\`、\`sum\`、\`min\`、\`max\`、\`round\`、\`abs\`、\`len\`、部分型態轉換
- 限量的列表與 tuple、比較、布林條件、整數索引

**不支援**：\`import\`、\`open\`、\`os\`、\`subprocess\`、\`requests\`、\`eval\`、
\`exec\`、\`getattr\`、屬性存取、類別、函式定義、\`while\`、資料夾操作、
網路操作、遞迴、自動載入第三方套件或完整 Python 標準函式庫。

保護上限：原始程式最多 **4 KB UTF-8**、標準輸入最多 **2 KB UTF-8**、
AST 200 個節點、最多 5,000 個計算步驟、256 次迴圈、最多 4 KB 輸出，
且每次執行設定約 0.5 秒的解譯器執行限制。並行執行受現有
WeiGuo 單一服務的資源與請求配額約束；若未來多節點／商用，
應加入共享限速、服務隔離和負載管理。

## 啟用

GitHub 合併及 Railway 重新部署只是安裝程式。開關 **預設全部為 false**：

\`\`\`dotenv
MEDUSA_ENGINE=lite
MEDUSA_ENABLED=true
MEDUSA_LITE_ENABLED=true
MEDUSA_FAMILY_ENABLED=true
MEDUSA_FAMILY_OWNER_SUBS=<已驗證的 Google OIDC sub；絕對不是 email>
\`\`\`

以 Railway 的 \`weiguo-browser\` 服務作為執行位置，不另行部署任何服務。
只有管理員在 Railway 設定上述參數後才可執行。既有家庭 OIDC
\`role=owner\` 且 \`sub\` 明確列入白名單者才可使用，
每次仍須在 Medusa UI 勾選同意。禁止在 GitHub、公開 PWA、Vite
環境變數公開 Google sub 白名單、使用者憑證或後端金鑰。

**建議先僅在測試帳號／單一 owner 白名單啟用**，觀察既有 Railway
CPU／記憶體與 API 限速，再決定是否放行更多請求。

## 實際測試

從 Vanilla iPhone／PWA 進入 Detroit Studio → Medusa，登入既有
WeiGuo 家庭系統，確認後執行：

\`\`\`python
print(40 + 2)
total = 0
for i in range(5):
    total += i
print(total)
\`\`\`

預期 stdout 是：

\`\`\`text
42
10
\`\`\`

\`import os\` 應回傳 \`Unsupported Syntax\`，不能在衞國後端呼叫
任何 Python host 的 \`os\` API。程式限制／語法錯誤需明確顯示，
不得捏造成功執行結果。

## 既有執行引擎

切換 \`MEDUSA_ENGINE=judge0\` 或 \`cloudrun\` 仍使用既有隔離後端
及其既有驗證條件。Lite 不會直接替代完整 Python 執行環境。
