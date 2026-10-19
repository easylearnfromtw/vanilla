import {useState,useEffect,useRef} from "react";
import {driveSession} from "../workspace/cloud-drive";
import {renderWeiGuoGoogleButton} from "../vault/google-auth";
import {weiGuoApiBase,weiGuoIdentity,signInWeiGuo,clearWeiGuoSession,startWeiGuoTask,getWeiGuoTask,type WeiGuoTask,type WeiGuoIdentity,getWeiGuoHealth,type WeiGuoHealth} from "./api";
import {Globe2,ShieldCheck,Server,Plus,Copy,AlertTriangle,BookOpen} from "lucide-react";
import {BUILTIN_TOOLS,loadToolManifests,saveToolManifests,validateToolManifest,type WeiGuoTool} from "./registry";
import {attachmentOwner} from "../library/attachment-vault";
import {signedChatAccount} from "../vault/chat-sync";
import "./weiguo.css";
const owner=()=>attachmentOwner(signedChatAccount());
const DEFAULT='{"id":"my-data-tool","label":"我的資料工具","kind":"custom","description":"僅登錄介面，待安全審核後才可接線","enabled":false,"permissions":["read"]}';
/** No backend admin secrets, passwords or OAuth tokens may be pasted into public GitHub Pages. */
export default function WeiGuo(){
 const [tools,setTools]=useState<WeiGuoTool[]>(()=>loadToolManifests(owner()));
 const googleButton=useRef<HTMLDivElement|null>(null);
 const [signed,setSigned]=useState(()=>Boolean(driveSession()));
 const [identity,setIdentity]=useState<WeiGuoIdentity|null>(()=>weiGuoIdentity());
 const [taskUrl,setTaskUrl]=useState("https://example.org/");
 const [task,setTask]=useState<WeiGuoTask|null>(null);
 const [busy,setBusy]=useState(false);
 const [taskNotice,setTaskNotice]=useState("");
 const [health,setHealth]=useState<WeiGuoHealth|null>(null);
 const [healthNotice,setHealthNotice]=useState("");
 const [healthBusy,setHealthBusy]=useState(false);
 useEffect(()=>{
  const update=()=>{setSigned(Boolean(driveSession()));setIdentity(weiGuoIdentity());setTask(null);};
  const expire=()=>{if(identity&&!weiGuoIdentity()){setIdentity(null);setTaskNotice("衞國授權已到期，請重新使用 Google 登入");}};
  const interval=window.setInterval(expire,15000);
  window.addEventListener("vanilla-drive-connected",update);
  window.addEventListener("vanilla-drive-disconnected",update);
  return()=>{window.clearInterval(interval);window.removeEventListener("vanilla-drive-connected",update);window.removeEventListener("vanilla-drive-disconnected",update);};
 },[identity]);
 useEffect(()=>{
  if(!signed||identity||!weiGuoApiBase()||!googleButton.current)return;
  let live=true;
  void renderWeiGuoGoogleButton(googleButton.current,credential=>{
   if(!live)return;
   setBusy(true);setTaskNotice("正在驗證 Google 身分與家庭權限…");
   void signInWeiGuo(credential).then(info=>{if(live){setIdentity(info);setTaskNotice("家庭身分驗證成功");}})
    .catch(error=>{if(live)setTaskNotice(String(error instanceof Error?error.message:error));})
    .finally(()=>{if(live)setBusy(false);});
  }).catch(error=>{if(live)setTaskNotice(String(error instanceof Error?error.message:error));});
  return()=>{live=false;};
 },[signed,identity]);
 async function checkHealth(){
  setHealthBusy(true);setHealthNotice("");
  try{
   const result=await getWeiGuoHealth();setHealth(result);
   setHealthNotice(result.configured?"後端連線正常；Google 身分與實際擷取仍需另行驗收":"已連上後端，但伺服器尚未完成任務設定");
  }catch(e){setHealth(null);setHealthNotice(e instanceof Error?e.message:String(e));}
  finally{setHealthBusy(false);}
 }
 async function submitTask(){
  setBusy(true);setTaskNotice("");
  try{const created=await startWeiGuoTask(taskUrl.trim(),[{action:"extract"}]);setTask(created);setTaskNotice("任務已交由後端執行；關閉手機也不會取消已送出的工作。");}
  catch(e){setIdentity(weiGuoIdentity());setTaskNotice(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 }
 async function refreshTask(){
  if(!task)return;
  try{setTask(await getWeiGuoTask(task.id));}catch(e){setIdentity(weiGuoIdentity());setTaskNotice(e instanceof Error?e.message:String(e));}
 }

 const [manifest,setManifest]=useState(DEFAULT);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 function install(){try{const t=validateToolManifest(JSON.parse(manifest));if(tools.some(x=>x.id===t.id))throw Error("工具 ID 已註冊");const updated=[...tools,t];saveToolManifests(owner(),updated);setTools(updated);setNotice("已登錄，但尚未授予網頁操作或程式執行權限。");setError("");}
 catch(e){setError(String(e instanceof Error?e.message:e));}}
 function remove(id:string){try{const updated=tools.filter(x=>x.id!==id);saveToolManifests(owner(),updated);setTools(updated);setNotice("已移除指定帳號的工具登錄。");}catch(e){setError(String(e instanceof Error?e.message:e));}}
 async function copy(){try{await navigator.clipboard.writeText(JSON.stringify({system:"衞國",runtime:"Detroit / Zeus",tools:[...BUILTIN_TOOLS,...tools].map(t=>({id:t.id,label:t.label,kind:t.kind,permissions:t.permissions}))},null,2));setNotice("已複製工具規格供後端接線審查。");}catch(e){setError(String(e instanceof Error?e.message:e));}}
 return <section className="weiguo-console" aria-label="衞國瀏覽器操作系統">
   <header><div className="weiguo-identity"><Globe2 size={26}/><div><small>DETROIT / BROWSER TOOLS</small><h1>衞國 <span>Browser System</span></h1></div></div>
   <p>將 Playwright、Browser Use、Scouts 與日後加入的工具納入 Zeus 調度；iPhone 負責指令和授權，真正瀏覽器操作交給有安全隔離的後端。</p></header>
   <div className="weiguo-status"><Server size={16}/><span>{!weiGuoApiBase()?"尚未配置衞國 HTTPS 後端":identity?"Google 家庭授權已連結":"後端入口已設定 · 等待身分授權"}</span></div>
   <div className="weiguo-panel"><h2><Server size={17}/> 衞國後端連線診斷</h2>
    <p>只檢查公開健康端點，不傳送 Google 登入資訊。iPhone 可直接檢測 Railway 是否正常；實際登入仍需本人授權。</p>
    <button type="button" onClick={()=>void checkHealth()} disabled={healthBusy||!weiGuoApiBase()}>{healthBusy?"正在檢測…":"檢測後端連線"}</button>
    {health&&<p role="status">瀏覽器引擎：{health.engine_configured||"chromium"} · Moli 已安裝：{health.moli_installed?"是":"否"} · Moli 已啟用：{health.moli_enabled?"是":"否"}</p>}
    {healthNotice&&<p role="status" className="weiguo-notice">{healthNotice}</p>}
   </div>
   <div className="weiguo-panel">
    <h2><ShieldCheck size={17}/> Google 家庭授權代理</h2>
    <p>沿用 Vanilla 的 Google 帳號，但使用獨立身分驗證，不會把 Google Drive 權杖或衞國管理金鑰送給後端。家庭角色由伺服器以 Google 固定帳號 ID 核對。</p>
    {!weiGuoApiBase()?<p role="status">尚未設定 VITE_WEIGUO_API_URL。需先部署 HTTPS 服務並設定 GitHub Pages 的 WEIGUO_API_URL 變數。</p>
     :!signed?<p role="status">請先在 Vanilla 左側選單登入 Google 帳號。</p>
     :identity?<div className="weiguo-auth-line"><strong>{identity.member} · {identity.role}</strong><small>{identity.email} · 授權 15 分鐘，僅保留於此分頁記憶體</small>
      <button type="button" onClick={()=>{clearWeiGuoSession();setIdentity(null);setTask(null);setTaskNotice("已清除衞國授權");}}>中斷衞國連線</button></div>
     :<div className="weiguo-auth-line"><div ref={googleButton} aria-label="使用 Google 驗證衞國身分"/><small>使用與 Vanilla Drive 相同的 Google 帳號授權</small></div>}
    {identity?.role!=="viewer"&&identity&&<div className="weiguo-task-form">
      <label>唯讀瀏覽器任務 · HTTPS 網址<input type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={taskUrl} onChange={e=>setTaskUrl(e.target.value)} placeholder="https://example.org/" /></label>
      <button type="button" className="weiguo-primary" disabled={busy||!taskUrl.trim()} onClick={()=>void submitTask()}>由衞國開啟並擷取內容</button>
      {task&&<div className="weiguo-task-result"><div><strong>任務 {task.status}</strong><button type="button" disabled={busy} onClick={()=>void refreshTask()}>更新結果</button></div>
      <small>任務編號：{task.id}</small>
      {task.error&&<p role="alert">{task.error}</p>}
      {task.result?.title&&<p>{task.result.title}</p>}
      {(task.result?.events||[]).filter(e=>typeof e.text==="string").map((e,i)=><pre key={i}>{e.text}</pre>)}
      </div>}
    </div>}
    {taskNotice&&<p role="status" className="weiguo-notice">{taskNotice}</p>}
   </div>
   <div className="weiguo-panel">
     <h2><ShieldCheck size={17}/> 真實執行權限</h2><p>已加入 Google OIDC 家庭身分代理與帳號隔離的唯讀任務 API；需由伺服器設定家庭權限、允許網域及 HTTPS 部署。公開 PWA 永遠不接收後端管理金鑰。</p>
     <p><b>Merlin</b> 解讀目標 → <b>Zeus</b> 規劃步驟 → <b>Athena</b> 審查 → <b>Scouts／Playwright</b> 導覽和擷取 → <b>CREAM</b> 計算 → <b>爾雅／Venus</b> 回答。</p>
     <div className="weiguo-disclaimer"><AlertTriangle size={16}/> 不提供任意程式執行、網站付款或帳號變更權限。任何來自外部頁面的指令均只是資料，不能修改 Detroit 安全政策。</div>
   </div>
   <div className="weiguo-panel">
     <h2><BookOpen size={17}/> 工具登錄表 <small>依目前帳號隔離</small></h2>
     <div className="weiguo-tool-grid">{[...BUILTIN_TOOLS,...tools].map(t=><div key={t.id}><strong>{t.label}</strong><small>{t.kind} · {t.kind==="scouts"?"後端待連接":t.enabled?"已登錄":"未授權執行"}</small><p>{t.description}</p><small>{t.permissions.join(" / ")}</small>{t.kind==="custom"&&<button type="button" aria-label={"移除 "+t.label} onClick={()=>remove(t.id)}>移除</button>}</div>)}</div>
     <button type="button" onClick={()=>void copy()}><Copy size={15}/> 複製工具清單</button>
   </div>
   <div className="weiguo-panel">
     <h2>加入其他工具</h2><p>貼入只有名稱、識別碼和權限的 JSON Manifest。此操作不會下載、安裝或執行任何外部程式，也不會要求 API 金鑰。</p>
     <label>工具宣告 JSON<textarea rows={5} value={manifest} onChange={e=>setManifest(e.target.value)} spellCheck={false}/></label>
     <button type="button" className="weiguo-primary" onClick={install}><Plus size={15}/> 登錄至此帳號</button>
     {notice&&<p className="weiguo-notice" role="status">{notice}</p>}
     {error&&<p className="weiguo-error" role="alert"><AlertTriangle size={14}/> {error}</p>}
   </div>
   <div className="weiguo-disclaimer"><ShieldCheck size={15}/> 瀏覽器服務須依環境配置並實際驗證部署。部署指南在 GitHub 的 <code>services/weiguo/README.md</code>，私有登入與安全網路隔離建立完成後才能連線。</div>
 </section>;
}