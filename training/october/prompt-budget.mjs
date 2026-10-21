#!/usr/bin/env node
/** October deterministic prompt-budget audit. Rough estimator only!
 * Exact token cost/speed must be measured through Ollama prompt_eval_count.
 */
import {writeFileSync,mkdirSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {vanillaSystemPrompt} from "../../src/ai/prompts.ts";
import {octoberPromptForTask,OCTOBER_RUNTIME_CONTRACT} from "../../src/ai/october-persona.ts";
import {estimateTokens} from "../../src/ai/context-budget.ts";

const SAMPLES=[
 ["casual","阿土伯您好"],
 ["general","什麼是淨現值？"],
 ["writing","幫我寫一封正式商業邀約信"],
 ["analysis","比較兩個投資情境與現金流"],
 ["code","寫一個可以跑測試的 CSV 統計函式"]
];
export function reportOctoberPromptBudget(){
 const items=SAMPLES.map(([task,query])=>{
  const current=vanillaSystemPrompt({task,compact:false,latestUserText:query,model:"october:0.3"});
  const newContract=octoberPromptForTask(task,query,false);
  if(!current.startsWith(newContract+"\n"))throw Error("Prompt router changed; budget audit invalid");
  // Only swap the old vs new contract. Other Vanilla rules, task directions,
  // timestamp and tone instructions are byte-for-byte identical in both.
  const old=OCTOBER_RUNTIME_CONTRACT+current.slice(newContract.length);
  const estimatedOld=estimateTokens(old),estimatedNew=estimateTokens(current);
  if(estimatedNew>estimatedOld)throw Error("Regressed October prompt tokens on "+task);
  return {task,legacyChars:old.length,newChars:current.length,
   approximateLegacyTokens:estimatedOld,approximateNewTokens:estimatedNew,
   estimatedSavingPct:Math.round((estimatedOld-estimatedNew)/estimatedOld*1000)/10};
 });
 return {scope:"system-prompt-only; no user messages or prior turns",
  method:"Vanilla estimateTokens rough heuristic, NOT provider token count",
  model:"october:0.3",samples:items,
  meanEstimatedSavingPct:Math.round(items.reduce((s,x)=>s+x.estimatedSavingPct,0)/items.length*10)/10};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const output=join(dirname(fileURLToPath(import.meta.url)),"generated","october-prompt-budget.json");
 mkdirSync(dirname(output),{recursive:true});
 const report=reportOctoberPromptBudget();
 writeFileSync(output,JSON.stringify(report,null,2)+"\n","utf8");
 console.log(JSON.stringify(report,null,2));
}
