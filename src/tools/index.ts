import {ToolRegistry,isObject,canRead,type RecordPolicy,type MemberId} from "./core";
export const vanillaTools=new ToolRegistry();
type Item={id:string;title:string;start:string;end:string;policy:RecordPolicy};
type Doc={id:string;text:string;policy:RecordPolicy};
type HealthEntry={date:string;metric:string;value:number;unit:string;policy:RecordPolicy};
const calendar:Item[]=[];
const documents:Doc[]=[];
const health:HealthEntry[]=[];
const str=(x:unknown):x is string=>typeof x==="string"&&x.length>0;
vanillaTools.register({
 name:"calendar.list",domain:"calendar",description:"查看授權範圍內的行程",mutates:false,
 validate:(v):v is {from:string;to:string}=>isObject(v)&&str(v.from)&&str(v.to),
 run:async ({from,to},ctx)=>calendar.filter(x=>canRead(ctx.principal,x.policy)&&x.start>=from&&x.start<=to)
});
vanillaTools.register({
 name:"calendar.add",domain:"calendar",description:"新增個人行程",mutates:true,
 validate:(v):v is {title:string;start:string;end:string}=>isObject(v)&&str(v.title)&&str(v.start)&&str(v.end),
 run:async (v,ctx)=>{if(Number.isNaN(Date.parse(v.start))||Number.isNaN(Date.parse(v.end))||Date.parse(v.end)<=Date.parse(v.start))throw new Error("Invalid date range");
 const item:Item={...v,id:crypto.randomUUID(),policy:{owner:ctx.principal.memberId,scope:"private",domain:"calendar"}};calendar.push(item);return item;}
});
vanillaTools.register({
 name:"knowledge.search",domain:"knowledge",description:"搜尋已授權的知識文件",mutates:false,
 validate:(v):v is {query:string}=>isObject(v)&&str(v.query),
 run:async ({query},ctx)=>documents.filter(d=>canRead(ctx.principal,d.policy)&&d.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(d=>({id:d.id,excerpt:d.text.slice(0,400)}))
});
vanillaTools.register({
 name:"knowledge.add",domain:"knowledge",description:"加入個人文字筆記",mutates:true,
 validate:(v):v is {text:string}=>isObject(v)&&str(v.text)&&v.text.length<=50000,
 run:async ({text},ctx)=>{const d:Doc={id:crypto.randomUUID(),text,policy:{owner:ctx.principal.memberId,scope:"private",domain:"knowledge"}};documents.push(d);return {id:d.id};}
});
vanillaTools.register({
 name:"travel.plan",domain:"travel",description:"計算旅程日期與每人預算",mutates:false,
 validate:(v):v is {destination:string;start:string;end:string;people:number;totalBudget:number}=>isObject(v)&&str(v.destination)&&str(v.start)&&str(v.end)&&Number.isInteger(v.people)&&Number(v.people)>0&&typeof v.totalBudget==="number"&&Number.isFinite(v.totalBudget)&&v.totalBudget>=0,
 run:async v=>{const days=Math.ceil((Date.parse(v.end)-Date.parse(v.start))/86400000)+1;if(!Number.isFinite(days)||days<1||days>365)throw new Error("Invalid travel dates");return {destination:v.destination,days,people:v.people,budgetPerPerson:v.totalBudget/v.people,note:"預算試算，未查詢即時交通或住宿價格"};}
});
vanillaTools.register({
 name:"health.analyze",domain:"health",description:"計算個人健康指標平均與趨勢",mutates:false,
 validate:(v):v is {metric:string}=>isObject(v)&&str(v.metric),
 run:async ({metric},ctx)=>{const entries=health.filter(x=>x.policy.owner===ctx.principal.memberId&&x.metric===metric).sort((a,b)=>a.date.localeCompare(b.date));return {count:entries.length,mean:entries.length?entries.reduce((s,x)=>s+x.value,0)/entries.length:null,change:entries.length>1?entries[entries.length-1].value-entries[0].value:null,unit:entries[0]?.unit??null};}
});
vanillaTools.register({
 name:"health.add",domain:"health",description:"儲存個人健康紀錄",mutates:true,
 validate:(v):v is {date:string;metric:string;value:number;unit:string}=>isObject(v)&&str(v.date)&&str(v.metric)&&str(v.unit)&&typeof v.value==="number"&&Number.isFinite(v.value),
 run:async (v,ctx)=>{const entry:HealthEntry={...v,policy:{owner:ctx.principal.memberId,scope:"private",domain:"health"}};health.push(entry);return {saved:true};}
});
export type {MemberId};
