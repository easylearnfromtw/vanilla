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

test("slash commands handle bare input, fullwidth input and punctuation",()=>{
 const build=expandSlashCommand("/建立");
 assert.equal(build?.text,"開啟 自建功能");
 assert.equal(kind(build.text),"open");
 assert.equal(routeMessage(build.text,ctx).section,"builder");
 for(const input of ["/搜尋","／搜尋","/搜尋："]){
  const result=expandSlashCommand(input);
  assert.equal(result?.ui,"prompt",input);
  assert.match(result.hint,/\/搜尋/,input);
  assert.equal(result.prefill,"/搜尋 ",input);
 }
 assert.equal(expandSlashCommand("/搜尋 x")?.ui,"prompt");
 for(const input of ["／搜尋　台北天氣","/搜尋：台北天氣","/搜尋:台北天氣"]){
  assert.equal(kind(expandSlashCommand(input).text),"web-search",input);
 }
 assert.equal(routeTail(expandSlashCommand("／建立　喝水紀錄").text).kind,"feature-builder");
 assert.deepEqual(matchSlashCommands("／搜").map(x=>x.cmd),["/搜尋"]);
 assert.deepEqual(matchSlashCommands("／").length,SLASH_MENU_EXPECTED_LENGTH());
 assert.equal(expandSlashCommand("/讀")?.ui,"prompt");
 assert.equal(expandSlashCommand("/記住")?.ui,"prompt");
 assert.equal(expandSlashCommand("/潤稿")?.ui,"prompt");
 assert.equal(expandSlashCommand("/未註冊"),null);
});

function SLASH_MENU_EXPECTED_LENGTH(){return matchSlashCommands("/").length;}

test("chat dispatches explicit slash commands before Merlin and proactive Diana",()=>{
 const chat=readFileSync(new URL("../src/local-ai/LocalChat.tsx",import.meta.url),"utf8");
 assert.match(chat,/const slashCommand=\/\^\[/);
 assert.match(chat,/if\(!slashCommand&&!image&&merlinPending\)/);\n assert.match(chat,/const route=image\?/);
 assert.match(chat,/const slashTail=slashCommand\?routeTail\(question\):null/);
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


test("Scouts recognizes user questions without requiring a slash command",()=>{
 for(const q of [
  "幫我查一下 2027 年 PGY 說明會",
  "可以幫我查一下 新竹臺大招生公告",
  "請查詢 今年衛福部新公布的法規",
  "根據最新官方資料整理 PGY 招募時程",
  "請根據最新文獻報告股骨頸骨折治療方法"
 ]){
  const route=routeMessage(q,ctx);
  assert.equal(route.kind,"web-search",q);
  assert.ok(route.query.length>=2,q);
 }
 assert.equal(kind("請不要上網，只根據文件摘要"),"continue");
 assert.equal(kind("幫我整理以下原文，不需要網路搜尋"),"continue");
 assert.equal(kind("研究一下這篇報告"),"continue");
 assert.equal(kind("請幫我閱讀 https://example.com/article 然後整理重點"),"web-read");
 assert.equal(kind("幫我看 https://example.com/health，並解釋重點"),"web-read");
 assert.equal(kind("幫我查一下 2027 年 PGY 說明會",{privateMode:true,hasCreamResult:false}),"private-blocked");
});

test("Scouts prioritizes real general-web backend results over encyclopedia fallback",async()=>{
 const {searchLiveWeb}=await import("../src/search/live-search.ts");
 const previousFetch=globalThis.fetch,previousStorage=globalThis.localStorage;
 globalThis.localStorage={getItem:key=>key==="vanilla.search.bridge.url.v1"?"https://search.example.org/search":null};
 globalThis.fetch=async input=>{
  const url=String(input);
  if(url.startsWith("https://search.example.org/search")){
   return new Response(JSON.stringify({results:Array.from({length:8},(_,i)=>({
    title:"官方資料 "+i,url:"https://gov.example.org/article/"+i,snippet:"近期資料 "+i
   }))}),{status:200,headers:{"content-type":"application/json"}});
  }
  if(url.startsWith("https://zh.wikipedia.org/")){
   return new Response(JSON.stringify({query:{search:Array.from({length:5},(_,i)=>({
    pageid:100+i,title:"百科 "+i,snippet:"百科內容"
   }))}}),{status:200,headers:{"content-type":"application/json"}});
  }
  throw Error("unexpected request "+url);
 };
 try{
  const report=await searchLiveWeb("臺灣政府新聞");
  assert.equal(report.results.length,9);
  assert.ok(report.results.slice(0,8).every(x=>x.provider==="自訂搜尋"));
  assert.equal(report.results[8].provider,"Wikipedia");
  assert.deepEqual(report.errors,[]);
 }finally{
  globalThis.fetch=previousFetch;
  if(previousStorage===undefined)delete globalThis.localStorage;
  else globalThis.localStorage=previousStorage;
 }
});

test("Scouts uses the configured reader backend first on Safari and keeps its provenance",async()=>{
 const {readPublicPage}=await import("../src/search/web-reader.ts");
 const previousFetch=globalThis.fetch,previousStorage=globalThis.localStorage;
 globalThis.localStorage={getItem:key=>key==="vanilla.search.bridge.url.v1"?"https://search.example.org/search":null};
 const requests=[];
 globalThis.fetch=async input=>{
  requests.push(String(input));
  if(!String(input).startsWith("https://search.example.org/read?"))throw Error("browser direct fetch should not run");
  return new Response(JSON.stringify({url:"https://news.example.org/post",title:"新聞來源",
   text:"這是一篇實際取得的網站正文，包含可核對的新聞與事件資料。".repeat(10)}),{status:200,headers:{"content-type":"application/json"}});
 };
 try{
  const page=await readPublicPage("https://news.example.org/post");
  assert.equal(page.readMethod,"bridge");
  assert.equal(page.title,"新聞來源");
  assert.equal(requests.length,1);
  assert.match(requests[0],/\/read\?url=/);
 }finally{
  globalThis.fetch=previousFetch;
  if(previousStorage===undefined)delete globalThis.localStorage;
  else globalThis.localStorage=previousStorage;
 }
});
