/** Standalone HMAC-authenticated bridge: one ephemeral microVM per PDF request. */
import { createServer } from "node:http";
import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {Sandbox} from "railway";
import {mergeInEphemeralVM,startupPreflight,validPdf,MAX_INPUT,MAX_OUTPUT} from "./runtime.mjs";

const SECRET=process.env.WEIGUO_PDFCRAFT_WORKER_SECRET||"";
const ENABLED=process.env.PDFCRAFT_VM_RUNNER_ENABLED==="true";
const credential=process.env.RAILWAY_TOKEN||process.env.RAILWAY_API_TOKEN;
const configured=ENABLED && /^[0-9a-f]{64}$/i.test(SECRET) &&
  Boolean(credential && process.env.RAILWAY_ENVIRONMENT_ID);
const MAX_BODY=8_500_000;
let admitted=false, working=false;
const nonces=new Map(), recent=[];
const allowed=new Set(["GET /v1/pdfcraft/ready","POST /v1/pdfcraft/combine"]);
const signedKey=/^[a-f0-9]{32}$/;

function constantHexMatch(actual,expected){
  if(!/^[a-f0-9]{64}$/i.test(String(actual)))return false;
  return timingSafeEqual(Buffer.from(actual,"hex"),Buffer.from(expected,"hex"));
}
export function authenticate(method,path,body,headers,now=Math.floor(Date.now()/1000)) {
 try{
  if(!allowed.has(method+" "+path)||!configured)return false;
  const raw=String(headers["x-pdfcraft-timestamp"]||"");
  const nonce=headers["x-pdfcraft-nonce"];
  const signature=headers["x-pdfcraft-signature"];
  if(!/^\d{10,11}$/.test(raw)||!signedKey.test(String(nonce))||Math.abs(now-Number(raw))>45)return false;
  for(const [key,time] of nonces)if(now-time>90)nonces.delete(key);
  if(nonces.has(nonce)||nonces.size>=1024)return false;
  const digest=createHash("sha256").update(body).digest("hex");
  const data=`pdfcraft-v1\n${method}\n${path}\n${raw}\n${nonce}\n${digest}`;
  const mac=createHmac("sha256",Buffer.from(SECRET,"hex")).update(data,"ascii").digest("hex");
  if(!constantHexMatch(signature,mac))return false;
  nonces.set(nonce,now); return true;
 }catch{return false}
}
function reply(res,code,body,contentType="application/json"){
 res.writeHead(code,{"Content-Type":contentType,"Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff","Content-Length":body.length});
 res.end(body);
}
const json=(res,code,data)=>reply(res,code,Buffer.from(JSON.stringify(data)));
async function readBody(req){
 const chunks=[];let total=0;
 const announced=Number(req.headers["content-length"]||"0");
 if(!Number.isSafeInteger(announced)||announced>MAX_BODY)throw Error("body too large");
 for await(const item of req){
  total+=item.length;
  if(total>MAX_BODY)throw Error("body too large");
  chunks.push(item);
 }
 return Buffer.concat(chunks,total);
}
function decodeInputs(body){
 const value=JSON.parse(body.toString("utf8"));
 if(!value||typeof value!=="object"||Array.isArray(value) ||
   Object.keys(value).length!==1|| !Array.isArray(value.files) ||
   ![2,3].includes(value.files.length))throw Error("invalid schema");
 return value.files.map(item=>{
  if(typeof item!=="string"||item.length>2_800_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(item))throw Error("invalid encoded PDF");
  const pdf=Buffer.from(item,"base64");
  if(pdf.toString("base64")!==item||pdf.length>MAX_INPUT||!validPdf(pdf))throw Error("invalid PDF");
  return pdf;
 });
}
async function serve(req,res){
 const path=new URL(req.url||"/","http://localhost").pathname;
 if(path==="/health"&&req.method==="GET")
   return json(res,200,{service:"pdfcraft-vm-runner",online:true,ready:admitted,enabled:ENABLED});
 if(!allowed.has(req.method+" "+path))return json(res,404,{detail:"Not found"});
 let body;
 try{body=await readBody(req)}catch{return json(res,413,{detail:"Request too large"})}
 if(req.method==="GET"&&body.length!==0)return json(res,400,{detail:"GET body not allowed"});
 if(!authenticate(req.method,path,body,req.headers))return json(res,401,{detail:"Unauthorized"});
 if(!admitted)return json(res,503,{detail:"Isolated VM preflight unavailable"});
 if(req.method==="GET")return json(res,200,{service:"pdfcraft-worker",schemaVersion:1,ready:true,operation:"combine-pdf"});
 if(working)return json(res,503,{detail:"VM worker busy"});
 const now=Date.now();
 while(recent.length&&now-recent[0]>60_000)recent.shift();
 if(recent.length>=3)return json(res,429,{detail:"Rate limited"});
 let inputs;
 try{inputs=decodeInputs(body)}catch{return json(res,400,{detail:"Invalid PDF input"})}
 working=true;recent.push(now);
 try {
  const output=await mergeInEphemeralVM(Sandbox,inputs);
  return reply(res,200,Buffer.from(output),"application/pdf");
 }catch {
  return json(res,503,{detail:"Sandboxed PDF task unavailable"});
 }finally {working=false;}
}
const port=Number(process.env.PORT||8080);
const server=createServer((req,res)=>{void serve(req,res).catch(()=>{if(!res.headersSent)json(res,500,{detail:"Server error"});else res.destroy()})});
server.requestTimeout=60_000;server.headersTimeout=10_000;
if(process.env.NODE_ENV!=="test"){
server.listen(port,"0.0.0.0",()=>{console.log("PdfCraft VM runner online; readiness: "+(configured?"checking":"not configured"))});
if(configured){
 startupPreflight(Sandbox)
  .then(()=>{admitted=true;console.log("PdfCraft VM sandbox preflight passed")})
  .catch(()=>{admitted=false;console.error("PdfCraft VM sandbox preflight failed; all jobs denied")});
}

}
