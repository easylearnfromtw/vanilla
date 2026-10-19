import test from "node:test";
import assert from "node:assert/strict";
import {capabilityIntent,capabilityItems,capabilityAnswer} from "../src/assistant/capability-report.ts";

const disconnected={
 localReady:false,webgpu:false,localModel:null,online:false,privateMode:true,
 driveSession:false,geminiConfigured:false,deepseekConfigured:false,ollamaConfigured:false
};
const connected={
 ...disconnected,localReady:true,webgpu:true,localModel:"Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
 online:true,privateMode:false,driveSession:true,geminiConfigured:true,ollamaConfigured:false,ollamaConfigured:true
};

test("Capability questions are intercepted without calling any LLM",()=>{
 for(const q of ["你能做什麼？","你可以做什麼","Vanilla有哪些功能","你的功能介紹","介紹你的功能","你有什麼功能","你能做什麼","你可以幫我做什麼"]){
  assert.equal(capabilityIntent(q),"overview",q);
 }
 for(const [q,topic] of [
  ["你可以操作iPhone嗎？","phone"],["你支援 CREAM 圖表嗎","research"],
  ["你能讀取我的 Google Drive 嗎？","drive"],["你可以幫我做試算表嗎","sheets"],
  ["你有辦法連接其他人的家庭帳號嗎","family"],["你能幫我產生 PDF 報告嗎","media"],
  ["你可以自己改 GitHub 程式嗎","builder"]
 ])assert.equal(capabilityIntent(q),topic,q);
});
test("Ordinary questions and tasks do not trigger a capability pitch",()=>{
 for(const q of ["你好","幫我製作家庭收支表格","搜尋：台灣醫師國考",
  "幫我寫一段介紹 CREAM 的文字","分析這篇論文","iPhone 17 Pro 支援 WebGPU 嗎？",
  "我想在新的對話整理報告","能不能把這個數據整理好","記住：我喜歡黑白灰設計"]){
  assert.equal(capabilityIntent(q),null,q);
 }
});
test("No connection and no local model are not misrepresented as ready",()=>{
 const items=capabilityItems(disconnected);
 assert.equal(items.models.status,"setup");
 assert.equal(items.drive.status,"setup");
 assert.equal(items.memory.status,"setup");
 assert.equal(items.phone.status,"planned");
 assert.equal(items.research.status,"planned");
 assert.equal(items.sheets.status,"available");
 const text=capabilityAnswer("overview",disconnected);
 assert.match(text,/目前沒有已載入的可用本地模型/);
 assert.match(text,/CREAM/);
 assert.match(text,/尚未上線/);
 assert.doesNotMatch(text,/已連線成功/);
});
test("Connected state is labeled but never claimed to be tested remotely",()=>{
 const items=capabilityItems(connected);
 assert.equal(items.models.status,"available");
 assert.equal(items.drive.status,"available");
 assert.equal(items.memory.status,"available");
 assert.match(capabilityAnswer("drive",connected),/實際能否成功/);
 assert.match(capabilityAnswer("models",connected),/Qwen2.5/);
 assert.match(capabilityAnswer("phone",connected),/沒有跨 App 系統控制權/);
});
test("Private mode never offers Google Drive memory as available",()=>{
 const items=capabilityItems({...connected,privateMode:true});
 assert.equal(items.drive.status,"setup");
 assert.equal(items.memory.status,"setup");
 assert.match(items.drive.detail,/私密模式/);
});
test("Named capabilities clearly state limits, examples and pending development",()=>{
 const report=capabilityAnswer("overview",connected);
 assert.match(report,/Vanilla Sheets/);
 assert.match(report,/CREAM/);
 assert.match(report,/Mobilerun/);
 assert.match(report,/自動爬取|即時爬取/);
 assert.match(report,/功能登錄/);
 assert.match(capabilityAnswer("builder",connected),/不是自己修改 GitHub/);
});
