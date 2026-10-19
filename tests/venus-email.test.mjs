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

test("Venus preheader is escaped, hidden and does not duplicate on editor export",async()=>{
 const {applyInboxPreheader,auditRenderedEmail}=await import("../src/email/email-quality.ts");
 const html='<html><body><table><tr><td>Newsletter</td></tr></table></body></html>';
 const output=applyInboxPreheader(html,'新品 <script>alert("X")</script>');
 assert.match(output,/JANUS-VENUS-PREHEADER/);
 assert.match(output,/display:none!important/);
 assert.match(output,/&lt;script&gt;/);
 assert.doesNotMatch(output,/<script>alert/);
 const twice=applyInboxPreheader(output,"更新摘要");
 assert.equal((twice.match(/<!-- JANUS-VENUS-PREHEADER -->/g)||[]).length,1);
 assert.match(twice,/更新摘要/);
 assert.doesNotMatch(twice,/新品/);
 assert.equal(auditRenderedEmail(html).status,"checked");
 assert.equal(auditRenderedEmail("").status,"unavailable");
});
test("Venus checks HTML after external visual editing, including missing image alt and bad links",async()=>{
 const {auditRenderedEmail}=await import("../src/email/email-quality.ts");
 const bad='<html><body><img src="https://example.com/tracking.png"><a href="javascript:alert(1)">click</a><script>alert(1)</script></body></html>';
 const audit=auditRenderedEmail(bad);
 const codes=audit.findings.map(f=>f.code);
 for(const code of ["active-content","active-attribute","link-policy","missing-alt","remote-images"])assert.ok(codes.includes(code),code);
 const okay=auditRenderedEmail('<html lang="zh-Hant"><body><p>資訊</p><a href="https://example.com">閱讀</a></body></html>');
 assert.deepEqual(okay.findings,[]);
});
