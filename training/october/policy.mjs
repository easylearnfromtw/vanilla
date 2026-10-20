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
export function predictOctober(task,ctx,weights=JSON.parse(readFileSync(MODEL_PATH,'utf8'))){
 const f=features(task,ctx);
 if(weights.features?.length!==15||weights.labels?.length!==8)throw new Error('INCOMPATIBLE_WEIGHTS');
 const distribution=neuralScores(weights,f.vec);
 const choice=distribution.indexOf(Math.max(...distribution)),raw=weights.labels[choice];
 // Model policy suggestions NEVER authorize execution.
 let label=raw,guard='none';
 if(!f.tenantMatch||!f.scopeOk){label='DENY';guard='tenant_or_scope';}
 else if(!f.due){label='WAIT';guard='not_due';}
 else if(f.privileged||(f.sensitive&&task.mode==='plugin')){label='ESCALATE';guard='privileged_or_sensitive';}
 const permitted={ops:new Set(['OPS_MONITOR','OPS_DIAGNOSE']),business:new Set(['BUSINESS_REPORT','BUSINESS_INVESTIGATE']),plugin:new Set(['PLUGIN_ANALYZE'])};
 if(guard==='none'&&!permitted[task.mode].has(label)){label='ESCALATE';guard='model_uncertain_or_out_of_scope';}
 const confidence=Math.max(...distribution);
 if(guard==='none'&&confidence<0.80){label='ESCALATE';guard='confidence_below_threshold';}
 return {name:'October (阿土伯)',trainedComponent:'supervised-policy-head-v0.1',status:'SIMULATED_RECOMMENDATION',
  decision:label,confidence:Math.round(confidence*10000)/10000,guard,authorizedToExecute:false};
}
if(process.argv[1]?.endsWith('policy.mjs')){
 const demo={mode:'ops',tenantId:'tenant_demo',dueAt:'2026-10-20T07:00:00Z',failureRate:0.12};
 console.log(JSON.stringify(predictOctober(demo,{actorTenantId:'tenant_demo',scopes:['metrics:read','ops:diagnose'],now:'2026-10-20T09:00:00Z'}),null,2));
}
