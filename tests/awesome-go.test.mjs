import test from "node:test";
import assert from "node:assert/strict";
import {AWESOME_GO_REFERENCES,isAwesomeGoQuestion,selectAwesomeGo,formatAwesomeGoPlan} from "../src/detroit/awesome-go.ts";
import {chooseDianaTool} from "../src/detroit/diana.ts";
import {routeMessage} from "../src/assistant/chat-router.ts";
import {toolKnowledgeAnswer,toolKnowledgeGuidance} from "../src/assistant/tool-knowledge.ts";

const context={privateMode:false,hasCreamResult:false};
test("curated references are HTTPS read-only sources, not runtime dependencies",()=>{
 assert.ok(AWESOME_GO_REFERENCES.length>=7);
 for(const item of AWESOME_GO_REFERENCES){
  assert.match(item.url,/^https:\/\/github.com\//);
  assert.ok(item.summary&&item.tradeoff);
 }
});
test("Go recommendations select module-relevant candidates",()=>{
 for(const [request,wanted] of [
  ["推薦 Slime 的 Go 套件","ollama"],
  ["評估 Ceres Go 通訊套件","nats"],
  ["Quirinus Go 資安套件選型","syft"],
  ["LUCA Go 監控技術推薦","otellix"],
  ["Diana Go MCP 技術評估","mcp-go"]
 ]){
  assert.equal(selectAwesomeGo(request)?.recommendations[0].reference.id,wanted,request);
 }
 const selections=selectAwesomeGo("Awesome Go 有哪些",100);
 assert.ok(selections&&selections.recommendations.length<=5);
});
test("knowledge questions work offline without triggering source execution",()=>{
 const q="Awesome Go 是什麼";
 assert.equal(routeMessage(q,{privateMode:true,hasCreamResult:false}).kind,"tool-knowledge");
 const answer=toolKnowledgeAnswer(q);
 assert.match(answer,/離線精選索引/);
 assert.match(answer,/不自動安裝/);
 assert.match(toolKnowledgeGuidance("比較 Slime Go 技術選型"),/Ollama/);
});
test("Diana sends a Go evaluation to the live audit UI, not a canned report",()=>{
 const question="推薦 Ceres 的 Go 通訊套件";
 const result=chooseDianaTool(question,context);
 assert.equal(result.kind,"open");
 assert.equal(result.tool,"awesome");
 assert.equal(result.tab,"awesome");
 assert.equal(routeMessage(question,context).kind,"go-research");
 assert.equal(routeMessage(question,context).role,"ceres");
 assert.equal(chooseDianaTool(question,{...context,privateMode:true}).kind,"report");
});
test("imperative install/deploy and unrelated messages bypass knowledge-only routing",()=>{
 for(const q of [
  "幫我安裝 Go 套件","把 Awesome Go 加入原始碼",
  "請直接部署 Go 程式","今天 go home","Google 地圖在哪裡"
 ]){
  assert.equal(isAwesomeGoQuestion(q),false,q);
  assert.equal(selectAwesomeGo(q),null,q);
 }
 assert.notEqual(routeMessage("幫我安裝 Go 套件",context).kind,"tool-knowledge");
 assert.equal(formatAwesomeGoPlan("Google 地圖"),"");
});

test("model-backed Go questions stay conversational, no-model questions keep factual fallback",()=>{
 const q="Awesome Go 是什麼";
 assert.equal(routeMessage(q,{...context,hasModel:true}).kind,"continue");
 assert.equal(routeMessage(q,{...context,hasModel:false}).kind,"tool-knowledge");
 for(const intent of ["推薦 Slime 的 Go 套件","評估 Ceres Go 通訊套件","Quirinus Go 資安套件選型"]){
  assert.equal(routeMessage(intent,{...context,hasModel:true}).kind,"go-research");
 }
});
