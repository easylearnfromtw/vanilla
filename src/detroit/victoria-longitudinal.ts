/** Victoria's deterministic, opt-in longitudinal briefing.
 * CREAM owns metric computation; Victoria selects, labels and contextualizes its verified
 * observations, not guessed figures from archived assistant replies.
 * Browser local only; no polling, background inference or external transmission here.
 */
import type {CreamTrend, CreamSnapshot} from "../cream/longitudinal.ts";
import {inspectExternalText} from "../security/trust-boundary.ts";

export type VictoriaLongitudinal={
 context:string;matchedMetrics:number;inspectedMetrics:number;
 snapshots:number;from:string|null;to:string|null;observations:number;
};
const LONG_PATTERN=/(長期|長時間|長年|多年|歷年|逐年|逐月|每月|每年|時間序列|歷史數據|歷史資料|縱向|變化|變動|趨勢|成長|追蹤|統計|走勢|紀錄|記錄|資料處理|回顧|分析.*(?:月|年)|過去.*(?:月|年)|longitudinal|time[ -]?series|over time|year[ -]?over[ -]?year|month[ -]?over[ -]?month)/i;
const CROSSCHAT=/^(?:繼續|好|好的|嗯|謝謝|可以)[!！。\s]*$/;
const GENERAL=/長期|長時間|歷史數據|歷史資料|全部|整體|所有|趨勢|統計|回顧|比較|數據處理|資料處理|longitudinal|time[ -]?series/i;

export function shouldVictoriaAnalyzeLongitudinal(question:string):boolean{
 const q=question.trim();
 return q.length>=3&&!CROSSCHAT.test(q)&&LONG_PATTERN.test(q);
}
function normalized(s:string){return s.normalize("NFKC").toLowerCase().replace(/臺/g,"台").replace(/\s+/g,"");}
function metricMatch(query:string,trend:CreamTrend):boolean{
 const name=normalized(trend.metric),q=normalized(query);
 if(!name||!q)return false;
 if(q.includes(name))return true;
 // A metric can be named in mixed Chinese/English; do not let bare units or years
 // trigger an unrelated financial/medical time-series.
 if(name.length>=4&&/^[a-z0-9]+$/.test(name))return q.includes(name);
 return false;
}
function count(n:number):string{return n.toLocaleString("en-US");}
function formatValue(n:number):string{return Number.isFinite(n)?Number(n.toPrecision(8)).toLocaleString("en-US",{maximumFractionDigits:8}):"無法驗證";}
function timeExtent(trends:readonly CreamTrend[]):{from:string|null;to:string|null}{
 const rows=trends.filter(x=>x.count>0&&/^\d{4}-\d\d-\d\d$/.test(x.firstDate)&&/^\d{4}-\d\d-\d\d$/.test(x.lastDate));
 if(!rows.length)return {from:null,to:null};
 return {from:rows.map(x=>x.firstDate).sort()[0],to:rows.map(x=>x.lastDate).sort().at(-1)??null};
}
export function summarizeVictoriaLongitudinal(
 question:string,
 report:{trends:readonly CreamTrend[];snapshots:readonly CreamSnapshot[]}
):VictoriaLongitudinal{
 const trends=report.trends.filter(t=>t.count>0&&t.metric&&Number.isFinite(t.first)&&Number.isFinite(t.latest));
 const querySpecific=trends.filter(t=>metricMatch(question,t));
 const selected=(querySpecific.length?querySpecific:GENERAL.test(question)?trends:[]).slice(0,6);
 const ext=timeExtent(selected);
 const snapshotCount=report.snapshots.length;
 if(!selected.length)return {context:"",matchedMetrics:0,inspectedMetrics:trends.length,snapshots:snapshotCount,
  from:null,to:null,observations:0};
 const safe=(v:string,max:number)=>v.replace(/[\r\n<>]/g," ").replace(/\s+/g," ").slice(0,max);
 const lines=selected.map((t,i)=>{
  if(inspectExternalText(t.metric+" "+t.unit+" "+t.points.slice(0,2).map(p=>p.source).join(" "),"memory").blocked)return "";
  const enough=t.uniqueDates>=2;
  const span=t.firstDate+" → "+t.lastDate;
  const basis=count(t.count)+" 筆觀察／"+count(t.uniqueDates)+" 個日期";
  const measured="起點 "+formatValue(t.first)+"，終點 "+formatValue(t.latest)+
    (t.unit?" "+t.unit:"")+", 差異 "+formatValue(t.change)+
    (t.unit?" "+t.unit:"");
  const trend=enough?", 30 天線性斜率 "+
    (t.slopePer30Days===null?"資料不足":formatValue(t.slopePer30Days)+(t.unit?" "+t.unit:"")):
    "；不同日期不足兩個，不可判斷趨勢";
  const quality=t.quality.length?"；品質註記："+t.quality.slice(0,2).join("、").slice(0,150):"";
  const sources=[...new Set(t.points.map(p=>p.source).filter(Boolean))].slice(0,2);
  const provenance=sources.length?"；資料來源："+safe(sources.join("、"),120):"；資料來源名稱缺失";
  return "[CREAM 指標 "+(i+1)+"] "+safe(t.metric,90)+(t.unit?" ("+safe(t.unit,24)+")":"")+
    "，區間 "+span+"，"+basis+"，"+measured+trend+quality+provenance;
 }).filter(Boolean);
 const observations=selected.reduce((n,x)=>n+x.count,0);
 const intro="Victoria／CREAM 長期資料核對（只讀本裝置已授權之同帳號一般模式 CREAM 歷史）：\n"+
  "CREAM 已用數值原始觀察計算；Victoria 僅編排與挑選證據，不自行推估缺失數值。"+
  "不可混合單位、不作因果推論，也不可把舊數值當成即時值；必須保留數據區間、來源及資料品質。\n";
 return {context:(intro+lines.join("\n")).slice(0,3300),matchedMetrics:lines.length,
  inspectedMetrics:trends.length,snapshots:snapshotCount,from:ext.from,to:ext.to,observations};
}
