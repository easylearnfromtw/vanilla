/** Personal Google Drive backup only.
 * Shared model API credentials are managed exclusively by Ceres on the server.
 */
import {useState} from "react";
import {revokeDrive} from "./google-auth";
import {connectWorkspaceDrive} from "../workspace/cloud-drive";
import {chatStorageKey,unbindChatAccount} from "./chat-sync";
import {listVaultFiles,downloadVault,uploadVaultSnapshot} from "./drive";
import {encryptVault,decryptVault} from "./crypto";

const SESSION_KEY="vanilla.drive.session.v1";
type DriveSession={token:string;expiresAt:number;email:string};
type Turn={role:"user"|"assistant";content:string};
function readSession():DriveSession|null{
 try{
  const raw=sessionStorage.getItem(SESSION_KEY);
  if(!raw)return null;
  const v=JSON.parse(raw) as DriveSession;
  if(typeof v.token==="string"&&typeof v.expiresAt==="number"&&v.expiresAt>Date.now()+60000)return v;
  sessionStorage.removeItem(SESSION_KEY);
 }catch{/* Browser storage can be unavailable. */}
 return null;
}
function clearSession(){try{sessionStorage.removeItem(SESSION_KEY);}catch{}}
function readLocal():Turn[]{
 try{
  const data:unknown=JSON.parse(localStorage.getItem(chatStorageKey(false))||"[]");
  return Array.isArray(data)?data.filter((x):x is Turn=>Boolean(x&&typeof x==="object"&&(x.role==="user"||x.role==="assistant")&&typeof x.content==="string")):[];
 }catch{return [];}
}
export default function DriveConnection(){
 const [token,setToken]=useState(()=>readSession()?.token||"");
 const [email,setEmail]=useState(()=>readSession()?.email||"");
 const [secret,setSecret]=useState("");
 const [status,setStatus]=useState("尚未連線");
 const [busy,setBusy]=useState(false);
 async function connect(){
  setBusy(true);
  try{
   const session=await connectWorkspaceDrive();
   setToken(session.token);setEmail(session.email);
   setStatus("已連接個人 Google Drive："+session.email);
  }catch(e){setStatus(e instanceof Error?e.message:"連線失敗");}
  finally{setBusy(false);}
 }
 async function backup(){
  if(!token||secret.length<12)return;
  setBusy(true);
  try{
   const turns=readLocal();
   // Deliberately NEVER serialize provider credentials or backend-managed keys.
   const envelope=await encryptVault("zekai",secret,{kind:"vanilla-family-chat-v1",turns,exportedAt:new Date().toISOString()});
   await uploadVaultSnapshot(token,envelope);
   setStatus("已加密備份 "+turns.length+" 則一般模式訊息，未包含 API Key。");
  }catch(e){setStatus(e instanceof Error?e.message:"備份失敗");}
  finally{setBusy(false);}
 }
 async function restore(){
  if(!token||secret.length<12)return;
  setBusy(true);
  try{
   const files=(await listVaultFiles(token)).filter(x=>x.name.startsWith("vanilla-v1-zekai.encrypted.json."))
    .sort((a,b)=>(b.modifiedTime||"").localeCompare(a.modifiedTime||""));
   if(!files.length)throw Error("找不到對話備份");
   const data=await decryptVault<{kind:string;turns:Turn[]}>("zekai",secret,await downloadVault(token,files[0].id));
   if(data.kind!=="vanilla-family-chat-v1"||!Array.isArray(data.turns))throw Error("備份格式不正確");
   const turns=data.turns.filter(x=>x&&(x.role==="user"||x.role==="assistant")&&typeof x.content==="string");
   if(!window.confirm("以備份覆蓋本裝置 "+readLocal().length+" 則一般模式對話？私密模式不受影響。"))return;
   localStorage.setItem(chatStorageKey(false),JSON.stringify(turns));
   // Ignore legacy provider objects in previous backups to avoid reinjecting keys.
   setStatus("已還原 "+turns.length+" 則對話，未還原舊版 API Key。");
  }catch(e){setStatus(e instanceof Error?e.message:"還原失敗");}
  finally{setBusy(false);}
 }
 return <div style={{marginTop:24,padding:20,border:"1px solid #d1d5db",borderRadius:14}}>
  <h3>Google Drive · 帳號與備份</h3>
  <p>Google Drive 僅用於個人檔案及加密對話備份。共用 Gemini、Canva 等 API 由 Telegram Ceres 管理中心安全配置，不在網站輸入或同步憑證。</p>
  {email&&<p>目前帳號：{email}</p>}
  <button type="button" disabled={busy} onClick={()=>{if(token){
   revokeDrive(token);clearSession();unbindChatAccount();
   window.dispatchEvent(new Event("vanilla-drive-disconnected"));
   setToken("");setEmail("");setStatus("已中斷 Google Drive 連線");
  }else void connect();}}>{token?"中斷 Google Drive":"連接 Google Drive"}</button>
  <label style={{display:"block",marginTop:16}}>對話備份加密密語（至少 12 字元）</label>
  <input type="password" autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)}
   placeholder="此密語不會同步" style={{width:"100%",maxWidth:320,padding:10}}/>
  <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
   <button type="button" disabled={!token||secret.length<12||busy} onClick={()=>void backup()}>加密備份</button>
   <button type="button" disabled={!token||secret.length<12||busy} onClick={()=>void restore()}>還原對話</button>
  </div>
  <p role="status">{busy?"處理中…":status}</p>
  <small>已存在 Google Drive 的舊版明文 API 設定不會因本次更新自動刪除；管理員應自行撤銷舊金鑰並清理舊備份。</small>
 </div>;
}
