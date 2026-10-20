import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
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

test("Diana supports Chinese, full-width and full-name @ mentions without fabricating execution",()=>{
 assert.equal(parseDianaInvocation("＠Diana 研究")?.request,"研究");
 assert.equal(parseDianaInvocation("@衛國 管理瀏覽器")?.forcedTool,"weiguo");
 assert.equal(parseDianaInvocation("@衞國")?.forcedTool,"weiguo");
 assert.equal(parseDianaInvocation("@爾雅 這是原文")?.forcedTool,"er-ya");
 assert.equal(parseDianaInvocation("@JENSEN HUANG 修復程式")?.forcedTool,"jensen-huang");
 assert.equal(parseDianaInvocation("@Venus 做簡報")?.forcedTool,"venus");
 assert.equal(chooseDianaTool("",normal,"weiguo").event,"vanilla-open-weiguo");
 assert.equal(chooseDianaTool("任何任務",normal,"venus").kind,"report");
});
test("Diana creates data-first sequence rather than exporting unvalidated figures",()=>{
 const p=chooseDianaTool("分析年度 CSV 數據並製作 PDF 報告",normal);
 assert.equal(p.tool,"cream");
 assert.deepEqual(p.nextSteps,["retina"]);
 assert.equal(p.kind,"open");
 assert.equal(chooseDianaTool("整理統計圖表到電子報",normal).tool,"cream");
 assert.deepEqual(chooseDianaTool("整理統計圖表到電子報",normal).nextSteps,["janus"]);
});
test("Diana exposes offline and incomplete-tool constraints",()=>{
 assert.equal(chooseDianaTool("最新醫學文獻",{...normal,online:false}).kind,"report");
 assert.match(chooseDianaTool("",normal,"scouts").message||"",/請輸入/);
 assert.equal(chooseDianaTool("安全掃描",normal,"quirinus").kind,"open");
 assert.equal(chooseDianaTool("安全掃描",normal,"quirinus").tab,"quirinus");
 assert.equal(chooseDianaTool("安全掃描",privateMode,"quirinus").kind,"report");
 assert.equal(expandSlashCommand("/Quirinus")?.text,"@Quirinus");
 assert.equal(chooseDianaTool("執行排程",normal,"chronos").kind,"report");
});
test("Diana Erya delegates through an existing guarded writing request",()=>{
 const p=chooseDianaTool("原文：2026 年成功率 98%",{...normal,hasModel:true},"er-ya");
 assert.equal(p.kind,"delegate");
 assert.match(p.command||"",/【待潤稿原文】/);
 assert.equal(routeMessage(p.command||"",normal).kind,"continue");
 assert.equal(chooseDianaTool("一段話",{...normal,hasModel:false},"er-ya").kind,"report");
 assert.equal(chooseDianaTool("",normal,"er-ya").kind,"report");
});
test("Diana never copies private conversation text into Orchestra automatically",()=>{
 const source=readFileSync(new URL("../src/local-ai/LocalChat.tsx",import.meta.url),"utf8");
 assert.match(source,/privateMode&&pick\.event==="vanilla-open-orchestra"/);
});

test("Diana delegates genuine visual presentation requests to Venus without triggering external embeds",()=>{
 const options={privateMode:false,hasCreamResult:false,hasModel:true};
 const map=chooseDianaTool("請做一張互動地圖",options);
 assert.equal(map.tool,"venus");
 assert.equal(map.kind,"delegate");
 assert.equal(chooseDianaTool("請做一張互動地圖",{...options,hasModel:false}).kind,"report");
 assert.equal(chooseDianaTool("任何任務",options,"venus").kind,"report");
});
