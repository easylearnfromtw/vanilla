/** Deployed capability inventory. Never conflate included UI with real backend readiness. */
export type LaunchStatus="ready"|"setup"|"limited"|"planned";
export type LaunchInput={
 online:boolean;localModelLoaded:boolean;webGPU:boolean;indexedDB:boolean;cloudProvidersConfigured:boolean;
 driveAuthorized:boolean;analyticsClientConfigured:boolean;analyticsAuthorized:boolean;
 ollamaConfigured:boolean;webSearchConfigured:boolean;webSearchTokenConfigured:boolean;
 noodlesEnabled:boolean;teacherLearningEnabled?:boolean;selfBuildBridgeConfigured?:boolean;
};
export type LaunchRow={id:string;name:string;status:LaunchStatus;description:string;action?:string;};
export const LAUNCH_LABEL:Record<LaunchStatus,string>={
 ready:"本機可用",setup:"需要設定或授權",limited:"已推出部分能力",planned:"尚未完成"
};
export function launchReadiness(input:LaunchInput):LaunchRow[]{
 return [
  {id:"chat",name:"聊天介面／左右滑動／雙模型比較",status:"ready",description:"React 對話介面與資料卡已納入正式部署。模型實際回答仍需有已載入或已連線的模型。"},
  {id:"local",name:"裝置端 WebLLM",status:input.localModelLoaded?"ready":"setup",description:input.localModelLoaded?"本次分頁已載入本機模型。":input.webGPU?"此裝置支援 WebGPU；仍須下載及載入模型。":"此瀏覽器沒有可用 WebGPU，不能在此執行 WebLLM。"},
  {id:"models",name:"外部 Gemini／DeepSeek 模型",status:input.cloudProvidersConfigured?"limited":"setup",description:input.cloudProvidersConfigured?"已設定外部模型，但單靠設定無法確認實際 API 連線或模型額度；必須由使用者同意一次真實推論測試。":"需各自設定金鑰及同意傳送資料。單靠網站部署不能確認 API 連線、模型額度或費用。",action:"系統設定 → 模型連線"},
  {id:"ollama",name:"Ollama 自架／雲端模型",status:input.ollamaConfigured?"limited":"setup",description:input.ollamaConfigured?"已設定端點與模型，但需要連線測試才能確認服務可用。":"需 HTTPS 端點、有效模型 ID，必要時提供存取權杖。",action:"系統設定 → Ollama"},
  {id:"sheets",name:"Vanilla Sheets 與對話內表格",status:"ready",description:"工作簿、CSV 與本機公式功能已部署。這不是完整 Excel 功能。"},
  {id:"cream",name:"CREAM P0 描述統計與互動圖表",status:"ready",description:"CSV／XLSX 匯入、描述統計與對話圖表已部署；進階研究、推論統計與原構想 14 模組並未全部完成。"},
  {id:"cream-advanced",name:"CREAM 14 模組完整版",status:"planned",description:"研究級整合、完整統計檢定、證據鏈、進階文件輸出等尚未全數實作。"},
  {id:"noodles",name:"NOODLES v0.1 跨模型回饋優化",status:input.noodlesEnabled?"ready":"setup",description:input.noodlesEnabled?"本機回饋、路由調整與提示詞改善已啟用，並非修改模型權重。":"功能已部署，但使用者已停用 NOODLES 自適應。"},
  {id:"noodles-teacher",name:"NOODLES Teacher 跨模型蒸餾資料與 LoRA",status:input.teacherLearningEnabled?"limited":"setup",description:input.teacherLearningEnabled?"已明確同意在本機收集使用者選擇的跨模型學習案例，可匯出 SFT/DPO JSONL；需要另外在 GPU 執行訓練並通過評估，才能更新開源模型權重。":"資料收集預設關閉；必須確認來源訓練使用權並啟用 NOODLES TEACHER。資料集與 GPU 訓練腳本已整合，沒有自動微調遠端模型權重。",action:"聊天 → NOODLES TEACHER"},
  {id:"noodles-advanced",name:"NOODLES 自主 A/B 評估／權重訓練",status:"planned",description:"全自動跨模型評審、基準實驗和第三方模型權重更新尚未實作；不能視為每次對話都重新訓練模型。"},
  {id:"library",name:"對話檔案／圖片管理",status:input.indexedDB?"ready":"setup",description:input.indexedDB?"一般模式可在此瀏覽器保存與編輯附件；請注意瀏覽器儲存空間不是異地備份。":"此瀏覽器無法使用 IndexedDB，本機附件永久保存不能保證。"},
  {id:"drive",name:"Google Drive 雲端同步／存檔",status:input.online&&input.driveAuthorized?"limited":"setup",description:input.online&&input.driveAuthorized?"已有有效登入工作階段，尚需真正的唯讀 API 查詢確認；跨裝置同步視授權設定而定。":"需要網路與 Google Drive 登入授權，才能儲存雲端副本。",action:"系統設定 → Google Drive"},
  {id:"ga4",name:"Google Analytics 4 → CREAM",status:input.online&&input.analyticsAuthorized?"limited":"setup",description:input.online&&input.analyticsAuthorized?"已取得 analytics.readonly 授權，但仍需 GA4 帳戶／資源權限、官方 API 與資料查詢測試。":input.analyticsClientConfigured?"已設定 OAuth Client ID，仍需授權及 Google Analytics API 權限。":"需要有效的 Web OAuth Client ID（不是 Client Secret），並啟用 GA4 APIs。",action:"聊天內 → CREAM × GOOGLE"},
  {id:"studio",name:"Google Looker Studio 報表",status:"limited",description:"可使用官方 Linking API 開啟報表建立流程；並非可由 Vanilla 直接管理所有 Studio 報表與資產。"},
  {id:"public-search",name:"公開來源搜尋與部分網頁閱讀",status:input.online?"limited":"setup",description:input.online?"具備 Wikipedia／Crossref 查詢及允許 CORS 網頁的正文讀取；不保證任何網站都可直接閱讀。":"離線時無法查詢即時網站。"},
  {id:"web",name:"全網搜尋／跨網域文章擷取",status:input.online&&input.webSearchConfigured&&input.webSearchTokenConfigured?"limited":"setup",description:input.online&&input.webSearchConfigured&&input.webSearchTokenConfigured?"已配置 HTTPS 搜尋後端與工作階段權杖；仍須實際測試端點並確認搜尋供應商金鑰有效。":"需要另外部署受保護的 HTTPS 搜尋／閱讀 Worker，並配置搜尋 API 金鑰及會話授權權杖。",action:"系統設定 → 偏好網站與搜尋"},
  {id:"builder",name:"Self-Build 可安裝本機小工具",status:"limited",description:"受限制的待辦、追蹤、計算器等宣告式小工具可運作；不具備無限制修改 GitHub 原始碼或自動發布權限。"},
  {id:"builder-code",name:"Self-Build CODE 自主 GitHub 程式開發",status:input.selfBuildBridgeConfigured?"limited":"setup",description:input.selfBuildBridgeConfigured?"已設定受保護的 GitHub Worker 及工作階段 Token；仍須實際驗證 Worker 連線。模型可在明確授權後建立 Draft PR、CI 驗證與最多 2 次有限自動修正，但不能自行合併 main。":"程式編輯器與 GitHub PR 後端原始碼已部署，須先另外部署安全 Worker、配置 GitHub 權杖並手動授權連線，才能真正修改 Repository。",action:"Self-Build → 自主修改程式碼／GitHub CI"},
  {id:"family",name:"家庭成員完整 RBAC 權限與分享",status:"planned",description:"現階段主要依 Google 帳戶隔離；共用帳戶下的家庭成員隔離尚不足以宣稱完整伺服器端 RBAC。"},
  {id:"phone",name:"Mobilerun 跨 App 手機控制",status:"planned",description:"目前 iPhone PWA 無權控制其他 App；仍需獨立執行服務、裝置配對與使用者授權。"},
  {id:"travel",name:"旅行／醫療／健康專業完整代理",status:"planned",description:"可提供一般模型建議及表格，但即時訂票、完整專業醫療資料存取與代理工具尚未全面串接。"}
 ];
}
export function launchCounts(rows:readonly LaunchRow[]):Record<LaunchStatus,number>{
 return rows.reduce((a,r)=>({...a,[r.status]:a[r.status]+1}),{ready:0,setup:0,limited:0,planned:0});
}
