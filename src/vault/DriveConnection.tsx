import {useState} from "react";
import {setProvider,removeProvider,availableProviders,getConfigs,type Provider} from "./providers";
import {authorizeDrive,revokeDrive} from "./google-auth";
import {listVaultFiles,downloadVault,uploadVaultSnapshot} from "./drive";
import {encryptVault,decryptVault} from "./crypto";
const STORAGE_KEY="vanilla.chat.history.v1";
const SESSION_KEY="vanilla.drive.session.v1";
type DriveSession={token:string;expiresAt:number;email:string};
function readSession():DriveSession|null{try{const raw=sessionStorage.getItem(SESSION_KEY);if(!raw)return null;const v=JSON.parse(raw) as DriveSession;if(typeof v.token==="string"&&typeof v.expiresAt==="number"&&v.expiresAt>Date.now()+60000)return v;sessionStorage.removeItem(SESSION_KEY);}catch{}return null;}
function saveSession(v:DriveSession){try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(v));}catch{}}
function clearSession(){try{sessionStorage.removeItem(SESSION_KEY);}catch{}}
type Turn={role:"user"|"assistant";content:string};
function readLocal():Turn[]{try{const v:unknown=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");return Array.isArray(v)?v.filter((x):x is Turn=>Boolean(x&&typeof x==="object"&&(x.role==="user"||x.role==="assistant")&&typeof x.content==="string")):[];}catch{return [];}}
export default function DriveConnection(){
 const [token,setToken]=useState(()=>readSession()?.token||"");
 const [email,setEmail]=useState(()=>readSession()?.email||"");
 const [secret,setSecret]=useState("");
 const [status,setStatus]=useState("尚未連線");
 const [busy,setBusy]=useState(false);
 const [provider,setSelectedProvider]=useState<Provider>("gemini");
 const [apiKey,setApiKey]=useState("");
 const [model,setModel]=useState("gemini-2.5-flash");
 const [connected,setConnected]=useState<Provider[]>(availableProviders());
 async function connect(){
  setBusy(true);
  try{
   const result=await authorizeDrive();
   const res=await fetch("https://www.googleapis.com/oauth2/v2/userinfo",{headers:{Authorization:"Bearer "+result.token}});
   if(!res.ok)throw new Error("無法確認 Google 帳號");
   const user=await res.json() as {email?:string};
   setToken(result.token);setEmail(user.email||"已授權");saveSession({token:result.token,expiresAt:result.expiresAt,email:user.email||"已授權"});setStatus("已連接 Google Drive 家庭共用保險庫");
  }catch(e){setStatus(e instanceof Error?e.message:"連線失敗");}finally{setBusy(false);}
 }
 async function backup(){
  if(!token||secret.length<12)return;
  setBusy(true);
  try{
   const turns=readLocal();
   const envelope=await encryptVault("zekai",secret,{kind:"vanilla-family-chat-v1",turns,providers:getConfigs(),exportedAt:new Date().toISOString()});
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
   const data=await decryptVault<{kind:string;turns:Turn[];providers?:Array<{provider:Provider;key:string;model:string}>}>("zekai",secret,await downloadVault(token,files[0].id));
   if(data.kind!=="vanilla-family-chat-v1"||!Array.isArray(data.turns))throw new Error("備份資料格式不符");
   const incoming=data.turns.filter(x=>x&&(x.role==="user"||x.role==="assistant")&&typeof x.content==="string");
   if(!window.confirm("即將以 Google Drive 備份取代本機一般對話（"+readLocal().length+" 則）。私密對話不受影響。確定繼續？"))return;
   localStorage.setItem(STORAGE_KEY,JSON.stringify(incoming));
   for(const config of data.providers||[]){if((config.provider==="gemini"||config.provider==="deepseek")&&typeof config.key==="string"&&typeof config.model==="string")setProvider(config);}
   setConnected(availableProviders());
   setStatus("已還原 "+incoming.length+" 則一般模式訊息。請重新整理頁面查看。");
  }catch(e){setStatus(e instanceof Error?e.message:"還原失敗，請確認加密密語");}finally{setBusy(false);}
 }
 return <div style={{marginTop:24,padding:20,border:"1px solid #d1d5db",borderRadius:14}}>
  <h3 id="vanilla-model-settings">AI 模型與 API 管理</h3>
  <p style={{fontSize:12}}>Gemini / DeepSeek · 設定版本 2026.10.18</p>
  <p>API Key 只保存在本次開啟的記憶體中，不寫入公開程式碼或瀏覽器明文儲存。若需要跨裝置使用，請手動加密備份至 Google Drive，再於另一裝置還原。</p>
  <label>供應商 <select value={provider} onChange={e=>{const p=e.target.value as Provider;setSelectedProvider(p);setModel(p==="gemini"?"gemini-2.5-flash":"deepseek-chat");setApiKey("");}}><option value="gemini">Gemini</option><option value="deepseek">DeepSeek</option></select></label>
  <label style={{display:"block",marginTop:10}}>模型名稱 <input value={model} onChange={e=>setModel(e.target.value)}/></label>
  <label style={{display:"block",marginTop:10}}>API Key <input type="password" autoComplete="off" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="貼上 API Key"/></label>
  <div style={{display:"flex",gap:10,marginTop:10}}><button type="button" disabled={!apiKey.trim()||!model.trim()} onClick={()=>{setProvider({provider,key:apiKey.trim(),model:model.trim()});setApiKey("");setConnected(availableProviders());setStatus("已加入 "+provider+"，聊天時可自動路由。尚未驗證金鑰是否有效。");}}>加入模型</button><button type="button" onClick={()=>{removeProvider(provider);setConnected(availableProviders());}}>移除模型</button></div>
  <p>本次工作階段已連接：{connected.length?connected.join("、"):"尚無"}</p>
  <small>這是直接從瀏覽器呼叫供應商 API 的初版，金鑰會在呼叫時傳送至該供應商，且無後端金鑰代理。不要在不信任的裝置使用；雲端模型可能產生費用。</small>
  <h3>家庭 Google Drive 保險庫</h3>
  <p>Google 授權在目前分頁工作階段內保留，重新整理無須再次登入；授權到期、關閉分頁或 Safari 清除工作階段後仍需重新授權。</p>
  <p>全家共用同一個 Google 帳號的應用程式資料夾，以及同一組加密密語。私密模式紀錄永不上傳。</p>
  <p>目前支援手動加密備份一般聊天與已連接 API 設定、跨裝置還原；自動同步、衝突合併與長期記憶仍待完成。</p>
  {email&&<p>Google 帳號：{email}</p>}
  <button type="button" disabled={busy} onClick={()=>{if(token){revokeDrive(token);clearSession();setToken("");setEmail("");setStatus("已中斷連線");}else void connect();}}>{token?"中斷連線":"連接 Google Drive"}</button>
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
