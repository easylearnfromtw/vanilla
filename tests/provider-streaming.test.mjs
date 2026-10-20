import test from "node:test";
import assert from "node:assert/strict";

// Browser globals the provider modules expect.
globalThis.window??=new EventTarget();
globalThis.localStorage??={_m:new Map(),getItem(k){return this._m.get(k)??null;},setItem(k,v){this._m.set(k,String(v));},removeItem(k){this._m.delete(k);}};
globalThis.sessionStorage??={_m:new Map(),getItem(k){return this._m.get(k)??null;},setItem(k,v){this._m.set(k,String(v));},removeItem(k){this._m.delete(k);}};
const {setProvider,generateCloudReply}=await import("../src/vault/providers.ts");
const {setOllamaConfig,generateOllamaReply}=await import("../src/ai/ollama.ts");

const enc=new TextEncoder();
const streamed=(chunks,init={})=>new Response(new ReadableStream({start(c){for(const x of chunks)c.enqueue(enc.encode(x));c.close();}}),{status:200,...init});
function mockFetch(handler){const calls=[];const prev=globalThis.fetch;globalThis.fetch=async(url,init={})=>{const call={url:String(url),init,body:init.body?JSON.parse(init.body):null};calls.push(call);return handler(call,calls.length);};return {calls,restore(){globalThis.fetch=prev;}};}

test("Gemini streams over SSE with task-tuned thinking and a generous output budget",async()=>{
 setProvider({provider:"gemini",key:"test-key",model:"gemini-3.8-flash"});
 const m=mockFetch(()=>streamed(['data: {"candidates":[{"content":{"parts":[{"text":"你好，"}]}}]}\n\n','data: {"candidates":[{"content":{"parts":[{"text":"我是 Vanilla。"}]}}]}\n\n']));
 try{
  const seen=[];
  const out=await generateCloudReply("gemini",[{role:"user",content:"比較兩個方案的優缺點"}],undefined,undefined,{onText:t=>seen.push(t)});
  assert.equal(out,"你好，我是 Vanilla。");
  assert.ok(seen.length>=2,"partial text is published while streaming");
  const call=m.calls[0];
  assert.match(call.url,/gemini-3\.8-flash:streamGenerateContent\?alt=sse/);
  assert.equal(call.init.headers["x-goog-api-key"],"test-key");
  assert.equal(call.body.generationConfig.thinkingLevel,"medium");
  assert.ok(call.body.generationConfig.maxOutputTokens>=8192);
  assert.equal(call.body.generationConfig.temperature,undefined);
  assert.match(call.body.systemInstruction.parts[0].text,/結論 → 依據/);
 }finally{m.restore();}
});

test("a model that rejects the thinking field is retried once without tuning",async()=>{
 setProvider({provider:"gemini",key:"k",model:"gemini-2.5-flash"});
 const m=mockFetch((call,n)=>n===1?new Response('{"error":{"message":"Invalid JSON payload received. Unknown name \\"thinkingLevel\\""}}',{status:400}):streamed(['data: {"candidates":[{"content":{"parts":[{"text":"OK"}]}}]}\n\n']));
 try{
  assert.equal(await generateCloudReply("gemini",[{role:"user",content:"嗨"}]),"OK");
  assert.equal(m.calls.length,2);
  assert.equal(m.calls[1].body.generationConfig.thinkingLevel,undefined);
 }finally{m.restore();}
});

test("structured callers get JSON mode, no persona and byte-exact output",async()=>{
 setProvider({provider:"gemini",key:"k",model:"gemini-3.8-flash"});
 const json='{"changes":[{"cell":"A1","value":"信息"},{"cell":"A2","value":"信息"},{"cell":"A3","value":"信息"},{"cell":"A4","value":"信息"}]}';
 const m=mockFetch(()=>streamed(["data: "+JSON.stringify({candidates:[{content:{parts:[{text:json}]}}]})+"\n\n"]));
 try{
  const out=await generateCloudReply("gemini",[{role:"user",content:"請只回傳 JSON"}],undefined,undefined,{purpose:"structured"});
  assert.equal(out,json,"no repetition trimming or phrase conversion inside JSON");
  assert.equal(m.calls[0].body.generationConfig.responseMimeType,"application/json");
  assert.match(m.calls[0].body.systemInstruction.parts[0].text,/結構化輸出引擎/);
 }finally{m.restore();}
});

test("DeepSeek streams, follows its temperature table and skips thinking for chat",async()=>{
 setProvider({provider:"deepseek",key:"dk",model:"deepseek-flash"});
 const m=mockFetch(()=>streamed(['data: {"choices":[{"delta":{"reasoning_content":"…"}}]}\n\n','data: {"choices":[{"delta":{"content":"週末可以"}}]}\n\n','data: {"choices":[{"delta":{"content":"去爬山。"}}]}\n\n',"data: [DONE]\n\n"]));
 try{
  const out=await generateCloudReply("deepseek",[{role:"user",content:"週末去哪裡玩"}]);
  assert.equal(out,"週末可以去爬山。");
  const body=m.calls[0].body;
  assert.equal(body.stream,true);
  assert.deepEqual(body.thinking,{type:"disabled"});
  assert.equal(body.temperature,1.3);
  assert.equal(m.calls[0].init.headers.Authorization,"Bearer dk");
 }finally{m.restore();}
});

test("Ollama streams NDJSON with num_ctx, keep_alive and strips thinking blocks",async()=>{
 setOllamaConfig({endpoint:"https://ollama.example.test",model:"qwen3:14b",models:[]});
 const m=mockFetch(()=>streamed(['{"message":{"content":"<think>先想"}}\n','{"message":{"content":"一下</think>答案"}}\n','{"message":{"content":"是 42。"},"done":true}\n']));
 try{
  const seen=[];
  const out=await generateOllamaReply([{role:"user",content:"分析這個數字"}],undefined,{onText:t=>seen.push(t)});
  assert.equal(out,"答案是 42。");
  assert.ok(!seen.some(t=>t.includes("先想")),"chain-of-thought never shown");
  const body=m.calls[0].body;
  assert.equal(m.calls[0].url,"https://ollama.example.test/api/chat");
  assert.equal(body.stream,true);
  assert.equal(body.options.num_ctx,8192);
  assert.equal(body.keep_alive,"30m");
  assert.equal(body.think,true);
  assert.equal(body.messages[0].role,"system");
 }finally{m.restore();}
});

test("Ollama JSON mode for structured output and plain retry on HTTP 400",async()=>{
 setOllamaConfig({endpoint:"https://ollama.example.test",model:"qwen3:14b",models:[]});
 const m=mockFetch((call,n)=>n===1?new Response("bad",{status:400}):streamed(['{"message":{"content":"{\\"ok\\":true}"},"done":true}\n']));
 try{
  const out=await generateOllamaReply([{role:"user",content:"回傳 JSON"}],undefined,{purpose:"structured"});
  assert.equal(out,'{"ok":true}');
  assert.equal(m.calls[0].body.format,"json");
  assert.equal(m.calls[1].body.format,undefined);
  assert.equal(m.calls[1].body.think,undefined);
 }finally{m.restore();}
});


test("provider stream explicitly cut off by token limit is not considered a success",async()=>{
 setProvider({provider:"gemini",key:"test-key",model:"gemini-3.8-flash"});
 const m=mockFetch(()=>streamed(['data: {"candidates":[{"content":{"parts":[{"text":"前半段"}]},"finishReason":"MAX_TOKENS"}]}\n\n']));
 try{
  await assert.rejects(generateCloudReply("gemini",[{role:"user",content:"請回答"}]),/輸出長度上限/);
 }finally{m.restore();}
});

test("DeepSeek truncated stream fails instead of silently returning partial text",async()=>{
 setProvider({provider:"deepseek",key:"test-key",model:"deepseek-flash"});
 const m=mockFetch(()=>streamed(['data: {"choices":[{"delta":{"content":"不完整"},"finish_reason":"length"}]}\n\n']));
 try{
  await assert.rejects(generateCloudReply("deepseek",[{role:"user",content:"請回答"}]),/輸出長度上限/);
 }finally{m.restore();}
});

test("Ollama broken NDJSON stream is not accepted even when there is partial text",async()=>{
 setOllamaConfig({endpoint:"https://ollama.example.test",model:"qwen3:14b",models:[]});
 const m=mockFetch(()=>streamed(['{"message":{"content":"只得到半句"}}\n']));
 try{
  await assert.rejects(generateOllamaReply([{role:"user",content:"請回答"}]),/串流未正常完成/);
 }finally{m.restore();}
});
