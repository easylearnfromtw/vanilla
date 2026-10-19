import {useEffect,useMemo,useState} from "react";
import {Download,FileText,ShieldCheck,Layers3,ArrowRight,ExternalLink} from "lucide-react";
import {createRetinaDocument,downloadRetina,type RetinaFormat} from "../detroit/retina";
import {currentChatMode} from "../local-ai/chat-session";
import {convertWeiGuoWordCraft,weiGuoApiBase,weiGuoIdentity} from "../weiguo/api";
import {ORCHESTRA_TOOLS,orchestraPlan,orchestraTool,type OrchestraFormat,type OrchestraToolId} from "./core";
import "./orchestra.css";

export default function OrchestraStudio({initialBody,source="manual",compact=false}:{
 initialBody?:string|null;source?:"manual"|"cream";compact?:boolean
}={}){
 const [tool,setTool]=useState<OrchestraToolId>("wordcraft");
 const [format,setFormat]=useState<OrchestraFormat>("docx");
 const [title,setTitle]=useState("Orchestra 報告");
 const [body,setBody]=useState("");
 const [consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 const privateMode=currentChatMode()==="private";
 useEffect(()=>{if(initialBody?.trim()){setBody(initialBody.slice(0,50000));setStatus("已接收 "+(source==="cream"?"CREAM 統計結果":"前一個工作區的文字")+"，尚未傳送到任何後端。");}},[initialBody,source]);
 const meta=orchestraTool(tool);
 const plan=useMemo(()=>orchestraPlan({tool,format,privateMode,cream:source==="cream"}),[tool,format,privateMode,source]);
 const local=["pdf","docx","pptx"].includes(format);
 function selectTool(id:OrchestraToolId){
  const entry=orchestraTool(id);setTool(id);setFormat(entry.formats[0]);setStatus("");setConsent(false);
 }
 async function makeLocal(){
  if(busy)return;
  if(!local){setStatus("此格式尚無 Retina 本機匯出器，需等 Craft 引擎部署。");return;}
  if(!title.trim()||!body.trim()){setStatus("請填入標題及文件內容。");return;}
  setBusy(true);setStatus("Retina 正在本機產製文件（不是 Craft 原生引擎）…");
  try{
   const result=await createRetinaDocument({title,body,format:format as RetinaFormat});
   downloadRetina(result);setStatus("完成：已使用本機 Retina 產生 "+result.name+"，沒有上傳內容。");
  }catch(e){setStatus("本機匯出失敗："+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 async function makeWordcraft(){
  if(busy)return;
  if(tool!=="wordcraft"||!["docx","pdf"].includes(format)){setStatus("此端點只提供 WordCraft DOCX／PDF。");return;}
  if(privateMode){setStatus("私人模式禁止傳送文件，請使用 Retina 本機匯出。");return;}
  if(!consent){setStatus("請先明確同意傳送本次文件內容。");return;}
  setBusy(true);setStatus("正在透過已登入的衞國後端請求 WordCraft…");
  try{
   const result=await convertWeiGuoWordCraft(title,body,format as "docx"|"pdf");
   downloadRetina({name:result.filename,mime:result.mime,bytes:result.bytes,sections:0});
   setStatus("WordCraft 已回傳 "+result.filename+"。");
  }catch(e){setStatus("WordCraft 尚未完成："+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 return <section className={"orchestra-studio"+(compact?" is-compact":"")}>
  {!compact&&<header className="orchestra-head"><p>DETROIT / ORCHESTRA</p><h1>ORCHESTRA <em>STUDIO</em></h1><span>跨格式製作管弦系統 · 7 種 Craft 工具統一調度</span></header>}
  <div className="orchestra-summary"><Layers3 size={18}/><p><strong>Orchestra 是工作流及分工層，不是七個額外 AI 模型。</strong>目前可直接使用 Retina 的本機 DOCX／PDF／PPTX 匯出；七個 Craft 原生引擎屬選用整合，是否能執行需依後端部署與驗證結果。</p></div>
  <div className="orchestra-tools" aria-label="選擇製作引擎">
   {ORCHESTRA_TOOLS.map(t=><button type="button" key={t.id} className={tool===t.id?"selected":""} aria-pressed={tool===t.id} onClick={()=>selectTool(t.id)}>
     <small>CRAFT / {t.id.toUpperCase()}</small><strong>{t.name}</strong><span>{t.summary}</span>
    </button>)}
  </div>
  <div className="orchestra-layout">
   <section className="orchestra-form">
    <h2><FileText size={18}/> 建立製作工作</h2>
    <label>作品標題<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)}/></label>
    <label>內容／CREAM 結果<textarea rows={10} maxLength={50000} value={body} onChange={e=>setBody(e.target.value)} placeholder={"# 摘要\n輸入正式報告、簡報、版面或設計工作的內容…"} /></label>
    <label>輸出格式<select value={format} onChange={e=>setFormat(e.target.value as OrchestraFormat)}>
     {meta.formats.map(f=><option value={f} key={f}>{f.toUpperCase()}</option>)}
    </select></label>
    {local?<button type="button" className="orchestra-export" disabled={busy||!body.trim()} onClick={()=>void makeLocal()}>
      <Download size={16}/> 使用 Retina 本機匯出 {format.toUpperCase()}
    </button>:<p className="orchestra-pending">目前沒有可執行的 {format.toUpperCase()} 匯出器，已保留 {meta.name} 整合位置。</p>}
    {tool==="wordcraft"&&<div className="orchestra-remote"><strong>WordCraft 原生後端（選用）</strong>
      <p>需安裝並隔離 WordCraft CLI、完成衞國家庭登入。此操作會將本次文字傳送到你設定的衞國後端。未安裝時會明確回報不可用。</p>
      <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> 同意此次將文件內容送交衞國後端</label>
      <button type="button" disabled={busy||privateMode||!consent||!body.trim()||!weiGuoApiBase()||!weiGuoIdentity()} onClick={()=>void makeWordcraft()}>透過 WordCraft 產製 {format.toUpperCase()}</button>
      {(!weiGuoApiBase()||!weiGuoIdentity())&&<p>請先設定並登入「衞國系統」，才能測試選用 WordCraft 後端。</p>}
    </div>}
    <p className="orchestra-feedback" role="status">{status}</p>
   </section>
   <aside className="orchestra-stages">
    <h2><ShieldCheck size={18}/> Detroit 工作流</h2>
    {plan.steps.map((s,i)=><div key={s.id} className="orchestra-stage">
      <small>{String(i+1).padStart(2,"0")} / {s.engine.toUpperCase()}</small>
      <div><strong>{s.label}</strong><span>{s.status==="ready"?"可用":s.status==="pending"?"待授權":"未啟用"}</span></div><p>{s.detail}</p>
    </div>)}
    <a href={meta.upstream} target="_blank" rel="noopener noreferrer">檢視 {meta.name} 原始碼 <ExternalLink size={14}/></a>
    <div className="orchestra-flow"><span>CREAM / DATA</span><ArrowRight size={14}/><span>ORCHESTRA</span><ArrowRight size={14}/><span>ARTIFACT</span></div>
    <small>若原生工具不可用，不以 Retina 的結果冒稱 Craft 製作。</small>
   </aside>
  </div>
 </section>;
