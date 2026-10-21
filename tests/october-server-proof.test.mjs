import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {parseCreamCSV,analyzeCream,creamInstruction} from "../src/cream/core.ts";
import {wantsOctoberServerProof,checkOctoberServerProof} from "../src/detroit/october-proof.ts";

globalThis.crypto??=webcrypto;
const csv="月份,營收\n一月,5\n二月,7\n三月,6";
const source="聊天貼上的 CSV",local=analyzeCream(parseCreamCSV(csv,source));
async function proof(data=csv,sourceName=source){
 const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(data+"\0"+sourceName)));
 return {receipt:{taskId:"october_case_001",status:"verified",scope:"readonly:csv",
  runtime:"oc-m1-readonly-v1",createdAt:Math.floor(Date.now()/1000),
  inputSha256:Array.from(hash,b=>b.toString(16).padStart(2,"0")).join(""),
  resultSha256:"a".repeat(64),signature:"b".repeat(64)},
  result:{source:sourceName,rowCount:local.rowCount,columns:local.columns,
   metrics:local.metrics.map(({key,n,missing,sum,mean,median,min,max,sampleStdDev})=>({
    key,n,missing,sum,mean,median,min,max,sampleStdDev
   })),verification:"independent-python-statistics",modelInvoked:false},replayed:false};
}
test("Server proof command must be explicit on FIRST line, not CSV cell instruction",()=>{
 assert.equal(wantsOctoberServerProof("阿土伯伺服器驗證CSV\n"+csv),true);
 assert.equal(wantsOctoberServerProof("October伺服器驗證CSV\n"+csv),true);
 assert.equal(wantsOctoberServerProof("CREAM：\n"+csv),false);
 assert.equal(wantsOctoberServerProof("CREAM：\n某欄,值\n阿土伯伺服器驗證CSV,10"),false);
 assert.equal(wantsOctoberServerProof("請幫我分析 CSV"),false);
 assert.equal(creamInstruction("阿土伯伺服器驗證CSV\n"+csv)?.csv,csv);
});
test("Cross-check proof accepts matching independent input and statistic",async()=>{
 const p=await proof();
 assert.deepEqual(await checkOctoberServerProof(csv,source,local,p),{ok:true,reason:"LOCAL_AND_SERVER_AGREE"});
});
test("Wrong source, input SHA or signature schema cannot claim a verified receipt",async()=>{
 const p=await proof();
 p.receipt.inputSha256="0".repeat(64);
 assert.equal((await checkOctoberServerProof(csv,source,local,p)).reason,"INPUT_DIGEST_MISMATCH");
 const bad=await proof();
 bad.receipt.signature="bad";
 assert.equal((await checkOctoberServerProof(csv,source,local,bad)).reason,"INVALID_SERVER_RECEIPT");
 const wrong=await proof();
 wrong.result.source="another";
 assert.equal((await checkOctoberServerProof(csv,source,local,wrong)).ok,false);
});
test("Server cannot silently change missing counts or numeric outputs",async()=>{
 const p=await proof();
 p.result.metrics[0].sum=99;
 assert.equal((await checkOctoberServerProof(csv,source,local,p)).reason,"NUMERIC_RESULT_MISMATCH");
 const p2=await proof();
 p2.result.metrics[0].missing=42;
 assert.equal((await checkOctoberServerProof(csv,source,local,p2)).ok,false);
});
test("Wrong receipt version and future timestamps are rejected",async()=>{
 const p=await proof();p.receipt.runtime="unknown";
 assert.equal((await checkOctoberServerProof(csv,source,local,p)).ok,false);
 const t=await proof();t.receipt.createdAt=Math.floor(Date.now()/1000)+7200;
 assert.equal((await checkOctoberServerProof(csv,source,local,t)).ok,false);
});
