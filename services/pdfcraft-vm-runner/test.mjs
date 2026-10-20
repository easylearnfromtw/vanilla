import test from "node:test";
import assert from "node:assert/strict";
import {createHmac,createHash} from "node:crypto";
import {mergeInEphemeralVM,startupPreflight,validPdf,templateFor,MAX_OUTPUT} from "./runtime.mjs";

process.env.NODE_ENV="test";
process.env.PDFCRAFT_VM_RUNNER_ENABLED="true";
process.env.WEIGUO_PDFCRAFT_WORKER_SECRET="ab".repeat(32);
process.env.RAILWAY_ENVIRONMENT_ID="env-fixture";
process.env.RAILWAY_API_TOKEN="test-placeholder-only";
const {authenticate}=await import("./server.mjs");
function headers(method,path,body,nonce="a".repeat(32),timestamp=Math.floor(Date.now()/1000)){
 const raw=String(timestamp);
 const digest=createHash("sha256").update(body).digest("hex");
 const data=`pdfcraft-v1\n${method}\n${path}\n${raw}\n${nonce}\n${digest}`;
 return {"x-pdfcraft-timestamp":raw,"x-pdfcraft-nonce":nonce,
 "x-pdfcraft-signature":createHmac("sha256",Buffer.from(process.env.WEIGUO_PDFCRAFT_WORKER_SECRET,"hex")).update(data).digest("hex")};
}
test("MAC rejects replay, expiry, bad body, bad path",()=>{
 const body=Buffer.from('{"files":[]}'),path="/v1/pdfcraft/combine";
 const head=headers("POST",path,body);
 assert.equal(authenticate("POST",path,body,head),true);
 assert.equal(authenticate("POST",path,body,head),false);
 assert.equal(authenticate("POST",path,Buffer.from("tampered"),headers("POST",path,body,"b".repeat(32))),false);
 assert.equal(authenticate("POST",path,body,headers("POST",path,body,"c".repeat(32),1000000000)),false);
 assert.equal(authenticate("POST","/admin",body,head),false);
});
const pdf=Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
test("PDF container checks reject garbage",()=>{
 assert.equal(validPdf(pdf),true);assert.equal(validPdf(Buffer.from("Hello")),false);
});
function fakeVM({output=pdf,network=true}={}){
 const records=[],written={};let destroyed=false;
 const vm={
  async exec(command){records.push(command);
   if(command.startsWith("sha256sum"))return{exitCode:0,stdout:"073c9c4eb4193cbbf52211d5ad8102969b0731b3294e44c47ab289ac84d2640f  /opt/pdfcraft/pdfcraft-cli"};
   if(command==="readlink /proc/self/ns/net")return{exitCode:0,stdout:"net:[123]\n"};
   if(command.includes("readlink /proc/self/ns/net"))return{exitCode:0,stdout:network?"net:[456]\n":"net:[123]\n"};
   if(command.includes(" combine "))return{exitCode:0,timedOut:false};
   throw Error("unexpected command "+command);},
  files:{async mkdir(path){records.push("mkdir "+path)},async write(path,data){written[path]=data},
         async stat(){return{size:output.length}},async read(){return output}},
  async destroy(){destroyed=true;}
 };
 const Sandbox={template(){return{withPackages(){return this},run(){return this}}},
               async create(){return vm}};
 return{Sandbox,records,written,wasDestroyed:()=>destroyed};
}
test("one VM per merge, verified network namespace, bounded data and guaranteed destroy",async()=>{
 const m=fakeVM();
 const merged=await mergeInEphemeralVM(m.Sandbox,[pdf,pdf]);
 assert.deepEqual(Buffer.from(merged),pdf);
 assert.equal(m.records.some(x=>x.includes("--unshare-net")),true);
 assert.equal(m.records.some(x=>x.includes("--unshare-user")),true);
 assert.deepEqual(m.written["/work/source-1.pdf"],pdf);
 assert.equal(m.wasDestroyed(),true);
});
test("namespace isolation failure always rejects and destroys VM",async()=>{
 const m=fakeVM({network:false});
 await assert.rejects(mergeInEphemeralVM(m.Sandbox,[pdf,pdf]),/network sandbox not proven/i);
 assert.equal(m.wasDestroyed(),true);
});
test("oversized output is rejected and sandbox destroyed",async()=>{
 const m=fakeVM({output:Buffer.alloc(MAX_OUTPUT+1,65)});
 await assert.rejects(mergeInEphemeralVM(m.Sandbox,[pdf,pdf]),/bounds/i);
 assert.equal(m.wasDestroyed(),true);
});
test("preflight verifies and destroys paid VM",async()=>{
 const m=fakeVM();assert.equal(await startupPreflight(m.Sandbox),true);
 assert.equal(m.wasDestroyed(),true);
});
