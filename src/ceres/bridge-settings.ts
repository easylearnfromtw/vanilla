/** Device-scoped, per-Google-identity opt-in for foreground-only Telegram replies.
 * This preference is not an authentication credential or permission grant.
 */
const PREFIX="vanilla.ceres.foreground.v1.";
const EVENT="vanilla-ceres-bridge-preference";
export const CERES_BRIDGE_PREFERENCE_EVENT=EVENT;
export function bridgePreference(email:string):boolean{
 if(!email||email.length>320)return false;
 try{return localStorage.getItem(PREFIX+email.toLowerCase())==="true";}catch{return false;}
}
export function setBridgePreference(email:string,enabled:boolean):void{
 if(!email||email.length>320)throw Error("請先登入已綁定的家庭 Google 帳號");
 try{
  if(enabled)localStorage.setItem(PREFIX+email.toLowerCase(),"true");
  else localStorage.removeItem(PREFIX+email.toLowerCase());
 }catch{throw Error("瀏覽器無法儲存 Ceres 前景橋接偏好");}
 window.dispatchEvent(new Event(EVENT));
}
