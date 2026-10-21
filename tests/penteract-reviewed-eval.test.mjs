import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {trainFiveProjector} from "../training/october/train-penteract-projector.mjs";
import {
 wilson95,verifyReviewedRoutingCases,evaluateReviewedProjector
} from "../training/october/penteract-reviewed-eval.mjs";

const reviewed=(id,question,expertLabel,dianaToolLabel)=>({
 id,question,expertLabel,dianaToolLabel,
 reviewers:["reviewer_01","reviewer_02"],
 adjudicated:true,redacted:true,consented:true
});
const FIXTURE=[
 reviewed("case_001","請分析股票的投資報酬","finance","cream"),
 reviewed("case_002","這個 Python 程式如何修復","code","jensen-huang"),
 reviewed("case_003","我想知道這段話的意思","null","merlin"),
 reviewed("case_004","幫我將研究內容改寫為文件","writing","orchestra"),
].map(x=>({...x,expertLabel:x.expertLabel==="null"?null:x.expertLabel}));

test("Wilson 95 intervals are valid for tiny and moderate reviewed datasets",()=>{
 for(const [correct,total] of [[0,3],[1,4],[4,4],[50,100]]){
  const [low,high]=wilson95(correct,total);
  assert.ok(low>=0&&high<=1&&low<=high);
  assert.ok(low<=correct/total+1e-9&&high>=correct/total-1e-9);
 }
 assert.throws(()=>wilson95(2,1),/INVALID/);
 assert.throws(()=>wilson95(0,0),/INVALID/);
});
test("Locally reviewed evaluation requires redaction, consent, adjudication and distinct reviewer attestations",()=>{
 assert.equal(verifyReviewedRoutingCases(FIXTURE).records,4);
 assert.match(verifyReviewedRoutingCases(FIXTURE).adjudication,/self-attested/);
 const change=(overrides)=>FIXTURE.map((x,i)=>i===0?{...x,...overrides}:x);
 assert.throws(()=>verifyReviewedRoutingCases(change({consented:false})),/REDACTION/);
 assert.throws(()=>verifyReviewedRoutingCases(change({redacted:false})),/REDACTION/);
 assert.throws(()=>verifyReviewedRoutingCases(change({adjudicated:false})),/REDACTION/);
 assert.throws(()=>verifyReviewedRoutingCases(change({reviewers:["one","one"]})),/REVIEWER/);
 assert.throws(()=>verifyReviewedRoutingCases(change({question:"Send sk-abcdefghijklmnop secret"})),/PRIVATE/);
 assert.throws(()=>verifyReviewedRoutingCases(change({question:"contact user@example.com for notes"})),/PRIVATE/);
 assert.throws(()=>verifyReviewedRoutingCases(change({expertLabel:"admin"})),/UNRECOGNIZED/);
 assert.throws(()=>verifyReviewedRoutingCases(change({dianaToolLabel:"delete-all"})),/UNRECOGNIZED/);
 assert.throws(()=>verifyReviewedRoutingCases([FIXTURE[0],FIXTURE[0]]),/DUPLICATE/);
});
test("Separate expert and tool scoring; no Diana execution, no input text in report",()=>{
 const {artifact}=trainFiveProjector({epochs:12});
 const seen=[];
 const fakeDiana=(question)=>{seen.push(question);
  return {tool:question.includes("股票")?"cream":question.includes("Python")?
   "jensen-huang":question.includes("意思")?"merlin":"orchestra"};
 };
 const result=evaluateReviewedProjector(FIXTURE,artifact,fakeDiana);
 assert.equal(result.expertTask.known,3);
 assert.equal(result.expertTask.unknown,1);
 assert.equal(result.dianaToolTask.proposalsEvaluated,4);
 assert.equal(result.dianaToolTask.proposalToolMatches.correct,4);
 assert.equal(result.dianaToolTask.comparableWithExpertClassification,false);
 assert.equal(result.noToolExecution,true);
 assert.equal(result.noCloudTransfer,true);
 assert.equal(result.noTraining,true);
 assert.equal(result.deploymentEligible,false);
 assert.equal(seen.length,4);
 for(const row of FIXTURE)assert.ok(!JSON.stringify(result).includes(row.question));
 const noDiana=evaluateReviewedProjector(FIXTURE,artifact);
 assert.equal(noDiana.dianaToolTask.proposalsEvaluated,0);
 assert.equal(noDiana.dianaToolTask.proposalToolMatches.wilson95,null);
 assert.throws(()=>evaluateReviewedProjector(FIXTURE,artifact,()=>
   ({tool:"unauthorized-delete"})),/INVALID_DIANA_PROPOSAL/);
});
test("Operator benchmark is opt-in; Studio local weight file is strictly preview-only",()=>{
 const source=readFileSync(new URL("../training/october/penteract-reviewed-eval.mjs",import.meta.url),"utf8");
 const panel=readFileSync(new URL("../src/detroit/PenteractFunnelPanel.tsx",import.meta.url),"utf8");
 assert.match(source,/EXPLICIT_CASES_AND_WEIGHTS_REQUIRED/);
 assert.match(source,/dianaToolTask.*comparableWithExpertClassification:false/s);
 assert.match(source,/chooseDianaTool/);
 assert.doesNotMatch(source,/fetch\(|\.post\(|\.put\(|\.delete\(|spawn\(|execSync\(/);
 assert.match(panel,/selected\.size>180000/);
 assert.match(panel,/assertLearnedFiveWeights/);
 assert.match(panel,/routeLearnedFive\(text,learnedArtifact\)/);
 assert.doesNotMatch(panel,/fetch\(|localStorage|sessionStorage|execSync/);
});
