/** Verify October's opt-in server proof against the just-verified local CREAM.
 * TLS + verified WeiGuo family session establish backend identity. HMAC is
 * validated by the backend, not by this client (which MUST NOT hold the key).
 * This browser independently checks source/input digest and numerical facts.
 */
import type {CreamResult} from "../cream/core";
import type {OctoberServerProof} from "../weiguo/api";

export const OCTOBER_SERVER_COMMAND=/^(?:阿土伯|October)伺服器驗證CSV\s*[：:]?$/i;
export function wantsOctoberServerProof(message:string):boolean{
 return OCTOBER_SERVER_COMMAND.test(message.split(/\r?\n/,1)[0].trim());
}
const shaHex=/^[a-f0-9]{64}$/;
const near=(a:unknown,b:unknown):boolean=>(
 a===null||b===null ? a===b :
 typeof a==="number"&&typeof b==="number"&&Number.isFinite(a)&&Number.isFinite(b)&&
 Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b))
);
export async function checkOctoberServerProof(
 csv:string,source:string,local:CreamResult,proof:unknown
):Promise<{ok:boolean;reason:string}>{
 if(!proof||typeof proof!=="object"||Array.isArray(proof))return {ok:false,reason:"INVALID_PROOF"};
 const p=proof as Partial<OctoberServerProof>,r=p.result,receipt=p.receipt;
 if(!r||!receipt||r.verification!=="independent-python-statistics"||
    r.modelInvoked!==false||r.source!==source||r.rowCount!==local.rowCount||
    JSON.stringify(r.columns)!==JSON.stringify(local.columns)||
    receipt.status!=="verified"||receipt.scope!=="readonly:csv"||
    receipt.runtime!=="oc-m1-readonly-v1"||
    typeof receipt.taskId!=="string"||!/^[a-zA-Z0-9_-]{8,80}$/.test(receipt.taskId)||
    !Number.isInteger(receipt.createdAt)||receipt.createdAt<=0||
    receipt.createdAt>Math.floor(Date.now()/1000)+60||
    !shaHex.test(String(receipt.inputSha256))||
    !shaHex.test(String(receipt.resultSha256))||
    !shaHex.test(String(receipt.signature))||
    !Array.isArray(r.metrics)||r.metrics.length!==local.metrics.length||
    new Set(r.metrics.map(m=>m?.key)).size!==r.metrics.length){
  return {ok:false,reason:"INVALID_SERVER_RECEIPT"};
 }
 if(!crypto.subtle)return {ok:false,reason:"WEBCRYPTO_UNAVAILABLE"};
 const bytes=new TextEncoder().encode(csv+"\0"+source);
 const sum=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
 const hash=Array.from(sum,b=>b.toString(16).padStart(2,"0")).join("");
 if(hash!==receipt.inputSha256)return {ok:false,reason:"INPUT_DIGEST_MISMATCH"};
 for(const metric of local.metrics){
  const counterpart=r.metrics.find(x=>x?.key===metric.key);
  if(!counterpart||counterpart.n!==metric.n||counterpart.missing!==metric.missing||
    !near(counterpart.sum,metric.sum)||!near(counterpart.mean,metric.mean)||
    !near(counterpart.median,metric.median)||!near(counterpart.min,metric.min)||
    !near(counterpart.max,metric.max)||!near(counterpart.sampleStdDev,metric.sampleStdDev)){
   return {ok:false,reason:"NUMERIC_RESULT_MISMATCH"};
  }
 }
 return {ok:true,reason:"LOCAL_AND_SERVER_AGREE"};
}
