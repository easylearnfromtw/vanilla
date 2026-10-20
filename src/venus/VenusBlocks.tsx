import {useState} from "react";
import type {VenusBlock} from "./presentation";
import {VenusMath,VenusMap,VenusVideo,VenusLive} from "./VenusAdvanced";
import "./presentation.css";

function Heading({title}:{title:string}){return title?<h3 className="venus-title">{title}</h3>:null;}
function Chart({block}:{block:Extract<VenusBlock,{kind:"chart"}>}){
 const {values,labels}=block;
 const lower=Math.min(0,...values),upper=Math.max(0,...values);
 const range=upper-lower||1;
 const y=(value:number)=>198-(value-lower)/range*154;
 const zero=y(0),step=525/values.length;
 const points=values.map((value,i)=>({x:48+(i+.5)*step,y:y(value),value,label:labels[i]}));
 const fmt=(n:number)=>new Intl.NumberFormat("zh-TW",{maximumFractionDigits:2}).format(n);
 return <section className="venus-widget venus-chart">
  <Heading title={block.title}/>
  <svg viewBox="0 0 620 270" role="img" aria-label={block.title+"："+points.map(p=>p.label+" "+fmt(p.value)+block.unit).join("，")} preserveAspectRatio="xMidYMid meet">
   {[0,.5,1].map(f=>{const val=lower+(upper-lower)*f,at=y(val);return <g key={f}><line x1={40} y1={at} x2={584} y2={at} stroke="currentColor" strokeOpacity=".12"/><text x={35} y={at+4} fontSize={11} textAnchor="end" fill="currentColor">{fmt(val)}</text></g>;})}
   {block.chartType==="bar"?points.map((p,i)=><rect key={i} x={p.x-step*.32} y={Math.min(p.y,zero)} width={step*.64} height={Math.max(1,Math.abs(p.y-zero))} rx={4} className="venus-chart-bar"><title>{p.label+": "+fmt(p.value)+" "+block.unit}</title></rect>):
   <><polyline fill="none" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" points={points.map(p=>p.x+","+p.y).join(" ")} className="venus-chart-line"/>{points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={4.5} className="venus-chart-dot"><title>{p.label+": "+fmt(p.value)+" "+block.unit}</title></circle>)}</>}
   {points.map((p,i)=><text key={i} x={p.x} y={226} textAnchor="middle" fontSize={Math.min(12,values.length>8?9:11)} fill="currentColor">{p.label.length>8?p.label.slice(0,7)+"…":p.label}</text>)}
   <text x="584" y="254" fontSize={11} textAnchor="end" fill="currentColor">{block.unit}</text>
  </svg>
  <p className="venus-muted">來源標示（由回答提供，未獨立查證）：{block.source}</p>
 </section>;
}
function Tabs({block}:{block:Extract<VenusBlock,{kind:"tabs"}>}){
 const [selected,setSelected]=useState(0);
 return <section className="venus-widget"><Heading title={block.title}/><div className="venus-tabs" role="tablist" aria-label={block.title||"內容分頁"}>
  {block.items.map((item,i)=><button key={i} type="button" role="tab" aria-selected={selected===i} className={selected===i?"selected":""} onClick={()=>setSelected(i)}>{item.label}</button>)}</div>
  <div role="tabpanel" className="venus-tab-panel">{block.items[selected].content}</div>
 </section>;
}
function Checklist({block}:{block:Extract<VenusBlock,{kind:"checklist"}>}){
 const [checked,setChecked]=useState<number[]>([]);
 return <section className="venus-widget"><Heading title={block.title}/>
  <p className="venus-muted">已完成 {checked.length} / {block.items.length}（僅限本次畫面）</p>
  {block.items.map((item,i)=><label className="venus-check" key={i}><input type="checkbox" checked={checked.includes(i)} onChange={event=>setChecked(old=>event.target.checked?[...old,i]:old.filter(x=>x!==i))}/><span>{item.text}</span></label>)}
 </section>;
}
function Quiz({block}:{block:Extract<VenusBlock,{kind:"quiz"}>}){
 const [selected,setSelected]=useState<number|null>(null);
 return <section className="venus-widget"><Heading title={block.title}/><p className="venus-quiz-question">{block.question}</p>
  <div className="venus-quiz-options">{block.options.map((option,i)=><button type="button" key={i} aria-pressed={selected===i} className={selected===i?"selected":""} onClick={()=>setSelected(i)}>{option}</button>)}</div>
  {selected!==null&&<p className="venus-quiz-feedback" role="status">{selected===block.correctIndex?"已選擇參考答案。":"參考答案："+block.options[block.correctIndex]}{block.explanation?" "+block.explanation:""}<small>答案由模型產生，尚未獨立核對。</small></p>}
 </section>;
}
function Gallery({block}:{block:Extract<VenusBlock,{kind:"gallery"}>}){
 const [loaded,setLoaded]=useState<number[]>([]);
 return <section className="venus-widget"><Heading title={block.title}/><div className="venus-gallery">
 {block.items.map((item,i)=><figure key={i}>{loaded.includes(i)?<img src={item.url} alt={item.alt} loading="lazy" referrerPolicy="no-referrer"/>:<button type="button" className="venus-image-consent" onClick={()=>setLoaded(old=>[...old,i])}>載入外部圖片</button>}<figcaption>{item.caption||item.alt}{item.source&&<span className="venus-gallery-source"> · <a href={item.source} rel="noopener noreferrer" target="_blank">圖片出處 ↗</a></span>}</figcaption></figure>)}
 </div><p className="venus-muted">圖片來源連結由回答提供；點擊載入前不會向外站下載圖片。</p></section>;
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
