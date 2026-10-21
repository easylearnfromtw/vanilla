#!/usr/bin/env node
/**
 * Sign Well Agent integrated A/B/C offline execution sandbox.
 *
 * STRICT BOUNDARY: no network, OS commands, trading, files, user secrets, or
 * customer operations. This is a deterministic oracle/mock, not a live agent.
 */
import {createHash} from "node:crypto";

export const TOOL_ALLOWLIST=Object.freeze([
 "mock.metrics.read","mock.luca.inspect","mock.economics.adjust_cost",
 "mock.management.unit_economics","mock.accounting.reconcile",
 "mock.finance.npv","mock.actuarial.expected_loss",
 "mock.policy.decide","mock.report.write"
]);
const round=(x)=>Math.round((x+Number.EPSILON)*100)/100;
const digest=(o)=>createHash("sha256").update(JSON.stringify(o)).digest("hex");
const fail=(code,detail)=>({status:"blocked",code,detail,steps:[],sideEffects:0});
function scalar(x,name,{min=0,max=1e12}={}){
 if(typeof x!=="number"||!Number.isFinite(x)||x<min||x>max)
  throw Error("INVALID_INPUT: "+name);
 return x;
}
const validate=(d)=>{
 if(!d||typeof d!=="object"||Array.isArray(d))throw Error("INVALID_INPUT: dataset");
 for(const k of ["leads","price","variableCost","fixedCost","cash","receivables","liabilities","initialInvestment","annualContracts","averageIncidentCost"])scalar(d[k],k);
 for(const k of ["conversionRate","inflationRate","discountRate","annualIncidentFrequency"])scalar(d[k],k,{min:0,max:1});
 const years=scalar(d.years,"years",{min:1,max:10});
 if(!Number.isInteger(years))throw Error("INVALID_INPUT: years");
 if(d.price<d.variableCost)throw Error("INVALID_INPUT: price below variable cost for this exercise");
 if(d.cash+d.receivables<d.liabilities)throw Error("INVALID_INPUT: opening assets less than liabilities in this exercise");
};
export function crossDisciplineAnalysis(d){
 validate(d);
 const simulatedCustomers=d.leads*d.conversionRate;
 const monthlyRevenue=simulatedCustomers*d.price;
 const monthlyVariableCost=simulatedCustomers*d.variableCost;
 const monthlyFixedCost=d.fixedCost*(1+d.inflationRate);
 const monthlyOperatingResult=monthlyRevenue-monthlyVariableCost-monthlyFixedCost;
 const expectedAnnualIncidentCost=d.annualContracts*d.annualIncidentFrequency*d.averageIncidentCost;
 const openingEquity=d.cash+d.receivables-d.liabilities; // Opening balance, NOT closing retained earnings.
 const annualRiskAdjustedFlow=monthlyOperatingResult*12-expectedAnnualIncidentCost;
 const npv=-d.initialInvestment+Array.from({length:d.years},(_,i)=>annualRiskAdjustedFlow/Math.pow(1+d.discountRate,i+1)).reduce((a,b)=>a+b,0);
 const runwayMonths=monthlyOperatingResult<0?d.cash/(-monthlyOperatingResult):null;
 return {
  economics:{inflationRate:d.inflationRate,adjustedMonthlyFixedCost:round(monthlyFixedCost)},
  management:{simulatedCustomers:round(simulatedCustomers),monthlyRevenue:round(monthlyRevenue),monthlyOperatingResult:round(monthlyOperatingResult)},
  accounting:{openingAssets:round(d.cash+d.receivables),openingLiabilities:round(d.liabilities),openingEquity:round(openingEquity),periodOperatingResult:round(monthlyOperatingResult)},
  finance:{riskAdjustedAnnualFlow:round(annualRiskAdjustedFlow),npv:round(npv),runwayMonths:runwayMonths===null?null:round(runwayMonths)},
  actuarial:{expectedAnnualIncidentCost:round(expectedAnnualIncidentCost),method:"frequency × mean severity; synthetic assumption"}
 };
}
export function mockDecision(analysis){
 const risks=[];
 if(analysis.finance.npv<0)risks.push("negative_npv");
 if(analysis.management.monthlyOperatingResult<0)risks.push("operating_loss");
 if(analysis.finance.runwayMonths!==null&&analysis.finance.runwayMonths<6)risks.push("low_runway");
 // Reporting is allowed; modifying accounts, pricing or investments is not.
 return {recommendation:risks.length?"investigate_before_action":"monitor_and_report",risks,authorizedBusinessAction:"none"};
}
function limitedTrace(trace,name,output){
 if(!TOOL_ALLOWLIST.includes(name))throw Error("TOOL_NOT_ALLOWED");
 trace.push({step:trace.length+1,tool:name,evidence:digest(output).slice(0,20)});
}
export class SimulationEngine{
 constructor(){this.records=new Map();this.reports=new Map();this.audit=[];this.killSwitch=false;}
 stop(){this.killSwitch=true;}
 resume(){this.killSwitch=false;}
 run(job,context={},options={}){
  const now=Date.parse(context.now??"2026-10-20T00:00:00Z");
  if(!job||typeof job!=="object"||typeof job.id!=="string"||!/^[-a-zA-Z0-9_]{3,72}$/.test(job.id)||typeof job.tenantId!=="string"||!/^[-a-zA-Z0-9_]{3,72}$/.test(job.tenantId))return fail("INVALID_JOB","id and tenantId are required");
  // Real deployment must derive actorTenantId and scopes from verified auth, never from model output.
  if(context.actorTenantId!==job.tenantId)return fail("TENANT_SCOPE_DENIED","tenant mismatch");
  const scopes=new Set(context.scopes??[]);
  const mode=job.kind==="ops"?"ops":job.kind==="business"?"business":null;
  if(!mode)return fail("UNKNOWN_WORKFLOW","only ops and business demo workflows are enabled");
  const required=mode==="ops"?["metrics:read","ops:diagnose"]:["metrics:read","report:write"];
  if(required.some(s=>!scopes.has(s)))return fail("SCOPE_DENIED","missing required mock scope");
  if(!Number.isFinite(now)||!Number.isFinite(Date.parse(job.dueAt)))return fail("INVALID_SCHEDULE","valid ISO dates required");
  if(this.killSwitch)return fail("KILL_SWITCH","engine stopped");
  const fingerprint=digest(job),key=job.tenantId+"::"+job.id,prev=this.records.get(key);
  if(prev&&prev.fingerprint!==fingerprint)return fail("IDEMPOTENCY_CONFLICT","job ID reused with different input");
  if(prev?.status==="completed")return {...prev.result,replayed:true};
  if(now<Date.parse(job.dueAt))return {status:"not_due",code:"NOT_DUE",steps:[],sideEffects:0};
  const steps=[];
  try{
   if(mode==="ops"){
    const total=scalar(job.dataset?.total,"total",{min:1,max:1e8});
    const failed=scalar(job.dataset?.failed,"failed",{min:0,max:total});
    limitedTrace(steps,"mock.metrics.read",{total,failed});
    const rate=round(failed/total*100);
    limitedTrace(steps,"mock.luca.inspect",{failureRatePct:rate});
    const action=rate>2?"queue_mock_diagnostics":"observe";
    const result={status:"completed",kind:"ops",decision:action,metrics:{failureRatePct:rate},steps,sideEffects:0,replayed:false,evidence:digest({rate,action})};
    this.records.set(key,{fingerprint,status:"completed",result});
    this.audit.push({key,status:"completed",kind:"ops",decision:action});
    return result;
   }
   // All financial/accounting/actuarial outputs derive from the same validated dataset.
   limitedTrace(steps,"mock.metrics.read",{source:"synthetic",datasetHash:digest(job.dataset)});
   const analysis=crossDisciplineAnalysis(job.dataset);
   limitedTrace(steps,"mock.economics.adjust_cost",analysis.economics);
   limitedTrace(steps,"mock.management.unit_economics",analysis.management);
   limitedTrace(steps,"mock.accounting.reconcile",analysis.accounting);
   limitedTrace(steps,"mock.finance.npv",analysis.finance);
   limitedTrace(steps,"mock.actuarial.expected_loss",analysis.actuarial);
   const decision=mockDecision(analysis);
   limitedTrace(steps,"mock.policy.decide",decision);
   if(options.injectFailureBeforeWrite){
    this.audit.push({key,status:"failed",kind:"business",code:"INJECTED_FAILURE"});
    return {status:"failed",code:"INJECTED_FAILURE",steps,sideEffects:0};
   }
   if(this.killSwitch)return fail("KILL_SWITCH","engine stopped before mock write");
   const report={tenantId:job.tenantId,jobId:job.id,analysis,decision,synthetic:true};
   // Mock report output only (in memory), never external systems.
   this.reports.set(key,report);
   limitedTrace(steps,"mock.report.write",report);
   const result={status:"completed",kind:"business",decision:decision.recommendation,analysis,steps,sideEffects:1,replayed:false,evidence:digest(report)};
   this.records.set(key,{fingerprint,status:"completed",result});
   this.audit.push({key,status:"completed",kind:"business",evidence:result.evidence});
   return result;
  }catch(e){
   const message=String(e?.message??e);
   const result={status:"blocked",code:message.startsWith("INVALID_INPUT")?"INVALID_INPUT":"EXECUTION_ERROR",detail:message,steps,sideEffects:0};
   this.audit.push({key,status:"blocked",code:result.code});
   return result;
  }
 }
}
export function syntheticCase(i=0,tenant="tenant_demo"){
 if(!Number.isInteger(i)||i<0||i>1e6)throw Error("invalid case index");
 const dataset={
  leads:1000+i*10,conversionRate:0.12,price:1600+i*10,variableCost:400,
  fixedCost:145000, inflationRate:0.03, cash:500000, receivables:40000,
  liabilities:180000,initialInvestment:300000,annualContracts:1200,
  annualIncidentFrequency:0.04,averageIncidentCost:900,discountRate:0.08,years:3
 };
 return {id:"scenario_"+i,tenantId:tenant,kind:"business",dueAt:"2026-10-20T07:00:00Z",dataset};
}
export function createEvaluationSuite(size=24){
 const items=[];
 for(let i=0;i<size;i++){
  const job=syntheticCase(i,"tenant_eval");
  const engine=new SimulationEngine();
  const result=engine.run(job,{actorTenantId:job.tenantId,scopes:["metrics:read","report:write"],now:"2026-10-20T09:00:00Z"});
  items.push({id:"integrated-eval-"+i,prompt:"合成資料（請結合經濟、管理、財務、會計與精算做多步驟分析；不能直接操作真實帳戶）："+JSON.stringify(job.dataset),
   expected:{analysis:result.analysis,decision:result.decision,requiredSteps:result.steps.map(x=>x.tool)},synthetic:true});
 }
 return items;
}
if(process.argv[1]&&process.argv[1].endsWith("/integrated.mjs")){
 if(process.argv.includes("--demo")){
  const engine=new SimulationEngine(),job=syntheticCase(0);
  console.log(JSON.stringify(engine.run(job,{actorTenantId:job.tenantId,scopes:["metrics:read","report:write"],now:"2026-10-20T09:00:00Z"}),null,2));
 }else if(process.argv.includes("--eval")){
  const {mkdirSync,writeFileSync}=await import("node:fs");
  const {dirname}=await import("node:path");
  const file=process.argv[process.argv.indexOf("--eval")+1]||"training/agent_sandbox/generated/integrated-business-eval.jsonl";
  mkdirSync(dirname(file),{recursive:true});
  const cases=createEvaluationSuite();
  writeFileSync(file,cases.map(x=>JSON.stringify(x)).join("\n")+"\n");
  console.log(JSON.stringify({file,cases:cases.length}));
 }else console.log("Use --demo or --eval <file>. This runtime is offline and simulated only.");
}
