import {listVaultFiles} from "./drive";
const KEY="vanilla.chat.history.v1";
const PREFIX="vanilla-chat-sync-v1-";
const API="https://www.googleapis.com/drive/v3/files";
type Turn={role:"user"|"assistant";content:string};
type Snapshot={version:1;createdAt:string;turns:Turn[]};
export const CHAT_SYNC_EVENT="vanilla-chat-sync-status";
function notify(message:string){window.dispatchEvent(new CustomEvent(CHAT_SYNC_EVENT,{detail:message}));}
function valid(v:unknown):v is Turn{return !!v&&typeof v==="object"&&((v as Turn).role==="user"||(v as Turn).role==="assistant")&&typeof (v as Turn).content==="string";}
function local():Turn[]{try{const v:unknown=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(v)?v.filter(valid):[];}catch{return [];}}
function session():string|null{try{const v=JSON.parse(sessionStorage.getItem("vanilla.drive.session.v1")||"null") as {token?:string;expiresAt?:number}|null;return v?.token&&v.expiresAt&&v.expiresAt>Date.now()+60000?v.token:null;}catch{return null;}}
async function check(res:Response){if(!res.ok)throw new Error("Drive "+res.status+(res.status===401?"，請重新授權":""));return res;}
async function latest(token:string){const files=(await listVaultFiles(token)).filter(f=>f.name.startsWith(PREFIX)).sort((a,b)=>(b.modifiedTime||"").localeCompare(a.modifiedTime||""));return files[0];}
async function read(token:string,id:string):Promise<Turn[]>{const r=await check(await fetch(API+"/"+encodeURIComponent(id)+"?alt=media",{headers:{Authorization:"Bearer "+token}}));const doc=await r.json() as Snapshot;if(doc.version!==1||!Array.isArray(doc.turns))throw new Error("聊天同步資料格式不符");return doc.turns.filter(valid);}
function equal(a:Turn[],b:Turn[]){return JSON.stringify(a)===JSON.stringify(b);}
let initialized=false;
let inFlight:Promise<void>|null=null;
let timer:ReturnType<typeof setTimeout>|undefined;
export async function initializeChatSync():Promise<void>{
 const token=session();if(!token){notify("請登入 Google Drive 以同步對話");return;}
 if(inFlight)return inFlight;
 inFlight=(async()=>{
  notify("正在讀取 Google Drive 對話…");
  const file=await latest(token);
  const remote=file?await read(token,file.id):[];
  const current=local();
  if(!current.length&&remote.length){localStorage.setItem(KEY,JSON.stringify(remote));window.dispatchEvent(new Event("vanilla-chat-remote-loaded"));notify("已載入 "+remote.length+" 則雲端訊息");}
  else if(current.length&&remote.length&&!equal(current,remote)){
   // Never silently overwrite a different local conversation or cloud snapshot.
   notify("本機與雲端對話不同，已保留本機資料；請先手動備份，暫停自動覆寫");
   initialized=false;return;
  }else notify(remote.length?"對話已與 Google Drive 同步":"雲端尚無對話，新增訊息後將自動同步");
  initialized=true;
 })().catch(e=>{initialized=false;notify("對話同步失敗："+String(e instanceof Error?e.message:e));}).finally(()=>{inFlight=null;});
 return inFlight;
}
export function scheduleChatSync(){if(!initialized||!session())return;if(timer)clearTimeout(timer);timer=setTimeout(()=>{void pushChatSync();},1800);}
export async function pushChatSync():Promise<void>{
 const token=session();if(!token||!initialized)return;
 const turns=local();if(!turns.length)return;
 if(inFlight){scheduleChatSync();return;}
 inFlight=(async()=>{
  const file=await latest(token);const remote=file?await read(token,file.id):[];
  if(equal(remote,turns)){notify("對話已同步");return;}
  // Allow only append-only changes. Divergent edits are not silently merged or overwritten.
  if(remote.length&&!equal(remote,turns.slice(0,remote.length))){initialized=false;notify("偵測到其他裝置修改對話；為避免覆蓋，已暫停同步");return;}
  const boundary="vanilla_"+crypto.randomUUID().replaceAll("-","");
  const metadata=JSON.stringify({name:PREFIX+Date.now()+".json",parents:["appDataFolder"],mimeType:"application/json"});
  const body="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+metadata+"\r\n--"+boundary+"\r\nContent-Type: application/json\r\n\r\n"+JSON.stringify({version:1,createdAt:new Date().toISOString(),turns} satisfies Snapshot)+"\r\n--"+boundary+"--";
  await check(await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"multipart/related; boundary="+boundary},body}));
  notify("已自動同步 "+turns.length+" 則訊息");
 })().catch(e=>notify("對話同步失敗："+String(e instanceof Error?e.message:e))).finally(()=>{inFlight=null;});
 return inFlight;
}
export function stopChatSync(){initialized=false;if(timer)clearTimeout(timer);}
