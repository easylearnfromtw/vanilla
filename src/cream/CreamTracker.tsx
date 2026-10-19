import {useCallback,useEffect,useState} from "react";
import {Activity,TrendingUp,Trash2,RefreshCcw} from "lucide-react";
import {creamLongitudinalReport,creamOwner,removeCreamSnapshot,updateCreamGoal} from "./longitudinal-store";
import type {CreamTrend,CreamSnapshot,CreamGoal} from "./longitudinal";
import "./tracker.css";
const initial={trends:[] as CreamTrend[],snapshots:[] as CreamSnapshot[],goals:[] as CreamGoal[]};
function fmt(v:number):string{return Number.isFinite(v)?Number(v.toFixed(3)).toLocaleString("zh-TW"):"—";}
function TrendPlot({trend}:{trend:CreamTrend}){
 const data=trend.points.slice(-100),values=data.map(x=>x.value);
 const min=Math.min(...values),max=Math.max(...values),range=Math.max(max-min,0.000001);
 const points=data.length===1?"10,58":data.map((p,i)=>(10+(i/(data.length-1))*340).toFixed(2)+","+(96-((p.value-min)/range)*80).toFixed(2)).join(" ");
 return <svg viewBox="0 0 360 112" role="img" aria-label={trend.metric+" 自 "+trend.firstDate+" 至 "+trend.lastDate+" 數值走勢"}>
  <line x1="10" y1="96" x2="350" y2="96" stroke="#ded9d3"/>
  {data.length>1&&<polyline points={points} fill="none" stroke="#b34d3d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
  {data.length===1&&<circle cx="10" cy="58" r="4" fill="#b34d3d"/>}
  <text x="10" y="109" fontSize="9" fill="#777">{trend.firstDate}</text>
  <text x="350" y="109" textAnchor="end" fontSize="9" fill="#777">{trend.lastDate}</text>
 </svg>;
}
export default function CreamTracker(){
 const [report,setReport]=useState(initial),[busy,setBusy]=useState(false),[status,setStatus]=useState(""),
 [targetName,setTargetName]=useState(""),[targetUnit,setTargetUnit]=useState(""),
 [targetValue,setTargetValue]=useState(""),[direction,setDirection]=useState<CreamGoal["direction"]>("decrease");
 const refresh=useCallback(async()=>{
  setBusy(true);
  try{setReport(await creamLongitudinalReport());setStatus("");}
  catch(e){setStatus("無法讀取長期資料："+String(e));}
  finally{setBusy(false);}
 },[]);
 useEffect(()=>{void refresh();const h=()=>void refresh();window.addEventListener("vanilla-cream-updated",h);
  return()=>window.removeEventListener("vanilla-cream-updated",h);},[refresh]);
 async function saveGoal(){
  const target=Number(targetValue);
  try{if(!targetName.trim()||!targetValue.trim()||!Number.isFinite(target))throw Error("請填入合法的指標與目標數值");
   await updateCreamGoal({metric:targetName.trim(),unit:targetUnit.trim(),target,direction});await refresh();
   setStatus("已保存量測目標；變化建議會以實際資料品質與目標差距為依據。");
  }catch(e){setStatus(String(e));}
 }
 async function remove(snapshot:CreamSnapshot){
  if(!window.confirm("確定刪除這次 CREAM 追蹤資料「"+snapshot.source+"」？只會刪除這次匯入的數據，不會刪除原始附件。"))return;
  try{await removeCreamSnapshot(snapshot.id);await refresh();setStatus("已從本機 CREAM 追蹤庫確認刪除「"+snapshot.source+"」");}
  catch(e){setStatus("刪除失敗："+String(e));}
 }
 return <section className="cream-tracker">
  <header className="cream-tracker-head"><div><small>CREAM / LONGITUDINAL INTELLIGENCE</small><h2>長期資料追蹤</h2>
   <p>保存真實數據、核對來源、比較期間變化、追蹤目標與規劃下次觀測。匯入時自動加入，不必每次重新輸入。</p></div>
   <button type="button" disabled={busy} onClick={()=>void refresh()}><RefreshCcw size={14}/>重新整理</button></header>
  <div className="cream-tracker-overview">
   <div><strong>{report.snapshots.length}</strong><small>已匯入批次</small></div>
   <div><strong>{report.trends.length}</strong><small>追蹤指標</small></div>
   <div><strong>{report.trends.reduce((a,b)=>a+b.count,0)}</strong><small>有效觀測</small></div>
   <div><strong>{report.trends.filter(x=>x.uniqueDates>=3).length}</strong><small>可評估趨勢</small></div>
  </div>
  {report.trends.length?<div className="cream-tracker-grid">{report.trends.map((t,i)=><article key={t.metric+"|"+t.unit+"|"+i} className="cream-tracker-card">
   <div className="cream-tracker-title"><span><Activity size={15}/>{t.metric} {t.unit&&<small>({t.unit})</small>}</span>
    <small>{t.direction==="rising"?"上升趨勢":t.direction==="falling"?"下降趨勢":t.direction==="stable"?"大致持平":"資料不足"}</small></div>
   <div className="cream-tracker-main"><strong>{fmt(t.latest)}</strong><span>{t.change>=0?"+":""}{fmt(t.change)}
    {t.changePercent!==null?"（"+fmt(t.changePercent)+"%）":""}</span></div>
   <TrendPlot trend={t}/>
   <p>{t.insights.join("；")}</p>
   {t.goal&&<p className="cream-tracker-goal">目標：{fmt(t.goal.target)} · {t.goal.met?"已達標":"尚未達標"}</p>}
   {t.quality.length>0&&<div className="cream-tracker-alert">{t.quality.join("；")}</div>}
   <details><summary>資料來源、規劃與建議</summary>
    {t.recommendations.map((v,i)=><p key={i}>{i+1}. {v}</p>)}
    <small>觀測資料：{t.count} 筆，{t.uniqueDates} 個日期；來源：{[...new Set(t.points.map(p=>p.source))].slice(0,5).join("、")}</small>
    <div className="cream-tracker-data">{t.points.slice(-15).map((x,i)=><div key={i}><time>{x.date}</time><span>{fmt(x.value)}</span></div>)}</div>
   </details>
  </article>)}</div>:<div className="cream-tracker-empty"><TrendingUp size={22}/><strong>目前沒有可追蹤的歷史指標</strong>
   <p>到 AI 對話上傳帶有日期與數值的 CSV、Excel、PDF 表格，或貼上「2026-10-19 體重: 75 kg」等明確量測資料，即可累積真實追蹤。</p></div>}
  <details className="cream-tracker-panel"><summary>設定量化目標</summary>
   <div className="cream-tracker-form"><label>指標<select value={targetName} onChange={e=>{setTargetName(e.target.value);const found=report.trends.find(t=>t.metric===e.target.value);if(found)setTargetUnit(found.unit);}}>
    <option value="">選擇指標</option>{report.trends.map(t=><option key={t.metric+t.unit} value={t.metric}>{t.metric}（{t.unit||"無單位"}）</option>)}</select></label>
    <label>目標數值<input type="number" step="any" value={targetValue} onChange={e=>setTargetValue(e.target.value)}/></label>
    <label>方向<select value={direction} onChange={e=>setDirection(e.target.value as CreamGoal["direction"])}><option value="decrease">下降至目標</option><option value="increase">上升至目標</option><option value="maintain">維持在目標附近</option></select></label>
    <button type="button" onClick={()=>void saveGoal()}>保存目標</button>
   </div>
  </details>
  <details className="cream-tracker-panel"><summary>管理匯入來源（{report.snapshots.length}）</summary>
   {report.snapshots.map(s=><div key={s.id} className="cream-tracker-source"><div><strong>{s.source}</strong><small>{s.importedAt.slice(0,10)} · {s.observations.length} 筆觀測 · {s.rowsAnalyzed} 列</small></div>
    <button type="button" disabled={busy} onClick={()=>void remove(s)} aria-label={"刪除追蹤匯入 "+s.source}><Trash2 size={15}/>刪除</button>
    {!!s.warnings.length&&<p>{s.warnings.join("；")}</p>}</div>)}
  </details>
  <p className="cream-tracker-foot">個人空間：{creamOwner()}。數據只存於本瀏覽器 IndexedDB，非雲端備份。所有結論是數據描述和規劃提示，不代替專業醫療／投資判斷。</p>
  {status&&<p className="cream-tracker-status" role="status">{status}</p>}
 </section>;
}
