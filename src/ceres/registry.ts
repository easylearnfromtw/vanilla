/** First-party Ceres metadata registry; NEVER a remote-code plugin installer. */
export type CeresChannel="telegram"|"line"|"discord";
export type CeresManifest={
 id:string;label:string;channel:CeresChannel;
 permissions:("receive"|"review")[];enabled:false;
};
export const CERES_CHANNELS=[
 {id:"telegram",label:"Telegram",status:"adapter",description:"Signed webhook + private-chat allowlist; operator inbox only"},
 {id:"line",label:"LINE",status:"planned",description:"Future adapter requires LINE webhook signature and verified account mapping"},
 {id:"discord",label:"Discord",status:"planned",description:"Future adapter requires Discord interaction verification and opt-in scopes"}
] as const;
const ID=/^[a-z][a-z0-9-]{2,40}$/;
const KEYS=new Set(["id","label","channel","permissions","enabled"]);
export function validateCeresManifest(input:unknown):CeresManifest{
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Ceres metadata must be an object");
 const x=input as Record<string,unknown>;
 if(Object.keys(x).some(k=>!KEYS.has(k)))throw Error("Ceres rejects code, URLs, secrets and unknown fields");
 if(typeof x.id!=="string"||!ID.test(x.id)||x.id==="ceres"||x.id.startsWith("ceres-"))throw Error("Invalid or reserved adapter ID");
 if(typeof x.label!=="string"||!x.label.trim()||x.label.length>60)throw Error("Invalid adapter label");
 if(!["telegram","line","discord"].includes(String(x.channel)))throw Error("Unsupported channel");
 if(!Array.isArray(x.permissions)||x.permissions.length>2||x.permissions.some(p=>p!=="receive"&&p!=="review"))throw Error("Permissions are restricted");
 if(x.enabled!==false)throw Error("Unreviewed adapters must remain disabled");
 return {id:x.id,label:x.label.trim(),channel:x.channel as CeresChannel,
  permissions:[...new Set(x.permissions)] as CeresManifest["permissions"],enabled:false};
}
