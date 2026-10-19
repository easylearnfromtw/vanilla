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


/** Medusa / Judge0: explicitly approved remote sandbox execution (never local eval). */
export type MedusaLanguage="python"|"javascript"|"cpp";
export type MedusaResult={
 engine:"medusa-judge0";language:MedusaLanguage;success:boolean;
 status:{id:number;description:string};stdout:string;stderr:string;
 compile_output:string;message:string;time:string;memory:string;network:string;
};
export async function runWeiGuoMedusaCode(
 language:MedusaLanguage,source_code:string,stdin:string,approved:boolean
):Promise<MedusaResult>{
 const user=weiGuoIdentity();
 if(!user||user.role==="viewer")throw Error("Medusa 需要先登入有執行權限的衞國家庭帳號");
 if(!approved)throw Error("執行前必須明確同意將程式碼送至隔離後端");
 if(!["python","javascript","cpp"].includes(language)||!source_code.trim()
    ||source_code.length>12000||stdin.length>2000)
  throw Error("Medusa 程式語言或內容長度不正確");
 return request<MedusaResult>("/v1/family/medusa/execute",
  {language,source_code,stdin,approved:true},true);
}
