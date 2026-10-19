import {useEffect,useState} from "react";
import {BrainCircuit,Download,RefreshCcw,ChevronDown} from "lucide-react";
import {noodlesSummary,modelStats,NOODLES_ISSUES,type NoodlesTask} from "./core";
import {readNoodles,noodlesScopeLabel,setNoodlesEnabled,resetNoodles,exportNoodlesSummary} from "./storage";
import "./noodles.css";
const TASKS:{id:NoodlesTask;label:string}[]=[
 {id:"general",label:"一般"},{id:"casual",label:"日常"},{id:"analysis",label:"分析"},
 {id:"code",label:"程式"},{id:"writing",label:"寫作"},{id:"vision",label:"圖像"}];
export default function NoodlesPanel({privateMode}:{privateMode:boolean}){
 const [expanded,setExpanded]=useState(false),[state,setState]=useState(readNoodles);
 const [task,setTask]=useState<NoodlesTask>("analysis");
 useEffect(()=>{
  const listener=()=>setState(readNoodles());
  window.addEventListener("vanilla-noodles-changed",listener);
  window.addEventListener("vanilla-drive-connected",listener);
  window.addEventListener("vanilla-drive-disconnected",listener);
  return()=>{
   window.removeEventListener("vanilla-noodles-changed",listener);
   window.removeEventListener("vanilla-drive-connected",listener);
   window.removeEventListener("vanilla-drive-disconnected",listener);
  };
 },[]);
 const overview=noodlesSummary(state);
 function saveMetadata(){
  const a=document.createElement("a");
  const url=URL.createObjectURL(new Blob([exportNoodlesSummary()],{type:"application/json"}));
  a.href=url;a.download="NOODLES_匿名模型表現.json";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className="noodles-box" aria-label="NOODLES 跨模型持續改善">
  <button type="button" className="noodles-toggle" onClick={()=>setExpanded(x=>!x)} aria-expanded={expanded}>
   <BrainCircuit size={16}/><strong>NOODLES</strong><span>跨模型回饋學習 · {privateMode?"私密模式暫停":state.enabled?"已啟用":"已停用"}</span><ChevronDown size={15}/>
  </button>
  {expanded&&<div className="noodles-content">
   <p>NOODLES 在每次已授權的模型呼叫後學習可觀測的執行表現，並使用你對回答的明確評價微調後續模型排序與回答策略。適用 WebLLM、Ollama、Gemini、DeepSeek；**不會**更改第三方模型的權重。</p>
   <small>記錄範圍：{noodlesScopeLabel()} · {privateMode?"目前私密模式不記錄，也不使用個人優化資料。":"只記錄模型、任務類別、成功失敗、耗時、評價類型，不儲存訊息原文。"} </small>
   <div className="noodles-metrics">
    <span><strong>{overview.totalTurns}</strong>已觀察對話</span>
    <span><strong>{overview.totalRuns}</strong>模型呼叫</span>
    <span><strong>{overview.humanRatings}</strong>主動評價</span>
    <span><strong>{overview.failedRuns}</strong>呼叫失敗</span>
   </div>
   <div className="noodles-actions">
    <label><input type="checkbox" checked={state.enabled} disabled={privateMode} onChange={e=>setNoodlesEnabled(e.target.checked)}/>啟用 NOODLES 本機自適應</label>
    <button type="button" onClick={saveMetadata}><Download size={13}/>匯出匿名統計</button>
    <button type="button" onClick={()=>{if(window.confirm("確定清除這個帳號在此裝置的 NOODLES 學習紀錄？不會刪除聊天或模型。"))resetNoodles();}}><RefreshCcw size={13}/>清除學習</button>
   </div>
   <label className="noodles-task">分析哪類任務？ <select value={task} onChange={e=>setTask(e.target.value as NoodlesTask)}>{TASKS.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
   {overview.models.length>0?<div className="noodles-table"><table><thead><tr><th>模型</th><th>任務執行</th><th>明確好評</th><th>本機路由微調</th></tr></thead><tbody>{overview.models.map(m=>{
    const stat=modelStats(state,task,m.id);
    // Show task-specific numbers rather than incorrectly merging unrelated tasks.
    const recentRating=stat.ratings?stat.likes+"/"+stat.ratings:"—";
    return <tr key={m.id}><td title={m.id}>{m.id}</td><td>{stat.successes}/{stat.attempts}</td><td>{recentRating}</td><td>{stat.ratings<3?"證據不足":stat.likes*2>=stat.ratings?"偏好較高":"尚待改善"}</td></tr>;
   })}</tbody></table></div>:<p className="noodles-hint">目前沒有模型紀錄；開始對話並對答案按讚／倒讚後，才會逐步形成有意義的評估。</p>}
   <p className="noodles-hint">評估原則：一次執行成功不等於答案正確；只有你的評價才作為品質訊號。改善的類型可透過回答下方的「NOODLES 問題」選單標記。#{NOODLES_ISSUES.length} 種原因分類；全部改善都不得覆蓋當次指令、安全限制或跨帳戶隱私。</p>
  </div>}
 </section>;
}
