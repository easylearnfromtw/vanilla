import {useEffect,useMemo,useState} from "react";
import {CheckCircle2,Download,Plus,Trash2,Calculator,ClipboardList,NotebookPen,Database,RefreshCcw} from "lucide-react";
import {featureData,writeFeatureData,testExpression,MAX_RECORDS,MAX_ITEMS,type FeatureSpec,type FeatureData} from "./feature-schema";
function exportCSV(name:string,headers:string[],rows:string[][]){
 const escape=(s:string)=>{
  const neutral=/^[\s\t\r]*[=+@-]/.test(s)?"'"+s:s;
  return '"'+neutral.replace(/"/g,'""')+'"';
 };
 const contents="\uFEFF"+[headers,...rows].map(row=>row.map(escape).join(",")).join("\r\n");
 const link=document.createElement("a"),url=URL.createObjectURL(new Blob([contents],{type:"text/csv;charset=utf-8"}));
 link.href=url;link.download=name.replace(/[\\/]/g,"_")+".csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export default function FeatureRuntime({spec,onEdit}:{spec:FeatureSpec;onEdit:(id:string)=>void}){
 const [data,setData]=useState<FeatureData>(()=>featureData(spec.id));
 const [title,setTitle]=useState("");
 const [form,setForm]=useState<Record<string,string|boolean>>({});
 const [status,setStatus]=useState("");
 useEffect(()=>{setData(featureData(spec.id));setTitle("");setForm({});setStatus("");},[spec.id]);
 function commit(next:FeatureData){
  try{writeFeatureData(spec.id,next);setData(next);setStatus("已儲存於這台裝置");}
  catch(e){setStatus("儲存失敗："+(e instanceof Error?e.message:String(e)));}
 }
 function addItem(){
  if(!title.trim())return;
  if(data.items.length>=MAX_ITEMS){setStatus("待辦事項最多 200 項");return;}
  commit({...data,items:[...data.items,{id:crypto.randomUUID(),title:title.trim().slice(0,150),done:false}]});
  setTitle("");
 }
 function addRecord(){
  if(data.records.length>=MAX_RECORDS){setStatus("單一追蹤器最多 200 筆資料，請先匯出 CSV");return;}
  const values:Record<string,string|boolean>={};
  for(const f of spec.fields){
   const value=form[f.id]??(f.type==="checkbox"?false:"");
   if(f.type==="number"&&value!==""&&!Number.isFinite(Number(value))){setStatus(f.label+" 必須是數字");return;}
   values[f.id]=value;
  }
  if(spec.fields.every(f=>values[f.id]===""||values[f.id]===false)){setStatus("請至少填寫一個欄位");return;}
  commit({...data,records:[{id:crypto.randomUUID(),at:new Date().toISOString(),values},...data.records]});
  setForm({});
 }
 const numericInputs=useMemo(()=>Object.fromEntries(spec.fields.map(f=>[f.id,Number(data.inputs[f.id]||0)])),[data.inputs,spec.fields]);
 let result:number|undefined,calcError="";
 if(spec.kind==="calculator")try{result=testExpression(spec.formula||"0",numericInputs);}catch(e){calcError=e instanceof Error?e.message:"公式錯誤";}
 const icons={checklist:<ClipboardList size={22}/>,tracker:<Database size={22}/>,calculator:<Calculator size={22}/>,notes:<NotebookPen size={22}/>};
 return <section className="built-feature">
  <header className="built-feature-header"><div className="built-feature-identity"><span className="built-feature-icon">{icons[spec.kind]}</span><div><div className="built-feature-kicker">VANILLA / SELF-BUILT MODULE · v{spec.revision}</div><h2>{spec.name}</h2><p>{spec.description}</p></div></div><button type="button" onClick={()=>onEdit(spec.id)}>用 AI 改進功能</button></header>
  {spec.kind==="checklist"&&<div className="built-feature-panel">
   <div className="built-feature-progress"><CheckCircle2 size={17}/><strong>已完成 {data.items.filter(x=>x.done).length} / {data.items.length}</strong></div>
   <form className="built-feature-add" onSubmit={e=>{e.preventDefault();addItem();}}><input value={title} maxLength={150} onChange={e=>setTitle(e.target.value)} placeholder="新增待辦事項…"/><button type="submit"><Plus size={16}/>新增</button></form>
   {data.items.length===0?<p className="built-feature-empty">目前沒有待辦事項。新增第一件要做的事。</p>:<div className="built-feature-items">{data.items.map(item=><div key={item.id} className="built-feature-item"><label><input type="checkbox" checked={item.done} onChange={e=>commit({...data,items:data.items.map(x=>x.id===item.id?{...x,done:e.target.checked}:x)})}/><span className={item.done?"is-done":""}>{item.title}</span></label><button type="button" title="刪除這項任務" aria-label={"刪除 "+item.title} onClick={()=>commit({...data,items:data.items.filter(x=>x.id!==item.id)})}><Trash2 size={15}/></button></div>)}</div>}
   <button type="button" className="built-secondary" onClick={()=>exportCSV(spec.name,["狀態","內容"],data.items.map(x=>[x.done?"完成":"未完成",x.title]))}><Download size={14}/>匯出 CSV</button>
  </div>}
  {spec.kind==="tracker"&&<div className="built-feature-panel">
   <div className="built-feature-grid">{spec.fields.map(f=><label key={f.id}><span>{f.label}{f.unit?" · "+f.unit:""}</span>{f.type==="checkbox"?<input type="checkbox" checked={form[f.id]===true} onChange={e=>setForm({...form,[f.id]:e.target.checked})}/>:<input type={f.type==="date"?"date":f.type==="number"?"number":"text"} value={String(form[f.id]||"")} onChange={e=>setForm({...form,[f.id]:e.target.value})} placeholder={f.label}/>}</label>)}</div>
   <button type="button" className="built-primary" onClick={addRecord}><Plus size={16}/>新增紀錄</button>
   <div className="built-records"><table><thead><tr><th>建立時間</th>{spec.fields.map(f=><th key={f.id}>{f.label}</th>)}<th>管理</th></tr></thead><tbody>{data.records.map(r=><tr key={r.id}><td>{new Date(r.at).toLocaleDateString("zh-TW")}</td>{spec.fields.map(f=><td key={f.id}>{r.values[f.id]===true?"是":r.values[f.id]===false?"否":String(r.values[f.id]??"")}</td>)}<td><button type="button" aria-label="刪除此筆紀錄" onClick={()=>{if(window.confirm("確定刪除此筆紀錄？"))commit({...data,records:data.records.filter(x=>x.id!==r.id)});}}><Trash2 size={14}/></button></td></tr>)}</tbody></table>{data.records.length===0&&<p className="built-feature-empty">尚無紀錄</p>}</div>
   <button type="button" className="built-secondary" onClick={()=>exportCSV(spec.name,["建立時間",...spec.fields.map(x=>x.label)],data.records.map(r=>[r.at,...spec.fields.map(f=>String(r.values[f.id]??""))]))}><Download size={14}/>匯出 CSV</button>
  </div>}
  {spec.kind==="calculator"&&<div className="built-feature-panel">
   <div className="built-feature-grid">{spec.fields.map(f=><label key={f.id}><span>{f.label}{f.unit?" · "+f.unit:""}</span><input type="number" inputMode="decimal" value={Number.isFinite(data.inputs[f.id])?data.inputs[f.id]:""} onChange={e=>commit({...data,inputs:{...data.inputs,[f.id]:Number(e.target.value)||0}})}/></label>)}</div>
   <div className="built-result"><span>運算結果</span><strong>{calcError?calcError:Number(result).toLocaleString("zh-TW",{maximumFractionDigits:6})}</strong><small>公式：{spec.formula}</small></div>
  </div>}
  {spec.kind==="notes"&&<div className="built-feature-panel"><textarea className="built-notes" placeholder="開始寫下想法。內容保留在目前裝置，不會自動同步雲端。" value={data.notes} onChange={e=>commit({...data,notes:e.target.value})} rows={16}/><div className="built-feature-row"><span>{data.notes.length.toLocaleString()} 字元</span><button type="button" className="built-secondary" onClick={()=>{
   const url=URL.createObjectURL(new Blob([data.notes],{type:"text/plain;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=spec.name+".txt";a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }}><Download size={15}/>匯出 TXT</button></div></div>}
  <p role="status" className="built-feature-status">{status}</p>
  <p className="built-feature-footnote"><RefreshCcw size={13}/>資料只儲存在這台裝置的瀏覽器。改進模組配置不會自動送出你的紀錄；清除瀏覽器資料可能遺失內容，重要資料請定期匯出。</p>
 </section>;
}
