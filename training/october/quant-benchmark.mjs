#!/usr/bin/env node
/** 50 synthetic, mathematically checkable blind questions.
 * Measures narrow numeric correctness; does NOT score clinical/legal judgment.
 * Explicit local Ollama required for inference; CI uses transport mocks.
 */
import {writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const KINDS=["growth","margin","conversion","break-even","weighted-mean","median","sample-sd","npv","runway","absolute-risk-reduction"];
const perKind=5;
function rng(seed){let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const int=(rand,lo,hi)=>lo+Math.floor(rand()*(hi-lo+1));
const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
function caseFor(kind,i,r){
 let expected,unit,question;
 if(kind==="growth"){
  const old=int(r,55,450),newer=old+int(r,8,95);
  expected=round2((newer-old)/old*100);unit="%";
  question="上期銷售額 "+old+" 萬元，本期 "+newer+" 萬元。相對上期成長率多少？";
 }else if(kind==="margin"){
  const sales=int(r,200,900),cost=int(r,80,sales-20);
  expected=round2((sales-cost)/sales*100);unit="%";
  question="營收 "+sales+" 萬元，銷貨成本 "+cost+" 萬元。毛利率多少？";
 }else if(kind==="conversion"){
  const visits=int(r,350,3000),paid=int(r,18,Math.floor(visits/3));
  expected=round2(paid/visits*100);unit="%";
  question=visits+" 人訪問網站，"+paid+" 人付費。轉換率多少？";
 }else if(kind==="break-even"){
  const fixed=int(r,1000,15000),price=int(r,55,130),variable=int(r,12,price-8);
  expected=Math.ceil(fixed/(price-variable));unit="件";
  question="固定成本 "+fixed+" 元，單件售價 "+price+" 元，變動成本 "+variable+" 元。至少賣出幾件達損益兩平？僅可賣整件。";
 }else if(kind==="weighted-mean"){
  const n1=int(r,5,18),n2=int(r,6,20),m1=int(r,12,50),m2=int(r,51,95);
  expected=round2((n1*m1+n2*m2)/(n1+n2));unit="分";
  question="A組 "+n1+" 人平均 "+m1+" 分；B組 "+n2+" 人平均 "+m2+" 分。合併平均幾分？";
 }else if(kind==="median"){
  const values=Array.from({length:i%2?6:5},()=>int(r,3,80));
  const sorted=[...values].sort((a,b)=>a-b);
  expected=sorted.length%2?(sorted[(sorted.length-1)/2]):(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;unit="分";
  question="分數 "+values.join("、")+"。中位數是多少？";
 }else if(kind==="sample-sd"){
  const values=Array.from({length:5},()=>int(r,1,16));
  const avg=values.reduce((a,b)=>a+b,0)/5;
  expected=round2(Math.sqrt(values.reduce((s,v)=>s+(v-avg)**2,0)/4));unit="分";
  question="樣本數據（分）"+values.join("、")+"。求樣本標準差，使用 n-1 分母。";
 }else if(kind==="npv"){
  const initial=int(r,50,180),cf1=int(r,30,110),cf2=int(r,40,125),rate=int(r,3,15);
  expected=round2(-initial+cf1/(1+rate/100)+cf2/(1+rate/100)**2);unit="萬元";
  question="即刻投入 "+initial+" 萬元，第一年末獲 "+cf1+" 萬元，第二年末獲 "+cf2+" 萬元，年折現率 "+rate+"%。NPV 是多少？";
 }else if(kind==="runway"){
  const cash=int(r,90,420),income=int(r,8,30),expense=int(r,income+6,70);
  expected=round2(cash/(expense-income));unit="月";
  question="現金 "+cash+" 萬元，每月流入 "+income+" 萬元、流出 "+expense+" 萬元。假設固定淨支出，現金能支應幾個月？";
 }else if(kind==="absolute-risk-reduction"){
  const before=int(r,8,45),after=int(r,1,before-2);
  expected=before-after;unit="百分點";
  question="治療前事件率 "+before+"%，治療後 "+after+"%。絕對風險降低幾個百分點（不是相對風險）？";
 }else throw Error("Unknown numerical template");
 return {id:kind+"-"+String(i+1).padStart(2,"0"),kind,unit,expected,
  prompt:"只回覆單一 JSON 物件，恰好包含 value（數字）與 unit（字串），沒有文字或額外欄位。數值四捨五入至小數點後兩位，unit 必須是「"+unit+"」。問題："+question};
}
export function makeOctoberQuantCases(seed=20261021){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error("INVALID_SEED");
 const r=rng(seed);
 return KINDS.flatMap(k=>Array.from({length:perKind},(_,i)=>caseFor(k,i,r)));
}
/** Only strict final JSON is graded, never cherry-picked numbers in prose. */
export function gradeOctoberQuantReply(answer,c){
 if(typeof answer!=="string"||answer.length>2000||!answer.trim())return {pass:false,reason:"EMPTY"};
 let obj;
 try{obj=JSON.parse(answer);}catch{return {pass:false,reason:"NOT_JSON"};}
 if(!obj||Array.isArray(obj)||typeof obj!=="object"||
    Object.keys(obj).sort().join(",")!=="unit,value"||
    typeof obj.value!=="number"||!Number.isFinite(obj.value)||
    typeof obj.unit!=="string")return {pass:false,reason:"SCHEMA"};
 if(obj.unit!==c.unit)return {pass:false,reason:"UNIT"};
 if(Math.abs(obj.value-c.expected)>0.011)return {pass:false,reason:"VALUE"};
 return {pass:true,reason:"PASS"};
}
export const OCTOBER_QUANT_GENERATION=Object.freeze({temperature:0,top_p:1,num_ctx:4096,num_predict:128,seed:20261021,think:false,format:"json"});
async function callOllama(options,model,prompt){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),options.timeoutMs??120000);
 const start=performance.now();
 try{
  const response=await fetch(options.endpoint+"/api/chat",{
   method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json"},
   body:JSON.stringify({model,stream:false,think:false,format:"json",keep_alive:"5m",
    messages:[{role:"user",content:prompt}],
    options:{temperature:0,top_p:1,num_ctx:4096,num_predict:128,seed:20261021}})
  });
  if(!response.ok)throw Error("OLLAMA_HTTP_ERROR");
  const result=await response.json();
  if(!result?.done||result.done_reason==="length"||
     typeof result.message?.content!=="string")throw Error("INCOMPLETE_RESPONSE");
  return {text:result.message.content,latencyMs:Math.round(performance.now()-start),
   promptTokens:Number.isFinite(result.prompt_eval_count)?result.prompt_eval_count:null,
   outputTokens:Number.isFinite(result.eval_count)?result.eval_count:null};
 }finally{clearTimeout(timeout);}
}
export async function runOctoberQuantBenchmark(options,inferFn=callOllama){
 const tests=makeOctoberQuantCases(options.seed??20261021).slice(0,options.maxCases??50);
 if(!Array.isArray(options.models)||options.models.length<1||options.models.length>3||
    options.models.some(x=>typeof x!=="string"||!/^[\w.:-]{2,90}$/.test(x))||
    tests.length<1)throw Error("INVALID_BENCH_SCOPE");
 const results={suite:"October numeric stress v1",createdAt:new Date().toISOString(),
  models:options.models,protocol:OCTOBER_QUANT_GENERATION,cases:tests.length,summary:[],trials:[]};
 for(let i=0;i<tests.length;i++){
  const item=tests[i];
  // Balance model ordering instead of always warming one model first.
  for(let offset=0;offset<options.models.length;offset++){
   const model=options.models[(i+offset)%options.models.length];
   let out={text:"",latencyMs:null,promptTokens:null,outputTokens:null};
   try{out=await inferFn(options,model,item.prompt);}catch{/* failure is scored */}
   const score=gradeOctoberQuantReply(out.text,item);
   results.trials.push({model,caseId:item.id,domain:item.kind,pass:score.pass,
    reason:score.reason,latencyMs:out.latencyMs,promptTokens:out.promptTokens,
    outputTokens:out.outputTokens});
  }
 }
 const avg=(rows,key)=>{
  const nums=rows.map(x=>x[key]).filter(x=>typeof x==="number"&&Number.isFinite(x));
  return nums.length?Math.round(nums.reduce((s,v)=>s+v,0)/nums.length*100)/100:null;
 };
 for(const model of options.models){
  const rows=results.trials.filter(x=>x.model===model);
  results.summary.push({model,questions:rows.length,
   strictNumericAccuracy:rows.filter(x=>x.pass).length/rows.length,
   failures:rows.filter(x=>!x.pass).length,avgLatencyMs:avg(rows,"latencyMs"),
   avgPromptTokens:avg(rows,"promptTokens"),avgOutputTokens:avg(rows,"outputTokens")});
 }
 return results;
}
async function main(){
 let models=["october:0.3","qwen3:4b"],cases=50,output="";
 const args=process.argv.slice(2);
 for(let i=0;i<args.length;i++){
  if(args[i]==="--models"&&args[i+1])models=args[++i].split(",");
  else if(args[i]==="--cases"&&args[i+1])cases=Number(args[++i]);
  else if(args[i]==="--output"&&args[i+1])output=args[++i];
  else throw Error("Unsupported argument: "+args[i]);
 }
 if(!Number.isInteger(cases)||cases<1||cases>50||
    models.length<1||models.length>3||models.some(x=>!/^[\w.:-]{2,90}$/.test(x)))
  throw Error("INVALID_ARGUMENTS");
 const report=await runOctoberQuantBenchmark({endpoint:"http://127.0.0.1:11434",models,maxCases:cases,timeoutMs:120000});
 if(output){
  const file=resolve(output);
  mkdirSync(dirname(file),{recursive:true});
  writeFileSync(file,JSON.stringify(report,null,2)+"\n","utf8");
 }
 console.log(JSON.stringify(report.summary,null,2));
 console.log("This benchmark measures only narrow numeric answers, not general LLM accuracy.");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))
 main().catch(e=>{console.error("October quant benchmark failed: "+String(e.message||e));process.exitCode=1;});
