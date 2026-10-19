import test from "node:test";
import assert from "node:assert/strict";
import {parseTable,stripRenderedTable} from "../src/local-ai/table-display.ts";
import {makeSheetPreview} from "../src/local-ai/sheet-preview-model.ts";
import {streamDisplayInterval,shouldPublishStream,preferSmallModelForDevice} from "../src/local-ai/stream-performance.ts";
import {attachmentOwner} from "../src/library/attachment-vault.ts";

test("description remains exactly once, and Markdown table is replaced by the visual table",()=>{
 const raw="以下是收支摘要：\n\n| 日期 | 支出 |\n| --- | ---: |\n| 10/19 | 123 |\n| 10/20 | 45 |\n\n僅為示範。";
 const rows=parseTable(raw);
 assert.deepEqual(rows,[["日期","支出"],["10/19","123"],["10/20","45"]]);
 const prose=stripRenderedTable(raw);
 assert.equal(prose,"以下是收支摘要：\n\n僅為示範。");
 assert.ok(!prose.includes("|"));
 assert.equal(stripRenderedTable("純粹文字說明"),"純粹文字說明");
});
test("real sheet payload preserves formulas and respects existing Sheets limits",()=>{
 const preview=makeSheetPreview("家庭預算",[["項目","合計"],["交通","=SUM(B2:B4)"],["餐飲","100"]]);
 assert.deepEqual(preview.rows[1],["交通","=SUM(B2:B4)"]);
 assert.equal(preview.name,"家庭預算");
 assert.throws(()=>makeSheetPreview("huge",Array.from({length:201},()=>["x"])),/200/);
});
test("stream rendering is paced based on device cores, and always flushes final chunk",()=>{
 assert.equal(streamDisplayInterval(4),140);
 assert.equal(streamDisplayInterval(8),75);
 assert.equal(shouldPublishStream(100,50,100),false);
 assert.equal(shouldPublishStream(101,0,100),true);
 assert.equal(shouldPublishStream(10,9,100,true),true);
 assert.equal(preferSmallModelForDevice(4,8),true);
});
test("attachment storage uses separate account namespaces",()=>{
 assert.notEqual(attachmentOwner("person-a@example.com"),attachmentOwner("person-b@example.com"));
 assert.equal(attachmentOwner(" Person-A@EXAMPLE.COM "),"account:person-a@example.com");
 assert.equal(attachmentOwner(""),"guest:device");
});

test("custom search backend accepts only public HTTPS origins without embedded secrets",async()=>{
 const {validateSearchBridge}=await import("../src/search/search-bridge.ts");
 assert.equal(validateSearchBridge("https://search.example.net/search"),"https://search.example.net/search");
 for(const url of ["http://example.com/search","https://localhost/search","https://127.0.0.1/search",
  "https://user:pass@example.com/search","https://search.example.net/search?token=abc","https://10.0.0.1/search"]){
  assert.throws(()=>validateSearchBridge(url),undefined,url);
 }
});
