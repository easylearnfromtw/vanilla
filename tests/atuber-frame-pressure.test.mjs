import test from "node:test";
import assert from "node:assert/strict";
import {p95FrameTimeMs,startInferenceFrameMonitor,recordLocalInferenceMetric,getLocalInferenceMetrics,clearLocalInferenceMetrics} from "../src/local-ai/frame-pressure.ts";
import {streamDisplayInterval,shouldPublishStream} from "../src/local-ai/stream-performance.ts";

test("frame sampling calculates bounded p95 and ignores invalid samples",()=>{
 assert.equal(p95FrameTimeMs([16,16,16]),null);
 assert.equal(p95FrameTimeMs([16,16,16,16,16,16,16,16]),16);
 assert.equal(p95FrameTimeMs([16,16,16,16,16,16,16,100]),100);
 assert.equal(p95FrameTimeMs([0,-5,Number.NaN,Infinity,16,16,16,16,16,16,16,16]),16);
});

test("react streaming updates back off under slow foreground frames",()=>{
 const baseline=streamDisplayInterval(8);
 assert.equal(baseline,75);
 assert.equal(streamDisplayInterval(8,null),baseline);
 assert.equal(streamDisplayInterval(8,16),baseline);
 assert.equal(streamDisplayInterval(8,32),180);
 assert.equal(streamDisplayInterval(8,65),280);
 assert.equal(streamDisplayInterval(4,65),280);
 assert.equal(shouldPublishStream(200,40,180),false);
 assert.equal(shouldPublishStream(220,40,180),true);
 assert.equal(shouldPublishStream(80,40,280,true),true);
});

test("frame monitor only runs when requested, ignores hidden-tab stall and cancels",()=>{
 const originalWindow=globalThis.window;
 const originalDocument=globalThis.document;
 let next=0,removed=0;const callbacks=new Map();
 globalThis.window={
  requestAnimationFrame(fn){const id=++next;callbacks.set(id,fn);return id;},
  cancelAnimationFrame(id){callbacks.delete(id);removed++;}
 };
 globalThis.document={hidden:false};
 try{
  const m=startInferenceFrameMonitor();
  let time=0;
  function tick(dt){time+=dt;const items=[...callbacks.values()];callbacks.clear();for(const cb of items)cb(time);}
  tick(16);for(let i=0;i<10;i++)tick(16);
  assert.equal(m.p95FrameMs(),16);
  globalThis.document.hidden=true;tick(500);
  globalThis.document.hidden=false;tick(500);tick(16);
  assert.equal(m.p95FrameMs(),16);
  m.stop();m.stop();
  assert.equal(removed,1);
  assert.equal(callbacks.size,0);
 }finally{
  if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;
  if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;
 }
});

test("local inference observations are bounded, ephemeral and exclude user content",()=>{
 clearLocalInferenceMetrics();
 for(let i=0;i<28;i++)recordLocalInferenceMetric({
  model:"Qwen3-0.6B",elapsedMs:i+1,ttftMs:1.2,frameP95Ms:16,
  completed:true,at:i
 });
 const result=getLocalInferenceMetrics();
 assert.equal(result.length,24);
 assert.equal(result[0].elapsedMs,5);
 assert.equal(result[0].ttftMs,1);
 assert.equal(Object.keys(result[0]).sort().join(","),"at,completed,elapsedMs,frameP95Ms,model,ttftMs");
 result[0].model="tampered";
 assert.equal(getLocalInferenceMetrics()[0].model,"Qwen3-0.6B");
 clearLocalInferenceMetrics();
 assert.deepEqual(getLocalInferenceMetrics(),[]);
});
