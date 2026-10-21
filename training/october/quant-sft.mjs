#!/usr/bin/env node
/** Optional October strict-JSON numeracy curriculum: 250 train / 100 eval.
 * All labels are computed by checked deterministic formulas, NOT inferred
 * by GPT, Qwen, or a fabricated tool receipt. NOT automatically deployed.
 * Same template families as numeric benchmark but distinct RNG seeds: this
 * checks interpolation, not an out-of-distribution math generalization.
 */
import {writeFileSync,mkdirSync} from "node:fs";
import {join,dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {makeOctoberQuantCases,gradeOctoberQuantReply} from "./quant-benchmark.mjs";
const ROOT=dirname(fileURLToPath(import.meta.url));
const TRAIN_SEEDS=[11001,11002,11003,11004,11005];
const EVAL_SEEDS=[99001,99002];
function convert(c){
 const answer=JSON.stringify({value:c.expected,unit:c.unit});
 if(!gradeOctoberQuantReply(answer,c).pass)throw Error("Unverified arithmetic label");
 return {prompt:[{role:"user",content:c.prompt}],
  completion:[{role:"assistant",content:answer}]};
}
const reservedBenchmark=new Set(makeOctoberQuantCases(20261021).map(x=>x.prompt));
const allPrompts=new Set(reservedBenchmark);
function build(seeds,target,fallbackStart){
 const records=[];
 const addSeed=seed=>{
  for(const testCase of makeOctoberQuantCases(seed)){
   if(allPrompts.has(testCase.prompt))continue;
   allPrompts.add(testCase.prompt);
   records.push(convert(testCase));
   if(records.length===target)return true;
  }
  return false;
 };
 for(const seed of seeds)if(addSeed(seed))return records;
 // Random draws may collide. Replace them instead of weakening leakage gates.
 for(let seed=fallbackStart;seed<fallbackStart+100;seed++){
  if(addSeed(seed))return records;
 }
 throw Error("Insufficient unique verified numeric cases");
}
export const NUMERIC_TRAIN=build(TRAIN_SEEDS,250,810001);
export const NUMERIC_EVAL=build(EVAL_SEEDS,100,910001);
export function validateOctoberNumericCurriculum(){
 const seen=new Set();
 for(const pair of [...NUMERIC_TRAIN,...NUMERIC_EVAL]){
  const prompt=pair.prompt[0].content;
  if(seen.has(prompt))throw Error("Numeric train/eval data leakage");
  seen.add(prompt);
  if(prompt.length<8||pair.completion[0].content.length<8)throw Error("Invalid numeric SFT row");
 }
 if([...seen].some(q=>reservedBenchmark.has(q)))throw Error("Numeric evaluation benchmark appears in training");
 return {train:NUMERIC_TRAIN.length,eval:NUMERIC_EVAL.length,
  templateFamilies:10,benchmarkSeedExcluded:true};
}
export function exportOctoberNumericCurriculum(){
 const manifest=validateOctoberNumericCurriculum();
 const path=join(ROOT,"generated");
 mkdirSync(path,{recursive:true});
 for(const [name,rows] of [
  ["october-numeric-sft-train.jsonl",NUMERIC_TRAIN],
  ["october-numeric-sft-eval.jsonl",NUMERIC_EVAL]
 ])writeFileSync(join(path,name),rows.map(row=>JSON.stringify(row)).join("\n")+"\n","utf8");
 writeFileSync(join(path,"october-numeric-sft-manifest.json"),
  JSON.stringify({...manifest,trainSeeds:TRAIN_SEEDS,evalSeeds:EVAL_SEEDS,
   labeling:"deterministic",weightsTrained:false,expertReviewed:false},null,2)+"\n","utf8");
 return manifest;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 console.log(JSON.stringify(exportOctoberNumericCurriculum()));
}
