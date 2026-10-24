/**
 * OCTUBER 0.6B: small, bounded parallel fetches of the official WebLLM shards.
 *
 * WebLLM 0.2.82 fetchTensorCache uses the CacheStorage cache named "webllm/model";
 * Cache.put with the ORIGINAL resolve/main URL makes a completed shard reusable by
 * its worker. Do NOT cache responses under redirected CDN URLs.
 *
 * Each file is streamed directly into CacheStorage; no 350 MB ArrayBuffer or
 * duplicate in-memory copy is constructed. A partially fetched response is never
 * committed. Completed shards survive reloads and are skipped next time.
 *
 * This accelerates downloads only when the origin/network benefits from two
 * parallel transfers; it cannot make 350 MB disappear or speed up GPU compilation.
 */
export const FAST_MODEL_ID="Qwen3-0.6B-q4f16_1-MLC";
export const FAST_MODEL_CACHE="webllm/model";
export const FAST_MODEL_FILES=[
 {file:"params_shard_0.bin",bytes:77800000},
 {file:"params_shard_1.bin",bytes:32700000},
 {file:"params_shard_2.bin",bytes:31900000},
 {file:"params_shard_3.bin",bytes:33500000},
 {file:"params_shard_4.bin",bytes:32000000},
 {file:"params_shard_5.bin",bytes:31900000},
 {file:"params_shard_6.bin",bytes:33500000},
 {file:"params_shard_7.bin",bytes:32000000},
 {file:"params_shard_8.bin",bytes:30100000},
 {file:"tokenizer.json",bytes:11400000},
] as const;
export const FAST_TOTAL_BYTES=FAST_MODEL_FILES.reduce((n,item)=>n+item.bytes,0);
export type FastDownloadProgress={downloadedBytes:number;totalBytes:number;completed:number;totalFiles:number;cached:number};
export type FastDownloadResult={complete:boolean;fromCache:number;downloaded:number;failed:number};

/** Reject alternate / user-supplied hosts; only prefetch the official, pinned catalog model. */
export function officialFastModelBase(modelId:string,modelUrl:string):string|null{
 if(modelId!==FAST_MODEL_ID)return null;
 try{
  const u=new URL(modelUrl);
  if(u.origin!=="https://huggingface.co"||u.username||u.password||u.search||u.hash||u.pathname!=="/mlc-ai/"+FAST_MODEL_ID)return null;
  return new URL("resolve/main/",u.href.endsWith("/")?u.href:u.href+"/").href;
 }catch{return null;}
}
type Dependencies={
 cacheStorage?:Pick<CacheStorage,"open">;
 fetchFn?:typeof fetch;
 concurrency?:number;
};
/**
 * Best-effort pre-download: return false if a source, browser cache or network
 * fails. WebLLM then performs its normal loader (and can reuse completed files).
 * Never evict other models or erase partial successful work.
 */
export async function prefetchFastLocalModel(modelId:string,modelUrl:string,onProgress:(p:FastDownloadProgress)=>void,options:Dependencies={}):Promise<FastDownloadResult>{
 const base=officialFastModelBase(modelId,modelUrl);
 if(!base||typeof caches==="undefined"&&!options.cacheStorage)return {complete:false,fromCache:0,downloaded:0,failed:0};
 let cache:Cache;
 try{cache=await (options.cacheStorage??caches).open(FAST_MODEL_CACHE);}
 catch{return {complete:false,fromCache:0,downloaded:0,failed:0};}
 const fetchFn=options.fetchFn??fetch;
 const loaded=new Array<number>(FAST_MODEL_FILES.length).fill(0);
 let completed=0,cached=0,downloaded=0,failed=0,index=0;
 const progress=()=>{
  const downloadedBytes=loaded.reduce((sum,x)=>sum+x,0);
  onProgress({downloadedBytes,totalBytes:FAST_TOTAL_BYTES,completed,totalFiles:FAST_MODEL_FILES.length,cached});
 };
 // Locate existing fully persisted responses before starting any network fetch.
 const missing:number[]=[];
 for(let i=0;i<FAST_MODEL_FILES.length;i++){
  const url=new URL(FAST_MODEL_FILES[i].file,base).href;
  try{
   const hit=await cache.match(url);
   if(hit?.ok){loaded[i]=FAST_MODEL_FILES[i].bytes;cached++;completed++;continue;}
  }catch{/* Keep going with a fresh attempt. */}
  missing.push(i);
 }
 progress();
 if(!missing.length)return {complete:true,fromCache:cached,downloaded,failed:0};
 // At most two transfers on a phone. This prevents extra Safari memory pressure
 // while working around per-connection throughput limits on some CDNs.
 const parallel=Math.max(1,Math.min(2,Math.trunc(options.concurrency??2)));
 let lastProgressAt=0;
 const show=()=>{
  const now=Date.now();
  if(now-lastProgressAt>850||completed===FAST_MODEL_FILES.length){lastProgressAt=now;progress();}
 };
 async function fetchOne(i:number){
  const item=FAST_MODEL_FILES[i];
  const url=new URL(item.file,base).href;
  try{
   const response=await fetchFn(url,{mode:"cors",credentials:"omit",redirect:"follow",cache:"no-store"});
   if(!response.ok||!response.body||response.type==="opaque")throw Error("Invalid model response");
   // Preserve the HTTP response stream and avoid response.arrayBuffer() in
   // the main thread. Backpressure is controlled by CacheStorage's consumer.
   let current=0;
   const stream=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
    transform(chunk,controller){
     current+=chunk.byteLength;
     loaded[i]=Math.min(item.bytes,current);
     show();
     controller.enqueue(chunk);
    }
   }));
   const cachedResponse=new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
   await cache.put(url,cachedResponse);
   loaded[i]=item.bytes;downloaded++;completed++;show();
  }catch{
   // An interrupted stream is not stored as a complete file.
   loaded[i]=0;failed++;completed++;show();
  }
 }
 async function worker(){
  while(index<missing.length){const i=missing[index++];await fetchOne(i);}
 }
 await Promise.all(Array.from({length:Math.min(parallel,missing.length)},()=>worker()));
 progress();
 return {complete:failed===0,fromCache:cached,downloaded,failed};
}
