// Store only aggregate operational metrics; never persist chat text, prompts, API keys, or responses.
const KEY="vanilla.model.health.v1";
type Observation={ok:boolean;durationMs:number;at:number};
type Health=Record<string,Observation[]>;
function load():Health{
 try{
  const obj:unknown=JSON.parse(localStorage.getItem(KEY)||"{}");
  if(!obj||typeof obj!=="object"||Array.isArray(obj))return {};
  const parsed:Health={};
  for(const [id,value] of Object.entries(obj).slice(-40)){
   if(!Array.isArray(value))continue;
   parsed[id]=value.filter((v):v is Observation=>Boolean(v&&typeof v==="object"&&typeof v.ok==="boolean"&&typeof v.durationMs==="number"&&typeof v.at==="number")).slice(-12);
  }
  return parsed;
 }catch{return {};}
}
export function recordModelRun(modelId:string,ok:boolean,durationMs:number){
 if(!modelId||durationMs<0)return;
 const data=load();
 data[modelId]=[...(data[modelId]||[]),{ok,durationMs:Math.round(durationMs),at:Date.now()}].slice(-12);
 try{localStorage.setItem(KEY,JSON.stringify(Object.fromEntries(Object.entries(data).slice(-40))));}catch{}
}
export function getHealthAdjustment(modelId:string,includeLatency=true):number{
 const items=load()[modelId]||[];
 if(items.length===0)return 0;
 const recent=items.slice(-6);
 const failures=recent.filter(x=>!x.ok).length;
 const recentFailures=items.slice(-3).filter(x=>!x.ok).length;
 const successes=recent.filter(x=>x.ok);
 const average=successes.length?successes.reduce((n,x)=>n+x.durationMs,0)/successes.length:0;
 const latencyPenalty=average>90000?-9:average>40000?-5:average>15000?-2:0;
 // Quality-first selection still penalizes failures, but never demotes a good model solely for being slower.
 return -Math.min(20,failures*4+recentFailures*3)+(includeLatency?latencyPenalty:0);
}
export function clearModelHealth(){try{localStorage.removeItem(KEY);}catch{}}
