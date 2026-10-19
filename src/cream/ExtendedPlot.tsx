import {useState} from "react";
import type {CreamMetric,CreamChartKind} from "./core";
import {pieSeries,numberLineSeries} from "./extended-charts";
const f=(n:number)=>Number.isFinite(n)?new Intl.NumberFormat("zh-TW",{maximumFractionDigits:2}).format(n):"—";
const polar=(cx:number,cy:number,r:number,angle:number)=>({x:cx+r*Math.sin(angle*Math.PI/180),y:cy-r*Math.cos(angle*Math.PI/180)});
function sector(cx:number,cy:number,r:number,start:number,end:number):string{
 const a=polar(cx,cy,r,start),b=polar(cx,cy,r,end);
 return "M"+cx+","+cy+" L"+a.x+","+a.y+" A"+r+","+r+" 0 "+(end-start>180?1:0)+" 1 "+b.x+","+b.y+" Z";
}
export default function ExtendedPlot({metric,kind}:{metric:CreamMetric;kind:Extract<CreamChartKind,"pie"|"numberline">}){
 const [selected,setSelected]=useState<number|null>(null);
 if(kind==="pie"){
  const data=pieSeries(metric.points);
  if(data.error)return <p className="cream-warning" role="status">{data.error}</p>;
  return <div className="cream-extended-plot"><svg viewBox="0 0 320 245" role="img" aria-label={"圓餅圖："+metric.key+"；分類 "+data.slices.length+" 項"} className="cream-pie-svg">
    {data.slices.length===1?<circle cx="160" cy="118" r="101" fill="hsl(9 54% 49%)"/>:data.slices.map((slice,i)=><path key={slice.label} d={sector(160,118,101,slice.start,slice.end)} fill={"hsl("+((i*137.508+9)%360)+" 50% 50%)"} stroke="#fff" strokeWidth="2" tabIndex={0} role="img" aria-label={slice.label+"："+f(slice.value)+"，占 "+f(slice.percent)+"%"} onFocus={()=>setSelected(i)} onBlur={()=>setSelected(null)} onPointerEnter={()=>setSelected(i)} onPointerLeave={()=>setSelected(null)}/>)}
    <circle cx="160" cy="118" r="47" fill="var(--card,#fff)"/><text x="160" y="114" textAnchor="middle" fontSize="11" fill="currentColor">有效總和</text><text x="160" y="133" textAnchor="middle" fontSize="16" fontWeight="650" fill="currentColor">{f(data.total)}</text>
   </svg><div className="cream-pie-legend">{data.slices.map((slice,i)=><div key={slice.label}><i style={{backgroundColor:"hsl("+((i*137.508+9)%360)+" 50% 50%)"}}/><span>{slice.label}</span><strong>{f(slice.percent)}%</strong></div>)}</div>
   <p className="cream-plot-note">{selected===null?"點選分類查看占比":data.slices[selected]?.label+" · "+f(data.slices[selected]?.value||0)+" · "+f(data.slices[selected]?.percent||0)+"%"}；僅依目前顯示的 {data.visibleCount} 筆有效數值計算，不含未顯示資料。</p>
  </div>;
 }
 const data=numberLineSeries(metric.points);
 if(!data.points.length)return <p className="cream-empty">沒有可呈現的數線資料。</p>;
 const spread=data.max-data.min,baseline=155,width=530;
 return <div className="cream-extended-plot"><svg viewBox="0 0 620 230" role="img" aria-label={"數線圖："+metric.key+"，共 "+data.points.length+" 個數值"} preserveAspectRatio="xMidYMid meet">
  <line x1="45" x2="575" y1={baseline} y2={baseline} stroke="currentColor" strokeWidth="1.6"/>
  {[0,.25,.5,.75,1].map(t=><g key={t}><line x1={45+t*width} x2={45+t*width} y1={baseline-5} y2={baseline+6} stroke="currentColor"/><text x={45+t*width} y={baseline+24} textAnchor="middle" fontSize="12" fill="currentColor">{f(data.min+t*spread)}</text></g>)}
  {data.points.map((p,i)=><circle key={p.row+"_"+i} cx={45+p.x*width} cy={baseline-18-((p.stack%6)*16)} r={selected===i?7:5} fill={selected===i?"#ba4937":"#344e65"} stroke="#fff" strokeWidth="1" tabIndex={0} role="img" aria-label={p.label+"："+f(p.value)+"；來源第 "+p.row+" 列"} onFocus={()=>setSelected(i)} onBlur={()=>setSelected(null)} onPointerEnter={()=>setSelected(i)} onPointerLeave={()=>setSelected(null)}/>)}
  <text x="310" y="215" fontSize="12" textAnchor="middle" fill="currentColor">{metric.key}</text>
 </svg><p className="cream-plot-note">{selected===null?"點選資料點查看原始數值":data.points[selected]?.label+"： "+f(data.points[selected]?.value||0)+"（來源列 "+data.points[selected]?.row+"）"}；數線位置為實際數值，重複值堆疊顯示。</p></div>;
}
