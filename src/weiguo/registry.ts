/** 衞國 declarative tool connectors. Registration does not execute arbitrary code. */
export type WeiGuoTool={id:string;label:string;kind:"scouts"|"cream"|"atriensis"|"web"|"custom";description:string;enabled:boolean;permissions:("read"|"analyze"|"export")[]};
export const BUILTIN_TOOLS:readonly WeiGuoTool[]=[
 {id:"quirinus-vulnclaw",label:"Quirinus · 安全檢測（選用）",kind:"custom",description:"VulnClaw L1/L2 程式碼靜態掃描；僅授權後端管理員可用，預設停用，不提供公開網路掃描或漏洞利用",enabled:false,permissions:["analyze"]},
 {id:"scouts-browser",label:"Scouts Browser",kind:"scouts",description:"Playwright 開啟、導覽及擷取已授權的公開網頁",enabled:true,permissions:["read"]},
 {id:"moli-reader",label:"Moli Browser（實驗性）",kind:"scouts",description:"僅限受控唯讀網頁擷取，須由後端部署、驗證網路隔離後啟用；失敗回退 Chromium",enabled:false,permissions:["read"]},
 {id:"wordcraft-documents",label:"WordCraft（選用）",kind:"atriensis",description:"Retina 進階文件排版／DOCX、PDF 轉檔；後端需安裝 Rust CLI 且通過隔離審查，預設停用",enabled:false,permissions:["read","export"]},
 {id:"gridcraft-sheets",label:"GridCraft Sheets（選用）",kind:"cream",description:"後端 CLI 產生 XLSX，須家庭授權、操作確認及管理員啟用；預設不部署",enabled:false,permissions:["read","export"]},
 {id:"medusa-judge0",label:"Medusa · Judge0（選用）",kind:"custom",description:"Detroit Factory 程式碼執行與驗證；僅限後端管理員、獨立 Judge0 沙盒，預設關閉",enabled:false,permissions:["analyze"]},
 {id:"cream-data",label:"CREAM",kind:"cream",description:"確定性資料驗證、統計與圖表；交給既有本機引擎",enabled:true,permissions:["read","analyze"]},
 {id:"atriensis-files",label:"Atriensis",kind:"atriensis",description:"讀取已授權檔案並保留所有權邊界",enabled:true,permissions:["read"]}
];
const PATTERN=/^[a-z][a-z0-9-]{2,40}$/;
/** Config only: no JavaScript / remote URLs / privileged permissions can be installed here. */
export function validateToolManifest(raw:unknown):WeiGuoTool{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("工具定義必須是 JSON 物件");
 const data=raw as Record<string,unknown>;
 const keys=Object.keys(data);
 if(keys.some(k=>!["id","label","kind","description","enabled","permissions"].includes(k)))throw Error("不接受程式碼、API 金鑰、URL 或額外的執行參數");
 if(typeof data.id!=="string"||!PATTERN.test(data.id))throw Error("工具 ID 應為 3–41 個小寫字母、數字或 -");
 if(BUILTIN_TOOLS.some(t=>t.id===data.id))throw Error("內建工具 ID 不可覆蓋");
 if(typeof data.label!=="string"||!data.label.trim()||data.label.length>60)throw Error("工具名稱不正確");
 if(typeof data.description!=="string"||data.description.length>300)throw Error("工具說明過長");
 if(data.kind!=="custom")throw Error("額外工具必須標示 kind=custom");
 if(!Array.isArray(data.permissions)||data.permissions.length>3||data.permissions.some(p=>p!=="read"&&p!=="analyze"&&p!=="export"))throw Error("權限限於 read / analyze / export");
 if(typeof data.enabled!=="boolean")throw Error("enabled 必須為布林值");
 return {id:data.id,label:data.label.trim(),kind:"custom",description:data.description,enabled:data.enabled,permissions:[...new Set(data.permissions)] as WeiGuoTool["permissions"]};
}
export function loadToolManifests(owner:string):WeiGuoTool[]{
 try{const raw=JSON.parse(localStorage.getItem("vanilla.weiguo.tools.v1."+owner)||"[]") as unknown;
  return Array.isArray(raw)?raw.flatMap(item=>{try{return [validateToolManifest(item)];}catch{return [];}}).slice(0,20):[];
 }catch{return [];}
}
export function saveToolManifests(owner:string,items:WeiGuoTool[]):void{
 if(items.length>20)throw Error("最多可註冊 20 個宣告式工具");
 localStorage.setItem("vanilla.weiguo.tools.v1."+owner,JSON.stringify(items.map(validateToolManifest)));
}

/* Backwards-compatible read-only metadata shape used by pre-v2 catalog tests.
 * These declarations do not install code, enable privileged adapters or bypass Athena. */
export type LegacyWeiGuoTool={id:string;name:string;description:string;capabilities:string[];engine:string;source:"builtin"|"custom";enabled:boolean};
export const WEIGUO_BUILTINS:readonly LegacyWeiGuoTool[]=[
 {id:"playwright",name:"Playwright Browser",description:"需獨立授權後端的唯讀瀏覽",capabilities:["navigate","click","fill","scroll","extract"],engine:"Scouts",source:"builtin",enabled:false},
 {id:"moli",name:"Moli Lightweight Browser",description:"後端限定唯讀擷取、預設停用；具備網路隔離才可自動回退／切換",capabilities:["extract"],engine:"Scouts",source:"builtin",enabled:false},
 {id:"browser-use",name:"Browser Use",description:"可選的任務規劃適配器，未部署前不可操作",capabilities:["plan","navigate","extract"],engine:"Zeus",source:"builtin",enabled:false},
 {id:"web-reader",name:"Scouts Web Reader",description:"目前既有的唯讀網頁閱讀",capabilities:["extract","research"],engine:"Scouts",source:"builtin",enabled:true}
];
const LEGACY_CAPS=new Set(["navigate","click","fill","scroll","extract","research","analyze","chart","read-file","schedule","plan"]);
export function validateCustomTool(input:unknown):LegacyWeiGuoTool{
 if(!input||typeof input!=="object")throw Error("工具格式不正確");
 const obj=input as Record<string,unknown>;
 if(typeof obj.id!=="string"||!/^[a-z][a-z0-9-]{2,40}$/.test(obj.id)||WEIGUO_BUILTINS.some(x=>x.id===obj.id)||BUILTIN_TOOLS.some(x=>x.id===obj.id))throw Error("工具 ID 不可覆蓋內建項目或格式不正確");
 if(typeof obj.name!=="string"||!obj.name.trim()||obj.name.length>64)throw Error("工具名稱不正確");
 if(!Array.isArray(obj.capabilities)||!obj.capabilities.length||obj.capabilities.length>11||obj.capabilities.some(x=>typeof x!=="string"||!LEGACY_CAPS.has(x)))throw Error("工具能力不正確");
 return {id:obj.id,name:obj.name.trim(),description:typeof obj.description==="string"?obj.description.slice(0,280):"",capabilities:[...new Set(obj.capabilities)] as string[],engine:"自訂工具",source:"custom",enabled:false};
}
export function classifyWeiGuoOperation(kind:string,authenticated:boolean,approved:boolean):"read"|"needs-approval"|"deny"{
 if(!authenticated)return "deny";
 if(["navigate","extract","scroll"].includes(kind))return "read";
 if(["click","fill"].includes(kind))return approved?"read":"needs-approval";
 return "deny";
}
