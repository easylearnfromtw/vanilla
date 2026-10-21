# October｜需求追蹤矩陣（RTM）— 50 題槽位／49 項已確認決策

> **Q50 D 的交付附錄** · 2026-10-21 · `feat/signwell-agent-sandbox-20261020`。由 [DECISIONS_50.md](DECISIONS_50.md) 現有 Q01–Q23、Q25–Q49 標題抽取，加上使用者在本輪確認的 Q50；**Q24 永遠保留 skipped，不自動補選**。
>
> 重要：此處「確認」僅代表規格已獲使用者確認。「證據起點」是 repository 內可追查的文件／程式位置，不表示任何單項功能已實作、通過測試或正式上線。GitHub 讀取不等同 Runtime／CI 驗證；各項 implementation/verification/deployment 在本輪未全面核對，**保守標記待逐項查證**。

## 更新狀態原則

| 欄位 | 值 | 不可省略的證據 |
|---|---|---|
| Decision | confirmed / skipped | 本人確定選項與 Decision ID；Q24 固定 skipped |
| Implementation | not_started / partial / implemented / unknown | 具體檔案、PR、版本及已達成的功能邊界 |
| Verification | not_run / failed / passed | 可重現命令、commit、環境、測試輸出與結果 |
| Deployment | not_deployed / staging / production / unknown | 實際發布記錄、環境、健康檢查與外部能力回執 |
| Approval | not_requested / requested / approved / denied / expired | 適用高風險動作的受信 Ceres Owner 審批證據 |

需求可有局部程式碼卻不能將 `verification=passed` 或 `deployment=production` 自動繼承；來源文件聲稱「已做」必須依指定 commit 及實際執行查證。

## 逐題追蹤

### Q01–Q10

| ID | 已確認決策名稱 | 里程碑 | 最低驗收焦點（依 DECISIONS_50 展開） | GitHub 證據起點（非通過證明） | 現況 |
|---|---|---|---|---|---|
| Q01 | 設備適應與模型路由 | M1/M3 | 探測設備→實際可執行模型／失敗安全路由 | `src/local-ai/；README.md` | 確認；實作／測試／部署待逐項查證 |
| Q02 | 私人節點與雲端備援的自主授權路由 | M2/M3 | 本地與雲端同意／可用性／隱私切換 | `deployment/ollama/；README.md` | 確認；實作／測試／部署待逐項查證 |
| Q03 | 自適應混合專家架構（Adaptive Expert Orchestration） | M1 | 專家選擇與真實工具回執 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |
| Q04 | 風險感知的動態推理（Risk-Adaptive Reasoning） | M1 | 風險等級／推理預算與錯誤拒絕 | `src/assistant/；training/october/` | 確認；實作／測試／部署待逐項查證 |
| Q05 | 自適應資源管理（Adaptive Resource Management） | M1/M3 | CPU/GPU/VRAM/延遲／額度硬限制 | `src/nodes/；src/slime/` | 確認；實作／測試／部署待逐項查證 |
| Q06 | 高度自主 Agent（Proactive Authorized Autonomy） | M1/M2 | 受權自主任務／取消與高風險審批 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |
| Q07 | 動態規劃＋獨立驗證（Plan–Execute–Verify–Replan） | M1 | DAG 成功／失敗／重規劃／獨立驗證 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |
| Q08 | 自主查證＋智慧回問（Context Verification & Targeted Clarification） | M1 | 必要澄清與不確定輸入停止 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |
| Q09 | 證據驅動＋獨立事實驗證（Evidence-Grounded Reliability） | M1 | 可引文查證／無來源不宣稱已讀 | `docs/SCOUTS_WEB_RETRIEVAL.md` | 確認；實作／測試／部署待逐項查證 |
| Q10 | 多層次自主學習、審核式微調與安全版本升級（Layered Continual Learning） | M2/M6 | 訓練隔離／盲測／回退與 Owner 發布 | `training/october/README.md` | 確認；實作／測試／部署待逐項查證 |

### Q11–Q20

| ID | 已確認決策名稱 | 里程碑 | 最低驗收焦點（依 DECISIONS_50 展開） | GitHub 證據起點（非通過證明） | 現況 |
|---|---|---|---|---|---|
| Q11 | 固定工作流程模板、自動選用與受控工具執行（Template-First Orchestration） | M1/M4 | 模板條件／風險閘門／工具實際執行 | `src/detroit/` | 確認；實作／測試／部署待逐項查證 |
| Q12 | 分級自主擴充與安全模板發布（Tiered Autonomous Template Lifecycle） | M4/M5 | 模板分級／版本與授權發布 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |
| Q13 | 分級自主第三方外掛整合（Tiered Autonomous Plugin Integration） | M4/M5 | 插件執行碼與宣告式差異／隔離掃描 | `docs/DETROIT_TOOL_KNOWLEDGE.md` | 確認；實作／測試／部署待逐項查證 |
| Q14 | 統一資料契約＋成果交換系統（Typed Contracts & Artifact Exchange） | M1/M4 | typed schema／ArtifactRefs／契約相容 | `src/detroit/` | 確認；實作／測試／部署待逐項查證 |
| Q15 | 自適應分散式調度（DAG-Aware Adaptive Distributed Scheduling） | M1/M2 | 多節點 DAG lease／重試／冪等 | `services/detroit-jobs/` | 確認；實作／測試／部署待逐項查證 |
| Q16 | C＋D：量化經濟預測 × 多學派實證驗證（Quantitative Economics & Evidence-Based Pluralism） | M4 | 經濟計量／假設／資料來源一致 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |
| Q17 | 全方位企業決策系統（Strategy × Analytics × Optimization × Evaluation） | M4 | 企業策略／情境／約束／數值重算 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |
| Q18 | 整合式專業財務分析引擎（Accounting × Financial Modeling × Valuation × Risk） | M4 | 財務模型／報表口徑／敏感度 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |
| Q19 | 整合式專業精算引擎（Life & Health × Non-Life × Stochastic Risk × ALM × IFRS 17） | M4 | 精算假設／現金流／壓力測試 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |
| Q20 | 整合式量化投資決策引擎（Research × Portfolio Optimization × Risk × Backtesting） | M4 | 投資回測偏誤／風險／限制與不誇大 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |

### Q21–Q30

| ID | 已確認決策名稱 | 里程碑 | 最低驗收焦點（依 DECISIONS_50 展開） | GitHub 證據起點（非通過證明） | 現況 |
|---|---|---|---|---|---|
| Q21 | 混合式專業資料治理系統（Hybrid Data Governance, Provenance, Freshness & Offline Access） | M0/M2 | 資料權限／時效／離線與來源追蹤 | `docs/LOCAL-FIRST-GOOGLE-DRIVE.md` | 確認；實作／測試／部署待逐項查證 |
| Q22 | 混合式專業知識引擎（Hybrid Retrieval + Knowledge Graph + Verified Citations） | M2 | RAG/圖譜引用真實命中及 ACL | `training/agent_sandbox/README.md` | 確認；實作／測試／部署待逐項查證 |
| Q23 | 多模態混合解析＋交叉驗證（Document Native Parsers × Retina × OCR × Verifier） | M3/M4 | PDF/DOCX/PPTX 等解析來源對照與未辨識聲明 | `docs/PERSONAL_AUTO_WORKFLOWS.md` | 確認；實作／測試／部署待逐項查證 |
| Q24 | **略過（不補選）** | — | **不得開發為預設產品選項** | — | skipped / 不適用 |
| Q25 | B＋C：自動除錯與自主程式開發，僅限本人透過 Ceres Telegram 控制 | M2/M6 | 程式修改分級／合成測試／PR 審查 | `docs/SELF_BUILD_AUTONOMOUS_CODE.md` | 確認；實作／測試／部署待逐項查證 |
| Q26 | D：分層式自主資安防護系統（October × Quirinus × Ceres Telegram） | M0 | 對抗式輸入／秘密保護／執行隔離 | `docs/QUIRINUS_VULNCLAW_INTEGRATION.md` | 確認；實作／測試／部署待逐項查證 |
| Q27 | D：全面品質驗證與持續評估系統（Professional Evals × Benchmarks × CI Regression × Owner Release Gate） | M0/M6 | eval 覆蓋率／盲測／回歸證據 | `docs/DETROIT_CORE_RELEASE_GATE.md` | 確認；實作／測試／部署待逐項查證 |
| Q28 | D：自主持續改善閉環（Backend-Only Self-Build × LUCA × CI × Detroit × Verifier） | M2 | Self-Build 只接受可信背景來源 | `training/october/policy.mjs` | 確認；實作／測試／部署待逐項查證 |
| Q29 | D：Self-Build 分層自主改進系統（L1–L4） | M2/M6 | L1–L4 狀態／授權／資料集區隔 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |
| Q30 | D：分階段發布與自動防護系統（Shadow × Canary × Verification × Rollback） | M6/M7 | Shadow/Canary/rollback/Owner Gate | `docs/GO_LIVE_AUDIT.md` | 確認；實作／測試／部署待逐項查證 |

### Q31–Q40

| ID | 已確認決策名稱 | 里程碑 | 最低驗收焦點（依 DECISIONS_50 展開） | GitHub 證據起點（非通過證明） | 現況 |
|---|---|---|---|---|---|
| Q31 | D：分層式可信長期記憶系統（Working × Episodic × Semantic × Durable Checkpoints） | M2 | 長期記憶 provenance／租戶隔離／checkpoint | `src/memory/` | 確認；實作／測試／部署待逐項查證 |
| Q32 | D：分層式多 Agent 協作系統（October × Diana × Detroit × Verifier） | M1 | Diana 工具選擇／Detroit receipt／Verifier | `src/detroit/；src/assistant/` | 確認；實作／測試／部署待逐項查證 |
| Q33 | D：可重現的自主專業研究引擎（Hypothesis × Statistical/Causal Inference × Reproducibility） | M4 | 研究方法／可重現指標／來源證據 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |
| Q34 | D：可驗證的專業決策智慧引擎（MCDA × Scenario × Optimization × Risk × Verifier） | M4 | 多準則／情境／風險與可重算模型 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |
| Q35 | D：端到端專業成果製作引擎（Wordcraft × Deckcraft × GridCraft × PDFcraft × Dashboard × Verifier） | M4 | 真實可開啟 DOCX/PPTX/XLSX/PDF/圖表 | `docs/WORDCRAFT_INTEGRATION.md` | 確認；實作／測試／部署待逐項查證 |
| Q36 | D：政策驅動的跨應用執行系統（October × Diana × Detroit × Policy Engine × Verifier） | M1/M4 | 外部操作 scope／idempotency／回執 | `docs/DETROIT_ARCHITECTURE.md` | 確認；實作／測試／部署待逐項查證 |
| Q37 | D：完整模型 API 管理與服務引擎（Secure Gateway × Key Quotas × Model Registry × Slime） | M5 | API key 原子 Token 配額／模型版本 | `docs/DETROIT_API_REGISTRY.md` | 確認；實作／測試／部署待逐項查證 |
| Q38 | D：自適應高可靠性運算系統（SRE × Slime × Failover × Checkpoint × Disaster Recovery） | M2/M6 | 故障注入／SLI/SLO／備份還原 | `docs/DETROIT_CORE_RELEASE_GATE.md` | 確認；實作／測試／部署待逐項查證 |
| Q39 | C：訂閱與按量計費平台（Subscription × Usage Billing × Reconciliation × Refund Governance） | M5 | Sandbox 訂閱／帳單／退款對帳；金流 OFF | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |
| Q40 | C：企業級法規與稽核治理（Regulatory Applicability × Data Classification × Records × Cross-Border × Incident | M0/M5 | 適用法規／資料分類／跨境／事故演練 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |

### Q41–Q50

| ID | 已確認決策名稱 | 里程碑 | 最低驗收焦點（依 DECISIONS_50 展開） | GitHub 證據起點（非通過證明） | 現況 |
|---|---|---|---|---|---|
| Q41 | D：自適應 AI 工作體驗系統（Minimal iOS UX × Progressive Streaming × Task Transparency × Adaptive Performan | M1/M3 | 手機/桌面交互／INP／無障礙／狀態可信 | `src/venus/；src/ui/` | 確認；實作／測試／部署待逐項查證 |
| Q42 | D：分層式企業協作與權限治理（Personal × Team × Organization × Resource ACL） | M5 | 跨租戶 ACL／共享撤權／版本衝突 | `src/workspace/` | 確認；實作／測試／部署待逐項查證 |
| Q43 | C：企業級 SSO 與身分生命週期系統（SAML/OIDC × Enterprise IdP × SCIM × Revocation × Audit） | M5 | SAML/OIDC/SCIM 登入／離職撤權 | `services/weiguo/` | 確認；實作／測試／部署待逐項查證 |
| Q44 | D：自適應多模態 AI 執行引擎（STT/TTS × Retina × Realtime AV × October × Detroit × Verifier） | M3 | 有授權的媒體處理／Retina 實證 | `docs/RETINA_VISION.md` | 確認；實作／測試／部署待逐項查證 |
| Q45 | D：政策驅動的個人自動化引擎（Reminders × Recurrence × Condition Watch × Durable Execution × Notification） | M2/M4 | 提醒排程持久化／去重／Self-Build隔離 | `services/detroit-jobs/` | 確認；實作／測試／部署待逐項查證 |
| Q46 | C：跨地區知識與在地化分析系統（Locale × Currency × Units × Timezone × Jurisdiction × Freshness） | M4 | 地區法規時效／匯率單位／時區 | `docs/TAIDE_TAIWAN_ROUTING.md` | 確認；實作／測試／部署待逐項查證 |
| Q47 | D：自適應部署與生命週期管理引擎（Cross-Platform Installer × Signed Supply Chain × Slime Enrollment × Safe Upgra | M6 | 平台安裝／簽章／續傳／Slime撤銷 | `docs/SLIME_DISTRIBUTED_NODES.md` | 確認；實作／測試／部署待逐項查證 |
| Q48 | D：受政策治理的開放開發者生態系（Versioned SDK × Typed Contracts × Sandbox × Signed Registry × Approval Gates） | M5 | SDK 沙盒／簽章 Registry／審批 | `docs/DETROIT_TOOL_KNOWLEDGE.md` | 確認；實作／測試／部署待逐項查證 |
| Q49 | D：可驗證的開放式資料可攜與遷移引擎（Open Export × Encrypted Backups × Artifact Provenance × Safe Restore） | M6 | 備份還原／可攜格式／ACL 不擴權 | `DECISIONS_50.md` | 確認；實作／測試／部署待逐項查證 |
| Q50 | D：證據驅動的分階段交付與產品驗收治理 | M0–M7 | 需求追蹤／版本里程碑／真實 DoD | `ARCHITECTURE_DELIVERY_PLAN.md` | 確認；實作／測試／部署待逐項查證 |

## Q24 明確保留

Q24 在本次 50 題問答被使用者要求略過；其概念、技術選項、功能、預算與開發門檻皆 **未獲批准**，不可由 Q23、Q25、第三方文件、Agent 推理或最後的 Q50 自動補完。只有使用者未來明確提出重新啟用 Q24，才另立變更記錄。

## 逐項更新與可稽核驗收流程

1. **指定 owner 與 Epic**：每個 Qnn 可對應多個 Backlog ID，記 `requirements=[Qxx,...]`、priority、dependency、owner 和 branch／commit，不可虛構 GitHub Issue ID。
2. **使用者情境與斷言**：在自動測試中執行正常、缺權限、跨租戶、限額、失敗、重試、撤權、不可信輸入的 scenario；每條 Assertion 對回 Qnn。
3. **證據格式**：`requirement_id, milestone, commit_sha, test_id, environment, executed_at, result, evidence_url, limitations, deployment_url, approver`；未執行任何測試時填 `not_run`。
4. **完成門檻**：參照 [ARCHITECTURE_DELIVERY_PLAN.md](ARCHITECTURE_DELIVERY_PLAN.md) 的 DoD；不得以 README、PR 已開、GitHub Actions 有 workflow、模擬測試高正確率、尚未驗證的 Provider API 當成 production release。
5. **信任政策橫切斷言**：所有 Qnn 都須符合「Ceres Owner 全域核准」、「所有一般使用者／SDK／外部事件不能啟動 Self-Build」、「可信後端 Actor/Tenant/Scope/Cost 權限」、「真實工具／服務回執」、「Q24 不補選」。
6. **狀態報告**：按 Milestone 定期報告未通過與 blocked，不從檔案存在推算完成百分比。檢視日期、證據 commit 與部署環境缺失時保守填 unknown。

## 快速覆蓋檢查

- 應有 **Q01–Q50 共 50 個槽位、49 個 confirmed、1 個 skipped（Q24）**。
- 所有 49 個 confirmed 需求都有里程碑與最低驗收焦點；不得產生任務觸發信任上的直接 Self-Build 路徑。
- Q39 是使用者選定 **C：訂閱與按量計費**；Q40 選定 **C：企業級法遵稽核**；Q43 選定 **C：企業 SSO／SCIM**；Q46 選定 **C：跨地區在地化**。不得誤換為 D。
- Q50 **D** 只批准證據驅動的階段性工程治理，非批准直接收費、繞過 Owner 或一次性宣布所有 49 項功能已完成。
