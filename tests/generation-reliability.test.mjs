import test from "node:test";
import assert from "node:assert/strict";
import {createGenerationWatchdog,assertUsableModelAnswer,QUALITY_FIRST_LIMITS} from "../src/ai/generation-reliability.ts";

test("quality-first waits for progress but never runs indefinitely",()=>{
 assert.ok(QUALITY_FIRST_LIMITS.firstProgressMs>=180_000);
 assert.ok(QUALITY_FIRST_LIMITS.idleMs>=60_000);
 assert.ok(QUALITY_FIRST_LIMITS.totalMs>=QUALITY_FIRST_LIMITS.firstProgressMs);
});
test("empty and status-only responses fail, honest short answers do not",()=>{
 for(const input of ["","   ","（正在思考…）","載入中...","<think>內部推理</think>"])
  assert.throws(()=>assertUsableModelAnswer(input),/未產生可用/);
 assert.throws(()=>assertUsableModelAnswer("重複內容（偵測到模型重複輸出，已自動截斷。可以換個問法。）"),/重複輸出/);
 for(const input of ["不知道","目前沒有可核實的資料。","答案是 42。"])
  assert.doesNotThrow(()=>assertUsableModelAnswer(input));
});
test("watchdog respects user cancellation",()=>{
 const parent=new AbortController();
 const guard=createGenerationWatchdog(parent.signal,{firstProgressMs:500,idleMs:500,totalMs:1000});
 parent.abort();
 assert.equal(guard.signal.aborted,true);
 assert.throws(()=>guard.assertCompleted(),/使用者已停止/);
 guard.dispose();
});
test("watchdog aborts idle generation and reports a bounded failure",async()=>{
 const guard=createGenerationWatchdog(undefined,{firstProgressMs:30,idleMs:10,totalMs:200});
 try{
  guard.progress("首段");
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(guard.signal.aborted,true);
  assert.throws(()=>guard.assertCompleted(),/長時間沒有進展/);
 }finally{guard.dispose();}
});
test("watchdog ignores duplicate progress messages",async()=>{
 const guard=createGenerationWatchdog(undefined,{firstProgressMs:50,idleMs:15,totalMs:200});
 try{
  guard.progress("相同文字");
  await new Promise(resolve=>setTimeout(resolve,8));
  guard.progress("相同文字");
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(guard.signal.aborted,true);
 }finally{guard.dispose();}
});
test("completed watchdog releases timers and accepts a normal answer",()=>{
 const guard=createGenerationWatchdog(undefined,{firstProgressMs:300,idleMs:300,totalMs:1000});
 guard.progress("回答");
 assert.doesNotThrow(()=>guard.assertCompleted());
 guard.dispose();
});
