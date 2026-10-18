import {Converter} from "opencc-js";
import * as webllm from "@mlc-ai/web-llm";

const toTraditionalChinese=Converter({from:"cn",to:"tw"});
export const LOCAL_MODELS=[
 {id:"Qwen2.5-0.5B-Instruct-q4f16_1-MLC",label:"輕量 · 0.5B",description:"手機較省記憶體；僅適合簡短、低複雜度任務"},
 {id:"Qwen2.5-1.5B-Instruct-q4f16_1-MLC",label:"平衡 · 1.5B",description:"較好的中文理解；首次使用需另外下載"},
 {id:"Qwen2.5-3B-Instruct-q4f16_1-MLC",label:"進階 · 3B",description:"需要較充裕的記憶體；手機可能無法載入"}
] as const;
export type LocalModelId=(typeof LOCAL_MODELS)[number]["id"];
export const LOCAL_MODEL:LocalModelId=LOCAL_MODELS[0].id;
export type ChatTurn={role:"user"|"assistant";content:string;source?:"local"|"gemini"|"deepseek"};
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
 if(!engine)throw new Error("本地模型尚未就緒，請等待載入完成。");
 const recent=history.slice(-20).map(turn=>({
  role:turn.role,
  content:turn.content.length>2200?turn.content.slice(-2200):turn.content
 } as webllm.ChatCompletionMessageParam));
 const messages:webllm.ChatCompletionMessageParam[]=[
  {role:"system",content:"你是 Vanilla 的裝置端 AI。使用臺灣繁體中文和臺灣慣用語。重視隱私、忠實遵照問題、直接回答。無法查詢即時網路、無法存取 Google Drive、沒有看到的圖片也無法辨識；不要虛構已連接、已執行或已驗證的工具。遇到無把握的事，清楚承認限制。需要比較時可用 Markdown 表格。避免冗長免責或制式拒絕。"},
  ...recent
 ];
 const maxTokens=loadedModel===LOCAL_MODEL?768:1280;
 const stream=await engine.chat.completions.create({messages,temperature:0.35,top_p:0.9,max_tokens:maxTokens,stream:true});
 let answer="";
 for await(const chunk of stream){
  answer+=chunk.choices[0]?.delta?.content??"";
  onText(toTraditionalChinese(answer));
 }
 return toTraditionalChinese(answer);
}
