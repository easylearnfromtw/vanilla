import test from 'node:test';
import assert from 'node:assert/strict';
import {predictOctober} from './policy.mjs';
const ctx={actorTenantId:'tenant_demo',scopes:['metrics:read','ops:diagnose'],now:'2026-10-20T09:00:00Z'};
const job={tenantId:'tenant_demo',mode:'ops',dueAt:'2026-10-20T07:00:00Z',failureRate:0.12};
test('October uses trained weights to recommend mock diagnostics',()=>{
 const p=predictOctober(job,ctx);assert.equal(p.decision,'OPS_DIAGNOSE');assert.equal(p.authorizedToExecute,false);
});
test('Different tenant is denied irrespective of model confidence',()=>{
 const p=predictOctober({...job,tenantId:'tenant_other'},ctx);assert.equal(p.decision,'DENY');assert.equal(p.guard,'tenant_or_scope');
});
test('Missing scope denied and early schedule waits',()=>{
 assert.equal(predictOctober(job,{...ctx,scopes:[]}).decision,'DENY');
 assert.equal(predictOctober(job,{...ctx,now:'2026-10-20T05:00:00Z'}).decision,'WAIT');
});
test('High privilege always escalates',()=>{
 assert.equal(predictOctober({...job,privileged:true},ctx).decision,'ESCALATE');
});
test('Business negative margin is investigated but not executed',()=>{
 const p=predictOctober({tenantId:'tenant_demo',mode:'business',dueAt:'2026-10-20T07:00:00Z',npvMargin:-0.5,operatingMargin:-0.2},
 {...ctx,scopes:['metrics:read','report:write']});
 assert.equal(p.decision,'BUSINESS_INVESTIGATE');assert.equal(p.authorizedToExecute,false);
});
