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
 const seeds=[11001,11002,11003,11004,11005,99001,99002,
  ...Array.from({length:10},(_,i)=>810001+i),
  ...Array.from({length:10},(_,i)=>910001+i)];
 const candidates=new Map(seeds.flatMap(seed=>makeOctoberQuantCases(seed)).map(x=>[x.prompt,x]));
 const all=[...NUMERIC_TRAIN,...NUMERIC_EVAL];
 assert.equal(all.length,350);
 for(const row of all){
  const c=candidates.get(row.prompt[0].content);
  assert.ok(c,"Every example must come from known deterministic seed");
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
