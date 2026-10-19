/** 衞國 is an opt-in browser-automation tool registry, never a second LLM. 
 * Catalog entries are capability declarations, NOT executable browser or JavaScript code.
 * Permission decisions always belong to Zeus/Athena and a verified backend identity.
 */
export type WeiGuoTool={id:string;name:string;description:string;engine:string;capabilities:string[];source:"builtin"|"custom";enabled:boolean};
export const WEIGUO_BUILTINS:readonly WeiGuoTool[]=[
 {id:"playwright",name:"Playwright Browser",description:"開啟指定網頁、點擊、輸入、捲動與擷取文字；需後端與使用者核准",engine:"Scouts",capabilities:["navigate","click","fill","scroll","extract"],source:"builtin",enabled:false},
 {id:"browser-use",name:"Browser Use Adapter",description:"自然語言網頁操作的可選適配器；不代表目前已部署",engine:"Merlin / Zeus",capabilities:["plan","navigate","extract"],source:"builtin",enabled:false},
 {id:"web-reader",name:"Scouts Web Reader",description:"利用現有 Vanilla 網頁閱讀與搜尋作為唯讀取證工具",engine:"Scouts",capabilities:["extract","research"],source:"builtin",enabled:true},
 {id:"cream",name:"CREAM",description:"將確定性統計及可追溯圖表接入瀏覽工作流",engine:"CREAM",capabilities:["analyze","chart"],source:"builtin",enabled:true},
 {id:"atriensis",name:"Atriensis Files",description:"將受權讀取的附件與索引交由既有檔案管理",engine:"Atriensis",capabilities:["read-file"],source:"builtin",enabled:true},
 {id:"persistent-jobs",name:"Persistent Jobs",description:"網頁變更追蹤可交由已部署的後端定期執行",engine:"Chronos",capabilities:["schedule"],source:"builtin",enabled:false}
];
export const WEIGUO_STORAGE="vanilla.weiguo.tools.v1";
const RE=/^[a-z][a-z0-9-]{1,39}$/;
const allowedCaps=new Set(["navigate","click","fill","scroll","extract","research","analyze","chart","read-file","schedule","plan"]);
export function validateCustomTool(value:unknown):WeiGuoTool{
 if(!value||typeof value!=="object")throw Error("工具格式錯誤");
 const x=value as Record<string,unknown>;
 const id=String(x.id||"").trim().toLowerCase(),name=String(x.name||"").trim(),description=String(x.description||"").trim();
 if(!RE.test(id)||WEIGUO_BUILTINS.some(y=>y.id===id))throw Error("ID 只能使用英文小寫、數字與連字號，且不可覆蓋內建工具");
 if(!name||name.length>64||description.length>280)throw Error("工具名稱或說明不符合長度限制");
 if(!Array.isArray(x.capabilities)||x.capabilities.length>11||!x.capabilities.length||x.capabilities.some(v=>typeof v!=="string"||!allowedCaps.has(v)))throw Error("能力類別不正確");
 return {id,name,description,engine:"自訂工具",capabilities:[...new Set(x.capabilities as string[])],source:"custom",enabled:false};
}
export function loadWeiGuoTools():WeiGuoTool[]{
 try{const raw=JSON.parse(localStorage.getItem(WEIGUO_STORAGE)||"[]") as unknown;if(!Array.isArray(raw))return [];
  return raw.slice(0,30).flatMap((v:unknown)=>{try{return [validateCustomTool(v)]}catch{return []}});}
 catch{return []}
}
export function saveWeiGuoTools(tools:readonly WeiGuoTool[]):void{
 if(tools.length>30)throw Error("目前最多可註冊 30 個自訂工具");
 const validated=tools.map(validateCustomTool);
 if(new Set(validated.map(t=>t.id)).size!==validated.length)throw Error("工具 ID 不可重複");
 localStorage.setItem(WEIGUO_STORAGE,JSON.stringify(validated));
}
/** Browser authority is NOT granted by a UI tool or a page claiming to be administrator. */
export function classifyWeiGuoOperation(kind:string,authenticated:boolean,approved:boolean):"read"|"needs-approval"|"deny"{
 if(!authenticated)return "deny";
 if(["navigate","extract","scroll"].includes(kind))return "read";
 if(["click","fill"].includes(kind))return approved?"read":"needs-approval";
 return "deny";
}
