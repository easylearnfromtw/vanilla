import type {LocalChatMessage} from "./chat-messages";

/** Validate the exact request body handed to WebLLM, including recovery paths.
 * Only role metadata may appear in diagnostics; NEVER log prompt contents.
 */
export type WebLLMRequestDiagnostic={
 length:number;roles:string[];firstRole:string;lastRole:string;systemCount:number;
};
export function inspectWebLLMMessages(messages:readonly LocalChatMessage[]):WebLLMRequestDiagnostic{
 const roles=messages.map(m=>m?.role||"invalid");
 return {length:roles.length,roles,firstRole:roles[0]||"none",
  lastRole:roles[roles.length-1]||"none",systemCount:roles.filter(r=>r==="system").length};
}
export function validateWebLLMMessages(messages:readonly LocalChatMessage[],mode:"normal"|"recovery"="normal"):WebLLMRequestDiagnostic{
 const info=inspectWebLLMMessages(messages);
 if(!info.length||info.lastRole!=="user"||
  info.roles.some(r=>r!=="system"&&r!=="user"&&r!=="assistant")||
  info.roles.some((r,i)=>r==="system"&&i!==0)||
  (mode==="normal"&&(info.firstRole!=="system"||info.systemCount!==1))||
  (mode==="recovery"&&info.systemCount!==0)||
  messages.some(m=>typeof m.content!=="string")){
  throw new Error("Vanilla 已阻止無效的 WebLLM 訊息序列；請重新載入模型。");
 }
 return info;
}
