/**
 * Vanilla API Vault / Relay — Google Apps Script.
 *
 * Trust boundary: only a backend holding VANILLA_RELAY_SHARED_SECRET may call
 * doPost. Never expose that secret or this endpoint as a browser API.
 * Project Settings > Script properties stores all private credentials.
 * Fixed upstream hosts and operations; NO caller-controlled URL forwarding.
 */
const VAULT_VERSION = "1.0.0";
const PROVIDERS = ["gemini","openai","deepseek","anthropic","openrouter","telegram","canva","notion","brave","tavily","github"];
const CHAT_PROVIDERS = ["gemini","openai","deepseek","anthropic","openrouter"];
const ACTIONS = {
  gemini:["chat"], openai:["chat"], deepseek:["chat"], anthropic:["chat"], openrouter:["chat"],
  telegram:["send_message","edit_message","answer_callback"], canva:["profile","designs","image_generate","design_generate","job_status"],
  notion:["search","query_tasks","read_task","create_task","update_task"], brave:["search"], tavily:["search"], github:["repo"]
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
  PROVIDERS.forEach(p=>info[p]={configured:configured_(p),operations:ACTIONS[p],models:CHAT_PROVIDERS.includes(p)?key_("VAULT_MODELS_"+p.toUpperCase()).split(",").map(x=>x.trim()).filter(Boolean):[]});
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
    if(raw.length>RESPONSE_LIMIT) throw Error("OUTPUT_TRUNCATED");
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
    if(raw.length>RESPONSE_LIMIT) throw Error("OUTPUT_TRUNCATED");
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
  if(choice.finish_reason==="length" || String((choice.message||{}).content||"").length>RESPONSE_LIMIT) throw Error("OUTPUT_TRUNCATED");
  return {ok:true,provider:provider,model:model,text:String((choice.message||{}).content||"").slice(0,RESPONSE_LIMIT),
    usage:{input_tokens:(data.usage||{}).prompt_tokens||0,output_tokens:(data.usage||{}).completion_tokens||0}};
}
function telegram_(req) {
  const p=req.payload||{};
  const token=key_("VAULT_KEY_TELEGRAM");
  if(!/^[0-9]{5,15}:[A-Za-z0-9_-]{30,100}$/.test(token))throw Error("KEY_NOT_CONFIGURED");
  const api="https://api.telegram.org/bot"+token+"/";
  const operation=req.operation;
  if(operation==="answer_callback"){
    const callback=text_(p.callback_query_id,200);
    if(!/^[A-Za-z0-9_-]{4,200}$/.test(callback))throw Error("INVALID_INPUT");
    const data=request_(api+"answerCallbackQuery",{},"post",{callback_query_id:callback});
    if(!data.ok)throw Error("UPSTREAM_REJECTED");
    return {ok:true,provider:"telegram",operation:operation,accepted:true};
  }
  const chat=String(p.chat_id||"");
  if(!/^-?[0-9]{5,20}$/.test(chat))throw Error("BAD_CHAT_ID");
  const allowed=key_("VAULT_TELEGRAM_CHAT_IDS").split(",").map(x=>x.trim()).filter(Boolean);
  if(!allowed.includes(chat))throw Error("CHAT_NOT_ALLOWED");
  const msg=text_(p.text,4096);
  let method,body;
  if(operation==="send_message"){
    method="sendMessage";body={chat_id:chat,text:msg,disable_web_page_preview:true};
  }else if(operation==="edit_message"){
    if(!digits_(p.message_id)||p.message_id<1)throw Error("INVALID_INPUT");
    method="editMessageText";body={chat_id:chat,message_id:p.message_id,text:msg,
      disable_web_page_preview:true};
  }else throw Error("ACTION_NOT_ALLOWED");
  const data=request_(api+method,{},"post",body);
  const result=data.result||{};
  if(!data.ok||!result.chat||String(result.chat.id)!==chat)throw Error("UPSTREAM_REJECTED");
  return {ok:true,provider:"telegram",operation:operation,
    message_id:result.message_id||null,accepted:true};
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
      body={prompt:text_(p.prompt,1500),idempotency_key:Utilities.getUuid(),
        asset_upload:{type:"none"},aspect_ratio:"square"};
      if(p.aspect_ratio!==undefined){
        if(!["square","landscape","portrait"].includes(p.aspect_ratio))throw Error("INVALID_INPUT");
        body.aspect_ratio=p.aspect_ratio;
      }
      break;
    case "design_generate":
      method="post";path="/generations";
      body={brief:text_(p.brief,1500),design_type:{type:"preset",name:"presentation"}};
      break;
    case "job_status":
      if(!["image","presentation"].includes(p.kind)||typeof p.job_id!=="string"||
          !/^[A-Za-z0-9_-]{1,100}$/.test(p.job_id)) throw Error("BAD_JOB_ID");
      path=(p.kind==="image"?"/image-generations/":"/generations/")+p.job_id;break;
    default:throw Error("ACTION_NOT_ALLOWED");
  }
  const data=request_(root+path,{Authorization:"Bearer "+token},method,body);
  if(JSON.stringify(data).length>20000) throw Error("UPSTREAM_TOO_LARGE");
  return {ok:true,provider:"canva",operation:req.operation,data:data};
}
function notion_(req) {
  const token=key_("VAULT_KEY_NOTION");
  if(!token) throw Error("KEY_NOT_CONFIGURED");
  const operation=req.operation,p=req.payload||{};
  const source=key_("VAULT_NOTION_DATA_SOURCE_ID");
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ownerTag=/^[a-f0-9]{64}$/;
  const root="https://api.notion.com/v1";
  const headers={Authorization:"Bearer "+token,"Notion-Version":"2026-03-11"};
  if(operation==="search"){
    const query=p.query===undefined?"":p.query;
    if(typeof query!=="string"||query.length>120) throw Error("INVALID_INPUT");
    const data=request_(root+"/search",headers,"post",{query:query,page_size:10});
    const items=(data.results||[]).slice(0,10).map(x=>({id:x.id,object:x.object,url:x.url||""}));
    return {ok:true,provider:"notion",operation:"search",results:items};
  }
  if(!uuid.test(source)) throw Error("DATA_SOURCE_NOT_CONFIGURED");
  const compactPage=data=>({id:data.id,url:data.url||"",parent:data.parent||{},
    properties:data.properties||{}});
  const dataSourceUrl=root+"/data_sources/"+encodeURIComponent(source)+"/query";
  const pageUrl=id=>root+"/pages/"+encodeURIComponent(id);
  if(operation==="query_tasks"){
    if(typeof p.owner_tag!=="string"||!ownerTag.test(p.owner_tag))throw Error("INVALID_INPUT");
    const filter={property:"Vanilla Owner",rich_text:{equals:p.owner_tag}};
    const data=request_(dataSourceUrl,headers,"post",{page_size:15,filter:filter});
    return {ok:true,provider:"notion",operation:operation,data:{
      results:(data.results||[]).slice(0,15).map(compactPage),has_more:Boolean(data.has_more)}};
  }
  if(operation==="read_task"||operation==="update_task"){
    if(typeof p.page_id!=="string"||!uuid.test(p.page_id))throw Error("BAD_JOB_ID");
    const before=request_(pageUrl(p.page_id),headers,"get");
    if(!before.parent||before.parent.type!=="data_source_id"||
        String(before.parent.data_source_id).toLowerCase()!==source.toLowerCase())
      throw Error("NOTION_SCOPE_DENIED");
    if(operation==="read_task")
      return {ok:true,provider:"notion",operation:operation,data:compactPage(before)};
    const patch=p.properties||{};
    if(Object.keys(patch).length!==1)throw Error("INVALID_INPUT");
    let properties;
    if(Object.prototype.hasOwnProperty.call(patch,"Done") &&
       patch.Done&&patch.Done.checkbox===true)
      properties={Done:{checkbox:true}};
    else if(Object.prototype.hasOwnProperty.call(patch,"When") &&
      patch.When&&patch.When.date&&
      typeof patch.When.date.start==="string"&&patch.When.date.start.length<=50&&
      /^\d{4}-\d{2}-\d{2}T/.test(patch.When.date.start))
      properties={When:{date:{start:patch.When.date.start}}};
    else throw Error("INVALID_INPUT");
    return {ok:true,provider:"notion",operation:operation,data:compactPage(
      request_(pageUrl(p.page_id),headers,"patch",{properties:properties}))};
  }
  if(operation==="create_task"){
    const title=text_(p.title,180),date=text_(p.when,50);
    if(!/^\d{4}-\d{2}-\d{2}T/.test(date) ||
       typeof p.owner_tag!=="string"||!ownerTag.test(p.owner_tag))throw Error("INVALID_INPUT");
    const details=p.details||"";
    if(typeof details!=="string"||details.length>1800)throw Error("INVALID_INPUT");
    const properties={
      Name:{title:[{text:{content:title}}]},
      When:{date:{start:date}},
      "Vanilla Owner":{rich_text:[{text:{content:p.owner_tag}}]},
      Done:{checkbox:false}
    };
    const body={parent:{type:"data_source_id",data_source_id:source},properties:properties};
    if(details.trim()) body.children=[{object:"block",type:"paragraph",
      paragraph:{rich_text:[{type:"text",text:{content:details}}]}}];
    return {ok:true,provider:"notion",operation:operation,data:compactPage(
      request_(root+"/pages",headers,"post",body))};
  }
  throw Error("ACTION_NOT_ALLOWED");
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
function tavily_(req) {
  const token=key_("VAULT_KEY_TAVILY");
  if(!token) throw Error("KEY_NOT_CONFIGURED");
  const query=text_((req.payload||{}).query,250);
  const data=request_("https://api.tavily.com/search",
    {Authorization:"Bearer "+token},"post",
    {query:query,search_depth:"basic",max_results:5,include_answer:false,include_raw_content:false});
  return {ok:true,provider:"tavily",operation:"search",results:
    (data.results||[]).slice(0,5).map(x=>({title:String(x.title||"").slice(0,200),
      url:x.url||"",description:String(x.content||"").slice(0,400)}))};
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
  if(req.action==="status") { reserve_(req._envelope,"status"); return status_(); }
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
  if(provider==="tavily") return tavily_(req);
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
      "BAD_JOB_ID","BAD_REPOSITORY","NOTION_SCOPE_DENIED","DATA_SOURCE_NOT_CONFIGURED"
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
