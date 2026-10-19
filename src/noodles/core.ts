/**
 * NOODLES — model-agnostic, device-only decision improvement.
 *
 * Inspiration: Langfuse traces/evals, promptfoo regression tests, DSPy/GEPA
 * instruction optimisation, LiteLLM reliability routing.
 * This DOES NOT train third-party model weights or upload private prompts.
 *
 * Only explicit human ratings count as a quality signal. Successful completion
 * is operational reliability, not a correctness judgment.
 */
export type NoodlesTask="casual"|"code"|"analysis"|"writing"|"vision"|"general";
export type NoodlesIssue="incorrect"|"no_sources"|"too_long"|"too_short"|"bad_format"|"tool_failure";
export type NoodlesObservation={
 at:number;task:NoodlesTask;model:string;kind:"turn"|"run"|"rating"|"issue"|"tool";
 ok?:boolean;durationMs?:number;liked?:boolean;issue?:NoodlesIssue;
};
export type NoodlesState={version:1;enabled:boolean;observations:NoodlesObservation[];};
export const NOODLES_DEFAULT:NoodlesState={version:1,enabled:true,observations:[]};
const MAX_EVENTS=500,MAX_AGE=90*86400000;
const TASKS:NoodlesTask[]=["casual","code","analysis","writing","vision","general"];
const ISSUES:NoodlesIssue[]=["incorrect","no_sources","too_long","too_short","bad_format","tool_failure"];
export const NOODLES_ISSUES:{id:NoodlesIssue;label:string}[]=[
 {id:"incorrect",label:"內容／事實不正確"},
 {id:"no_sources",label:"缺少來源或引用"},
 {id:"too_long",label:"回答太冗長"},
 {id:"too_short",label:"回答太簡略"},
 {id:"bad_format",label:"格式不符合需求"},
 {id:"tool_failure",label:"工具沒有真正完成"},
];
export function sanitizeNoodlesState(value:unknown,now=Date.now()):NoodlesState{
 if(!value||typeof value!=="object")return {...NOODLES_DEFAULT,observations:[]};
 const obj=value as Partial<NoodlesState>;
 const items=Array.isArray(obj.observations)?obj.observations:[];
 const observations=items.slice(-MAX_EVENTS).filter((v):v is NoodlesObservation=>{
  if(!v||typeof v!=="object")return false;
  if(!TASKS.includes(v.task)||typeof v.model!=="string"||!v.model||v.model.length>100)return false;
  if(!["turn","run","rating","issue","tool"].includes(v.kind))return false;
  if(typeof v.at!=="number"||!Number.isFinite(v.at)||v.at<now-MAX_AGE||v.at>now+86400000)return false;
  if(v.kind==="run"&&(typeof v.ok!=="boolean"||typeof v.durationMs!=="number"||v.durationMs<0||v.durationMs>3600000))return false;
  if(v.kind==="rating"&&typeof v.liked!=="boolean")return false;
  if(v.kind==="issue"&&!ISSUES.includes(v.issue as NoodlesIssue))return false;
  return true;
 }).map(v=>{
  // Whitelist fields so imported/poisoned records cannot sneak user content
  // or tokens into the durable telemetry store or JSON export.
  const base={at:v.at,task:v.task,model:v.model,kind:v.kind};
  if(v.kind==="run")return {...base,kind:"run" as const,ok:v.ok!,durationMs:v.durationMs!};
  if(v.kind==="rating")return {...base,kind:"rating" as const,liked:v.liked!};
  if(v.kind==="issue")return {...base,kind:"issue" as const,issue:v.issue!};
  return {...base,kind:v.kind==="turn"?"turn" as const:"tool" as const};
 });
 return {version:1,enabled:obj.enabled!==false,observations};
}
export function appendNoodles(state:NoodlesState,event:NoodlesObservation,now=Date.now()):NoodlesState{
 if(!state.enabled)return state;
 const eventTime=Number.isFinite(event.at)?event.at:now;
 return sanitizeNoodlesState({...state,observations:[...state.observations,{...event,at:eventTime}]},now);
}
export type NoodlesModelStats={model:string;task:NoodlesTask;attempts:number;successes:number;ratings:number;likes:number;issues:number;averageLatencyMs:number|null};
export function modelStats(state:NoodlesState,task:NoodlesTask,model:string):NoodlesModelStats{
 const observations=state.observations.filter(e=>e.model===model&&e.task===task);
 const runs=observations.filter(e=>e.kind==="run");
 const ratings=observations.filter(e=>e.kind==="rating");
 const successes=runs.filter(e=>e.ok);
 return {model,task,attempts:runs.length,successes:successes.length,ratings:ratings.length,
  likes:ratings.filter(e=>e.liked).length,issues:observations.filter(e=>e.kind==="issue").length,
  averageLatencyMs:successes.length?Math.round(successes.reduce((n,e)=>n+(e.durationMs||0),0)/successes.length):null};
}
/** Bounded, confidence-shrunk preference: little feedback has little impact.
 * No quality score is inferred from model-provided text or successful API calls.
 */
export function noodlesModelAdjustment(state:NoodlesState,task:NoodlesTask,model:string):number{
 if(!state.enabled)return 0;
 const x=modelStats(state,task,model);
 const quality=x.ratings?14*((x.likes*2-x.ratings)/(x.ratings+8)):0;
 const reliability=x.attempts>=3?4*((x.successes-x.attempts)/(x.attempts+3)):0;
 return Math.max(-12,Math.min(12,quality+reliability));
}
/** Safe prompt adaptation across all providers; never override safety,
 * change model's system prompt order, or claim to retrain a remote model.
 */
export function noodlesGuidance(state:NoodlesState,task:NoodlesTask):string{
 if(!state.enabled)return "";
 const recent=state.observations.filter(x=>x.task===task&&x.kind==="issue").slice(-60);
 const count=(issue:NoodlesIssue)=>recent.filter(x=>x.issue===issue).length;
 const hints:string[]=[];
 if(count("incorrect")>=2)hints.push("重要結論先檢查邏輯、數值與已知事實；不能確定就表明不確定，不臆測。");
 if(count("no_sources")>=2)hints.push("若使用已提供的可信來源，明確連結每一項主張及相應證據；未取得來源時不可虛構引用。");
 if(count("too_long")>=2&&count("too_short")<2)hints.push("先以精簡答案回覆，細節按問題需要展開。");
 if(count("too_short")>=2&&count("too_long")<2)hints.push("提供足以操作的步驟與必要限制，避免只有籠統結論。");
 if(count("bad_format")>=2)hints.push("嚴格遵守本次要求的輸出結構；已有表格元件就不要重複列印 Markdown 表格。");
 if(count("tool_failure")>=2)hints.push("外部動作需以執行結果確認；只有真的完成才可回報成功，否則說明限制。");
 if(!hints.length)return "";
 return "\n\nNOODLES 本機品質校準（僅從使用者明確回饋推導；不得凌駕當次指令或安全規則）："+hints.slice(0,4).join(" ");
}
export type NoodlesSummary={enabled:boolean;totalTurns:number;totalRuns:number;failedRuns:number;humanRatings:number;feedbackIssues:number;toolActions:number;models:Array<{id:string;runs:number;ratings:number;likes:number}>};
export function noodlesSummary(state:NoodlesState):NoodlesSummary{
 const runs=state.observations.filter(e=>e.kind==="run");
 const ratings=state.observations.filter(e=>e.kind==="rating");
 const byModel=new Map<string,{id:string;runs:number;ratings:number;likes:number}>();
 for(const o of state.observations){
  if(o.kind!=="run"&&o.kind!=="rating")continue;
  const x=byModel.get(o.model)||{id:o.model,runs:0,ratings:0,likes:0};
  if(o.kind==="run")x.runs++;
  else{x.ratings++;if(o.liked)x.likes++;}
  byModel.set(o.model,x);
 }
 return {enabled:state.enabled,totalTurns:state.observations.filter(e=>e.kind==="turn").length,totalRuns:runs.length,failedRuns:runs.filter(x=>!x.ok).length,
  humanRatings:ratings.length,feedbackIssues:state.observations.filter(e=>e.kind==="issue").length,
  toolActions:state.observations.filter(e=>e.kind==="tool").length,
  models:[...byModel.values()].sort((a,b)=>b.runs-a.runs).slice(0,12)};
}
