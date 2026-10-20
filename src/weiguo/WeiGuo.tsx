import {useState,useEffect,useRef} from "react";
import {driveSession} from "../workspace/cloud-drive";
import {renderWeiGuoGoogleButton} from "../vault/google-auth";
import {weiGuoApiBase,weiGuoIdentity,signInWeiGuo,clearWeiGuoSession,startWeiGuoTask,getWeiGuoTask,type WeiGuoTask,type WeiGuoIdentity} from "./api";
import {Globe2,ShieldCheck,Server,AlertTriangle} from "lucide-react";
import "./weiguo.css";
/** No backend admin secrets, passwords or OAuth tokens may be pasted into public GitHub Pages. */
export default function WeiGuo(){
 const googleButton=useRef<HTMLDivElement|null>(null);
 const [signed,setSigned]=useState(()=>Boolean(driveSession()));
 const [identity,setIdentity]=useState<WeiGuoIdentity|null>(()=>weiGuoIdentity());
 const [taskUrl,setTaskUrl]=useState("https://example.org/");
 const [task,setTask]=useState<WeiGuoTask|null>(null);
 const [busy,setBusy]=useState(false);
 const [taskNotice,setTaskNotice]=useState("");
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
 async function submitTask(){
  setBusy(true);setTaskNotice("");
  try{const created=await startWeiGuoTask(taskUrl.trim(),[{action:"extract"}]);setTask(created);setTaskNotice("任務已交由後端執行；關閉手機也不會取消已送出的工作。");}
  catch(e){setIdentity(weiGuoIdentity());setTaskNotice(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 }
 async function refreshTask(){
  if(!task)return;
  try{setTask(await getWeiGuoTask(task.id));}catch(e){setIdentity(weiGuoIdentity());setTaskNotice(e instanceof Error?e.message:String(e));}
 }

 return <section className="weiguo-console" aria-label="衞國瀏覽器操作系統">
   <header><div className="weiguo-identity"><Globe2 size={26}/><div><small>DETROIT / BROWSER TOOLS</small><h1>衞國 <span>Browser System</span></h1></div></div>
   <p>將 Playwright、Browser Use、Scouts 與日後加入的工具納入 Zeus 調度；iPhone 負責指令和授權，真正瀏覽器操作交給有安全隔離的後端。</p></header>
   <div className="weiguo-status"><Server size={16}/><span>{!weiGuoApiBase()?"尚未配置衞國 HTTPS 後端":identity?"Google 家庭授權已連結":"後端入口已設定 · 等待身分授權"}</span></div>
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
    <h2>權限及管理入口</h2>
    <p>本頁只保留 Google OIDC 使用者身分驗證與已授權的唯讀功能。Gmail 白名單、外部 API Key、工具授權和管理員操作均改由 Telegram Ceres 管理中心操作。</p>
    <a href="https://t.me/SignWell_bot" target="_blank" rel="noreferrer">前往 Ceres Telegram</a>
   </div>
   <div className="weiguo-disclaimer"><ShieldCheck size={15}/> 瀏覽器服務須依環境配置並實際驗證部署。部署指南在 GitHub 的 <code>services/weiguo/README.md</code>，私有登入與安全網路隔離建立完成後才能連線。</div>
 </section>;
}