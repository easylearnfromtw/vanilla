/** 衞國 declarative tool connectors. Registration does not execute arbitrary code. */
export type WeiGuoTool={id:string;label:string;kind:"scouts"|"cream"|"atriensis"|"web"|"custom";description:string;enabled:boolean;permissions:("read"|"analyze"|"export")[]};
export const BUILTIN_TOOLS:readonly WeiGuoTool[]=[
 {id:"scouts-browser",label:"Scouts Browser",kind:"scouts",description:"Playwright 開啟、導覽及擷取已授權的公開網頁",enabled:true,permissions:["read"]},
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