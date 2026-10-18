import {useState} from "react";
import {authorizeDrive,revokeDrive} from "./google-auth";
import {listVaultFiles,downloadVault,uploadVaultSnapshot} from "./drive";
import {encryptVault,decryptVault} from "./crypto";
const STORAGE_KEY="vanilla.chat.history.v1";
type Turn={role:"user"|"assistant";content:string};
function readLocal():Turn[]{try{const v:unknown=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");return Array.isArray(v)?v.filter((x):x is Turn=>Boolean(x&&typeof x==="object"&&(x.role==="user"||x.role==="assistant")&&typeof x.content==="string")):[];}catch{return [];}}
export default function DriveConnection(){
 const [token,setToken]=useState("");
 const [email,setEmail]=useState("");
 const [secret,setSecret]=useState("");
 const [status,setStatus]=useState("尚未連線");
 const [busy,setBusy]=useState(false);
 async function connect(){
  setBusy(true);
  try{
   const result=await authorizeDrive();
   const res=await fetch("https://www.googleapis.com/oauth2/v2/userinfo",{headers:{Authorization:"Bearer "+result.token}});
   if(!res.ok)throw new Error("無法確認 Google 帳號");
   const user=await res.json() as {email?:string};
   setToken(result.token);setEmail(user.email||"已授權");setStatus("已連接 Google Drive 家庭共用保險庫");
  }catch(e){setStatus(e instanceof Error?e.message:"連線失敗");}finally{setBusy(false);}
 }
 async function backup(){
  if(!token||secret.length<12)return;
  setBusy(true);
  try{
   const turns=readLocal();
   const envelope=await encryptVault("zekai",secret,{kind:"vanilla-family-chat-v1",turns,exportedAt:new Date().toISOString()});
   await uploadVaultSnapshot(token,envelope);
   setStatus("已加密備份 "+turns.length+" 則一般模式訊息到 Google Drive。私密模式不會備份。");
  }catch(e){setStatus(e instanceof Error?e.message:"備份失敗");}finally{setBusy(false);}
 }
 async function restore(){
  if(!token||secret.length<12)return;
  setBusy(true);
  try{
   const files=(await listVaultFiles(token)).filter(x=>x.name.startsWith("vanilla-v1-zekai.encrypted.json.")).sort((a,b)=>(b.modifiedTime||"").localeCompare(a.modifiedTime||""));
   if(!files.length)throw new Error("Google Drive 找不到家庭備份");
   const data=await decryptVault<{kind:string;turns:Turn[]}>("zekai",secret,await downloadVault(token,files[0].id));
   if(data.kind!=="vanilla-family-chat-v1"||!Array.isArray(data.turns))throw new Error("備份資料格式不符");
   const incoming=data.turns.filter(x=>x&&(x.role==="user"||x.role==="assistant")&&typeof x.content==="string");
   if(!window.confirm("即將以 Google Drive 備份取代本機一般對話（"+readLocal().length+" 則）。私密對話不受影響。確定繼續？"))return;
   localStorage.setItem(STORAGE_KEY,JSON.stringify(incoming));
   setStatus("已還原 "+incoming.length+" 則一般模式訊息。請重新整理頁面查看。");
  }catch(e){setStatus(e instanceof Error?e.message:"還原失敗，請確認加密密語");}finally{setBusy(false);}
 }
 return <div style={{marginTop:24,padding:20,border:"1px solid #d1d5db",borderRadius:14}}>
  <h3>家庭 Google Drive 保險庫</h3>
  <p>全家共用同一個 Google 帳號的應用程式資料夾，以及同一組加密密語。私密模式紀錄永不上傳。</p>
  <p>目前支援手動加密備份與跨裝置還原；自動同步、衝突合併與長期記憶仍待完成。</p>
  {email&&<p>Google 帳號：{email}</p>}
  <button type="button" disabled={busy} onClick={()=>{if(token){revokeDrive(token);setToken("");setEmail("");setStatus("已中斷連線");}else void connect();}}>{token?"中斷連線":"連接 Google Drive"}</button>
  <label style={{display:"block",marginTop:16}}>家庭加密密語（至少 12 字元）</label>
  <input type="password" autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)} placeholder="每台裝置輸入相同密語" style={{width:"100%",maxWidth:320,padding:10}}/>
  <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
   <button type="button" disabled={!token||secret.length<12||busy} onClick={()=>void backup()}>加密備份至 Drive</button>
   <button type="button" disabled={!token||secret.length<12||busy} onClick={()=>void restore()}>從 Drive 還原</button>
  </div>
  <p role="status">{busy?"處理中…":status}</p>
  <small>密語不會傳送到 Google 或儲存在瀏覽器。忘記密語將無法解密備份。備份採快照方式，還原會取代一般對話；請勿在不同裝置交替備份，以免覆蓋新內容。</small>
 </div>;
}
