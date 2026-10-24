/**
 * Real remote inference for OCTUBER's branded capacity tiers.
 * These are Qwen base models actually served by a separate provider, NOT OCTUBER
 * fine-tuned weights. A displayed model is eligible only after a successful
 * authorized completion in THIS tab session.
 *
 * No API key is persisted in localStorage, sessionStorage, Drive, URLs or logs.
 * Reloading the page resets authorization and removes this candidate.
 */
import type {ChatTurn} from "../local-ai/engine";
import type {TaskKind} from "./task-kind";
import {classifyTask} from "./task-kind";
import {vanillaSystemPrompt} from "./prompts";
import {fitHistory,estimateTokens} from "./context-budget";
import {readSSE} from "./stream-parsers";
import {stripThinking,cleanModelOutput} from "./output-cleanup";
import {toTaiwanese} from "./zh-tw";

export const OCTUBER_HOSTED_ENDPOINT="https://openrouter.ai/api/v1";
export const OCTUBER_HOSTED_OPTIONS=[
 {tier:"mid-large",id:"qwen/qwen3-14b",label:"OCTUBER MODEST · 託管 Qwen3 14B",parameters:"14B Dense"},
 {tier:"large",id:"qwen/qwen3-30b-a3b-instruct-2507",label:"OCTUBER SUMPTUOUS · 託管 Qwen3 30B MoE",parameters:"30B MoE"},
 {tier:"ultra",id:"qwen/qwen3-32b",label:"OCTUBER SUMPTUOUS · 託管 Qwen3 32B Dense",parameters:"32B Dense"},
] as const;
export type HostedOctuberModel=(typeof OCTUBER_HOSTED_OPTIONS)[number]["id"];
export type HostedOctuberState={model:HostedOctuberModel;verifiedAt:number}|null;
let state:HostedOctuberState=null;
let accessKey="";
export function hostedOctuberState():HostedOctuberState{return state?{...state}:null;}
export function clearHostedOctuber():void{
 state=null;accessKey="";
 if(typeof window!=="undefined")window.dispatchEvent(new Event("vanilla-hosted-octuber-changed"));
}
export function hostedOctuberOption(model:string){return OCTUBER_HOSTED_OPTIONS.find(x=>x.id===model);}
export function isHostedOctuberReady(model?:string):boolean{
 return Boolean(state&&accessKey&&(!model||model===state.model));
}
function friendlyFailure(status:number):string{
 if(status===401||status===403)return "API 金鑰無效或尚無此模型的授權";
 if(status===402)return "供應商回報餘額不足或需要付款";
 if(status===404)return "找不到模型，請檢查服務商是否仍提供此模型";
 if(status===429)return "流量或額度限制，請稍後重試";
 return "API 回應 HTTP "+status+"，模型可能暫時無法使用";
}
function headers(key:string):HeadersInit{return {"Content-Type":"application/json",Authorization:"Bearer "+key};}
function requestBody(model:string,messages:Array<{role:"system"|"user"|"assistant";content:string}>,stream:boolean,maxTokens:number){
 return JSON.stringify({model,messages,stream,max_tokens:maxTokens});
}
/** Direct browser mode requires provider CORS permission; never use a public keyless proxy. */
export async function verifyHostedOctuber(model:HostedOctuberModel,key:string):Promise<{model:string;answer:string;elapsedMs:number}>{
 const selected=hostedOctuberOption(model);
 if(!selected)throw new Error("未知的 Qwen 模型，不可冒充 OCTUBER 規格");
 const raw=key.trim();
 if(!raw||raw.length<12)throw new Error("請先填入自己持有的 OpenRouter API Key");
 // Invalidate any previous model immediately, not after an async test.
 clearHostedOctuber();
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),60000);
 const start=Date.now();
 try{
  const response=await fetch(OCTUBER_HOSTED_ENDPOINT+"/chat/completions",{
   method:"POST",headers:headers(raw),signal:controller.signal,
   body:requestBody(model,[{role:"user",content:"請簡短回答：連線成功"}],false,48)
  });
  if(!response.ok)throw new Error(friendlyFailure(response.status));
  const payload=await response.json() as {choices?:Array<{message?:{content?:unknown}}>};
  const answer=payload.choices?.[0]?.message?.content;
  if(typeof answer!=="string"||!answer.trim())throw new Error("服務未回傳有效回答，模型未啟用");
  accessKey=raw;
  state={model,verifiedAt:Date.now()};
  if(typeof window!=="undefined")window.dispatchEvent(new Event("vanilla-hosted-octuber-changed"));
  return {model,answer:answer.slice(0,80),elapsedMs:Date.now()-start};
 }catch(error){
  if(controller.signal.aborted)throw new Error("60 秒內未收到有效回覆；請確認網路、服務狀態及 iPhone 的連線");
  if(error instanceof TypeError)throw new Error("瀏覽器無法直連 OpenRouter（網路或 CORS 阻擋）；需要可安全保管金鑰的後端代理，不能改用公開無密碼代理");
  throw error;
 }finally{clearTimeout(timeout);}
}
export async function generateHostedOctuber(history:ChatTurn[],model:string,options:{task?:TaskKind;onText?:(value:string)=>void;signal?:AbortSignal;toolGrounding?:string}={}):Promise<string>{
 if(!isHostedOctuberReady(model))throw new Error("大型模型尚未完成此分頁的 API 推論驗證，請到設定重新授權");
 const task=options.task??classifyTask(history.at(-1)?.content||"");
 const latest=history.at(-1)?.content||"";
 const system=vanillaSystemPrompt({task,compact:false,latestUserText:latest})+
   (options.toolGrounding?"\n\n[Vanilla 已驗證的工具結果]\n"+options.toolGrounding:"");
 const turns=fitHistory(history.slice(-20).map(x=>({role:x.role,content:x.content})),Math.max(2048,16000-estimateTokens(system)-1300));
 const response=await fetch(OCTUBER_HOSTED_ENDPOINT+"/chat/completions",{
  method:"POST",signal:options.signal,headers:headers(accessKey),
  body:requestBody(model,[{role:"system",content:system},...turns],true,1200)
 }).catch(error=>{
  if(error instanceof TypeError)throw new Error("OpenRouter 連線失敗：請檢查網路或 CORS");
  throw error;
 });
 if(!response.ok)throw new Error(friendlyFailure(response.status));
 let raw="",done=false,truncated=false,providerError="";
 await readSSE(response,data=>{
  if(data==="[DONE]"){done=true;return;}
  try{
   const payload=JSON.parse(data) as {error?:{message?:string};choices?:Array<{delta?:{content?:string|null};finish_reason?:string|null}>};
   if(payload.error){providerError="供應商推論失敗："+(payload.error.message||"未知錯誤");return;}
   const item=payload.choices?.[0];
   if(item?.finish_reason==="length")truncated=true;
   const piece=item?.delta?.content;
   if(piece){raw+=piece;options.onText?.(toTaiwanese(stripThinking(raw).text));}
  }catch{/* ignore non-json keepalive only */}
 });
 if(providerError)throw new Error(providerError);
 if(!done)throw new Error("遠端模型串流中斷，尚未收到完整結束訊號");
 if(truncated)throw new Error("30B 回答達到輸出長度上限，內容不完整");
 const result=toTaiwanese(cleanModelOutput(raw));
 if(!result.trim())throw new Error("遠端模型沒有產生有效內容");
 options.onText?.(result);
 return result;
}
