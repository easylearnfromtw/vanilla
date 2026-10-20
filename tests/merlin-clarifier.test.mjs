import test from "node:test";
import assert from "node:assert/strict";
import {detectMerlinClarification,resolveMerlinClarification} from "../src/detroit/merlin-clarifier.ts";

test("Merlin asks for a missing object before a destructive operation",()=>{
 for(const prompt of ["刪除","幫我刪除檔案","把它刪掉","清空資料"]){
  const pending=detectMerlinClarification(prompt,{hasContext:true});
  assert.equal(pending?.reason,"missing-target",prompt);
  assert.match(pending.question,/哪個/);
 }
 assert.equal(detectMerlinClarification("幫我刪除 app.js") ,null);
});

test("Merlin requests essential material but not already attached or prior conversational context",()=>{
 assert.equal(detectMerlinClarification("幫我翻譯")?.reason,"missing-material");
 assert.equal(detectMerlinClarification("請幫我分析")?.reason,"missing-material");
 assert.equal(detectMerlinClarification("這個")?.reason,"missing-reference");
 assert.equal(detectMerlinClarification("幫我翻譯",{hasAttachment:true}),null);
 assert.equal(detectMerlinClarification("這個",{hasContext:true}),null);
});

test("Merlin does not interrupt clear requests, greetings or explicit followups",()=>{
 for(const q of ["你好","請比較 CCS 與 DHS 差異","寫一篇醫美診所的介紹文","請優化這段 prompt：幫我寫演講稿","再深入分析台灣經濟趨勢","幫我修復 app.js 登入按鈕"]){
  assert.equal(detectMerlinClarification(q),null,q);
 }
});

test("clarification replies combine context but never imply permission to write",()=>{
 const pending=detectMerlinClarification("幫我翻譯");
 assert.ok(pending);
 const resolved=resolveMerlinClarification(pending,"請翻譯 Good morning 成繁體中文");
 assert.equal(resolved.kind,"resolved");
 if(resolved.kind==="resolved"){
  assert.match(resolved.prompt,/原始需求：\n幫我翻譯/);
  assert.match(resolved.prompt,/Good morning/);
  assert.match(resolved.prompt,/不得把補充回答視為/);
 }
 assert.equal(resolveMerlinClarification(pending,"不知道").kind,"retry");
 assert.equal(resolveMerlinClarification(pending,"取消").kind,"cancel");
});
