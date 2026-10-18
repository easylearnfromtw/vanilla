import { DRIVE_SCOPE } from "./drive";
export const GOOGLE_CLIENT_ID = "816806126786-q9thti1d4ic3fhp6ador9obrqs5p8919.apps.googleusercontent.com";
type TokenResponse = {access_token?:string;expires_in?:number;error?:string;error_description?:string};
type TokenClient = {requestAccessToken:(options?:{prompt?:string})=>void};
type GIS = {accounts:{oauth2:{initTokenClient:(options:{client_id:string;scope:string;callback:(response:TokenResponse)=>void;error_callback?:(error:unknown)=>void})=>TokenClient;revoke:(token:string,callback:()=>void)=>void}}};
declare global {interface Window {google?:GIS}}
let scriptPromise:Promise<void>|undefined;
function loadGIS():Promise<void>{
  if(window.google?.accounts?.oauth2)return Promise.resolve();
  if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://accounts.google.com/gsi/client";
    script.async=true;
    script.onload=()=>window.google?.accounts?.oauth2?resolve():reject(new Error("Google Identity Services 無法初始化"));
    script.onerror=()=>reject(new Error("Google 授權元件載入失敗"));
    document.head.appendChild(script);
  }).catch(error=>{scriptPromise=undefined;throw error;});
  return scriptPromise;
}
export async function authorizeDrive():Promise<{token:string;expiresAt:number}>{
  await loadGIS();
  return new Promise((resolve,reject)=>{
    const client=window.google!.accounts.oauth2.initTokenClient({
      client_id:GOOGLE_CLIENT_ID,scope:DRIVE_SCOPE+" https://www.googleapis.com/auth/userinfo.email",
      callback:(response)=>{
        if(response.error||!response.access_token){reject(new Error(response.error_description||response.error||"Google 授權未完成"));return;}
        resolve({token:response.access_token,expiresAt:Date.now()+(response.expires_in??3600)*1000});
      },
      error_callback:()=>reject(new Error("Google 登入視窗被關閉或授權失敗"))
    });
    client.requestAccessToken({prompt:"consent"});
  });
}
export function revokeDrive(token:string):void{window.google?.accounts.oauth2.revoke(token,()=>{});}
