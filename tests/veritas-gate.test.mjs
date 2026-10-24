import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {routeMessage} from "../src/assistant/chat-router.ts";
import {classifyFactRequest,evaluateFactEvidence,officialExamPages,qualifiedFactModels,requiresVerifiedExactFact,mayCompleteWithBoundedAnalysis,boundedAnalysisGuidance} from "../src/detroit/veritas-gate.ts";
import {implicitResearchQuery} from "../src/search/search-evidence.ts";

const context={privateMode:false,hasCreamResult:false};
test("short exam and public-current factual questions route to Scouts without manual slash",()=>{
 for(const q of ["學測時間","今年學測時間","2026學測日期","2027分科測驗考程","今年統測時間","會考日期","目前股價多少","今年 PGY 招生時程","目前健保給付規定"]){
  assert.equal(classifyFactRequest(q).needsLiveSources,true,q);
  assert.equal(implicitResearchQuery(q),q);
  assert.equal(routeMessage(q,context).kind,"web-search",q);
 }
});
test("private/offline and creative requests are never turned into background research",()=>{
 for(const q of ["學測時間","目前健保給付規定"])
  assert.equal(routeMessage(q,{...context,privateMode:true}).kind,"continue",q);
 assert.equal(implicitResearchQuery("今年學測時間 不要上網"),null);
 assert.equal(implicitResearchQuery("我的病歷今年有什麼更新"),null);
 assert.equal(implicitResearchQuery("我家今年股票多少錢"),null);
 for(const q of ["幫我寫一篇學測勵志文章","請幫我改寫今年新聞的文案","原文如下：今年學測時間","幫我想三個週末親子活動","你好"])
  assert.equal(classifyFactRequest(q).needsLiveSources,false,q);
});
test("source index is not semantic fact verification",()=>{
 const page={title:"中央銀行利率公告",url:"https://www.cbc.gov.tw/news/test",kind:"full",excerpt:"公告內容"};
 assert.equal(evaluateFactEvidence("目前利率",[page]).status,"index");
 assert.equal(evaluateFactEvidence("目前利率",[]).status,"missing");
 assert.equal(evaluateFactEvidence("學測時間",[page]).status,"missing");
});
test("official exam evidence checks matching exam, year, excerpt date and domain",()=>{
 const now=new Date("2026-10-20T05:00:00Z");
 const official={title:"115學年度學科能力測驗日程表",url:"https://www.ceec.edu.tw/x",kind:"snippet",excerpt:"115學年度學測將於1月17日至1月19日舉行"};
 assert.equal(officialExamPages("今年學測時間",[official],now).length,1);
 assert.equal(evaluateFactEvidence("今年學測時間",[official],now).status,"official");
 for(const fake of [
  {...official,url:"https://news.example.com/official"},
  {...official,url:"https://www.ceec.edu.tw.evil.example/x"},
  {...official,title:"113學年度學測",excerpt:"113學年度學測於1月17日舉行"},
  {...official,excerpt:"115學年度學測公告，未列出考試日期"},
  {...official,title:"115學年度分科測驗",excerpt:"115學年度分科測驗於7月12日舉行"}]){
  assert.equal(officialExamPages("今年學測時間",[fake],now).length,0,JSON.stringify(fake));
 }
 assert.equal(officialExamPages("明年學測時間",[official],now).length,0);
});
test("Diana ranks small local model for creative chat, not fact authority",()=>{
 const models=[
  {source:"local",model:"Qwen2.5-0.5B-Instruct-q4f16_1-MLC"},
  {source:"local",model:"Qwen3-1.7B-q4f16_1-MLC"},
  {source:"ollama",model:"qwen3:8b"}
 ];
 const p=classifyFactRequest("什麼是廣義相對論");
 assert.equal(p.risk,"stable");
 assert.deepEqual(qualifiedFactModels(models,p).map(x=>x.model),["Qwen3-1.7B-q4f16_1-MLC","qwen3:8b"]);
 assert.equal(qualifiedFactModels(models.slice(0,1),p).length,0);
 assert.equal(qualifiedFactModels(models,classifyFactRequest("幫我寫一篇祝福文章")).length,3);
});
test("Veritas executes before any factual model generation",()=>{
 const c=readFileSync(new URL("../src/local-ai/LocalChat.tsx",import.meta.url),"utf8");
 assert.match(c,/const evidence=evaluateFactEvidence\(question,webIndex\)/);
 assert.match(c,/candidates=qualifiedFactModels\(candidates,classifyFactRequest\(question\)\)/);
 assert.ok(c.indexOf("const evidence=evaluateFactEvidence(question,webIndex)")<c.indexOf("await answerWithModel(question"),"source check must precede model");
});

test("Veritas no longer turns open-ended research into a source-only non-answer",()=>{
 const missing={status:"missing",pages:[],reason:"未取得來源"};
 const indexed={status:"index",pages:[{title:"研究索引",url:"https://example.org/research",kind:"snippet",excerpt:"公開摘要"}],reason:"僅有索引"};
 for(const q of ["分析今年醫療產業的趨勢與獲利機會","目前半導體供應鏈的可能風險有哪些"]){
  assert.equal(classifyFactRequest(q).needsLiveSources,true);
  assert.equal(mayCompleteWithBoundedAnalysis(q,missing,true),true);
  assert.equal(mayCompleteWithBoundedAnalysis(q,indexed,true),true);
 }
 assert.match(boundedAnalysisGuidance(missing),/仍須回答使用者真正要求/);
 assert.match(boundedAnalysisGuidance(indexed),/不要只列連結/);
 assert.equal(mayCompleteWithBoundedAnalysis("目前醫療產業的趨勢有哪些",missing,false),false);
 for(const q of ["今年學測時間","今年 PGY 招生時程","目前股價多少"]){
  assert.equal(requiresVerifiedExactFact(q),true,q);
  assert.equal(mayCompleteWithBoundedAnalysis(q,missing,true),false,q);
  assert.equal(mayCompleteWithBoundedAnalysis(q,indexed,true),false,q);
 }
});
