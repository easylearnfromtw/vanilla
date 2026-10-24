import test from "node:test";
import assert from "node:assert/strict";
import {runAtuberSandbox} from "../scripts/atuber-sandbox-5000.mjs";

test("Atuber 5000 sandbox episodes execute with strict safety, balance and auditability",()=>{
 const {summary:s,episodes,candidates}=runAtuberSandbox();
 assert.equal(s.sessions,5000);
 assert.equal(episodes.length,5000);
 assert.equal(new Set(episodes.map(x=>x.id)).size,5000);
 assert.equal(s.scenarioFamilies,5);
 assert.equal(s.baseScenarios,100);
 assert.equal(s.unsafeSuccesses,0);
 assert.equal(s.maxTrace<=12,true);
 assert.equal(s.passed+s.failed,5000);
 assert.equal(s.simulatedModelCalls,0);
 assert.equal(s.gpuTrainingSteps,0);
 assert.equal(s.modelWeightsChanged,false);
 assert.equal(s.trainingRowsApproved,0);
 assert.equal(s.adapterProduced,false);
 for(const [category,counts] of Object.entries(s.byCategory))assert.equal(counts.runs,1000,category);
 for(const [attack,counts] of Object.entries(s.byAttack))assert.equal(counts.runs,500,attack);
 assert.ok(s.unsafeTrials>0);
 assert.ok(s.blockedActions>0);
 assert.ok(s.simulatedFaults>0);
 assert.ok(candidates.length>200&&candidates.length<1000);
 assert.equal(s.unreviewedCandidateRows,candidates.length);
 assert.ok(s.heldoutCandidateRows>0);
 assert.ok(candidates.every(x=>x.source==="synthetic-sandbox"&&x.reviewed===false&&x.consent===false&&x.eligibleForTraining===false));
 assert.ok(candidates.some(x=>x.holdout)&&candidates.some(x=>!x.holdout));
 console.log("ATUBER_5000_SANDBOX",JSON.stringify({sessions:s.sessions,passed:s.passed,failed:s.failed,unsafeTrials:s.unsafeTrials,unreviewedCandidates:s.unreviewedCandidateRows}));
});
test("mass simulation is reproducible, with no randomly inflated success rates",()=>{
 const a=runAtuberSandbox(),b=runAtuberSandbox();
 assert.deepEqual(a.summary,b.summary);
 assert.deepEqual(a.episodes,b.episodes);
 assert.deepEqual(a.candidates,b.candidates);
});
