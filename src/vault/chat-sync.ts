import {listVaultFiles} from "./drive";
import {driveSession} from "../workspace/cloud-drive";
import type {ChatTurn} from "../local-ai/engine";

type Snapshot={version:2;owner:string;device:string;updatedAt:string;turns:ChatTurn[]};
const PREFIX="vanilla-conversation-v2-";
const UPLOAD="https://www.googleapis.com/upload/drive/v3/files";
const API="https://www.googleapis.com/drive/v3/files";
const PERMISSION="vanilla.chat.sync.optin.v2.";
const DEVICE="vanilla.chat.sync.device.v2.";
export const CHAT_SYNC_EVENT="vanilla-chat-sync-status";
let active=false,working:Promise<void>|null=null;
let pending:ReturnType<typeof setTimeout>|undefined;
function notice(message:string){window.dispatchEvent(new CustomEvent(CHAT_SYNC_EVENT,{detail:message}));}
const SESSION_ACCOUNT="vanilla.chat.active.account.v1";
export function signedChatAccount():string{
 const live=driveSession()?.email.trim().toLowerCase();
 if(live)return live;
 try{return (sessionStorage.getItem(SESSION_ACCOUNT)||"").trim().toLowerCase();}catch{return "";}
}
export function bindChatAccount(email:string):void{
 const next=email.trim().toLowerCase();
 if(next)sessionStorage.setItem(SESSION_ACCOUNT,next);
}
export function unbindChatAccount():void{
 try{sessionStorage.removeItem(SESSION_ACCOUNT);}catch{}
}
function account(){return signedChatAccount();}
function identity(){
 const who=account();if(!who)throw Error("請先登入 Google");
 const key=DEVICE+encodeURIComponent(who);
 let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}
 return {who,id};
}
export function chatStorageKey(privateMode:boolean):string{
 const who=account();
 if(!who)return privateMode?"vanilla.chat.private.v1":"vanilla.chat.history.v1";
 return (privateMode?"vanilla.chat.private.v2.":"vanilla.chat.history.v2.")+encodeURIComponent(who);
}
export function chatSyncEnabled(){const who=account();return Boolean(who&&localStorage.getItem(PERMISSION+encodeURIComponent(who))==="true");}
export function setChatSyncEnabled(enabled:boolean){
 const who=account();if(!who)throw Error("請先登入 Google");
 localStorage.setItem(PERMISSION+encodeURIComponent(who),String(enabled));
 if(!enabled)stopChatSync();
 window.dispatchEvent(new Event("vanilla-chat-sync-changed"));
}
function safeTurns(raw:unknown):ChatTurn[]{
 if(!Array.isArray(raw))return [];
 return raw.filter(x=>x&&typeof x==="object"&&(x.role==="user"||x.role==="assistant")&&typeof x.content==="string")
  .slice(-10000).map(x=>({
   role:x.role,content:x.content.slice(0,30000),id:typeof x.id==="string"?x.id:crypto.randomUUID(),
   createdAt:typeof x.createdAt==="number"&&Number.isFinite(x.createdAt)?x.createdAt:Date.now(),
   model:typeof x.model==="string"?x.model:undefined,
   source:x.source,rating:x.rating
  })) as ChatTurn[];
}
function local():ChatTurn[]{
 try{return safeTurns(JSON.parse(localStorage.getItem(chatStorageKey(false))||"[]") as unknown);}catch{return [];}
}
function fileName(who:string,id:string){return PREFIX+encodeURIComponent(who)+"-"+id+".json";}
async function read(token:string,id:string):Promise<Snapshot|null>{
 const res=await fetch(API+"/"+encodeURIComponent(id)+"?alt=media",{headers:{Authorization:"Bearer "+token}});
 if(!res.ok)return null;
 const data=await res.json() as Partial<Snapshot>;
 if(data.version!==2||data.owner!==account()||!Array.isArray(data.turns))return null;
 return {version:2,owner:data.owner,device:String(data.device||""),updatedAt:String(data.updatedAt||""),turns:safeTurns(data.turns)};
}
async function files(){
 const session=driveSession();if(!session)throw Error("Google 登入已過期");
 const {who}=identity(),prefix=PREFIX+encodeURIComponent(who)+"-";
 return (await listVaultFiles(session.token)).filter(f=>f.name.startsWith(prefix)).sort((a,b)=>(b.modifiedTime||"").localeCompare(a.modifiedTime||""));
}
export async function initializeChatSync():Promise<void>{
 if(!chatSyncEnabled()){active=false;return;}
 const session=driveSession();if(!session)return;
 if(working)return working;
 working=(async()=>{
  notice("正在載入這個 Google 帳號的對話…");
  const snapshots=await files();
  const newest=snapshots[0]?await read(session.token,snapshots[0].id):null;
  const stored=local();
  if(newest?.turns.length&&!stored.length){
   localStorage.setItem(chatStorageKey(false),JSON.stringify(newest.turns));
   window.dispatchEvent(new Event("vanilla-chat-remote-loaded"));
   notice("已載入 "+newest.turns.length+" 則雲端訊息");
  }else if(newest?.turns.length&&stored.length&&JSON.stringify(newest.turns)!==JSON.stringify(stored)){
   active=false;
   notice("本機與雲端對話存在差異，已暫停自動覆寫。請備份並決定要保留的版本");
   return;
  }else notice(newest?.turns.length?"已連接個人聊天快照":"已啟用對話同步，尚未有雲端快照");
  active=true;
 })().catch(e=>{active=false;notice("載入失敗："+String(e instanceof Error?e.message:e));}).finally(()=>{working=null;});
 return working;
}
export function scheduleChatSync(){if(!active||!chatSyncEnabled()||!driveSession())return;if(pending)clearTimeout(pending);pending=setTimeout(()=>{void pushChatSync();},4500);}
export async function pushChatSync():Promise<void>{
 if(!active||!chatSyncEnabled())return;
 const session=driveSession();if(!session)return;
 if(working){scheduleChatSync();return;}
 working=(async()=>{
  const turns=local();
  if(!turns.length)return;
  const {who,id}=identity(),name=fileName(who,id);
  const snapshot:Snapshot={version:2,owner:who,device:id,updatedAt:new Date().toISOString(),turns};
  const bodyText=JSON.stringify(snapshot);
  if(bodyText.length>6*1024*1024)throw Error("聊天快照超過 6MB，請先匯出重要對話");
  const snapshots=await files();
  const newest=snapshots[0]?await read(session.token,snapshots[0].id):null;
  if(newest?.turns.length){
   const expectedPrefix=turns.slice(0,newest.turns.length);
   const samePrefix=JSON.stringify(newest.turns)===JSON.stringify(expectedPrefix);
   if(!samePrefix){
    active=false;
    notice("偵測到其他裝置的新對話或不同版本，已停止寫入。請先在兩台裝置匯出並合併，沒有覆蓋任何雲端訊息");
    return;
   }
  }
  const current=snapshots.find(x=>x.name===name);
  if(current){
   const response=await fetch(UPLOAD+"/"+encodeURIComponent(current.id)+"?uploadType=media",{
    method:"PATCH",headers:{Authorization:"Bearer "+session.token,"Content-Type":"application/json"},body:bodyText
   });
   if(!response.ok)throw Error("Drive 更新失敗 "+response.status);
  }else{
   const boundary="vanilla_"+crypto.randomUUID().replaceAll("-","");
   const metadata=JSON.stringify({name,parents:["appDataFolder"],mimeType:"application/json"});
   const body="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+metadata+"\r\n--"+boundary+"\r\nContent-Type: application/json\r\n\r\n"+bodyText+"\r\n--"+boundary+"--";
   const response=await fetch(UPLOAD+"?uploadType=multipart",{method:"POST",
    headers:{Authorization:"Bearer "+session.token,"Content-Type":"multipart/related; boundary="+boundary},body});
   if(!response.ok)throw Error("Drive 寫入失敗 "+response.status);
  }
  notice("已同步 "+turns.length+" 則訊息（Google Drive 帳號："+who+"）");
 })().catch(e=>notice("同步暫停："+String(e instanceof Error?e.message:e))).finally(()=>{working=null;});
 return working;
}
export function legacyChatCount():number{
 try{
  const data=JSON.parse(localStorage.getItem("vanilla.chat.history.v1")||"[]") as unknown;
  return Array.isArray(data)?data.length:0;
 }catch{return 0;}
}
export function importLegacyChatToCurrentAccount():number{
 const who=account();
 if(!who||!driveSession())throw Error("請先重新登入 Google 帳號以確認身分");
 const key=chatStorageKey(false);
 const old=JSON.parse(localStorage.getItem("vanilla.chat.history.v1")||"[]") as unknown;
 const current=JSON.parse(localStorage.getItem(key)||"[]") as unknown;
 if(!Array.isArray(old)||!old.length)throw Error("找不到可匯入的舊版對話");
 if(Array.isArray(current)&&current.length)throw Error("此帳號已有對話，為避免覆蓋請先另行備份及合併");
 const next=safeTurns(old);
 localStorage.setItem(key,JSON.stringify(next));
 window.dispatchEvent(new Event("vanilla-chat-remote-loaded"));
 notice("已把舊版裝置對話複製到 "+who+" 的本機空間；原始資料未刪除");
 scheduleChatSync();
 return next.length;
}
export function stopChatSync(){active=false;if(pending)clearTimeout(pending);}
