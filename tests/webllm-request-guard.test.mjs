import test from "node:test";
import assert from "node:assert/strict";
import {validateWebLLMMessages,inspectWebLLMMessages} from "../src/local-ai/request-guard.ts";
import {buildLocalChatMessages,buildSystemlessRecoveryMessages} from "../src/local-ai/chat-messages.ts";
import {readFileSync} from "node:fs";
import {PINNED_WEBLLM_VERSION,isPinnedWebLLMModelSupported,isDisposedWebLLMFailure} from "../src/local-ai/webllm-compat.ts";

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
