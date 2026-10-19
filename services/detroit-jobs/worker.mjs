/** Detroit Persistent Jobs — opt-in Cloudflare Worker + D1 scheduler.
 * No JavaScript execution, no arbitrary scraping, no AI model or API secrets in job payloads.
 * v0 supports allowlisted public-page change checks only; server must be deployed separately.
 */
import {enqueueChangeNotice,dispatchNotifications,notificationEndpoint} from "./notifications.mjs";
const JSON_HEADERS={"content-type":"application/json;charset=utf-8","cache-control":"no-store"};
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});}
function requireAdmin(request,env){
 const token=env.DETROIT_ADMIN_TOKEN;
 if(typeof token!=="string"||token.length<32)return false;
 const auth=request.headers.get("Authorization")||"";
 const supplied=auth.startsWith("Bearer ")?auth.slice(7):"";
 // Constant length and ASCII compare to avoid trivial timing leaks.
 if(supplied.length!==token.length)return false;
 let delta=0;for(let i=0;i<token.length;i++)delta|=supplied.charCodeAt(i)^token.charCodeAt(i);
 return delta===0;
}
function owner(value){if(typeof value!=="string"||!/^[A-Za-z0-9_-]{2,64}$/.test(value))throw Error("owner 必須為授權的識別符");return value;}
function allowedURL(input,env){
 let url;try{url=new URL(input);}catch{throw Error("網址格式錯誤");}
 if(url.protocol!=="https:"||url.username||url.password||url.port&&url.port!=="443"||url.search.length>500||url.hash)throw Error("僅支援正常 HTTPS 公開網址");
 const hosts=(env.DETROIT_ALLOWED_HOSTS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!hosts.length||!hosts.includes(url.hostname.toLowerCase()))throw Error("網址未列入後端允許清單");
 return url.toString();
}
async function pageCheck(job,env,now){
 const url=allowedURL(job.target_url,env);
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(url,{redirect:"manual",signal:controller.signal,headers:{"user-agent":"Vanilla-Detroit-Jobs/0.1"}});
  if(!response.ok||response.status>=300)throw Error("HTTP "+response.status+"（不追蹤轉址）");
  const body=await response.text();
  if(body.length>250000)throw Error("目標頁面過大，拒絕收錄");
  const bytes=new TextEncoder().encode(body);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");
  const changed=Boolean(job.last_digest)&&job.last_digest!==digest;
  await env.DETROIT_DB.batch([
   env.DETROIT_DB.prepare("UPDATE jobs SET last_digest=?,last_error=NULL,checked_at=?,next_run=?,updated_at=? WHERE id=? AND enabled=1")
    .bind(digest,now,now+job.interval_minutes*60000,now,job.id),
   env.DETROIT_DB.prepare("INSERT INTO job_runs(job_id,owner_id,checked_at,status,changed,digest,detail) VALUES(?,?,?,?,?,?,?)")
    .bind(job.id,job.owner_id,now,"ok",changed?1:0,digest,changed?"內容摘要已變更":"無變更")
  ]);
  if(changed)await enqueueChangeNotice(env.DETROIT_DB,job,digest,now);
 }finally{clearTimeout(timeout);}
}
async function tick(env){
 if(!env.DETROIT_DB)throw Error("D1 database is not bound");
 const now=Date.now();
 const jobs=await env.DETROIT_DB.prepare("SELECT id,owner_id,target_url,interval_minutes,last_digest FROM jobs WHERE enabled=1 AND next_run<=? ORDER BY next_run LIMIT 12").bind(now).all();
 for(const job of jobs.results||[]){
  try{await pageCheck(job,env,now);}
  catch(e){const message=String(e instanceof Error?e.message:e).slice(0,250);
   await env.DETROIT_DB.batch([
    env.DETROIT_DB.prepare("UPDATE jobs SET last_error=?,checked_at=?,next_run=?,updated_at=? WHERE id=?").bind(message,now,now+Math.max(60,job.interval_minutes)*60000,now,job.id),
    env.DETROIT_DB.prepare("INSERT INTO job_runs(job_id,owner_id,checked_at,status,changed,digest,detail) VALUES(?,?,?,?,?,?,?)").bind(job.id,job.owner_id,now,"error",0,null,message)
   ]);
  }
 }
}
export default {
 async fetch(request,env){
  if(!requireAdmin(request,env))return json({error:"unauthorized"},401);
  if(!env.DETROIT_DB)return json({error:"D1 not configured"},503);
  const url=new URL(request.url);
  if(request.method==="GET"&&url.pathname==="/health")return json({status:"configured",execution:"worker-cron",modelsLoaded:0,notificationsConfigured:Boolean(notificationEndpoint(env)&&env.DETROIT_NOTIFY_SECRET?.length>=32)});
  if(request.method==="POST"&&url.pathname==="/v1/jobs"){
   let body;try{body=await request.json();}catch{return json({error:"invalid JSON"},400);}
   let ownerId,target;try{ownerId=owner(body.owner);target=allowedURL(body.url,env);}catch(e){return json({error:String(e.message||e)},400);}
   const interval=Number(body.intervalMinutes??60);
   if(!Number.isInteger(interval)||interval<60||interval>10080)return json({error:"intervalMinutes must be 60..10080"},400);
   const n=(await env.DETROIT_DB.prepare("SELECT COUNT(*) as n FROM jobs WHERE owner_id=? AND enabled=1").bind(ownerId).first())?.n||0;
   if(n>=20)return json({error:"owner job limit exceeded"},429);
   const id=crypto.randomUUID(),now=Date.now();
   await env.DETROIT_DB.prepare("INSERT INTO jobs(id,owner_id,target_url,interval_minutes,enabled,next_run,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?)").bind(id,ownerId,target,interval,now,now,now).run();
   return json({id,owner:ownerId,status:"scheduled",note:"Worker Cron must be deployed and active"},201);
  }
  if(request.method==="GET"&&url.pathname==="/v1/jobs"){
   let ownerId;try{ownerId=owner(url.searchParams.get("owner"));}catch{return json({error:"invalid owner"},400);}
   const rows=await env.DETROIT_DB.prepare("SELECT id,target_url,interval_minutes,enabled,next_run,checked_at,last_error FROM jobs WHERE owner_id=? ORDER BY created_at DESC LIMIT 30").bind(ownerId).all();
   return json({jobs:rows.results||[]});
  }
  if(request.method==="GET"&&url.pathname==="/v1/changes"){
   let ownerId;try{ownerId=owner(url.searchParams.get("owner"));}catch{return json({error:"invalid owner"},400);}
   const rows=await env.DETROIT_DB.prepare("SELECT job_id,checked_at,status,changed,detail FROM job_runs WHERE owner_id=? ORDER BY checked_at DESC LIMIT 100").bind(ownerId).all();
   return json({runs:rows.results||[]});
  }
  if(request.method==="GET"&&url.pathname==="/v1/notifications"){
   let ownerId;try{ownerId=owner(url.searchParams.get("owner"));}catch{return json({error:"invalid owner"},400);}
   const rows=await env.DETROIT_DB.prepare("SELECT id,job_id,created_at,attempts,status,delivered_at,last_error FROM notification_outbox WHERE owner_id=? ORDER BY created_at DESC LIMIT 100").bind(ownerId).all();
   return json({notifications:rows.results||[]});
  }
  if(request.method==="POST"&&url.pathname==="/v1/admin/dispatch"){
   try{return json(await dispatchNotifications(env));}catch(e){return json({error:String(e instanceof Error?e.message:e)},503);}
  }
  if(request.method==="DELETE"&&url.pathname.startsWith("/v1/jobs/")){
   let ownerId;try{ownerId=owner(url.searchParams.get("owner"));}catch{return json({error:"invalid owner"},400);}
   const id=url.pathname.slice("/v1/jobs/".length);
   if(!/^[a-f0-9-]{36}$/i.test(id))return json({error:"invalid job id"},400);
   const result=await env.DETROIT_DB.prepare("UPDATE jobs SET enabled=0,updated_at=? WHERE id=? AND owner_id=?").bind(Date.now(),id,ownerId).run();
   return json({disabled:Boolean(result.meta?.changes)});
  }
  return json({error:"unknown route"},404);
 },
 async scheduled(_event,env,ctx){ctx.waitUntil((async()=>{await tick(env);await dispatchNotifications(env);})());}
};
export {allowedURL,requireAdmin};
