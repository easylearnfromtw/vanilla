import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {shadowPenteractRoute} from "../src/detroit/penteract-shadow.ts";
import {auditPenteractShadow,SYNTHETIC_CASES} from "../training/october/penteract-routing-audit.mjs";

test("Five-dimensional geometry refuses to nominate a specialist without task anchors",()=>{
 for(const q of ["","你好","謝謝你","繼續","只是聊天"]){
  const x=shadowPenteractRoute(q);
  assert.equal(x.status,"abstain",q);
  assert.equal(x.candidateId,null);
  assert.equal(x.policy,"advisory-only");
  assert.equal(x.reason,"no-lexical-evidence");
 }
});
test("Near-tied multi-expert requests abstain instead of arbitrarily dispatching",()=>{
 for(const q of ["請研究投資風險","幫我用 Python 計算 CSV 統計","把最新研究寫成文章"]){
  const x=shadowPenteractRoute(q);
  assert.equal(x.status,"abstain",q);
  assert.equal(x.reason,"near-tie");
  assert.equal(x.candidateId,null);
 }
});
test("Unambiguous domain routing remains a suggestion with no escalation",()=>{
 for(const [q,expected] of [
  ["毛利率分析","finance"],["查核新聞來源","research"],
  ["修復 Python 程式","code"],["iOS UI 排版","design"],
  ["撰寫講稿","writing"],["計算樣本標準差","numbers"]
 ]){
  const x=shadowPenteractRoute(q);
  assert.equal(x.status,"candidate",q);
  assert.equal(x.candidateId,expected,q);
  assert.equal(x.policy,"advisory-only");
  assert.ok(x.neighborGap>0.12);
 }
});
test("Fixed synthetic sanity corpus separates labeled routing from uncertain abstention",()=>{
 const report=auditPenteractShadow();
 assert.equal(SYNTHETIC_CASES.length,50);
 assert.equal(report.labeledCases,36);
 assert.equal(report.unknownOrMixedCases,14);
 assert.equal(report.noModelInvoked,true);
 assert.equal(report.noToolsExecuted,true);
 assert.ok(report.shadowCorrectOnLabeled>=0.85);
 assert.ok(report.abstainOnUnknownOrMixed>=0.85);
 assert.ok(Object.keys(report.perDomain).length===6);
 assert.doesNotMatch(JSON.stringify(report),/問題：|使用者：|authorizationToken/);
 assert.match(report.fixturesSource,/synthetic/);
});
test("Shadow test cannot activate Diana, Slime, Ceres, or unauthorized network",()=>{
 const source=readFileSync(new URL("../src/detroit/penteract-shadow.ts",import.meta.url),"utf8");
 assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|runOctober|executeDetroit|setInterval/);
 assert.doesNotMatch(source,/import .*diana|import .*slime|import .*ceres/i);
 const s=readFileSync(new URL("../src/detroit/penteract-5d.ts",import.meta.url),"utf8");
 assert.match(s,/penteractLexicalEvidence/);
});
