/** Persistent Jobs notification outbox, Cloudflare D1. No tokens or webhook secrets in client. */
export function notificationEndpoint(env){
 const value=env.DETROIT_NOTIFY_WEBHOOK,host=env.DETROIT_NOTIFY_HOST;
 if(!value||!host)return null;
 let uri;try{uri=new URL(value);}catch{throw Error('Invalid notification webhook URL');}
 if(uri.protocol!=='https:'||uri.username||uri.password||uri.hash||uri.port&&uri.port!=='443'||uri.hostname.toLowerCase()!==host.toLowerCase())throw Error('Notification endpoint must be pinned HTTPS host');
 if(/^(?:localhost|127\.|10\.|192\.168\.|172\.|\[|0\.)/i.test(uri.hostname))throw Error('Private notification address blocked');
 return uri.toString();
}
function sha256(bytes){return crypto.subtle.digest('SHA-256',bytes).then(v=>Array.from(new Uint8Array(v)).map(x=>x.toString(16).padStart(2,'0')).join(''));}
/** Accepts a change only once per job/digest, even when retries or workers overlap. */
export async function enqueueChangeNotice(db,job,digest,now){
 if(!job.id||!job.owner_id||!/^[0-9a-f]{64}$/i.test(digest))throw Error('Invalid notification job or digest');
 return db.prepare('INSERT OR IGNORE INTO notification_outbox(job_id,owner_id,target_url,digest,created_at,next_attempt,attempts,status) VALUES(?,?,?,?,?,?,0,?)')
 .bind(job.id,job.owner_id,job.target_url,digest,now,now,'pending').run();
}
export async function dispatchNotifications(env,now=Date.now(),fetchImpl=fetch){
 if(!env.DETROIT_DB)throw Error('D1 missing');
 const url=notificationEndpoint(env);
 if(!url)return {status:'not_configured',delivered:0,failed:0};
 const secret=env.DETROIT_NOTIFY_SECRET;
 if(typeof secret!=='string'||secret.length<32)throw Error('DETROIT_NOTIFY_SECRET must be at least 32 chars');
 const rows=(await env.DETROIT_DB.prepare("SELECT id,job_id,owner_id,target_url,digest,created_at,attempts FROM notification_outbox WHERE status='pending' AND next_attempt<=? ORDER BY next_attempt LIMIT 12").bind(now).all()).results||[];
 const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 let delivered=0,failed=0;
 for(const row of rows){
  // Stable JSON body protects against accidental duplicate privacy exposure: never send page body or user prompts.
  const body=JSON.stringify({id:row.id,event:'public_page_changed',owner:row.owner_id,jobId:row.job_id,url:row.target_url,checkedAt:row.created_at,sha256:row.digest});
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(body)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   const response=await fetchImpl(url,{method:'POST',redirect:'manual',signal:controller.signal,headers:{'content-type':'application/json','x-detroit-signature':'sha256='+signature,'x-detroit-event':'public_page_changed','idempotency-key':String(row.id)},body});
   if(!response.ok||response.status>=300)throw Error('Webhook HTTP '+response.status);
   await env.DETROIT_DB.prepare("UPDATE notification_outbox SET status='delivered',delivered_at=?,last_error=NULL WHERE id=? AND status='pending'").bind(now,row.id).run();delivered++;
  }catch(error){
   const attempts=Number(row.attempts)+1;
   const final=attempts>=5?'dead':'pending';
   const next=now+Math.min(24*3600_000,Math.pow(2,attempts)*3600_000);
   await env.DETROIT_DB.prepare('UPDATE notification_outbox SET attempts=?,status=?,next_attempt=?,last_error=? WHERE id=?').bind(attempts,final,next,String(error instanceof Error?error.message:error).slice(0,170),row.id).run();failed++;
  }finally{clearTimeout(timer);}
 }
 return {status:'ok',delivered,failed};
}