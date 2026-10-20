import {useEffect,useId,useRef,useState,type KeyboardEvent} from "react";
import type {VenusBlock} from "./presentation";
import {VenusMath,VenusMap,VenusVideo,VenusLive} from "./VenusAdvanced";
import "./presentation.css";

function Heading({title}:{title:string}){return title?<h3 className="venus-title">{title}</h3>:null;}
const fmt=(n:number)=>new Intl.NumberFormat("zh-TW",{maximumFractionDigits:2}).format(n);
function Chart({block}:{block:Extract<VenusBlock,{kind:"chart"}>}){
 const [mode,setMode]=useState<"visual"|"data">("visual");
 const {values,labels}=block;
 const lower=Math.min(0,...values),upper=Math.max(0,...values);
 const range=upper-lower||1;
 const y=(value:number)=>198-(value-lower)/range*154;
 const zero=y(0),step=525/values.length;
 const points=values.map((value,i)=>({x:48+(i+.5)*step,y:y(value),value,label:labels[i]}));
 return <section className="venus-widget venus-chart">
  <div className="venus-widget-head"><Heading title={block.title}/><div className="venus-switch" role="group" aria-label="圖表顯示方式">
   <button type="button" aria-pressed={mode==="visual"} className={mode==="visual"?"selected":""} onClick={()=>setMode("visual")}>圖表</button>
   <button type="button" aria-pressed={mode==="data"} className={mode==="data"?"selected":""} onClick={()=>setMode("data")}>資料</button>
  </div></div>
  {mode==="visual"?<svg viewBox="0 0 620 270" role="img" aria-label={block.title+"："+points.map(p=>p.label+" "+fmt(p.value)+block.unit).join("，")} preserveAspectRatio="xMidYMid meet">
   {[0,.5,1].map(f=>{const val=lower+(upper-lower)*f,at=y(val);return <g key={f}><line x1={40} y1={at} x2={584} y2={at} stroke="currentColor" strokeOpacity=".12"/><text x={35} y={at+4} fontSize={11} textAnchor="end" fill="currentColor">{fmt(val)}</text></g>;})}
   {block.chartType==="bar"?points.map((p,i)=><rect key={i} x={p.x-step*.32} y={Math.min(p.y,zero)} width={step*.64} height={Math.max(1,Math.abs(p.y-zero))} rx={4} className="venus-chart-bar"><title>{p.label+": "+fmt(p.value)+" "+block.unit}</title></rect>):
   <><polyline fill="none" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" points={points.map(p=>p.x+","+p.y).join(" ")} className="venus-chart-line"/>{points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={4.5} className="venus-chart-dot"><title>{p.label+": "+fmt(p.value)+" "+block.unit}</title></circle>)}</>}
   {points.map((p,i)=><text key={i} x={p.x} y={226} textAnchor="middle" fontSize={values.length>8?9:11} fill="currentColor">{p.label.length>8?p.label.slice(0,7)+"…":p.label}</text>)}
   <text x="584" y="254" fontSize={11} textAnchor="end" fill="currentColor">{block.unit}</text>
  </svg>:<div className="venus-data-scroll"><table className="venus-data-table"><caption className="venus-sr-only">{block.title} 的原始數據</caption><thead><tr><th scope="col">項目</th><th scope="col">數值{block.unit?"（"+block.unit+"）":""}</th></tr></thead><tbody>{points.map((p,i)=><tr key={i}><th scope="row">{p.label}</th><td>{fmt(p.value)}</td></tr>)}</tbody></table></div>}
  <p className="venus-muted">來源標示（由回答提供，未獨立查證）：{block.source}</p>
 </section>;
}
function Tabs({block}:{block:Extract<VenusBlock,{kind:"tabs"}>}){
 const [selected,setSelected]=useState(0);
 const id=useId();
 const refs=useRef<Array<HTMLButtonElement|null>>([]);
 const switchTo=(i:number)=>{setSelected(i);refs.current[i]?.focus();};
 const onKey=(event:KeyboardEvent<HTMLButtonElement>,i:number)=>{
  let next:number|null=null;
  if(event.key==="ArrowRight")next=(i+1)%block.items.length;
  else if(event.key==="ArrowLeft")next=(i+block.items.length-1)%block.items.length;
  else if(event.key==="Home")next=0;
  else if(event.key==="End")next=block.items.length-1;
  if(next!==null){event.preventDefault();switchTo(next);}
 };
 return <section className="venus-widget"><Heading title={block.title}/><div className="venus-tabs" role="tablist" aria-label={block.title||"內容分頁"}>
  {block.items.map((item,i)=><button key={i} type="button" ref={node=>{refs.current[i]=node;}} role="tab" id={id+"-tab-"+i} aria-controls={id+"-panel"} aria-selected={selected===i} tabIndex={selected===i?0:-1} className={selected===i?"selected":""} onClick={()=>setSelected(i)} onKeyDown={event=>onKey(event,i)}>{item.label}</button>)}</div>
  <div role="tabpanel" id={id+"-panel"} aria-labelledby={id+"-tab-"+selected} tabIndex={0} className="venus-tab-panel">{block.items[selected].content}</div>
  <p className="venus-sr-only">可用左右方向鍵、Home 或 End 切換分頁</p>
 </section>;
}
function Checklist({block}:{block:Extract<VenusBlock,{kind:"checklist"}>}){
 const [checked,setChecked]=useState<number[]>([]);
 const percent=100*checked.length/block.items.length;
 return <section className="venus-widget"><div className="venus-widget-head"><Heading title={block.title}/>{checked.length>0&&<button type="button" className="venus-text-action" onClick={()=>setChecked([])}>重新開始</button>}</div>
  <div className="venus-progress-line"><span>已完成 {checked.length} / {block.items.length}</span><span>{Math.round(percent)}%</span></div>
  <div className="venus-progress" role="progressbar" aria-label="清單完成度" aria-valuemin={0} aria-valuemax={block.items.length} aria-valuenow={checked.length}><span style={{width:percent+"%"}}/></div>
  <div className="venus-checklist">{block.items.map((item,i)=><label className="venus-check" key={i}><input type="checkbox" checked={checked.includes(i)} onChange={event=>setChecked(old=>event.target.checked?[...old,i]:old.filter(x=>x!==i))}/><span>{item.text}</span></label>)}</div>
  <p className="venus-muted">進度僅保留於目前開啟的畫面，不會上傳或保存。</p>
 </section>;
}
function Quiz({block}:{block:Extract<VenusBlock,{kind:"quiz"}>}){
 const [selected,setSelected]=useState<number|null>(null);
 return <section className="venus-widget"><div className="venus-widget-head"><Heading title={block.title}/>{selected!==null&&<button type="button" className="venus-text-action" onClick={()=>setSelected(null)}>再試一次</button>}</div>
  <p className="venus-quiz-question">{block.question}</p>
  <div className="venus-quiz-options">{block.options.map((option,i)=><button type="button" key={i} aria-pressed={selected===i} className={[selected===i?"selected":"",selected!==null&&i===block.correctIndex?"venus-answer":""].join(" ")} onClick={()=>setSelected(i)}><span className="venus-option-index">{String.fromCharCode(65+i)}</span>{option}</button>)}</div>
  {selected!==null&&<p className="venus-quiz-feedback" role="status"><strong>{selected===block.correctIndex?"已選擇參考答案。":"參考答案："+block.options[block.correctIndex]}</strong>{block.explanation&&" "+block.explanation}<small>答案由模型產生，尚未獨立核對。</small></p>}
 </section>;
}
function Gallery({block}:{block:Extract<VenusBlock,{kind:"gallery"}>}){
 const [loaded,setLoaded]=useState<number[]>([]);
 const [failed,setFailed]=useState<number[]>([]);
 const [active,setActive]=useState<number|null>(null);
 const closeRef=useRef<HTMLButtonElement|null>(null);
 const openerRef=useRef<HTMLButtonElement|null>(null);
 const current=active===null?null:block.items[active];
 useEffect(()=>{
  if(active===null)return;
  closeRef.current?.focus();
  const onKey=(event:globalThis.KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();setActive(null);}
   if(event.key==="ArrowRight"){event.preventDefault();setActive(i=>i===null?null:(i+1)%block.items.length);}
   if(event.key==="ArrowLeft"){event.preventDefault();setActive(i=>i===null?null:(i+block.items.length-1)%block.items.length);}
  };
  window.addEventListener("keydown",onKey);
  return ()=>window.removeEventListener("keydown",onKey);
 },[active,block.items.length]);
 const close=()=>{setActive(null);openerRef.current?.focus();};
 return <section className="venus-widget"><div className="venus-widget-head"><Heading title={block.title}/><span className="venus-counter">{block.items.length} 張圖片</span></div>
  <div className="venus-gallery">
  {block.items.map((item,i)=><figure key={i}>
   {loaded.includes(i)?<button type="button" className="venus-thumb-button" aria-label={"放大檢視："+item.alt} onClick={event=>{openerRef.current=event.currentTarget;setActive(i);}}>
    {failed.includes(i)?<span className="venus-image-failed">圖片無法載入，請查看來源</span>:<img src={item.url} alt={item.alt} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(old=>old.includes(i)?old:[...old,i])}/>}
   </button>:<button type="button" className="venus-image-consent" onClick={()=>setLoaded(old=>[...old,i])}><span aria-hidden="true">▧</span>載入外部圖片</button>}
   <figcaption><span>{item.caption||item.alt}</span>{item.source&&<a href={item.source} rel="noopener noreferrer" target="_blank">圖片出處 ↗</a>}</figcaption>
  </figure>)}
  </div><p className="venus-muted">圖片來源連結由回答提供；點擊載入前不會向外站下載圖片。</p>
  {active!==null&&current&&<div className="venus-lightbox" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
   <div className="venus-lightbox-dialog" role="dialog" aria-modal="true" aria-label="圖片放大檢視">
    <div className="venus-lightbox-head"><span>{active+1} / {block.items.length}</span><button type="button" ref={closeRef} className="venus-lightbox-close" onClick={close} aria-label="關閉圖片預覽">✕ 關閉</button></div>
    <div className="venus-lightbox-stage">{!loaded.includes(active)?<button type="button" className="venus-image-consent" onClick={()=>setLoaded(old=>old.includes(active)?old:[...old,active])}>載入外部圖片</button>:failed.includes(active)?<p>圖片無法載入，請查看來源。</p>:<img src={current.url} alt={current.alt} referrerPolicy="no-referrer" onError={()=>setFailed(old=>old.includes(active)?old:[...old,active])}/>}</div>
    <div className="venus-lightbox-foot"><button type="button" onClick={()=>setActive(i=>i===null?null:(i+block.items.length-1)%block.items.length)} aria-label="上一張">← 上一張</button><p>{current.caption||current.alt}{current.source&&<a href={current.source} rel="noopener noreferrer" target="_blank">圖片出處 ↗</a>}</p><button type="button" onClick={()=>setActive(i=>i===null?null:(i+1)%block.items.length)} aria-label="下一張">下一張 →</button></div>
   </div>
  </div>}
 </section>;
}
export default function VenusBlocks({blocks}:{blocks:VenusBlock[]}){
 if(!blocks.length)return null;
 return <div className="venus-presentations" aria-label="Venus 互動式呈現">
  {blocks.map((block,index)=>{
   const key=index;
   switch(block.kind){
   case "metrics":return <section key={key} className="venus-widget"><Heading title={block.title}/><div className="venus-metrics">{block.items.map((item,i)=><article key={i}><span>{item.label}</span><strong>{item.value}</strong>{item.note&&<small>{item.note}</small>}</article>)}</div></section>;
   case "cards":return <section key={key} className="venus-widget"><Heading title={block.title}/><div className="venus-cards">{block.items.map((item,i)=><article key={i}><strong>{item.title}</strong><p>{item.body}</p>{item.url&&<a href={item.url} rel="noopener noreferrer" target="_blank">開啟來源 ↗</a>}</article>)}</div></section>;
   case "timeline":return <section key={key} className="venus-widget"><Heading title={block.title}/><ol className="venus-timeline">{block.items.map((item,i)=><li key={i}><span>{item.date}</span><strong>{item.label}</strong><p>{item.description}</p></li>)}</ol></section>;
   case "tabs":return <Tabs key={key} block={block}/>;
   case "checklist":return <Checklist key={key} block={block}/>;
   case "quiz":return <Quiz key={key} block={block}/>;
   case "chart":return <Chart key={key} block={block}/>;
   case "gallery":return <Gallery key={key} block={block}/>;
   case "map":return <VenusMap key={key} block={block}/>;
   case "video":return <VenusVideo key={key} block={block}/>;
   case "math":return <VenusMath key={key} block={block}/>;
   case "live":return <VenusLive key={key} block={block}/>;
   }
  })}
 </div>;
}
