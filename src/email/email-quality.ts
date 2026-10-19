/** Venus output audit: bounded, non-executing, heuristic checks of the actual HTML.
 * This is NOT HTML sanitization, antivirus, or a guarantee of inbox/client compatibility.
 */
import {escapeEmailHtml,safeEmailLink,MAX_DESIGN_BYTES} from "./email-policy.ts";

const START="<!-- JANUS-VENUS-PREHEADER -->";
const END="<!-- /JANUS-VENUS-PREHEADER -->";
export function applyInboxPreheader(html:string,value:string):string{
 const prior=/<!-- JANUS-VENUS-PREHEADER -->[\s\S]*?<!-- \/JANUS-VENUS-PREHEADER -->/g;
 const clean=html.replace(prior,"");
 const summary=value.trim().replace(/\s+/g," ").slice(0,110);
 if(!summary)return clean;
 const node=START+'<div class="janus-venus-preheader" style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;" aria-hidden="true">'+escapeEmailHtml(summary)+'</div>'+END;
 return /<body\b[^>]*>/i.test(clean)?clean.replace(/<body\b[^>]*>/i,match=>match+node):node+clean;
}
export type VenusHtmlFinding={code:string;level:"caution"|"improve";message:string};
export type VenusHtmlAudit={status:"checked"|"unavailable";findings:VenusHtmlFinding[]};
export function auditRenderedEmail(html:string):VenusHtmlAudit{
 if(!html.trim())return {status:"unavailable",findings:[]};
 const findings:VenusHtmlFinding[]=[];
 const add=(code:string,level:VenusHtmlFinding["level"],message:string)=>findings.push({code,level,message});
 if(html.length>MAX_DESIGN_BYTES)add("html-size","caution","HTML 超過 1 MB，可能不適合直接匯出或使用。");
 if(/<script\b|<iframe\b|<object\b|<embed\b|<form\b/i.test(html))
  add("active-content","caution","HTML 含腳本、嵌入內容或表單；郵件客戶端通常不支援，也應避免不可信內容。");
 if(/(?:\bon\w+\s*=|javascript\s*:|data\s*:\s*text\/html)/i.test(html))
  add("active-attribute","caution","HTML 可能包含事件處理或可執行連結；請勿直接信任此內容。");
 const anchors=html.match(/<a\b[^>]*>/gi)||[];
 let unsafe=0;
 for(const tag of anchors){
  const matched=tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if(!matched){unsafe++;continue;}
  const link=(matched[1]||matched[2]||matched[3]||"").replace(/&amp;/gi,"&").trim();
  if(!safeEmailLink(link)&&!/^mailto:[^<>"\s]+$/i.test(link))unsafe++;
 }
 if(unsafe)add("link-policy","caution",unsafe+" 個連結不是合規 HTTPS／mailto 連結或缺少目標。");
 const images=html.match(/<img\b[^>]*>/gi)||[];
 const missing=images.filter(tag=>!/\balt\s*=\s*(?:"[^"]*"|'[^']*')/i.test(tag));
 if(missing.length)add("missing-alt","improve",missing.length+" 張圖片缺少 alt 描述（裝飾圖片可使用空 alt）。");
 if(images.some(tag=>/\bsrc\s*=\s*(?:"https?:\/\/|'https?:\/\/)/i.test(tag)))
  add("remote-images","improve","郵件引用外部圖片；收件人可能封鎖載入，也可能揭露開信網路資訊。");
 if(!/<(?:table|div|p|h[1-6])\b/i.test(html))add("structure","improve","未識別可讀的郵件內容結構，請先檢視預覽。");
 if(/<html\b/i.test(html)&&!/<html\b[^>]*\blang\s*=/i.test(html))
  add("document-lang","improve","HTML 未標示語言，建議設定 lang 以輔助閱讀工具辨識。");
 return {status:"checked",findings};
}
