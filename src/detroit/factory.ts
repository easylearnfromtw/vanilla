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
  description:"獨立 Judge0 Python 沙盒；家庭管理者須經後端白名單及逐次同意，預設停用，需隔離部署驗證"},
 {id:"quirinus",label:"Quirinus",engine:"Athena / JENSEN HUANG / CREAM",provider:"VulnClaw",
  status:"adapter",enabledByDefault:false,
  description:"可選資安檢測工具；目前僅隔離後端管理員可啟用 L1/L2 本地程式碼掃描，不開放滲透測試"},
 {id:"gridcraft",label:"GridCraft",engine:"CREAM",provider:"GridCraft CLI",
  status:"adapter",enabledByDefault:false,
  description:"可選的表格與 XLSX 匯出引擎；需另外安裝受信任的後端 CLI"},
 {id:"moli",label:"Moli",engine:"Scouts / Zeus",provider:"Moli",
  status:"adapter",enabledByDefault:false,
  description:"實驗性唯讀瀏覽器，需受控後端與額外網路隔離"}
] as const;
