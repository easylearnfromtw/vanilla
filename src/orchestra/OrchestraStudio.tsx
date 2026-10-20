import {useEffect,useMemo,useState} from "react";
import {Download,FileText,ShieldCheck,Layers3,ArrowRight,ExternalLink} from "lucide-react";
import {createRetinaDocument,downloadRetina,type RetinaFormat} from "../detroit/retina";
import {currentChatMode} from "../local-ai/chat-session";
import {convertWeiGuoWordCraft,weiGuoApiBase,weiGuoIdentity,getWeiGuoOrchestraCapabilities,mergeWeiGuoPdfCraft} from "../weiguo/api";
import {wordcraftConfigured,pdfcraftConfigured,type OrchestraCapabilities} from "./capability-contract";
import {downloadCreamSvg,type OrchestraChart} from "./cream-chart";
import {ORCHESTRA_TOOLS,orchestraPlan,orchestraTool,type OrchestraFormat,type OrchestraToolId} from "./core";
import LocalCraftPanel,{supportsLocalCraft} from "./LocalCraftPanel";
import CanvaPanel from "../canva/CanvaPanel";
import type {OrchestraHandoff} from "./ai-handoff";
import "./orchestra.css";

export default function OrchestraStudio({initialBody,source="manual",compact=false,chart,handoff}:{
 initialBody?:string|null;source?:"manual"|"cream"|"ai";compact?:boolean;chart?:OrchestraChart|null;handoff?:OrchestraHandoff|null
}={}){
 const [tool,setTool]=useState<OrchestraToolId>("wordcraft");
 const [format,setFormat]=useState<OrchestraFormat>("docx");
 const [title,setTitle]=useState("Orchestra 報告");
 const [body,setBody]=useState("");
 const [consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 const [capabilities,setCapabilities]=useState<OrchestraCapabilities|null>(null);
 const [capNotice,setCapNotice]=useState("未連接後端");
 const [checking,setChecking]=useState(false);
 const [pdfFiles,setPdfFiles]=useState<File[]>([]);
 const privateMode=currentChatMode()==="private";
 const backendWordcraft=wordcraftConfigured(capabilities);
 const backendPdfcraft=pdfcraftConfigured(capabilities);
 async function refreshCapabilities(){
  if(privateMode){setCapabilities(null);setCapNotice("私人模式不連線至後端");return;}
  if(!weiGuoApiBase()||!weiGuoIdentity()){setCapabilities(null);setCapNotice("需先登入衞國家庭後端");return;}
  setChecking(true);
  try{setCapabilities(await getWeiGuoOrchestraCapabilities());setCapNotice("已向家庭後端查詢工具配置；配置不代表原生轉檔已完成驗收");}
  catch(e){setCapabilities(null);setCapNotice("無法驗證後端能力："+String(e instanceof Error?e.message:e));}
  finally{setChecking(false);}
 }
 useEffect(()=>{void refreshCapabilities();},[privateMode]);
 useEffect(()=>{if(initialBody?.trim()){setBody(initialBody.slice(0,50000));setStatus("已接收 "+(source==="cream"?"CREAM 統計結果":"前一個工作區的文字")+"，尚未傳送到任何後端。");}},[initialBody,source]);
 useEffect(()=>{if(!handoff||source!=="ai")return;
  setTool(handoff.tool);setFormat(handoff.format);setTitle(handoff.title);
  setBody(handoff.body);setConsent(false);
  setStatus(handoff.provenance==="assistant-answer"?"已接收 AI 回答內容，請審查後輸出。":"已建立 Detroit AI 製作任務；尚無完成內容，請先產生草稿。");
 },[handoff,source]);
 const meta=orchestraTool(tool);
 const plan=useMemo(()=>orchestraPlan({tool,format,privateMode,cream:source==="cream",creamChart:!!chart&&chart.points.length>=2,remoteAvailable:backendWordcraft}),[tool,format,privateMode,source,chart,backendWordcraft]);
 const creamSvg=format==="svg"&&tool==="vectorcraft"&&!!chart&&chart.points.length>=2;
 const local=["pdf","docx","pptx"].includes(format)||creamSvg;
 const studioLocal=supportsLocalCraft(tool,format)&&!creamSvg&&!local;
 function selectTool(id:OrchestraToolId){
  const entry=orchestraTool(id);setTool(id);setFormat(entry.formats[0]);setStatus("");setConsent(false);setPdfFiles([]);
 }
 async function makeLocal(){
  if(busy)return;
  if(!local){setStatus("此格式尚無 Retina 本機匯出器，需等 Craft 引擎部署。");return;}
  if(!title.trim()||!body.trim()){setStatus("請填入標題及文件內容。");return;}
  if(creamSvg&&chart){try{downloadCreamSvg(chart);setStatus("已以 CREAM 本機數據繪製 SVG，未執行 VectorCraft、未上傳。");}catch(e){setStatus("CREAM SVG 匯出失敗："+String(e));}return;}
  setBusy(true);setStatus("Retina 正在本機產製文件（不是 Craft 原生引擎）…");
  try{
   const result=await createRetinaDocument({title,body,format:format as RetinaFormat});
   downloadRetina(result);setStatus("完成：已使用本機 Retina 產生 "+result.name+"，沒有上傳內容。");
  }catch(e){setStatus("本機匯出失敗："+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 async function makePdfcraft(){
  if(busy)return;
  if(tool!=="pdfcraft")return setStatus("請先選擇 PdfCraft");
  if(privateMode||!backendPdfcraft||!consent)return setStatus("PDF 合併需要已啟用的受控後端與此次明確同意");
  if(pdfFiles.length<2||pdfFiles.length>3)return setStatus("請選擇 2–3 份 PDF");
  setBusy(true);setStatus("PdfCraft 正在於受控後端合併已選文件…");
  try{
   const pdf=await mergeWeiGuoPdfCraft(pdfFiles);
   downloadRetina({name:"Orchestra_PdfCraft_Merged.pdf",mime:"application/pdf",bytes:pdf,sections:0});
   setStatus("已透過原生 PdfCraft CLI 完成 PDF 合併並提供下載。");
   setConsent(false);setPdfFiles([]);
  }catch(e){setStatus("PdfCraft 未完成："+String(e instanceof Error?e.message:e));}
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
  <div className="orchestra-summary"><Layers3 size={18}/><p><strong>Orchestra 是工作流及分工層，不是七個額外 AI 模型。</strong>已提供 Retina DOCX／PDF／PPTX、CREAM SVG、Orchestra 本機 SVG／PNG／JPEG／GIF 製作器。七個 Craft 原生引擎仍是獨立選用整合，需依後端部署及實測判定可用。</p></div>
  <div className="orchestra-capabilities"><p role="status">{capNotice}</p><button type="button" disabled={checking||privateMode} onClick={()=>void refreshCapabilities()}>{checking?"檢查中…":"重新檢查引擎"}</button></div>
  <div className="orchestra-tools" aria-label="選擇製作引擎">
   {ORCHESTRA_TOOLS.map(t=><button type="button" key={t.id} className={tool===t.id?"selected":""} aria-pressed={tool===t.id} onClick={()=>selectTool(t.id)}>
     <small>CRAFT / {t.id.toUpperCase()}</small><strong>{t.name}</strong><span>{t.summary}</span><span>{(t.id==="wordcraft"&&backendWordcraft)||(t.id==="pdfcraft"&&backendPdfcraft)?"後端已配置 · 尚未完成實測":"原生引擎未啟用"}{t.formats.some(f=>supportsLocalCraft(t.id,f))?" · 有本機製作器":""}</span>
    </button>)}
  </div>
  <div className="orchestra-layout">
   <section className="orchestra-form">
    {source==="ai"&&handoff&&<div className="orchestra-ai-brief">
      <strong>Detroit AI → Diana → Zeus → Orchestra</strong>
      <p>目標格式：{handoff.format.toUpperCase()} · {handoff.provenance==="assistant-answer"?"沿用已完成的 AI 回答":"需求草稿，尚無可匯出的正文"}</p>
      <p>{handoff.request}</p>
      {handoff.provenance==="brief-only"&&<button type="button" onClick={()=>window.dispatchEvent(new CustomEvent("vanilla-orchestra-compose",{detail:handoff}))}>交給 AI 撰寫內容草稿</button>}
      <small>AI 文字由使用者審查後才匯出；不會把任務文字冒充完成作品。</small>
    </div>}
    <h2><FileText size={18}/> 建立製作工作</h2>
    <label>作品標題<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)}/></label>
    <label>內容／CREAM 結果<textarea rows={10} maxLength={50000} value={body} onChange={e=>setBody(e.target.value)} placeholder={"# 摘要\n輸入正式報告、簡報、版面或設計工作的內容…"} /></label>
    <button type="button" disabled={busy||!body.trim()||body.trim().length>8000} onClick={()=>window.dispatchEvent(new CustomEvent("vanilla-open-erya",{detail:{body}}))}>爾雅 Erya · 送至聊天潤稿</button>
    <small>原文先放入聊天草稿，由你確認後傳送；不會在此自動呼叫雲端 API。一次最多 8,000 字。</small>
    <label>輸出格式<select value={format} onChange={e=>setFormat(e.target.value as OrchestraFormat)}>
     {meta.formats.map(f=><option value={f} key={f}>{f.toUpperCase()}</option>)}
    </select></label>
    {local?<button type="button" className="orchestra-export" disabled={busy||!body.trim()} onClick={()=>void makeLocal()}>
      <Download size={16}/> {creamSvg?"使用 CREAM 匯出 SVG 數線圖":"使用 Retina 本機匯出 "+format.toUpperCase()}
    </button>:studioLocal?<LocalCraftPanel key={tool} tool={tool} format={format} title={title} body={body} privateMode={privateMode}/>:<p className="orchestra-pending">目前沒有可執行的 {format.toUpperCase()} 匯出器，已保留 {meta.name} 整合位置。</p>}
    {tool==="pdfcraft"&&<div className="orchestra-remote">
      <strong>PdfCraft · 原生 PDF 合併（選用）</strong>
      <p>請選擇 2–3 個本機 PDF，每份不超過 2 MB。需要家庭登入與單次明確同意。若啟用獨立 Linux Worker，檔案會經衞國後端以 HTTPS 轉送至該節點處理；不會存入衞國任務資料庫，也不是手機上的本機合併。</p>
      <input type="file" aria-label="選取 2 到 3 份 PDF" accept="application/pdf,.pdf" multiple disabled={busy||privateMode}
       onChange={e=>{const next=Array.from(e.target.files||[]);
        if(next.length>3){setPdfFiles([]);setStatus("一次最多 3 份 PDF");}else{setPdfFiles(next);setStatus("");}
        e.target.value="";}}/>
      <small>已選 {pdfFiles.length} 份 PDF：{pdfFiles.map(f=>f.name).join("、")||"無"}</small>
      <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> 我同意將本次選取的 PDF 傳送至受控衞國後端進行合併</label>
      <button type="button" disabled={busy||privateMode||!backendPdfcraft||!consent||pdfFiles.length<2||
        pdfFiles.length>3||!weiGuoApiBase()||!weiGuoIdentity()} onClick={()=>void makePdfcraft()}>
        合併並下載 PDF
      </button>
      {!backendPdfcraft&&<p>後端尚未確認 PdfCraft 安全配置。原生合併暫不可使用。</p>}
    </div>}
    {tool==="wordcraft"&&<div className="orchestra-remote"><strong>WordCraft 原生後端（選用）</strong>
      <p>需安裝並隔離 WordCraft CLI、完成衞國家庭登入。此操作會將本次文字傳送到你設定的衞國後端。未安裝時會明確回報不可用。</p>
      <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> 同意此次將文件內容送交衞國後端</label>
      <button type="button" disabled={busy||privateMode||!consent||!body.trim()||!backendWordcraft||!weiGuoApiBase()||!weiGuoIdentity()} onClick={()=>void makeWordcraft()}>透過 WordCraft 產製 {format.toUpperCase()}</button>
      {(!weiGuoApiBase()||!weiGuoIdentity())&&<p>請先設定並登入「衞國系統」，才能測試選用 WordCraft 後端。</p>}
      {!backendWordcraft&&<p>目前未取得後端 WordCraft 可用配置；不能執行原生轉檔。可使用本機 Retina。</p>}
    </div>}
    <CanvaPanel initialPrompt={handoff?.request||initialBody||""}/>
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
}
