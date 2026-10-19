/** On-device WebLLM engine.
 * - WebLLM (several MB) loads only when a local model is actually used, so the app opens fast.
 * - Inference runs in a Web Worker when the browser allows it, keeping scrolling/typing smooth
 *   on iPhone; it falls back to the main thread automatically and remembers a failure.
 * - Prompts, sampling and context budgets come from ai/model-profiles for each model size.
 */
import type {SheetPreviewData} from "./sheet-preview-model";
import type {CreamResult} from "../cream/core";
import {streamDisplayInterval,shouldPublishStream} from "./stream-performance";
import {VANILLA_BUILD} from "../version";
import {validateWebLLMMessages} from "./request-guard";
import {buildLocalChatMessages,buildSystemlessRecoveryMessages,assertLocalMessages,retryOnSystemPromptError,isSystemPromptOrderError,type LocalChatMessage} from "./chat-messages";
import {LOCAL_CATALOG,DEFAULT_LOCAL_MODEL,profileFor} from "../ai/model-profiles";
import {webllmRequestOptions} from "../ai/generation-config";
import {vanillaSystemPrompt,STRUCTURED_SYSTEM_PROMPT} from "../ai/prompts";
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
export type ChatTurn={role:"user"|"assistant";content:string;id?:string;createdAt?:number;source?:"local"|"ollama"|"gemini"|"deepseek";model?:string;rating?:"up"|"down";sheet?:SheetPreviewData;cream?:CreamResult;webSources?:WebCitation[];
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
 if(supported)return supported.has(model);
 return LOCAL_CATALOG.some(x=>x.id===model);
}
export async function refreshSupportedModels():Promise<string[]>{
 await webllm();
 return LOCAL_CATALOG.filter(x=>supported!.has(x.id)).map(x=>x.id);
}
/** True when the weights are already in this browser's cache (no download needed). */
export async function isLocalModelCached(model:LocalModelId):Promise<boolean>{
 try{const mod=await webllm();return typeof mod.hasModelInCache==="function"?await mod.hasModelInCache(model):false;}catch{return false;}
}
const SELECTED_KEY="vanilla.local.model";
export function preferredLocalModel():LocalModelId{
 try{const saved=localStorage.getItem(SELECTED_KEY);if(saved&&LOCAL_CATALOG.some(x=>x.id===saved))return saved;}catch{}
 return LOCAL_MODEL;
}

/* ---------- worker with automatic fallback ---------- */
const WORKER_KEY="vanilla.local.worker.v1";
export function localWorkerMode():"auto"|"off"|"broken"{
 try{const v=localStorage.getItem(WORKER_KEY);return v==="off"||v==="broken"?v:"auto";}catch{return "auto";}
}
export function setLocalWorkerMode(mode:"auto"|"off"):void{try{localStorage.setItem(WORKER_KEY,mode);}catch{}}
async function createEngine(model:LocalModelId,onProgress:(message:string,progress:number)=>void):Promise<Engine>{
 const mod=await webllm();
 if(localWorkerMode()==="auto"&&typeof Worker!=="undefined"){
  let worker:Worker|null=null;
  try{
   worker=new Worker(new URL("./webllm.worker.ts",import.meta.url),{type:"module"});
   let lastSignal=Date.now();
   const progress=(report:{text:string;progress:number})=>{lastSignal=Date.now();onProgress(report.text,report.progress);};
   const created=mod.CreateWebWorkerMLCEngine(worker,model,{initProgressCallback:progress});
   // A worker that never reports progress (e.g. no WebGPU inside workers) is abandoned after 30 s.
   const watchdog=new Promise<never>((_,reject)=>{const t=setInterval(()=>{if(Date.now()-lastSignal>30000){clearInterval(t);reject(new Error("worker-stalled"));}},2000);void created.finally(()=>clearInterval(t)).catch(()=>{});});
   const ready=await Promise.race([created,watchdog]);
   usingWorker=true;
   return ready;
  }catch(error){
   worker?.terminate();
   try{localStorage.setItem(WORKER_KEY,"broken");}catch{}
   console.warn("WebLLM worker unavailable, using main thread",error);
  }
 }
 usingWorker=false;
 return mod.CreateMLCEngine(model,{initProgressCallback:report=>onProgress(report.text,report.progress)});
}

export async function loadLocalModel(onProgress:(message:string,progress:number)=>void,model:LocalModelId=LOCAL_MODEL):Promise<void>{
 if(engine&&loadedModel===model)return;
 if(!("gpu" in navigator))throw new Error("目前瀏覽器不支援 WebGPU，無法使用裝置端模型。iPhone 需 iOS 26 以上的 Safari。");
 await webllm();
 if(!isLocalModelSupported(model))throw new Error("目前 WebLLM 版本沒有內建這個模型，請選擇其他本地模型。");
 if(loading){
  await loading;
  if(engine&&loadedModel===model)return;
 }
 if(engine&&loadedModel!==model){
  await engine.unload();
  engine=null;
  loadedModel=null;
 }
 loadingModel=model;
 const task=(async()=>{
  const next=await createEngine(model,onProgress);
  engine=next;
  loadedModel=model;
  try{localStorage.setItem(SELECTED_KEY,model);}catch{}
 })();
 loading=task;
 try{await task;}
 finally{if(loading===task){loading=null;loadingModel=null;}}
}
export async function interruptLocalGeneration():Promise<void>{
 try{await (engine as unknown as {interruptGenerate?:()=>void|Promise<void>})?.interruptGenerate?.();}catch{}
}

export type LocalReplyOptions={task?:TaskKind;signal?:AbortSignal;purpose?:"chat"|"structured"};
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
 const system=structured?STRUCTURED_SYSTEM_PROMPT:vanillaSystemPrompt({task,compact:profile.compactPrompt,latestUserText:latest});
 const request=webllmRequestOptions(model,task);
 const budget=profile.contextTokens-Number(request.max_tokens)-estimateTokens(system)-48;
 const turns=fitHistory(history.filter(x=>x&&(x.role==="user"||x.role==="assistant")&&typeof x.content==="string").map(x=>({role:x.role,content:x.content})),budget,480);
 const messages=buildLocalChatMessages(turns,"",{system,maxTurnChars:Infinity});
 assertLocalMessages(messages);
 const abort=()=>{void interruptLocalGeneration();};
 options.signal?.addEventListener("abort",abort,{once:true});

 async function streamReply(requestMessages:LocalChatMessage[],mode:"normal"|"recovery"):Promise<string>{
  // Verify a snapshot of the EXACT roles submitted to WebLLM. Do not log contents.
  const snapshot=requestMessages.map(message=>({...message}));
  validateWebLLMMessages(snapshot,mode);
  const stream=await currentEngine!.chat.completions.create({...request,messages:snapshot,stream:true});
  let answer="",last=0;
  const interval=streamDisplayInterval(navigator.hardwareConcurrency);
  for await(const chunk of stream){
   answer+=chunk.choices[0]?.delta?.content??"";
   const now=Date.now();
   // Reduce expensive React updates while WebGPU is streaming token chunks.
   if(shouldPublishStream(now,last,interval)){
    const view=stripThinking(answer);
    // Small models occasionally loop; stop early instead of burning the battery.
    if(!structured&&collapseRepetition(view.text).collapsed){void interruptLocalGeneration();break;}
    onText((structured?view.text:toTaiwanese(view.text))||(view.thinking?"（正在思考…）":""));last=now;
   }
  }
  const final=structured?stripThinking(answer).text.trim():toTaiwanese(cleanModelOutput(answer));
  onText(final); // Never drop final tokens after throttling.
  return final;
 }
 try{
  return await retryOnSystemPromptError(
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
 }catch(error){
  if(isSystemPromptOrderError(error)){
   throw Error("WebLLM 的實際請求仍回報 System Prompt 順序錯誤。Vanilla Build "+VANILLA_BUILD+
    "；已通過角色序列檢查並嘗試一次本機恢復。請確認裝置版本與正式網站一致後回報版本號。");
  }
  throw error;
 }finally{options.signal?.removeEventListener("abort",abort);}
}
