/** Venus × Janus: deterministic offline design guidance, not a delivery guarantee. */
import {safeEmailLink} from "../email/email-policy.ts";
export type VenusEmailThemeId="editorial"|"warm"|"minimal";
export type VenusEmailKind="invitation"|"newsletter"|"announcement";
export type VenusEmailFields={brand:string;title:string;message:string;buttonText:string;buttonUrl:string;preheader?:string};
export type VenusEmailTheme={id:VenusEmailThemeId;label:string;description:string;page:string;surface:string;accent:string;heading:string;body:string;muted:string;buttonText:string;titleSize:string;padding:string};
export const VENUS_EMAIL_THEMES:Readonly<Record<VenusEmailThemeId,VenusEmailTheme>>={
 editorial:{id:"editorial",label:"編輯設計",description:"深藍標題、清楚層次",page:"#F1F3F7",surface:"#FFFFFF",accent:"#1C3973",heading:"#172338",body:"#2E3541",muted:"#505E72",buttonText:"#FFFFFF",titleSize:"30px",padding:"36px"},
 warm:{id:"warm",label:"溫暖邀請",description:"柔和暖底、深棕重點",page:"#F6EFE9",surface:"#FFFDFB",accent:"#833B25",heading:"#38291F",body:"#483B32",muted:"#6B584C",buttonText:"#FFFFFF",titleSize:"28px",padding:"32px"},
 minimal:{id:"minimal",label:"極簡商務",description:"高對比、簡潔留白",page:"#F3F3F1",surface:"#FFFFFF",accent:"#252525",heading:"#151515",body:"#343434",muted:"#555555",buttonText:"#FFFFFF",titleSize:"28px",padding:"34px"}
};
export const venusEmailTheme=(id:VenusEmailThemeId):VenusEmailTheme=>VENUS_EMAIL_THEMES[id]||VENUS_EMAIL_THEMES.editorial;
export const recommendedVenusTheme=(kind:VenusEmailKind):VenusEmailThemeId=>kind==="invitation"?"warm":kind==="newsletter"?"editorial":"minimal";
export type VenusEmailFinding={code:string;level:"improve"|"caution";message:string};
export function venusAuditEmail(fields:VenusEmailFields):VenusEmailFinding[]{
 const checks:VenusEmailFinding[]=[];
 const brand=fields.brand.trim(),title=fields.title.trim(),message=fields.message.trim(),preview=(fields.preheader||"").trim();
 const link=fields.buttonUrl.trim(),cta=fields.buttonText.trim();
 if(!brand)checks.push({code:"brand",level:"improve",message:"建議補上品牌名稱，讓讀者辨識寄件主體。"});
 if(!title)checks.push({code:"title",level:"caution",message:"請填寫清楚的郵件標題。"});
 else if(title.length>70)checks.push({code:"title-long",level:"improve",message:"標題超過 70 字，部分信箱可能截斷。"});
 if(message.length<35)checks.push({code:"body-short",level:"improve",message:"內文偏短，可補充背景、活動資訊或明確下一步。"});
 if(message.length>2400)checks.push({code:"body-long",level:"improve",message:"內文較長，建議拆成短段落以提升手機閱讀性。"});
 if(preview.length>110)checks.push({code:"preheader",level:"improve",message:"收件匣預覽摘要建議控制在約 110 字內。"});
 if(link&&!safeEmailLink(link))checks.push({code:"unsafe-link",level:"caution",message:"行動按鈕只能使用不含帳密的 HTTPS 連結。"});
 if(link&&!cta)checks.push({code:"cta-text",level:"caution",message:"已填按鈕連結，請補上清楚的按鈕文字。"});
 if(cta&&!link)checks.push({code:"cta-link",level:"improve",message:"按鈕沒有連結，因此不會顯示在郵件中。"});
 return checks;
}
function luminance(hex:string):number{
 const v=[1,3,5].map(i=>{const n=parseInt(hex.slice(i,i+2),16)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});
 return .2126*v[0]+.7152*v[1]+.0722*v[2];
}
export function venusContrastRatio(a:string,b:string):number{
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
