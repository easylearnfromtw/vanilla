import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 LEARNED_5D_FEATURES,LEARNED_5D_IDS,fiveSpaceFeatures,
 assertLearnedFiveWeights,forwardLearnedFive,routeLearnedFive,detectLearnedFiveEvidence
} from "../src/detroit/penteract-learned.ts";
import {
 PENTERACT_PROJECTOR_TRAIN,PENTERACT_PROJECTOR_EVAL,validatePenteractProjectorCurriculum
} from "../training/october/penteract-projector-curriculum.mjs";
import {
 initializeFiveProjector,trainFiveProjector,compareProjector
} from "../training/october/train-penteract-projector.mjs";

test("R5 train/eval split is exactly 144/68 with no prompt overlap or private data",()=>{
 const proof=validatePenteractProjectorCurriculum();
 assert.deepEqual({train:proof.train,eval:proof.eval,known:proof.knownEval,unknown:proof.unknownEval},
  {train:144,eval:68,known:48,unknown:20});
 assert.equal(proof.expertReviewed,false);
 const train=new Set(PENTERACT_PROJECTOR_TRAIN.map(x=>x.text.normalize("NFKC").trim().toLowerCase()));
 for(const row of PENTERACT_PROJECTOR_EVAL)assert.ok(!train.has(row.text.normalize("NFKC").trim().toLowerCase()));
 assert.equal(new Set(PENTERACT_PROJECTOR_TRAIN.map(x=>x.text)).size,144);
});
test("Learned 5D feature map is deterministic, normalized, bounded and genuinely five-dimensional",()=>{
 const f=fiveSpaceFeatures("臨床 Python 分析 CSV 風險資料");
 const other=fiveSpaceFeatures("請設計網站視覺");
 assert.equal(f.length,LEARNED_5D_FEATURES);
 assert.deepEqual(f,fiveSpaceFeatures("臨床 Python 分析 CSV 風險資料"));
 assert.ok(Math.abs(Math.hypot(...f)-1)<1e-10);
 assert.notDeepEqual(f,other);
 assert.equal(LEARNED_5D_IDS.length,6);
 assert.deepEqual(fiveSpaceFeatures(""),new Float64Array(LEARNED_5D_FEATURES));
 assert.deepEqual(fiveSpaceFeatures("abc".repeat(100)),fiveSpaceFeatures("abc".repeat(200)));
 assert.throws(()=>fiveSpaceFeatures(null),/INVALID/);
});
test("True CPU gradient descent updates 1925 distinct parameters and reduces training loss",()=>{
 const initial=initializeFiveProjector();
 const a=trainFiveProjector({epochs:25}),b=trainFiveProjector({epochs:25});
 assert.ok(a.trainLoss<a.startLoss);
 assert.equal(JSON.stringify(a.artifact),JSON.stringify(b.artifact));
 assert.equal(a.artifact.weights.length,5);
 assert.equal(a.artifact.weights[0].length,384);
 assert.notDeepEqual(a.artifact.weights,initial.weights);
 assert.equal(a.artifact.bias.length,5);
 assert.equal(a.artifact.provenance.trainCount,144);
 assert.equal(a.artifact.provenance.evalCount,68);
 assert.equal(a.artifact.provenance.expertReviewed,false);
 assert.equal(assertLearnedFiveWeights(a.artifact),a.artifact);
 const state=forwardLearnedFive(fiveSpaceFeatures("金融貸款股息現金流"),a.artifact);
 assert.equal(state.coordinate.length,5);
 assert.ok(state.coordinate.every(x=>Number.isFinite(x)&&Math.abs(x)<=1));
 assert.equal(state.probabilities.length,6);
 assert.ok(Math.abs(state.probabilities.reduce((x,y)=>x+y,0)-1)<1e-12);
 assert.equal(routeLearnedFive("",a.artifact).status,"abstain");
 assert.equal(routeLearnedFive("分析股票營收並輸出統計圖表",a.artifact).reason,"multi-domain");
});
test("Only correctly shaped, finite, synthetic-provenance adapter is accepted",()=>{
 const {artifact}=trainFiveProjector({epochs:3});
 const mutation=JSON.parse(JSON.stringify(artifact));
 mutation.weights[0][13]=Infinity;
 assert.throws(()=>assertLearnedFiveWeights(mutation),/INVALID/);
 const extra=JSON.parse(JSON.stringify(artifact));
 extra.shellCommand="curl secrets";
 assert.throws(()=>assertLearnedFiveWeights(extra),/INVALID/);
 const forged=JSON.parse(JSON.stringify(artifact));
 forged.provenance.expertReviewed=true;
 assert.throws(()=>assertLearnedFiveWeights(forged),/PROVENANCE/);
 const wrong=JSON.parse(JSON.stringify(artifact));
 wrong.expertIds.reverse();
 assert.throws(()=>assertLearnedFiveWeights(wrong),/INVALID/);
});
test("Paired evaluation is synthetic-only, includes abstentions, and always rejects automatic rollout",()=>{
 const {artifact}=trainFiveProjector({epochs:25});
 const report=compareProjector(artifact);
 assert.equal(report.known,48);
 assert.equal(report.unknown,20);
 assert.equal(report.trainedParameters,1925);
 assert.equal(report.weightsTrained,true);
 assert.equal(report.qwenWeightsTrained,false);
 assert.equal(report.modelInvoked,false);
 assert.equal(report.deploymentEligible,false);
 assert.ok(report.deploymentBlockers.length>=3);
 for(const key of ["modelRawTop1OnKnown","modelShadowCorrectOnKnown","lexicalShadowCorrectOnKnown",
  "modelUnknownAbstainRate","lexicalUnknownAbstainRate"]){
  assert.ok(report[key]>=0&&report[key]<=1,key);
 }
 assert.doesNotMatch(JSON.stringify(report),/passw(or)?d|rawQuestion|chatHistory|apiKey/i);
});
test("Understanding-first 5D specialist never guesses on unknown, mixed or conflicting evidence",()=>{
 const {artifact}=trainFiveProjector({epochs:25});
 for(const text of ["你好","謝謝","繼續","我不確定","我們再討論一下","請幫我看一下"]){
  assert.deepEqual(detectLearnedFiveEvidence(text),[],text);
  const result=routeLearnedFive(text,artifact);
  assert.equal(result.status,"abstain",text);
  assert.equal(result.reason,"no-domain-evidence",text);
 }
 for(const text of ["先分析投資後做 UI 設計","查核文獻後算 CSV 的平均值",
  "請修復 Python 程式並修改網站配色","先讀學術資料再做平均數計算",
  "找法律來源並起草正式報告"]){
  assert.ok(detectLearnedFiveEvidence(text).length>=2,text);
  const result=routeLearnedFive(text,artifact);
  assert.equal(result.status,"abstain",text);
  assert.equal(result.reason,"multi-domain",text);
 }
 const report=compareProjector(artifact);
 assert.equal(report.modelUnknownFalseNominations,0);
 assert.equal(report.modelUnknownAbstainRate,1);
 assert.equal(report.syntheticSafetyVsLexical.didNotIncreaseUnknownNominations,true);
 assert.equal(report.syntheticSafetyVsLexical.diagnosticPass,true);
 assert.equal(report.deploymentEligible,false);
});

test("Trainable shadow is pure CPU only and never imports tool authority or remote inference",()=>{
 for(const path of ["../src/detroit/penteract-learned.ts","../training/october/train-penteract-projector.mjs"]){
  const code=readFileSync(new URL(path,import.meta.url),"utf8");
  assert.doesNotMatch(code,/fetch\(|createServer|navigator\.gpu|localStorage|sessionStorage|execSync|spawnSync/);
  assert.doesNotMatch(code,/import .*diana|import .*slime|import .*ceres|import .*weiguo/i);
 }
});
