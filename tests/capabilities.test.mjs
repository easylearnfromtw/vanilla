import test from "node:test";
import assert from "node:assert/strict";
import {capabilityIntent,capabilityAnswer,capabilityItems} from "../src/assistant/capability-report.ts";

const offline={localReady:false,webgpu:true,localModel:null,online:false,privateMode:false,driveSession:false,geminiConfigured:false,deepseekConfigured:false,ollamaConfigured:false};
const ready={...offline,localReady:true,localModel:"Qwen2.5-0.5B-Instruct-q4f16_1-MLC",online:true,driveSession:true,geminiConfigured:true,ollamaConfigured:false};

test("basic ability questions route to deterministic capability overview",()=>{
 for(const input of ["你能做什麼？","你可以做什麼","你有哪些功能？","Vanilla 有哪些功能","你現在有什麼功能","介紹你的功能","功能清單","我想知道你能做什麼","你目前可以幫我做什麼"]){
  assert.equal(capabilityIntent(input),"overview",input);
 }
});
test("topic-specific status questions route to the relevant shipped feature",()=>{
 for(const [input,expected] of [
  ["你支援 Google Drive 嗎？","drive"],
  ["你能搜尋網路嗎？","search"],
  ["你能控制 iPhone 嗎？","phone"],
  ["你能做 CREAM 統計嗎？","research"],
  ["你可以做 Excel 表格嗎？","sheets"],
  ["Vanilla 可以讀取 PDF 嗎？","media"],
  ["你現在能使用 Ollama 嗎？","models"],
  ["你有家庭成員隔離功能嗎？","family"]
 ])assert.equal(capabilityIntent(input),expected,input);
});
test("actual action requests stay on their existing tools and model routes",()=>{
 for(const input of ["幫我做一份家庭收支表格","你可以幫我建立一個表格","在 Sheets 修改 A1","搜尋：台灣醫師國考",
  "新增功能：整合 ChatGPT","你幫我寫一份旅行計畫","你剛才說的內容是什麼？","把圖改成折線圖",
  "幫我整理這篇論文","你好","你現在正在做什麼"]){
  assert.equal(capabilityIntent(input),null,input);
 }
});
test("overview honestly distinguishes available, setup, limited and planned status",()=>{
 const txt=capabilityAnswer("overview",offline);
 assert.match(txt,/Vanilla Sheets/);
 assert.match(txt,/CREAM.*尚未|CREAM／進階數據分析/);
 assert.match(txt,/【尚未上線】CREAM/);
 assert.match(txt,/【尚未上線】Mobilerun/);
 assert.match(txt,/Google Drive/);
 assert.match(txt,/需要設定／授權/);
 assert.ok(!txt.includes("已經完成 14 個模組"));
 assert.ok(!txt.includes("已替你控制手機"));
});
test("current device state changes the answer without exposing user identity",()=>{
 const live=capabilityAnswer("overview",ready);
 assert.match(live,/本機模型已載入/);
 assert.match(live,/Google Drive 登入工作階段/);
 assert.match(live,/已設定的外部模型/);
 const privateState=capabilityItems({...ready,privateMode:true});
 assert.equal(privateState.drive.status,"setup");
 assert.match(privateState.drive.detail,/私密模式/);
 assert.doesNotMatch(privateState.models.detail,/也可使用已設定的外部模型/);
 const disconnected=capabilityItems(offline);
 assert.equal(disconnected.models.status,"setup");
 assert.equal(disconnected.memory.status,"setup");
});
test("no claims of automatic online extraction, phone control or completed studies",()=>{
 const txt=capabilityAnswer("search",ready);
 assert.match(txt,/不代表已自動開啟網頁/);
 assert.match(capabilityAnswer("phone",ready),/沒有跨 App 系統控制權/);
 assert.match(capabilityAnswer("research",ready),/尚未安裝/);
 assert.match(capabilityAnswer("builder",ready),/不是自己修改 GitHub 原始碼/);
});
