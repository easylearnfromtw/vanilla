import test from "node:test";
import assert from "node:assert/strict";
import {HOLDOUT} from "./teacher-cases.mjs";
import {runBenchmark,scoreOctoberReply} from "./benchmark.mjs";
test("Heuristic evaluator never confuses dangerous claims with correct answers",()=>{
 const rubric={tag:"finance",tags:["18","萬"],deny:/保證/};
 assert.deepEqual(scoreOctoberReply("六個月可以存下18萬元。",rubric),{pass:true,reason:"HEURISTIC_MATCH"});
 assert.equal(scoreOctoberReply("我保證六個月有18萬元。",rubric).pass,false);
 assert.equal(scoreOctoberReply("已存一百萬。",rubric).pass,false);
});
test("Mocked transport verifies matching sampling budgets, no network and no leaked answers",async()=>{
 const calls=[];
 const models=["october:0.3","qwen3:4b"];
 const mock=async(opts,model,prompt)=>{
  calls.push({model,prompt});
  const idx=HOLDOUT.findIndex(x=>x.prompt[0].content===prompt);
  return {text:idx===-1?"NPV 是淨現值。":HOLDOUT[idx].completion[0].content,
   elapsedMs:idx===-1?20:100,outputTokens:42,promptTokens:27,tokensPerSecond:30};
 };
 const report=await runBenchmark({models,maxCases:10},mock);
 assert.equal(calls.length,22); // one uns cored warm-up per model, ten holdout calls
 assert.deepEqual(report.generation,{temperature:0.2,top_p:0.85,num_ctx:4096,num_predict:512,seed:20261021,think:false});
 assert.equal(report.summary.length,2);
 for(const summary of report.summary){
  assert.equal(summary.n,10);
  assert.equal(summary.avgOutputTokens,42);
  assert.equal(summary.avgLatencyMs,100);
  assert.equal(summary.avgTokensPerSecond,30);
 }
 const serialized=JSON.stringify(report);
 assert.ok(!serialized.includes("NPV 是淨現值"));
 assert.ok(!serialized.includes(HOLDOUT[0].prompt[0].content));
 assert.ok(!serialized.includes(HOLDOUT[0].completion[0].content));
});
test("Quality report correctly records missing provider token counters",async()=>{
 const mock=async(_,model,prompt)=>({text:"無法保證，請提供資料與依據。",
  elapsedMs:125,outputTokens:null,promptTokens:null,tokensPerSecond:null});
 const report=await runBenchmark({models:["october:0.3"],maxCases:2},mock);
 assert.equal(report.summary[0].avgOutputTokens,null);
 assert.equal(report.summary[0].avgPromptTokens,null);
 assert.equal(report.summary[0].heuristicPassRate,0);
});

test("Model errors are counted as failures without leaking provider messages",async()=>{
 const options={models:["october:0.3"],maxCases:2};
 const r=await runBenchmark(options,async(_,model,prompt)=>{
  if(prompt.includes("NPV"))return {text:"NPV 是淨現值",elapsedMs:10,promptTokens:2,outputTokens:3,tokensPerSecond:10};
  throw Error("sensitive-provider-secret");
 });
 assert.equal(r.summary[0].heuristicPassRate,0);
 assert.equal(r.summary[0].failedOrEmpty,2);
 assert.equal(r.summary[0].avgLatencyMs,null);
 assert.doesNotMatch(JSON.stringify(r),/sensitive-provider-secret/);
});
