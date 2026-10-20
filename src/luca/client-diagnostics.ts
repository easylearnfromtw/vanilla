/**
 * LUCA client fault journal. Records only fixed, reviewed metadata on this device.
 * No stack traces, prompts, responses, URLs, model names, account identifiers or exception text.
 * Private chat mode NEVER records. No network sender, background upload or automatic repair.
 */
import {signedChatAccount} from "../vault/chat-sync";
import {currentChatMode} from "../local-ai/chat-session";
import {VANILLA_BUILD} from "../version";

export type FaultComponent="ui"|"model"|"files"|"cream"|"network"|"detroit";
export type FaultOperation="render"|"uncaught"|"unhandled"|"download"|"generation"|"fallback"|"worker"|"read"|"write"|"analysis"|"request"|"tool";
export type FaultCode="disposed"|"system-prompt-order"|"worker-stalled"|"memory"|"storage"|"network"|"timeout"|"permission"|"unknown";
export type ClientFault={id:string;at:string;component:FaultComponent;operation:FaultOperation;code:FaultCode;build:string};
const VALID:Record<FaultComponent,readonly FaultOperation[]>={
 ui:["render","uncaught","unhandled"],model:["download","generation","fallback","worker"],
 files:["read","write"],cream:["analysis"],network:["request"],detroit:["tool"],
};
const CODES:readonly FaultCode[]=["disposed","system-prompt-order","worker-stalled","memory","storage","network","timeout","permission","unknown"];
const PREFIX="vanilla.luca.client.v1.";
const MAX_EVENTS=120, RETAIN_MS=30*24*60*60*1000;
const guest:ClientFault[]=[];
export const CLIENT_FAULT_EVENT="vanilla-luca-client-fault";

/** Error messages are used ONLY for local categorisation; raw strings are immediately discarded. */
export function classifyClientFault(error:unknown):FaultCode{
 const message=(error instanceof Error?error.message:typeof error==="string"?error:"").slice(0,1200).toLowerCase();
 if(/object has already been disposed|gpu.*disposed|disposed.*gpu/.test(message))return "disposed";
 if(/system prompt.*first|system.prompt.*order|system.prompt.*sequence/.test(message))return "system-prompt-order";
 if(/worker-stalled|worker.*stalled/.test(message))return "worker-stalled";
 if(/out of memory|memory allocation|insufficient memory|quota.*memory/.test(message))return "memory";
 if(/quotaexceeded|storage.*full|indexeddb.*failed|not enough storage/.test(message))return "storage";
 if(/timeout|timed out|aborterror|model-download-stalled/.test(message))return "timeout";
 if(/401|403|unauthorized|permission denied|notallowederror/.test(message))return "permission";
 if(/network|fetch failed|failed to fetch|offline|connection refused/.test(message))return "network";
 return "unknown";
}
function isFault(value:unknown):value is ClientFault{
 if(!value||typeof value!=="object")return false;
 const x=value as Partial<ClientFault>;
 return typeof x.id==="string"&&/^L-[a-f0-9-]{8,40}$/.test(x.id)&&
  typeof x.at==="string"&&Number.isFinite(Date.parse(x.at))&&
  typeof x.component==="string"&&x.component in VALID&&
  typeof x.operation==="string"&&VALID[x.component as FaultComponent].includes(x.operation as FaultOperation)&&
  typeof x.code==="string"&&CODES.includes(x.code as FaultCode)&&
  typeof x.build==="string"&&x.build.length<=80;
}
function accountKey():string|null{
 const account=signedChatAccount();
 if(!account)return null; // Anonymous diagnostics live only in RAM.
 // The identifier is only used to segregate local storage; never written inside an event.
 return PREFIX+encodeURIComponent(account);
}
function filtered(items:unknown):ClientFault[]{
 const cutoff=Date.now()-RETAIN_MS;
 return Array.isArray(items)?items.filter(isFault).filter(x=>{
  const t=Date.parse(x.at);return t>=cutoff&&t<=Date.now()+60_000;
 }).slice(-MAX_EVENTS):[];
}
export function readClientFaults():ClientFault[]{
 if(currentChatMode()==="private")return [];
 const key=accountKey();
 if(!key)return filtered(guest);
 try{return filtered(JSON.parse(localStorage.getItem(key)||"[]") as unknown);}
 catch{return [];}
}
export function recordClientFault(component:FaultComponent,operation:FaultOperation,error?:unknown):ClientFault|null{
 if(currentChatMode()==="private"||!VALID[component]?.includes(operation))return null;
 let id:string;
 try{id="L-"+crypto.randomUUID();}catch{id="L-"+Date.now().toString(16)+"-"+Math.floor(Math.random()*0xffffffff).toString(16).padStart(8,"0");}
 const item:ClientFault={id,at:new Date().toISOString(),component,operation,code:classifyClientFault(error),build:VANILLA_BUILD.slice(0,80)};
 const key=accountKey();
 if(key){
  try{localStorage.setItem(key,JSON.stringify(filtered([...readClientFaults(),item])));}
  catch{return null;} // Fail closed; never block the user's operation.
 }else{
  guest.push(item);while(guest.length>MAX_EVENTS)guest.shift();
 }
 try{window.dispatchEvent(new Event(CLIENT_FAULT_EVENT));}catch{}
 return item;
}
export function clearClientFaults():void{
 if(currentChatMode()==="private")return;
 const key=accountKey();
 if(key){try{localStorage.removeItem(key);}catch{}}
 else guest.length=0;
 try{window.dispatchEvent(new Event(CLIENT_FAULT_EVENT));}catch{}
}
/** Explicit local export only. Never transmits records or opens an external URL. */
export function downloadClientFaults():void{
 if(currentChatMode()==="private")return;
 const payload={schema:"vanilla-luca-client-v1",scope:"device-only",exportedAt:new Date().toISOString(),events:readClientFaults()};
 const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));
 try{
  const a=document.createElement("a");a.href=url;a.download="vanilla-luca-diagnostics.json";a.click();
 }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
/** Global exceptions: classify by code only. Never persist event.reason or event.filename. */
export function installClientFaultListeners():()=>void{
 const onError=(_event:ErrorEvent)=>{recordClientFault("ui","uncaught",_event.error);};
 const onRejection=(event:PromiseRejectionEvent)=>{recordClientFault("ui","unhandled",event.reason);};
 window.addEventListener("error",onError);
 window.addEventListener("unhandledrejection",onRejection);
 return ()=>{window.removeEventListener("error",onError);window.removeEventListener("unhandledrejection",onRejection);};
}
