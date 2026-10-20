/** Best-effort single-sign-on after Vanilla Google login.
 * Google Identity Services supplies a separate ID token; never reuse a Drive access token.
 * Browser privacy policies may suppress One Tap; the console retains its explicit fallback.
 */
import {driveSession} from "../workspace/cloud-drive";
import {weiGuoApiBase,weiGuoIdentity,signInWeiGuo} from "./api";
import {promptWeiGuoIdentity} from "../vault/google-auth";

let pending:Promise<void>|null=null;
export function autoSignInWeiGuo():Promise<void>{
 if(pending)return pending;
 if(!driveSession()||!weiGuoApiBase()||weiGuoIdentity())return Promise.resolve();
 pending=(async()=>{
  try{
   const credential=await promptWeiGuoIdentity();
   if(!driveSession())return;
   await signInWeiGuo(credential);
   window.dispatchEvent(new Event("vanilla-weiguo-auth-changed"));
  }catch{
   // A blocked/suppressed One Tap is not an authorization failure for Vanilla.
   window.dispatchEvent(new Event("vanilla-weiguo-auth-unavailable"));
  }
 })().finally(()=>{pending=null;});
 return pending;
}
