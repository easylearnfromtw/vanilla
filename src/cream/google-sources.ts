/** Google Analytics 4 is a read-only data source for CREAM, never its calculation engine.
 * OAuth Client Secret must NEVER be stored in this browser code or GitHub Pages.
 */
import {parseAccountSummaries,parseGA4Report,validateGA4Options,validateGoogleClientId} from "./ga4-format";
import type {GA4Property,GA4ReportOptions,GA4Report} from "./ga4-format";
export {lookerStudioLink,validateGoogleClientId,parseGA4Report,parseAccountSummaries,validateGA4Options} from "./ga4-format";
export type {GA4Property,GA4ReportOptions,GA4Report,GA4Metric,GA4Dimension} from "./ga4-format";
import {GOOGLE_CLIENT_ID} from "../vault/google-auth";

const CLIENT_KEY="vanilla.cream.google.analytics.client-id.v1";
const STUDIO_CLIENT_KEY="vanilla.cream.google.studio.client-id.v1";
const SCOPE="https://www.googleapis.com/auth/analytics.readonly";
export type GoogleApp="analytics"|"studio";
let access:{token:string;expires:number;clientId:string}|null=null;
let gisLoader:Promise<void>|undefined;
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
export async function fetchAnalyticsReport(options:GA4ReportOptions):Promise<GA4Report>{
 validateGA4Options(options);
 const body={dateRanges:[{startDate:(options.days-1)+"daysAgo",endDate:"today"}],
  dimensions:[{name:options.dimension}],metrics:[{name:options.metric}],limit:"2999"};
 const raw=await googleJSON("https://analyticsdata.googleapis.com/v1beta/properties/"+options.propertyId+":runReport","POST",body);
 return parseGA4Report(raw,options);
}
