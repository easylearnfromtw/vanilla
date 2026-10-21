# Hank — Vanilla AI 自動化品質測試

**Hank** 是 Vanilla 的 AI 測試系統名稱；底層使用 **Giskard v3** 測試引擎。原始碼及相容性設定中的 `giskard` 字樣保留，避免改名破壞整合。

## 預設策略

- 每次 PR 至 main，以及直接 push main，先執行**輕量 diff 分類**。
- **重大 AI 修改**才執行 Giskard Checks；小修、CSS、文件或單元測試變更預設略過昂貴流程。
- 分類啟發式：AI 原始碼變更 >=180 行；或至少 3 個 AI 檔案且合計 >=110 行；或新增單一 AI 原始碼檔案 >=70 行。這是負載管理門檻，**不是安全性風險量表**。
- PR 加上 `ai-major` label 可以強制執行；Owner 也能從 GitHub Actions 選 `Hank AI Quality Gate → Run workflow → checks`，即使是小修也測。
- 不以 `ai-minor` label 覆蓋重大變更；真正的大型 AI 提交始終測試。
- 分類器只負責昂貴 Giskard 關卡，**原有 Vanilla CI 和 Quirinus 維持獨立執行**。

## Hank 第一層：Giskard v3 行為迴歸（重大 AI 修改）

使用 `giskard.checks.Suite` 和 `Scenario + Equals`，透過 Node TS loader 呼叫 Vanilla **現有的**任務分類、Taiwan topic、Diana、聊天路由、WebLLM request guard。不是對著 Mock chatbot 測試。

- Python 3.12、Node 22。
- `python -m pip install "giskard>=3,<4"`
- `npm install --no-audit --no-fund`
- `python scripts/giskard-major-checks.py`
- 測試無需外部 API Key、不需執行本地大型模型、不會把對話傳到雲端。
- 輸出 JSON aggregate + JUnit XML；任何失敗、錯誤、跳過、執行數不足都以 nonzero exit code 阻止該 job。
- 這一層僅證明**路由/治理決策**符合固定案例；不驗證模型實際生成答案、模型幻覺或部署中服務的可用性。

## Hank 第二層：Giskard v3 實際模型弱點掃描

Owner 手動從主分支選 `Run workflow → depth: full`；設定完成後也可以使**重大 push main 自動深掃**：

Repository Settings → Secrets and variables → Actions

| 位置 | 名稱 | 值 |
|---|---|---|
| Variables | `GISKARD_LIVE_ENABLED` | `true` 才在重大 push main 自動執行；預設不啟用 |
| Variables | `GISKARD_TARGET_BASE_URL` | 你控制的**HTTPS、OpenAI-compatible**推論端，例如 `https://ai.example.com/v1` |
| Variables | `GISKARD_TARGET_MODEL` | 該推論端已開放的模型 ID |
| Variables | `GISKARD_JUDGE_MODEL` | 供 Giskard 生題/評分的 OpenAI 模型，例如 `gpt-4o-mini` |
| Secrets | `GISKARD_TARGET_API_KEY` | 單獨建立、限制額度與存活時間的 Vanilla 模型測試 Key |
| Secrets | `OPENAI_API_KEY` | Giskard 生成攻擊與 LLM judge 的獨立 key |

- 沒設定完時**不會假裝深掃已通過**；強制手動深掃會失敗並指出缺少的設定。
- 公開 fork PR 只跑不帶 Secrets 的第一層；Secrets 僅交給 main 可信任工作流程，避免 PR 內容外洩金鑰。
- 每次深掃上限 24 個生成案例、最多 2 個平行請求、單次最大輸出 512 tokens；避免測試占滿 Slime 節點。Giskard judge 額外耗 token。
- 目前 live adapter 是**單輪** OpenAI-compatible chat-completions；多輪防護需改為能保留對話狀態的 wrapper 才能測。
- 避免在公開 GitHub Actions artifact 上傳任何真實模型回覆、system prompt 或密鑰；僅上傳匿名彙總統計。
- 使用 `commercial_use=True` 避免混入非商用測資；`DO_NOT_TRACK=1` 關閉 Giskard 遙測。
- 此類由 LLM 評分的結果可能存在不穩定判斷；對失敗案例要人工複核。現階段深掃採 any failure/error 阻斷 workflow，沒有擅自部署。

## Owner 操作

1. 一般細修：正常 PR 即可，昂貴的 Hank / Giskard job 自動不跑。
2. 大幅新增 AI 模組：正常送 PR，Hank 行為迴歸自動跑；合併後在 main 再分類一次 push。
3. 小修希望額外確認：到 Actions 點選 `Hank AI Quality Gate`，選 `checks`；或在 PR 加 `ai-major` 標籤。
4. 需要真實模型弱點測試：先設好上述 Variables/Secrets，然後在 main 選 `full`；必要時開啟 `GISKARD_LIVE_ENABLED`。
5. 結果查看 Actions 的各 job、Summary、匿名 artifact。若要合併前強制擋下大型變更，可在 repo branch protection 要求 `giskard-checks` status，並確認 skip 行為符合保護規則。

參考：https://github.com/Giskard-AI/giskard-oss 、https://docs.giskard.ai/oss/scan/how-to/scan-in-ci 、https://docs.giskard.ai/oss/checks。

Hank 執行結果的 GitHub Actions artifacts：`hank-classification`、`hank-regression-results`、`hank-live-aggregate`。底層執行腳本、JSON/XML 檔名與既有 `giskard-checks` job ID 維持相容。
