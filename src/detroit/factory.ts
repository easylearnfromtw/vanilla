/** Detroit Factory: opt-in deterministic execution/tools, not extra AI models.
 * Metadata is descriptive only. It must never grant server privileges.
 */
export type DetroitFactoryTool={
 id:string;label:string;engine:string;provider:string;
 status:"adapter"|"planned";enabledByDefault:boolean;description:string;
};
export const DETROIT_FACTORY_TOOLS:readonly DetroitFactoryTool[]=[
 {id:"quirinus",label:"Quirinus",engine:"Athena / JENSEN HUANG",provider:"VulnClaw CodeScan",
  status:"adapter",enabledByDefault:false,
  description:"獨立資安程式碼掃描工具；後端限定 L1/L2 靜態分析，需管理員啟用、唯讀掛載及網路隔離，不支援公開 PWA 主動滲透"},
 {id:"medusa",label:"Medusa",engine:"JENSEN HUANG / CREAM",provider:"Judge0",
  status:"adapter",enabledByDefault:false,
  description:"獨立 Judge0 沙盒執行 Python；僅可信後端管理員操作，預設停用，需部署與隔離驗證"},
 {id:"gridcraft",label:"GridCraft",engine:"CREAM",provider:"GridCraft CLI",
  status:"adapter",enabledByDefault:false,
  description:"可選的表格與 XLSX 匯出引擎；需另外安裝受信任的後端 CLI"},
 {id:"moli",label:"Moli",engine:"Scouts / Zeus",provider:"Moli",
  status:"adapter",enabledByDefault:false,
  description:"實驗性唯讀瀏覽器，需受控後端與額外網路隔離"}
] as const;
