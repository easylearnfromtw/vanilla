import { useState } from "react";
import type { ProjectCorpus } from "./project-core";
import { runCodeAnalysis, type AnalyzeCodeReport } from "../lib/runCodeAnalysis";
import { driveSession } from "../workspace/cloud-drive";

export default function CodeIntelligencePanel({corpora}:{corpora:ProjectCorpus[]}) {
 const [repo,setRepo]=useState("");
 const [report,setReport]=useState<AnalyzeCodeReport|null>(null);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const selected=corpora.find(x=>x.repo===repo);
 async function analyze(save:boolean) {
  if (!selected) return;
  if (save&&!driveSession()) {setStatus("請先連接 Google Drive，才能保存分析紀錄");return;}
  setBusy(true);setStatus("");setReport(null);
  try {
   // Project Hub only retains excerpts, not complete files: never present this as a full repo audit.
   const files=selected.files.map(f=>({path:f.path,content:f.excerpt}));
   const result=await runCodeAnalysis({repository:selected.repo,revision:selected.updatedAt,files,mode:save?"save":"preview"});
   setReport(result);
   setStatus(save?"已儲存至目前 Google 帳號的 Vanilla Workspace":"僅在本次頁面預覽，未上傳分析結果");
  } catch(e) {setStatus("分析未完成："+String(e instanceof Error?e.message:e));}
  finally {setBusy(false);}
 }
 return <section className="project-hub-panel" aria-label="Code Intelligence">
  <div className="project-hub-heading"><strong>Code Intelligence · 演算法與程式碼分析</strong></div>
  <p>分析已索引的程式碼片段，辨識演算法模式與安全風險。索引可能省略原始碼，結果不能視為完整專案審計。</p>
  <label>選擇專案
   <select value={repo} onChange={e=>{setRepo(e.target.value);setReport(null);}}>
    <option value="">選擇已索引專案</option>
    {corpora.map(c=><option key={c.id} value={c.repo}>{c.repo}</option>)}
   </select>
  </label>
  <div className="project-hub-actions">
   <button type="button" disabled={busy||!selected} onClick={()=>void analyze(false)}>本機預覽分析</button>
   <button type="button" disabled={busy||!selected} onClick={()=>void analyze(true)}>分析並儲存 Google Drive</button>
  </div>
  {status&&<p role="status">{status}</p>}
  {report&&<div aria-live="polite">
   <p>分析 {selected?.files.length||0} 個索引片段 · {report.insights.length} 項可能的演算法模式 · {report.snapshot.findings.length} 項規則警示</p>
   {report.previousRevision&&<p>比較基準：{report.previousRevision}；新增 {report.trends.filter(x=>x.status==="new").length}、持續 {report.trends.filter(x=>x.status==="persistent").length}、解決 {report.trends.filter(x=>x.status==="resolved").length}</p>}
   {report.insights.map((x,i)=><details key={x.path+x.pattern+i}>
    <summary>{x.path} · {x.pattern}（啟發式辨識）</summary>
    <p>{x.explanation}</p><p>複雜度：{x.complexity}</p>
    <ul>{x.evidence.map((ev,j)=><li key={j}>第 {ev.line} 行（索引片段行號）：<code>{ev.text}</code></li>)}</ul>
    <p>驗證問題：{x.questions.join("；")}</p>
   </details>)}
   {report.snapshot.findings.map((f,i)=><details key={i}>
    <summary>{f.severity} · {f.path}:{f.line} · {f.title}</summary><p>{f.explanation}</p><p>{f.suggestion}</p>
   </details>)}
   {report.warnings.map((w,i)=><p key={i}>{w}</p>)}
  </div>}
 </section>;
}
