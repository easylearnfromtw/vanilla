/** October (阿土伯) trained supervised policy — simulated choices only.
 * No LLM weights, OS access, credentials, network, real scheduling, or trading.
 */
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
export const MODEL_PATH=join(here,'weights','october-policy-v0.1.json');
const MODES=['ops','business','plugin'];
const number=(v,min,max,name)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error('INVALID_FEATURE:'+name);return v;};
function features(task,ctx){
 if(!task||!ctx||!MODES.includes(task.mode))throw new Error('INVALID_TASK');
 const verified=ctx.actorTenantId;
 if(typeof verified!=='string'||!verified||typeof task.tenantId!=='string'||!task.tenantId)throw new Error('AUTHENTICATION_REQUIRED');
 const scopes=Array.isArray(ctx.scopes)?ctx.scopes:[];
 const required=task.mode==='ops'?['metrics:read','ops:diagnose']:task.mode==='business'?['metrics:read','report:write']:['plugin:read'];
 const tenantMatch=+(task.tenantId===verified);
 const scopeOk=+required.every(s=>scopes.includes(s));
 const clock=Date.parse(ctx.now??'');const dueAt=Date.parse(task.dueAt??'');
 if(!Number.isFinite(clock)||!Number.isFinite(dueAt))throw new Error('INVALID_TIME');
 const due=+(clock>=dueAt);
 // Unknown/non-boolean privilege flags must never be interpreted as safe "false".
 for(const key of ['privileged','sensitive']){
  if(task[key]!==undefined&&typeof task[key]!=='boolean')throw new Error('INVALID_BOOLEAN:'+key);
 }
 const privileged=+(task.privileged===true),sensitive=+(task.sensitive===true);
 const failure=number(task.failureRate??0,0,0.18,'failureRate');
 const npv=number(task.npvMargin??0,-1,1,'npvMargin');
 const operating=number(task.operatingMargin??0,-1,1,'operatingMargin');
 const budget=number(task.budgetFraction??0,0,1,'budgetFraction');
 const latency=number(task.latencyFraction??0,0,1,'latencyFraction');
 const retry=number(task.retryFraction??0,0,1,'retryFraction');
 const anomaly=number(task.anomalyFraction??0,0,1,'anomalyFraction');
 const vec=[+(task.mode==='ops'),+(task.mode==='business'),+(task.mode==='plugin'),tenantMatch,scopeOk,due,privileged,sensitive,failure/0.18,npv,operating,budget,latency,retry,anomaly];
 return {vec,tenantMatch,scopeOk,due,privileged,sensitive};
}
export function neuralScores(weights,vector){
 let activations=vector;
 for(let i=0;i<weights.layers.length;i++){
  const {weight,bias}=weights.layers[i];
  if(!Array.isArray(weight)||!Array.isArray(bias)||weight.length!==bias.length)throw new Error('INVALID_WEIGHTS');
  activations=weight.map((row,j)=>{
   if(row.length!==activations.length)throw new Error('INVALID_WEIGHTS_SHAPE');
   let v=bias[j];for(let k=0;k<row.length;k++)v+=row[k]*activations[k];
   return i<weights.layers.length-1?Math.max(0,v):v;
  });
 }
 const maxLogit=Math.max(...activations),exps=activations.map(v=>Math.exp(v-maxLogit)),total=exps.reduce((a,b)=>a+b,0);
 return exps.map(v=>v/total);
}
/** Pure security gate; no model weights or neural recommendation can override it.
 * Context MUST originate from an authenticated, trusted backend, never the LLM.
 */
function hardGuard(f,mode){
 if(!f.tenantMatch||!f.scopeOk)return {decision:'DENY',guard:'tenant_or_scope'};
 if(!f.due)return {decision:'WAIT',guard:'not_due'};
 if(f.privileged||(f.sensitive&&mode==='plugin'))return {decision:'ESCALATE',guard:'privileged_or_sensitive'};
 return null;
}
export function octoberSecurityPreflight(task,ctx){
 const f=features(task,ctx);
 return hardGuard(f,task.mode);
}
const policyResult=(decision,guard,confidence=null,inferenceUsed=false)=>({
 name:'October (阿土伯)',
 trainedComponent:inferenceUsed?'supervised-policy-head-v0.1':'none',
 status:'SIMULATED_RECOMMENDATION',decision,confidence,guard,
 inferenceUsed,authorizedToExecute:false
});
/** Offline and authorization-safe. Missing or corrupted weights => ESCALATE, never execute. */
export function predictOctober(task,ctx,providedWeights){
 const f=features(task,ctx);
 const blocked=hardGuard(f,task.mode);
 // Hard denials must not require a training artifact or trigger model loading.
 if(blocked)return policyResult(blocked.decision,blocked.guard);
 let weights=providedWeights;
 try{
  if(weights===undefined)weights=JSON.parse(readFileSync(MODEL_PATH,'utf8'));
  if(!weights||weights.features?.length!==15||weights.labels?.length!==8||!Array.isArray(weights.layers)||!weights.layers.length)
   return policyResult('ESCALATE','weights_unavailable_or_invalid');
  const distribution=neuralScores(weights,f.vec);
  if(distribution.length!==8||distribution.some(v=>!Number.isFinite(v)||v<0||v>1))
   return policyResult('ESCALATE','weights_unavailable_or_invalid');
  const confidence=Math.max(...distribution);
  if(!Number.isFinite(confidence))return policyResult('ESCALATE','weights_unavailable_or_invalid');
  const choice=distribution.indexOf(confidence),raw=weights.labels[choice];
  // The neural head suggests only simulated labels; it never authorizes execution.
  const permitted={ops:new Set(['OPS_MONITOR','OPS_DIAGNOSE']),business:new Set(['BUSINESS_REPORT','BUSINESS_INVESTIGATE']),plugin:new Set(['PLUGIN_ANALYZE'])};
  if(!permitted[task.mode].has(raw))return policyResult('ESCALATE','model_uncertain_or_out_of_scope',confidence,true);
  if(confidence<0.80)return policyResult('ESCALATE','confidence_below_threshold',confidence,true);
  return policyResult(raw,'none',Math.round(confidence*10000)/10000,true);
 }catch{
  // Never turn a bad/missing checkpoint or malformed neural layer into permission.
  return policyResult('ESCALATE','weights_unavailable_or_invalid');
 }
}
if(process.argv[1]?.endsWith('policy.mjs')){
 const demo={mode:'ops',tenantId:'tenant_demo',dueAt:'2026-10-20T07:00:00Z',failureRate:0.12};
 console.log(JSON.stringify(predictOctober(demo,{actorTenantId:'tenant_demo',scopes:['metrics:read','ops:diagnose'],now:'2026-10-20T09:00:00Z'}),null,2));
}
