import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {routeMessage,routeTail,expandSlashCommand,matchSlashCommands,SEARCH_REQUEST,CODE_BUILDER,SAVED_FILE_READ} from "../src/assistant/chat-router.ts";

const ctx={privateMode:false,hasCreamResult:false};
const kind=(q,c=ctx)=>routeMessage(q,c).kind;

test("explicit search phrasings all reach the real search + read pipeline",()=>{
 for(const q of ["搜尋：台北天氣","搜尋 台北天氣","上網查台北天氣","Google搜尋 新竹美食","全網搜尋 健保部分負擔","幫我找資料 電動機車補助","請搜尋 勞基法加班費"]){
  const route=routeMessage(q,ctx);
  assert.equal(route.kind,"web-search",q);
  assert.equal(route.explicit,true,q);
  assert.ok(route.query.length>=2,q);
 }
 assert.equal(SEARCH_REQUEST.exec("上網查台北天氣")?.[1],"台北天氣");
});

test("regression: double-escaped \\\\s patterns are gone from chat routing",()=>{
 // Source text "\\n" inside a normal string literal renders a visible backslash-n.
 const chat=readFileSync(new URL("../src/local-ai/LocalChat.tsx",import.meta.url),"utf8");
 assert.equal(chat.includes(String.raw`\\n`),false,"LocalChat must not contain double-escaped \\n");
 assert.equal(chat.includes(String.raw`\\s`),false,"LocalChat must not contain double-escaped \\s");
});

test("Self-Build CODE requests with a description route to the code builder",()=>{
 for(const q of ["自我優化：改善表格排版","幫我改程式碼 修正登入按鈕","Self-Build CODE：把設定頁分組","修復 Vanilla 的 bug"]){
  assert.equal(routeTail(q).kind,"code-builder",q);
 }
 assert.equal(routeTail("自我優化：改善表格排版").idea,"改善表格排版");
 assert.equal(CODE_BUILDER.test("今天天氣如何"),false);
});

test("memory, sheets and projects stay explicit commands and beat web search",()=>{
 assert.equal(kind("搜尋記憶 游泳課"),"app");
 assert.equal(kind("記住：週三晚上游泳課"),"app");
 assert.equal(kind("幫我建立家庭收支表格"),"app");
 assert.equal(kind("忘記：舊密碼提示"),"app");
});

test("private mode never reaches the network for search or page reading",()=>{
 const p={privateMode:true,hasCreamResult:false};
 assert.equal(kind("搜尋 台北天氣",p),"private-blocked");
 assert.equal(kind("https://example.com/article",p),"private-blocked");
 assert.equal(kind("最近有哪些最新研究關於睡眠",p),"continue");
});

test("deterministic local tools come first",()=>{
 assert.equal(kind("你能做什麼？"),"capability");
 assert.equal(kind("2026-10-01 體重: 75 kg"),"cream-text");
 assert.equal(kind("CREAM：\n日期,數值\n2026-10-01,5\n2026-10-02,7"),"cream-csv");
 assert.equal(kind("改成折線圖",{privateMode:false,hasCreamResult:true}),"chart-followup");
 assert.equal(kind("改成折線圖"),"continue");
 assert.equal(kind("開啟 CREAM"),"open");
 assert.equal(routeMessage("打開表格",ctx).section,"sheets");
 assert.equal(kind("幫我刪除 app.js"),"named-file");
 assert.equal(kind("讀取已儲存的檔案：report.csv"),"named-file");
 assert.equal(kind("讀取已儲存的檔案：家庭預算"),"saved-file");
 assert.equal(SAVED_FILE_READ.exec("讀取已儲存的檔案 report.csv")?.[1],"report.csv");
 assert.equal(kind("https://example.com/news"),"web-read");
 assert.equal(kind("幫我想三個週末親子活動"),"continue");
});

test("slash commands expand into canonical phrases the router understands",()=>{
 assert.equal(expandSlashCommand("/搜尋 台北天氣").text,"搜尋：台北天氣");
 assert.equal(kind(expandSlashCommand("/搜尋 台北天氣").text),"web-search");
 assert.equal(kind(expandSlashCommand("/記住 游泳課在週三").text),"app");
 assert.equal(kind(expandSlashCommand("/表格 家庭收支").text),"app");
 assert.equal(kind(expandSlashCommand("/讀 report.pdf").text),"named-file");
 assert.equal(kind(expandSlashCommand("/讀 https://example.com/a").text),"web-read");
 assert.equal(routeTail(expandSlashCommand("/改程式 修正登入按鈕").text).kind,"code-builder");
 assert.equal(routeTail(expandSlashCommand("/建立 喝水紀錄").text).kind,"feature-builder");
 assert.equal(expandSlashCommand("/私密").ui,"private");
 assert.equal(expandSlashCommand("/分析").ui,"attach");
 assert.equal(expandSlashCommand("/不存在"),null);
 assert.equal(matchSlashCommands("/").length>8,true);
 assert.deepEqual(matchSlashCommands("/搜").map(x=>x.cmd),["/搜尋"]);
 assert.equal(matchSlashCommands("一般句子").length,0);
});

test("Janus and legacy email commands route to the same local tool",()=>{
 for(const q of ["開啟 Janus","Janus","打開郵件編輯器","開啟 Email Studio"]){
  const route=routeMessage(q,ctx);
  assert.equal(route.kind,"open",q);
  assert.equal(route.section,"email",q);
 }
 assert.equal(expandSlashCommand("/Janus")?.text,"開啟 Janus");
 assert.equal(expandSlashCommand("/郵件")?.text,"開啟 Janus");
 assert.deepEqual(matchSlashCommands("/Jan").map(x=>x.cmd),["/Janus"]);
});
