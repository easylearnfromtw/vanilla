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
