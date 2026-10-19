import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {VENUS_EMAIL_THEMES,venusEmailTheme,recommendedVenusTheme,venusAuditEmail,venusContrastRatio} from "../src/venus/email-design.ts";
const fields={brand:"Vanilla",title:"本週電子報與活動資訊",message:"歡迎參加本週活動，我們整理了最新活動日程及報名資訊，歡迎仔細閱讀後參加。",buttonText:"立即報名",buttonUrl:"https://example.com/register",preheader:"活動預告"};
test("Venus defines three deterministic email themes with readable contrast",()=>{
 assert.equal(Object.keys(VENUS_EMAIL_THEMES).length,3);
 assert.equal(recommendedVenusTheme("invitation"),"warm");
 assert.equal(recommendedVenusTheme("newsletter"),"editorial");
 assert.equal(recommendedVenusTheme("announcement"),"minimal");
 assert.equal(venusEmailTheme("minimal").label,"極簡商務");
 for(const theme of Object.values(VENUS_EMAIL_THEMES)){
  assert.ok(venusContrastRatio(theme.body,theme.surface)>=4.5,theme.id+" body");
  assert.ok(venusContrastRatio(theme.buttonText,theme.accent)>=4.5,theme.id+" CTA");
 }
});
test("Venus checks email copy and CTA without network calls",()=>{
 assert.deepEqual(venusAuditEmail(fields),[]);
 assert.ok(venusAuditEmail({...fields,buttonUrl:"javascript:alert(1)"}).some(x=>x.code==="unsafe-link"));
 assert.ok(venusAuditEmail({...fields,buttonText:""}).some(x=>x.code==="cta-text"));
 assert.ok(venusAuditEmail({...fields,title:""}).some(x=>x.code==="title"));
 assert.ok(venusAuditEmail({...fields,message:"你好"}).some(x=>x.code==="body-short"));
});
test("Venus rendering is integrated while preserving Janus opt-in editor",()=>{
 const ui=readFileSync(new URL("../src/email/EmailStudio.tsx",import.meta.url),"utf8");
 const renderer=readFileSync(new URL("../src/email/email-templates.tsx",import.meta.url),"utf8");
 assert.match(ui,/VENUS · 視覺呈現/);
 assert.match(ui,/venusAuditEmail\(fields\)/);
 assert.match(ui,/previewSize==="phone"/);
 assert.match(ui,/buildEmailTemplate\(kind,fields,venusTheme\)/);
 assert.match(ui,/janusPermission\("hosted-editor"/);
 assert.match(renderer,/venusEmailTheme\(visual\)/);
 assert.match(renderer,/renderToJson\(tree\)/);
 assert.match(renderer,/renderToHtml\(tree\)/);
 assert.doesNotMatch(ui,/sendEmail\(|gmail\.send|fetch\(/);
});
