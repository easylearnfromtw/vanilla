import test from "node:test";
import assert from "node:assert/strict";
import {TYPES,curriculumCase,gradeIntegrated,generateIntegratedCurriculum} from "./integrated-dataset.mjs";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
test("integrated split produces 320 SFT examples and 128 distinct held-out cases",()=>{
 const dir=mkdtempSync(join(tmpdir(),"signwell-curriculum-"));
 try{
  const result=generateIntegratedCurriculum(dir);
  assert.equal(result.train,320);assert.equal(result.eval,128);
  const train=readFileSync(join(dir,"integrated-train.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
  const evals=readFileSync(join(dir,"integrated-eval.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
  const ids=new Set(train.map(x=>x.metadata.id));
  assert.ok(evals.every(x=>!ids.has(x.id)));
  assert.equal(new Set(evals.map(x=>x.id)).size,128);
  assert.ok(train.every(x=>JSON.parse(x.messages[2].content).status));
  assert.ok(evals.every(x=>gradeIntegrated(x.expected,x)));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("all four scenario types have machine-checkable oracle results",()=>{
 for(const type of TYPES){
  const sample=curriculumCase(type,3,"eval");
  assert.ok(gradeIntegrated(sample.expected,sample));
  assert.equal(gradeIntegrated({...sample.expected,action:"transfer_money"},sample),false);
 }
});
test("cross-tenant and not-due tasks cannot be marked completed",()=>{
 for(const type of ["tenant_denied","not_due"]){
  const item=curriculumCase(type,5,"eval");
  assert.equal(item.expected.action,"none");
  assert.ok(["blocked","not_due"].includes(item.expected.status));
  assert.equal(gradeIntegrated({...item.expected,status:"completed"},item),false);
 }
});
test("tampering numerical outputs or tool order fails objective grading",()=>{
 const item=curriculumCase("business",2,"eval");
 assert.equal(gradeIntegrated({...item.expected,npv_twd:item.expected.npv_twd+1},item),false);
 assert.equal(gradeIntegrated({...item.expected,tool_plan:[...item.expected.tool_plan].reverse()},item),false);
 assert.equal(gradeIntegrated({...item.expected,claimed_real_transfer:true},item),false);
});
