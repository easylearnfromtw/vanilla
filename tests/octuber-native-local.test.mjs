import test from "node:test";
import assert from "node:assert/strict";
import {localOctuberBaseTier,localOctuberBaseNames,recognizedLocalModelName,installedTierModel} from "../src/ai/octuber-local-runtimes.ts";
import {atuberTier,selectAtuberDriver,ATUBER_LOCAL_MODEL} from "../src/ai/atuber-control-plane.ts";
import {getOllamaConfig,setOllamaConfig,clearOllamaConfig,probeAtuberModel,isOllamaModelVerified} from "../src/ai/ollama.ts";

globalThis.localStorage??={_values:new Map(),getItem(k){return this._values.get(k)??null;},setItem(k,v){this._values.set(k,String(v));},removeItem(k){this._values.delete(k);}};
globalThis.sessionStorage??={_values:new Map(),getItem(k){return this._values.get(k)??null;},setItem(k,v){this._values.set(k,String(v));},removeItem(k){this._values.delete(k);}};
globalThis.window??=new EventTarget();

const source="http://localhost:11434";
const thirty="qwen3:30b";
const driver={id:"ollama:"+thirty,source:"ollama",model:thirty,location:"自架主機",label:"OCTUBER SUMPTUOUS",note:""};
const phone={id:"local:"+ATUBER_LOCAL_MODEL,source:"local",model:ATUBER_LOCAL_MODEL,location:"本機",label:"OCTUBER FLATTERING",note:""};
test("native Qwen3 Ollama models are recognized by exact capacity, not label spoofing",()=>{
 assert.equal(localOctuberBaseTier("qwen3:30b"),"large");
 assert.equal(localOctuberBaseTier("qwen3:30b-a3b"),"large");
 assert.equal(localOctuberBaseTier("qwen3-coder:30b"),"large");
 assert.equal(localOctuberBaseTier("qwen3:32b"),"ultra");
 assert.equal(localOctuberBaseTier("qwen3:14b"),"mid-large");
 assert.equal(localOctuberBaseTier("qwen3:4b"),"mid-small");
 assert.equal(localOctuberBaseTier("deepseek:30b"),null);
 assert.equal(localOctuberBaseTier("attacker/qwen3:30b"),null);
 assert.equal(localOctuberBaseTier("qwen3:300b"),null);
 assert.equal(atuberTier(driver),"large");
 assert.equal(atuberTier({...driver,location:"Ollama Cloud"}),null);
 assert.ok(recognizedLocalModelName(thirty));
 assert.deepEqual(localOctuberBaseNames("ultra"),["qwen3:32b"]);
 assert.equal(installedTierModel(["qwen3:30b","qwen3:14b"],"large",["octuber:sumptuous"]),"qwen3:30b");
 assert.equal(installedTierModel([],"large",["octuber:sumptuous"]),null);
});
test("verified native 30B can control code and research; iPhone privacy never routes to remote PC",()=>{
 const pick=(task,privateMode=false)=>selectAtuberDriver([phone,driver],{task,privateMode,localOnly:privateMode,image:false});
 assert.equal(pick("code").controller?.model,thirty);
 assert.equal(pick("analysis").controller?.model,thirty);
 assert.equal(pick("code",true).controller?.source,"local");
 assert.equal(pick("casual").controller?.source,"local");
});
test("probe requires installed model and completed nonempty /api/chat; never confuses tags with inference",async()=>{
 const oldFetch=globalThis.fetch;
 let calls=0;
 setOllamaConfig({endpoint:source,model:thirty,models:[thirty]});
 assert.equal(isOllamaModelVerified(thirty),false);
 globalThis.fetch=async (url,init={})=>{
  calls++;
  if(url.endsWith("/api/tags"))return Response.json({models:[{name:thirty,size:18900000000}]});
  if(url.endsWith("/api/chat")){
   const body=JSON.parse(init.body);assert.equal(body.model,thirty);assert.equal(body.stream,false);
   assert.ok(body.options.num_ctx>=1024);
   return Response.json({done:true,message:{content:"已連線"},eval_count:3});
  }
  throw Error("unexpected URL "+url);
 };
 try{
  const report=await probeAtuberModel(thirty);
  assert.equal(report.responseTokens,3);
  assert.ok(report.elapsedMs>=0);
  assert.equal(isOllamaModelVerified(thirty),true);
  assert.equal(calls,2);
  clearOllamaConfig();
  assert.equal(isOllamaModelVerified(thirty),false);
 }finally{globalThis.fetch=oldFetch;clearOllamaConfig();}
});
test("model listed without valid response is NOT activated",async()=>{
 const oldFetch=globalThis.fetch;
 setOllamaConfig({endpoint:source,model:thirty,models:[thirty]});
 globalThis.fetch=async url=>url.endsWith("/api/tags")?Response.json({models:[{name:thirty}]}):Response.json({done:false,message:{content:""}});
 try{
  await assert.rejects(probeAtuberModel(thirty),/未回傳完整/);
  assert.equal(isOllamaModelVerified(thirty),false);
  await assert.rejects(probeAtuberModel("forged:qwen3:30b"),/請選擇支援的/);
 }finally{globalThis.fetch=oldFetch;clearOllamaConfig();}
});
