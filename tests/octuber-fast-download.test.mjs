import test from "node:test";
import assert from "node:assert/strict";
import {FAST_MODEL_ID,FAST_MODEL_FILES,FAST_TOTAL_BYTES,FAST_MODEL_CACHE,officialFastModelBase,prefetchFastLocalModel} from "../src/local-ai/model-fast-download.ts";

const URL="https://huggingface.co/mlc-ai/"+FAST_MODEL_ID;
function fixture(failOnce=-1){
 const saved=new Map();
 const counts=new Map();
 let concurrent=0,maxConcurrent=0;
 const openNames=[];
 const cache={
  async match(url){return saved.get(url)?.clone();},
  async put(url,response){saved.set(url,response.clone());await response.arrayBuffer();}
 };
 const cacheStorage={async open(name){openNames.push(name);return cache;}};
 const fetchFn=async(url)=>{
  const idx=FAST_MODEL_FILES.findIndex(x=>url.endsWith("/"+x.file));
  assert.notEqual(idx,-1);
  concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);
  await new Promise(resolve=>setTimeout(resolve,2));
  concurrent--;
  counts.set(idx,(counts.get(idx)||0)+1);
  if(idx===failOnce&&counts.get(idx)===1)throw Error("simulated dropped connection");
  return new Response(new Uint8Array(64),{status:200,headers:{"content-type":"application/octet-stream"}});
 };
 return {saved,cacheStorage,fetchFn:fetchFn,maxConcurrent:()=>maxConcurrent,counts,openNames};
}

test("official 0.6B shard prefetch accepts only pinned Hugging Face model origin",()=>{
 assert.equal(officialFastModelBase(FAST_MODEL_ID,URL),URL+"/resolve/main/");
 assert.equal(officialFastModelBase("Other-Model",URL),null);
 assert.equal(officialFastModelBase(FAST_MODEL_ID,"https://attacker.invalid/"+FAST_MODEL_ID),null);
 assert.equal(officialFastModelBase(FAST_MODEL_ID,URL+"/../elsewhere"),null);
 assert.ok(FAST_TOTAL_BYTES>300*1024*1024);
 assert.equal(FAST_MODEL_FILES.length,10);
});
test("stream 10 shards into the native WebLLM cache with bounded concurrency and reuse",async()=>{
 const f=fixture();
 const events=[];
 const first=await prefetchFastLocalModel(FAST_MODEL_ID,URL,p=>events.push(p),{cacheStorage:f.cacheStorage,fetchFn:f.fetchFn,concurrency:9});
 assert.deepEqual(first,{complete:true,fromCache:0,downloaded:10,failed:0});
 assert.equal(f.openNames[0],FAST_MODEL_CACHE);
 assert.equal(f.saved.size,FAST_MODEL_FILES.length);
 assert.ok(f.maxConcurrent()>1&&f.maxConcurrent()<=2,"at most two shard transfers");
 assert.equal(events.at(-1).completed,10);
 assert.equal(events.at(-1).downloadedBytes,FAST_TOTAL_BYTES);
 for(const [url] of f.saved)assert.ok(url.startsWith(URL+"/resolve/main/"));
 const second=await prefetchFastLocalModel(FAST_MODEL_ID,URL,()=>{}, {cacheStorage:f.cacheStorage,fetchFn:f.fetchFn});
 assert.deepEqual(second,{complete:true,fromCache:10,downloaded:0,failed:0});
 assert.equal([...f.counts.values()].reduce((n,x)=>n+x,0),10,"no repeated network fetch for persisted shards");
});
test("failed shard is never stored as complete; next attempt resumes only missing file",async()=>{
 const f=fixture(3);
 const first=await prefetchFastLocalModel(FAST_MODEL_ID,URL,()=>{}, {cacheStorage:f.cacheStorage,fetchFn:f.fetchFn});
 assert.equal(first.complete,false);
 assert.equal(first.failed,1);
 assert.equal(f.saved.size,9);
 const second=await prefetchFastLocalModel(FAST_MODEL_ID,URL,()=>{}, {cacheStorage:f.cacheStorage,fetchFn:f.fetchFn});
 assert.deepEqual(second,{complete:true,fromCache:9,downloaded:1,failed:0});
 assert.equal(f.counts.get(3),2);
 assert.equal(f.saved.size,10);
});
