import {useEffect,useState} from "react";
import {Globe2,ShieldCheck,Server,Plus,RefreshCw,Play,Copy,AlertTriangle} from "lucide-react";
import {BUILTIN_TOOLS,loadToolManifests,saveToolManifests,validateToolManifest,type WeiGuoTool} from "./registry";
import {attachmentOwner} from "../library/attachment-vault";
import {signedChatAccount} from "../vault/chat-sync";
import "./weiguo.css";

type Result={id:string;status:string;steps?:Array<{action:string;detail:string}>;text?:string;images?:Array<{src:string;alt:string}>;error?:string;createdAt?:string};
const explain=(error:unknown)=>error instanceof Error?error.message:String(error);
const validGateway=(input:string):string=>{const u=new URL(input.trim());if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash)throw Error("後端需使用可信任的 HTTPS 網址");return u.origin;};
const owner=()=>attachmentOwner(signedChatAccount());
/** Front-end is a client, not a long-running browser or a secret store. */
export default function WeiGuo(){
 const [base,setBase]=useState("");const [token,setToken]=useState("");const [url,setUrl]=useState("");
 const [goal,setGoal]=useState("");const [status,setStatus]=useState("未連線：請部署受信任的衞國後端");
 const [busy,setBusy]=useState(false);const [task,setTask]=useState<Result|null>(null);
 const [tools,setTools]=useState<WeiGuoTool[]>(()=>loadToolManifests(owner()));
 const [manifest,setManifest]=useState('{"id":"my-data-tool","label":"我的資料工具","kind":"custom","description":"僅登記介面，執行前仍需正式適配器","enabled":false,"permissions":["read"]}');
 const [error,setError]=useState("");
 useEffect(()=>{let cancelled=false;const id=task?.id;if(!id||["completed","failed","cancelled"].includes(task!.status)||!base||!token)return;
  const handle=window.setInterval(()=>{try{const host=validGateway(base);void fetch(host+"/v1/tasks/"+encodeURIComponent(id),{headers:{Authorization:"Bearer "+token},cache:"no-store"}).then(async res=>{if(!res.ok)throw Error("查詢失敗："+res.status);return res.json() as Promise<Result>;}).then(data=>{if(!cancelled)setTask(data);}).catch(err=>{if(!cancelled)setError(explain(err));});}catch(err){if(!cancelled)setError(explain(err));}},1600);
  return()=>{cancelled=true;window.clearInterval(handle);};
 },[task?.id,task?.status,base,token]);
 async function connect(){setBusy(true);setError("");try{const host=validGateway(base);const res=await fetch(host+"/v1/health",{cache:"no-store"});if(!res.ok)throw Error("後端健康檢查失敗："+res.status);setStatus("後端在線；任務仍需要有效授權");}catch(e){setError(explain(e));setStatus("未連線");}finally{setBusy(false);}}
 async function submit(){setBusy(true);setError("");try{
  if(!token.trim())throw Error("請輸入本次工作階段授權憑證，不會保存在手機");
  if(!goal.trim()||goal.length>1200)throw Error("請提供 1–1200 字任務描述");
  const target=new URL(url);if(target.protocol!=="https:")throw Error("只允許公開 HTTPS 網址");
  const host=validGateway(base);
  const res=await fetch(host+"/v1/tasks",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({goal:goal.trim(),url:target.toString()})});
  const data=await res.json() as Result&{detail?:string};if(!res.ok)throw Error(data.detail||"提交失敗："+res.status);
  setTask(data);setStatus("任務已交給後端；手機可離開此頁，但需保持後端運行");
 }catch(e){setError(explain(e));}finally{setBusy(false);}}
 function install(){try{const t=validateToolManifest(JSON.parse(manifest));if(tools.some(item=>item.id===t.id))throw Error("工具 ID 已註冊");const next=[...tools,t];saveToolManifests(owner(),next);setTools(next);setError("");}catch(e){setError(explain(e));}}
 return <section className="weiguo-console" aria-label="衞國瀏覽器操作系統">
  <header><div className="weiguo-identity"><Globe2 size={24}/><div><small>DETROIT / SCOUTS</small><h1>衞國 <span>Browser System</span></h1></div></div><p>受控網頁操作 · 工具註冊 · 可稽核任務紀錄。手機只是控制台；Playwright 由你授權的後端執行。</p></header>
  <div className="weiguo-status"><Server size={16}/><span>{status}</span></div>
  <div className="weiguo-panel"><h2>瀏覽器執行器</h2><label>後端 HTTPS 網址<input value={base} onChange={e=>setBase(e.target.value)} placeholder="https://browser.your-domain.example" autoCapitalize="none"/></label>
   <label>本次授權 Token（不儲存）<input type="password" value={token} onChange={e=>setToken(e.target.value)} placeholder="由你自己的驗證後端核發" autoComplete="off"/></label>
   <button type="button" onClick={()=>void connect()} disabled={busy}><RefreshCw size={15}/> 測試連線</button>
   <label>目標公開網址<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com" autoCapitalize="none"/></label>
   <label>任務指示<textarea rows={3} value={goal} onChange={e=>setGoal(e.target.value)} placeholder="閱讀這個頁面，整理重點與圖片來源。不得繞過網站權限。"/></label>
   <button type="button" className="weiguo-primary" disabled={busy||!url.trim()||!goal.trim()} onClick={()=>void submit()}><Play size={15}/> 交給 Zeus → 衞國執行</button>
   {error&&<p className="weiguo-error" role="alert"><AlertTriangle size={14}/> {error}</p>}
  </div>
  {task&&<div className="weiguo-panel"><h2>任務紀錄 <small>{task.status}</small></h2><p className="weiguo-mono">{task.id}</p>{task.error&&<p role="alert">{task.error}</p>}
    {task.steps?.map((step,i)=><p key={i}><b>{step.action}</b> · {step.detail}</p>)}
    {task.text&&<details><summary>讀取頁面摘要（點開）</summary><pre>{task.text}</pre></details>}
    {task.images?.length? <details><summary>圖片來源（{task.images.length}）</summary>{task.images.slice(0,16).map((x,i)=><p key={i}>{x.alt||"未命名"} · {x.src}</p>)}</details>:null}
  </div>}
  <div className="weiguo-panel"><h2><ShieldCheck size={17}/> 工具註冊表</h2><p>可加入自己的工具描述；新增只建立模組宣告，不會自動執行外部程式或授予權限。</p>
   <div className="weiguo-tool-grid">{[...BUILTIN_TOOLS,...tools].map(t=><div key={t.id}><strong>{t.label}</strong><small>{t.kind} · {t.enabled?"宣告啟用":"尚未啟用"}</small><p>{t.description}</p></div>)}</div>
   <label>註冊其他工具（安全 JSON Manifest）<textarea value={manifest} onChange={e=>setManifest(e.target.value)} rows={4} spellCheck={false}/></label>
   <button type="button" onClick={install}><Plus size={15}/> 加入工具清單</button>
  </div>
  <p className="weiguo-disclaimer"><ShieldCheck size={15}/> Athena 會檢查所有瀏覽器指令；禁止自動登入、付款、提交敏感表單或把網頁文字升格成管理指令。此頁並非已部署後端的證明。</p>
 </section>;
}