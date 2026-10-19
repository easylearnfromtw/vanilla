/** Google Analytics 4 is a read-only data source for CREAM, never its calculation engine.
 * OAuth Client Secret must NEVER be stored in this browser code or GitHub Pages.
 */
import {fromCreamRows,type CreamDataset} from "./core";
import {GOOGLE_CLIENT_ID} from "../vault/google-auth";

const CLIENT_KEY="vanilla.cream.google.analytics.client-id.v1";
const STUDIO_CLIENT_KEY="vanilla.cream.google.studio.client-id.v1";
const SCOPE="https://www.googleapis.com/auth/analytics.readonly";
const CLIENT=/^\d{8,21}-[a-z0-9-]+\.apps\.googleusercontent\.com$/i;
export type GoogleApp="analytics"|"studio";
export type GA4Property={id:string;name:string;accountId:string;accountName:string};
export type GA4Metric="activeUsers"|"sessions"|"eventCount"|"totalUsers"|"screenPageViews";
export type GA4Dimension="date"|"sessionDefaultChannelGroup"|"country"|"eventName";
export type GA4ReportOptions={propertyId:string;dimension:GA4Dimension;metric:GA4Metric;days:7|28|90};
export type GA4Report={dataset:CreamDataset;propertyId:string;query:GA4ReportOptions;rowCount:number;sourceUrl:string};
let access:{token:string;expires:number;clientId:string}|null=null;
let gisLoader:Promise<void>|undefined;
export function validateGoogleClientId(input:string):string{
 const id=input.trim();
 if(!CLIENT.test(id))throw Error("請填入完整的 Google OAuth Client ID（…apps.googleusercontent.com），不要填寫 GOCSPX- 開頭的 Client Secret。");
 return id;
}
export function getGoogleClientId(app:GoogleApp):string{
 try{return localStorage.getItem(app==="analytics"?CLIENT_KEY:STUDIO_CLIENT_KEY)||"";}catch{return "";}
}
export function setGoogleClientId(app:GoogleApp,input:string):void{
 const id=input.trim()?validateGoogleClientId(input):"";
 const key=app==="analytics"?CLIENT_KEY:STUDIO_CLIENT_KEY;
 try{if(id)localStorage.setItem(key,id);else localStorage.removeItem(key);}catch{throw Error("瀏覽器無法儲存設定");}
 if(app==="analytics")access=null;
}
export function getAnalyticsConnection():boolean{return !!access&&Date.now()<access.expires-60000;}
export function disconnectAnalytics():void{access=null;}
async function loadGIS(){
 if(typeof window==="undefined")throw Error("Google 授權需在瀏覽器執行");
 if(window.google?.accounts.oauth2)return;
 if(!gisLoader)gisLoader=new Promise<void>((resolve,reject)=>{
  const el=document.createElement("script");
  el.src="https://accounts.google.com/gsi/client";el.async=true;
  el.onload=()=>window.google?.accounts.oauth2?resolve():reject(Error("Google 授權模組未就緒"));
  el.onerror=()=>reject(Error("Google 授權模組載入失敗"));
  document.head.appendChild(el);
 }).catch(error=>{gisLoader=undefined;throw error;});
 return gisLoader;
}
export async function connectAnalytics():Promise<void>{
 const clientId=validateGoogleClientId(getGoogleClientId("analytics")||GOOGLE_CLIENT_ID);
 await loadGIS();
 return new Promise((resolve,reject)=>{
  window.google!.accounts.oauth2.initTokenClient({
   client_id:clientId,scope:SCOPE,
   callback:(res)=>{
    if(res.error||!res.access_token){reject(Error(res.error_description||res.error||"授權失敗"));return;}
    access={token:res.access_token,expires:Date.now()+(res.expires_in||3600)*1000,clientId};
    resolve();
   },
   error_callback:()=>reject(Error("授權視窗遭關閉，或帳號沒有授權 Analytics"))
  }).requestAccessToken({prompt:"consent"});
 });
}
function token():string{
 if(!access||Date.now()>=access.expires-60000)throw Error("Google Analytics 唯讀授權已過期，請重新連接");
 return access.token;
}
async function googleJSON(url:string,method:"GET"|"POST"="GET",body?:unknown):Promise<unknown>{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(url,{method,mode:"cors",credentials:"omit",signal:controller.signal,
   headers:{Authorization:"Bearer "+token(),Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok){
   let message="HTTP "+response.status;
   try{const err=await response.json() as {error?:{message?:string}};if(err.error?.message)message+="："+err.error.message.slice(0,250);}catch{}
   throw Error("Google Analytics API："+message+"。請檢查 API 是否啟用、GA4 帳戶權限和 OAuth 同意設定。");
  }
  return response.json() as Promise<unknown>;
 }finally{clearTimeout(timeout);}
}
export function parseAccountSummaries(raw:unknown):GA4Property[]{
 const data=raw as {accountSummaries?:Array<{account?:unknown;displayName?:unknown;propertySummaries?:Array<{property?:unknown;displayName?:unknown}>}>};
 const properties:GA4Property[]=[];
 for(const account of (Array.isArray(data?.accountSummaries)?data.accountSummaries:[])){
  const accountId=String(account.account||"").replace(/^accounts\//,"");
  if(!/^\d+$/.test(accountId))continue;
  for(const p of Array.isArray(account.propertySummaries)?account.propertySummaries:[]){
   const id=String(p.property||"").replace(/^properties\//,"");
   if(!/^\d+$/.test(id))continue;
   properties.push({id,name:String(p.displayName||"GA4 "+id).slice(0,130),accountId,accountName:String(account.displayName||"").slice(0,120)});
  }
 }
 return properties;
}
export async function listAnalyticsProperties():Promise<GA4Property[]>{
 const results:GA4Property[]=[];let next="";
 for(let i=0;i<5;i++){
  const url="https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200"+(next?"&pageToken="+encodeURIComponent(next):"");
  const response=await googleJSON(url) as {accountSummaries?:unknown;nextPageToken?:string};
  results.push(...parseAccountSummaries(response));
  next=typeof response.nextPageToken==="string"?response.nextPageToken:"";
  if(!next)break;
 }
 return results;
}
export function validateGA4Options(options:GA4ReportOptions):GA4ReportOptions{
 if(!/^\d{1,20}$/.test(options.propertyId)||!["date","sessionDefaultChannelGroup","country","eventName"].includes(options.dimension)||
 !["activeUsers","sessions","eventCount","totalUsers","screenPageViews"].includes(options.metric)||
 ![7,28,90].includes(options.days))throw Error("不支援的 GA4 Property ID、維度、指標或日期範圍");
 return options;
}
export function parseGA4Report(raw:unknown,options:GA4ReportOptions):GA4Report{
 validateGA4Options(options);
 const data=raw as {rows?:Array<{dimensionValues?:Array<{value?:unknown}>;metricValues?:Array<{value?:unknown}>}>;rowCount?:number};
 const rows:unknown[][]=[[options.dimension,options.metric]];
 const input=Array.isArray(data?.rows)?data.rows:[];
 for(const item of input.slice(0,2999)){
  let label=String(item.dimensionValues?.[0]?.value??"").trim().slice(0,120);
  const metric=String(item.metricValues?.[0]?.value??"").trim();
  if(options.dimension==="date"&&/^\d{8}$/.test(label))label=label.slice(0,4)+"-"+label.slice(4,6)+"-"+label.slice(6);
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(metric))continue;
  rows.push([label,metric]);
 }
 if(rows.length<2)throw Error("這個 GA4 資源沒有可供 CREAM 分析的數值資料；請換日期或指標");
 const propertyId=options.propertyId;
 return {dataset:fromCreamRows(rows,"GA4 Property "+propertyId+" · "+options.metric+" / "+options.days+" 日"),
  propertyId,query:{...options},rowCount:Number(data.rowCount)||rows.length-1,
  sourceUrl:"https://analytics.google.com/analytics/web/#/p"+propertyId};
}
export async function fetchAnalyticsReport(options:GA4ReportOptions):Promise<GA4Report>{
 validateGA4Options(options);
 const body={dateRanges:[{startDate:(options.days-1)+"daysAgo",endDate:"today"}],
  dimensions:[{name:options.dimension}],metrics:[{name:options.metric}],limit:"2999"};
 const raw=await googleJSON("https://analyticsdata.googleapis.com/v1beta/properties/"+options.propertyId+":runReport","POST",body);
 return parseGA4Report(raw,options);
}
/** Official Looker Studio Linking API: user owns and confirms the new report in Google UI.
 * No Looker Studio OAuth secret is needed to open this URL.
 */
export function lookerStudioLink(property:GA4Property):string{
 if(!/^\d+$/.test(property.id)||!/^\d+$/.test(property.accountId))throw Error("GA4 帳戶與資源 ID 格式錯誤");
 const u=new URL("https://lookerstudio.google.com/reporting/create");
 u.searchParams.set("r.reportName","CREAM · GA4 · "+property.name.slice(0,50));
 u.searchParams.set("ds.ds0.connector","googleAnalytics");
 u.searchParams.set("ds.ds0.accountId",property.accountId);
 u.searchParams.set("ds.ds0.propertyId",property.id);
 u.searchParams.set("ds.ds0.refreshFields","true");
 return u.toString();
}
