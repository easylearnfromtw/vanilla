/** On-device WebLLM engine.
 * - WebLLM (several MB) loads only when a local model is actually used, so the app opens fast.
 * - Inference runs in a Web Worker when the browser allows it, keeping scrolling/typing smooth
 *   on iPhone and desktop; only explicit compatibility mode uses the main thread.
 * - Prompts, sampling and context budgets come from ai/model-profiles for each model size.
 */
import type {SheetPreviewData} from "./sheet-preview-model";
import type {CreamResult} from "../cream/core";
import {streamDisplayInterval,shouldPublishStream} from "./stream-performance";
import {startInferenceFrameMonitor,recordLocalInferenceMetric} from "./frame-pressure";
import {VANILLA_BUILD} from "../version";
import {validateWebLLMMessages} from "./request-guard";
import {buildLocalChatMessages,buildSystemlessRecoveryMessages,assertLocalMessages,retryOnSystemPromptError,isSystemPromptOrderError,type LocalChatMessage} from "./chat-messages";
import {LOCAL_CATALOG,DEFAULT_LOCAL_MODEL,profileFor} from "../ai/model-profiles";
import {webllmRequestOptions} from "../ai/generation-config";
import {localInferenceQueue} from "../detroit/zeus";
import {isPinnedWebLLMModelSupported,isDisposedWebLLMFailure} from "./webllm-compat";
import {isIOSWebLLMDevice,mayFallbackToMainThread} from "./mobile-safety";
import {firstDownloadProgress,noteDownloadProgress,downloadHasStalled,downloadNeedsNotice,isDownloadStallError,stalledDownloadError} from "./model-download-watchdog";
import {inspectBrowserModelDownload,type DownloadDiagnostic} from "./model-download-diagnostics";
import {prefetchFastLocalModel,FAST_MODEL_ID} from "./model-fast-download";
import {vanillaSystemPrompt,STRUCTURED_SYSTEM_PROMPT,isAtuberModel} from "../ai/prompts";
import {classifyTask,type TaskKind} from "../ai/task-kind";
import {fitHistory,estimateTokens} from "../ai/context-budget";
import {stripThinking,collapseRepetition,cleanModelOutput} from "../ai/output-cleanup";
import {ensureZhTw,toTaiwanese} from "../ai/zh-tw";

type WebLLM=typeof import("@mlc-ai/web-llm");
type Engine=import("@mlc-ai/web-llm").MLCEngine|import("@mlc-ai/web-llm").WebWorkerMLCEngine;
export type LocalModelId=string;
export const LOCAL_MODEL=DEFAULT_LOCAL_MODEL;
export const LOCAL_MODELS=LOCAL_CATALOG.map(x=>({id:x.id,label:x.label,description:x.description,vramMB:x.vramMB,recommended:Boolean(x.recommended)}));
export type WebCitation={title:string;url:string;kind:"full"|"snippet"};
export type ToolInfo={id:string;label:string;status:"ok"|"partial"|"error";detail?:string};
export type ChatTurn={role:"user"|"assistant";content:string;id?:string;createdAt?:number;source?:"local"|"ollama"|"gemini"|"deepseek"|"openai"|"anthropic"|"openrouter";model?:string;rating?:"up"|"down";sheet?:SheetPreviewData;cream?:CreamResult;webSources?:WebCitation[];
 /** The originating user message ID when Merlin is waiting for clarification; no duplicated prompt. */
 clarificationOriginalId?:string;
 /** Which Vanilla tool produced this message (search, CREAM, files…). */
 tool?:ToolInfo;
 /** Labels of data attached to the model prompt for this answer (transparency chips). */
 contexts?:string[];
 /** A short honest note (e.g. "附件只提供前 2,000 字", "已由備援模型完成"). */
 notice?:string;
 durationMs?:number};

let webllmModule:WebLLM|null=null;
let supported:Set<string>|null=null;
let engine:Engine|null=null;
let loadedModel:LocalModelId|null=null;
let loading:Promise<void>|null=null;
let loadingModel:LocalModelId|null=null;
let usingWorker=false;

async function webllm():Promise<WebLLM>{
 if(!webllmModule){
  webllmModule=await import("@mlc-ai/web-llm");
  supported=new Set(webllmModule.prebuiltAppConfig.model_list.map(x=>x.model_id));
 }
 return webllmModule;
}
export function getLoadedLocalModel():LocalModelId|null{return loadedModel;}
export function getLoadingLocalModel():LocalModelId|null{return loadingModel;}
export function isLocalWorkerActive():boolean{return usingWorker;}
export function isLocalModelReady(model?:LocalModelId):boolean{return engine!==null&&(!model||loadedModel===model);}
/** Best effort before WebLLM is loaded (catalog), exact afterwards (installed prebuilt list). */
export function isLocalModelSupported(model:LocalModelId):boolean{
 if(!isPinnedWebLLMModelSupported(model))return false;
 if(supported)return supported.has(model);
 return LOCAL_CATALOG.some(x=>x.id===model);
}
export async function refreshSupportedModels():Promise<string[]>{
 await webllm();
 return LOCAL_CATALOG.filter(x=>isPinnedWebLLMModelSupported(x.id)&&supported!.has(x.id)).map(x=>x.id);
}
/** True when the weights are already in this browser's cache (no download needed). */
export async function isLocalModelCached(model:LocalModelId):Promise<boolean>{
 try{if(!isLocalModelSupported(model))return false;const mod=await webllm();return typeof mod.hasModelInCache==="function"?await mod.hasModelInCache(model):false;}catch{return false;}
}
/** Clear only this model's parameter shards/tokenizer, not conversations or other models. */
/** Read-only checks of the actual source in the pinned WebLLM catalog.
 * Passing these probes does NOT prove full-weight download or WebGPU inference works.
 */
export async function diagnoseLocalModelDownload(model:LocalModelId):Promise<DownloadDiagnostic[]>{
 const mod=await webllm();
 const record=mod.prebuiltAppConfig.model_list.find(x=>x.model_id===model);
 if(!record)throw new Error("所選模型不在目前 WebLLM 版本的支援清單。");
 const gpu=(navigator as Navigator&{gpu?:{requestAdapter:()=>Promise<unknown>}}).gpu;
 return inspectBrowserModelDownload(record.model,{
  gpu,storage:navigator.storage,online:navigator.onLine,fetchFn:fetch,
 });
}
export async function clearLocalModelCache(model:LocalModelId):Promise<void>{
 if(loading||loadingModel)throw new Error("模型仍在下載中，請等下載結束後再清除快取。");
 if(engine&&loadedModel===model)throw new Error("這個模型正在使用中。請重新開啟 Vanilla 後、載入模型前清除快取。");
 if(!isLocalModelSupported(model))throw new Error("目前無法清除此模型的快取：模型不受此版本支援。");
 const mod=await webllm();
 await mod.deleteModelInCache(model);
}
const SELECTED_KEY="vanilla.local.model";
export function preferredLocalModel():LocalModelId{
 try{const saved=localStorage.getItem(SELECTED_KEY);if(saved&&LOCAL_CATALOG.some(x=>x.id===saved)&&isPinnedWebLLMModelSupported(saved))return saved;}catch{}
 return LOCAL_MODEL;
}

/* ---------- worker-first inference: never silently block the UI thread ---------- */
function runningOnIOS():boolean{
 return isIOSWebLLMDevice(navigator.userAgent,navigator.platform,navigator.maxTouchPoints);
}
/** An unloaded worker retains its WASM heap until terminated. Reclaim it before
 * loading another model; never allow a stuck worker RPC to block recovery forever.
 */
async function releaseEngine(previous:Engine):Promise<void>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const bounded=new Promise<void>((_,reject)=>{timer=setTimeout(()=>reject(new Error("WebLLM unload timed out")),4000);});
  await Promise.race([previous.unload(),bounded]);
 }catch(error){console.warn("WebLLM cleanup incomplete; retiring engine",error);}
 finally{
  if(timer!==undefined)clearTimeout(timer);
  (previous as {worker?:{terminate?:()=>void}}).worker?.terminate?.();
 }
}

const WORKER_KEY="vanilla.local.worker.v1";
export function localWorkerMode():"auto"|"off"|"broken"{
 try{const v=localStorage.getItem(WORKER_KEY);return v==="off"||v==="broken"?v:"auto";}catch{return "auto";}
}
export function setLocalWorkerMode(mode:"auto"|"off"):void{try{localStorage.setItem(WORKER_KEY,mode);}catch{}}
async function createEngine(model:LocalModelId,onProgress:(message:string,progress:number)=>void):Promise<Engine>{
 const mod=await webllm();
 const iosDevice=runningOnIOS();
 const mode=localWorkerMode();
 // A failed worker must never silently move WebGPU work onto the UI thread on any device.
 if(mode==="broken"){
  throw new Error("上次背景模型載入失敗，已避免自動切換到主執行緒，以保護網頁流暢度。請在模型面板重新開啟「背景執行緒推論」後重試；或明確選用可能卡頓的相容模式。");
 }
 if(mode==="auto"&&typeof Worker!=="undefined"){
  let worker:Worker|null=null;
  try{
   worker=new Worker(new URL("./webllm.worker.ts",import.meta.url),{type:"module"});
   let pulse=firstDownloadProgress(Date.now());
   let noticeShown=false;
   const progress=(report:{text:string;progress:number})=>{
    const before=pulse.highest;
    pulse=noteDownloadProgress(pulse,report.progress,Date.now());
    if(pulse.highest>before)noticeShown=false;
    onProgress(report.text,report.progress);
   };
   const created=mod.CreateWebWorkerMLCEngine(worker,model,{initProgressCallback:progress});
   let timer:ReturnType<typeof setInterval>|undefined;
   // Repeated "Start to fetch params" callbacks at 0% must not keep an idle load alive.
   // Slow connections are fine as long as numeric weight progress continues advancing.
   const watchdog=new Promise<never>((_,reject)=>{
    timer=setInterval(()=>{
     const now=Date.now();
     if(downloadHasStalled(pulse,now)){reject(stalledDownloadError());return;}
     if(!noticeShown&&downloadNeedsNotice(pulse,now)){
      noticeShown=true;
      onProgress("下載來源仍未回報新增進度；正在等待模型權重，若持續停滯會結束並提供修復選項。",pulse.highest);
     }
    },2000);
   });
   let ready:Engine;
   try{ready=await Promise.race([created,watchdog]);}
   finally{if(timer!==undefined)clearInterval(timer);}
   usingWorker=true;
   return ready;
  }catch(error){
   worker?.terminate();
   // A remote weight-download stall is not a broken worker. Let users retry normally.
   if(!isDownloadStallError(error)){try{localStorage.setItem(WORKER_KEY,"broken");}catch{}}
   usingWorker=false;
   if(isDownloadStallError(error))throw error;
   console.warn("WebLLM worker unavailable",error);
   if(!mayFallbackToMainThread(iosDevice,mode)){
    throw new Error("背景模型載入失敗；為避免網頁卡頓，沒有自動改到主執行緒。請檢查網路、儲存空間與 WebGPU 支援，再於模型面板重試「背景執行緒推論」。詳細原因："+(error instanceof Error?error.message:String(error)));
   }
  }
 }
 if(!mayFallbackToMainThread(iosDevice,mode)){
  throw new Error("目前無法啟動 WebLLM 背景執行緒。為避免網頁卡頓，已停止自動切換至主執行緒；若要使用相容模式，請在模型面板明確關閉背景執行緒。");
 }
 usingWorker=false;
 return mod.CreateMLCEngine(model,{initProgressCallback:report=>onProgress(report.text,report.progress)});
}
/** Model reload shares the same GPU queue as inference.
 * Avoid unloading an engine while a streaming reply still holds it.
 */
/** Model reload shares the same GPU queue as inference.
 * Avoid unloading an engine while a streaming reply still holds it.
 * The official 0.6B model is pre-streamed (bounded concurrency) into WebLLM's
 * existing cache: the worker then reuses those files, not a second download.
 */
export async function loadLocalModel(onProgress:(message:string,progress:number)=>void,model:LocalModelId=LOCAL_MODEL):Promise<void>{
 if(engine&&loadedModel===model)return;
 if(!("gpu" in navigator))throw new Error("目前瀏覽器不支援 WebGPU，無法使用裝置端模型。iPhone 需 iOS 26 以上的 Safari。");
 if(!isPinnedWebLLMModelSupported(model))throw new Error("這個模型需要較新的 WebLLM，但該版本有已知的 GPU 釋放問題。請先選擇 Qwen2.5 或 Qwen3 模型。");
 const mod=await webllm();
 if(!isLocalModelSupported(model))throw new Error("目前 WebLLM 版本沒有內建這個模型，請選擇其他本地模型。");
 if(loading){
  await loading;
  if(engine&&loadedModel===model)return;
 }
 loadingModel=model;
 const task=localInferenceQueue.run(async()=>{
  if(engine&&loadedModel===model)return;
  if(engine){
   const old=engine;
   engine=null;loadedModel=null;usingWorker=false;
   await releaseEngine(old);
  }
  let fastComplete=false;
  if(model===FAST_MODEL_ID){
   const record=mod.prebuiltAppConfig.model_list.find(x=>x.model_id===model);
   if(record){
    try{
     const fast=await prefetchFastLocalModel(model,record.model,({downloadedBytes,totalBytes,completed,totalFiles,cached})=>{
      const mib=1024*1024;
      const seen=Math.min(84,Math.round(downloadedBytes/totalBytes*84));
      onProgress("OCTUBER 加速下載 · "+Math.round(downloadedBytes/mib)+"/約 "+Math.round(totalBytes/mib)+" MB · 已處理 "+completed+"/"+totalFiles+" 檔（已快取 "+cached+" 檔）",seen/100);
     });
     fastComplete=fast.complete;
     if(fastComplete)onProgress("OCTUBER 權重已下載並快取，正在初始化 WebGPU…",0.85);
     else if(fast.failed>0)onProgress("加速來源部分失敗，已保留完整檔案，改由原生載入器續載…",0);
    }catch(error){
     console.warn("OCTUBER fast cache prefetch unavailable; using WebLLM loader",error);
    }
   }
  }
  const next=await createEngine(model,(message,progress)=>{
   // Download and GPU initialization are different stages. A completed
   // prefetch must not make the user see a misleading 0%-100% second download.
   if(fastComplete)onProgress("WebGPU 初始化 · "+message,0.85+Math.min(1,Math.max(0,progress))*0.15);
   else onProgress(message,progress);
  });
  engine=next;
  loadedModel=model;
  try{localStorage.setItem(SELECTED_KEY,model);}catch{}
 });
 loading=task;
 try{await task;}
 finally{if(loading===task){loading=null;loadingModel=null;}}
}
export async function interruptLocalGeneration():Promise<void>{
 try{await (engine as unknown as {interruptGenerate?:()=>void|Promise<void>})?.interruptGenerate?.();}catch{}
}

export type LocalReplyOptions={task?:TaskKind;signal?:AbortSignal;purpose?:"chat"|"structured";deep?:boolean};
/** Token budget left for the newest user message on the loaded local model. */
export function localPromptBudget(task:TaskKind,model:LocalModelId=loadedModel||LOCAL_MODEL):number{
 const profile=profileFor("local",model);
 return Math.max(600,profile.contextTokens-profile.maxOutput[task]-(profile.compactPrompt?220:520)-520);
}

export async function generateLocalReply(history:ChatTurn[],onText:(text:string)=>void,options:LocalReplyOptions={}):Promise<string>{
 const currentEngine=engine;
 if(!currentEngine)throw new Error("本地模型尚未就緒，請載入模型後再試。");
 const model=loadedModel||LOCAL_MODEL;
 const latest=history[history.length-1]?.content||"";
 const structured=options.purpose==="structured";
 const task=options.task??(structured?"code":classifyTask(latest));
 const profile=profileFor("local",model);
 if(!structured)await ensureZhTw().catch(()=>undefined);
 const system=structured?STRUCTURED_SYSTEM_PROMPT:vanillaSystemPrompt({task,compact:profile.compactPrompt,latestUserText:latest,tongcheng:isAtuberModel(model)});
 const request=webllmRequestOptions(model,task,Boolean(options.deep));
 const budget=profile.contextTokens-Number(request.max_tokens)-estimateTokens(system)-48;
 const turns=fitHistory(history.filter(x=>x&&(x.role==="user"||x.role==="assistant")&&typeof x.content==="string").map(x=>({role:x.role,content:x.content})),budget,480);
 const messages=buildLocalChatMessages(turns,"",{system,maxTurnChars:Infinity});
 assertLocalMessages(messages);
 const startedAt=Date.now();
 let firstTokenMs:number|null=null;
 let completed=false;
 const frameMonitor=startInferenceFrameMonitor();
 const abort=()=>{try{void Promise.resolve((currentEngine as unknown as {interruptGenerate?:()=>void|Promise<void>}).interruptGenerate?.()).catch(()=>{});}catch{}};
 options.signal?.addEventListener("abort",abort,{once:true});

 async function streamReply(requestMessages:LocalChatMessage[],mode:"normal"|"recovery"):Promise<string>{
  // Verify a snapshot of the EXACT roles submitted to WebLLM. Do not log contents.
  const snapshot=requestMessages.map(message=>({...message}));
  validateWebLLMMessages(snapshot,mode);
  const stream=await currentEngine!.chat.completions.create({...request,messages:snapshot,stream:true});
  let answer="",last=0,truncated=false;
  for await(const chunk of stream){
   const delta=chunk.choices[0]?.delta?.content??"";
   if(delta&&firstTokenMs===null)firstTokenMs=Date.now()-startedAt;
   answer+=delta;
   if(chunk.choices[0]?.finish_reason==="length")truncated=true;
   const now=Date.now();
   // Reduce expensive React updates while WebGPU is streaming token chunks.
   const interval=streamDisplayInterval(navigator.hardwareConcurrency,frameMonitor.p95FrameMs());
   if(shouldPublishStream(now,last,interval)){
    const view=stripThinking(answer);
    // Small models occasionally loop; stop early instead of burning the battery.
    if(!structured&&collapseRepetition(view.text).collapsed){void interruptLocalGeneration();break;}
    onText((structured?view.text:toTaiwanese(view.text))||(view.thinking?"（正在思考…）":""));last=now;
   }
  }
  if(truncated)throw new Error("手機模型輸出已達 token 上限，不能將截斷內容當成完整答案。");
  const final=structured?stripThinking(answer).text.trim():toTaiwanese(cleanModelOutput(answer));
  onText(final); // Never drop final tokens after throttling.
  return final;
 }
 try{
  const output=await retryOnSystemPromptError(
   ()=>streamReply(messages,"normal"),
   async()=>{
    // This recovery only runs for the exact upstream WebLLM system-order exception.
    // The local model and user data stay on-device.
    await currentEngine.resetChat(false,loadedModel||undefined);
    onText("");
    const recovery=buildSystemlessRecoveryMessages(turns,"",{system,maxTurnChars:Infinity});
    return streamReply(recovery,"recovery");
   }
  );
  completed=true;
  return output;
 }catch(error){
  if(isDisposedWebLLMFailure(error)){
   // A disposed TVM object cannot be safely reused on the next turn.
   if(engine===currentEngine){engine=null;loadedModel=null;}
   await releaseEngine(currentEngine);
   throw new Error("手機本地 WebLLM 的 GPU 物件已失效（Object has already been disposed）。請關閉 Vanilla 後重新開啟並重新載入本地模型；此問題與 GridCraft 後端無關。");
  }
  if(isSystemPromptOrderError(error)){
   throw Error("WebLLM 的實際請求仍回報 System Prompt 順序錯誤。Vanilla Build "+VANILLA_BUILD+
    "；已通過角色序列檢查並嘗試一次本機恢復。請確認裝置版本與正式網站一致後回報版本號。");
  }
  throw error;
 }finally{
  frameMonitor.stop();
  recordLocalInferenceMetric({model,elapsedMs:Date.now()-startedAt,ttftMs:firstTokenMs,
   frameP95Ms:frameMonitor.p95FrameMs(),completed,at:Date.now()});
  options.signal?.removeEventListener("abort",abort);
 }
}
