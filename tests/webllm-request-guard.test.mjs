import {isIOSWebLLMDevice,shouldAutoLoadCachedModel,needsMobileMemoryConfirmation,mayFallbackToMainThread} from "../src/local-ai/mobile-safety.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {validateWebLLMMessages,inspectWebLLMMessages} from "../src/local-ai/request-guard.ts";
import {buildLocalChatMessages,buildSystemlessRecoveryMessages} from "../src/local-ai/chat-messages.ts";
import {readFileSync} from "node:fs";
import {PINNED_WEBLLM_VERSION,isPinnedWebLLMModelSupported,isDisposedWebLLMFailure,retryDisposedLocalInference} from "../src/local-ai/webllm-compat.ts";

test("exact normal WebLLM request has system only at index zero",()=>{
 const prompt=buildLocalChatMessages([{role:"user",content:"你好"},{role:"assistant",content:"你好！"},{role:"user",content:"請繼續"}],"使用繁體中文");
 const safe=prompt.map(message=>({...message}));
 assert.deepEqual(validateWebLLMMessages(safe).roles,["system","user","assistant","user"]);
 assert.equal(safe[0].role,"system");
});
test("pre-inference guard rejects the exact upstream second-position system error",()=>{
 const bad=[{role:"user",content:"test"},{role:"system",content:"override"},{role:"user",content:"do it"}];
 assert.deepEqual(inspectWebLLMMessages(bad).roles,["user","system","user"]);
 assert.throws(()=>validateWebLLMMessages(bad),/無效的 WebLLM/);
 assert.throws(()=>validateWebLLMMessages([{role:"system",content:"first"},{role:"system",content:"second"},{role:"user",content:"next"}]),/無效的 WebLLM/);
 assert.throws(()=>validateWebLLMMessages([{role:"system",content:"first"},{role:"assistant",content:"end"}]),/無效的 WebLLM/);
});
test("systemless local recovery allowed only in recovery mode",()=>{
 const retry=buildSystemlessRecoveryMessages([{role:"user",content:"你好"}],"請簡潔");
 assert.equal(validateWebLLMMessages(retry,"recovery").systemCount,0);
 assert.throws(()=>validateWebLLMMessages(retry,"normal"),/無效的 WebLLM/);
});
test("build and server version manifest must match",()=>{
 const build=readFileSync(new URL("../src/version.ts",import.meta.url),"utf8").match(/VANILLA_BUILD="([^"]+)"/)?.[1];
 const manifest=JSON.parse(readFileSync(new URL("../public/version.json",import.meta.url),"utf8"));
 assert.equal(manifest.build,build);
});

test("WebLLM is pinned to the confirmed pre-shapeCache regression version",()=>{
 const pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));
 assert.equal(PINNED_WEBLLM_VERSION,"0.2.82");
 assert.equal(pkg.dependencies["@mlc-ai/web-llm"],PINNED_WEBLLM_VERSION);
 assert.equal(isPinnedWebLLMModelSupported("Qwen3.5-2B-q4f16_1-MLC"),false);
 assert.equal(isPinnedWebLLMModelSupported("Qwen3-1.7B-q4f16_1-MLC"),true);
 assert.equal(isPinnedWebLLMModelSupported("Qwen2.5-0.5B-Instruct-q4f16_1-MLC"),true);
});
test("disposed TVM failures are distinguished from ordinary API errors",()=>{
 assert.equal(isDisposedWebLLMFailure(new Error("Object has already been disposed")),true);
 assert.equal(isDisposedWebLLMFailure("Module has already been disposed"),true);
 assert.equal(isDisposedWebLLMFailure(new Error("Ollama HTTP 429")),false);
});

test("disposed GPU handle reloads and retries once without leaking partial text",async()=>{
 let attempts=0,reloads=0,resets=0;
 const value=await retryDisposedLocalInference(
  async()=>{attempts++;if(attempts===1)throw new Error("The current Object has already been disposed");return "恢復成功";},
  async()=>{reloads++;},
  ()=>{resets++}
 );
 assert.equal(value,"恢復成功");
 assert.equal(attempts,2);assert.equal(reloads,1);assert.equal(resets,1);
});
test("disposed errors cannot trigger an infinite reload loop",async()=>{
 let attempts=0,reloads=0;
 await assert.rejects(
  retryDisposedLocalInference(
   async()=>{attempts++;throw new Error("The current Object has already been disposed");},
   async()=>{reloads++;}
  ),/disposed/
 );
 assert.equal(attempts,2);assert.equal(reloads,1);
});
test("ordinary provider errors are not retried or reloaded",async()=>{
 let reloads=0;
 await assert.rejects(retryDisposedLocalInference(
  async()=>{throw new Error("Ollama HTTP 429");},
  async()=>{reloads++;}
 ),/429/);
 assert.equal(reloads,0);
});
test("cancelled local requests never reload disposed engines",async()=>{
 const controller=new AbortController();controller.abort();
 let reloads=0;
 await assert.rejects(retryDisposedLocalInference(
  async()=>{throw new Error("Object has already been disposed");},
  async()=>{reloads++;},
  undefined,
  controller.signal
 ),/disposed/);
 assert.equal(reloads,0);
});

test("iOS device detection also covers iPadOS desktop-user-agent mode",()=>{
 assert.equal(isIOSWebLLMDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X)"),true);
 assert.equal(isIOSWebLLMDevice("Mozilla/5.0", "MacIntel",5),true);
 assert.equal(isIOSWebLLMDevice("Mozilla/5.0", "MacIntel",0),false);
 assert.equal(isIOSWebLLMDevice("Mozilla/5.0 (X11; Linux x86_64)"),false);
});
test("iPhone cached weights are never auto-initialized and large models require confirmation",()=>{
 assert.equal(shouldAutoLoadCachedModel(true),false);
 assert.equal(shouldAutoLoadCachedModel(false),true);
 assert.equal(needsMobileMemoryConfirmation(true,945),false);
 assert.equal(needsMobileMemoryConfirmation(true,1404),true);
 assert.equal(needsMobileMemoryConfirmation(false,3432),false);
});
test("iPhone worker failure cannot silently fall back to UI-thread WebGPU",()=>{
 assert.equal(mayFallbackToMainThread(true,"auto"),false);
 assert.equal(mayFallbackToMainThread(true,"broken"),false);
 assert.equal(mayFallbackToMainThread(true,"off"),true);
 assert.equal(mayFallbackToMainThread(false,"broken"),true);
 const engine=readFileSync(new URL("../src/local-ai/engine.ts",import.meta.url),"utf8");
 const panel=readFileSync(new URL("../src/local-ai/LocalModelPanel.tsx",import.meta.url),"utf8");
 const chat=readFileSync(new URL("../src/local-ai/LocalChat.tsx",import.meta.url),"utf8");
 assert.match(engine,/if\(!mayFallbackToMainThread\(iosDevice,mode\)\)/);
 assert.match(engine,/worker\?\.terminate\(\)/);
 assert.match(engine,/await releaseEngine\(old\)/);
 assert.match(panel,/checked=\{worker==="auto"\}/);
 assert.match(chat,/shouldAutoLoadCachedModel\(iosDevice\)/);
 assert.match(chat,/if\(!iosDevice&&/);
});
