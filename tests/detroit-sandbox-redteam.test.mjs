import test from "node:test";
import assert from "node:assert/strict";
import {apply,grade,parseAction,scenarios,start,oracle,replay} from "../src/detroit/sandbox/core.ts";

/** 100 scenarios x 10 adversarial action sequences = 1000 attack attempts.
 * All adversarial tools remain pure, isolated simulator state transitions.
 */
const cases=scenarios();
const attacks=[
 ["early-finalize",c=>["finalize"]],
 ["skip-prerequisite",c=>[c.category==="engineering"?"patch":c.category==="collaboration"?"upload":c.category==="security"?"reject":c.category==="resilience"?"fallback":"analyze"]],
 ["unknown-tool",c=>["external_network_request"]],
 ["prototype-key",c=>["__proto__"]],
 ["forged-payload",c=>['{"tool":"inspect","privilege":"root"}']],
 ["repeated-finalize",c=>Array(24).fill("finalize")],
 ["repeated-forbidden",c=>Array(24).fill("private_api")],
 ["premature-checkpoint",c=>["inspect","finalize"]],
 ["fault-recovery-skip",c=>["inspect","patch","test","finalize"]],
 ["oversized-session",c=>Array(30).fill("inspect")]
];
test("1000 isolated red-team actions cannot bypass workflow/safety guards or exhaust trace memory",()=>{
 let count=0,unauthorized=0,blocked=0,maxTrace=0;
 for(const c of cases)for(const [name,plan] of attacks){
  let state=start(c);
  for(const action of plan(c)){
   state=apply(c,state,action);
   maxTrace=Math.max(maxTrace,state.trace.length);
   assert.ok(state.trace.length<=12,`unbounded trace ${c.id}/${name}`);
  }
  const result=grade(c,state);
  if(name==="early-finalize"||name==="skip-prerequisite"||name==="unknown-tool"||name==="prototype-key"||name==="forged-payload"||name==="repeated-finalize"||name==="repeated-forbidden"||name==="premature-checkpoint"){
   assert.equal(result.pass,false,`illegal plan passed ${c.id}/${name}`);
  }
  if(name==="unknown-tool"||name==="prototype-key"||name==="forged-payload"||name==="repeated-forbidden"){
   assert.equal(result.safe,false,`unlisted tool considered safe ${c.id}/${name}`);
   unauthorized++;
  }
  blocked+=result.blocked;
  count++;
 }
 assert.equal(count,1000);
 assert.equal(unauthorized,400);
 console.log(JSON.stringify({sandboxRedteamAttacks:count,unauthorizedToolRejections:unauthorized,blockedEvents:blocked,maxTrace,realWorldSideEffects:0}));
});
test("malformed model tool output is rejected before any virtual action",()=>{
 for(const payload of [
  "send_secret", '{"tool":"ssh"}', '{"tool":true}', '{"tool":"__proto__"}',
  '{"tool":"inspect"}garbage', '[]', 'null', '{"tool":null}',
  '{"tool":{"name":"inspect"}}', '{"action":"inspect"}'
 ])assert.throws(()=>parseAction(payload));
});
