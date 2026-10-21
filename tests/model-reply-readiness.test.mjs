import test from "node:test";
import assert from "node:assert/strict";
import {modelUnavailableReply} from "../src/local-ai/model-unavailable.ts";

const base={privateMode:false,online:true,localReady:false,ollamaConfigured:false,cloudConfigured:false,allowMetered:false,loadingLocal:false};

test("October: no installed model displays an answer, not a temporary route status",()=>{
 const message=modelUnavailableReply(base);
 assert.match(message,/無法回覆/);
 assert.match(message,/模型與工具/);
 assert.match(message,/october:0\.3/);
 assert.doesNotMatch(message,/已執行|已完成部署/);
});
test("October: private mode never advises silent cloud fallback",()=>{
 const message=modelUnavailableReply({...base,privateMode:true,cloudConfigured:true});
 assert.match(message,/私密模式/);
 assert.match(message,/不會.*雲端/);
});
test("October: cloud setup without user consent does not trigger a paid request",()=>{
 const message=modelUnavailableReply({...base,cloudConfigured:true});
 assert.match(message,/允許計費雲端 API/);
 assert.match(message,/不會擅自/);
});
test("October: configured Ollama includes reachability and model-name diagnostics",()=>{
 const message=modelUnavailableReply({...base,ollamaConfigured:true});
 assert.match(message,/october:0\.3/);
 assert.match(message,/localhost/);
 assert.match(message,/不等於模型已在線/);
});
test("October: local model still loading is reported as loading, not ready",()=>{
 const message=modelUnavailableReply({...base,loadingLocal:true});
 assert.match(message,/還在載入/);
 assert.match(message,/尚未取得任何生成結果/);
});
test("October: offline with no model never claims remote access",()=>{
 const message=modelUnavailableReply({...base,online:false});
 assert.match(message,/離線/);
 assert.match(message,/沒有已載入的本機模型/);
});
