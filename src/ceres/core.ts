/** Original Ceres message and plugin schema. Validation does not grant execution rights. */
export const CERES_PLATFORMS=["line","telegram","discord","slack","webhook"] as const;
export type CeresPlatform=typeof CERES_PLATFORMS[number];
export type CeresEvent={platform:CeresPlatform;messageId:string;tenantId:string;senderId:string;conversationId:string;text:string;sourceTrust:"untrusted";executionAllowed:false};
export type CeresCapability="receive-text"|"reply-text"|"send-media"|"read-events";
export type CeresPlugin={id:string;label:string;description:string;capabilities:CeresCapability[];enabled:false};
type Json=Record<string,unknown>;
function object(raw:unknown):Json{if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Ceres 僅接受 JSON 物件");return raw as Json;}
function identifier(x:Json,k:string,max:number):string{const v=x[k];if(typeof v!=="string"||!v.trim()||v.length>max||/[\u0000-\u001f\u007f]/.test(v))throw Error("Ceres 無效欄位："+k);return v.trim();}
export function normalizeCeresEvent(raw:unknown):CeresEvent{
 const x=object(raw); const allowed=["platform","messageId","tenantId","senderId","conversationId","text"];
 if(Object.keys(x).some(k=>!allowed.includes(k)))throw Error("Ceres 事件含不允許欄位");
 const platform=identifier(x,"platform",24);
 if(!CERES_PLATFORMS.some(p=>p===platform))throw Error("Ceres 不支援此平台");
 if(typeof x.text!=="string"||!x.text.trim()||x.text.length>4000||x.text.includes("\u0000"))throw Error("Ceres 文字無效");
 return {platform:platform as CeresPlatform,messageId:identifier(x,"messageId",128),tenantId:identifier(x,"tenantId",128),senderId:identifier(x,"senderId",128),conversationId:identifier(x,"conversationId",128),text:x.text,sourceTrust:"untrusted",executionAllowed:false};
}
export function validateCeresPlugin(raw:unknown):CeresPlugin{
 const x=object(raw);if(Object.keys(x).some(k=>!["id","label","description","capabilities"].includes(k)))throw Error("Ceres 不允許程式碼、URL、金鑰或啟用設定");
 const id=identifier(x,"id",41),label=identifier(x,"label",60);
 if(!/^[a-z][a-z0-9-]{2,40}$/.test(id)||id.startsWith("ceres-"))throw Error("Ceres 插件 ID 無效");
 if(typeof x.description!=="string"||x.description.length>300)throw Error("Ceres 描述無效");
 const allowed=["receive-text","reply-text","send-media","read-events"];
 if(!Array.isArray(x.capabilities)||!x.capabilities.length||x.capabilities.length>4||x.capabilities.some(v=>typeof v!=="string"||!allowed.includes(v)))throw Error("Ceres 插件權限無效");
 return {id,label,description:x.description,capabilities:[...new Set(x.capabilities)] as CeresCapability[],enabled:false};
}
/** All green checks only move to manual review, never execute a plugin or remote message. */
export function ceresGate(o:{privateMode:boolean;gatewayEnabled:boolean;identityLinked:boolean;approved:boolean}):"blocked"|"requires-identity"|"requires-consent"|"manual-review"{
 if(o.privateMode||!o.gatewayEnabled)return "blocked";
 if(!o.identityLinked)return "requires-identity";
 return o.approved?"manual-review":"requires-consent";
}
