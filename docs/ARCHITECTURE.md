# Vanilla AI 架構（2026-10-19 · v0.2.0 實況）

Vanilla 是家庭自用、iPhone 優先的 PWA（React 18 + Vite 6 + TypeScript），部署在 GitHub Pages 的 `/vanilla/`。
沒有自建後端；模型與資料來源都由使用者自行授權。本文件描述**目前程式真正做的事**，規劃中的功能另外標示。

## 1. 介面層
| 檔案 | 角色 |
| --- | --- |
| `src/App.tsx` | 外殼：側邊抽屜（工作空間／工具／最近對話）、液態玻璃頂欄、手機底部 Tab bar、各頁面延遲載入（`React.lazy`） |
| `src/ui/TabBar.tsx` | 浮動玻璃 Tab bar：點選或「按住拖曳膠囊」切換；往下捲自動縮小；鍵盤開啟時隱藏 |
| `src/local-ai/LocalChat.tsx` | 聊天主畫面：模型膠囊、一般／私密分段控制、`/` 指令選單、附加資料開關、工具卡片、停止生成 |
| `src/local-ai/ChatHome.tsx` | 空白對話首頁：主視覺 V、四大工具、最近對話、模型狀態卡 |
| `src/settings/SettingsPage.tsx` | 設定頁分區（帳號、模型、模型調校、語氣、外觀、系統） |
| `src/theme/vanilla-bauhaus.css` | 設計系統（見 `docs/UI_BAUHAUS_GLASS.md`） |
| `src/pwa/ios-viewport.ts` | iOS 鍵盤／可視區域、standalone 偵測、持久儲存申請 |

## 2. 對話與工具串聯
```
使用者輸入
  └─ expandSlashCommand()      /搜尋 /讀 /記住 /表格 /分析 /建立 /改程式 /私密 /新對話 /功能
      └─ routeMessage()        src/assistant/chat-router.ts（純函式、有測試）
          capability → CREAM 文字/CSV → 開啟頁面 → 圖型切換 → 保存對話 → 自我檢查
          → 指名檔案 → 附件庫 → app 指令（記憶/表格/專案/串接）→ 網頁閱讀 → 搜尋（明確/自動）
      └─ executeIntent()        表格儲存格修改、其餘 app 指令
      └─ routeTail()            Self-Build CODE / 新增功能
      └─ answerWithModel()      模型回答（見第 3 節）
```
- 每個工具結果都寫入 `ChatTurn.tool`（id／狀態／細節），畫面以統一的工具標籤呈現。
- 模型回答會記錄 `contexts`（這次附上了哪些資料）與 `notice`（節錄、備援、停止等誠實說明）。
- 私密模式下，網路搜尋、網頁閱讀、Drive、GitHub 都在路由層直接擋下（`private-blocked`）。

## 3. 模型層
| 檔案 | 角色 |
| --- | --- |
| `src/ai/model-profiles.ts` | 每個模型家族的上下文長度、品質等級、思考開關、各任務取樣參數；本地模型目錄；雲端建議模型 |
| `src/ai/generation-config.ts` | 把 profile × 任務轉成 WebLLM／Ollama／Gemini／DeepSeek 的實際請求參數 |
| `src/ai/context-budget.ts` | token 估算、依預算組合「問題＋附件＋網頁＋記憶＋專案＋CREAM」，節錄必附說明 |
| `src/ai/prompts.ts` | 系統提示詞：大模型完整版、手機小模型精簡版、結構化（JSON）版 |
| `src/ai/output-cleanup.ts` | 移除 `<think>`、偵測並截斷重複輸出 |
| `src/ai/stream-parsers.ts` | NDJSON／SSE 串流解析 |
| `src/ai/zh-tw.ts` | OpenCC 簡→繁（臺灣用語），延遲載入，程式碼區塊不轉換 |
| `src/ai/model-orchestrator.ts` | 候選模型、排序（profile 先驗 + 你的投票/評分 + 健康度 + NOODLES + TAIDE 優先）、生成與備援 |
| `src/local-ai/engine.ts` | WebLLM：延遲載入、Web Worker 推論（失敗自動退回主執行緒）、只自動載入已快取模型 |
| `src/vault/providers.ts`、`src/ai/ollama.ts` | Gemini／DeepSeek／Ollama 串流呼叫與參數 |

詳細調校值見 `docs/MODEL_TUNING.md`。

## 4. 資料與儲存
| 資料 | 位置 | 備註 |
| --- | --- | --- |
| 目前對話 | localStorage（依 Google 帳號 + 一般/私密分開） | 私密對話只在本機 |
| 過去對話 | IndexedDB `vanilla.chat.archive.v1` | 「新對話」先封存再清空；每帳號每模式最多 40 段 |
| 附件 | IndexedDB `vanilla.chat.attachments.v1` | 私密模式不寫入 |
| CREAM 長期資料 | IndexedDB `vanilla.cream.history.v1` | 每帳號上限 3,000 份快照 |
| Drive 記憶／工作區 | Google Drive「Vanilla Workspace」資料夾（`drive.file` 權限） | 家庭自用決定：明文 JSON，不另加密 |
| 聊天同步（選用） | Drive appDataFolder | 明文；衝突時停止覆寫；「新對話」只覆寫本裝置自己的快照 |
| API 金鑰 | Drive appDataFolder | 明文（設定頁有警告） |
| 手動加密備份 | Drive appDataFolder | AES-GCM + PBKDF2 60 萬次 |

啟動後會向瀏覽器申請 `navigator.storage.persist()`，降低 iOS 自動清除本機資料的機會（仍建議定期備份）。

## 5. 外部服務（需自行部署／授權）
- `services/web-research-worker`：Brave 搜尋 + 網頁擷取（臺灣繁中優先）。
- `services/self-build-github-worker`：只能開 Draft PR 的 GitHub 閘道。
- Ollama（家用主機）、Gemini、DeepSeek：使用者自備。

## 6. 已知限制
- 所有 `easylearnfromtw.github.io/*` 專案共用同一個網域（localStorage／IndexedDB 互通）。家庭自用可接受；若日後公開，建議改用獨立網域。
- 家庭成員隔離依靠「各自的 Google 帳號」，不是伺服器端權限系統。
- Web Worker 推論、iOS 鍵盤處理、各雲端模型的新參數已依官方文件實作並有單元測試，但**尚未在實機與真實 API 上驗證**。
