/** Detroit-owned capability registry and execution boundary.
 * One AI runtime owns every specialist. Descriptors are NOT proof of deployment.
 * Executors are registered only when real implementations exist in this process.
 */
import {DETROIT_ENGINES} from "./core";
import {DETROIT_FACTORY_TOOLS} from "./factory";
import {ORCHESTRA_TOOLS} from "../orchestra/core";

export type CapabilityKind="core"|"factory"|"craft"|"planned";
export type CapabilityState="local"|"adapter"|"planned";
export type DetroitCapability={
 id:string;label:string;owner:"detroit";kind:CapabilityKind;state:CapabilityState;
 requiresNetwork:boolean;requiresApproval:boolean;description:string;
};
const NETWORK=new Set(["scouts","bard","ceres","moli","persistent-jobs","hermes","quirinus","medusa","gridcraft","jensen-huang"]);
const APPROVAL=new Set(["bard","ceres","moli","persistent-jobs","hermes","quirinus","medusa","gridcraft","jensen-huang"]);
const asCapability=(id:string,label:string,kind:CapabilityKind,state:CapabilityState,description:string):DetroitCapability=>({
 id,label,owner:"detroit",kind,state,requiresNetwork:NETWORK.has(id),requiresApproval:APPROVAL.has(id),description
});
const list:DetroitCapability[]=[];
const seen=new Set<string>();
function include(item:DetroitCapability):void{
 if(seen.has(item.id))return;
 seen.add(item.id);list.push(item);
}
for(const e of DETROIT_ENGINES)include(asCapability(e.id,e.label,"core",e.status==="active"?"local":e.status,e.description));
for(const e of DETROIT_FACTORY_TOOLS)include(asCapability(e.id,e.label,"factory",e.status,e.description));
for(const e of ORCHESTRA_TOOLS)include(asCapability(e.id,e.name,"craft","adapter",e.summary));
include(asCapability("code-intelligence","Code Intelligence / Algorithm Tutor","core","local","Read-only source analysis. Explicit approval is required to write snapshots to Google Drive."));
include(asCapability("jensen-huang","JENSEN HUANG / Self-Build CODE","factory","adapter","GitHub code changes require explicit branch and review authorization"));
export const DETROIT_CAPABILITIES:readonly DetroitCapability[]=Object.freeze(list);
export function findDetroitCapability(id:string):DetroitCapability|undefined{
 return DETROIT_CAPABILITIES.find(c=>c.id===id);
}
export type DetroitCallContext={privateMode:boolean;approved?:boolean;signal?:AbortSignal};
export type DetroitExecutor=(input:unknown,context:DetroitCallContext)=>Promise<unknown>;
export type DetroitReceipt={
 capability:string;status:"completed";result:unknown;
};
export class DetroitCapabilityBus{
 private readonly executors=new Map<string,DetroitExecutor>();
 register(id:string,executor:DetroitExecutor):void{
  const meta=findDetroitCapability(id);
  if(!meta||meta.state==="planned")throw Error("Detroit 工具尚未實作："+id);
  if(this.executors.has(id))throw Error("Detroit 工具重複註冊："+id);
  this.executors.set(id,executor);
 }
 isRunnable(id:string):boolean{return this.executors.has(id);}
 available():readonly string[]{return [...this.executors.keys()];}
 async execute(id:string,input:unknown,context:DetroitCallContext):Promise<DetroitReceipt>{
  const meta=findDetroitCapability(id);
  if(!meta)throw Error("Detroit 找不到工具："+id);
  const executor=this.executors.get(id);
  if(!executor)throw Error(meta.label+" 尚未連接可執行後端，不能假裝已完成");
  if(context.signal?.aborted)throw Error("Detroit 任務已取消");
  if(context.privateMode&&meta.requiresNetwork)throw Error("私密模式禁止 "+meta.label+" 連線");
  if(meta.requiresApproval&&!context.approved)throw Error(meta.label+" 需要明確授權才能執行");
  const result=await executor(input,context);
  if(context.signal?.aborted)throw Error("Detroit 任務已取消");
  return {capability:id,status:"completed",result};
 }
}
/** The same bus handles explicit commands, proactive routing and tool-to-tool handoffs. */
export const detroitBus=new DetroitCapabilityBus();
/** Registered executor accepts only explicit user-provided source. No arbitrary code is run.
 * Diana opens Project Hub for repository selection; Drive writes require distinct approval.
 */
detroitBus.register("code-intelligence",async(input,context)=>{
 if(!input||typeof input!=="object")throw Error("CODE_ANALYSIS_INPUT_REQUIRED");
 const data=input as Record<string,unknown>;
 if(typeof data.repository!=="string"||!data.repository.trim())throw Error("CODE_ANALYSIS_REPOSITORY_REQUIRED");
 if(!Array.isArray(data.files)||data.files.length<1||data.files.length>12)throw Error("CODE_ANALYSIS_FILE_LIMIT");
 const files=data.files.map((raw:unknown)=>{
  if(!raw||typeof raw!=="object")throw Error("CODE_ANALYSIS_FILE_INVALID");
  const f=raw as Record<string,unknown>;
  if(typeof f.path!=="string"||typeof f.content!=="string"||f.content.length>250000)throw Error("CODE_ANALYSIS_FILE_INVALID");
  return {path:f.path,content:f.content};
 });
 if(files.reduce((n,f)=>n+f.content.length,0)>1500000)throw Error("CODE_ANALYSIS_TOTAL_LIMIT");
 const save=data.mode==="save";
 if(save&&(context.privateMode||!context.approved))throw Error("CODE_ANALYSIS_CLOUD_APPROVAL_REQUIRED");
 if(context.signal?.aborted)throw Error("Detroit 任務已取消");
 const {codeRevision,runCodeAnalysis}=await import("../lib/runCodeAnalysis");
 const revision=await codeRevision(files);
 if(context.signal?.aborted)throw Error("Detroit 任務已取消");
 return runCodeAnalysis({repository:data.repository,revision,files,mode:save?"save":"preview"});
});
export function detroitAvailability():{id:string;state:"runnable"|"not-connected"|"planned"}[]{
 return DETROIT_CAPABILITIES.map(c=>({id:c.id,state:c.state==="planned"?"planned":detroitBus.isRunnable(c.id)?"runnable":"not-connected"}));
}
