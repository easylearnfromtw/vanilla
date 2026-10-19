import ExtendedPlot from "./ExtendedPlot";
import {useMemo,useState} from "react";
import type {CreamResult,CreamChartKind,CreamMetric,CreamPoint,CreamScatterAxis} from "./core";
import "./cream.css";

const nf=new Intl.NumberFormat("zh-TW",{maximumFractionDigits:3});
function fmt(value:number|null){return value===null?"樣本不足":Number.isFinite(value)?nf.format(value):"無法計算";}
function csvCell(value:string):string{
 const safe=/^[=+@\-\t\r]/.test(value)?"'"+value:value;
 return '"'+safe.replace(/"/g,'""')+'"';
}
function saveSummary(result:CreamResult){
 const head=["資料來源","數值欄位","樣本數","缺失數","總和","平均","中位數","最小","最大","樣本標準差"];
 const rows=result.metrics.map(m=>[result.source,m.key,String(m.n),String(m.missing),String(m.sum),String(m.mean),String(m.median),String(m.min),String(m.max),m.sampleStdDev===null?"":String(m.sampleStdDev)]);
 const data="\ufeff"+[head,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n");
 const link=document.createElement("a"),url=URL.createObjectURL(new Blob([data],{type:"text/csv;charset=utf-8"}));
 link.href=url;link.download="CREAM_描述統計.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function Plot({metric,kind,axis}:{metric:CreamMetric;kind:CreamChartKind;axis?:CreamScatterAxis}){
 const [focus,setFocus]=useState<number|null>(null);
 const paired=kind==="scatter"&&axis?.yColumn===metric.column;
 const points=paired?metric.points.filter(p=>p.x!==undefined):metric.points;
 const W=620,H=270,left=61,right=25,top=24,bottom=46,plotW=W-left-right,plotH=H-top-bottom;
 const values=points.map(p=>p.value);
 const xValues=paired?points.map(p=>p.x!):[];
 const xMin=paired?Math.min(...xValues):0,xMax=paired?Math.max(...xValues):0;
 const low=Math.min(...values,kind==="bar"?0:Infinity),high=Math.max(...values,kind==="bar"?0:-Infinity);
 const span=Math.max(1e-9,high-low);
 const lo=kind==="bar"?Math.min(0,low):low-span*0.08;
 const hi=kind==="bar"?Math.max(0,high):high+span*0.08;
 const domain=Math.max(1e-9,hi-lo);
 const atY=(n:number)=>top+plotH-(n-lo)/domain*plotH;
 const atX=(p:CreamPoint,i:number)=>left+(paired&&xMax>xMin?(p.x!-xMin)/(xMax-xMin)*plotW:points.length<=1?plotW/2:i/(points.length-1)*plotW);
 const formatPoint=(i:number)=>{const p=points[i];return p?(paired?axis!.xKey+"="+fmt(p.x!)+" · ":"")+metric.key+" · "+p.label+"（來源第 "+p.row+" 列）："+fmt(p.value):"";};
 const selected=focus===null?null:points[focus];
 const coords=points.map((p,i)=>({x:atX(p,i),y:atY(p.value),p,i}));
 const line=coords.map((p,i)=>(i===0?"M":"L")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
 if(!points.length)return <p className="cream-empty">沒有可繪製的有效資料。</p>;
 return <div className="cream-plot">
  <svg viewBox={"0 0 "+W+" "+H} role="img" aria-label={metric.key+" 的"+(kind==="line"?"折線":kind==="bar"?"長條":"散佈")+"圖，共 "+metric.n+" 筆有效資料，圖中顯示 "+points.length+" 筆"} preserveAspectRatio="xMidYMid meet">
   <title>{metric.key} · {metric.n} 筆有效資料</title>
   {[0,0.5,1].map(t=>{const y=top+t*plotH,value=hi-t*domain;return <g key={t}><line x1={left} x2={W-right} y1={y} y2={y} stroke="#e6e2dd"/><text x={left-10} y={y+4} textAnchor="end" fontSize="12" fill="#807b74">{fmt(value)}</text></g>;})}
   {kind==="line"&&<path d={line} stroke="#ba4937" strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round"/>}
   {coords.map(({x,y,p,i})=>kind==="bar"?
    <rect key={p.row} x={left+(i/points.length)*plotW+2} width={Math.max(1,plotW/points.length-5)} y={Math.min(y,atY(0))} height={Math.max(1,Math.abs(y-atY(0)))} fill={focus===i?"#762d27":"#b44a3b"} tabIndex={0} role="img" aria-label={formatPoint(i)} onFocus={()=>setFocus(i)} onBlur={()=>setFocus(null)} onPointerEnter={()=>setFocus(i)} onPointerLeave={()=>setFocus(null)}/>:
    <circle key={p.row} cx={x} cy={y} r={focus===i?6:kind==="scatter"?4.5:3.3} fill={focus===i?"#762d27":"#b44a3b"} stroke="#fff" strokeWidth={1.5} tabIndex={0} role="img" aria-label={formatPoint(i)} onFocus={()=>setFocus(i)} onBlur={()=>setFocus(null)} onPointerEnter={()=>setFocus(i)} onPointerLeave={()=>setFocus(null)}/>)}
   {points.length>1&&[0,Math.floor((points.length-1)/2),points.length-1].filter((v,i,a)=>a.indexOf(v)===i).map(i=><text key={i} x={kind==="bar"?left+(i+0.5)/points.length*plotW:atX(points[i],i)} y={H-16} textAnchor="middle" fontSize="12" fill="#6f6b66">{paired?fmt(points[i].x!):points[i].label.slice(0,11)}</text>)}
  </svg>
  <p className="cream-plot-note">{selected?formatPoint(focus!):"輕觸資料點查看原始列號與數值"} · {kind==="scatter"?(paired?"橫軸："+axis!.xKey+"；縱軸："+metric.key+"，僅使用可配對資料。":"沒有配對 X 數值欄，目前橫軸為原始資料順序。") : "圖表資料並未經 AI 推測或補值。"}</p>
 </div>;
}
export default function CreamMessage({result,onOpenSheets}:{result:CreamResult;onOpenSheets?:()=>void}){
 const [metricName,setMetricName]=useState(result.metrics.find(m=>m.column===result.scatterAxis?.yColumn)?.key||result.metrics[0]?.key||"");
 const [kind,setKind]=useState<CreamChartKind>(result.chartKind);
 const [showData,setShowData]=useState(false);
 const metric=useMemo(()=>result.metrics.find(x=>x.key===metricName)||result.metrics[0],[result,metricName]);
 return <section className="cream-inline" aria-label="CREAM 對話內分析">
  <div className="cream-heading"><span className="cream-logotype">CREAM <i>ANALYTICS</i></span><span className="cream-sourcetag">資料可追溯 · 本機計算</span></div>
  <div className="cream-intro"><strong>{result.source}</strong><p>{nf.format(result.rowCount)} 筆資料 · {result.columns.length} 欄 · 描述統計</p></div>
  {metric&&<><div className="cream-kpi" aria-label="描述統計摘要">
   <div><small>有效樣本 n</small><strong>{nf.format(metric.n)}</strong></div>
   <div><small>平均值</small><strong>{fmt(metric.mean)}</strong></div>
   <div><small>中位數</small><strong>{fmt(metric.median)}</strong></div>
   <div><small>缺失值</small><strong>{nf.format(metric.missing)}</strong></div>
  </div>
  {result.chartReason&&<p className="cream-chart-reason">自動圖表建議：{result.chartReason} 如有需要，可手動切換。</p>}
  <div className="cream-choices">
   <label>統計欄位 <select aria-label="選擇資料欄位" value={metric.key} onChange={e=>setMetricName(e.target.value)}>{result.metrics.map(x=><option key={x.column} value={x.key}>{x.key}（n={x.n}）</option>)}</select></label>
   <label>圖表類型 <select aria-label="切換圖表類型" value={kind} onChange={e=>setKind(e.target.value as CreamChartKind)}><option value="bar">長條圖</option><option value="line">折線圖</option><option value="scatter">散佈圖</option><option value="pie">圓餅圖</option><option value="numberline">數線圖</option></select></label>
  </div>
  {kind==="pie"||kind==="numberline"?<ExtendedPlot key={metric.key+"_"+kind} metric={metric} kind={kind}/>:<Plot key={metric.key+"_"+kind} metric={metric} kind={kind} axis={result.scatterAxis}/>}
  {result.insights?.length&&<div className="cream-insights"><strong>數據解讀</strong>{result.insights.map((insight,i)=><p key={i}>{insight}</p>)}<small>以可追溯資料進行描述，不代表因果、預測或醫療結論。</small></div>}
  <details className="cream-details"><summary>完整描述統計與方法</summary><dl><dt>總和</dt><dd>{fmt(metric.sum)}</dd><dt>最小／最大</dt><dd>{fmt(metric.min)}／{fmt(metric.max)}</dd><dt>樣本標準差（n−1）</dt><dd>{fmt(metric.sampleStdDev)}</dd><dt>有效數／缺失數</dt><dd>{metric.n}／{metric.missing}</dd></dl><p>對純數值欄進行描述統計；空白不參與計算。混合型資料不強制轉換。沒有執行推論統計、因果判定或預測。</p></details>
  </>}
  {result.warnings.map((warning,i)=><p key={i} className="cream-warning" role="note">{warning}</p>)}
  <div className="cream-actions"><button type="button" onClick={()=>setShowData(!showData)}>{showData?"收起":"檢視"}原始資料預覽</button><button type="button" disabled={!result.metrics.length} onClick={()=>saveSummary(result)}>匯出統計 CSV</button>{onOpenSheets&&<button type="button" onClick={onOpenSheets}>在 Sheets 編輯副本</button>}</div>
  {showData&&<div className="cream-table-scroll"><table><caption>來源資料預覽（最多 12 列）</caption><thead><tr>{result.columns.map((c,i)=><th key={i} scope="col">{c}</th>)}</tr></thead><tbody>{result.previewRows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c||"—"}</td>)}</tr>)}</tbody></table></div>}
  <footer className="cream-trace">SOURCE / {result.source} · {new Date(result.importedAt).toLocaleString("zh-TW")} · 第 1 列為欄名，第 2 列起為資料 · 統計引擎 P0 / v1</footer>
 </section>;
}
