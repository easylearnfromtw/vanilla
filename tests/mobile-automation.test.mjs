import test from "node:test";
import assert from "node:assert/strict";
import {planMobileTask,mobileCliCommand,validateMobileBridgeUrl,executeReadOnlyMobileTask} from "../src/mobile/mobile-agent.ts";

test("supervised phone agent preserves read-only and manual interactive modes",()=>{
 const read=planMobileTask("查看目前開啟的 App","ios");
 const interactive=planMobileTask("打開設定","ios");
 assert.equal(read.risk,"read-only");
 assert.equal(interactive.risk,"interactive");
 assert.match(mobileCliCommand(read),/ --ios --steps 5$/);
 assert.equal(planMobileTask("","ios").risk,"blocked");
});

test("device bridge requires authenticated HTTPS endpoint",()=>{
 assert.throws(()=>validateMobileBridgeUrl("http://example.org/api/vanilla/mobile/run"));
 assert.throws(()=>validateMobileBridgeUrl("https://localhost/api/vanilla/mobile/run"));
 assert.equal(validateMobileBridgeUrl("https://bridge.example.org/api/vanilla/mobile/run"),"https://bridge.example.org/api/vanilla/mobile/run");
});

test("bridge may only receive approved read-only requests",async()=>{
 globalThis.localStorage={getItem:()=>null};
 const plan=planMobileTask("查看目前開啟的 App","ios");
 let count=0;
 const mock=async (_url,request)=>{
  count++;
  assert.equal(request.method,"POST");
  assert.equal(JSON.parse(request.body).mode,"read-only");
  return {ok:true,json:async()=>({completed:true,summary:"目前是設定畫面"})};
 };
 const result=await executeReadOnlyMobileTask(plan,"https://bridge.example.org/api/vanilla/mobile/run","session-token-123456",mock);
 assert.equal(result.completed,true);
 assert.equal(count,1);
 await assert.rejects(()=>executeReadOnlyMobileTask(planMobileTask("打開設定","ios"),"https://bridge.example.org/api/vanilla/mobile/run","session-token-123456",mock));
});
