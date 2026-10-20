import test from "node:test";
import assert from "node:assert/strict";
import {planDetroitNode} from "../src/detroit/node-scheduler.ts";
const now=1_800_000_000_000;
const node=(id,extra={})=>({id,platform:"windows",roles:["inference"],capabilities:["ollama"],models:["qwen3:8b"],trusted:true,health:"healthy",network:"tailnet",lastHeartbeatMs:now-1000,availableRamGB:20,availableVramGB:5,activeJobs:0,maxConcurrentJobs:1,queueDepth:0,latencyMs:40,power:"ac",...extra});
const req={role:"inference",model:"qwen3:8b",privateMode:false};

test("selects an authenticated, fresh, available Windows node",()=>{
 const plan=planDetroitNode(req,[node("busy",{activeJobs:1}),node("win-3050")],now);
 assert.equal(plan.state,"planned"); assert.equal(plan.nodeId,"win-3050");
});
test("rejects stale, offline, untrusted and fake models",()=>{
 for(const n of [node("a",{trusted:false}),node("b",{health:"offline"}),node("c",{lastHeartbeatMs:now-60000}),node("d",{models:["other"]}),node("e",{network:"lan"})])
  assert.equal(planDetroitNode(req,[n],now).state,"unavailable");
});
test("private mode and unapproved sensitive work never route remotely",()=>{
 assert.equal(planDetroitNode({...req,privateMode:true},[node("pc")],now).state,"unavailable");
 assert.equal(planDetroitNode({...req,requiresApproval:true,approved:false},[node("pc")],now).state,"unavailable");
});
test("30B RAM budget must be measured instead of assuming 6GB VRAM is enough",()=>{
 const ask={...req,model:"30b-q4",minAvailableRamGB:24};
 assert.equal(planDetroitNode(ask,[node("pc",{models:["30b-q4"],availableRamGB:12})],now).state,"unavailable");
 assert.equal(planDetroitNode(ask,[node("pc",{models:["30b-q4"],availableRamGB:null})],now).state,"unavailable");
 assert.equal(planDetroitNode(ask,[node("pc",{models:["30b-q4"],availableRamGB:26})],now).state,"planned");
});
test("battery guard, tool capabilities and deterministic failover candidates",()=>{
 const pcs=[node("battery",{power:"battery"}),node("busy",{queueDepth:3}),node("idle"),node("tool",{roles:["tool"],capabilities:["retina"],models:[]})];
 const p=planDetroitNode(req,pcs,now);
 assert.equal(p.nodeId,"idle"); assert.deepEqual(p.alternatives,["busy"]);
 assert.equal(planDetroitNode({...req,role:"tool",model:undefined,capability:"retina"},pcs,now).nodeId,"tool");
 assert.equal(planDetroitNode(req,[pcs[0]],now).state,"unavailable");
 assert.equal(planDetroitNode({...req,allowBattery:true},[pcs[0]],now).state,"planned");
});
test("invalid capacity, future heartbeats and negative quotas are rejected",()=>{
 for(const n of [node("x",{maxConcurrentJobs:0}),node("x",{queueDepth:-1}),node("x",{lastHeartbeatMs:now+30000})])
  assert.equal(planDetroitNode(req,[n],now).state,"unavailable");
 assert.equal(planDetroitNode({...req,minAvailableRamGB:-1},[node("pc")],now).state,"unavailable");
});
