import test from 'node:test';
import assert from 'node:assert/strict';
import {predictOctober,octoberSecurityPreflight} from './policy.mjs';

// Offline fixture: exercises routing guards, NOT trained model accuracy.
const labels=['OPS_MONITOR','OPS_DIAGNOSE','BUSINESS_REPORT','BUSINESS_INVESTIGATE','PLUGIN_ANALYZE','DENY','WAIT','ESCALATE'];
const fixture=(preferred=0)=>({
 features:Array.from({length:15},(_,i)=>'f'+i),
 labels,
 layers:[{weight:labels.map(()=>Array(15).fill(0)),bias:labels.map((_,i)=>i===preferred?18:-18)}]
});
const ctx={actorTenantId:'tenant_a',scopes:['metrics:read','ops:diagnose'],now:'2026-10-21T08:00:00Z'};
const task={tenantId:'tenant_a',mode:'ops',dueAt:'2026-10-20T08:00:00Z',failureRate:.12};

test('October security gate rejects cross-tenant attempts without reading weights',()=>{
 const result=predictOctober({...task,tenantId:'tenant_b'},ctx);
 assert.equal(result.decision,'DENY');
 assert.equal(result.guard,'tenant_or_scope');
 assert.equal(result.inferenceUsed,false);
 assert.equal(result.confidence,null);
 assert.equal(result.authorizedToExecute,false);
});

test('Missing scopes deny; future-due tasks wait, even with malformed weights',()=>{
 const denied=predictOctober(task,{...ctx,scopes:[]},{});
 const waiting=predictOctober({...task,dueAt:'2026-10-21T10:00:00Z'},ctx,{});
 assert.equal(denied.decision,'DENY');
 assert.equal(waiting.decision,'WAIT');
 assert.equal(denied.inferenceUsed,false);
 assert.equal(waiting.inferenceUsed,false);
});

test('High-privilege and sensitive plugin operations always escalate',()=>{
 const privileged=predictOctober({...task,privileged:true},ctx,fixture(0));
 const plugin={tenantId:'tenant_a',mode:'plugin',dueAt:task.dueAt,sensitive:true};
 const pluginCtx={...ctx,scopes:['plugin:read']};
 const sensitive=predictOctober(plugin,pluginCtx,fixture(4));
 assert.equal(privileged.decision,'ESCALATE');
 assert.equal(privileged.guard,'privileged_or_sensitive');
 assert.equal(sensitive.guard,'privileged_or_sensitive');
 assert.equal(privileged.inferenceUsed,false);
 assert.deepEqual(octoberSecurityPreflight(plugin,pluginCtx),{decision:'ESCALATE',guard:'privileged_or_sensitive'});
});

test('Privilege and sensitivity strings fail closed instead of becoming false',()=>{
 for(const [key,value] of [['privileged','true'],['privileged',1],['sensitive','false'],['sensitive',null]]){
  assert.throws(()=>predictOctober({...task,[key]:value},ctx,fixture(0)),/INVALID_BOOLEAN/);
 }
});

test('Missing or malformed trained weights yield explicit escalation',()=>{
 for(const weights of [null,{}, {features:Array(15),labels:Array(8),layers:[]} ]){
  const out=predictOctober(task,ctx,weights);
  assert.equal(out.decision,'ESCALATE');
  assert.equal(out.guard,'weights_unavailable_or_invalid');
  assert.equal(out.inferenceUsed,false);
  assert.equal(out.authorizedToExecute,false);
 }
});

test('Injected mock inference may recommend allowed read-only action, never authorize it',()=>{
 const result=predictOctober(task,ctx,fixture(1));
 assert.equal(result.decision,'OPS_DIAGNOSE');
 assert.equal(result.inferenceUsed,true);
 assert.equal(result.authorizedToExecute,false);
 assert.ok(result.confidence>=0.8);
});

test('Out-of-scope labels and low-confidence predictions cannot escape gate',()=>{
 const wrong=predictOctober(task,ctx,fixture(4));
 assert.equal(wrong.decision,'ESCALATE');
 assert.equal(wrong.guard,'model_uncertain_or_out_of_scope');
 const weak={features:Array.from({length:15},(_,i)=>'f'+i),labels,
  layers:[{weight:labels.map(()=>Array(15).fill(0)),bias:labels.map(()=>0)}]};
 const uncertain=predictOctober(task,ctx,weak);
 assert.equal(uncertain.decision,'ESCALATE');
 assert.equal(uncertain.guard,'confidence_below_threshold');
});

test('Invalid numeric and time inputs are rejected before inference',()=>{
 assert.throws(()=>predictOctober({...task,failureRate:Infinity},ctx,fixture(0)),/INVALID_FEATURE/);
 assert.throws(()=>predictOctober({...task,dueAt:'not-a-date'},ctx,fixture(0)),/INVALID_TIME/);
});
