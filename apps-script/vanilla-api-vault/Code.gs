/**
 * Vanilla API Vault / Relay — Google Apps Script.
 *
 * Trust boundary: only a backend holding VANILLA_RELAY_SHARED_SECRET may call
 * doPost. Never expose that secret or this endpoint as a browser API.
 * Project Settings > Script properties stores all private credentials.
 * Fixed upstream hosts and operations; NO caller-controlled URL forwarding.
 */
const VAULT_VERSION = "1.0.0";
const PROVIDERS = ["gemini","openai","deepseek","anthropic","openrouter","telegram","canva","notion","brave","github"];
const CHAT_PROVIDERS = ["gemini","openai","deepseek","anthropic","openrouter"];
const ACTIONS = {
  gemini:["chat"], openai:["chat"], deepseek:["chat"], anthropic:["chat"], openrouter:["chat"],
  telegram:["send_message"], canva:["profile","designs","image_generate","design_generate","job_status"],
  notion:["search"], brave:["search"], github:["repo"]
};
const MAX_INBOUND = 72000;
const MAX_TEXT = 30000;
const RESPONSE_LIMIT = 30000;

function json_(result) {
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
function doGet() {
  // Public probe intentionally contains NO provider availability or credentials.
  return json_({ok:true,service:"vanilla-api-vault",version:VAULT_VERSION,mode:"signed-post-only"});
}
function error_(code) { return {ok:false,error:code}; }
function fail_(code) { return json_(error_(code)); }
function key_(name) { return PropertiesService.getScriptProperties().getProperty(name) || ""; }
function digits_(n) { return typeof n === "number" && isFinite(n) && Math.floor(n) === n; }
function hex_(bytes) { return bytes.map(x=>("0"+(x&255).toString(16)).slice(-2)).join(""); }
function equals_(left,right) {
  // Compare equal-size lowercase hexadecimal digests without early exit.
  if (!/^[a-f0-9]{64}$/.test(left || "") || !/^[a-f0-9]{64}$/.test(right || "")) return false;
  let diff=0; for(let i=0;i<64;i++) diff |= left.charCodeAt(i)^right.charCodeAt(i);
  return diff===0;
}
function signedInput_(packet) {
  return ["v1",String(packet.ts),packet.nonce,packet.client,packet.data].join("\n");
}
function decodePacket_(packet) {
  if (!packet || packet.v!==1 || !digits_(packet.ts) ||
      typeof packet.nonce!=="string" || !/^[A-Za-z0-9_-]{20,50}$/.test(packet.nonce) ||
      packet.client!=="weiguo" || typeof packet.data!=="string" ||
      !/^[A-Za-z0-9_-]{2,68000}$/.test(packet.data) ||
      typeof packet.sig!=="string") throw Error("BAD_ENVELOPE");
  const now=Math.floor(Date.now()/1000);
  if (Math.abs(now-packet.ts)>120) throw Error("EXPIRED");
  const secret=key_("VANILLA_RELAY_SHARED_SECRET");
  if (secret.length<32) throw Error("NOT_CONFIGURED");
  const expected=hex_(Utilities.computeHmacSha256Signature(signedInput_(packet),secret));
  if (!equals_(expected,packet.sig)) throw Error("UNAUTHORIZED");
  const bytes=Utilities.base64DecodeWebSafe(packet.data+"=".repeat((4-packet.data.length%4)%4));
  if(bytes.length>48000) throw Error("PAYLOAD_TOO_LARGE");
  const payload=JSON.parse(Utilities.newBlob(bytes).getDataAsString("UTF-8"));
  if (!payload || Array.isArray(payload) || typeof payload!=="object") throw Error("BAD_PAYLOAD");
  return payload;
}
function reserve_(packet,provider) {
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(7000)) throw Error("BUSY");
  try {
    const props=PropertiesService.getScriptProperties();
    const now=Math.floor(Date.now()/1000);
    const seen=JSON.parse(props.getProperty("VAULT_REPLAY_V1")||"{}");
    Object.keys(seen).forEach(n=>{if(!digits_(seen[n]) || now-seen[n]>180) delete seen[n];});
    if(Object.prototype.hasOwnProperty.call(seen,packet.nonce)) throw Error("REPLAY");
    // Keep the entire replay window: do not silently evict valid nonces.
    if(Object.keys(seen).length>=150) throw Error("REPLAY_CAPACITY");
    seen[packet.nonce]=now;
    props.setProperty("VAULT_REPLAY_V1",JSON.stringify(seen));
    const state=JSON.parse(props.getProperty("VAULT_LIMITS_"+provider)||"{}");
    const minute=Math.floor(now/60), day=Math.floor(now/86400);
    const rpm=Number(props.getProperty("VAULT_RPM_LIMIT")||"8");
    const daily=Number(props.getProperty("VAULT_DAILY_LIMIT")||"80");
    if(!Number.isInteger(rpm)||rpm<1||rpm>60||!Number.isInteger(daily)||daily<1||daily>10000)
      throw Error("INVALID_LIMITS");
    const usedMinute=state.minute===minute?state.minuteCalls||0:0;
    const usedDay=state.day===day?state.dayCalls||0:0;
    if(usedMinute>=rpm || usedDay>=daily) throw Error("QUOTA_EXCEEDED");
    props.setProperty("VAULT_LIMITS_"+provider,JSON.stringify({
      minute:minute,minuteCalls:usedMinute+1,day:day,dayCalls:usedDay+1
    }));
  } finally {lock.releaseLock();}
}
function configured_(provider) {
  return Boolean(key_("VAULT_KEY_"+provider.toUpperCase()));
}
function status_() {
  const info={};
  PROVIDERS.forEach(p=>info[p]={configured:configured_(p),operations:ACTIONS[p]});
  return {ok:true,version:VAULT_VERSION,providers:info,credentialValuesReturned:false};
}
function text_(s,max) {
  if(typeof s!=="string" || !s.trim() || s.length>max) throw Error("INVALID_INPUT");
  return s;
}
function safeModel_(provider,model) {
  text_(model,100);
  if(!/^[A-Za-z0-9_.:\/-]{1,100}$/.test(model)) throw Error("BAD_MODEL");
  // Fail closed until the owner supplies an explicit provider model allowlist.
  const allowed=key_("VAULT_MODELS_"+provider.toUpperCase()).split(",").map(x=>x.trim()).filter(Boolean);
  if(!allowed.includes(model)) throw Error("MODEL_NOT_ALLOWED");
  return model;
}
function request_(url,headers,method,body) {
  const options={method:method,headers:headers,muteHttpExceptions:true,
    followRedirects:false};
  if(body!==undefined) {options.contentType="application/json"; options.payload=JSON.stringify(body);}
  const res=UrlFetchApp.fetch(url,options);
  const status=res.getResponseCode();
  if(status<200||status>=300) throw Error("UPSTREAM_"+status);
  const raw=res.getContentText("UTF-8");
  if(raw.length>150000) throw Error("UPSTREAM_TOO_LARGE");
  try { return JSON.parse(raw); } catch (_) { throw Error("UPSTREAM_BAD_JSON"); }
}
function chat_(provider,req) {
  const model=safeModel_(provider,req.model);
  const input=req.payload || {};
  if(!Array.isArray(input.messages)||input.messages.length<1||input.messages.length>20)
    throw Error("BAD_MESSAGES");
  let total=0;
  const messages=input.messages.map(m=>{
    if(!m || !["system","user","assistant"].includes(m.role)) throw Error("BAD_ROLE");
    const content=text_(m.content,12000);total+=content.length;
    return {role:m.role,content:content};
  });
  if(total>30000) throw Error("INPUT_TOO_LARGE");
  const limit=key_("VAULT_MAX_OUTPUT_TOKENS");
  const maximum=limit?Number(limit):1024;
  if(!Number.isInteger(maximum)||maximum<1||maximum>4096) throw Error("INVALID_OUTPUT_LIMIT");
  const requested=input.max_tokens===undefined?Math.min(maximum,1024):input.max_tokens;
  if(!digits_(requested)||requested<1||requested>maximum) throw Error("BAD_MAX_TOKENS");
  const secret=key_("VAULT_KEY_"+provider.toUpperCase());
  if(!secret) throw Error("KEY_NOT_CONFIGURED");
  let data,usage={};
  if(provider==="gemini") {
    const system=messages.filter(m=>m.role==="system").map(m=>m.content).join("\n");
    const contents=messages.filter(m=>m.role!=="system").map(m=>({
      role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]
    }));
    if(!contents.length) throw Error("BAD_MESSAGES");
    const body={contents:contents,generationConfig:{maxOutputTokens:requested}};
    if(system) body.systemInstruction={parts:[{text:system}]};
    data=request_("https://generativelanguage.googleapis.com/v1beta/models/"+
      encodeURIComponent(model)+":generateContent",
      {"x-goog-api-key":secret},"post",body);
    const candidate=(data.candidates||[])[0]||{};
    if(candidate.finishReason==="MAX_TOKENS") throw Error("OUTPUT_TRUNCATED");
    const raw=((candidate.content||{}).parts||[]).filter(x=>!x.thought).map(x=>x.text||"").join("");
    usage={input_tokens:(data.usageMetadata||{}).promptTokenCount||0,
      output_tokens:(data.usageMetadata||{}).candidatesTokenCount||0};
    return {ok:true,provider:provider,model:model,text:String(raw).slice(0,RESPONSE_LIMIT),usage:usage};
  }
  if(provider==="anthropic") {
    const system=messages.filter(m=>m.role==="system").map(m=>m.content).join("\n");
    const body={model:model,max_tokens:requested,
      messages:messages.filter(m=>m.role!=="system").map(m=>({role:m.role,content:m.content}))};
    if(system) body.system=system;
    if(!body.messages.length) throw Error("BAD_MESSAGES");
    data=request_("https://api.anthropic.com/v1/messages",
      {"x-api-key":secret,"anthropic-version":"2023-06-01"},"post",body);
    if(data.stop_reason==="max_tokens") throw Error("OUTPUT_TRUNCATED");
    const raw=(data.content||[]).filter(x=>x.type==="text").map(x=>x.text||"").join("");
    return {ok:true,provider:provider,model:model,text:String(raw).slice(0,RESPONSE_LIMIT),
      usage:{input_tokens:(data.usage||{}).input_tokens||0,output_tokens:(data.usage||{}).output_tokens||0}};
  }
  const endpoints={
    openai:"https://api.openai.com/v1/chat/completions",
    deepseek:"https://api.deepseek.com/chat/completions",
    openrouter:"https://openrouter.ai/api/v1/chat/completions"
  };
  const body={model:model,stream:false,messages:messages};
  body[provider==="openai"?"max_completion_tokens":"max_tokens"]=requested;
  data=request_(endpoints[provider],{Authorization:"Bearer "+secret},"post",body);
  const choice=(data.choices||[])[0]||{};
  if(choice.finish_reason==="length") throw Error("OUTPUT_TRUNCATED");
  return {ok:true,provider:provider,model:model,text:String((choice.message||{}).content||"").slice(0,RESPONSE_LIMIT),
    usage:{input_tokens:(data.usage||{}).prompt_tokens||0,output_tokens:(data.usage||{}).completion_tokens||0}};
}
function telegram_(req) {
  const p=req.payload||{}, chat=String(p.chat_id||"");
  if(!/^-?[0-9]{5,20}$/.test(chat)) throw Error("BAD_CHAT_ID");
  const allowed=key_("VAULT_TELEGRAM_CHAT_IDS").split(",").map(x=>x.trim()).filter(Boolean);
  if(!allowed.includes(chat)) throw Error("CHAT_NOT_ALLOWED");
  const msg=text_(p.text,4096), token=key_("VAULT_KEY_TELEGRAM");
  if(!/^[0-9]{5,15}:[A-Za-z0-9_-]{30,100}$/.test(token)) throw Error("KEY_NOT_CONFIGURED");
  const data=request_("https://api.telegram.org/bot"+token+"/sendMessage",{},"post",
    {chat_id:chat,text:msg,disable_web_page_preview:true});
  if(!data.ok) throw Error("UPSTREAM_REJECTED");
  return {ok:true,provider:"telegram",operation:"send_message",message_id:(data.result||{}).message_id||null};
}
function canva_(req) {
  const token=key_("VAULT_KEY_CANVA");
  if(!token) throw Error("KEY_NOT_CONFIGURED");
  const p=req.payload||{},root="https://api.canva.com/rest/v1";
  let method="get",path="",body;
  switch(req.operation) {
    case "profile": path="/users/me";break;
    case "designs": path="/designs?limit=10";break;
    case "image_generate":
      method="post";path="/image-generations";
      body={prompt:text_(p.prompt,1500)};
      if(p.aspect_ratio!==undefined) body.aspect_ratio=text_(p.aspect_ratio,24);
      break;
    case "design_generate":
      method="post";path="/generations";body={brief:text_(p.brief,1500)};
      break;
    case "job_status":
      if(!["image","design"].includes(p.kind)||typeof p.job_id!=="string"||
          !/^[A-Za-z0-9_-]{1,100}$/.test(p.job_id)) throw Error("BAD_JOB_ID");
      path=(p.kind==="image"?"/image-generations/":"/generations/")+p.job_id;break;
    default:throw Error("ACTION_NOT_ALLOWED");
  }
  const data=request_(root+path,{Authorization:"Bearer "+token},method,body);
  return {ok:true,provider:"canva",operation:req.operation,data:JSON.parse(JSON.stringify(data).slice(0,20000))};
}
function notion_(req) {
  const token=key_("VAULT_KEY_NOTION");
  if(!token) throw Error("KEY_NOT_CONFIGURED");
  const query=req.payload&&req.payload.query===undefined?"":(req.payload||{}).query;
  if(typeof query!=="string"||query.length>120) throw Error("INVALID_INPUT");
  const data=request_("https://api.notion.com/v1/search",
    {Authorization:"Bearer "+token,"Notion-Version":"2022-06-28"},"post",{query:query,page_size:10});
  const items=(data.results||[]).slice(0,10).map(x=>({id:x.id,object:x.object,url:x.url||""}));
  return {ok:true,provider:"notion",operation:"search",results:items};
}
function brave_(req) {
  const token=key_("VAULT_KEY_BRAVE");
  if(!token) throw Error("KEY_NOT_CONFIGURED");
  const query=text_((req.payload||{}).query,250);
  const data=request_("https://api.search.brave.com/res/v1/web/search?q="+encodeURIComponent(query)+"&count=5",
    {"X-Subscription-Token":token,"Accept":"application/json"},"get");
  return {ok:true,provider:"brave",operation:"search",results:
    (((data.web||{}).results)||[]).slice(0,5).map(x=>({title:String(x.title||"").slice(0,200),
      url:x.url||"",description:String(x.description||"").slice(0,400)}))};
}
function github_(req) {
  const p=req.payload||{};
  if(typeof p.owner!=="string"||typeof p.repo!=="string"||
    !/^[A-Za-z0-9_.-]{1,80}$/.test(p.owner)||!/^[A-Za-z0-9_.-]{1,100}$/.test(p.repo)||
    p.owner==="."||p.owner===".."||p.repo==="."||p.repo==="..") throw Error("BAD_REPOSITORY");
  const token=key_("VAULT_KEY_GITHUB");
  if(!token) throw Error("KEY_NOT_CONFIGURED");
  const data=request_("https://api.github.com/repos/"+encodeURIComponent(p.owner)+"/"+encodeURIComponent(p.repo),
    {"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28"},"get");
  return {ok:true,provider:"github",operation:"repo",name:data.full_name||"",
    stars:data.stargazers_count||0,private:Boolean(data.private),archived:Boolean(data.archived)};
}
function dispatch_(req) {
  if(req.action==="status") return status_();
  const provider=req.provider,op=req.operation;
  if(!PROVIDERS.includes(provider)||typeof op!=="string"||!ACTIONS[provider].includes(op))
    throw Error("ACTION_NOT_ALLOWED");
  if(!configured_(provider)) throw Error("KEY_NOT_CONFIGURED");
  if(req.action!=="relay"||req.approved_cloud_send!==true) throw Error("CONSENT_REQUIRED");
  reserve_(req._envelope,provider);
  if(CHAT_PROVIDERS.includes(provider)) return chat_(provider,req);
  if(provider==="telegram") return telegram_(req);
  if(provider==="canva") return canva_(req);
  if(provider==="notion") return notion_(req);
  if(provider==="brave") return brave_(req);
  if(provider==="github") return github_(req);
  throw Error("ACTION_NOT_ALLOWED");
}
function doPost(e) {
  try {
    if(!e||!e.postData||typeof e.postData.contents!=="string"||
        e.postData.contents.length>MAX_INBOUND) return fail_("BAD_REQUEST");
    const packet=JSON.parse(e.postData.contents);
    const req=decodePacket_(packet);
    req._envelope=packet;
    const output=dispatch_(req);
    return json_(output);
  } catch(ex) {
    const known=[
      "BAD_REQUEST","BAD_ENVELOPE","EXPIRED","NOT_CONFIGURED","UNAUTHORIZED","PAYLOAD_TOO_LARGE",
      "BAD_PAYLOAD","BUSY","REPLAY","REPLAY_CAPACITY","QUOTA_EXCEEDED","INVALID_LIMITS",
      "ACTION_NOT_ALLOWED","KEY_NOT_CONFIGURED","CONSENT_REQUIRED","MODEL_NOT_ALLOWED",
      "BAD_MODEL","BAD_MESSAGES","BAD_ROLE","INPUT_TOO_LARGE","BAD_MAX_TOKENS",
      "INVALID_OUTPUT_LIMIT","INVALID_INPUT","OUTPUT_TRUNCATED","UPSTREAM_TOO_LARGE",
      "UPSTREAM_BAD_JSON","UPSTREAM_REJECTED","BAD_CHAT_ID","CHAT_NOT_ALLOWED",
      "BAD_JOB_ID","BAD_REPOSITORY"
    ];
    const code=String(ex&&ex.message||"INTERNAL");
    // Do not forward upstream error bodies, credentials, URLs, prompts or stack traces.
    return fail_(known.includes(code)||/^UPSTREAM_[0-9]{3}$/.test(code)?code:"INTERNAL");
  }
}
/** Run manually once from the script editor; reports no credential values. */
function diagnoseVault() {
  const shared=key_("VANILLA_RELAY_SHARED_SECRET");
  const status=status_();
  return {ready:shared.length>=32,version:VAULT_VERSION,
    providers:status.providers,required:"Set relay secret and provider model allowlists."};
}
