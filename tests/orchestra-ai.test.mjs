import test from "node:test";
import assert from "node:assert/strict";
import {orchestraHandoff,canExecuteOrchestraHandoff,orchestraComposePrompt} from "../src/orchestra/ai-handoff.ts";
import {routeMessage,expandSlashCommand} from "../src/assistant/chat-router.ts";
const ctx={privateMode:false,hasCreamResult:false};

test("Orchestra can export a clearly referenced previous assistant answer",()=>{
 const plan=orchestraHandoff("把剛剛的回答轉成 PPTX","# 已完成正文\n經過驗證的段落");
 assert.equal(plan.format,"pptx");assert.equal(plan.tool,"deckcraft");
 assert.equal(plan.provenance,"assistant-answer");
 assert.ok(canExecuteOrchestraHandoff(plan));
 assert.match(plan.body,/驗證的段落/);
});
test("New requests remain brief-only rather than fake authored content",()=>{
 const plan=orchestraHandoff("幫我製作醫學報告","# 不得使用這段過去回答");
 assert.equal(plan.provenance,"brief-only");
 assert.equal(plan.body,"");
 assert.equal(canExecuteOrchestraHandoff(plan),false);
 assert.match(orchestraComposePrompt(plan),/不得聲稱已製成檔案/);
});
test("Local formats preserve deterministic routing and missing-source blocking",()=>{
 for(const [q,tool,format] of [
  ["將上一則回答轉成 PDF","wordcraft","pdf"],
  ["把剛剛的回答輸出成 DOCX","wordcraft","docx"],
  ["把剛剛的回答轉成 SVG","vectorcraft","svg"],
  ["將剛才回答輸出成 GIF","effectcraft","gif"],
  ["把剛才的回答製作成 PNG 海報","designcraft","png"]
 ]){
  const plan=orchestraHandoff(q,"# 完整回答");
  assert.equal(plan.tool,tool,q);assert.equal(plan.format,format,q);
  assert.ok(canExecuteOrchestraHandoff(plan),q);
 }
 assert.equal(canExecuteOrchestraHandoff(orchestraHandoff("把剛剛的回答轉成 PDF")),false);
 assert.equal(canExecuteOrchestraHandoff(orchestraHandoff("修圖：調整照片","文字")),false);
});
test("Slash arguments preserve actual Orchestra tasks",()=>{
 assert.equal(expandSlashCommand("/Orchestra 做成 PPTX")?.text,"@Orchestra 做成 PPTX");
 assert.equal(routeMessage("@Orchestra 做成 PPTX",ctx).kind,"diana");
});
