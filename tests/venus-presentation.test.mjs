import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseVenusMessage,venusPresentationGuidance,venusSafeUrl} from "../src/venus/presentation.ts";
const fence=(obj)=>"\u0060\u0060\u0060venus\n"+JSON.stringify(obj)+"\n\u0060\u0060\u0060";
const file=(x)=>readFileSync(new URL("../"+x,import.meta.url),"utf8");

test("Venus parses real, finite source-labeled charts and retains surrounding answer",()=>{
 const source="摘要\n\n"+fence({kind:"chart",title:"每月收入",chartType:"bar",labels:["1月","2月"],values:[10,30],unit:"萬元",source:"使用者提供"})+"\n後續說明";
 const result=parseVenusMessage(source);
 assert.equal(result.blocks.length,1);
 assert.equal(result.blocks[0].kind,"chart");
 assert.equal(result.blocks[0].values[1],30);
 assert.match(result.text,/摘要/);
 assert.match(result.text,/後續說明/);
 assert.doesNotMatch(result.text,/\u0060\u0060\u0060venus/);
});
test("invalid, unknown, incomplete or oversized Venus blocks stay visible as ordinary code",()=>{
 const samples=[
  fence({kind:"html",html:"<script>alert(1)</script>"}),
  fence({kind:"chart",title:"虛假",labels:["A","B"],values:[1,2],chartType:"line",source:""}),
  fence({kind:"chart",title:"無效",labels:["A","B"],values:[1,Infinity],chartType:"line",source:"數據"}),
  "\u0060\u0060\u0060venus\n{\"kind\":\"metrics\"",
  "\u0060\u0060\u0060venus\n"+" ".repeat(14001)+"\n\u0060\u0060\u0060"
 ];
 for(const input of samples){
  const result=parseVenusMessage(input);
  assert.equal(result.blocks.length,0);
  assert.equal(result.text,input);
 }
});
test("unsafe URLs, image tracking and credentials never become embedded resources",()=>{
 for(const u of ["javascript:alert(1)","data:image/svg+xml;base64,AAA","http://example.com","https://u:p@example.com/a","file:///etc/passwd"])assert.equal(venusSafeUrl(u),null,u);
 assert.equal(venusSafeUrl("https://example.com/image.png"),"https://example.com/image.png");
 const invalid=parseVenusMessage(fence({kind:"gallery",items:[{url:"http://example.com/tracker.jpg",alt:"照片"}]}));
 assert.equal(invalid.blocks.length,0);
 assert.equal(parseVenusMessage(fence({kind:"gallery",items:[{url:"https://example.com/p.jpg",alt:"照片"}]})).blocks.length,1);
 const render=file("src/venus/VenusBlocks.tsx");
 assert.match(render,/載入外部圖片/);
 assert.match(render,/referrerPolicy="no-referrer"/);
 assert.doesNotMatch(render,/dangerouslySetInnerHTML|eval\(/);
});
test("interactive components are limited and do not trigger external actions",()=>{
 const all=[
  {kind:"metrics",items:[{label:"收益",value:"100",note:"2026"}]},
  {kind:"tabs",items:[{label:"A",content:"甲"},{label:"B",content:"乙"}]},
  {kind:"checklist",items:[{text:"確認"},{text:"完成"}]},
  {kind:"quiz",question:"1+1=?",options:["2","3"],correctIndex:0},
  {kind:"timeline",items:[{label:"開始",description:"準備"},{label:"完成",description:"結束"}]}
 ];
 const parsed=parseVenusMessage(fence(all));
 assert.equal(parsed.blocks.length,3===all.length?3:0,"more than 3 blocks is rejected");
 assert.equal(parseVenusMessage(fence(all.slice(0,3))).blocks.length,3);
 assert.equal(parseVenusMessage(fence({kind:"quiz",question:"選擇",options:["A","B"],correctIndex:2})).blocks.length,0);
});
test("Venus instruction is task-aware and keeps small local models light",()=>{
 assert.equal(venusPresentationGuidance("你好","casual",false),"");
 assert.equal(venusPresentationGuidance("請給我趨勢圖","analysis",true),"");
 assert.match(venusPresentationGuidance("請比較兩種方案的時間軸","analysis",false),/Venus 2.0/);
 assert.equal(venusPresentationGuidance("寫一封關於趨勢的信","writing",false),"");
});
test("Venus is integrated into existing safe Markdown and Detroit pipeline",()=>{
 const markdown=file("src/local-ai/ChatMarkdown.tsx");
 const chat=file("src/local-ai/LocalChat.tsx");
 assert.match(markdown,/parseVenusMessage/);
 assert.match(markdown,/<VenusBlocks blocks=/);
 assert.doesNotMatch(markdown,/rehypeRaw|dangerouslySetInnerHTML/);
 assert.match(chat,/venusPresentationGuidance\(question,task,candidate.source==="local"\)/);
 assert.match(chat,/<ChatMarkdown source=\{stripRenderedTable\(turn.content\)\}/);
});
