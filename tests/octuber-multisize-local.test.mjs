import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {localOctuberBaseTier,recognizedLocalModelName,
  localOctuberBaseNames} from "../src/ai/octuber-local-runtimes.ts";
import {OCTUBER_ADDITIONAL_SIZES,atuberTier,selectAtuberDriver,ATUBER_LOCAL_MODEL}
 from "../src/ai/atuber-control-plane.ts";
import {getOllamaConfig,setOllamaConfig,clearOllamaConfig,
  probeAtuberModel,isOllamaModelVerified} from "../src/ai/ollama.ts";
import {EXTRA_TIER_REQUIREMENTS,TIER_REQUIREMENTS,assessTier}
 from "../scripts/atuber-runtime-preflight.mjs";

globalThis.localStorage??={_v:new Map(),getItem(k){return this._v.get(k)??null;},
 setItem(k,v){this._v.set(k,String(v));},removeItem(k){this._v.delete(k);}};
globalThis.sessionStorage??={_v:new Map(),getItem(k){return this._v.get(k)??null;},
 setItem(k,v){this._v.set(k,String(v));},removeItem(k){this._v.delete(k);}};
globalThis.window??=new EventTarget();

const host={source:"ollama",location:"自架主機",label:"local",note:""};
const phone={id:"local:"+ATUBER_LOCAL_MODEL,source:"local",
 model:ATUBER_LOCAL_MODEL,location:"本機",label:"phone",note:""};

test("intermediate official local tags recognized by *exact name*, not spoofed",()=>{
 assert.deepEqual(localOctuberBaseNames("mid-small"),["qwen3:4b","qwen3:1.7b"]);
 assert.deepEqual(localOctuberBaseNames("mid-large"),["qwen3:14b","qwen3:8b"]);
 assert.equal(localOctuberBaseTier("qwen3:1.7b"),"mid-small");
 assert.equal(localOctuberBaseTier("qwen3:8b"),"mid-large");
 assert.equal(localOctuberBaseTier("qwen3:60b"),null);
 assert.equal(recognizedLocalModelName("qwen3:60b"),false);
 assert.equal(recognizedLocalModelName("octuber:balanced-8b"),true);
 assert.equal(recognizedLocalModelName("octuber:compact-1.7b"),true);
 assert.equal(recognizedLocalModelName("evil/qwen3:8b"),false);
 assert.deepEqual(OCTUBER_ADDITIONAL_SIZES.map(x=>x.base),["qwen3:1.7b","qwen3:8b"]);
});

test("new profiles show honest hardware inventory; listing is not inference verification",()=>{
 assert.equal(TIER_REQUIREMENTS.length,3,"do not break three public legacy aliases");
 assert.deepEqual(EXTRA_TIER_REQUIREMENTS.map(x=>x.label),["0.6B Ollama","1.7B","8B","32B Dense"]);
 const info={ramGiB:24,freeDiskGiB:50,ollamaReachable:true,installedModels:["qwen3:8b"]};
 const x=assessTier(EXTRA_TIER_REQUIREMENTS[2],info);
 assert.equal(x.installed,true);
 assert.equal(x.installedModel,"qwen3:8b");
 assert.equal(x.readyForInferenceCheck,true);
 assert.equal(x.inferenceVerified,false);
 const expensive=assessTier(EXTRA_TIER_REQUIREMENTS[3],info);
 assert.equal(expensive.readyForInferenceCheck,false);
 assert.equal(expensive.recommendedMemoryMet,false);
});

test("Ollama can persist up to 10 approved local tags without overwriting tier models",()=>{
 const arr=["qwen3:0.6b","qwen3:1.7b","qwen3:4b","qwen3:8b",
 "qwen3:14b","qwen3:30b","qwen3:32b","octuber:compact-1.7b"];
 setOllamaConfig({endpoint:"http://127.0.0.1:11434",model:arr[0],models:arr});
 try{
  assert.deepEqual(getOllamaConfig().models,arr);
  const x={...host,id:"ollama:qwen3:8b",model:"qwen3:8b"};
  assert.equal(atuberTier(x),null,"tag configured but not yet executed");
 }finally{clearOllamaConfig();}
});

test("real /api/tags AND /api/chat probe is mandatory before 8B becomes tier",async()=>{
 const previous=globalThis.fetch,model="qwen3:8b";
 setOllamaConfig({endpoint:"http://localhost:11434",model,models:[model]});
 const candidate={...host,id:"ollama:"+model,model};
 let calls=0;
 globalThis.fetch=async (url,init={})=>{
  calls++;
  if(url.endsWith("/api/tags"))return Response.json({models:[{name:model,size:5200000000}]});
  if(url.endsWith("/api/chat")){
   assert.equal(JSON.parse(init.body).model,model);
   return Response.json({done:true,message:{content:"這是實際測試生成回覆"},eval_count:9});
  }
  throw Error("UNEXPECTED_ENDPOINT");
 };
 try{
  assert.equal(atuberTier(candidate),null);
  await probeAtuberModel(model);
  assert.equal(isOllamaModelVerified(model),true);
  assert.equal(atuberTier(candidate),"mid-large");
  const chosen=selectAtuberDriver([phone,candidate],{
   task:"analysis",image:false,privateMode:false,localOnly:false
  });
  assert.equal(chosen.controller?.model,model);
  const privateChoice=selectAtuberDriver([phone,candidate],{
   task:"analysis",image:false,privateMode:true,localOnly:true
  });
  assert.equal(privateChoice.controller?.source,"local");
  assert.equal(calls,2);
 }finally{globalThis.fetch=previous;clearOllamaConfig();}
});

test("model UI exposes new local sizes with an actual probe button not fake trained label",()=>{
 const source=readFileSync(new URL("../src/local-ai/LocalModelPanel.tsx",import.meta.url),"utf8");
 assert.match(source,/OCTUBER_ADDITIONAL_SIZES\.map/);
 assert.match(source,/runTierProbe/);
 assert.match(source,/尚未設定/);
 assert.match(source,/尚未經專屬 LoRA 訓練/);
});
