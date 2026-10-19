import {useCallback,useEffect,useMemo,useState} from "react";
import {Activity,ArrowDownToLine,BarChart3,FileUp,Trash2,RefreshCw,Target} from "lucide-react";
import {fromCreamRows,parseCreamCSV} from "./core";
import {extractTextMeasurements,numberValue,type CreamTrend,type SeriesDirection} from "./longitudinal";
import {creamOrchestraBrief} from "../orchestra/core";
import {persistCreamDataset,longitudinalReport,removeCreamSnapshot,saveCreamGoal,exportCreamHistory} from "./history-store";
import {extractBrowserDocument} from "../local-ai/document-extract";
import {attachmentOwner} from "../library/attachment-vault";
import {signedChatAccount} from "../vault/chat-sync";
import "./longitudinal.css";
function TrendGraph({trend}:{trend:CreamTrend}){
 const pts=trend.points.slice(-90);
 if(pts.length<2)return <p className="cream-long-empty">新增第二個不同日期的數據後，這裡會出現時間走勢。</p>;
 const min=Math.min(...pts.map(p=>p.value)),max=Math.max(...pts.map(p=>p.value));
 const range=Math.max(1e-9,max-min),left=34,top=20,w=590,h=170;
 const d1=Date.parse(pts[0].date+"T00:00:00Z"),d2=Date.parse(pts[pts.length-1].date+"T00:00:00Z");
 const xd=Math.max(1,d2-d1);
 const x=(s:string)=>left+(Date.parse(s+"T00:00:00Z")-d1)/xd*w;
 const y=(v:number)=>top+(max-v)/range*h;
 const line=pts.map((p,i)=>(i?"L":"M")+x(p.date).toFixed(1)+" "+y(p.value).toFixed(1)).join(" ");
 return <div className="cream-trend-graph" aria-label={trend.metric+" 歷史趨勢"} role="img">
  <svg viewBox="0 0 670 230" preserveAspectRatio="xMidYMid meet">
   <line x1={left} y1={top+h} x2={left+w} y2={top+h} stroke="currentColor" opacity=".2"/>
   <line x1={left} y1={top} x2={left+w} y2={top} stroke="currentColor" opacity=".15"/>
   <path d={line} fill="none" stroke="#b24737" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round"/>
   {pts.slice(-35).map((p,i)=><circle key={p.date+":"+i} cx={x(p.date)} cy={y(p.value)} r={pts.length>35?2.1:3.1} fill="#b24737">
    <title>{p.date+"："+p.value+" "+trend.unit+" · "+p.source}</title>
   </circle>)}
   <g fill="currentColor" opacity=".68" fontSize="11" fontFamily="sans-serif">
    <text x="4" y={top+4}>{max.toFixed(2)}</text><text x="4" y={top+h}>{min.toFixed(2)}</text>
    <text x={left} y="213">{pts[0].date}</text><text x={left+w} y="213" textAnchor="end">{pts[pts.length-1].date}</text>
   </g>
  </svg>
 </div>;
}
function saveText(filename:string,contents:string){
 const url=URL.createObjectURL(new Blob([contents],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function CreamLongitudinal({isPrivate=false}:{isPrivate?:boolean}){
 const owner=attachmentOwner(signedChatAccount());
 const [report,setReport]=useState<Awaited<ReturnType<typeof longitudinalReport>>|null>(null);
 const [notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[raw,setRaw]=useState("");
 const [goalValue,setGoalValue]=useState(""),[direction,setDirection]=useState<SeriesDirection>("increase"),[due,setDue]=useState("");
 const [selected,setSelected]=useState("");
 const refresh=useCallback(async()=>{try{const result=await longitudinalReport(owner);setReport(result);}
 catch(e){setNotice("CREAM 歷史載入失敗："+String(e));}},[owner]);
 useEffect(()=>{void refresh();const listener=()=>void refresh();window.addEventListener("vanilla-cream-history-updated",listener);
  return()=>window.removeEventListener("vanilla-cream-history-updated",listener);
 },[refresh]);
 const active=report?.trends.find(x=>x.metric+"\u0000"+x.unit===selected)||report?.trends[0];
 const choices=report?.trends||[];
 async function importRows(rows:ReturnType<typeof fromCreamRows>){
  setBusy(true);try{
   const outcome=await persistCreamDataset(rows,owner);await refresh();
   setNotice((outcome.created?"已永久保存新資料":"相同資料已存在，未重複匯入")+"：「"+rows.source+"」 "+
    outcome.snapshot.observations.length+" 筆指標觀察。");
  }catch(e){setNotice("CREAM 匯入失敗："+String(e));}finally{setBusy(false);}
 }
 async function importFile(file?:File){
  if(!file)return;
  if(isPrivate){setNotice("私密模式不保存長期資料");return;}
  setBusy(true);setNotice("");
  try{
   if(/\.(?:csv|tsv)$/i.test(file.name)){await importRows(parseCreamCSV(await file.text(),file.name));return;}
   const doc=await extractBrowserDocument(file);
   const table=doc.tables.find(rows=>rows.length>1&&rows[0].length>=2&&rows[0].length<=12);
   if(table){await importRows(fromCreamRows(table,file.name));return;}
   const extracted=extractTextMeasurements(doc.text,file.name);
   if(extracted){await importRows(extracted);return;}
   throw Error("讀到文字，但沒有可辨識的日期＋數值欄；請提供「日期,指標,數值,單位」CSV 或每行日期＋指標＋數值");
  }catch(e){setNotice("文件匯入失敗："+String(e));}finally{setBusy(false);}
 }
 async function importText(){
  const text=raw.trim();if(!text)return;
  try{
   const dataset=text.includes("\n")&&/[,\t]/.test(text.split("\n")[0])?
    parseCreamCSV(text,"CREAM 貼上的資料"):extractTextMeasurements(text,"CREAM 文字紀錄");
   if(!dataset)throw Error("文字缺少可辨識的日期及指標，例：2026-10-01 體重: 75 kg");
   await importRows(dataset);setRaw("");
  }catch(e){setNotice("文字分析無法匯入："+String(e));}
 }
 async function goalSave(){
  if(!active)return;
  const target=numberValue(goalValue);
  if(target===null){setNotice("請填入合法數值作為目標");return;}
  setBusy(true);try{
   await saveCreamGoal(owner,{metric:active.metric,unit:active.unit,target,direction,dueDate:due||undefined});
   await refresh();setNotice("追蹤目標已保存在本機，將在新增數據時自動重新評估。");
  }catch(e){setNotice(String(e));}finally{setBusy(false);}
 }
 async function erase(id:string,name:string){
  if(!window.confirm("確定刪除 CREAM 歷史快照「"+name+"」？這不會刪除原始附件。"))return;
  setBusy(true);try{await removeCreamSnapshot(id,owner);await refresh();setNotice("已刪除此份 CREAM 分析快照，其他來源保留。");}
  catch(e){setNotice(String(e));}finally{setBusy(false);}
 }
 const quality=useMemo(()=>active?.quality||[],[active]);
 return <section className="cream-long">
  <header className="cream-long-head"><div><span>CREAM / INTELLIGENCE</span><h2>長期數據研究</h2><p>保留時間軸、來源和單位。每次新增資料都重新比對整體趨勢，不只生成一次性圖表。</p></div>
  <button type="button" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={15}/>重新檢查</button></header>
  <div className="cream-long-stats">
   <div><span>已存快照</span><strong>{report?.snapshots.length??0}</strong></div>
   <div><span>觀測紀錄</span><strong>{report?.observations.length??0}</strong></div>
   <div><span>長期指標</span><strong>{report?.trends.length??0}</strong></div>
   <div><span>追蹤目標</span><strong>{report?.goals.length??0}</strong></div>
  </div>
  <div className="cream-long-layout">
   <div className="cream-long-main">
    <section className="cream-long-card"><div className="cream-long-section"><Activity size={17}/><strong>追蹤結果與趨勢</strong></div>
     {choices.length?<><div className="cream-long-choices">{choices.map(x=><button type="button" key={x.metric+"\u0000"+x.unit}
      className={active?.metric===x.metric&&active.unit===x.unit?"active":""} onClick={()=>{setSelected(x.metric+"\u0000"+x.unit);}}>
       {x.metric}{x.unit?" · "+x.unit:""}</button>)}</div>
     {active&&<>
      <div className="cream-long-current"><div><small>最新觀察</small><strong>{active.latest.toFixed(2)} <span>{active.unit}</span></strong></div>
       <div><small>較初次改變</small><strong>{active.change>=0?"+":""}{active.change.toFixed(2)}</strong></div>
       <div><small>30 天趨勢</small><strong>{active.slopePer30Days===null?"待累積":(active.slopePer30Days>=0?"+":"")+active.slopePer30Days.toFixed(2)}</strong></div></div>
      <TrendGraph trend={active}/>
      <button type="button" className="cream-orchestra-action" onClick={()=>window.dispatchEvent(new CustomEvent("vanilla-open-orchestra",{detail:{source:"cream",body:creamOrchestraBrief(active)}}))}>交給 Orchestra 製作正式報告 / 簡報</button>
      <p className="cream-long-caption">{active.uniqueDates} 個不同日期 · {active.count} 筆紀錄 · {active.firstDate} ～ {active.lastDate} · 同日多筆採平均</p>
      <div className="cream-long-insights"><strong>資料統整</strong>{active.insights.map((x,i)=><p key={i}>{x}</p>)}
       {quality.length>0&&<div className="cream-long-caution">{quality.map((x,i)=><p key={i}>注意：{x}</p>)}</div>}</div>
      <div className="cream-long-insights"><strong>下一步規劃</strong>{active.recommendations.map((x,i)=><p key={i}>{x}</p>)}<small>建議以數據規則及採樣品質產生，非醫療診斷、因果推論或預測承諾。</small></div>
     </>}</>:<p className="cream-long-empty">尚無歷史數據。上傳具有日期與數值的文件，或貼上文字紀錄即可開始。</p>}
    </section>
    <section className="cream-long-card"><div className="cream-long-section"><Target size={17}/><strong>設定可衡量的目標</strong></div>
     {active?<><p>針對 {active.metric} {active.unit} 設定方向與數值。達標狀態會在每次新增觀測時更新。</p>
      <div className="cream-long-goal"><select value={direction} onChange={e=>setDirection(e.target.value as SeriesDirection)} aria-label="目標方向"><option value="increase">提高至</option><option value="decrease">降低至</option><option value="maintain">維持在 ±3%</option></select>
       <input inputMode="decimal" value={goalValue} placeholder={"目標值 "+active.unit} onChange={e=>setGoalValue(e.target.value)}/>
       <input type="date" aria-label="目標期限" value={due} onChange={e=>setDue(e.target.value)}/>
       <button type="button" disabled={busy} onClick={()=>void goalSave()}>儲存目標</button></div>
       {active.goal&&<p>目前目標：{active.goal.direction==="increase"?"提高":active.goal.direction==="decrease"?"降低":"維持"} {active.goal.target} {active.unit} · {active.goal.met?"已達成":"尚未達成"}</p>}</>:<p>請先匯入一項追蹤指標。</p>}
    </section>
   </div>
   <div className="cream-long-aside">
    <section className="cream-long-card"><div className="cream-long-section"><FileUp size={17}/><strong>匯入你的資料</strong></div>
     <label className="cream-long-upload">直接上傳資料／文件<input type="file" accept=".csv,.tsv,.xlsx,.docx,.pptx,.pdf,.txt,.md,.json" disabled={busy||isPrivate} onChange={e=>{void importFile(e.target.files?.[0]);e.target.value="";}}/></label>
     <label className="cream-long-label">或貼上 CSV／文字紀錄<textarea rows={6} value={raw} disabled={busy||isPrivate} onChange={e=>setRaw(e.target.value)} placeholder={"日期,指標,數值,單位\n2026-10-01,網站使用者,1120,人\n2026-10-08,網站使用者,1180,人\n\n或：2026-10-01 體重: 75 kg"}/></label>
     <button type="button" disabled={busy||isPrivate||!raw.trim()} onClick={()=>void importText()}>分析並加入歷史</button>
     <small>自動辨識數據、日期、來源與單位。同一資料不重複新增；無日期的檔案可能只能以匯入日作為觀察日期。</small>
    </section>
    <section className="cream-long-card"><div className="cream-long-section"><BarChart3 size={17}/><strong>歷史來源</strong></div>
     {(report?.snapshots||[]).slice(0,30).map(s=><div className="cream-long-source" key={s.id}>
       <div><strong>{s.source}</strong><small>{s.importedAt.slice(0,10)} · {s.observations.length} 筆觀測</small></div>
       <button type="button" title="刪除這一份快照" disabled={busy} onClick={()=>void erase(s.id,s.source)}><Trash2 size={14}/></button></div>)}
     {!(report?.snapshots.length)&&<p>每份新增資料會保留為可追溯快照。</p>}
     <button type="button" disabled={!report?.observations.length} onClick={()=>report&&saveText("CREAM_history.csv",exportCreamHistory(report))}><ArrowDownToLine size={14}/>下載完整歷史 CSV</button>
     <small>資料儲存在此裝置 IndexedDB，依目前登入帳戶隔離；還不是跨裝置雲端同步。重要資料請匯出備份。</small>
    </section>
   </div>
  </div>
  {notice&&<p className="cream-long-status" role="status">{notice}</p>}
 </section>;
}
