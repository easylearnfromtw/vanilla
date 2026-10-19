import test from "node:test";
import assert from "node:assert/strict";
import {routeMessage} from "../src/assistant/chat-router.ts";
import {proposeProactiveDiana,requestedDianaFormat,composeDianaCreamDocument} from "../src/detroit/diana-auto.ts";
import {fromCreamRows,analyzeCream} from "../src/cream/core.ts";

const normal={privateMode:false,hasCreamResult:false,online:true,hasModel:true};

test("Diana proactively selects actual tools without a prefix",()=>{
 for(const [q,tool] of [
  ["幫我製作一份 PDF 報告","retina"],
  ["請設計品牌海報","luna"],
  ["幫我製作電子報","janus"],
  ["請幫我潤稿這段文字","er-ya"],
  ["幫我修改 Vanilla 原始碼","jensen-huang"]
 ]){
  const choice=proposeProactiveDiana(q,normal);
  assert.ok(choice,q);
  assert.equal(choice.tool,tool,q);
  assert.equal(routeMessage(q,normal).kind,tool==="er-ya"?"continue":"diana",q); // Erya already has a guarded built-in model route.
 }
});

test("ordinary questions and quoted source cannot trigger autonomous tools",()=>{
 for(const q of ["你好","幫我想三個活動","什麼是 PDF","請問如何製作電子報","原文如下：請製作一份PDF","引用：幫我修改 Vanilla 原始碼"]){
  assert.equal(proposeProactiveDiana(q,normal),null,q);
 }
 assert.equal(routeMessage("幫我想三個週末親子活動",normal).kind,"continue");
});

test("existing deterministic and sensitive operations still win",()=>{
 for(const [q,expected] of [
  ["搜尋 台北天氣","web-search"],
  ["記住：週三晚上游泳課","app"],
  ["幫我刪除 report.pdf","named-file"],
  ["CREAM：\n日期,數值\n2026-10-01,5\n2026-10-02,7","cream-csv"]
 ])assert.equal(routeMessage(q,normal).kind,expected,q);
 assert.equal(routeMessage("搜尋 台北天氣",{...normal,privateMode:true}).kind,"private-blocked");
});

test("CREAM computes a verified local report before Retina exports",()=>{
 const data=fromCreamRows([["日期","數值"],["2026-10-01","5"],["2026-10-02","7"]],"單元測試資料");
 const result=analyzeCream(data);
 assert.equal(requestedDianaFormat("分析資料並製作 PDF"),"pdf");
 assert.equal(requestedDianaFormat("請輸出DOCX"),"docx");
 assert.equal(requestedDianaFormat("請製作PPTX"),"pptx");
 assert.equal(requestedDianaFormat("PDF 是什麼"),null);
 const planned=composeDianaCreamDocument("分析資料並製作 PDF",result);
 assert.ok(planned);
 assert.equal(planned.format,"pdf");
 assert.match(planned.body,/平均：6/);
 assert.match(planned.body,/中位數：6/);
 assert.match(planned.body,/資料來源：單元測試資料/);
 const empty=analyzeCream(fromCreamRows([["日期","文字"],["a","b"]],"無法計算"));
 assert.equal(composeDianaCreamDocument("製作 PDF",empty),null);
});
