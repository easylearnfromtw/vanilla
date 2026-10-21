import test from "node:test";
import assert from "node:assert/strict";
import {assessTier,TIER_REQUIREMENTS} from "../scripts/atuber-runtime-preflight.mjs";

test("three tiers never claim live inference from inventory",()=>{
 assert.deepEqual(TIER_REQUIREMENTS.map(t=>t.alias),["october:sm","october:ml","october:lg"]);
 const info={ramGiB:64,freeDiskGiB:100,ollamaReachable:true,installedModels:TIER_REQUIREMENTS.map(t=>t.alias)};
 for(const t of TIER_REQUIREMENTS){
  const result=assessTier(t,info);
  assert.equal(result.installed,true);
  assert.equal(result.readyForInferenceCheck,true);
  assert.equal(result.inferenceVerified,false);
 }
});
test("a listed model on a disconnected host is NOT ready",()=>{
 const result=assessTier(TIER_REQUIREMENTS[0],{ramGiB:64,freeDiskGiB:100,
  installedModels:["october:sm"],ollamaReachable:false});
 assert.equal(result.readyForInferenceCheck,false);
 assert.match(result.note,/未就緒/);
});
test("low-memory or missing models remain blocked by the recommendation gate",()=>{
 const tooSmall={ramGiB:6,freeDiskGiB:7,installedModels:[],ollamaReachable:true};
 const result=assessTier(TIER_REQUIREMENTS[2],tooSmall);
 assert.equal(result.recommendedMemoryMet,false);
 assert.equal(result.downloadHeadroomMet,false);
 assert.equal(result.readyForInferenceCheck,false);
});
test("download disk headroom is waived for a locally installed model",()=>{
 const result=assessTier(TIER_REQUIREMENTS[0],{ramGiB:8,freeDiskGiB:0,
  installedModels:["october:sm"],ollamaReachable:true});
 assert.equal(result.downloadHeadroomMet,true);
 assert.equal(result.inferenceVerified,false);
});
