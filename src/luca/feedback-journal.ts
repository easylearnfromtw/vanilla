/**
 * LUCA quality-feedback journal: explicit human feedback, metadata only.
 * Records neither prompts, responses, conversation IDs, model IDs, nor user IDs.
 * Account-isolated on this device. Guest events exist in tab memory only.
 * Private mode never reads, writes, exports or records feedback.
 * No telemetry sender and no automatic cloud sync.
 */
import {signedChatAccount} from "../vault/chat-sync";
import {currentChatMode} from "../local-ai/chat-session";
import type {TaskKind} from "../ai/task-kind";

export type FeedbackAction="up"|"down"|"chosen";
export type FeedbackProvider="local"|"ollama"|"gemini"|"deepseek"|"other";
export type LucaFeedback={id:string;at:string;action:FeedbackAction;task:TaskKind;provider:FeedbackProvider};
export const LUCA_FEEDBACK_EVENT="vanilla-luca-feedback-changed";
const PREFIX="vanilla.luca.feedback.v1.";
const MAX_EVENTS=500;
const RETAIN_MS=90*24*60*60*1000;
const ACTIONS:readonly FeedbackAction[]=["up","down","chosen"];
const TASKS:readonly TaskKind[]=["casual","code","analysis","writing","vision","general"];
const PROVIDERS:readonly FeedbackProvider[]=["local","ollama","gemini","deepseek","other"];
const guest:LucaFeedback[]=[];

function accountKey():string|null{
 const account=signedChatAccount();
 return account?PREFIX+encodeURIComponent(account):null;
}
function valid(value:unknown):value is LucaFeedback{
 if(!value||typeof value!=="object")return false;
 const e=value as Partial<LucaFeedback>;
 return typeof e.id==="string"&&/^F-[a-f0-9-]{8,40}$/.test(e.id)&&
  typeof e.at==="string"&&Number.isFinite(Date.parse(e.at))&&
  ACTIONS.includes(e.action as FeedbackAction)&&
  TASKS.includes(e.task as TaskKind)&&
  PROVIDERS.includes(e.provider as FeedbackProvider);
}
function clean(items:unknown):LucaFeedback[]{
 const now=Date.now();
 return Array.isArray(items)?items.filter(valid).filter(e=>{
  const when=Date.parse(e.at);return when>=now-RETAIN_MS&&when<=now+60_000;
 }).slice(-MAX_EVENTS):[];
}
export function readLucaFeedback():LucaFeedback[]{
 if(currentChatMode()==="private")return [];
 const key=accountKey();
 if(!key)return clean(guest);
 try{return clean(JSON.parse(localStorage.getItem(key)||"[]"));}
 catch{return [];}
}
/** Called only after a user taps a rating or explicitly picks a comparison winner. */
export function recordLucaFeedback(action:FeedbackAction,task:TaskKind,provider:FeedbackProvider,privateMode=false):LucaFeedback|null{
 if(privateMode||currentChatMode()==="private"||!ACTIONS.includes(action)||!TASKS.includes(task)||!PROVIDERS.includes(provider))return null;
 let id:string;
 try{id="F-"+crypto.randomUUID();}catch{id="F-"+Date.now().toString(16)+"-"+Math.floor(Math.random()*0xffffffff).toString(16).padStart(8,"0");}
 const event:LucaFeedback={id,at:new Date().toISOString(),action,task,provider};
 const key=accountKey();
 if(key){
  try{localStorage.setItem(key,JSON.stringify(clean([...readLucaFeedback(),event])));}
  catch{return null;} // Journaling must not block rating or answer selection.
 }else{
  guest.push(event);while(guest.length>MAX_EVENTS)guest.shift();
 }
 try{window.dispatchEvent(new Event(LUCA_FEEDBACK_EVENT));}catch{}
 return event;
}
export function summarizeLucaFeedback(events:readonly LucaFeedback[]=readLucaFeedback()){
 const byTask=TASKS.map(task=>({task,up:0,down:0,chosen:0}));
 const byProvider=PROVIDERS.map(provider=>({provider,up:0,down:0,chosen:0}));
 const totals={up:0,down:0,chosen:0};
 for(const event of events){
  totals[event.action]++;
  const task=byTask.find(x=>x.task===event.task);if(task)task[event.action]++;
  const provider=byProvider.find(x=>x.provider===event.provider);if(provider)provider[event.action]++;
 }
 return {total:events.length,totals,byTask:byTask.filter(x=>x.up+x.down+x.chosen>0),
  byProvider:byProvider.filter(x=>x.up+x.down+x.chosen>0)};
}
export function clearLucaFeedback():void{
 if(currentChatMode()==="private")return;
 const key=accountKey();
 if(key){try{localStorage.removeItem(key);}catch{return;}}
 else guest.length=0;
 try{window.dispatchEvent(new Event(LUCA_FEEDBACK_EVENT));}catch{}
}
export function downloadLucaFeedback():void{
 if(currentChatMode()==="private")return;
 const events=readLucaFeedback();
 const payload={schema:"vanilla-luca-feedback-v1",scope:"device-only",exportedAt:new Date().toISOString(),summary:summarizeLucaFeedback(events),events};
 const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));
 try{const link=document.createElement("a");link.href=url;link.download="vanilla-luca-feedback.json";link.click();}
 finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
