import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {visibleSwipeIndex} from "../src/local-ai/swipe-utils.ts";
import {safeExternalURL} from "../src/local-ai/chat-ui-utils.ts";
import {parseTable,stripRenderedTable} from "../src/local-ai/table-display.ts";
const file=(x)=>readFileSync(new URL("../"+x,import.meta.url),"utf8");

test("swipe carousel identifies the nearest card and clamps empty lists",()=>{
 assert.equal(visibleSwipeIndex(0,[]),0);
 assert.equal(visibleSwipeIndex(0,[0,335,670]),0);
 assert.equal(visibleSwipeIndex(320,[0,335,670]),1);
 assert.equal(visibleSwipeIndex(650,[0,335,670]),2);
 assert.equal(visibleSwipeIndex(10000,[0,335,670]),2);
});
test("source cards reject javascript, data, credentials and malformed URLs",()=>{
 assert.equal(safeExternalURL("https://example.com/article"),"https://example.com/article");
 assert.equal(safeExternalURL("http://example.com"),"http://example.com/");
 for(const bad of ["javascript:alert(1)","data:text/html,test","file:///etc/passwd",
  "https://username:password@example.com/","/relative","not-a-url"]){
  assert.equal(safeExternalURL(bad),null,bad);
 }
});
test("actual native table is displayed only once, prose remains intact",()=>{
 const m="第一段內容\n\n| 項目 | 數值 |\n| --- | --- |\n| A | 100 |\n\n最後說明";
 assert.deepEqual(parseTable(m),[["項目","數值"],["A","100"]]);
 assert.equal(stripRenderedTable(m),"第一段內容\n\n最後說明");
});
test("rich markdown refuses raw HTML and citations are real links",()=>{
 const markdown=file("src/local-ai/ChatMarkdown.tsx");
 assert.match(markdown,/ReactMarkdown/);
 assert.match(markdown,/remarkGfm/);
 assert.doesNotMatch(markdown,/rehypeRaw|dangerouslySetInnerHTML/);
 assert.match(markdown,/noopener noreferrer/);
 const artifacts=file("src/local-ai/MessageArtifacts.tsx");
 assert.match(artifacts,/safeExternalURL/);
 assert.match(artifacts,/SwipeDeck/);
 assert.match(artifacts,/CreamMessage/);
 assert.match(artifacts,/SheetPreview/);
});
test("conversation uses rich message formatting without duplicating CREAM and tables",()=>{
 const source=file("src/local-ai/LocalChat.tsx");
 assert.match(source,/<ChatMarkdown source=\{stripRenderedTable\(turn.content\)\}/);
 assert.match(source,/<MessageArtifacts turn=\{turn\}/);
 assert.doesNotMatch(source,/\{turn.role==="assistant"&&renderTable\(turn.content\)\}/);
 assert.match(source,/NoodlesPanel privateMode/);
 assert.match(source,/GoogleSourcesPanel privateMode/);
});
test("two-model comparison uses same swipe architecture and stays actionable",()=>{
 const cmp=file("src/ai/CompareAnswers.tsx");
 assert.match(cmp,/SwipeDeck items=\{cards\}/);
 assert.match(cmp,/onChoose\(item.candidate.id\)/);
 assert.match(cmp,/onCancel/);
 const css=file("src/local-ai/chatgpt-layout.css");
 assert.match(css,/scroll-snap-type:x mandatory/);
 assert.match(css,/grid-auto-columns:calc\(\(100% - 12px\)\/2\)/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/prefers-reduced-motion/);
});
