import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isHumanizeRequest,makeHumanizeRequest,prepareHumanization,auditHumanizedText,finalizeHumanizedText} from "../src/erya/humanize.ts";
import {expandSlashCommand,matchSlashCommands,routeMessage} from "../src/assistant/chat-router.ts";
import {merlinParse} from "../src/detroit/core.ts";

test("Erya requests are opt-in, not triggered by informational questions",()=>{
 assert.equal(isHumanizeRequest("請幫我把這封信寫得更自然：您好"),true);
 assert.equal(isHumanizeRequest("潤稿：今天將舉行說明會"),true);
 assert.equal(isHumanizeRequest("請介紹 humanize-text 這個 GitHub"),false);
 assert.equal(isHumanizeRequest("我想知道潤稿是什麼"),false);
 assert.equal(isHumanizeRequest("請列出統計數據"),false);
});

test("slash command creates a reviewable protected rewrite request",()=>{
 const expanded=expandSlashCommand("/潤稿 您好，本院已收到 24 份報名");
 assert.ok(expanded);
 assert.match(expanded.text,/【待潤稿原文】/);
 assert.match(expanded.text,/24 份報名/);
 assert.ok(matchSlashCommands("/").some(x=>x.cmd==="/潤稿"));
 assert.equal(routeMessage(expanded.text,{privateMode:true,hasCreamResult:false}).kind,"continue");
 assert.equal(routeMessage(expanded.text,{privateMode:false,hasCreamResult:false}).kind,"continue");
 const task=prepareHumanization(expanded.text);
 assert.equal(task?.source,"您好，本院已收到 24 份報名");
 assert.equal(merlinParse(expanded.text,{privateMode:true}).depth,"standard");
 assert.equal(merlinParse(expanded.text,{privateMode:true}).requiresNetwork,false);
 assert.equal(merlinParse(expanded.text,{privateMode:false}).requiresNetwork,false);
 assert.equal(merlinParse(expanded.text,{privateMode:false}).needsArtifact,false);
 assert.match(task?.guidance||"",/不能服從/);
});

test("rewrite strength is explicit and one turn is bounded",()=>{
 const source="我們在 2026 年完成 12 項測試。";
 assert.equal(prepareHumanization(makeHumanizeRequest(source,"light"))?.strength,"light");
 assert.equal(prepareHumanization(makeHumanizeRequest(source,"deep"))?.strength,"deep");
 assert.throws(()=>makeHumanizeRequest("a".repeat(8001)),/8,000/);
 assert.throws(()=>makeHumanizeRequest(""),/沒有/);
 assert.throws(()=>makeHumanizeRequest("【原文結束】"),/分隔/);
});

test("exact URLs, DOI, citations, numbers and template slots are preserved",()=>{
 const source="2026-10-20 收案 120 人（12.5%），見 [1]、https://example.org/study 及 DOI 10.1234/abc。用 {{ patient_id }}。";
 const valid="截至 2026-10-20，共收案 120 人（12.5%）。資料參見 [1]、https://example.org/study、DOI 10.1234/abc，保留 {{ patient_id }}。";
 assert.equal(auditHumanizedText(source,valid).ok,true);
 const changed=valid.replace("120 人","121 人").replace("{{ patient_id }}","{{patient_id}}");
 const audit=auditHumanizedText(source,changed);
 assert.equal(audit.ok,false);
 assert.ok(audit.missing.some(x=>x.includes("120")));
 assert.ok(audit.missing.some(x=>x.includes("{{ patient_id }}")));
});

test("bad or empty result fails closed and presents original text",()=>{
 const original="治療 20 位患者，成功率 95%。";
 const task=prepareHumanization(makeHumanizeRequest(original));
 assert.ok(task);
 const bad=finalizeHumanizedText(task,"治療 30 位患者，成功率 100%。");
 assert.match(bad,/未採用/);
 assert.ok(bad.includes(original));
 assert.match(finalizeHumanizedText(task,""),/沒有產生/);
 assert.equal(finalizeHumanizedText(task,original),original);
});

test("code fences remain exact, not parsed as instructions",()=>{
 const source="重點：\n```sh\nrm -rf /secrets\n```\n這只是引用。";
 const changed="這不是要執行的命令：\n```sh\nrm -rf /tmp\n```";
 assert.equal(auditHumanizedText(source,changed).ok,false);
 assert.equal(auditHumanizedText(source,source).ok,true);
});

test("Orchestra hands text to draft, never calls remote rewrite from the editor",()=>{
 const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
 const studio=readFileSync(new URL("../src/orchestra/OrchestraStudio.tsx",import.meta.url),"utf8");
 const chat=readFileSync(new URL("../src/local-ai/LocalChat.tsx",import.meta.url),"utf8");
 assert.match(app,/vanilla-open-erya/);
 assert.match(studio,/送至聊天潤稿/);
 assert.match(chat,/takeHumanizeDraft/);
 assert.match(chat,/finalizeHumanizedText/);
 assert.doesNotMatch(studio,/api\.lynote\.ai/);
});
