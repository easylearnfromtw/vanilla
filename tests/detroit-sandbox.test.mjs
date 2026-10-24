import test from 'node:test';
import assert from 'node:assert/strict';
import {createSandboxScenarios,runSandboxScenario,runSandboxBatch,referenceSandboxPolicy,sandboxSummary} from '../src/detroit/sandbox-engine.ts';
const cases=createSandboxScenarios();
test('100 immutable fixtures and 20 per each domain',()=>{
 assert.equal(cases.length,100);
 assert.equal(new Set(cases.map(s=>s.id)).size,100);
 for(const domain of ['engineering','workflow','security','reliability','strategy'])assert.equal(cases.filter(s=>s.domain===domain).length,20);
 assert.ok(cases.every(Object.isFrozen));
});
test('scripted reference policy passes 100 mocked scenarios; not a model benchmark',async()=>{
 const results=await runSandboxBatch(cases,referenceSandboxPolicy);
 assert.equal(results.length,100);
 assert.ok(results.every(r=>r.passed&&r.score===100));
 assert.deepEqual(sandboxSummary(results).byDomain.map(x=>x.passed),[20,20,20,20,20]);
});
test('injected transient test failure and node failure recover',async()=>{
 const x=await runSandboxScenario(cases.find(s=>s.id==='engineering-03'),referenceSandboxPolicy);
 assert.equal(x.faultsInjected,1);
 assert.deepEqual(x.transcript.filter(t=>t.action==='verify').map(t=>t.outcome),['fault','ok']);
 const y=await runSandboxScenario(cases.find(s=>s.id==='reliability-01'),referenceSandboxPolicy);
 assert.equal(y.faultsInjected,1);
 assert.ok(y.transcript.some(t=>t.action==='switch_node'));
});
test('prompt injection and unauthorized simulated writes fail closed',async()=>{
 const sec=await runSandboxScenario(cases.find(s=>s.id==='security-01'),o=>o.stage?'execute':'inspect');
 assert.equal(sec.safetyViolation,true);assert.equal(sec.passed,false);assert.equal(sec.score,0);
 const wf=await runSandboxScenario(cases.find(s=>s.id==='workflow-01'),o=>o.stage===0?'inspect':o.stage===1?'verify':'execute');
 assert.equal(wf.safetyViolation,true);assert.equal(wf.score,0);
});
test('wrong answers do not advance, action budget closes the loop',async()=>{
 const x=await runSandboxScenario(cases[0],()=> 'publish',3);
 assert.equal(x.passed,false);assert.equal(x.completedStages,0);assert.equal(x.errors,3);assert.equal(x.actions,3);
});
test('reject forged fixtures, oversized batches and invalid action budgets',async()=>{
 await assert.rejects(runSandboxScenario({...cases[0],brief:'forged'},referenceSandboxPolicy),/Unknown/);
 await assert.rejects(runSandboxBatch([...cases,cases[0]],referenceSandboxPolicy),/Maximum/);
 await assert.rejects(runSandboxScenario(cases[0],referenceSandboxPolicy,10000),/Invalid/);
});
test('policy exceptions fail rather than pretending to have executed tools',async()=>{
 const x=await runSandboxScenario(cases[0],async()=>{throw Error('offline')});
 assert.equal(x.passed,false);assert.equal(x.actions,1);
});
