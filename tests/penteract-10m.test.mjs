import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {trainFiveD,TRAIN_ROWS,EVAL_ROWS,SEALED_TEST_ROWS,FULL_UPDATES} from "../scripts/train-penteract-10m.mjs";
import {verifySyntheticFiveDBundle} from "../src/detroit/penteract-sandbox-receipt.ts";
import {assertLearnedFiveWeights,routeLearnedFive} from "../src/detroit/penteract-learned.ts";
import {activateAtuberFiveDSandbox,clearAtuberFiveDSandbox,atuberFiveDSandboxActive} from "../src/detroit/atuber-5d-sandbox-bridge.ts";
import {planAtuberReadOnly} from "../src/detroit/atuber-tool-plan.ts";
import {executeAtuberReadOnly} from "../src/detroit/atuber-tool-coordinator.ts";

test("5D 10M pipeline is actual bounded CPU SGD, not a made-up training counter",()=>{
 assert.equal(FULL_UPDATES,10000000);
 assert.equal(TRAIN_ROWS,20000);
 assert.equal(EVAL_ROWS,240);
 assert.equal(SEALED_TEST_ROWS,300);
 assert.throws(()=>trainFiveD({updates:1}),/UPDATES_REQUIRE/);
 assert.throws(()=>trainFiveD({updates:10000001}),/UPDATES_REQUIRE/);
 const {report,artifact}=trainFiveD({updates:TRAIN_ROWS});
 assert.equal(report.actualWeightUpdates,TRAIN_ROWS);
 assert.equal(report.trainableParameters,1925);
 assert.equal(report.outputDimensions,5);
 assert.equal(report.expertCount,6);
 assert.ok(report.syntheticHoldoutFinalLoss<report.syntheticHoldoutInitialLoss);
 assert.equal(report.syntheticHoldoutOnly,true);
 assert.equal(report.cudaUsed,false);
 assert.equal(report.atuber0_6BWeightsUpdated,false);
 assert.equal(report.productionRouterModified,false);
 assert.equal(artifact.provenance.trainCount,20000);
 assert.equal(artifact.provenance.evalCount,240);
 assert.equal(artifact.provenance.epochs,1);
 assert.equal(report.bestCheckpointStep,TRAIN_ROWS);
 assert.equal(report.exportedWeightsCheckpointStep,TRAIN_ROWS);
 assert.equal(report.sealedSyntheticTestRows,SEALED_TEST_ROWS);
 assert.equal(report.sealedSyntheticTestNotUsedForCheckpointSelection,true);
 assert.ok(report.syntheticValidationSelectedLoss<=report.syntheticValidationLastLoss);
 assert.equal(report.syntheticValidationSelectedLoss,report.syntheticHoldoutFinalLoss);
 assert.equal(report.additionalUpdatesAfterBest,0);
 assert.match(report.artifactSha256,/^[0-9a-f]{64}$/);
 assert.equal(artifact.provenance.expertReviewed,false);
 assert.doesNotThrow(()=>assertLearnedFiveWeights(artifact));
 const result=routeLearnedFive("修復 Python API 程式錯誤",artifact);
 assert.equal(result.policy,"advisory-only");
});

test("Atuber and Detroit only use manually opted-in learned 5D weights in explicit read-only plans",async()=>{
 clearAtuberFiveDSandbox();
 const plan=planAtuberReadOnly("阿土伯：五維分析 幫我修復 Python API");
 assert.equal(plan?.capability,"five-d-shadow");
 const before=await executeAtuberReadOnly(plan,{privateMode:true});
 assert.match(before.evidence,/learnedShadow/);
 assert.match(before.evidence,/null/);
 const {artifact}=trainFiveD({updates:TRAIN_ROWS});
 activateAtuberFiveDSandbox(artifact);
 assert.equal(atuberFiveDSandboxActive(),true);
 const after=await executeAtuberReadOnly(plan,{privateMode:true});
 assert.match(after.evidence,/training/);
 assert.match(after.evidence,/synthetic-sandbox-unreviewed/);
 assert.equal(after.grantedPermissions,false);
 assert.equal(after.networkUsed,false);
 assert.equal(after.modelInvoked,false);
 assert.equal(after.readOnly,true);
 assert.doesNotMatch(after.evidence,/幫我修復 Python API/);
 assert.throws(()=>activateAtuberFiveDSandbox({weights:[]}),/INVALID_LEARNED_WEIGHTS/);
 clearAtuberFiveDSandbox();
 assert.equal(atuberFiveDSandboxActive(),false);
 const gone=await executeAtuberReadOnly(plan,{privateMode:true});
 assert.match(gone.evidence,/learnedShadow/);
 assert.match(gone.evidence,/null/);
});

test("5D bridge rejects 20k smoke-test report as proof of 10M synthetic training",async()=>{
 const {report,artifact}=trainFiveD({updates:TRAIN_ROWS});
 assert.equal(report.actualWeightUpdates,20000);
 const raw=JSON.stringify(artifact)+"\\n";
 await assert.rejects(()=>verifySyntheticFiveDBundle(raw,report),/5D_TRAINING_REPORT_NOT_ACCEPTED/);
 await assert.rejects(()=>verifySyntheticFiveDBundle(raw,{...report,actualWeightUpdates:10000000}),/5D_TRAINING_REPORT_NOT_ACCEPTED/);
 await assert.rejects(()=>verifySyntheticFiveDBundle(raw,{...report,artifactSha256:"0".repeat(64)}),/5D_TRAINING_REPORT_NOT_ACCEPTED/);
});

test("5D training preview cannot quietly grant Detroit or Atuber tool permissions",()=>{
 const studio=readFileSync(new URL("../src/detroit/PenteractFunnelPanel.tsx",import.meta.url),"utf8");
 const bridge=readFileSync(new URL("../src/detroit/atuber-5d-sandbox-bridge.ts",import.meta.url),"utf8");
 assert.ok(studio.includes("verifySyntheticFiveDBundle"));
 assert.ok(studio.includes("disabled={!atuberBridgeEnabled&&!verifiedReceipt}"));
 assert.ok(studio.includes("clearAtuberFiveDSandbox();setAtuberBridgeEnabled(false)"));
 for(const forbidden of ["fetch(","localStorage","sessionStorage","eval("])
  assert.equal(bridge.includes(forbidden),false,forbidden);
});
