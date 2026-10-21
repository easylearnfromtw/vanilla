/** Read-only October tool execution boundary; receipts are evidence, never commands. */
import {planPenteractFunnel} from "./penteract-5d";
import {shadowPenteractRoute} from "./penteract-shadow";
import {detroitAvailability,findDetroitCapability} from "./capability-bus";
import {summarizeCream,type CreamResult} from "../cream/core";
import {wrapExternalText} from "../security/trust-boundary";
import type {AtuberReadOnlyPlan} from "./atuber-tool-plan";

export type AtuberToolReceipt={
 policy:"atuber-receipt-v1";
 capability:AtuberReadOnlyPlan["capability"];
 status:"completed";
 executedBy:"detroit-host";
 modelInvoked:false;
 grantedPermissions:false;
 networkUsed:false;
 readOnly:true;
 evidence:string;
};

export async function executeAtuberReadOnly(
 plan:AtuberReadOnlyPlan,
 options:{privateMode:boolean;signal?:AbortSignal;executeCream?:(csv:string,options:{privateMode:boolean;signal?:AbortSignal})=>Promise<CreamResult>}
):Promise<AtuberToolReceipt>{
 if(!plan||plan.policy!=="atuber-receipt-v1"||plan.source!=="explicit-user")
  throw Error("ATUBER_TOOL_PLAN_NOT_AUTHORIZED");
 if(options.signal?.aborted)throw Error("ATUBER_TOOL_CANCELLED");
 let evidence:string;
 switch(plan.capability){
  case "cream":{
   if(typeof plan.csv!=="string"||plan.csv.length>12000||plan.csv.length<6)throw Error("ATUBER_CSV_LIMIT");
   if(!options.executeCream)throw Error("ATUBER_CREAM_EXECUTOR_MISSING");
   const result=await options.executeCream(plan.csv,{privateMode:options.privateMode,signal:options.signal});
   evidence="CREAM 已驗證計算的摘要：\n"+summarizeCream(result).slice(0,5000);
   break;
  }
  case "detroit-status":{
   const items=detroitAvailability().map(x=>({
    id:x.id,status:x.state,
    networkRequired:findDetroitCapability(x.id)?.requiresNetwork??false,
    approvalRequired:findDetroitCapability(x.id)?.requiresApproval??false
   }));
   evidence="Detroit 本機註冊表狀態（runnable 不代表外部授權或服務已連線）：\n"+
    JSON.stringify(items).slice(0,5000);
   break;
  }
  case "five-d-shadow":{
   if(typeof plan.subject!=="string"||plan.subject.length>800||plan.subject.length<2)throw Error("ATUBER_FIVE_D_LIMIT");
   const verdict=shadowPenteractRoute(plan.subject);
   const projection=planPenteractFunnel(plan.subject,{privateMode:true});
   evidence="October 五維僅供諮詢、未校準的幾何評估，不是工具權限或語意正確率：\n"+
    JSON.stringify({verdict,ambiguity:projection.ambiguity,routes:projection.routes,
     confidence:projection.confidence,modelInvoked:projection.modelInvoked}).slice(0,5000);
   break;
  }
  default:throw Error("ATUBER_TOOL_NOT_ALLOWED");
 }
 if(options.signal?.aborted)throw Error("ATUBER_TOOL_CANCELLED");
 return {policy:"atuber-receipt-v1",capability:plan.capability,status:"completed",
  executedBy:"detroit-host",modelInvoked:false,grantedPermissions:false,
  networkUsed:false,readOnly:true,evidence:wrapExternalText(evidence,"tool")};
}
