import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../apps-script/vanilla-api-vault/Code.gs",import.meta.url),"utf8");
const RELAY="x".repeat(40);

function harness(settings={}){
 const values=new Map(Object.entries({VANILLA_RELAY_SHARED_SECRET:RELAY,
  VAULT_KEY_GEMINI:"test-gemini-key",VAULT_MODELS_GEMINI:"gemini-test",
  VAULT_KEY_TELEGRAM:"123456:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO",
  VAULT_TELEGRAM_CHAT_IDS:"123456789",VAULT_RPM_LIMIT:"10",VAULT_DAILY_LIMIT:"100",...settings}));
 const calls=[];
 let upstream={candidates:[{content:{parts:[{text:"OK"}]}}],usageMetadata:{promptTokenCount:2,candidatesTokenCount:1}};
 const context={
  PropertiesService:{getScriptProperties:()=>({
   getProperty:(key)=>values.get(key)||null,
   setProperty:(key,value)=>{values.set(key,value);return null;},
   setProperties:(items)=>{for(const [key,value] of Object.entries(items))values.set(key,value);return null;}
  })},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  ContentService:{MimeType:{JSON:"json"},createTextOutput:s=>({value:s,setMimeType(){return this;}})},
  Utilities:{
   getUuid:()=>"00000000-0000-4000-8000-000000000000",
   base64Encode:(value)=>Buffer.from(value,"utf8").toString("base64"),
   computeHmacSha256Signature:(text,secret)=>[...crypto.createHmac("sha256",secret).update(text).digest()].map(n=>n>127?n-256:n),
   base64DecodeWebSafe:(encoded)=>[...Buffer.from(encoded,"base64")].map(n=>n>127?n-256:n),
   newBlob:(bytes)=>({getDataAsString:()=>Buffer.from(bytes.map(n=>n&255)).toString("utf8")})
  },
  UrlFetchApp:{fetch:(url,opts)=>{calls.push({url,opts});return {
   getResponseCode:()=>200,getContentText:()=>JSON.stringify(typeof upstream==="function"?upstream(url,opts):upstream)
  };}},
  console
 };
 vm.runInNewContext(source,context,{timeout:3000,filename:"Code.gs"});
 function sign(body,nonce=crypto.randomBytes(24).toString("base64url"),ts=Math.floor(Date.now()/1000)){
  const data=Buffer.from(JSON.stringify(body)).toString("base64url");
  const payload=["v1",String(ts),nonce,"weiguo",data].join("\n");
  return {v:1,ts,nonce,client:"weiguo",data,sig:crypto.createHmac("sha256",RELAY).update(payload).digest("hex")};
 }
 function send(packet){return JSON.parse(context.doPost({postData:{contents:JSON.stringify(packet)}}).value);}
 return {context,values,calls,sign,send,setUpstream:x=>upstream=x};
}
function chat(){return {action:"relay",approved_cloud_send:true,provider:"gemini",operation:"chat",
 model:"gemini-test",payload:{messages:[{role:"user",content:"Hello"}],max_tokens:64}};}

test("health probe leaks no API configuration",()=>{
 const h=harness();const raw=JSON.parse(h.context.doGet().value);
 assert.equal(raw.ok,true);assert.equal(JSON.stringify(raw).includes("test-gemini-key"),false);
 assert.equal(JSON.stringify(raw).includes("123456789"),false);
});
test("valid HMAC forwards only a fixed Gemini URL and returns normalized result",()=>{
 const h=harness();const out=h.send(h.sign(chat()));
 assert.equal(out.ok,true);assert.equal(out.text,"OK");assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].url,"https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
 assert.equal(JSON.stringify(out).includes("test-gemini-key"),false);
});
test("bad signature is denied before network call",()=>{
 const h=harness();const packet=h.sign(chat());packet.sig="0".repeat(64);
 assert.equal(h.send(packet).error,"UNAUTHORIZED");assert.equal(h.calls.length,0);
});
test("expired timestamp is denied",()=>{
 const h=harness();const p=h.sign(chat(),undefined,Math.floor(Date.now()/1000)-180);
 assert.equal(h.send(p).error,"EXPIRED");assert.equal(h.calls.length,0);
});
test("nonce cannot be replayed",()=>{
 const h=harness();const p=h.sign(chat());
 assert.equal(h.send(p).ok,true);assert.equal(h.send(p).error,"REPLAY");
 assert.equal(h.calls.length,1);
});
test("arbitrary URL or unknown provider cannot be forwarded",()=>{
 const h=harness();const p=h.sign({...chat(),provider:"custom",operation:"http",payload:{url:"https://attacker.invalid"}});
 assert.equal(h.send(p).error,"ACTION_NOT_ALLOWED");assert.equal(h.calls.length,0);
});
test("model allowlist is mandatory",()=>{
 const h=harness({VAULT_MODELS_GEMINI:""});
 assert.equal(h.send(h.sign(chat())).error,"MODEL_NOT_ALLOWED");assert.equal(h.calls.length,0);
});
test("cloud-send consent is mandatory",()=>{
 const h=harness();assert.equal(h.send(h.sign({...chat(),approved_cloud_send:false})).error,"CONSENT_REQUIRED");
});
test("Telegram recipient whitelist blocks unauthorized chat IDs",()=>{
 const h=harness();
 const q={action:"relay",approved_cloud_send:true,provider:"telegram",operation:"send_message",
  payload:{chat_id:"999999999",text:"hello"}};
 assert.equal(h.send(h.sign(q)).error,"CHAT_NOT_ALLOWED");
 assert.equal(h.calls.length,0);
});
test("Telegram permitted chat sends with fixed target and no token returned",()=>{
 const h=harness();
 h.setUpstream({ok:true,result:{message_id:42,chat:{id:123456789}}});
 const q={action:"relay",approved_cloud_send:true,provider:"telegram",operation:"send_message",
  payload:{chat_id:"123456789",text:"hello"}};
 const out=h.send(h.sign(q));
 assert.equal(out.message_id,42);assert.equal(out.ok,true);
 assert.equal(JSON.stringify(out).includes("123456:"),false);
});
test("status is signed, metadata-only, and never contains keys",()=>{
 const h=harness();const out=h.send(h.sign({action:"status"}));
 assert.equal(out.providers.gemini.configured,true);
 assert.deepEqual([...out.providers.gemini.models],["gemini-test"]);
 assert.equal(JSON.stringify(out).includes("test-gemini-key"),false);
});
test("provider daily quotas fail closed",()=>{
 const h=harness({VAULT_DAILY_LIMIT:"1"});
 assert.equal(h.send(h.sign(chat())).ok,true);
 assert.equal(h.send(h.sign(chat())).error,"QUOTA_EXCEEDED");
 assert.equal(h.calls.length,1);
});

test("Telegram rejects mismatched actual recipient",()=>{
 const h=harness();h.setUpstream({ok:true,result:{message_id:1,chat:{id:77777777}}});
 const q={action:"relay",approved_cloud_send:true,provider:"telegram",operation:"send_message",
  payload:{chat_id:"123456789",text:"hello"}};
 assert.equal(h.send(h.sign(q)).error,"UPSTREAM_REJECTED");
});
test("Telegram supports allowlisted message edits",()=>{
 const h=harness();h.setUpstream({ok:true,result:{message_id:9,chat:{id:123456789}}});
 const q={action:"relay",approved_cloud_send:true,provider:"telegram",operation:"edit_message",
  payload:{chat_id:"123456789",text:"new",message_id:9}};
 const reply=h.send(h.sign(q));
 assert.equal(reply.ok,true);assert.match(h.calls[0].url,/\/editMessageText$/);
});
test("Notion task paths fail closed without bound data source",()=>{
 const h=harness({VAULT_KEY_NOTION:"test-only-notion"});
 const q={action:"relay",approved_cloud_send:true,provider:"notion",operation:"query_tasks",
  payload:{owner_tag:"a".repeat(64)}};
 assert.equal(h.send(h.sign(q)).error,"DATA_SOURCE_NOT_CONFIGURED");
 assert.equal(h.calls.length,0);
});
test("Notion query is scoped to fixed data source and owner digest",()=>{
 const source="7595cbce-7702-4bda-a514-fd09f48e8411";
 const h=harness({VAULT_KEY_NOTION:"test-only-notion",VAULT_NOTION_DATA_SOURCE_ID:source});
 h.setUpstream({results:[],has_more:false});
 const q={action:"relay",approved_cloud_send:true,provider:"notion",operation:"query_tasks",
   payload:{owner_tag:"a".repeat(64)}};
 const reply=h.send(h.sign(q));
 assert.equal(reply.ok,true);
 assert.equal(h.calls[0].url,"https://api.notion.com/v1/data_sources/"+source+"/query");
 assert.equal(JSON.parse(h.calls[0].opts.payload).filter.rich_text.equals,"a".repeat(64));
});
test("Canva generation uses a server-generated idempotency key and preset schema",()=>{
 const h=harness({VAULT_KEY_CANVA:"test-only-canva"});
 h.setUpstream({job:{id:"00000000-0000-4000-8000-000000000001",status:"in_progress"}});
 const q={action:"relay",approved_cloud_send:true,provider:"canva",operation:"image_generate",
  payload:{prompt:"A portrait of a flower",aspect_ratio:"square"}};
 const reply=h.send(h.sign(q));
 assert.equal(reply.ok,true);
 assert.equal(h.calls[0].url,"https://api.canva.com/rest/v1/image-generations");
 const body=JSON.parse(h.calls[0].opts.payload);
 assert.equal(body.idempotency_key,"00000000-0000-4000-8000-000000000000");
 assert.deepEqual({...body.asset_upload},{type:"none"});
});
test("Status lists all eleven approved providers with no credentials",()=>{
 const h=harness();
 const providers=h.send(h.sign({action:"status"})).providers;
 assert.deepEqual(Object.keys(providers).sort(),
 ["gemini","openai","deepseek","anthropic","openrouter","telegram",
  "canva","notion","brave","tavily","github"].sort());
});

test("Canva OAuth refresh rotates single-use credentials without returning secrets",()=>{
 const h=harness({
  VAULT_KEY_CANVA:"expired-access-token-123456789012345",
  VAULT_CANVA_EXPIRES_AT:String(Math.floor(Date.now()/1000)-40),
  VAULT_CANVA_CLIENT_ID:"canva-client-demo",
  VAULT_CANVA_CLIENT_SECRET:"canva-secret-demo",
  VAULT_CANVA_REFRESH_TOKEN:"refresh-token-abcdefghijklmnop"
 });
 h.setUpstream(url=>url.endsWith("/oauth/token")?{
  token_type:"Bearer",access_token:"new-access-token-abcdefghijklmnop",
  refresh_token:"new-refresh-token-abcdefghijklmnop",expires_in:14400
 }:{id:"me"});
 const packet=h.sign({action:"relay",approved_cloud_send:true,
  provider:"canva",operation:"profile",payload:{}});
 const result=h.send(packet);
 assert.equal(result.ok,true);
 assert.equal(h.calls.length,2);
 assert.equal(h.values.get("VAULT_CANVA_REFRESH_TOKEN"),
   "new-refresh-token-abcdefghijklmnop");
 assert.equal(JSON.stringify(result).includes("new-refresh-token-"),false);
 assert.equal(h.calls[1].opts.headers.Authorization,
   "Bearer new-access-token-abcdefghijklmnop");
});
