import {Converter} from "opencc-js";
import type {SheetPreviewData} from "./sheet-preview-model";
import {streamDisplayInterval,shouldPublishStream} from "./stream-performance";
import * as webllm from "@mlc-ai/web-llm";
import {toneInstruction} from "../ai/tone-adaptation";
import {VANILLA_BUILD} from "../version";
import {validateWebLLMMessages} from "./request-guard";
import {buildLocalChatMessages,buildSystemlessRecoveryMessages,assertLocalMessages,retryOnSystemPromptError,isSystemPromptOrderError} from "./chat-messages";

const toTraditionalChinese=Converter({from:"cn",to:"tw"});
const baseModels=[
 {id:"Qwen2.5-0.5B-Instruct-q4f16_1-MLC",label:"輕量 · Qwen 0.5B",description:"手機低記憶體選項；複雜問題建議使用較大的模型"},
 {id:"Qwen2.5-1.5B-Instruct-q4f16_1-MLC",label:"平衡 · Qwen 1.5B",description:"兼顧中文能力與裝置負載，適合部分高階手機"},
 {id:"Qwen2.5-3B-Instruct-q4f16_1-MLC",label:"進階 · Qwen 3B",description:"記憶體需求較高，手機可能無法載入"}
];
export type LocalModelId=string;
export const LOCAL_MODEL="Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
function discoverModels(){
 const known=new Set(baseModels.map(x=>x.id));
 const extra=webllm.prebuiltAppConfig.model_list
  .map(x=>x.model_id)
  .filter(id=>!known.has(id)&&/Qwen|Llama-3|Phi-3|gemma/i.test(id)&&/(?:0[.]5B|1B|1[.]5B|2B|3B|4B|7B)/i.test(id))
  .slice(0,14)
  .map(id=>{
   const params=id.match(/(0[.]5|1[.]5|1|2|3|4|7)B/i)?.[0]||"";
   return {id,label:id.split("-").slice(0,3).join(" ")+" · "+params,description:"可用 WebLLM 開源模型；下載大小、相容性與記憶體需求依裝置而異"};
  });
 return [...baseModels,...extra];
}
export const LOCAL_MODELS=discoverModels();
export type ChatTurn={role:"user"|"assistant";content:string;id?:string;createdAt?:number;source?:"local"|"ollama"|"gemini"|"deepseek";model?:string;rating?:"up"|"down";sheet?:SheetPreviewData};
let engine:webllm.MLCEngine|null=null;
let loadedModel:LocalModelId|null=null;
let loading:Promise<void>|null=null;
let loadingModel:LocalModelId|null=null;

export function getLoadedLocalModel():LocalModelId|null{return loadedModel;}
export function isLocalModelReady(model?:LocalModelId):boolean{return engine!==null&&(!model||loadedModel===model);}
export function isLocalModelSupported(model:LocalModelId):boolean{
 return webllm.prebuiltAppConfig.model_list.some(item=>item.model_id===model);
}
export async function loadLocalModel(onProgress:(message:string,progress:number)=>void,model:LocalModelId=LOCAL_MODEL):Promise<void>{
 if(engine&&loadedModel===model)return;
 if(!("gpu" in navigator))throw new Error("目前瀏覽器不支援 WebGPU，無法使用裝置端模型。");
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
  const next=await webllm.CreateMLCEngine(model,{
   initProgressCallback:report=>onProgress(report.text,report.progress)
  });
  engine=next;
  loadedModel=model;
 })();
 loading=task;
 try{await task;}
 finally{if(loading===task){loading=null;loadingModel=null;}}
}
export function getLoadingLocalModel():LocalModelId|null{return loadingModel;}

export async function generateLocalReply(history:ChatTurn[],onText:(text:string)=>void):Promise<string>{
 const currentEngine=engine;
 if(!currentEngine)throw new Error("本地模型尚未就緒，請載入模型後再試。");
 const style=toneInstruction(undefined,history[history.length-1]?.content||"");
 const messages=buildLocalChatMessages(history,style);
 assertLocalMessages(messages);
 const maxTokens=loadedModel===LOCAL_MODEL?768:1280;

 async function streamReply(requestMessages:webllm.ChatCompletionMessageParam[],mode:"normal"|"recovery"):Promise<string>{
  // Verify a snapshot of the EXACT roles submitted to WebLLM. Do not log contents.
  const snapshot=requestMessages.map(message=>({...message}));
  validateWebLLMMessages(snapshot as import("./chat-messages").LocalChatMessage[],mode);
  const stream=await currentEngine!.chat.completions.create({
   messages:snapshot,temperature:0.35,top_p:0.9,max_tokens:maxTokens,stream:true
  });
  let answer="",last=0;
  const interval=streamDisplayInterval(navigator.hardwareConcurrency);
  for await(const chunk of stream){
   answer+=chunk.choices[0]?.delta?.content??"";
   const now=Date.now();
   // Reduce expensive React updates while WebGPU is streaming token chunks.
   if(shouldPublishStream(now,last,interval)){onText(toTraditionalChinese(answer));last=now;}
  }
  const final=toTraditionalChinese(answer);
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
    const recovery=buildSystemlessRecoveryMessages(history,style);
    return streamReply(recovery,"recovery");
   }
  );
 }catch(error){
  if(isSystemPromptOrderError(error)){
   throw Error("WebLLM 的實際請求仍回報 System Prompt 順序錯誤。Vanilla Build "+VANILLA_BUILD+
    "；已通過角色序列檢查並嘗試一次本機恢復。請確認裝置版本與正式網站一致後回報版本號。");
  }
  throw error;
 }
}
