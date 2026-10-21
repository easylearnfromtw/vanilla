import test from "node:test";
import assert from "node:assert/strict";
import {makeOctoberQuantCases,gradeOctoberQuantReply,runOctoberQuantBenchmark,
 OCTOBER_QUANT_GENERATION} from "./quant-benchmark.mjs";

test("numeric blind suite generates fifty seeded cases across ten tasks without overlaps",()=>{
 const a=makeOctoberQuantCases();
 assert.equal(a.length,50);
 assert.deepEqual(a,makeOctoberQuantCases());
 assert.notDeepEqual(a,makeOctoberQuantCases(42));
 assert.equal(new Set(a.map(x=>x.id)).size,50);
 assert.equal(new Set(a.map(x=>x.prompt)).size,50);
 assert.equal(new Set(a.map(x=>x.kind)).size,10);
 assert.ok(a.every(x=>Number.isFinite(x.expected)&&typeof x.unit==="string"&&x.unit.length>0));
});
test("grade compares final strict JSON result, not plausible prose or incidental correct numbers",()=>{
 const v=makeOctoberQuantCases()[0];
 const answer=JSON.stringify({value:v.expected,unit:v.unit});
 assert.deepEqual(gradeOctoberQuantReply(answer,v),{pass:true,reason:"PASS"});
 assert.equal(gradeOctoberQuantReply("答案："+answer,v).pass,false);
 assert.equal(gradeOctoberQuantReply(JSON.stringify({value:v.expected,unit:v.unit,explanation:"guess"}),v).pass,false);
 assert.equal(gradeOctoberQuantReply(JSON.stringify({value:v.expected+20,unit:v.unit,example:v.expected}),v).pass,false);
 assert.equal(gradeOctoberQuantReply(JSON.stringify({value:v.expected,unit:"萬元"}),v).reason,"UNIT");
 assert.equal(gradeOctoberQuantReply(JSON.stringify({value:String(v.expected),unit:v.unit}),v).pass,false);
 assert.equal(gradeOctoberQuantReply('{"value":1e9999,"unit":"%"}',v).pass,false);
 assert.equal(gradeOctoberQuantReply(JSON.stringify({value:v.expected+1,unit:v.unit}),v).reason,"VALUE");
});
test("fifty realistic numerical gold answers can be graded with exact self-consistency",()=>{
 for(const item of makeOctoberQuantCases()){
  const good=JSON.stringify({unit:item.unit,value:item.expected});
  assert.equal(gradeOctoberQuantReply(good,item).pass,true,item.id);
 }
});
test("head-to-head uses identical questions and alternating model order, without persisting prompts",async()=>{
 const models=["october:0.3","qwen3:4b"],cases=makeOctoberQuantCases();
 const answers=new Map(cases.map(x=>[x.prompt,x]));
 const calls=[];
 const mock=async(opts,model,prompt)=>{
  calls.push([model,prompt]);
  const item=answers.get(prompt);
  if(!item)throw Error("UNKNOWN_PROMPT");
  return {text:JSON.stringify({value:item.expected,unit:item.unit}),
   latencyMs:150,promptTokens:90,outputTokens:22};
 };
 const report=await runOctoberQuantBenchmark({models,maxCases:50},mock);
 assert.equal(report.cases,50);
 assert.equal(calls.length,100);
 assert.equal(calls[0][0],models[0]);assert.equal(calls[1][0],models[1]);
 assert.equal(calls[2][0],models[1]);assert.equal(calls[3][0],models[0]);
 assert.deepEqual(report.protocol,OCTOBER_QUANT_GENERATION);
 assert.ok(report.summary.every(x=>x.strictNumericAccuracy===1&&x.avgLatencyMs===150&&x.avgPromptTokens===90));
 assert.equal(report.trials.length,100);
 const blob=JSON.stringify(report);
 for(const item of cases){
  assert.equal(blob.includes(item.prompt),false);
 }
 assert.doesNotMatch(blob,/UNKNOWN_PROMPT/);
});
test("incorrect answers and failed model calls stay in the denominator, no leaked provider errors",async()=>{
 const models=["october:0.3","qwen3:4b"],map=new Map(makeOctoberQuantCases().map(x=>[x.prompt,x]));
 const report=await runOctoberQuantBenchmark({models,maxCases:3},async(_,model,prompt)=>{
  if(model==="qwen3:4b")throw Error("PRIVATE_API_TOKEN_FAKE");
  const item=map.get(prompt);
  return {text:JSON.stringify({value:item.expected+1,unit:item.unit}),
   latencyMs:20,promptTokens:11,outputTokens:7};
 });
 assert.equal(report.summary[0].strictNumericAccuracy,0);
 assert.equal(report.summary[1].strictNumericAccuracy,0);
 assert.equal(report.summary[1].avgOutputTokens,null);
 assert.equal(report.summary[1].failures,3);
 assert.doesNotMatch(JSON.stringify(report),/PRIVATE_API_TOKEN_FAKE/);
});
