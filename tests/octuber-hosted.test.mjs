import test from "node:test";
import assert from "node:assert/strict";
import {OCTUBER_HOSTED_OPTIONS,OCTUBER_HOSTED_ENDPOINT,isHostedOctuberReady,hostedOctuberState,verifyHostedOctuber,clearHostedOctuber,generateHostedOctuber} from "../src/ai/octuber-hosted.ts";
import {atuberTier,selectAtuberDriver} from "../src/ai/atuber-control-plane.ts";
globalThis.window??=new EventTarget();
const savedFetch=globalThis.fetch;
const model="qwen/qwen3-30b-a3b-instruct-2507";
const candidate={id:"octuber-hosted:"+model,source:"octuber-hosted",model,label:"OCTUBER SUMPTUOUS · Qwen 30B",location:"OpenRouter 託管雲端",note:""};
function sse(parts){
 return new Response("data: "+JSON.stringify({choices:[{delta:{content:parts[0]},finish_reason:null}]})+"\n\n"+
  "data: "+JSON.stringify({choices:[{delta:{content:parts[1]},finish_reason:"stop"}]})+"\n\n"+
  "data: [DONE]\n\n",{headers:{"Content-Type":"text/event-stream"}});
}
test("hosted model cannot be selected until authorized successful inference",async()=>{
 clearHostedOctuber();
 assert.equal(atuberTier(candidate),null);
 assert.equal(isHostedOctuberReady(),false);
 assert.equal(selectAtuberDriver([candidate],{privateMode:false,localOnly:false,image:false,task:"code"}).controller,null);
 globalThis.fetch=async (url,init)=>{
  assert.equal(url,OCTUBER_HOSTED_ENDPOINT+"/chat/completions");
  assert.match(init.headers.Authorization,/^Bearer sk-or-test-verified-key$/);
  const body=JSON.parse(init.body);
  assert.equal(body.model,model);
  assert.equal(body.stream,false);
  return Response.json({choices:[{message:{content:"連線成功"}}]});
 };
 try{
  const report=await verifyHostedOctuber(model,"sk-or-test-verified-key");
  assert.equal(report.model,model);
  assert.equal(isHostedOctuberReady(model),true);
  assert.equal(atuberTier(candidate),"large");
  assert.equal(selectAtuberDriver([candidate],{privateMode:false,localOnly:false,image:false,task:"code"}).controller?.id,candidate.id);
  assert.equal(selectAtuberDriver([candidate],{privateMode:true,localOnly:true,image:false,task:"code"}).controller,null);
 }finally{clearHostedOctuber();globalThis.fetch=savedFetch;}
});
test("private and unsupported models can never impersonate a large-capacity controller",()=>{
 clearHostedOctuber();
 assert.deepEqual(OCTUBER_HOSTED_OPTIONS.map(x=>x.tier),["mid-large","large","ultra"]);
 assert.equal(atuberTier({...candidate,model:"openai/gpt-4o"}),null);
 assert.equal(isHostedOctuberReady(),false);
});
test("unauthorized / failed test invalidates the old live capability and never saves credentials",async()=>{
 clearHostedOctuber();
 globalThis.fetch=async()=>new Response("unauthorized",{status:401});
 try{
  await assert.rejects(verifyHostedOctuber(model,"sk-or-test-not-permitted"),/金鑰無效/);
  assert.equal(hostedOctuberState(),null);
  assert.equal(atuberTier(candidate),null);
 }finally{clearHostedOctuber();globalThis.fetch=savedFetch;}
});
test("verified 30B streams a real chat answer and propagates model-specific errors",async()=>{
 clearHostedOctuber();
 let calls=0;
 globalThis.fetch=async(url,init)=>{
  assert.equal(url,OCTUBER_HOSTED_ENDPOINT+"/chat/completions");
  const body=JSON.parse(init.body);
  calls++;
  if(calls===1){assert.equal(body.stream,false);return Response.json({choices:[{message:{content:"OK"}}]});}
  assert.equal(body.stream,true);
  assert.equal(body.model,model);
  assert.ok(body.messages.some(x=>x.role==="user"&&x.content==="給我一個結論"));
  return sse(["答案","完整"]);
 };
 try{
  await verifyHostedOctuber(model,"sk-or-test-in-memory");
  const result=await generateHostedOctuber([{role:"user",content:"給我一個結論"}],model,{task:"analysis"});
  assert.match(result,/答案完整/);
  assert.equal(calls,2);
  clearHostedOctuber();
  await assert.rejects(generateHostedOctuber([{role:"user",content:"你好"}],model),/尚未完成/);
 }finally{clearHostedOctuber();globalThis.fetch=savedFetch;}
});
