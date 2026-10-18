import test from "node:test";
import assert from "node:assert/strict";
import {buildLocalChatMessages,LOCAL_SYSTEM_PROMPT} from "../src/local-ai/chat-messages.ts";

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
