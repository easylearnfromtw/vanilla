import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {filenameFromQuestion,matchNamedFile} from "../src/local-ai/file-intent.ts";
import {saveChatAttachment,getChatAttachment,listChatAttachments,removeChatAttachment,attachmentOwner} from "../src/library/attachment-vault.ts";
import {extractBrowserDocument} from "../src/local-ai/document-extract.ts";
import {makeCreamSnapshot,analyzeLongitudinal,extractTextMeasurements} from "../src/cream/longitudinal.ts";
import {readFileSync} from "node:fs";
const source=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
globalThis.window ??= new EventTarget();
test("direct natural-language reference to app.js routes to file reader not chat model",()=>{
 for(const question of ["分析 app.js","請幫我讀取 `app.js`","查看「app.js」檔案","幫我刪除 app.js"]){
  const parsed=filenameFromQuestion(question);
  assert.equal(parsed?.name,"app.js",question);
 }
 assert.equal(filenameFromQuestion("幫我刪除 app.js")?.action,"delete");
 assert.equal(filenameFromQuestion("分析 app.js")?.action,"analyze");
 assert.equal(filenameFromQuestion("說明如何用 JS 的物件"),null);
});
test("exact matching wins, ambiguous partial filenames never deletes the wrong file",()=>{
 const names=[{id:"1",name:"app.js"},{id:"2",name:"app.test.js"},{id:"3",name:"other.js"}];
 assert.equal(matchNamedFile(names,"app.js")?.id,"1");
 assert.throws(()=>matchNamedFile(names,"app"),/多個/);
 assert.equal(matchNamedFile(names,"missing"),null);
});
test("real user file app.js survives save/read, is extracted, and is actually deleted by immutable ID",async()=>{
 const owner=attachmentOwner("owner@example.test");
 const file=new File(["export function add(a,b){return a+b};\nconsole.log(add(2,3));"],"app.js",{type:"application/javascript"});
 const saved=await saveChatAttachment(file,owner);
 assert.equal((await listChatAttachments(owner)).filter(x=>x.id===saved.id).length,1);
 const copied=await getChatAttachment(saved.id,owner);
 assert.equal(copied.name,"app.js");
 const parsed=await extractBrowserDocument(new File([copied.blob],copied.name,{type:copied.type}));
 assert.match(parsed.text,/export function add/);
 assert.equal(parsed.kind,"text");
 await assert.rejects(removeChatAttachment(saved.id,attachmentOwner("other@example.test")),/帳號/);
 await removeChatAttachment(saved.id,owner);
 await assert.rejects(getChatAttachment(saved.id,owner),/找不到/);
 assert.equal((await listChatAttachments(owner)).some(x=>x.id===saved.id),false);
});
test("CREAM actual longitudinal points keep unit, date and source, never fake trend with single date",()=>{
 const data=extractTextMeasurements("2026-10-01 觀測數值: 12 個\n2026-10-08 觀測數值: 14 個\n2026-10-15 觀測數值: 16 個");
 assert.ok(data);
 const snap=makeCreamSnapshot(data,"account:example");
 assert.equal(snap.observations.length,3);
 const trend=analyzeLongitudinal(snap.observations)[0];
 assert.equal(trend.change,4);
 assert.equal(trend.uniqueDates,3);
 assert.ok(trend.slopePer30Days!==null);
 const short=analyzeLongitudinal(snap.observations.slice(0,1))[0];
 assert.equal(short.slopePer30Days,null);
});
test("actual chat wiring resolves named files before invoking model and CloudFiles checks deletion",()=>{
 const chat=source("src/local-ai/LocalChat.tsx"),files=source("src/workspace/CloudFiles.tsx");
 assert.match(chat,/filenameFromQuestion\(question\)/);
 assert.match(chat,/locateSavedFile\(namedIntent.name/);
 assert.match(chat,/inlineFileContext=documentContext\(doc\)/);
 assert.match(chat,/effectiveFileContext=inlineFileContext\|\|fileContext/);
 assert.match(chat,/deleteOwnedCopy\(item\)/);
 assert.match(files,/if\(after.some\(x=>x.id===file.id\)\)/);
});

test("regression: uploaded app.js enters full document context instead of index-only 2.4KB preview",()=>{
 const chat=source("src/local-ai/LocalChat.tsx");
 const start=chat.indexOf("const indexed=await importUploadedCode(");
 assert.ok(start>0);
 const uploaded=chat.slice(start,start+650);
 assert.match(uploaded,/documentContext\(await extractBrowserDocument\(file\)\)/);
 assert.doesNotMatch(uploaded,/excerpt\.slice\(0,2400\)/);
});
test("regression: library delete button invokes verified local/Drive resolver and cloud memory checks actual original",()=>{
 const ui=source("src/library/ConversationLibrary.tsx");
 const memory=source("src/memory/drive-memory.ts");
 assert.match(ui,/await deleteOwnedCopy\(target\)/);
 assert.match(ui,/await refresh\(\)/);
 assert.match(memory,/getWorkspaceMetadata\(token,item.fileId\)/);
 assert.match(memory,/missing-or-inaccessible/);
 assert.match(ui,/removeAllCopies\(\)/);
 assert.match(memory,/await listWorkspaceFiles\(token\)/);
 assert.match(memory,/await listMemories\(\)/);
});
