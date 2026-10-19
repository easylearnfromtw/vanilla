/** Athena is a fast first-pass policy scanner, NOT antivirus or a safe sandbox.
 * Nothing returned from a scanner permits code execution or overrides admin consent.
 */
import {scanAttachmentIsolated} from "./athena-quarantine";
export type AthenaVerdict={allow:boolean;level:"ok"|"caution"|"block";findings:string[]};
const EXECUTABLE=/\.(?:exe|dll|scr|bat|cmd|ps1|apk|ipa|dmg|pkg|msi|com|vbs|jar)$/i;
const MACRO=/\.(?:docm|xlsm|pptm)$/i;
const INJECTION=/(?:ignore (?:all |any )?(?:previous|prior|above) instructions|忽略(?:以上|先前|之前)(?:所有)?(?:指令|規則)|你現在是(?:系統|管理員)|system\s*prompt|developer\s*message|role\s*[:=]\s*system|exfiltrat(?:e|ion)|傳送(?:金鑰|密碼|token)|洩漏(?:密鑰|密碼|金鑰))/i;
const ATTACK=/(?:\beval\s*\(|\bexec\s*\(|\bchild_process\b|\bpowershell\s+-enc\b|\brm\s+-rf\b|\bcurl\s+[^\n]*\|\s*(?:sh|bash)\b)/i;
export function athenaScanText(input:string,trust:"user"|"external"="external"):AthenaVerdict{
 const findings:string[]=[];const text=input.slice(0,100000);
 if(INJECTION.test(text))findings.push("含試圖改寫指令或取得權限的文字；只視為不可信資料");
 if(ATTACK.test(text))findings.push("包含高風險程式執行關鍵字；禁止自動執行");
 // A quoted prompt-injection within a user's question is not itself a request to execute it.
 return {allow:true,level:findings.length?"caution":"ok",findings:trust==="external"?findings:findings.map(x=>x+"（未執行）")};
}
export async function athenaScanFile(file:Pick<File,"name"|"size"|"type"|"slice">):Promise<AthenaVerdict>{
 const issues:string[]=[];
 if(!file.name||file.name.includes("\0")||file.name.includes("..")||/[\\/]/.test(file.name))return {allow:false,level:"block",findings:["檔案名稱包含路徑或非法字元"]};
 if(file.size>15*1024*1024)return {allow:false,level:"block",findings:["檔案超過可檢查的 15 MB 上限"]};
 if(/\.(?:zip|7z|rar|tar|gz)$/i.test(file.name))return {allow:false,level:"block",findings:["壓縮檔需先在隔離環境檢查所有內部檔案，尚不可直接匯入"]};
 if(EXECUTABLE.test(file.name)||MACRO.test(file.name))return {allow:false,level:"block",findings:["禁止自動匯入可執行檔或含巨集 Office 檔"]};
 const head=new Uint8Array(await file.slice(0,Math.min(file.size,4096)).arrayBuffer());
 const prefix=Array.from(head.slice(0,4));
 if(prefix[0]===0x4d&&prefix[1]===0x5a||prefix.join(",")==="127,69,76,70"||[0xfeedface,0xfeedfacf,0xcafebabe].includes((head[0]*0x1000000+head[1]*0x10000+head[2]*0x100+head[3])>>>0))return {allow:false,level:"block",findings:["偵測到原生可執行檔簽章"]};
 const isCode=/\.(?:js|mjs|cjs|ts|tsx|py|sh|html|sql|yml|yaml)$/i.test(file.name);
 if(isCode){const snippet=new TextDecoder().decode(head);const source=athenaScanText(snippet);issues.push(...source.findings);}
 if(file.size===0)issues.push("空白檔案，無法分析內容");
 const quarantined=await scanAttachmentIsolated({name:file.name,size:file.size,type:file.type,arrayBuffer:()=>file.slice(0,file.size).arrayBuffer()});
 const blocked=quarantined.filter(x=>x.level==="block");
 if(blocked.length)return {allow:false,level:"block",findings:[...issues,...blocked.map(x=>x.reason)]};
 issues.push(...quarantined.map(x=>x.reason));
 return {allow:true,level:issues.length?"caution":"ok",findings:issues};
}
export type GuardedAction="read"|"summarize"|"analyze"|"send-cloud"|"write-github"|"delete-drive"|"change-admin"|"execute-code";
export function holyRomanEmpireAuthorize(action:GuardedAction,options:{ownerVerified:boolean;explicitApproval:boolean;externalInstruction?:boolean;privateMode?:boolean}):AthenaVerdict{
 if(options.externalInstruction)return {allow:false,level:"block",findings:["網頁／附件／模型輸出不得觸發管理權限操作"]};
 if(action==="change-admin"||action==="execute-code")return {allow:false,level:"block",findings:["聊天流水線無權變更 ADMIN 權限或自動執行任意程式"]};
 if(action==="send-cloud"&&options.privateMode)return {allow:false,level:"block",findings:["私密模式禁止向遠端模型傳送"]};
 if(["send-cloud","write-github","delete-drive"].includes(action)&&(!options.ownerVerified||!options.explicitApproval))return {allow:false,level:"block",findings:["此動作需要擁有人身分及明確授權"]};
 return {allow:true,level:"ok",findings:[]};
}
