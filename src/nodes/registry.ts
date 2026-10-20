/** Explicitly paired Windows nodes; secrets live in sessionStorage, not Drive. */
export type NodeInfo={id:string;name:string;endpoint:string;models:string[];availableRamGB:number|null;availableVramGB:number|null;activeJobs:number;maxConcurrentJobs:number;queueDepth:number;power:string;health:string;latencyMs:number};
type Known={id:string;name:string;endpoint:string};
const KEY="vanilla.nodes.v1",AUTH="vanilla.nodes.tokens.v1";
export function cleanEndpoint(value:string):string{
 const u=new URL(value.trim());
 if(u.username||u.password||u.search||u.hash||(u.pathname!=="/"&&u.pathname!==""))throw Error("節點網址包含無效資訊");
 if(!(u.protocol==="http:"&&["127.0.0.1","localhost"].includes(u.hostname)&&u.port==="18765")&&!(u.protocol==="https:"&&u.hostname.endsWith(".ts.net")))throw Error("僅允許本機 18765 或 Tailscale 私人 HTTPS");
 return u.origin;
}
function readAuth():Record<string,string>{try{return JSON.parse(sessionStorage.getItem(AUTH)||"{}");}catch{return {};}}
export function knownNodes():Known[]{try{const a=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(a)?a.filter((n):n is Known=>typeof n?.id==="string"&&typeof n?.name==="string"&&typeof n?.endpoint==="string").filter(n=>{try{return cleanEndpoint(n.endpoint)===n.endpoint;}catch{return false;}}).slice(0,8):[];}catch{return [];}}
export function authFor(id:string):string{return readAuth()[id]||"";}
export function hasNodes():boolean{return knownNodes().some(n=>Boolean(authFor(n.id)));}
export function removeNode(id:string){localStorage.setItem(KEY,JSON.stringify(knownNodes().filter(n=>n.id!==id)));const a=readAuth();delete a[id];sessionStorage.setItem(AUTH,JSON.stringify(a));window.dispatchEvent(new Event("vanilla-nodes-changed"));}
export async function probe(endpoint:string,token:string):Promise<NodeInfo>{
 const base=cleanEndpoint(endpoint),controller=new AbortController();if(token.length<48)throw Error("配對權杖不完整");
 const time=setTimeout(()=>controller.abort(),6000),start=performance.now();
 try{
  const r=await fetch(base+"/v1/status",{headers:{Authorization:"Bearer "+token},signal:controller.signal,redirect:"error",cache:"no-store"});
  if(!r.ok)throw Error("節點回應 HTTP "+r.status);
  const j=await r.json();
  if(!/^[a-f0-9]{24}$/.test(j.id)||!Array.isArray(j.models)||!Number.isFinite(j.activeJobs)||!Number.isFinite(j.maxConcurrentJobs))throw Error("無法驗證節點狀態");
  return {id:j.id,name:"Windows "+j.id.slice(0,6),endpoint:base,models:j.models.filter((m:unknown)=>typeof m==="string"),availableRamGB:typeof j.availableRamGB==="number"?j.availableRamGB:null,availableVramGB:typeof j.availableVramGB==="number"?j.availableVramGB:null,activeJobs:j.activeJobs,maxConcurrentJobs:j.maxConcurrentJobs,queueDepth:Number(j.queueDepth)||0,power:j.power||"unknown",health:j.health||"degraded",latencyMs:Math.round(performance.now()-start)};
 }finally{clearTimeout(time);}
}
export async function pairNode(endpoint:string,token:string):Promise<NodeInfo>{
 const info=await probe(endpoint,token.trim());
 localStorage.setItem(KEY,JSON.stringify([...knownNodes().filter(n=>n.id!==info.id),{id:info.id,endpoint:info.endpoint,name:info.name}].slice(0,8)));
 sessionStorage.setItem(AUTH,JSON.stringify({...readAuth(),[info.id]:token.trim()}));
 window.dispatchEvent(new Event("vanilla-nodes-changed"));return info;
}
export async function availableNodes():Promise<NodeInfo[]>{
 const a=await Promise.all(knownNodes().filter(n=>authFor(n.id)).map(async n=>{try{const status=await probe(n.endpoint,authFor(n.id));return status.id===n.id?status:null;}catch{return null;}}));
 return a.filter((n):n is NodeInfo=>n!==null);
}
export function selectNode(nodes:readonly NodeInfo[],model?:string):NodeInfo|null{
 const eligible=nodes.filter(n=>n.health==="healthy"&&n.power!=="battery"&&n.activeJobs<n.maxConcurrentJobs&&n.models.length>0&&(!model||n.models.includes(model)));
 eligible.sort((a,b)=>a.activeJobs/a.maxConcurrentJobs-b.activeJobs/b.maxConcurrentJobs||a.queueDepth-b.queueDepth||(b.availableVramGB??0)-(a.availableVramGB??0)||a.latencyMs-b.latencyMs);
 return eligible[0]||null;
}
