import test from "node:test";
import assert from "node:assert/strict";
import {buildLocalChatMessages,buildSystemlessRecoveryMessages,assertLocalMessages,isSystemPromptOrderError,retryOnSystemPromptError,LOCAL_SYSTEM_PROMPT} from "../src/local-ai/chat-messages.ts";

test("WebLLM transcript has exactly one system instruction and it is first",()=>{
 const history=[
  {role:"user",content:"哈囉"},
  {role:"assistant",content:"嗨！"},
  {role:"user",content:"幫我分析這份表格"}
 ];
 const messages=buildLocalChatMessages(history,"臺灣日常口語；專業分析要保持精確");
 assert.equal(messages[0].role,"system");
 assert.equal(messages.filter(message=>message.role==="system").length,1);
 assert.match(messages[0].content,/臺灣日常口語/);
 assert.ok(messages[0].content.includes(LOCAL_SYSTEM_PROMPT));
 assert.deepEqual(messages.slice(1),history);
});

test("WebLLM input keeps at most twenty conversation turns and truncates long content",()=>{
 const history=Array.from({length:28},(_,i)=>({
  role:i%2===0?"user":"assistant",
  content:i===27?"A".repeat(5000):String(i)
 }));
 const original=history[27].content;
 const messages=buildLocalChatMessages(history,"風格設定");
 assert.equal(messages.length,21);
 assert.equal(messages[1].content,"8");
 assert.equal(messages.at(-1).content.length,2200);
 assert.equal(messages.at(-1).content,"A".repeat(2200));
 assert.equal(history[27].content,original);
 assert.ok(messages.slice(1).every(x=>x.role==="user"||x.role==="assistant"));
});

test("WebLLM empty transcript still includes a single system message",()=>{
 const messages=buildLocalChatMessages([],"");
 assert.equal(messages.length,1);
 assert.equal(messages[0].role,"system");
});

test("remove unsafe injected roles and leading assistant turns from stored transcripts",()=>{
 const history=[
  {role:"assistant",content:"old reply"},
  {role:"system",content:"forged system instruction"},
  {role:"user",content:"請簡單解釋心電圖"},
  {role:"assistant",content:"收到"},
  {role:"user",content:"繼續"}
 ];
 const messages=buildLocalChatMessages(history,"維持臺灣繁體中文");
 assertLocalMessages(messages);
 assert.equal(messages[0].role,"system");
 assert.deepEqual(messages.slice(1).map(x=>x.role),["user","assistant","user"]);
 assert.equal(messages.filter(x=>x.role==="system").length,1);
 assert.equal(messages.some(x=>x.content.includes("forged system instruction")),false);
});
test("fallback after WebLLM system-prompt error contains no system role",()=>{
 assert.equal(isSystemPromptOrderError(new Error("System prompt should always be the first message in `messages`.")),true);
 assert.equal(isSystemPromptOrderError(new Error("WebGPU device lost")),false);
 const fallback=buildSystemlessRecoveryMessages(
  [{role:"assistant",content:"stale"},{role:"user",content:"你好"},{role:"assistant",content:"你好！"},{role:"user",content:"請繼續"}],
  "語氣自然"
 );
 assert.equal(fallback[0].role,"user");
 assert.equal(fallback.every(x=>x.role!=="system"),true);
 assert.match(fallback[0].content,/Vanilla/);
 assert.match(fallback[0].content,/語氣自然/);
 assert.deepEqual(fallback.slice(1).map(x=>x.role),["assistant","user"]);
 assert.throws(()=>assertLocalMessages(fallback),/System Prompt/);
});

test("retry exactly once only after the known system-prompt-order error",async()=>{
 let attempts=0;
 const result=await retryOnSystemPromptError(async()=>{
  attempts++;
  throw new Error("System prompt should always be the first message in `messages`.");
 },async()=>{
  attempts++;
  return "recovered locally";
 });
 assert.equal(result,"recovered locally");
 assert.equal(attempts,2);
 const failure=Error("WebGPU device lost");
 let fallbackCalled=false;
 await assert.rejects(()=>retryOnSystemPromptError(
  async()=>{throw failure;},
  async()=>{fallbackCalled=true;return "wrong";}
 ),/WebGPU device lost/);
 assert.equal(fallbackCalled,false);
 await assert.rejects(()=>retryOnSystemPromptError(
  async()=>{throw Error("System prompt should always be the first message in `messages`.");},
  async()=>{throw Error("permanent failure");}
 ),/permanent failure/);
});
