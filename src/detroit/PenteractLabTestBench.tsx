import {useEffect,useMemo,useState} from "react";
import {evaluatePenteractLabBatch,type LabResult} from "./penteract-lab-contract";

declare global {
 interface Window {
  /** Read-only test adapter exposed ONLY while the 5D lab is mounted. */
  __vanilla5dLab?:Readonly<{
   version:1;
   evaluate:(request:unknown)=>LabResult;
  }>;
 }
}
const SAMPLE=JSON.stringify({version:1,cases:[
 {id:"finance_01",question:"分析這檔 ETF 的投資報酬及現金流",expectedCandidate:"finance"},
 {id:"code_01",question:"修復 TypeScript 函式中的錯誤",expectedCandidate:"code"},
 {id:"mixed_01",question:"同時寫報告並分析財報",expectedCandidate:null},
 {id:"unknown_01",question:"晚安",expectedCandidate:null}
]},null,2);

/** No tool runner, credentials, network, or persistence. DOM/JS test entry. */
export default function PenteractLabTestBench(){
 const [input,setInput]=useState(SAMPLE);
 const [report,setReport]=useState<LabResult|null>(null);
 const [error,setError]=useState("");
 useEffect(()=>{
  const adapter=Object.freeze({version:1 as const,evaluate:evaluatePenteractLabBatch});
  window.__vanilla5dLab=adapter;
  return ()=>{if(window.__vanilla5dLab===adapter)delete window.__vanilla5dLab;};
 },[]);
 const json=useMemo(()=>report?JSON.stringify(report,null,2):"",[report]);
 function run(){
  setReport(null);setError("");
  try{
   if(input.length>35000)throw Error("測試資料超過 35 KB");
   setReport(evaluatePenteractLabBatch(JSON.parse(input)));
  }catch(e){setError(e instanceof Error?e.message:String(e));}
 }
 function download(){
  if(!report)return;
  const blob=new Blob([json],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download="atuber-5d-shadow-report.json";
  a.click();
  URL.revokeObjectURL(url);
 }
 return <section className="october-5d-demo" aria-label="五維測試工具入口" data-testid="atuber-5d-lab">
  <div className="october-5d-heading"><strong>05 · 5D Test Gateway</strong><small>離線 · 唯讀 · 不調用模型或工具</small></div>
  <p className="october-5d-note">給測試工具使用的固定入口：<code>?lab=5d</code>。支援填入 JSON 測例、執行本機影子路由及下載 JSON 結果。自動化測試可在此分頁以 <code>window.__vanilla5dLab.evaluate(request)</code> 呼叫相同的純計算合約。</p>
  <label htmlFor="atuber-5d-test-input">測試資料（JSON · 最多 48 筆；ID、question、expectedCandidate）</label>
  <textarea id="atuber-5d-test-input" data-testid="atuber-5d-cases" spellCheck={false} rows={11} maxLength={35000} value={input} onChange={e=>setInput(e.target.value)}/>
  <div className="october-5d-controls">
   <button type="button" className="detroit-primary" data-testid="atuber-5d-run" onClick={run}>執行本機測試</button>
   <button type="button" disabled={!report} onClick={download}>匯出 JSON 報告</button>
  </div>
  {error&&<p role="alert" data-testid="atuber-5d-error">測例格式錯誤：{error}</p>}
  {report&&<div data-testid="atuber-5d-results" role="status">
   <div className="october-5d-stats">
    <div><strong>{report.total}</strong><small>已評估測例</small></div>
    <div><strong>{report.scored===0?"—":report.matched+"/"+report.scored}</strong><small>符合預期（非模型準確率）</small></div>
    <div><strong>{Math.round(report.coverage*100)}%</strong><small>影子候選覆蓋率</small></div>
   </div>
   <pre data-testid="atuber-5d-json" style={{whiteSpace:"pre-wrap",wordBreak:"break-word",fontSize:"12px",maxHeight:"260px",overflow:"auto"}}>{json}</pre>
   <p className="october-5d-note">不保存問題原文；僅輸出 ID、幾何候選及驗證欄位。測試答案不授予 Diana、Ceres、Slime 或後端任何權限。</p>
  </div>}
 </section>;
}
