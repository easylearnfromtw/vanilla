import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const chat=file("src/local-ai/ChatMarkdown.tsx");
const css=file("src/local-ai/chat-text.css");
const boot=file("src/main.tsx");
const theme=file("src/theme/vanilla-bauhaus.css");

test("AI text stays native Markdown with GFM and sanitized outbound links",()=>{
 assert.match(chat,/ReactMarkdown/);
 assert.match(chat,/remarkGfm/);
 assert.match(chat,/noopener noreferrer/);
 assert.match(chat,/parseVenusMessage\(source\)/);
 assert.match(chat,/<VenusBlocks blocks=\{view\.blocks\}/);
 assert.doesNotMatch(chat,/rehypeRaw|dangerouslySetInnerHTML|eval\(|innerHTML\s*=/);
});
test("code copy only happens from a clicked button and reports genuine clipboard success",()=>{
 assert.match(chat,/<button type="button" className="markdown-code-copy"/);
 assert.match(chat,/onClick=\{\(\)=>\{void copy\(\);\}\}/);
 assert.match(chat,/await navigator\.clipboard\.writeText\(code\)/);
 assert.match(chat,/setCopyState\("ok"\)/);
 assert.match(chat,/setCopyState\("failed"\)/);
 assert.match(chat,/role="status"/);
 assert.match(chat,/className="markdown-code-language"/);
 assert.match(chat,/<pre tabIndex=\{0\}>/);
 assert.doesNotMatch(chat,/document\.execCommand\(/);
});
test("tables retain native table semantics and keyboard scroll access",()=>{
 assert.match(chat,/className="markdown-table-shell"/);
 assert.match(chat,/className="markdown-table-scroll" role="region"/);
 assert.match(chat,/aria-label="回答中的資料表，可左右捲動" tabIndex=\{0\}/);
 assert.match(chat,/<table>\{children\}<\/table>/);
 assert.doesNotMatch(chat,/window\.open\(|fetch\(/);
});
test("prose design is scoped to assistant only, and imports after base Bauhaus palette",()=>{
 assert.match(css,/\.message-row\.from-ai \.vanilla-prose/);
 assert.doesNotMatch(css,/\.from-user.*?\.vanilla-prose/);
 assert.ok(boot.indexOf('import "./local-ai/chat-text.css";')>boot.indexOf('import "./theme/vanilla-bauhaus.css";'));
 assert.match(theme,/--paper:/);
 assert.match(css,/var\(--ink/);
 assert.match(css,/var\(--paper-2/);
});
test("prose covers responsive typography, accessible code, cards, scrollable tables and print",()=>{
 assert.match(css,/\.vanilla-prose h2/);
 assert.match(css,/\.vanilla-prose blockquote/);
 assert.match(css,/\.vanilla-prose :is\(ul,ol\)/);
 assert.match(css,/\.markdown-code-toolbar/);
 assert.match(css,/\.markdown-code-copy:focus-visible/);
 assert.match(css,/\.markdown-table-scroll/);
 assert.match(css,/scrollbar-width:thin/);
 assert.match(css,/overscroll-behavior-x:contain/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media print/);
 assert.doesNotMatch(css,/position:fixed|!important.*background/);
});
