import test from "node:test";
import assert from "node:assert/strict";
import {toolKnowledgeIntent,toolKnowledgeAnswer,toolKnowledgeGuidance,referencedTools} from "../src/assistant/tool-knowledge.ts";
import {routeMessage} from "../src/assistant/chat-router.ts";
const ctx={privateMode:false,hasCreamResult:false};

test("Detroit and the user's other tools can be explained without a model",()=>{
 for(const question of ["底特律是什麼","Detroit 有什麼工具","底特律有哪些模組","我的其他工具有哪些","我有哪些工具"]){
  assert.equal(toolKnowledgeIntent(question)?.scope,"overview",question);
  assert.equal(routeMessage(question,ctx).kind,"tool-knowledge",question);
 }
 const report=toolKnowledgeAnswer("底特律是什麼");
 for(const label of ["Diana","Merlin","Zeus","Athena","CREAM","Janus","WordCraft","Quirinus","LUNA","Ceres","Orchestra"]){
  assert.ok(report.includes(label),label);
 }
 assert.match(report,/後端已部署/);
});

test("Specific tool questions use actual registry descriptions with conservative state",()=>{
 for(const [q,id] of [
  ["Diana 是做什麼的","diana"],
  ["梅林負責什麼功能","merlin"],
  ["Quirinus 是什麼","quirinus"],
  ["Scouts 怎麼用","scouts"],
  ["Janus 有什麼功能","janus"],
  ["WordCraft 可以做什麼","wordcraft"],
  ["Ceres 目前上線了嗎","ceres"],
  ["衛國有哪些功能","weiguo"]
 ]){
  assert.equal(routeMessage(q,ctx).kind,"tool-knowledge",q);
  const t=toolKnowledgeAnswer(q);
  assert.ok(t.includes(id==="weiguo"?"衞國":id),q);
 }
 assert.match(toolKnowledgeAnswer("Quirinus 是什麼"),/選用適配器|可執行器/);
 assert.match(toolKnowledgeAnswer("Diana 是做什麼的"),/內建角色|可執行器/);
 assert.match(toolKnowledgeAnswer("衛國有哪些功能"),/宣告式工具登錄/);
});

test("Tool questions work even in private/offline mode",()=>{
 assert.equal(routeMessage("底特律是什麼",{privateMode:true,hasCreamResult:false}).kind,"tool-knowledge");
 assert.equal(routeMessage("Quirinus 是什麼",{privateMode:true,hasCreamResult:false}).kind,"tool-knowledge");
});

test("Actual actions, source text and troubleshooting remain on their real routes",()=>{
 for(const q of ["幫我製作 LUNA 海報","開啟 Janus","新增 Diana 工具","Scouts 為什麼一直失敗","修復 Quirinus 錯誤","原文如下：Diana 是什麼"]){
  assert.equal(toolKnowledgeIntent(q),null,q);
  assert.notEqual(routeMessage(q,ctx).kind,"tool-knowledge",q);
 }
 assert.equal(routeMessage("開啟 Janus",ctx).kind,"open");
 assert.ok(toolKnowledgeGuidance("Scouts 為什麼一直失敗").includes("Scouts"));
 assert.ok(toolKnowledgeGuidance("比較 Diana 和 Zeus").includes("Zeus"));
 assert.equal(referencedTools("醫療資料的真實性如何判斷").length,0);
 assert.equal(toolKnowledgeGuidance("普通膝關節骨折要如何處理"),"");
});
