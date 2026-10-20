import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {notionPageDraft,notionTasksCsv,NOTION_BROWSER_URL} from "../src/notion/browser-handoff.ts";

const sample={id:"8a41b3cd-df8b-4a51-b6e2-d66cb8d40ca9",title:"門診簡報",when:"2026-11-01T09:00:00+08:00",done:false,details:"逐項核對 EBM"};
test("CSV export and browser payload work fully offline, no credentials or API",()=>{
 const draft=JSON.parse(notionPageDraft(sample));
 assert.deepEqual(Object.keys(draft.task),["id","title","when","done","details"]);
 assert.equal(draft.task.title,"門診簡報");
 assert.equal(draft.task.when,"2026-11-01T01:00:00.000Z");
 assert.match(NOTION_BROWSER_URL,/^https:\/\/www\.notion\.so\/$/);
 const csv=notionTasksCsv([sample]);
 assert.ok(csv.startsWith("\uFEFFName,When,Done,Details\r\n"));
 assert.match(csv,/"門診簡報","2026-11-01T01:00:00.000Z","FALSE","逐項核對 EBM"/);
 assert.doesNotMatch(csv,/api\.notion|access_token|Bearer/);
});
test("CSV escaping resists formula injection and preserves comma and quote",()=>{
 const csv=notionTasksCsv([{...sample,title:"=IMPORTXML(A1)",details:'simple,"quoted"\nline'}]);
 assert.match(csv,/"'=IMPORTXML\(A1\)"/);
 assert.match(csv,/"simple,""quoted""\nline"/);
});
test("Invalid records fail closed without a cloud fallback",()=>{
 assert.throws(()=>notionTasksCsv([]),/1–200/);
 assert.throws(()=>notionTasksCsv([{...sample,when:"tomorrowish"}]),/格式不正確/);
 assert.throws(()=>notionPageDraft({...sample,title:" "}),/格式不正確/);
});
test("Browser companion has bounded privileges and requires a real Notion tab/user action",()=>{
 const root=new URL("../integrations/notion-browser-bridge/",import.meta.url);
 const manifest=JSON.parse(readFileSync(new URL("manifest.json",root),"utf8"));
 const code=readFileSync(new URL("popup.js",root),"utf8");
 assert.deepEqual(manifest.permissions,["activeTab","scripting"]);
 assert.equal(manifest.manifest_version,3);
 assert.equal(manifest.background,undefined);
 assert.equal(manifest.content_scripts,undefined);
 assert.equal(manifest.host_permissions,undefined);
 assert.ok(code.includes("notion"));
 assert.ok(code.includes("https:"));
 assert.match(code,/chrome\.scripting\.executeScript/);
 assert.match(code,/document\.activeElement/);
 assert.match(code,/contenteditable/);
 assert.match(code,/edit\.textContent\?\.trim\(\)/);
 assert.doesNotMatch(code,/fetch\(|XMLHttpRequest|document\.cookie|localStorage|chrome\.cookies|eval\(/);
});
