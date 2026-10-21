import test from "node:test";
import assert from "node:assert/strict";
import {NUMERIC_TRAIN,NUMERIC_EVAL,validateOctoberNumericCurriculum} from "./quant-sft.mjs";
import {makeOctoberQuantCases,gradeOctoberQuantReply} from "./quant-benchmark.mjs";

test("Optional arithmetic SFT derives 350 independently labeled examples",()=>{
 const result=validateOctoberNumericCurriculum();
 assert.deepEqual(result,{train:250,eval:100,templateFamilies:10,benchmarkSeedExcluded:true});
 assert.equal(NUMERIC_TRAIN.length,250);
 assert.equal(NUMERIC_EVAL.length,100);
});
test("Every numerical label is mechanically correct and JSON valid",()=>{
 const cases=[11001,11002,11003,11004,11005,99001,99002].flatMap(x=>makeOctoberQuantCases(x));
 const all=[...NUMERIC_TRAIN,...NUMERIC_EVAL];
 assert.equal(cases.length,all.length);
 for(let i=0;i<all.length;i++){
  const c=cases[i],row=all[i];
  assert.equal(row.prompt[0].content,c.prompt);
  assert.equal(gradeOctoberQuantReply(row.completion[0].content,c).pass,true,c.id);
 }
});
test("Evaluation and benchmark prompts cannot be included in train rows",()=>{
 const train=new Set(NUMERIC_TRAIN.map(x=>x.prompt[0].content));
 const evals=new Set(NUMERIC_EVAL.map(x=>x.prompt[0].content));
 assert.equal(train.size,NUMERIC_TRAIN.length);
 assert.equal(evals.size,NUMERIC_EVAL.length);
 assert.ok([...evals].every(x=>!train.has(x)));
 const bench=makeOctoberQuantCases(20261021);
 assert.ok(bench.every(x=>!train.has(x.prompt)&&!evals.has(x.prompt)));
});
