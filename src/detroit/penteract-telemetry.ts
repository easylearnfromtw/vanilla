/** October 5D funnel inference telemetry. Only actual provider counters
 * can populate observed shares; planned budget percentages are not measurements.
 * No prompts, responses, identities, IPs or payload fragments are retained.
 */
export type FunnelMetric={stage:"understand"|"answer";inputTokens:number|null;outputTokens:number|null;elapsedMs:number};
export type FunnelAudit={
 status:"no-understanding-pass"|"incomplete"|"measured";
 understandingGeneratedSharePct:number|null;
 understandingElapsedSharePct:number|null;
 targetGeneratedSharePct:55;
 targetMet:boolean|null;
 warning:"not-measured-watts";
};
const valid=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
export function auditObservedOctoberFunnel(metrics:readonly FunnelMetric[]):FunnelAudit{
 const blank:FunnelAudit={status:"incomplete",understandingGeneratedSharePct:null,
  understandingElapsedSharePct:null,targetGeneratedSharePct:55,targetMet:null,
  warning:"not-measured-watts"};
 const understand=metrics.find(m=>m.stage==="understand");
 if(!understand)return {...blank,status:"no-understanding-pass"};
 const answer=metrics.find(m=>m.stage==="answer");
 if(!answer||!valid(understand.outputTokens)||!valid(answer.outputTokens))return blank;
 const total=understand.outputTokens+answer.outputTokens;
 if(total===0)return blank;
 const share=Math.round(100*understand.outputTokens/total);
 const latency=valid(understand.elapsedMs)&&valid(answer.elapsedMs)&&
  understand.elapsedMs+answer.elapsedMs>0?
  Math.round(100*understand.elapsedMs/(understand.elapsedMs+answer.elapsedMs)):null;
 return {status:"measured",understandingGeneratedSharePct:share,
  understandingElapsedSharePct:latency,targetGeneratedSharePct:55,
  targetMet:share>=55,warning:"not-measured-watts"};
}

/** Only one compact snapshot remains in RAM; no storage, network, user text,
 * model name, tenant, URL or personal metadata. Studio reads this on demand.
 */
export type FunnelObservation={
 observedAtMs:number;summary:FunnelAudit;
 understandingGeneratedTokens:number|null;answerGeneratedTokens:number|null;
 understandingElapsedMs:number|null;answerElapsedMs:number|null;
};
let latest:FunnelObservation|null=null;
const listeners=new Set<(value:FunnelObservation|null)=>void>();
export function latestOctoberFunnelObservation():FunnelObservation|null{return latest;}
export function clearOctoberFunnelObservation(){
 latest=null;
 for(const listener of listeners){try{listener(null);}catch{}}
}
export function subscribeOctoberFunnelObservation(listener:(value:FunnelObservation|null)=>void):()=>void{
 listeners.add(listener);
 return ()=>{listeners.delete(listener);};
}
export function recordOctoberFunnelObservation(metrics:readonly FunnelMetric[],atMs=Date.now()):FunnelObservation{
 const summary=auditObservedOctoberFunnel(metrics);
 const understanding=metrics.find(m=>m.stage==="understand");
 const answer=metrics.find(m=>m.stage==="answer");
 const bounded=(n:unknown):number|null=>valid(n)&&n<=1_000_000_000?n:null;
 latest={observedAtMs:bounded(atMs)??0,summary,
  understandingGeneratedTokens:bounded(understanding?.outputTokens),
  answerGeneratedTokens:bounded(answer?.outputTokens),
  understandingElapsedMs:bounded(understanding?.elapsedMs),
  answerElapsedMs:bounded(answer?.elapsedMs)};
 for(const listener of listeners){try{listener(latest);}catch{}}
 return latest;
}
