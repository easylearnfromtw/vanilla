import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {escapeEmailHtml,safeEmailLink,isEmailDesign,parseEmailSnapshot,scopedEmailStorageKey} from "../src/email/email-policy.ts";

test("email templates escape unsafe user HTML",()=>{
 assert.equal(escapeEmailHtml("<script>alert(\"x\")</script>"),"&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
});
test("CTA links allow HTTPS only, rejecting credentials and executable schemes",()=>{
 assert.equal(safeEmailLink("https://example.com/path"),"https://example.com/path");
 for(const link of ["javascript:alert(1)","http://example.com","data:text/html,a","https://bob:pass@example.com","ftp://example.com"]){
  assert.equal(safeEmailLink(link),null,link);
 }
});
test("JSON import requires a recognizable design body",()=>{
 assert.equal(isEmailDesign({body:{rows:[]},schemaVersion:1}),true);
 assert.equal(isEmailDesign({rows:[]}),false);
 assert.equal(isEmailDesign({body:{rows:"invalid"}}),false);
 assert.throws(()=>parseEmailSnapshot('{"design":{},"html":"","title":"bad"}'));
 assert.equal(parseEmailSnapshot('{"design":{"body":{"rows":[]}},"html":"","title":"ok"}').title,"ok");
});
test("local storage is account scoped",()=>{
 assert.notEqual(scopedEmailStorageKey("alpha@example.com"),scopedEmailStorageKey("beta@example.com"));
 assert.equal(scopedEmailStorageKey(" A@EXAMPLE.com "),scopedEmailStorageKey("a@example.com"));
});
test("remote editor is opt-in and sends are not automatic",()=>{
 const studio=readFileSync(new URL("../src/email/EmailStudio.tsx",import.meta.url),"utf8");
 const editor=readFileSync(new URL("../src/email/EmailVisualEditor.tsx",import.meta.url),"utf8");
 assert.match(studio,/editorOpen\s*\?/);
 assert.match(studio,/setEditorOpen\(true\)/);
 assert.match(editor,/exportHtml/);
 assert.doesNotMatch(studio,/sendEmail\(|gmail\.send|fetch\(/);
});
