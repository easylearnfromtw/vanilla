import test from "node:test";
import assert from "node:assert/strict";
import {inspectBrowserModelDownload} from "../src/local-ai/model-download-diagnostics.ts";

const base="https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC/resolve/main/";
const gpu={requestAdapter:async()=>({name:"fake"})};
const storage={estimate:async()=>({quota:4*1024**3,usage:1*1024**3})};

test("iPhone diagnostics probe a small config and only a byte range of model weights",async()=>{
 const calls=[];
 const fetchFn=async(url,options)=>{
  calls.push({url,options});
  return new Response("ok",{status:options.headers?.Range?206:200});
 };
 const checks=await inspectBrowserModelDownload(base,{gpu,storage,online:true,fetchFn});
 assert.deepEqual(checks.map(x=>x.kind),["ok","ok","ok","ok"]);
 assert.equal(calls.length,2);
 assert.match(calls[0].url,/mlc-chat-config\.json$/);
 assert.match(calls[1].url,/params_shard_0\.bin$/);
 assert.equal(calls[1].options.headers.Range,"bytes=0-0");
 assert.equal(calls[1].options.credentials,"omit");
});

test("blocked config cannot falsely certify weight download",async()=>{
 let n=0;
 const fetchFn=async()=>{n++;return new Response("",{status:403});};
 const checks=await inspectBrowserModelDownload(base,{gpu,online:true,fetchFn});
 assert.equal(n,1);
 assert.equal(checks.at(-1).name,"模型設定檔連線");
 assert.equal(checks.at(-1).kind,"error");
});

test("failed shard reports error even if model config is available",async()=>{
 let n=0;
 const fetchFn=async()=>new Response("",{status:++n===1?200:502});
 const checks=await inspectBrowserModelDownload(base,{gpu,online:true,fetchFn});
 assert.equal(checks.at(-1).name,"模型權重連線");
 assert.equal(checks.at(-1).kind,"error");
});

test("offline does not contact an external model endpoint",async()=>{
 const checks=await inspectBrowserModelDownload(base,{online:false,gpu:null,fetchFn:async()=>{throw Error("should not fetch");}});
 assert.equal(checks[0].name,"WebGPU");
 assert.equal(checks.at(-1).name,"網路");
 assert.equal(checks.at(-1).kind,"error");
});

test("unsafe model source fails without network",async()=>{
 const checks=await inspectBrowserModelDownload("http://example.test/",{gpu,fetchFn:async()=>{throw Error("should not fetch");}});
 assert.equal(checks.at(-1).name,"模型來源");
 assert.equal(checks.at(-1).kind,"error");
});
