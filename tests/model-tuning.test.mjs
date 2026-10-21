import test from "node:test";
import assert from "node:assert/strict";
import {profileFor,LOCAL_CATALOG,parseParamsB,geminiLiteSibling} from "../src/ai/model-profiles.ts";
import {webllmRequestOptions,ollamaRequestExtras,geminiGenerationConfig,geminiThinkingLevel,deepseekRequestExtras} from "../src/ai/generation-config.ts";
import {estimateTokens,truncateToTokens,composeUserPrompt,fitHistory} from "../src/ai/context-budget.ts";
import {stripThinking,collapseRepetition,cleanModelOutput} from "../src/ai/output-cleanup.ts";
import {readNDJSON,readSSE} from "../src/ai/stream-parsers.ts";
import {vanillaSystemPrompt,todayLine} from "../src/ai/prompts.ts";
import {classifyTask} from "../src/ai/task-kind.ts";

globalThis.localStorage??={_m:new Map(),getItem(k){return this._m.get(k)??null;},setItem(k,v){this._m.set(k,String(v));},removeItem(k){this._m.delete(k);}};
globalThis.window??=new EventTarget();

test("local profiles respect the 4K WebLLM window and keep phones on short prompts",()=>{
 for(const entry of LOCAL_CATALOG){
  const p=profileFor("local",entry.id);
  assert.equal(p.contextTokens,4096,entry.id);
  for(const task of ["casual","general","writing","analysis","code"])assert.ok(p.maxOutput[task]<=1408,entry.id+" "+task);
 }
 assert.equal(profileFor("local","Qwen2.5-0.5B-Instruct-q4f16_1-MLC").compactPrompt,true);
 assert.equal(profileFor("local","Qwen2.5-3B-Instruct-q4f16_1-MLC").compactPrompt,false);
 assert.ok(profileFor("local","Qwen3-1.7B-q4f16_1-MLC").tier>profileFor("local","Qwen2.5-0.5B-Instruct-q4f16_1-MLC").tier);
});

test("Qwen3 thinking is switched off on-device and sampling is lower for code than chat",()=>{
 const qwen3=webllmRequestOptions("Qwen3-1.7B-q4f16_1-MLC","general");
 assert.deepEqual(qwen3.extra_body,{enable_thinking:false});
 assert.equal(webllmRequestOptions("Qwen2.5-0.5B-Instruct-q4f16_1-MLC","general").extra_body,undefined);
 assert.ok(webllmRequestOptions("Qwen2.5-1.5B-Instruct-q4f16_1-MLC","code").temperature<webllmRequestOptions("Qwen2.5-1.5B-Instruct-q4f16_1-MLC","casual").temperature);
});

test("Ollama gets a real num_ctx, keep_alive, and thinking only for big models on hard tasks",()=>{
 const taide=ollamaRequestExtras("taide-llama3.1-8b-chat","general");
 assert.equal(taide.options.num_ctx,8192);
 assert.equal(taide.keep_alive,"30m");
 assert.equal(taide.think,undefined);
 assert.equal(ollamaRequestExtras("qwen3:14b","analysis").think,true);
 assert.equal(ollamaRequestExtras("qwen3:14b","casual").think,false);
 assert.equal(ollamaRequestExtras("qwen3:4b","code").think,false);
 assert.equal(parseParamsB("qwen2.5:7b-instruct"),7);
 assert.equal(parseParamsB("gemma3:27b"),27);
});

test("Gemini 3 keeps default temperature, scales thinking by task, and leaves room for thoughts",()=>{
 const casual=geminiGenerationConfig("gemini-3.8-flash","casual");
 assert.equal(casual.temperature,undefined);
 assert.equal(casual.thinkingLevel,"low");
 assert.equal(geminiThinkingLevel("gemini-3.5-flash-lite","casual"),"minimal");
 assert.equal(geminiThinkingLevel("gemini-3.8-flash","code"),"high");
 assert.equal(geminiThinkingLevel("gemini-3.5-flash-lite","code"),"medium");
 assert.ok(geminiGenerationConfig("gemini-3.8-flash","general").maxOutputTokens>=8192);
 assert.equal(geminiGenerationConfig("gemini-3.8-flash","general",false).thinkingLevel,undefined);
 assert.equal(typeof geminiGenerationConfig("gemini-2.5-flash","code").temperature,"number");
 assert.equal(geminiLiteSibling("gemini-3.8-flash"),"gemini-3.5-flash-lite");
 assert.equal(geminiLiteSibling("gemini-2.5-flash"),"gemini-2.5-flash-lite");
});

test("DeepSeek follows the vendor temperature table and thinks only for analysis/code",()=>{
 const chat=deepseekRequestExtras("deepseek-flash","general");
 assert.deepEqual(chat.thinking,{type:"disabled"});
 assert.equal(chat.temperature,1.3);
 const code=deepseekRequestExtras("deepseek-flash","code");
 assert.deepEqual(code.thinking,{type:"enabled"});
 assert.equal(code.reasoning_effort,"high");
 assert.equal(code.temperature,undefined);
 assert.equal(deepseekRequestExtras("deepseek-chat","code").temperature,0);
 assert.equal(deepseekRequestExtras("deepseek-chat","code").thinking,undefined);
});

test("context budget never cuts the question and labels every truncation honestly",()=>{
 assert.equal(estimateTokens("你好"),2);
 assert.ok(estimateTokens("hello world, this is text")<10);
 const doc="第一段內容。".repeat(900);
 const result=composeUserPrompt("請摘要這份文件重點",[{id:"file",label:"附件",text:doc,priority:1},{id:"memory",label:"Drive 記憶",text:"記憶".repeat(500),priority:2}],"",1500);
 assert.ok(result.content.startsWith("請摘要這份文件重點"));
 assert.ok(estimateTokens(result.content)<=1500+40);
 assert.equal(result.included[0].truncated,true);
 assert.match(result.content,/受模型長度限制只提供前/);
 assert.deepEqual(result.omitted,["Drive 記憶"]);
 const small=composeUserPrompt("問題",[{id:"a",label:"A",text:"短內容",priority:1}],"",500);
 assert.equal(small.included[0].truncated,false);
 assert.ok(truncateToTokens("一二三四五。六七八九十。",6).length<=6);
});

test("history fitting keeps the newest turns and always starts with a user turn",()=>{
 const turns=Array.from({length:30},(_,i)=>({role:i%2?"assistant":"user",content:"訊息"+i+"。".repeat(i===3?3000:20)}));
 turns.push({role:"user",content:"最新問題"});
 const fitted=fitHistory(turns,400,120);
 assert.equal(fitted.at(-1).content,"最新問題");
 assert.equal(fitted[0].role,"user");
 assert.ok(fitted.length<turns.length);
});

test("thinking blocks never reach the chat, even mid-stream",()=>{
 assert.deepEqual(stripThinking("<think>計算中</think>答案是 4"),{text:"答案是 4",thinking:false});
 assert.deepEqual(stripThinking("<think>還在想"),{text:"",thinking:true});
 assert.equal(stripThinking("推理過程</think>\n結論").text,"結論");
 assert.equal(cleanModelOutput("<think>x</think>好的"),"好的");
});

test("repetition loops from small models are cut with an explanation",()=>{
 const loop="今天天氣很好。"+"我們去公園散步吧。".repeat(14);
 const out=collapseRepetition(loop);
 assert.equal(out.collapsed,true);
 assert.ok(out.text.length<loop.length);
 assert.match(out.text,/重複輸出/);
 assert.equal(collapseRepetition("正常的回答。內容不同。第三句也不同。這樣很好。").collapsed,false);
 assert.equal(collapseRepetition("哈".repeat(80)).collapsed,true);
});

test("stream parsers handle split chunks for Ollama NDJSON and SSE",async()=>{
 const enc=new TextEncoder();
 const stream=(parts)=>new Response(new ReadableStream({start(c){for(const p of parts)c.enqueue(enc.encode(p));c.close();}}));
 const got=[];
 await readNDJSON(stream(['{"message":{"content":"你"}}\n{"mess','age":{"content":"好"}}\n','{"done":true}']),o=>got.push(o.message?.content||"|"));
 assert.deepEqual(got,["你","好","|"]);
 const events=[];
 await readSSE(stream(["data: {\"a\":1}\n\n: keep-alive\n\nda","ta: {\"a\":2}\n\ndata: [DONE]\n\ndata: {\"a\":3}\n\n"]),d=>events.push(JSON.parse(d).a));
 assert.deepEqual(events,[1,2]);
});

test("system prompts: compact for phones, full rules + task guidance for big models, with today's date",()=>{
 const compact=vanillaSystemPrompt({task:"casual",compact:true,latestUserText:"嗨"});
 const full=vanillaSystemPrompt({task:"analysis",compact:false,latestUserText:"幫我比較兩個方案"});
 assert.ok(estimateTokens(compact)<230,String(estimateTokens(compact)));
 assert.ok(full.length>compact.length*2);
 assert.match(full,/結論 → 依據/);
 assert.match(full,/臺灣繁體中文/);
 assert.match(todayLine(new Date("2026-10-19T03:00:00Z")),/2026/);
});

test("task classification",()=>{
 assert.equal(classifyTask("嗨"),"casual");
 assert.equal(classifyTask("幫我寫一封請假 email 給老師"),"writing");
 assert.equal(classifyTask("比較 A 和 B 方案的優缺點"),"analysis");
 assert.equal(classifyTask("這段 python 為什麼報錯"),"code");
 assert.equal(classifyTask("說明光合作用"),"general");
 assert.equal(classifyTask("看看這張",true),"vision");
});


test("modern Tongcheng prose: compact and full prompts require substance, order and natural speech",()=>{
 const full=vanillaSystemPrompt({task:"general",compact:false,latestUserText:"說明 CPU 與 GPU 的差別"});
 const compact=vanillaSystemPrompt({task:"general",compact:true,latestUserText:"說明 CPU 與 GPU 的差別"});
 for(const prompt of [full,compact]){
  assert.match(prompt,/言有物/);
  assert.match(prompt,/言有序/);
  assert.match(prompt,/白話/);
 }
 assert.match(full,/如使用者指定其他風格/);
 assert.ok(estimateTokens(compact)<230,"small-device prompt must remain compact");
});
