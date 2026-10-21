#!/usr/bin/env node
// Opt-in finance inference smoke test for already-running trusted Ollama hosts.
// No runtime URL = dry run. Never use API secrets in CLI args or commit output.
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=path.dirname(fileURLToPath(import.meta.url));
const fixture=JSON.parse(await readFile(path.resolve(root,"../tests/fixtures/atuber-finance-10.json"),"utf8"));
const allowed=new Set(["october:sm","october:ml","october:lg"]);
const models=(process.env.ATUBER_EVAL_MODELS||"october:sm,october:ml,october:lg").split(",").map(x=>x.trim()).filter(Boolean);
if(!models.length||models.some(x=>!allowed.has(x)))throw new Error("Only approved October aliases can be evaluated");
const live=process.argv.includes("--run");
if(!live){
 console.log(JSON.stringify({mode:"dry-run",cases:fixture.cases.length,models,note:"To run, set ATUBER_EVAL_URL and pass --run on the owner's authorized inference host"},null,2));
 process.exit(0);
}
const endpoint=process.env.ATUBER_EVAL_URL;
if(!endpoint)throw new Error("ATUBER_EVAL_URL is required for --run");
const url=new URL(endpoint);
if(url.username||url.password||url.search||url.hash)throw new Error("URL credentials and query parameters are forbidden");
const loopback=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
if(url.protocol!=="https:"&&!(url.protocol==="http:"&&loopback))throw new Error("A remote runtime requires trusted HTTPS");
if(url.pathname!=="/"&&url.pathname!=="")throw new Error("Provide an Ollama origin, not a custom path");
const output={benchmark:fixture.benchmark,runAt:new Date().toISOString(),endpointHost:url.hostname,modelResponses:[]};
for(const model of models){
 for(const testCase of fixture.cases){
  const started=performance.now();
  const abort=new AbortController();
  const timer=setTimeout(()=>abort.abort(),180000);
  try{
   const response=await fetch(new URL("/api/chat",url),{method:"POST",signal:abort.signal,
    headers:{"Content-Type":"application/json",...(process.env.ATUBER_EVAL_TOKEN?{Authorization:"Bearer "+process.env.ATUBER_EVAL_TOKEN}:{})},
    body:JSON.stringify({model,stream:false,options:{temperature:0,num_predict:600,num_ctx:8192},
     messages:[{role:"user",content:testCase.prompt}]})});
   if(!response.ok)throw new Error("HTTP "+response.status);
   const body=await response.json();
   const answer=body?.message?.content;
   if(typeof answer!=="string"||!answer.trim())throw new Error("Empty or invalid model reply");
   output.modelResponses.push({model,id:testCase.id,domain:testCase.domain,elapsedMs:Math.round(performance.now()-started),
    answer,pass:null,points:null,usage:{prompt_eval_count:body.prompt_eval_count??null,eval_count:body.eval_count??null}});
  }catch(error){
   output.modelResponses.push({model,id:testCase.id,domain:testCase.domain,elapsedMs:Math.round(performance.now()-started),
    error:error instanceof Error?error.message:"Unknown inference error",pass:false,points:null});
  }finally{clearTimeout(timer);}
 }
}
const target=path.resolve(process.env.ATUBER_EVAL_REPORT||"./atuber-finance-results.json");
await mkdir(path.dirname(target),{recursive:true});
await writeFile(target,JSON.stringify(output,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({report:target,attempted:output.modelResponses.length,answered:output.modelResponses.filter(x=>x.answer).length,
 errors:output.modelResponses.filter(x=>x.error).length,note:"No scores assigned: verify each answer against rubric before grading"}));
if(output.modelResponses.some(x=>x.error))process.exitCode=1;
