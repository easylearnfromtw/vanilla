/** Public-PWA WeiGuo client. No admin keys, Drive tokens or durable session storage. */
import {driveSession} from "../workspace/cloud-drive";
import {currentChatMode} from "../local-ai/chat-session";
import {validateOrchestraCapabilities,type OrchestraCapabilities} from "../orchestra/capability-contract";

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
 // Register the optional server-hosted model only after verified login.
 try{
  const service=await request<{ready:boolean;model:string}>("/v1/family/models/status",undefined,true);
  if(service.ready){
   const {setProvider,getConfigs}=await import("../vault/providers");
   if(!getConfigs().some(c=>c.provider==="gemini"&&c.key!=="managed:weiguo"))
    setProvider({provider:"gemini",key:"managed:weiguo",model:service.model});
  }
 }catch{/* An unconfigured optional model must not prevent authentication. */}
 return {member:auth.member,role:auth.role,email:auth.email};
}
/** Scouts public research uses the already verified family identity.
 * No Google Drive OAuth bearer, Gemini credential or API provider key is sent.
 */
export type ScoutsFamilyHit={
 title:string;url:string;snippet:string;provider:"Brave"|"Tavily";
 excerpt:string;kind:"snippet"|"full";regionSpecific:boolean;
};
export type ScoutsFamilyStatus={ready:boolean;providers:string[];regionDefault:string;note:string};
export type ScoutsFamilyReport={
 results:ScoutsFamilyHit[];providers:string[];errors:string[];region:string;complete:boolean;
};
export function canSearchViaWeiGuo():boolean{
 return currentChatMode()!=="private"&&Boolean(weiGuoIdentity())&&Boolean(weiGuoApiBase());
}
export async function getWeiGuoScoutsStatus():Promise<ScoutsFamilyStatus>{
 if(!canSearchViaWeiGuo())throw Error("衞國 Scouts 需要既有的 Google 家庭登入與已部署 HTTPS 後端");
 return request<ScoutsFamilyStatus>("/v1/family/scouts/status",undefined,true);
}
export async function searchWeiGuoScouts(query:string,region:string):Promise<ScoutsFamilyReport>{
 if(!canSearchViaWeiGuo())throw Error("私人模式或未驗證衞國登入，不會將查詢送至搜尋後端");
 if(query.trim().length<2||query.length>180||region.length>40)throw Error("搜尋主題或地區格式不正確");
 return request<ScoutsFamilyReport>("/v1/family/scouts/search",{query:query.trim(),region},true);
}

export async function startWeiGuoTask(start_url:string,steps:Array<{action:"extract"|"navigate"|"scroll";url?:string;pixels?:number}>):Promise<WeiGuoTask>{
 return request<WeiGuoTask>("/v1/family/tasks",{start_url,steps},true);
}
/** Notion requests reuse the verified in-memory family bearer; no Notion token is sent to the PWA. */
export async function notionFamilyRequest<T>(path:string,body?:unknown):Promise<T>{
 if(currentChatMode()==='private')throw Error('私人模式禁止連接外部 Notion 工作區');
 if(!/^\/v1\/family\/notion\/(?:status|tasks(?:\/[a-f0-9-]{36}\/(?:complete|reschedule))?)$/i.test(path))throw Error('不支援的 Notion 操作');
 return request<T>(path,body,true);
}

export async function getWeiGuoTask(id:string):Promise<WeiGuoTask>{
 if(!/^[a-f0-9-]{36}$/i.test(id))throw Error("任務識別碼不正確");
 return request<WeiGuoTask>("/v1/family/tasks/"+encodeURIComponent(id),undefined,true);
}

/** Backend-declared capabilities only; never executes or installs tools. */
export async function getWeiGuoOrchestraCapabilities():Promise<OrchestraCapabilities>{
 const raw=await request<unknown>("/v1/family/orchestra/capabilities",undefined,true);
 return validateOrchestraCapabilities(raw);
}

/** Optional document conversion. Sends only the explicitly approved text to the family backend. */
export async function convertWeiGuoWordCraft(title:string,body:string,format:"docx"|"pdf"):Promise<{bytes:Uint8Array;filename:string;mime:string}>{
 const identity=weiGuoIdentity();
 if(!identity||identity.role==="viewer")throw Error("請先在衞國系統以具備文件權限的家庭帳號登入");
 const base=weiGuoApiBase();
 if(!base||!auth)throw Error("尚未連線至衞國的安全後端");
 if(!title.trim()||title.length>120||!body.trim()||body.length>50000)throw Error("文件標題或內容超過 WordCraft 限制");
 const mime=format==="pdf"?"application/pdf":"application/vnd.openxmlformats-officedocument.wordprocessingml.document";
 let response:Response;
 try{
  response=await fetch(base+"/v1/family/wordcraft/convert",{
   method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+auth.token},
   body:JSON.stringify({title,body,format}),cache:"no-store",credentials:"omit",
   referrerPolicy:"no-referrer",mode:"cors"
  });
 }catch{throw Error("WordCraft 後端目前無法連線");}
 if(response.status===401||response.status===403){clearWeiGuoSession();throw Error("衞國文件授權已失效，請重新登入");}
 if(!response.ok){
  const data=await response.json().catch(()=>({})) as {detail?:string};
  throw Error(typeof data.detail==="string"?data.detail:"WordCraft 輸出失敗："+response.status);
 }
 const declared=Number(response.headers.get("Content-Length")||"0");
 if(declared>8*1024*1024)throw Error("WordCraft 檔案過大");
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length===0||bytes.length>8*1024*1024)throw Error("WordCraft 檔案大小不正確");
 if(format==="pdf"&&!new TextDecoder().decode(bytes.slice(0,5)).startsWith("%PDF-"))throw Error("WordCraft PDF 格式檢查失敗");
 if(format==="docx"&&(bytes[0]!==80||bytes[1]!==75))throw Error("WordCraft DOCX 格式檢查失敗");
 return {bytes,filename:title.replace(/[\\/:*?"<>|\x00-\x1f]/g,"_").trim().slice(0,70)+"."+format,mime};
}

/** Native PdfCraft merge on a separately admitted binary; never sends local paths. */
export async function mergeWeiGuoPdfCraft(files:readonly File[]):Promise<Uint8Array>{
 const identity=weiGuoIdentity(),base=weiGuoApiBase();
 if(!identity||identity.role==="viewer"||!auth)throw Error("請先以衞國家庭帳號登入");
 if(!base)throw Error("尚未配置衞國安全後端");
 if(files.length<2||files.length>3)throw Error("PdfCraft 一次只接受 2–3 個 PDF 檔");
 const encoded:string[]=[];
 for(const file of files){
  if(file.size<32||file.size>2*1024*1024)throw Error("單份 PDF 限 2 MB");
  const b=new Uint8Array(await file.arrayBuffer());
  const signature=new TextDecoder().decode(b.slice(0,5));
  const tail=new TextDecoder().decode(b.slice(-2048));
  if(signature!=="%PDF-"||!tail.includes("%%EOF"))throw Error("檔案不是有效 PDF 容器："+file.name);
  const parts:string[]=[];
  for(let i=0;i<b.length;i+=8192)parts.push(String.fromCharCode(...b.subarray(i,i+8192)));
  encoded.push(btoa(parts.join("")));
 }
 let response:Response;
 try{
  response=await fetch(base+"/v1/family/orchestra/pdfcraft/combine",{
   method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+auth.token},
   body:JSON.stringify({files:encoded}),cache:"no-store",credentials:"omit",
   referrerPolicy:"no-referrer",mode:"cors"
  });
 }catch{throw Error("無法連接 PdfCraft 後端");}
 if(response.status===401||response.status===403){clearWeiGuoSession();throw Error("衞國文件授權無效，請重新登入");}
 if(!response.ok){
  const error=await response.json().catch(()=>({})) as {detail?:string};
  throw Error(typeof error.detail==="string"?error.detail:"PdfCraft 合併失敗："+response.status);
 }
 const declared=Number(response.headers.get("Content-Length")||"0");
 if(declared>12*1024*1024)throw Error("PdfCraft 輸出超出限制");
 const pdf=new Uint8Array(await response.arrayBuffer());
 if(pdf.length<32||pdf.length>12*1024*1024||
    new TextDecoder().decode(pdf.slice(0,5))!=="%PDF-"||
    !new TextDecoder().decode(pdf.slice(-2048)).includes("%%EOF"))
  throw Error("PdfCraft 回傳資料不是合格 PDF");
 return pdf;
}

export type GridCraftCell={cell:string;input:string};
/** Explicitly authorized export of the current Vanilla Sheets tab only. */
export async function exportWeiGuoGridCraft(cells:GridCraftCell[]):Promise<Blob>{
 if(!cells.length||cells.length>500)throw Error("GridCraft 一次僅支援 1–500 個非空儲存格");
 const result=await request<{filename:string;xlsxBase64:string;cellCount:number;scope:string}>(
  "/v1/family/gridcraft/xlsx",{cells},true);
 if(result.scope!=="active-sheet-only"||!result.xlsxBase64||result.xlsxBase64.length>5_000_000)
  throw Error("GridCraft 後端回傳了不合法的試算表");
 const raw=atob(result.xlsxBase64);
 if(raw.length<4||raw.charCodeAt(0)!==0x50||raw.charCodeAt(1)!==0x4b)
  throw Error("GridCraft 匯出不是有效的 XLSX 容器");
 const array=new Uint8Array(new ArrayBuffer(raw.length));
 for(let i=0;i<raw.length;i++)array[i]=raw.charCodeAt(i);
 return new Blob([array.buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}

/** GridCraft builds a native report from CREAM's already-computed local results. */
export async function exportCreamGridCraftReport(payload:import("../cream/gridcraft-report").CreamGridCraftRequest):Promise<{file:Blob;chartType:string|null;pointsExported:number}>{
 const report=await request<{filename:string;xlsxBase64:string;chartType:string|null;pointsExported:number;statisticsSource:string;scope:string}>(
  "/v1/family/gridcraft/cream-report",payload,true);
 if(report.statisticsSource!=="cream-local"||report.scope!=="summary-and-chart-preview"||!Number.isInteger(report.pointsExported)
    ||report.pointsExported<1||report.pointsExported>48)
   throw Error("GridCraft 工作簿來源驗證失敗");
 if(!report.xlsxBase64||report.xlsxBase64.length>5_000_000)throw Error("GridCraft XLSX 超出大小限制");
 const decoded=atob(report.xlsxBase64);
 if(decoded.length<4||decoded.charCodeAt(0)!==0x50||decoded.charCodeAt(1)!==0x4b)
   throw Error("GridCraft 沒有產出有效的 XLSX 容器");
 const bytes=new Uint8Array(new ArrayBuffer(decoded.length));
 for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
 return {file:new Blob([bytes.buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),chartType:report.chartType,pointsExported:report.pointsExported};
}


/** Detroit Factory: Judge0 results are returned only after a real backend execution. */
export type MedusaStatus={enabled:boolean;connected:boolean;language?:string;backend?:"judge0"|"cloudrun-sandbox"|"medusa-lite";note:string};
export type MedusaOutput={
 engine:"medusa";backend:"judge0"|"cloudrun-sandbox"|"medusa-lite";language:string;finished:boolean;accepted:boolean;
 status_id:number;status:string;stdout:string;stderr:string;compile_output:string;
 exit_code:number|null;time:string;memory:number|null;
};
export async function getMedusaStatus():Promise<MedusaStatus>{
 const person=weiGuoIdentity();
 if(!person||person.role!=="owner")throw Error("Medusa 需要家庭管理者身分");
 if(currentChatMode()==="private")throw Error("私人模式不連線 Medusa 執行環境");
 return request<MedusaStatus>("/v1/family/medusa/status",undefined,true);
}
export async function runMedusa(source_code:string,stdin:string,approved:boolean):Promise<MedusaOutput>{
 const person=weiGuoIdentity();
 if(!person||person.role!=="owner")throw Error("Medusa 僅允許已核准的家庭管理者");
 if(currentChatMode()==="private")throw Error("私人模式禁止傳送程式碼到 Medusa");
 if(!approved)throw Error("本次 Medusa 程式執行必須先同意傳送程式碼");
 const encoder=new TextEncoder();
 if(!source_code.trim()||source_code.includes("\\0")||stdin.includes("\\0")||
    source_code.length>16000||encoder.encode(source_code).length>16000||
    stdin.length>2048||encoder.encode(stdin).length>2048)
  throw Error("Medusa 程式碼或標準輸入超過限制");
 return request<MedusaOutput>("/v1/family/medusa/run",{source_code,stdin,approved:true},true);
}

// Quirinus: only the server holds the narrowly scoped GitHub Actions secret.
export type QuirinusFamilyStatus={enabled:boolean;note:string;scope?:string;runner?:string;workflow?:string;autoPatch?:boolean};
export type QuirinusFamilyPlan={status:"awaiting-explicit-approval";approvalToken:string;expiresIn:number;repo:string;ref:"main";scope:string;execution:string;networkScanning:false;exploitation:false;autoPatch:false};
export type QuirinusFamilyRun={status:string;requestId:string;conclusion:string|null;url:string|null;runId:number|null;note?:string};
export async function getQuirinusFamilyStatus():Promise<QuirinusFamilyStatus>{
 const owner=weiGuoIdentity();
 if(!owner||owner.role!=="owner"||currentChatMode()==="private")throw Error("Quirinus 需要非私密模式及家庭管理者登入");
 return request<QuirinusFamilyStatus>("/v1/family/quirinus/status",undefined,true);
}
export async function prepareQuirinusFamilyScan():Promise<QuirinusFamilyPlan>{
 const owner=weiGuoIdentity();
 if(!owner||owner.role!=="owner"||currentChatMode()==="private")throw Error("只有家庭管理者可以提出 Quirinus 遠端派工");
 return request<QuirinusFamilyPlan>("/v1/family/quirinus/prepare",{},true);
}
export async function executeQuirinusFamilyScan(approval_token:string,approved:boolean):Promise<QuirinusFamilyRun>{
 const owner=weiGuoIdentity();
 if(!owner||owner.role!=="owner"||currentChatMode()==="private"||!approved||!/^[-A-Za-z0-9_]{32,128}$/.test(approval_token))
  throw Error("Quirinus 缺少安全的使用者核准");
 return request<QuirinusFamilyRun>("/v1/family/quirinus/execute",{approval_token,approved:true},true);
}
export async function getQuirinusFamilyRun(requestId:string):Promise<QuirinusFamilyRun>{
 const owner=weiGuoIdentity();
 if(!owner||owner.role!=="owner"||currentChatMode()==="private"||!/^[a-f0-9]{24}$/.test(requestId))
  throw Error("Quirinus 沒有可查詢的合法任務");
 return request<QuirinusFamilyRun>("/v1/family/quirinus/runs/"+encodeURIComponent(requestId),undefined,true);
}

// LUCA owner-only monitoring snapshot from WeiGuo backend.
export type LucaSnapshot={
 enabled:boolean;scope:"backend-only";count:number;failures:number;
 averageMs:number;p95Ms:number;persistent:boolean;
 components:Array<{name:string;count:number;failures:number;averageMs:number}>;
 daily:Array<{day:string;count:number;failures:number;averageMs:number}>;
 recommendations:string[];
 events:Array<{at:string;component:string;operation:string;status:number;durationMs:number}>;
};
export async function getWeiGuoLucaSummary():Promise<LucaSnapshot>{
 const identity=weiGuoIdentity();
 if(!identity||identity.role!=="owner")throw Error("LUCA 總覽僅供已登入的家庭擁有者使用");
 return request<LucaSnapshot>("/v1/family/luca/summary",undefined,true);
}

/** Ceres never exposes operator keys or Telegram bot credentials to the PWA. */
export type CeresFamilyStatus={
 enabled:boolean;linked:boolean;outboundEnabled:boolean;draftEnabled:boolean;
 automaticDispatch:false;automaticReplies:boolean;
};
export type CeresFamilyEvent={
 id:number;text:string;created_at:number;reviewed_at:number|null;
 reply_status:string|null;
};
function ceresGuard():void{
 if(currentChatMode()==="private")throw Error("私密模式禁止 Ceres 外部通訊");
 const person=weiGuoIdentity();
 if(!person||person.role==="viewer")throw Error("請先以衞國家庭帳號登入 Ceres");
}
export async function getWeiGuoCeresStatus():Promise<CeresFamilyStatus>{
 ceresGuard();
 return request<CeresFamilyStatus>("/v1/family/ceres/status",undefined,true);
}
export async function getWeiGuoCeresEvents():Promise<{events:CeresFamilyEvent[];untrustedContent:true}>{
 ceresGuard();
 return request<{events:CeresFamilyEvent[];untrustedContent:true}>("/v1/family/ceres/events",undefined,true);
}
export async function draftWeiGuoCeresReply(id:number,approved:boolean):Promise<{draft:string;needsApproval:true;sent:false}>{
 ceresGuard();
 if(!Number.isSafeInteger(id)||id<=0||!approved)throw Error("必須選擇訊息並同意本次本地 AI 草稿");
 return request<{draft:string;needsApproval:true;sent:false}>(
  "/v1/family/ceres/events/"+id+"/draft",{approved:true},true);
}
export async function sendWeiGuoCeresReply(id:number,text:string,approved:boolean):Promise<{sent:true;eventId:number}>{
 ceresGuard();
 if(!Number.isSafeInteger(id)||id<=0||!approved||typeof text!=="string"||
    !text.trim()||text.length>3000||text.includes("\0"))
  throw Error("必須確認本次 Telegram 訊息且文字不得超過 3000 字");
 return request<{sent:true;eventId:number}>(
  "/v1/family/ceres/events/"+id+"/reply",{approved:true,text:text.trim()},true);
}

/** Ceres second Detroit entrypoint: verified family-linked foreground bridge. */
export type CeresBridgeStatus={
 enabled:boolean;linked:boolean;runtime:"foreground-pwa-only";
 alwaysOn:false;tools:string[];automaticRepliesWhenConnected:boolean;privilegedExecution:false
};
export type CeresBridgeJob={eventId:number;text:string;createdAt:number;lease:string};
export async function getCeresBridgeStatus():Promise<CeresBridgeStatus>{
 ceresGuard();
 return request<CeresBridgeStatus>("/v1/family/ceres/bridge/status",undefined,true);
}
export async function claimCeresBridgeJob():Promise<{job:CeresBridgeJob|null;rateLimited:boolean}>{
 ceresGuard();
 return request<{job:CeresBridgeJob|null;rateLimited:boolean}>(
  "/v1/family/ceres/bridge/claim",{},true);
}
export async function completeCeresBridgeJob(job:CeresBridgeJob,text:string,tool:string):Promise<{sent:true;automatic:true}>{
 ceresGuard();
 if(!Number.isSafeInteger(job.eventId)||job.eventId<=0||!job.lease||
   !text.trim()||text.length>1200||!["merlin","diana","cream","scouts","erya","none"].includes(tool))
  throw Error("Ceres 前景橋接回覆的內容或工具不符合允許範圍");
 return request<{sent:true;automatic:true}>(
  "/v1/family/ceres/bridge/events/"+job.eventId+"/complete",
  {lease:job.lease,text,tool},true);
}
export async function skipCeresBridgeJob(job:CeresBridgeJob):Promise<{skipped:true;sent:false}>{
 ceresGuard();
 if(!Number.isSafeInteger(job.eventId)||job.eventId<=0||!job.lease)throw Error("無效的 Ceres 工作");
 return request<{skipped:true;sent:false}>(
  "/v1/family/ceres/bridge/events/"+job.eventId+"/skip",{lease:job.lease},true);
}

/** Canva Developer API preview bridge. No Canva OAuth credential is ever held in the PWA. */
export type CanvaKind="image"|"presentation";
export type CanvaStatus={configured:boolean;enabled:boolean;preview:true;authMode:string;availableKinds:CanvaKind[]};
export type CanvaJob={kind:CanvaKind;id:string;status:"in_progress"|"success"|"failed";url?:string;title?:string;pages?:number|null;error?:string};
export async function getWeiGuoCanvaStatus():Promise<CanvaStatus>{
 if(weiGuoIdentity()?.role!=="owner")throw Error("Canva 需要已驗證的衞國家庭擁有者身分");
 return request<CanvaStatus>("/v1/family/canva/status",undefined,true);
}
export async function startWeiGuoCanvaGeneration(input:{
 kind:CanvaKind;prompt:string;aspect_ratio:"square"|"landscape"|"portrait";
 approved_cloud_send:boolean;
}):Promise<CanvaJob>{
 if(currentChatMode()==="private")throw Error("私人模式不傳送任何內容至 Canva");
 if(weiGuoIdentity()?.role!=="owner")throw Error("請以衞國家庭擁有者身分登入");
 if(!input.approved_cloud_send)throw Error("請先勾選本次 Canva 雲端傳送同意");
 if(input.prompt.trim().length<3||input.prompt.length>5000)throw Error("Canva 提示詞須介於 3–5000 字");
 return request<CanvaJob>("/v1/family/canva/generate",input,true);
}
export async function getWeiGuoCanvaJob(kind:CanvaKind,id:string):Promise<CanvaJob>{
 if(currentChatMode()==="private")throw Error("私人模式不連線至 Canva");
 if(weiGuoIdentity()?.role!=="owner")throw Error("請以衞國家庭擁有者身分登入");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error("Canva 任務識別碼無效");
 return request<CanvaJob>("/v1/family/canva/jobs/"+kind+"/"+encodeURIComponent(id),undefined,true);
}

/** Private Ceres server-model diagnostic: no secrets or message bodies. */
export type CeresServerAgentStatus={
 enabled:boolean;modelConfigured:boolean;serverReady:boolean;
 runtime:"railway-server";foregroundPhoneRequired:false;
 states:Record<string,number>;latestState:string|null;
 tools:string[];privilegedExecution:false;
};
export async function getCeresServerAgentStatus():Promise<CeresServerAgentStatus>{
 ceresGuard();
 return request<CeresServerAgentStatus>("/v1/family/ceres/agent/status",undefined,true);
}

/** Ceres-managed Gemini; the browser never receives its provider credential. */
export async function generateWeiGuoGemini(turns:Array<{role:"user"|"assistant";content:string}>):Promise<string>{
 if(currentChatMode()==="private")throw Error("私密模式不允許傳送至雲端模型");
 const response=await request<{text:string;model:string}>("/v1/family/models/chat",{
  turns:turns.slice(-12).map(t=>({role:t.role,content:t.content.slice(0,5000)})),approved_cloud_send:true
 },true);
 if(!response.text.trim())throw Error("Gemini 後端沒有回傳文字");
 return response.text;
}
