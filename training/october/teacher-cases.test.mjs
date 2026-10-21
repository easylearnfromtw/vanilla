import test from "node:test";
import assert from "node:assert/strict";
import {TRAIN,HOLDOUT,audit} from "./teacher-cases.mjs";
import {reportOctoberPromptBudget} from "./prompt-budget.mjs";
import {profileFor} from "../../src/ai/model-profiles.ts";
import {ollamaRequestExtras} from "../../src/ai/generation-config.ts";
import {vanillaSystemPrompt} from "../../src/ai/prompts.ts";

test("GPT-6-authored case collection is split by prompt and domain",()=>{
 const report=audit();
 assert.ok(report.train>=30&&report.holdout>=8);
 for(const domain of ["finance","stats","engineering","health","legal","ux","behavior"]){
  assert.ok(TRAIN.some(r=>r.domain===domain),domain);
  assert.ok(HOLDOUT.some(r=>r.domain===domain),domain);
 }
 const train=new Set(TRAIN.map(r=>r.prompt[0].content));
 assert.ok(HOLDOUT.every(r=>!train.has(r.prompt[0].content)));
});

test("Teacher completions reject false deployment claims and unnecessary length",()=>{
 const all=[...TRAIN,...HOLDOUT];
 assert.ok(all.every(r=>r.completion[0].content.length<=500));
 assert.ok(all.every(r=>r.prompt[0].role==="user"&&r.completion[0].role==="assistant"));
 const wantsProof=all.find(r=>r.prompt[0].content.includes("回傳任務成功"));
 assert.match(wantsProof.completion[0].content,/回執|證據/);
 const pretend=all.find(r=>r.prompt[0].content.includes("Qwen 模型說"));
 assert.match(pretend.completion[0].content,/GitHub API/);
});

test("October 4B and Lite profiles are not misread as a 7B version suffix",()=>{
 const full=profileFor("ollama","october:0.3");
 const lite=profileFor("ollama","october:lite");
 assert.equal(full.paramsB,4);assert.equal(lite.paramsB,0.6);
 assert.equal(full.family,"october-qwen3");
 assert.equal(lite.contextTokens,4096);
 assert.ok(full.maxOutput.general<=640);
 assert.ok(lite.maxOutput.casual<=128);
 assert.ok(full.maxOutput.code>full.maxOutput.casual);
 const sampling=ollamaRequestExtras("october:0.3","analysis");
 assert.equal(sampling.options.num_predict,full.maxOutput.analysis);
 assert.equal(sampling.think,false);
});

test("Dynamic system prompts keep evidence and privilege protections with smaller normal payloads",()=>{
 const options={task:"analysis",compact:false,model:"october:0.3"};
 const normal=vanillaSystemPrompt({...options,latestUserText:"投資決策比較"});
 const bio=vanillaSystemPrompt({...options,latestUserText:"請介紹阿土伯的學歷背景"});
 assert.ok(normal.length<bio.length*0.8,normal.length+" / "+bio.length);
 assert.ok(/權限|授權/.test(normal));
 assert.ok(/數字|來源/.test(normal));
 assert.doesNotMatch(normal,/再興中學|哈佛 MBA/);
 assert.match(bio,/哈佛 MBA/);
});

test("October estimated prompt budget is smaller for every common task",()=>{
 const snapshot=reportOctoberPromptBudget();
 assert.equal(snapshot.samples.length,5);
 assert.match(snapshot.method,/NOT provider token count/);
 for(const row of snapshot.samples){
  assert.ok(row.legacyChars>row.newChars,row.task);
  assert.ok(row.approximateLegacyTokens>row.approximateNewTokens,row.task);
  assert.ok(row.estimatedSavingPct>0,row.task);
 }
});
