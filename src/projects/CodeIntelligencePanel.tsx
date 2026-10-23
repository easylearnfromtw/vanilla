import { useState } from "react";
import type { ProjectCorpus } from "./project-core";
import { safeProjectPath } from "./project-core";
import { readOwnedGitHubSourceBySha } from "./github-projects";
import { runCodeAnalysis, codeRevision, type AnalyzeCodeReport } from "../lib/runCodeAnalysis";
import type { AnalysisSnapshot } from "../lib/codeAnalysisHistory";
import type { SourceFile } from "../lib/algorithmCodeAnalyzer";
import { GoogleDriveCodeAnalysisHistoryStore } from "../lib/googleDriveCodeAnalysisHistory";
import { driveSession } from "../workspace/cloud-drive";
import { extractDependencyEdges, type DependencyEdge } from "../lib/codeArchitecture";
import "./code-intelligence.css";

const EXT=/\.(?:[cm]?[jt]sx?|py|java|go|rs|cpp|cc|c|h)$/i;
const LIMIT=12;
function message(error:unknown):string { return error instanceof Error?error.message:String(error); }
export default function CodeIntelligencePanel({corpora}:{corpora:ProjectCorpus[]}) {
 const [repo,setRepo]=useState("");
 const [uploads,setUploads]=useState<File[]>([]);
 const [report,setReport]=useState<AnalyzeCodeReport|null>(null);
 const [history,setHistory]=useState<AnalysisSnapshot[]>([]);
 const [edges,setEdges]=useState<DependencyEdge[]>([]);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const selected=corpora.find(x=>x.repo===repo);
 const repository=uploads.length?"local:uploads":selected?.repo||"";
 const available=Boolean(uploads.length||selected?.source==="github");
 const sourceName=uploads.length?"本機上傳原始碼":selected?.source==="github"?"GitHub 精確 SHA 原始碼":"無";

 async function collectSource():Promise<SourceFile[]> {
  if(uploads.length){
   const selectedFiles=uploads.slice(0,LIMIT);
   const data:SourceFile[]=[];
   for(const file of selectedFiles){
    const path=safeProjectPath(file.name);
    if(!EXT.test(path))continue;
    if(file.size>250000)throw Error(path+" 超過 250 KB");
    data.push({path,content:await file.text()});
   }
   if(!data.length)throw Error("請選擇可分析的程式碼檔案");
   return data;
  }
  if(!selected||selected.source!=="github")throw Error("請重新選擇 GitHub 專案，或直接上傳完整程式碼");
  const paths=selected.files.filter(f=>EXT.test(f.path));
  if(!paths.length)throw Error("目前的專案索引沒有可分析的程式檔案");
  const files:SourceFile[]=[];
  // Small bounded batches respect GitHub's unauthenticated public API quota.
  for(let i=0;i<paths.length;i+=3){
   const batch=paths.slice(i,i+3);
   setStatus("正在讀取 GitHub 原始碼 "+Math.min(i+batch.length,paths.length)+"/"+paths.length);
   const results=await Promise.all(batch.map(async file=>{
    if(!file.sha)throw Error(file.path+" 缺少檔案 SHA，請在 Project Hub 重新索引");
    return readOwnedGitHubSourceBySha(selected.repo,file.path,file.sha);
   }));
   files.push(...results.map(x=>({path:x.path,content:x.content})));
  }
  return files;
 }
 async function analyze(save:boolean){
  if(!available||!repository||busy)return;
  if(save&&!driveSession()){setStatus("請先使用頁面上的 Google 登入，再選擇雲端儲存");return;}
  setBusy(true);setStatus("");setReport(null);setEdges([]);
  try{
   const files=await collectSource();
   const revision=await codeRevision(files);
   const result=await runCodeAnalysis({repository,revision,files,mode:save?"save":"preview"});
   setReport(result);
   setEdges(extractDependencyEdges(files).slice(0,80));
   setStatus(result.alreadySaved?"雲端已有相同版本；未重複儲存":
    result.saved?"分析快照已儲存至目前登入的 Google Drive":
    "分析完成：僅保留本次預覽，未寫入雲端");
  }catch(e){setStatus("分析失敗："+message(e));}
  finally{setBusy(false);}
 }
 async function loadHistory(){
  if(!repository||busy)return;
  if(!driveSession()){setStatus("請先登入 Google 才能讀取歷史紀錄");return;}
  setBusy(true);setStatus("");
  try{
   const snapshots=await new GoogleDriveCodeAnalysisHistoryStore().list(repository);
   setHistory(snapshots);
   setStatus("已讀取 "+snapshots.length+" 份雲端歷史紀錄");
  }catch(e){setStatus("讀取歷史失敗："+message(e));}
  finally{setBusy(false);}
 }
 function changeRepository(value:string){setRepo(value);setUploads([]);setHistory([]);setReport(null);setEdges([]);setStatus("");}
 function changeFiles(value:FileList|null){
  setUploads(Array.from(value||[]).slice(0,LIMIT));
  setRepo("");setHistory([]);setReport(null);setEdges([]);setStatus("");
 }
 return <section className="project-hub-panel ci-panel" aria-label="Code Intelligence" id="code-intelligence">
  <div className="ci-topline"><span className="ci-eyebrow">VANILLA / CODE INTELLIGENCE</span><span className="ci-chip">LOCAL-FIRST</span></div>
  <h3>理解程式碼，而不只是找錯誤</h3>
  <p>以演算法框架、風險分析、架構關係及歷史版本，建立可追溯的專案理解。所有模式判斷都是啟發式線索，不代表已執行程式或證明正確性。</p>
  <div className="ci-inputs">
   <label htmlFor="ci-repo">GitHub 專案</label>
   <select id="ci-repo" value={repo} disabled={busy} onChange={event=>changeRepository(event.target.value)}>
    <option value="">選擇已索引專案</option>
    {corpora.filter(c=>c.source==="github").map(c=><option key={c.id} value={c.repo}>{c.repo}</option>)}
   </select>
   <label className="ci-upload" htmlFor="ci-code-files">或直接提供完整原始碼（最多 12 檔，每檔 250 KB）
    <input id="ci-code-files" type="file" multiple disabled={busy}
     accept=".ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.go,.rs,.java,.cpp,.cc,.c,.h"
     onChange={e=>{changeFiles(e.target.files);e.target.value="";}}/>
   </label>
   <small>目前來源：{sourceName}。GitHub 分析使用已索引 SHA 的完整檔案，而非摘要；不執行任何上傳或下載的程式碼。</small>
  </div>
  <div className="ci-actions">
   <button type="button" disabled={!available||busy} onClick={()=>void analyze(false)}>預覽分析</button>
   <button type="button" disabled={!available||busy} onClick={()=>void analyze(true)}>分析並儲存 Google Drive</button>
   <button type="button" disabled={!repository||busy} onClick={()=>void loadHistory()}>載入歷史紀錄</button>
  </div>
  {status&&<p className="ci-status" role="status">{status}</p>}
  {report&&<div className="ci-results" aria-live="polite">
   <div className="ci-metrics">
    <div><strong>{report.snapshot.analyzedPaths?.length||0}</strong><span>檔案</span></div>
    <div><strong>{report.insights.length}</strong><span>演算法線索</span></div>
    <div><strong>{report.snapshot.findings.length}</strong><span>規則警示</span></div>
    <div><strong>{report.trends.filter(x=>x.status==="resolved").length}</strong><span>已解決（已掃描範圍）</span></div>
   </div>
   <small>內容指紋：{report.snapshot.revision.slice(0,20)}…；規則掃描不等於漏洞證明。未掃描檔案不會被判定為已修復。</small>
   {report.previousRevision&&<p>上次不同版本：{report.previousRevision.slice(0,20)}…；新增 {report.trends.filter(x=>x.status==="new").length}，持續 {report.trends.filter(x=>x.status==="persistent").length}。</p>}
   <div className="ci-results-grid">
    <div><h4>演算法學習</h4>
     {report.insights.length?report.insights.map((item,i)=><details key={item.path+item.pattern+i}>
      <summary><span>{item.pattern}</span><small>{item.path}</small></summary>
      <p>{item.explanation}</p><p><strong>複雜度：</strong>{item.complexity}</p>
      <ul>{item.evidence.map((e,j)=><li key={j}>L{e.line} <code>{e.text}</code></li>)}</ul>
      <p><strong>驗證重點：</strong>{item.questions.join("；")}</p>
     </details>):<p>目前沒有符合預設模式的證據，不能推論程式不存在演算法。</p>}
    </div>
    <div><h4>風險與建議</h4>
     {report.snapshot.findings.length?report.snapshot.findings.map((item,i)=><details key={item.path+i}>
      <summary>{item.severity.toUpperCase()} · {item.title} <small>{item.path}:{item.line}</small></summary>
      <p>{item.explanation}</p><p>{item.suggestion}</p>
     </details>):<p>未觸發內建規則；這不表示程式已通過完整安全審查。</p>}
     <h4>模組依賴</h4>
     {edges.length?<ul className="ci-deps">{edges.slice(0,30).map((edge,i)=><li key={i}><code>{edge.from}</code> → <code>{edge.to}</code></li>)}</ul>:<p>此次檔案沒有可辨識的靜態 import / require 關係。</p>}
    </div>
   </div>
   {report.warnings.map((w,i)=><p key={i} className="ci-status">{w}</p>)}
  </div>}
  {history.length>0&&<div className="ci-history"><h4>Google Drive 版本歷史</h4>
   {history.slice(0,15).map(h=><div className="ci-history-entry" key={h.id}>
    <span>{new Date(h.createdAt).toLocaleString("zh-TW")}</span>
    <strong>{h.findings.length} 個警示 · {h.patterns?.length||0} 個演算法模式</strong>
    <code>{h.revision.slice(0,18)}…</code>
   </div>)}
  </div>}
  <p className="ci-footnote">雲端保存包含專案識別、掃描範圍、演算法類型、風險標題與路徑，不包含完整原始碼。預覽不需 Google Drive；儲存與讀取歷史需使用者主動操作。私人儲存庫未經授權不會擷取。</p>
 </section>;
}
