/** October → Diana → Detroit → Verifier: first REAL, local read-only slice.
 * No LLM inference, network, account access or backend authorization is implied.
 * Only a bounded user-supplied CSV can be sent to the pre-registered CREAM executor.
 * This foreground browser runtime must NOT be used as a server permission boundary.
 */
import {parseCreamCSV,type CreamChartKind,type CreamDataset,type CreamResult} from "../cream/core";
import {chooseDianaTool} from "./diana";
import {detroitBus,type DetroitCapabilityBus} from "./capability-bus";

type ReadonlyBus=Pick<DetroitCapabilityBus,"execute"|"isRunnable">;
type Phase="october"|"diana"|"detroit"|"verifier";
type StepStatus="completed"|"blocked"|"failed";
export type OctoberReadonlyStep={phase:Phase;status:StepStatus;code:string};
export type OctoberReadonlyTask={
 taskId:string;kind:"csv-descriptive-statistics";csv:string;source:string;
 privateMode:boolean;chartKind?:CreamChartKind|"auto"
};
export type OctoberReadonlyResult={
 taskId:string;runId:string;status:"verified"|"blocked"|"failed";
 tool:"cream"|null;modelInvoked:false;executionScope:"browser-local-readonly";
 steps:OctoberReadonlyStep[];reason:string;
 dataset?:CreamDataset;result?:CreamResult;
};
const CHARTS=new Set<string>(["auto","bar","line","scatter","pie","numberline"]);
const NUMBER=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const TOL=1e-9;
function numberOrNull(raw:string):number|null{
 const s=raw.trim();
 if(!NUMBER.test(s)||(/^0\d/.test(s)&&!/^0\./.test(s))||/^-0\d/.test(s))return null;
 const n=Number(s);return Number.isFinite(n)?n:null;
}
function close(actual:unknown,expected:number|null):boolean{
 if(expected===null)return actual===null;
 return typeof actual==="number"&&Number.isFinite(actual)&&
  Math.abs(actual-expected)<=TOL*Math.max(1,Math.abs(actual),Math.abs(expected));
}
/** Independent numerical recomputation; CREAM is the calculator, this is the verifier.
 * CREAM's CSV parser is reused so quoted CSV has one canonical interpretation.
 * We independently recompute count, sum, mean, median, min/max and sample deviation.
 */
export function verifyOctoberCream(dataset:CreamDataset,value:unknown):{ok:boolean;code:string}{
 if(!value||typeof value!=="object"||Array.isArray(value))return {ok:false,code:"INVALID_RECEIPT_RESULT"};
 const r=value as Partial<CreamResult>;
 if(r.version!==1||r.source!==dataset.source||r.rowCount!==dataset.rows.length||
  !Array.isArray(r.columns)||r.columns.length!==dataset.columns.length||
  r.columns.some((x,i)=>x!==dataset.columns[i])||
  !Array.isArray(r.metrics)||!Array.isArray(r.previewRows)||
  !CHARTS.has(String(r.chartKind))||r.chartKind==="auto")return {ok:false,code:"RECEIPT_SCHEMA_MISMATCH"};
 const preview=dataset.rows.slice(0,12);
 if(JSON.stringify(r.previewRows)!==JSON.stringify(preview))return {ok:false,code:"PREVIEW_MISMATCH"};
 const expected: Array<{column:number;key:string;n:number;missing:number;sum:number;mean:number;median:number;min:number;max:number;sampleStdDev:number|null;points:Array<{row:number;label:string;value:number}>}>=[];
 for(let col=0;col<dataset.columns.length;col++){
  const populated=dataset.rows.map((row,i)=>({raw:row[col]??"",index:i}))
   .filter(item=>item.raw.trim()!=="");
  if(!populated.length)continue;
  const numbers=populated.map(item=>numberOrNull(item.raw));
  if(numbers.some(v=>v===null))continue; // Mixed content is not a CREAM numeric column.
  const values=numbers as number[];
  const n=values.length;
  const sum=values.reduce((a,b)=>a+b,0);
  const mean=sum/n;
  const sorted=[...values].sort((a,b)=>a-b);
  const median=n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;
  // Welford online deviation, independent of CREAM's sum-of-squares path.
  let runningMean=0,m2=0,count=0;
  for(const x of values){count++;const delta=x-runningMean;runningMean+=delta/count;m2+=delta*(x-runningMean);}
  const sampleStdDev=n<2?null:Math.sqrt(m2/(n-1));
  const points=populated.slice(0,48).map((item,i)=>({
   row:dataset.rowNumbers[item.index]??item.index+2,
   label:col!==0?(dataset.rows[item.index][0]||("第 "+(item.index+1)+" 筆")):("第 "+(item.index+1)+" 筆"),
   value:values[i]
  }));
  expected.push({column:col,key:dataset.columns[col],n,missing:dataset.rows.length-n,
   sum,mean,median,min:sorted[0],max:sorted[n-1],sampleStdDev,points});
 }
 if(r.metrics.length!==expected.length)return {ok:false,code:"METRIC_COUNT_MISMATCH"};
 for(const m of expected){
  const out=r.metrics.find(x=>x?.column===m.column);
  if(!out||out.key!==m.key||out.n!==m.n||out.missing!==m.missing||
   !close(out.sum,m.sum)||!close(out.mean,m.mean)||!close(out.median,m.median)||
   !close(out.min,m.min)||!close(out.max,m.max)||!close(out.sampleStdDev,m.sampleStdDev)||
   !Array.isArray(out.points)||out.points.length!==m.points.length)return {ok:false,code:"METRIC_MISMATCH"};
  for(let i=0;i<m.points.length;i++){
   const p=out.points[i],e=m.points[i];
   if(!p||p.row!==e.row||p.label!==e.label||!close(p.value,e.value))
    return {ok:false,code:"POINT_MISMATCH"};
  }
 }
 return {ok:true,code:"INDEPENDENT_NUMERIC_CHECK_PASS"};
}
const validId=(v:unknown)=>typeof v==="string"&&/^[A-Za-z0-9_-]{8,80}$/.test(v);
export async function runOctoberReadonlyCsv(task:OctoberReadonlyTask,options:{
 bus?:ReadonlyBus;signal?:AbortSignal
}={}):Promise<OctoberReadonlyResult>{
 const runId=crypto.randomUUID();
 const steps:OctoberReadonlyStep[]=[];
 const finish=(status:"verified"|"blocked"|"failed",reason:string,extra:Partial<OctoberReadonlyResult>={}):OctoberReadonlyResult=>({
  taskId:typeof task?.taskId==="string"?task.taskId.slice(0,80):"",
  runId,status,tool:null,modelInvoked:false,executionScope:"browser-local-readonly",
  steps:[...steps],reason,...extra
 });
 if(!task||!validId(task.taskId)||task.kind!=="csv-descriptive-statistics"||
    typeof task.csv!=="string"||!task.csv.trim()||task.csv.length>2_000_000||
    typeof task.source!=="string"||!task.source.trim()||task.source.length>120||
    typeof task.privateMode!=="boolean"||!CHARTS.has(task.chartKind??"auto")){
  steps.push({phase:"october",status:"blocked",code:"INVALID_TASK_CONTRACT"});
  return finish("blocked","INVALID_TASK_CONTRACT");
 }
 if(options.signal?.aborted){
  steps.push({phase:"october",status:"blocked",code:"CANCELLED"});
  return finish("blocked","CANCELLED");
 }
 let dataset:CreamDataset;
 try{dataset=parseCreamCSV(task.csv,task.source);}
 catch{
  steps.push({phase:"october",status:"blocked",code:"INVALID_CSV"});
  return finish("blocked","INVALID_CSV");
 }
 steps.push({phase:"october",status:"completed",code:"VALIDATED_READONLY_PLAN_NO_LLM"});
 // Diana selects a registry-listed native capability, not a model-produced tool name.
 const decision=chooseDianaTool("請分析 CSV 統計數據",{privateMode:task.privateMode,hasCreamResult:true});
 const bus=options.bus??detroitBus;
 if(decision.tool!=="cream"||!bus.isRunnable("cream")){
  steps.push({phase:"diana",status:"blocked",code:"NO_APPROVED_READONLY_EXECUTOR"});
  return finish("blocked","NO_APPROVED_READONLY_EXECUTOR");
 }
 steps.push({phase:"diana",status:"completed",code:"ALLOWLIST_CREAM"});
 try{
  const receipt=await bus.execute("cream",{csv:task.csv,source:dataset.source},
   {privateMode:task.privateMode,signal:options.signal});
  if(options.signal?.aborted){
   steps.push({phase:"detroit",status:"blocked",code:"CANCELLED"});
   return finish("blocked","CANCELLED",{tool:"cream"});
  }
  if(receipt.capability!=="cream"||receipt.status!=="completed"){
   steps.push({phase:"detroit",status:"failed",code:"INVALID_EXECUTOR_RECEIPT"});
   return finish("failed","INVALID_EXECUTOR_RECEIPT",{tool:"cream"});
  }
  steps.push({phase:"detroit",status:"completed",code:"EXECUTOR_RETURNED"});
  const check=verifyOctoberCream(dataset,receipt.result);
  if(!check.ok){
   steps.push({phase:"verifier",status:"failed",code:check.code});
   return finish("failed",check.code,{tool:"cream"});
  }
  const actual=receipt.result as CreamResult;
  // Chart choice is presentation-only; numeric verification preceded this override.
  const result=task.chartKind&&task.chartKind!=="auto"?{...actual,chartKind:task.chartKind}:actual;
  steps.push({phase:"verifier",status:"completed",code:check.code});
  return finish("verified","VERIFIED_LOCAL_RECEIPT",{tool:"cream",dataset,result});
 }catch(error){
  const cancelled=options.signal?.aborted===true;
  steps.push({phase:"detroit",status:cancelled?"blocked":"failed",code:cancelled?"CANCELLED":"EXECUTOR_ERROR"});
  // Do not echo exception bodies; they might contain private CSV or an injected prompt.
  void error;
  return finish(cancelled?"blocked":"failed",cancelled?"CANCELLED":"EXECUTOR_ERROR",{tool:"cream"});
 }
}
