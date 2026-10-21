#!/usr/bin/env node
/**
 * Bridge deterministic simulation SFT into Vanilla's existing NOODLES trainer.
 * 256 human-review-required train examples, 64 trainer validation examples.
 * The 128 blind integrated eval examples stay entirely outside trainer input.
 */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {join} from "node:path";
export function convert(source="training/agent_sandbox/generated/integrated-train.jsonl",output="training/agent_sandbox/generated"){
 const cases=readFileSync(source,"utf8").trim().split("\n").map(JSON.parse);
 const train=[],validation=[],seen=new Set();
 for(const row of cases){
  const type=row.metadata?.type,id=row.metadata?.id;
  if(!/^(business|ops|tenant_denied|not_due)$/.test(type))throw Error("Invalid type: "+type);
  const index=Number(id?.split("_").at(-1));
  if(!Number.isInteger(index))throw Error("Invalid index");
  const user=row.messages?.find(x=>x.role==="user")?.content;
  const assistant=row.messages?.find(x=>x.role==="assistant")?.content;
  if(typeof user!=="string"||typeof assistant!=="string"||seen.has(user))throw Error("Invalid or duplicate input");
  seen.add(user);
  const item={prompt:[{role:"user",content:user}],completion:[{role:"assistant",content:assistant}]};
  // Hold one of every five original train-split scenarios out for trainer validation.
  ((index-1000)%5===0?validation:train).push(item);
 }
 if(train.length!==256||validation.length!==64)throw Error("Expected 256/64 disjoint trainer split");
 mkdirSync(output,{recursive:true});
 const names=["integrated-noodles-sft-train.jsonl","integrated-noodles-sft-validation.jsonl"];
 for(const [name,values] of [[names[0],train],[names[1],validation]])
  writeFileSync(join(output,name),values.map(x=>JSON.stringify(x)).join("\n")+"\n");
 return {train:train.length,validation:validation.length,blindEval:"128 separate untouched integrated-eval.jsonl scenarios; NEVER use in trainer"};
}
if(process.argv[1]&&process.argv[1].endsWith("/to-noodles.mjs")){
 console.log(JSON.stringify(convert(),null,2));
}
