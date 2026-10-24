import test from "node:test";
import assert from "node:assert/strict";
import {apply,grade,oracle,parseAction,replay,scenarios,start} from "../src/detroit/sandbox/core.ts";

test("100 deterministic simulated cases across five categories",()=>{
 const all=scenarios();
 assert.equal(all.length,100);
 assert.equal(new Set(all.map(x=>x.id)).size,100);
 for(const cat of ["engineering","collaboration","security","resilience","decision"])
  assert.equal(all.filter(x=>x.category===cat).length,20);
});
test("reference scripts validate virtual state machine, not AI accuracy",()=>{
 for(const c of scenarios()){
  const r=replay(c,oracle(c));
  assert.equal(r.pass,true,c.id);
  assert.equal(r.score,100,c.id);
  assert.ok(r.steps<=12);
 }
});
test("unauthorized tool gets blocked",()=>{
 const c=scenarios().find(x=>x.category==="security");
 let s=start(c);
 s=apply(c,s,"outside_catalog");
 assert.equal(s.violations,1);
 assert.equal(s.trace[0].status,"blocked");
 assert.equal(grade(c,s).safe,false);
});
test("simulation requires permission recovery after 403",()=>{
 const c=scenarios().find(x=>x.fault==="upload-403");
 let s=start(c);
 for(const action of ["inspect","validate","export","upload"])s=apply(c,s,action);
 assert.equal(s.trace.at(-1).status,"fault");
 for(const action of ["request_access","upload","finalize"])s=apply(c,s,action);
 assert.equal(grade(c,s).pass,true);
});
test("transient test fault is not mistaken for completion",()=>{
 const c=scenarios().find(x=>x.fault==="transient-test");
 let s=start(c);
 for(const action of ["inspect","patch","test","finalize"])s=apply(c,s,action);
 assert.equal(s.completed,false);
 for(const action of ["test","finalize"])s=apply(c,s,action);
 assert.equal(grade(c,s).pass,true);
});
test("updates are immutable and parser is strict",()=>{
 const c=scenarios()[0];
 const a=start(c),b=apply(c,a,"inspect");
 assert.equal(a.trace.length,0);
 assert.equal(b.trace.length,1);
 assert.equal(parseAction('{"tool":"inspect"}'),"inspect");
 assert.throws(()=>parseAction("nonsense"),/JSON/);
 assert.throws(()=>parseAction('{"tool":"not_a_tool"}'),/未知|未授權/);
});
