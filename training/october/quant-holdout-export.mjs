#!/usr/bin/env node
/** Export the 50 deterministic, strictly graded numeric challenges to a local
 * evaluator fixture. Never send the gold answers to Ollama during inference.
 */
import {writeFileSync,mkdirSync} from "node:fs";
import {join,dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {makeOctoberQuantCases,gradeOctoberQuantReply} from "./quant-benchmark.mjs";
import {NUMERIC_TRAIN,NUMERIC_EVAL,validateOctoberNumericCurriculum} from "./quant-sft.mjs";

export function numericHoldoutRows(){
 validateOctoberNumericCurriculum();
 const excluded=new Set([...NUMERIC_TRAIN,...NUMERIC_EVAL].map(x=>x.prompt[0].content));
 const items=makeOctoberQuantCases(20261021);
 const prompts=new Set();
 return items.map(testCase=>{
  if(prompts.has(testCase.prompt)||excluded.has(testCase.prompt))
   throw Error("Benchmark questions overlap existing curriculum");
  prompts.add(testCase.prompt);
  const completion=JSON.stringify({value:testCase.expected,unit:testCase.unit});
  if(!gradeOctoberQuantReply(completion,testCase).pass)
   throw Error("Numerical benchmark expected label failed its own rubric");
  return {prompt:[{role:"user",content:testCase.prompt}],
   completion:[{role:"assistant",content:completion}]};
 });
}
export function exportNumericHoldout(){
 const rows=numericHoldoutRows();
 const dir=join(dirname(fileURLToPath(import.meta.url)),"generated");
 mkdirSync(dir,{recursive:true});
 writeFileSync(join(dir,"october-numeric-benchmark.jsonl"),rows.map(x=>JSON.stringify(x)).join("\n")+"\n");
 return {count:rows.length,trainEvalOverlap:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))
 console.log(JSON.stringify(exportNumericHoldout()));
