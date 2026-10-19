import test from "node:test";
import assert from "node:assert/strict";
import {parseDianaInvocation,chooseDianaTool,dianaCatalog} from "../src/detroit/diana.ts";
import {routeMessage,expandSlashCommand} from "../src/assistant/chat-router.ts";
import {DETROIT_ENGINES} from "../src/detroit/core.ts";
const normal={privateMode:false,hasCreamResult:false};
const privateMode={privateMode:true,hasCreamResult:false};

test("Diana is an active Detroit entrypoint, not another loaded LLM",()=>{
 assert.equal(DETROIT_ENGINES.find(x=>x.id==="diana")?.status,"active");
 assert.match(dianaCatalog(),/Medusa/);
 assert.match(dianaCatalog(),/Janus/);
});
test("Diana slash commands and at-mentions use existing router",()=>{
 assert.equal(expandSlashCommand("/Diana 統計年度資料")?.text,"@Diana 統計年度資料");
 assert.equal(parseDianaInvocation("@Retina 製作 PDF")?.forcedTool,"retina");
 assert.equal(routeMessage("@Diana 最新文獻",{privateMode:false,hasCreamResult:false}).kind,"diana");
 assert.equal(routeMessage("@Unknown 工作",{privateMode:false,hasCreamResult:false}).kind,"continue");
});
test("Scouts gets real web route and remains disabled in private mode",()=>{
 const result=chooseDianaTool("最新醫學文獻",normal);
 assert.equal(result.tool,"scouts");
 assert.equal(result.kind,"delegate");
 assert.equal(routeMessage(result.command||"",{privateMode:false,hasCreamResult:false}).kind,"web-search");
 assert.equal(chooseDianaTool("最新醫學文獻",privateMode).kind,"report");
 assert.equal(chooseDianaTool("搜尋論文",privateMode,"scouts").kind,"report");
});
test("Diana supports CREAM, Janus, Retina and Studio handoffs",()=>{
 const csv=chooseDianaTool("日期,數值\n2026-10-01,5\n2026-10-02,7",normal,"cream");
 assert.equal(csv.kind,"delegate");
 assert.equal(routeMessage(csv.command||"",{privateMode:false,hasCreamResult:false}).kind,"cream-csv");
 assert.equal(chooseDianaTool("製作PDF正式文件",normal).tab,"retina");
 assert.equal(chooseDianaTool("幫我設計醫美電子報",normal).event,"vanilla-open-email");
 assert.equal(chooseDianaTool("請使用 Bard 生成圖片",normal).tab,"bard");
 assert.equal(chooseDianaTool("修改 Vanilla GitHub 原始碼",normal).event,"vanilla-open-builder");
});
test("Factory and governance adapters cannot be triggered in chat",()=>{
 for(const id of ["gridcraft","moli","persistent-jobs","zeus","athena"]){
  assert.equal(chooseDianaTool("執行任務",normal,id).kind,"report",id);
 }
 assert.equal(chooseDianaTool("修改 Vanilla 原始碼",privateMode).kind,"report");
 assert.equal(chooseDianaTool("執行 Python",privateMode,"medusa").kind,"report");
 assert.equal(chooseDianaTool("執行 Python",normal,"medusa").tab,"medusa");
 assert.equal(chooseDianaTool("系統效能",normal,"luca").tab,"luca");
 assert.equal(chooseDianaTool("",normal).kind,"report");
 const requested=parseDianaInvocation("@Medusa 執行 Python");
 assert.equal(chooseDianaTool(requested?.request||"",normal,requested?.forcedTool||null).tab,"medusa");
});
