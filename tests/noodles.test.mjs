import test from "node:test";
import assert from "node:assert/strict";
import {sanitizeNoodlesState,appendNoodles,noodlesModelAdjustment,noodlesGuidance,noodlesSummary,modelStats} from "../src/noodles/core.ts";
const task="analysis",model="gemini:example-model";
const now=Date.UTC(2026,9,19);
function state(events=[]){return {version:1,enabled:true,observations:events};}
function rating(liked,at=now){return {kind:"rating",at,task,model,liked};}
function run(ok,ms=1800){return {kind:"run",at:now,task,model,ok,durationMs:ms};}
function issue(type){return {kind:"issue",at:now,task,model,issue:type};}
test("automatic success is only reliability, not assumed answer correctness",()=>{
 let x=state(Array.from({length:5},()=>run(true)));
 assert.equal(noodlesModelAdjustment(x,task,model),0);
 assert.equal(modelStats(x,task,model).ratings,0);
 assert.equal(noodlesSummary(x).totalRuns,5);
});
test("confirmed likes and dislikes are bounded, shrunk and task-specific",()=>{
 const positive=state(Array.from({length:10},()=>rating(true)));
 const negative=state(Array.from({length:10},()=>rating(false)));
 assert.ok(noodlesModelAdjustment(positive,task,model)>0);
 assert.ok(noodlesModelAdjustment(negative,task,model)<0);
 assert.ok(noodlesModelAdjustment(positive,task,model)<=12);
 assert.ok(noodlesModelAdjustment(negative,task,model)>=-12);
 assert.equal(noodlesModelAdjustment(positive,"writing",model),0);
});
test("reliability failures reduce routing, without storing messages",()=>{
 const failed=state([run(false),run(false),run(false),run(false)]);
 assert.ok(noodlesModelAdjustment(failed,task,model)<0);
 assert.equal(Object.keys(failed.observations[0]).sort().join(","),"at,durationMs,kind,model,ok,task");
});
test("user-tagged issues require repetition before cross-provider prompt guidance changes",()=>{
 const once=state([issue("no_sources")]);
 assert.equal(noodlesGuidance(once,task),"");
 const many=state([issue("no_sources"),issue("no_sources"),issue("bad_format"),issue("bad_format")]);
 assert.match(noodlesGuidance(many,task),/引用/);
 assert.match(noodlesGuidance(many,task),/表格/);
 assert.equal(noodlesGuidance(many,"casual"),"");
});
test("disabled adaptation does not append events, rank, or change prompt",()=>{
 const disabled={...state([rating(true)]),enabled:false};
 assert.equal(appendNoodles(disabled,rating(false),now).observations.length,1);
 assert.equal(noodlesModelAdjustment(disabled,task,model),0);
 assert.equal(noodlesGuidance(disabled,task),"");
});
test("malformed and old telemetry is removed, limited to 500 without raw user messages",()=>{
 const old=run(true);old.at=now-100*86400000;
 const next=sanitizeNoodlesState(state([old,{...run(true),content:"PRIVATE_CHAT",token:"SECRET"},...Array.from({length:550},()=>run(true))]),now);
 assert.equal(next.observations.length,500);
 assert.ok(next.observations.every(x=>!Object.hasOwn(x,"content")&&!Object.hasOwn(x,"token")));
 assert.equal(sanitizeNoodlesState({enabled:false,observations:[{at:0,model:"fake"}]},now).enabled,false);
});
test("separate model IDs have separate signal records; model-neutral feedback can guide provider prompts",()=>{
 const records=state([rating(true),{...rating(false),model:"deepseek:example"},issue("incorrect"),issue("incorrect")]);
 assert.ok(noodlesModelAdjustment(records,task,model)>0);
 assert.ok(noodlesModelAdjustment(records,task,"deepseek:example")<0);
 assert.match(noodlesGuidance(records,task),/邏輯/);
});
