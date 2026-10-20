/** Detroit Factory: opt-in deterministic execution/tools, not extra AI models.
 * Metadata is descriptive only. It must never grant server privileges.
 */
export type DetroitFactoryTool={
 id:string;label:string;engine:string;provider:string;
 status:"adapter"|"planned";enabledByDefault:boolean;description:string;
};
export const DETROIT_FACTORY_TOOLS:readonly DetroitFactoryTool[]=[
 {id:"medusa",label:"Medusa",engine:"JENSEN HUANG / CREAM",provider:"Judge0",
  status:"adapter",enabledByDefault:false,
  description:"Judge0、Cloud Run 或內建 Medusa Lite（受限 Python 語法）；管理者白名單、逐次同意，預設停用"},
 {id:"quirinus",label:"Quirinus",engine:"Athena / JENSEN HUANG / CREAM",provider:"VulnClaw",
  status:"adapter",enabledByDefault:false,
  description:"可選資安檢測工具；隔離管理員以 Athena 短效核准後呼叫 L1/L2 掃描，CREAM 驗證結果並產生 JENSEN 修復待辦；預設關閉"},
 {id:"gridcraft",label:"GridCraft",engine:"CREAM",provider:"GridCraft CLI",
  status:"adapter",enabledByDefault:false,
  description:"可選的表格與 XLSX 匯出引擎；需另外安裝受信任的後端 CLI"},
 {id:"ceres",label:"Ceres",engine:"Diana / Athena / Zeus",provider:"Vanilla native gateway",
  status:"adapter",enabledByDefault:false,
  description:"原生 Telegram 進站事件適配器；獨立 Webhook secret、私聊 ID 白名單、管理員審核，不能由來訊直接執行工具"},
 {id:"notion",label:"Notion Schedule Board",engine:"Diana / Chronos / Zeus",provider:"Notion API",
  status:"adapter",enabledByDefault:false,
  description:"後端 Notion 任務管理 API；家庭隔離、憑證不出後端。Notion 日期不是實際計時執行器"},
 {id:"moli",label:"Moli",engine:"Scouts / Zeus",provider:"Moli",
  status:"adapter",enabledByDefault:false,
  description:"實驗性唯讀瀏覽器，需受控後端與額外網路隔離"}
] as const;
