/** Pure policies shared by local email templates and the opt-in visual editor. */
export const MAX_DESIGN_BYTES=1_000_000;
export const MAX_TEMPLATE_TEXT=3_000;

export function escapeEmailHtml(value:string):string{
 return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
export function safeEmailLink(input:string):string|null{
 try{
  const value=input.trim();
  if(!value||value.length>2048)return null;
  const url=new URL(value);
  if(url.protocol!=="https:"||!url.hostname||url.username||url.password)return null;
  return url.href;
 }catch{return null;}
}
export function isEmailDesign(value:unknown):value is Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const design=value as Record<string,unknown>;
 const body=design.body;
 if(!body||typeof body!=="object"||Array.isArray(body))return false;
 const rows=(body as Record<string,unknown>).rows;
 return Array.isArray(rows)&&rows.length<=250;
}
export function scopedEmailStorageKey(account?:string|null):string{
 const identity=(account||"local-device").trim().toLowerCase();
 return "vanilla.email-studio.v1."+encodeURIComponent(identity.slice(0,180));
}
export type EmailSnapshot={
 design:Record<string,unknown>;
 html:string;
 title:string;
 updatedAt:string;
};
export function parseEmailSnapshot(input:string):EmailSnapshot{
 if(input.length>MAX_DESIGN_BYTES)throw new Error("郵件檔案超過 1 MB 上限");
 const record:unknown=JSON.parse(input);
 if(!record||typeof record!=="object"||Array.isArray(record))throw new Error("無效的郵件存檔");
 const data=record as Record<string,unknown>;
 if(!isEmailDesign(data.design)||typeof data.html!=="string"||typeof data.title!=="string")throw new Error("存檔格式不符");
 if(data.html.length>MAX_DESIGN_BYTES)throw new Error("HTML 過大");
 return {design:data.design,html:data.html,title:data.title.slice(0,200),updatedAt:typeof data.updatedAt==="string"?data.updatedAt:""};
}
