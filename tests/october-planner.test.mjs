import test from "node:test";
import assert from "node:assert/strict";
import {validateOctoberModelPlan,planOctoberCsvWithQwen} from "../src/detroit/october-planner.ts";
import {OCTOBER_READONLY_PLANNER_PROMPT} from "../src/ai/prompts.ts";
import {wantsOctoberPlanner,wantsOctoberServerProof} from "../src/detroit/october-proof.ts";
import {creamInstruction} from "../src/cream/core.ts";

test("Qwen output may propose only registered read-only CREAM, never authorize execution",()=>{
 const accept=validateOctoberModelPlan('{"decision":"analyze","tool":"cream","readOnly":true}');
 assert.equal(accept.status,"proposed");
 assert.equal(accept.capability,"cream");
 assert.equal(accept.modelInvoked,true);
 for(const unsafe of [
  '{"decision":"analyze","tool":"scouts","readOnly":true}',
  '{"decision":"analyze","tool":"cream","readOnly":false}',
  '{"decision":"analyze","tool":"cream","readOnly":true,"script":"delete"}',
  '{"decision":"deploy","tool":"cream","readOnly":true}',
  "not json","{}",
 ]){
  assert.equal(validateOctoberModelPlan(unsafe).status,"blocked",unsafe);
 }
});

test("October Qwen planner cannot run in private mode or with impossible metadata",async()=>{
 const a=await planOctoberCsvWithQwen({rows:2,columns:3,serverRequested:false,privateMode:true});
 assert.equal(a.status,"blocked");
 assert.equal(a.modelInvoked,false);
 const b=await planOctoberCsvWithQwen({rows:0,columns:3,serverRequested:false,privateMode:false});
 assert.equal(b.status,"blocked");
 assert.equal(b.modelInvoked,false);
});

test("Planner receives only bounded metadata and must produce JSON without tool authority",()=>{
 assert.match(OCTOBER_READONLY_PLANNER_PROMPT,/JSON/);
 assert.match(OCTOBER_READONLY_PLANNER_PROMPT,/唯讀/);
 assert.match(OCTOBER_READONLY_PLANNER_PROMPT,/不可|不能/);
 assert.ok(OCTOBER_READONLY_PLANNER_PROMPT.length<1000);
});

test("Explicit user commands preserve privacy and cannot be hidden in CSV cells",()=>{
 const body="月份,業績\n一月,2\n二月,3";
 for(const command of ["阿土伯規劃分析CSV","阿土伯規劃並伺服器驗證CSV"]){
  const text=command+"\n"+body;
  assert.equal(wantsOctoberPlanner(text),true);
  assert.equal(creamInstruction(text)?.csv,body);
 }
 assert.equal(wantsOctoberServerProof("阿土伯規劃並伺服器驗證CSV\n"+body),true);
 assert.equal(wantsOctoberServerProof("阿土伯規劃分析CSV\n"+body),false);
 assert.equal(wantsOctoberPlanner("CREAM：\n說明,價格\n阿土伯規劃分析CSV,99"),false);
});
