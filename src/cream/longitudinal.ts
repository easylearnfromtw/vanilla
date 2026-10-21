/** CREAM Longitudinal: deterministic temporal metrics, provenance, reproducible plans.
 * No model-invented measurements, inferred causality or automatic medical advice.
 */
import type {CreamDataset} from "./core.ts";
export type SeriesDirection="increase"|"decrease"|"maintain";
export type CreamObservation={date:string;metric:string;unit:string;value:number;source:string;sourceRow:number};
export type CreamGoal={metric:string;unit:string;target:number;direction:SeriesDirection;dueDate?:string};
export type CreamSnapshot={id:string;owner:string;source:string;importedAt:string;fingerprint:string;observations:CreamObservation[];rowsAnalyzed:number;warnings:string[]};
export type CreamTrend={
 metric:string;unit:string;count:number;uniqueDates:number;firstDate:string;lastDate:string;
 first:number;latest:number;change:number;changePercent:number|null;mean:number;min:number;max:number;
 slopePer30Days:number|null;volatility:number|null;outliers:number;quality:string[];direction:"rising"|"falling"|"stable"|"insufficient";
 goal?:{target:number;direction:SeriesDirection;gap:number;met:boolean;dueDate?:string};
 insights:string[];recommendations:string[];points:{date:string;value:number;source:string}[];
};
const MAX_OBSERVATIONS=3000;
export const numberValue=(raw:string):number|null=>{
 const s=String(raw??"").trim().replace(/,/g,"");
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s)||/^0\d/.test(s))return null;
 const v=Number(s);return Number.isFinite(v)?v:null;
};
export function parseDate(value:string):string|null{
 const s=String(value).trim();
 const match=/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
 if(!match)return null;
 const y=+match[1],m=+match[2],d=+match[3];
 if(y<1900||y>2100||m<1||m>12||d<1||d>31)return null;
 const dt=new Date(Date.UTC(y,m-1,d));
 if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)return null;
 return [y,String(m).padStart(2,"0"),String(d).padStart(2,"0")].join("-");
}
function dateDays(date:string):number{return Date.parse(date+"T00:00:00Z")/86400000;}
function taggedHeader(header:string):{metric:string;unit:string}{
 const m=/^(.+?)\s*[(（\[]\s*([^()（）\[\]]{1,20})\s*[)）\]]$/.exec(header.trim());
 return {metric:(m?m[1]:header).trim().slice(0,80),unit:(m?m[2]:"").trim().slice(0,24)};
}
export function datasetObservations(dataset:CreamDataset):{observations:CreamObservation[];warnings:string[]}{
 const warnings:string[]=[],obs:CreamObservation[]=[];
 const colDate=dataset.columns.findIndex((c,i)=>/^(date|day|日期|時間|timestamp|測量日期|紀錄日)$/i.test(c.trim())||
  (dataset.rows.length>0&&dataset.rows.filter(r=>parseDate(r[i]||"")).length>=Math.max(1,Math.ceil(dataset.rows.length*.8))));
 const longMetric=dataset.columns.findIndex(c=>/^(metric|indicator|指標|項目|名稱)$/i.test(c.trim()));
 const longValue=dataset.columns.findIndex(c=>/^(value|數值|測量值|結果)$/i.test(c.trim()));
 const longUnit=dataset.columns.findIndex(c=>/^(unit|單位)$/i.test(c.trim()));
 let usedFallback=false,skipped=0;
 for(let rowIndex=0;rowIndex<dataset.rows.length&&obs.length<MAX_OBSERVATIONS;rowIndex++){
  const row=dataset.rows[rowIndex];
  const date=(colDate>=0?parseDate(row[colDate]||""):null)||
   (colDate<0?parseDate(dataset.importedAt.slice(0,10)):null);
  if(!date){skipped++;continue;}
  if(colDate<0)usedFallback=true;
  if(longMetric>=0&&longValue>=0){
   const v=numberValue(row[longValue]||"");
   const metric=(row[longMetric]||"").trim().slice(0,80);
   if(v!==null&&metric)obs.push({date,metric,unit:(longUnit>=0?row[longUnit]||"":"").slice(0,24),
    value:v,source:dataset.source,sourceRow:dataset.rowNumbers[rowIndex]??rowIndex+2});
   continue;
  }
  for(let col=0;col<dataset.columns.length;col++){
   if(col===colDate)continue;
   const raw=row[col]||"",v=numberValue(raw);
   if(v===null)continue;
   const header=taggedHeader(dataset.columns[col]);
   if(!header.metric||/^(id|編號|序號|index|row|year|年份|時間戳)$/i.test(header.metric))continue;
   obs.push({date,metric:header.metric,unit:header.unit,value:v,source:dataset.source,
    sourceRow:dataset.rowNumbers[rowIndex]??rowIndex+2});
   if(obs.length>=MAX_OBSERVATIONS)break;
  }
 }
 if(usedFallback)warnings.push("未提供可解析日期欄，將此份資料的數值視為匯入當天觀察；此結果不等同於實際測量日期");
 if(skipped)warnings.push(skipped+" 列缺少合法日期，已略過");
 if(obs.length>=MAX_OBSERVATIONS)warnings.push("單次匯入已達 3000 筆指標上限，其餘資料未併入長期追蹤");
 if(!obs.length)warnings.push("沒有可辨識的日期與數值配對；CREAM 仍可做單次描述統計");
 return {observations:obs,warnings};
}
function fingerprint(observations:CreamObservation[],source:string):string{
 const raw=source+"\n"+observations.map(o=>[o.date,o.metric,o.unit,o.value,o.sourceRow].join("|")).join("\n");
 let h=2166136261;
 for(let i=0;i<raw.length;i++)h=Math.imul(h^raw.charCodeAt(i),16777619);
 return (h>>>0).toString(16).padStart(8,"0")+"-"+observations.length;
}
export function makeCreamSnapshot(dataset:CreamDataset,owner:string):CreamSnapshot{
 if(!owner)throw Error("CREAM 必須有可辨識的個人資料空間");
 const {observations,warnings}=datasetObservations(dataset);
 return {id:crypto.randomUUID(),owner,source:dataset.source,importedAt:dataset.importedAt,
  fingerprint:fingerprint(observations,dataset.source),observations,rowsAnalyzed:dataset.rows.length,warnings};
}
function median(values:number[]):number{
 const x=[...values].sort((a,b)=>a-b),m=Math.floor(x.length/2);
 return x.length%2?x[m]:(x[m-1]+x[m])/2;
}
export function analyzeLongitudinal(observations:CreamObservation[],goal?:CreamGoal):CreamTrend[]{
 const groups=new Map<string,CreamObservation[]>();
 for(const o of observations){
  if(!parseDate(o.date)||!Number.isFinite(o.value)||!o.metric.trim())continue;
  const key=o.metric.trim().toLowerCase()+"\u0000"+o.unit.trim().toLowerCase();
  const existing=groups.get(key);
  if(existing)existing.push(o);
  else groups.set(key,[o]);
 }
 const output:CreamTrend[]=[];
 for(const data of groups.values()){
  if(!data.length)continue;
  data.sort((a,b)=>a.date.localeCompare(b.date)||a.sourceRow-b.sourceRow);
  // If multiple measurements occur on a day, use daily mean for trend
  // and keep the per-measurement count/total provenance.
  const byDay=new Map<string,{sum:number;n:number;source:string}>();
  for(const o of data){const day=byDay.get(o.date)||{sum:0,n:0,source:o.source};day.sum+=o.value;day.n++;byDay.set(o.date,day);}
  const points=[...byDay].sort(([a],[b])=>a.localeCompare(b)).map(([date,d])=>({date,value:d.sum/d.n,source:d.source}));
  const ys=points.map(p=>p.value),n=ys.length,first=ys[0],latest=ys[n-1],change=latest-first;
  const xs=points.map(p=>dateDays(p.date)-dateDays(points[0].date));
  const xm=xs.reduce((a,b)=>a+b,0)/n,ym=ys.reduce((a,b)=>a+b,0)/n;
  const xx=xs.reduce((s,x)=>s+(x-xm)**2,0);
  const slope=n>=3&&xx>0?xs.reduce((sum,x,i)=>sum+(x-xm)*(ys[i]-ym),0)/xx*30:null;
  const sd=n>=2?Math.sqrt(ys.reduce((z,y)=>z+(y-ym)**2,0)/(n-1)):null;
  const centre=median(ys),mad=n>=5?median(ys.map(y=>Math.abs(y-centre))):0;
  const outliers=mad>0?ys.filter(y=>Math.abs(y-centre)>3.5*1.4826*mad).length:0;
  const quality:string[]=[],insights:string[]=[],recommendations:string[]=[];
  if(n<3)quality.push("不同日期資料少於 3 筆，尚不足以評估可靠趨勢");
  if(data.length>n)quality.push("同一天有多次測量；趨勢採用當日平均，未刪除原始記錄");
  const days=xs[n-1]-xs[0];
  if(n>=3&&days>90&&days/(n-1)>45)quality.push("採樣間隔偏長，趨勢可能受缺漏影響");
  if(outliers)quality.push("偵測到 "+outliers+" 個可能異常值，請先核對量測與匯入品質");
  const changePct=first!==0?change/Math.abs(first)*100:null;
  const threshold=Math.max(0.0000001,Math.abs(ym)*.005);
  const trend:"rising"|"falling"|"stable"|"insufficient"=slope===null?"insufficient":slope>threshold?"rising":slope<-threshold?"falling":"stable";
  insights.push("從 "+points[0].date+" 到 "+points[n-1].date+"，日均觀測值由 "+first.toFixed(2)+" 變為 "+latest.toFixed(2)+
   "，差值 "+(change>=0?"+":"")+change.toFixed(2)+(changePct===null?"":"（"+changePct.toFixed(1)+"%）"));
  if(slope!==null)insights.push("線性趨勢約每 30 天 "+(slope>=0?"+":"")+slope.toFixed(2)+
   " "+(data[0].unit||"單位")+"；這只是觀測趨勢，不代表因果或未來預測");
  if(goal&&goal.metric.trim().toLowerCase()===data[0].metric.trim().toLowerCase()&&
     goal.unit.trim().toLowerCase()===data[0].unit.trim().toLowerCase()){
   const met=goal.direction==="increase"?latest>=goal.target:goal.direction==="decrease"?latest<=goal.target:
    Math.abs(latest-goal.target)<=Math.max(.001,Math.abs(goal.target)*.03);
   insights.push("目標 "+goal.direction+" 至 "+goal.target+" "+goal.unit+"；"+(met?"目前已達到":"目前與目標相差 "+Math.abs(goal.target-latest).toFixed(2)));
   if(!met)recommendations.push("先訂定下次量測日期並追蹤與目標的差距，調整方案前應確認數據品質與可控因素");
  }
  if(n<3)recommendations.push("先累積至少 3 個不同日期的紀錄，建立基線後再比較變化");
  if(outliers)recommendations.push("優先核對異常值的原始來源與單位，避免誤判成長期變化");
  if(!recommendations.length)recommendations.push("維持一致的記錄頻率與單位，下一期對照新觀察資料檢查變化是否持續");
  output.push({metric:data[0].metric,unit:data[0].unit,count:data.length,uniqueDates:n,
   firstDate:points[0].date,lastDate:points[n-1].date,first,latest,change,
   changePercent:changePct,mean:ym,min:Math.min(...ys),max:Math.max(...ys),slopePer30Days:slope,
   volatility:sd,outliers,quality,direction:trend,insights,recommendations,points,
   ...(goal&&goal.metric.toLowerCase()===data[0].metric.toLowerCase()&&goal.unit.toLowerCase()===data[0].unit.toLowerCase()?
    {goal:{target:goal.target,direction:goal.direction,gap:goal.target-latest,
      met:goal.direction==="increase"?latest>=goal.target:goal.direction==="decrease"?latest<=goal.target:
        Math.abs(latest-goal.target)<=Math.max(.001,Math.abs(goal.target)*.03),dueDate:goal.dueDate}}:{})});
 }
 return output.sort((a,b)=>b.count-a.count||a.metric.localeCompare(b.metric));
}
/** Text ingestion is conservative: recognized explicit date + metric + numeric
 * lines only; prose cannot silently become a measurement.
 */
export function extractTextMeasurements(input:string,source="對話紀錄"):CreamDataset|null{
 const rows=[["日期","指標","數值","單位"]],lines=input.split(/\r?\n/).slice(0,1500);
 const pattern=/^\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s*[,，\t|：:\s]+\s*([\p{L}\p{N}_\u4e00-\u9fff\s-]{1,45}?)\s*[:=：,，\t ]+\s*([+-]?\d+(?:\.\d+)?)\s*([^\d\s,，]{0,12})\s*$/u;
 for(const raw of lines){
  const match=pattern.exec(raw.trim());
  if(!match||!parseDate(match[1])||numberValue(match[3])===null)continue;
  const metric=match[2].trim();if(!metric)continue;
  rows.push([parseDate(match[1])!,metric,match[3],match[4]||""]);
  if(rows.length>1001)break;
 }
 if(rows.length<2)return null;
 return {source,columns:rows[0],rows:rows.slice(1),rowNumbers:rows.slice(1).map((_,i)=>i+2),importedAt:new Date().toISOString()};
}
