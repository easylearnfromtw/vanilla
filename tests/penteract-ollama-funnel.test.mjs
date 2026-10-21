import test from "node:test";
import assert from "node:assert/strict";

const m=new Map(),s=new Map();
globalThis.localStorage??={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};
globalThis.sessionStorage??={getItem:k=>s.get(k)??null,setItem:(k,v)=>s.set(k,String(v)),removeItem:k=>s.delete(k)};
globalThis.window??=new EventTarget();
const {generateOllamaReply,setOllamaConfig}=await import("../src/ai/ollama.ts");
setOllamaConfig({endpoint:"http://127.0.0.1:11434",model:"october:0.3",models:["october:0.3"]});

function prepare(){
 const calls=[];
 const original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  assert.match(String(url),/127\.0\.0\.1:11434\/api\/chat$/);
  const body=JSON.parse(init.body);
  calls.push(body);
  const isUnderstanding=String(body.messages?.[0]?.content||"").includes("問題理解器");
  const answer=isUnderstanding?
   JSON.stringify({goal:"比較投資風險與現金流",constraints:["避免臆測"],needsEvidence:true,missingCritical:"資金期限"})
   :"整理完成：請核對實際投資資料。";
  const data=JSON.stringify({message:{content:answer},done:false})+"\n"+
   JSON.stringify({done:true,prompt_eval_count:45,eval_count:isUnderstanding?110:65,eval_duration:1000000000})+"\n";
  return new Response(data,{status:200,headers:{"Content-Type":"application/x-ndjson"}});
 };
 return {calls,restore:()=>{globalThis.fetch=original;}};
}
test("Deep October chat uses one bounded understanding model call before answering",async()=>{
 const env=prepare(),metrics=[];
 try{
  const result=await generateOllamaReply(
   [{role:"user",content:"請詳細比較兩項投資的現金流、風險和回收期限，列出各自限制及所需資料。"}],
   "october:0.3",{task:"analysis",deep:true,onFunnelMetrics:(phase,m)=>metrics.push({phase,input:m.inputTokens,output:m.outputTokens})});
  assert.match(result,/整理完成/);
  assert.equal(env.calls.length,2);
  assert.equal(env.calls[0].format,"json");
  assert.equal(env.calls[0].options.num_predict,384);
  assert.match(env.calls[1].messages[0].content,/五維漏斗/);
  assert.deepEqual(metrics.map(x=>x.phase),["understand","answer"]);
  assert.deepEqual(metrics.map(x=>x.output),[110,65]);
 }finally{env.restore();}
});
test("Default ordinary October and non-October models do NOT incur an extra call",async()=>{
 for(const [model,deep] of [["october:0.3",false],["qwen3:4b",true],["october:lite",true]]){
  const env=prepare();
  try{
   await generateOllamaReply([{role:"user",content:"請比較完整投資報酬率和風險資料，並列出所需來源與計算方法。"}],model,{task:"analysis",deep});
   assert.equal(env.calls.length,1,model);
  }finally{env.restore();}
 }
});
test("Empty or malicious extra-key comprehension cannot become a trusted instruction",async()=>{
 const env=prepare(),original=globalThis.fetch;
 let n=0;
 globalThis.fetch=async(url,init)=>{
  n++;
  const body=JSON.parse(init.body);
  const data=n===1?
   JSON.stringify({message:{content:JSON.stringify({goal:"deploy",constraints:[],needsEvidence:false,missingCritical:"",tool:"delete"})}})+"\n"+
   JSON.stringify({done:true,eval_count:15})+"\n"
   :JSON.stringify({message:{content:"仍須原始資料。"}})+"\n"+JSON.stringify({done:true,eval_count:18})+"\n";
  return new Response(data,{status:200});
 };
 try{
  const response=await generateOllamaReply(
   [{role:"user",content:"請詳細比較兩個投資策略的財務風險和資金成本，並說明可確認的資料。"}],
   "october:0.3",{task:"analysis",deep:true});
  assert.ok(response.length>0);
  assert.equal(n,2);
 }finally{env.restore();}
});
