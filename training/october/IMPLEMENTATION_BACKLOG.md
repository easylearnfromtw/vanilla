# October｜可執行工程 Backlog（Q50 D）

> **規格決策：49 confirmed、Q24 skipped。** 此 Backlog 是候選工程工作拆解，並非已完成發佈或自動創建的 GitHub Issues。對照：[產品路線圖](ARCHITECTURE_DELIVERY_PLAN.md)、[需求追蹤矩陣](REQUIREMENTS_TRACEABILITY.md)、[完整決策](DECISIONS_50.md)。

## 執行順序、成本及風險

- **P0＝系統可信核心與安全門檻**：無授權後端、Owner 權限或真實 Verifier 不可解鎖後續付費／第三方／高權限功能。
- **P1＝直接提升個人使用價值**：長期記憶、RAG、Slime 真實節點測試、文件與圖表、受權提醒、視覺辨識。
- **P2＝大規模與商業功能**：企業 SSO／SCIM、API 供應、金流沙盒、Developer Portal／SDK、跨平台 Installer、跨環境遷移。
- **Owner 時間及硬體**：先以 RTX 3050 桌機、Pi 4、現有 Windows 搭配模擬服務達到 P0/P1；初始額外支出目標不超過 NT$10,000，未查實 VRAM／價格／用量前不承諾額外 GPU、Mac mini、30B 模型或付費雲端。
- **所有任務皆依賴安全底線**：外部數據無管理權、Q24 不補選、系統部署高風險僅 Owner Ceres 確認、Self-Build 獨立可信背景來源、真實工具回執才能報告成功。

## 即刻可做的第一輪動作（不涉及正式部署）

1. 指定 `OC-000` 為第一個工程 Epic，對 `README.md`、`docs/GO_LIVE_AUDIT.md`、`training/october/README.md`、`docs/SLIME_DISTRIBUTED_NODES.md` 內容進行代碼路徑核對，建立當前 branch 的功能 status baseline。
2. 在隔離 CI／開發 checkout 執行 `npm install --no-audit --no-fund`、`npm run build`、`node --test training/october/policy.test.mjs`、`node scripts/core-release-gate.mjs`；只回報實際執行結果，不從 workflow 存在推斷 PASS。若需要 Python 及模型訓練須明確區分 check-only vs 訓練。
3. 以 OC-001/002 安全斷言把 Ceres Owner 與 Self-Build 可信來源固定為不可被 Agent 改寫的後端政策；先有 fail-closed tests，再接 OC-003/004。
4. 實作 OC-003/004/005 最小**真實唯讀**任務閉環，再接 UI；檔案、網路或第三方服務不可用時清楚回 blocked/partial。
5. 每個 PR 對應需求矩陣 Q IDs、變更檔案、實際 test logs、負面測試、是否需 Owner 批准及發佈狀態，通過 M1 才進 M2。

## 24 個 Candidate Epics

### OC-000 — 可信能力盤點與驗收帳本

- **Priority / Gate**：P0 / M0；**Requirement**：Q27,Q38,Q50；**Depends on**：—
- **Deliverable**：完成 src/services/training/CI/部署現況盤點；逐項維護 implementation/test/deployment 三種狀態與證據
- **Dependencies / Inputs**：抽取 branch commit、實際 build/test 日誌、環境及部署回執；空值標 unknown
- **Acceptance (DoD)**：同一版本所有已宣稱可用功能皆有 evidence_ref，未執行不得標 PASS
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-001 — Owner 身分信任根及跨租戶強制拒絕

- **Priority / Gate**：P0 / M0；**Requirement**：Q25,Q26,Q36,Q40,Q42,Q43,Q50；**Depends on**：OC-000
- **Deliverable**：後端 Principal、tenant、workspace、scopes、revocation、Ceres owner ID+nonce/action/version
- **Dependencies / Inputs**：Ceres 後端可調用狀態、最小權限 token、測試 Principal；禁止前端 key
- **Acceptance (DoD)**：非 Owner/偽造 telegram/不同 tenant/過期 nonce 全拒絕；真 Owner 精確批准成功
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-002 — Self-Build 不可透過聊天、外部事件觸發

- **Priority / Gate**：P0 / M0–M1；**Requirement**：Q25,Q27,Q28,Q29,Q30,Q45,Q48,Q49；**Depends on**：OC-001
- **Deliverable**：將 Self-Build scheduler/event ingestion 與普通 job dispatcher、webhook、Plugin、UI 完全隔離
- **Dependencies / Inputs**：受信事件來源身分、固定內部 job type、封閉 enqueue 入口
- **Acceptance (DoD)**：外部聊天/API/SDK/Plugin/Webhook/Importer/Installer/個人排程經任何代理間接呼叫都失敗；真內部測試只到 candidate
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-003 — October 任務契約與 Diana 工具登錄

- **Priority / Gate**：P0 / M1；**Requirement**：Q03,Q04,Q07,Q11,Q14,Q32,Q50；**Depends on**：OC-001
- **Deliverable**：typed TaskRequest, ToolManifest, RequiredScope, RiskClass, Error/Status Contract；單模型可跑
- **Dependencies / Inputs**：現有 src/detroit、src/assistant 盤點；工具能力只允許 Registry 已核准版本
- **Acceptance (DoD)**：一個唯讀任務意圖能自動選正確工具；無支援工具回 unsupported
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-004 — Detroit 可信垂直執行與冪等回執

- **Priority / Gate**：P0 / M1；**Requirement**：Q06,Q07,Q14,Q15,Q32,Q36,Q50；**Depends on**：OC-001,OC-003
- **Deliverable**：真實唯讀工具由後端執行：task_id/run_id/step/receipt/provider result
- **Dependencies / Inputs**：一個受權 mock provider + 一個可驗證真正唯讀 provider；無管理憑證下放
- **Acceptance (DoD)**：同租戶工具成功回真實結果，未授權阻擋、duplicate idempotency 不重複作用
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-005 — 獨立 Verifier 與不捏造成功的回答層

- **Priority / Gate**：P0 / M1；**Requirement**：Q07,Q08,Q09,Q27,Q32,Q50；**Depends on**：OC-004
- **Deliverable**：工具執行回執、輸入版本、引用/結果/失敗由獨立驗收器判定
- **Dependencies / Inputs**：合成正反例及真工具請求結果；可打開證據
- **Acceptance (DoD)**：未收到 provider/tool response 不得標 success；Verifier 抓出來源/數值矛盾
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-006 — 即時 UI 真實進度及 Lite 模式

- **Priority / Gate**：P0 / M1；**Requirement**：Q01,Q05,Q41；**Depends on**：OC-004,OC-005
- **Deliverable**：聊天串流、實際任務階段、能中止／重試的錯誤 UI，長對話渲染優化
- **Dependencies / Inputs**：React/Vite 本有局部 UI；實際連 task event cursor
- **Acceptance (DoD)**：設備斷線與重連不虛報進度；低階手機與桌機可用，報告 INP/CLS
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-007 — CI 門檻及全域安全負例

- **Priority / Gate**：P0 / M0–M1；**Requirement**：Q26,Q27,Q30,Q38,Q50；**Depends on**：OC-000,OC-001
- **Deliverable**：執行 package scripts、October policy tests、Docker/服務端相關測試、core-release-gate
- **Dependencies / Inputs**：Node/Python/依賴版本與網路相容性；本輪尚未執行
- **Acceptance (DoD)**：固定 commit 測試輸出/失敗清單，測試未跑維持 not_run，阻擋不安全 release
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-008 — Durable DAG、Task Checkpoints 與取消

- **Priority / Gate**：P0 / M2；**Requirement**：Q06,Q07,Q15,Q31,Q36,Q38；**Depends on**：OC-004
- **Deliverable**：受信持久存儲、任務 Lease、TTL、replay、cancel、safe retry
- **Dependencies / Inputs**：資料庫與 scheduler 保留真實部署證據；不得用 PWA session 冒充
- **Acceptance (DoD)**：程序終止重啟後恢復允許任務；不可逆副作用不重播、unknown 需標註
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-009 — Ceres Owner 後端管理實測與憑證隔離

- **Priority / Gate**：P0 / M2；**Requirement**：Q25,Q26,Q36,Q37,Q42,Q43；**Depends on**：OC-001,OC-007
- **Deliverable**：Owner-only Telegram 私聊及 signed WebApp、最小配置、憑證輪替、停權
- **Dependencies / Inputs**：需要 Owner 真實後端 Telegram 配置和私密環境；不得洩漏 token
- **Acceptance (DoD)**：指定 Owner 真回執可通過，偽裝 username／webhook／callback 通通拒絕
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-010 — LUCA 最小必要 Trace、事件及 SLO

- **Priority / Gate**：P1 / M2；**Requirement**：Q09,Q26,Q27,Q28,Q38,Q40；**Depends on**：OC-004,OC-005
- **Deliverable**：task/step/tool/Verifier/status/error 而非私人內容，支援匿名回饋
- **Dependencies / Inputs**：src/luca、services/weiguo/luca.py 範圍與配置核對
- **Acceptance (DoD)**：非機密 Trace 對到真 receipt；私密模式禁收集、租戶隔離
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-011 — 長期記憶／RAG 可追溯檢索

- **Priority / Gate**：P1 / M2；**Requirement**：Q08,Q21,Q22,Q31,Q32；**Depends on**：OC-001,OC-005,OC-008
- **Deliverable**：working、episodic、semantic 可信來源、期限、刪除與租戶 ACL
- **Dependencies / Inputs**：現有 src/memory 與文件檢索候選；source/provenance schema
- **Acceptance (DoD)**：另一租戶記憶不能命中；來源過期／失聯不編造引用
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-012 — Slime 可撤銷節點註冊及真實 Worker Proof

- **Priority / Gate**：P1 / M3；**Requirement**：Q01,Q02,Q05,Q15,Q38,Q47；**Depends on**：OC-001,OC-004,OC-008
- **Deliverable**：現有候選路由上加可信 Lease、真實已授權 inference/tool run、資源探測
- **Dependencies / Inputs**：RTX3050 VRAM 未查、Pi 4 冷卻／弱 Windows、無新硬體購買
- **Acceptance (DoD)**：真實 node_id + signed result／租約失效阻斷；不能將 executed:false 說成已派工
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-013 — Retina 視覺來源驗證與多模態安全降級

- **Priority / Gate**：P1 / M3；**Requirement**：Q23,Q41,Q44；**Depends on**：OC-001,OC-005,OC-006
- **Deliverable**：真實圖片 decode/parse、OCR／Vision 能力報告、音訊/畫面同意與媒體授權
- **Dependencies / Inputs**：來源媒體已取得、實際可用模型、影格/時間戳與保留規則
- **Acceptance (DoD)**：無視覺模型時 unable_to_inspect；取消畫面分享立刻停止，不能當成已看過
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-014 — 專業計算／文件成果真實生成與驗證

- **Priority / Gate**：P1 / M4；**Requirement**：Q14,Q16,Q17,Q18,Q19,Q20,Q23,Q33,Q34,Q35；**Depends on**：OC-005,OC-011
- **Deliverable**：先選一個 end-to-end 分析案例，引用與單位、可開啟 DOCX/XLSX/PDF
- **Dependencies / Inputs**：CREAM/GridCraft/Wordcraft 既有基礎，固定授權資料
- **Acceptance (DoD)**：匯出檔案可開啟、來源與公式重算正確，無法生成不提供假連結
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-015 — Scouts／Notion／外部 Connector 受控整合

- **Priority / Gate**：P1 / M4；**Requirement**：Q09,Q13,Q21,Q22,Q36,Q46；**Depends on**：OC-001,OC-004
- **Deliverable**：一個真正已核准 Read Connector、CORS／授權檢查及來源標記
- **Dependencies / Inputs**：API 憑證與出口僅可信後端；來源無法取得不得假稱已讀
- **Acceptance (DoD)**：服務 401/429/CORS/失聯回 unavailable；正常讀取有 provider ref
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-016 — 用戶提醒與條件 watch — 受信背景排程

- **Priority / Gate**：P1 / M4；**Requirement**：Q15,Q36,Q38,Q45,Q46；**Depends on**：OC-002,OC-008,OC-009
- **Deliverable**：一次性／週期／條件 watch 與通知 outbox、去重、撤權
- **Dependencies / Inputs**：M2 持久 scheduler & auth，通知目的地先經授權
- **Acceptance (DoD)**：關閉聊天後由實際 Scheduler 觸發；外部條件 unknown 不告警；絕不觸發 Self-Build
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-017 — API Gateway、模型 Registry 與 Token Ledger

- **Priority / Gate**：P2 / M5；**Requirement**：Q02,Q05,Q14,Q32,Q37,Q39；**Depends on**：OC-001,OC-004,OC-008
- **Deliverable**：Key scope、模型版本固定、reserve/consume/release、錯誤規範
- **Dependencies / Inputs**：可信後端授權／配額資料庫與真實模型能力
- **Acceptance (DoD)**：併發高壓不突破硬配額；撤銷 Key 後端立即拒絕
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-018 — 企業工作空間／RBAC／ACL 與 SCIM

- **Priority / Gate**：P2 / M5；**Requirement**：Q21,Q40,Q42,Q43；**Depends on**：OC-001,OC-008,OC-011
- **Deliverable**：個人團隊組織資源、共享版本、SAML/OIDC、SCIM 撤權
- **Dependencies / Inputs**：既有家庭身份不直接當 enterprise SSO，需獨立 tenant namespace
- **Acceptance (DoD)**：兩組織交叉讀寫拒絕；離職權限、session 及代理工作全部回收
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-019 — 訂閱與按量 Sandbox（絕不自動收款）

- **Priority / Gate**：P2 / M5；**Requirement**：Q37,Q39,Q40；**Depends on**：OC-017,OC-018
- **Deliverable**：Plan Registry、usage/invoice/payment/refund Ledger、webhook 驗簽與對帳
- **Dependencies / Inputs**：先完成 Token Ledger、法規與 PSP 選用審查
- **Acceptance (DoD)**：duplicate request/webhook/退款可追蹤；真金流 OFF 直到明確 Owner 批准
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-020 — 外部 SDK／Plugin Candidate Registry

- **Priority / Gate**：P2 / M5；**Requirement**：Q11,Q12,Q13,Q14,Q36,Q48；**Depends on**：OC-001,OC-004,OC-007
- **Deliverable**：SDK / mock providers / synthetic sandbox / signed candidate / risk tiers
- **Dependencies / Inputs**：P0 最小權限、完整性根、Dev Portal 身分、實際 scanner
- **Acceptance (DoD)**：未審核 candidate 無法在 Detroit 真實執行；撤銷失效
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-021 — 跨平台 Installer／模型可靠續傳與受簽章更新

- **Priority / Gate**：P2 / M6；**Requirement**：Q01,Q05,Q38,Q47；**Depends on**：OC-007,OC-012
- **Deliverable**：Windows/macOS/Linux 受信包體、GPU 探測、model resume、版本相容檢查
- **Dependencies / Inputs**：真機建置與簽章資源；朋友節點 opt-in，不預先購置昂貴設備
- **Acceptance (DoD)**：Start to fetch params 故障有診斷；hash mismatch 被拒、更新失敗可回滾
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-022 — 開放備份匯入／試還原／資料可攜

- **Priority / Gate**：P2 / M6；**Requirement**：Q14,Q21,Q31,Q35,Q40,Q42,Q49；**Depends on**：OC-001,OC-008,OC-011,OC-014
- **Deliverable**：加密 archive manifest、Artifact+memory、provenance、ACL 映射與不轉移憑證
- **Dependencies / Inputs**：可授權導出資料與 isolated target sandbox
- **Acceptance (DoD)**：hash/ACL/provenance 達標；外部 OAuth 重新授權、資料匯入無法啟動 Self-Build
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。

### OC-023 — 正式 Canary／故障注入／Owner release gate

- **Priority / Gate**：P0 / M6–M7；**Requirement**：Q26,Q27,Q30,Q38,Q40,Q47,Q50；**Depends on**：OC-001,OC-007,OC-008
- **Deliverable**：環境可驗證部署、回歸 + E2E、故障注入、SLO、回滾流程、Owner release nonce
- **Dependencies / Inputs**：選定要發布的 release digest 與環境；須已有真 CI+實際試運行
- **Acceptance (DoD)**：未通過測試或 Owner 未核准正式發布必須 blocked；撤銷/回滾演練有回執
- **Verification**：至少寫出對應的可執行 unit/integration/security/fault-injection test 或真實外部 provider receipt；在有固定 commit 和執行 log 之前，`implementation=unknown, verification=not_run, deployment=unknown`。
- **Tracking**：待由工程 owner 建立 Issue／PR 並回填編號；**這份文件不代表 GitHub Issues 已經建立**。


## 每個 Epic 的 Issue / PR 內容範本

```yaml
epic_id: OC-###
requirements: [Q##]
milestone: M#
priority: P#
owner: unassigned
target_commit: unset
implementation: unknown
verification: not_run
deployment: unknown
scope: ""
non_goals: []
dependencies: []
security_controls:
  - principal_tenant_scope
  - Ceres_owner_for_global_high_risk
  - SelfBuild_backend_only
  - tool_receipt_truthfulness
tests:
  unit: []
  integration: []
  negative_authorization: []
  fault_recovery: []
  actual_provider_receipt: []
evidence:
  ci_url: null
  test_log: null
  runtime_receipt: null
  deployment_url: null
  owner_approval: null
rollback_plan: ""
definition_of_done: blocked_until_verified
```

## 跨模組整合的額外負例

- **第 1 組：身分與隔離**：未登入、錯租戶、被離職停權、過期邀請、外部 API Key、企業 IdP claim 都不能成為 Ceres Owner；不同工作空間不得讀取他人記憶、帳單及秘密。
- **第 2 組：Self-Build**：聊天、任何用戶定期任務、Telegram 非可信指令、Plugin／SDK、文字／影像 OCR、Slime installer、資料 Import、付款 webhook 均不得直接或間接進入受信 Self-Build 佇列。
- **第 3 組：副作用**：重試、斷電、多節點 Failover、網路逾時不能重複寄信、付費扣款或套用未核准部署；unknown provider outcome 不能被改寫成 success。
- **第 4 組：真實能力**：沒有 Retina 不宣稱已看圖，沒有持久 Scheduler 不宣稱已設定背景通知，Slime router `executed:false` 不宣稱跑完模型，無真支付 provider 不宣稱收款。
- **第 5 組：供應鏈與可攜性**：惡意 SDK、未簽章 Update、被竄改 Archive、非相容 checkpoint、失效 Token、惡意 README 不能擴權或跳過 Verifier。
- **第 6 組：效能與成本**：小設備自動調整 Lite UI／模型；不接受將單一 3B 的多個副本誤稱為 30B；未授權雲端路由、超額 Token 和額外付款均拒絕。

## Milestone Gate 匯報格式

```text
Milestone: M#
PR/commit: <verified sha>
Scope: <what demonstrably works>
Tests executed: <commands, environment, actual results>
Security authorization / tenant isolation: <evidence>
Performance and budget: <measured only>
Known gaps: <blocked / unknown>
Deployment: not_deployed | staging | production, actual URL/receipt
Owner approval: required? yes/no; approved/denied/unknown
Rollback and data preservation: <tested evidence>
Next dependency: OC-###
```

**禁止**根據規格文件、候選工作項目或 CI workflow 的存在，自動將 Epic 標成 implemented／tested／production。Q24 仍為 skipped，未得使用者確認不得自行開發為已獲批准的需求。
