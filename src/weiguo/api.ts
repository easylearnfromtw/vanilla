/** Public-PWA WeiGuo client. No admin keys, Drive tokens or durable session storage. */
import {driveSession} from "../workspace/cloud-drive";

export type WeiGuoIdentity={member:string;role:"owner"|"member"|"viewer";email:string};
export type WeiGuoTask={id:string;status:"queued"|"running"|"completed"|"failed";result?:{title?:string;url?:string;events?:Array<{action:string;text?:string;source?:string}>}|null;error?:string|null;createdAt?:number};
type AuthResult=WeiGuoIdentity&{token:string;expiresIn:number};
let auth:({token:string;expiresAt:number}&WeiGuoIdentity)|null=null;

export function weiGuoApiBase():string|null{
 const raw=String(import.meta.env.VITE_WEIGUO_API_URL||"").trim();
 if(!raw)return null;
 try{
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/")return null;
  return url.origin;
 }catch{return null;}
}
export function clearWeiGuoSession():void{auth=null;}
if(typeof window!=="undefined")window.addEventListener("vanilla-drive-disconnected",clearWeiGuoSession);
export function weiGuoIdentity():WeiGuoIdentity|null{
 const session=driveSession();
 if(!auth||auth.expiresAt<Date.now()+3000||!session||auth.email!==session.email.trim().toLowerCase()){
  auth=null;return null;
 }
 return {member:auth.member,role:auth.role,email:auth.email};
}
async function request<T>(path:string,body?:unknown,withAuth=false):Promise<T>{
 const base=weiGuoApiBase();
 if(!base)throw Error("尚未設定受信任的衞國 HTTPS 後端");
 const identity=withAuth?weiGuoIdentity():null;
 if(withAuth&&!identity)throw Error("衞國授權已到期，請重新使用 Google 登入");
 const headers:Record<string,string>={"Content-Type":"application/json"};
 if(withAuth&&auth)headers.Authorization="Bearer "+auth.token;
 let response:Response;
 try{
  response=await fetch(base+path,{method:body===undefined?"GET":"POST",headers,body:body===undefined?undefined:JSON.stringify(body),
   cache:"no-store",credentials:"omit",mode:"cors",referrerPolicy:"no-referrer"});
 }catch{throw Error("無法連線到衞國後端，請檢查 HTTPS、CORS 和服務狀態");}
 if(response.status===401){clearWeiGuoSession();throw Error("衞國登入已過期，請重新授權");}
 if(response.status===403){clearWeiGuoSession();throw Error("這個 Google 帳號沒有對應的家庭任務權限");}
 if(!response.ok){const data=await response.json().catch(()=>({})) as {detail?:string};throw Error(typeof data.detail==="string"?data.detail:"衞國後端錯誤："+response.status);}
 return await response.json() as T;
}
export async function signInWeiGuo(googleIdentityToken:string):Promise<WeiGuoIdentity>{
 if(!driveSession())throw Error("請先在 Vanilla 登入 Google Drive");
 // ONLY an OIDC identity credential, never the Drive OAuth access token.
 const reply=await request<AuthResult>("/v1/auth/google",{credential:googleIdentityToken});
 const drive=driveSession();
 if(!drive||reply.email.trim().toLowerCase()!==drive.email.trim().toLowerCase()){
  clearWeiGuoSession();
  throw Error("衞國 Google 帳號與目前 Vanilla 帳號不同。請切換成相同帳號");
 }
 if(!reply.token||!Number.isFinite(reply.expiresIn)||reply.expiresIn<60)throw Error("無效的後端工作階段");
 auth={token:reply.token,expiresAt:Date.now()+Math.min(reply.expiresIn,900)*1000,
  member:reply.member,role:reply.role,email:reply.email.trim().toLowerCase()};
 return {member:auth.member,role:auth.role,email:auth.email};
}
export async function startWeiGuoTask(start_url:string,steps:Array<{action:"extract"|"navigate"|"scroll";url?:string;pixels?:number}>):Promise<WeiGuoTask>{
 return request<WeiGuoTask>("/v1/family/tasks",{start_url,steps},true);
}
export async function getWeiGuoTask(id:string):Promise<WeiGuoTask>{
 if(!/^[a-f0-9-]{36}$/i.test(id))throw Error("任務識別碼不正確");
 return request<WeiGuoTask>("/v1/family/tasks/"+encodeURIComponent(id),undefined,true);
}
