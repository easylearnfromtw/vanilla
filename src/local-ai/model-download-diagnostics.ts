/**
 * Read-only, opt-in diagnostics for a browser-local WebLLM download.
 * Fetches only the tiny model config and a byte-range probe of shard 0.
 * Never downloads full weights, changes caches, or sends chat/API credentials.
 * Success means the endpoints responded, not that the model is fully downloadable.
 */
export type DownloadDiagnostic={kind:"ok"|"warning"|"error";name:string;detail:string};
export type DownloadProbeEnvironment={
 fetchFn?:typeof fetch;
 gpu?:{requestAdapter:()=>Promise<unknown>}|null;
 storage?:{estimate:()=>Promise<{quota?:number;usage?:number}>}|null;
 online?:boolean;
 timeoutMs?:number;
};
const MiB=1024*1024;

function safeSource(source:string):URL|null{
 try{
  const url=new URL(source.endsWith("/")?source:source+"/");
  return url.protocol==="https:"?url:null;
 }catch{return null;}
}

async function checkEndpoint(
 fetchFn:typeof fetch,url:URL,timeoutMs:number,range=false,
):Promise<{ok:boolean;detail:string}>{
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),timeoutMs);
 let response:Response|undefined;
 try{
  response=await fetchFn(url.href,{
   method:"GET",mode:"cors",cache:"no-store",credentials:"omit",
   ...(range?{headers:{Range:"bytes=0-0"}}:{}),
   signal:controller.signal,
  });
  if(!response.ok)return {ok:false,detail:"HTTP "+response.status+"；來源無法提供此檔案。"};
  return {ok:true,detail:range?"權重檔伺服器有回應（僅探測首位元組，未下載完整權重）。":"模型設定檔可讀取（尚未驗證整個下載）。"};
 }catch{
  return {ok:false,detail:controller.signal.aborted?"來源檢查逾時；可能是網路、CDN 或連線品質問題。":"無法讀取來源；可能是 Hugging Face/CDN 網路阻擋、CORS 或 TLS 問題。"};
 }finally{
  clearTimeout(timeout);
  // Abort the download immediately after receiving response headers.
  if(response?.body)void response.body.cancel().catch(()=>undefined);
  controller.abort();
 }
}

export async function inspectBrowserModelDownload(source:string,env:DownloadProbeEnvironment={}):Promise<DownloadDiagnostic[]>{
 const result:DownloadDiagnostic[]=[];
 const gpu=env.gpu;
 if(!gpu){
  result.push({kind:"error",name:"WebGPU",detail:"此瀏覽器沒有 WebGPU。請用支援版本的 iPhone Safari 開啟 HTTPS Vanilla；無法只靠下載模型解決。"});
 }else{
  try{
   const adapter=await Promise.race([
    gpu.requestAdapter(),
    new Promise<null>(resolve=>setTimeout(()=>resolve(null),6000)),
   ]);
   result.push(adapter?{kind:"ok",name:"WebGPU",detail:"可以取得 GPU Adapter；但不保證大型模型可載入。"}:
    {kind:"error",name:"WebGPU",detail:"無法取得 GPU Adapter；請檢查 Safari 與 iOS 版本或裝置支援狀況。"});
  }catch{result.push({kind:"error",name:"WebGPU",detail:"GPU 初始化失敗；下載即使完成也可能無法推論。"});}
 }
 if(env.storage){
  try{
   const {quota,usage}=await env.storage.estimate();
   if(typeof quota==="number"&&typeof usage==="number"&&Number.isFinite(quota-usage)){
    const free=Math.max(0,quota-usage);
    result.push({
     kind:free<800*MiB?"warning":"ok",
     name:"瀏覽器儲存",
     detail:"網站可用儲存額度約 "+Math.round(free/MiB)+" MB。"+(free<800*MiB?" 可能不足以存放模型，請釋放空間或改用較小模型。":"此數值不代表 iOS 一定會保留權重快取。"),
    });
   }
  }catch{result.push({kind:"warning",name:"瀏覽器儲存",detail:"無法估計儲存空間；iOS 可能限制或清除網站快取。"});}
 }
 if(env.online===false){
  result.push({kind:"error",name:"網路",detail:"瀏覽器回報離線；請先連上 Wi-Fi 再檢查模型來源。"});
  return result;
 }
 const base=safeSource(source);
 if(!base){
  result.push({kind:"error",name:"模型來源",detail:"這個 WebLLM 模型沒有安全、有效的 HTTPS 下載網址。"});
  return result;
 }
 const fetchFn=env.fetchFn??fetch;
 const timeoutMs=Math.max(1000,Math.min(20000,env.timeoutMs??10000));
 const config=await checkEndpoint(fetchFn,new URL("mlc-chat-config.json",base),timeoutMs);
 result.push({kind:config.ok?"ok":"error",name:"模型設定檔連線",detail:config.detail});
 if(!config.ok)return result;
 const shard=await checkEndpoint(fetchFn,new URL("params_shard_0.bin",base),timeoutMs,true);
 result.push({kind:shard.ok?"ok":"error",name:"模型權重連線",detail:shard.detail});
 return result;
}
