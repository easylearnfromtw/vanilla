import test from "node:test";
import assert from "node:assert/strict";
import {PROFESSIONS,FAULTS,POLICIES,MAX_STEPS,fixture,initialState,transition,simulate,runProfessionalLab} from "../scripts/october-professional-150k.mjs";

test("150 professional templates span 15 domains and hold out two templates per domain",()=>{
 assert.equal(PROFESSIONS.length,15);
 assert.equal(new Set(PROFESSIONS.map(x=>x.id)).size,15);
 for(const p of PROFESSIONS){assert.equal(p.tasks.length,10);assert.equal(p.steps.length,5);assert.equal(new Set(p.steps).size,5);}
 let heldout=0;const taskNames=new Set();
 for(let i=0;i<150;i++){const c=fixture(i,0);taskNames.add(c.profession+"|"+c.task);if(c.heldout)heldout++;}
 assert.equal(heldout,30);assert.equal(taskNames.size,150);
});
test("professional workflow enforces order, recovery and virtual security",()=>{
 const c={...fixture(0,5),fault:"permission",policy:"reference"};
 let s=initialState(c);
 s=transition(c,s,"finalize");
 assert.equal(s.completed,false);
 assert.equal(s.blocked,1);
 s=transition(c,s,c.steps[0]);
 s=transition(c,s,c.steps[1]);
 s=transition(c,s,c.steps[2]);
 assert.equal(s.pending,"permission");
 s=transition(c,s,c.steps[2]); // cannot bypass simulated 403
 assert.equal(s.stage,2);
 s=transition(c,s,"request_approval");
 assert.equal(s.pending,null);
 s=transition(c,s,c.steps[2]);
 for(const action of [c.steps[3],c.steps[4],"finalize"])s=transition(c,s,action);
 assert.equal(s.completed,true);
 const after=transition(c,s,"write_production_api");
 assert.equal(after.trace.length,s.trace.length);
});
test("untrusted fake system directives are a virtual fault, not authority",()=>{
 const c={...fixture(135,30),fault:"prompt_injection",policy:"fault_adaptive"};
 const result=simulate(c);
 assert.equal(result.pass,true);
 assert.equal(result.safe,true);
 assert.equal(result.faultEvents,1);
});
test("150000 unique bounded trials execute with 120k/30k clean split",()=>{
 const ids=new Set();
 const {summary:s,candidates}=runProfessionalLab({onRow:r=>{
  assert.ok(r.steps<=MAX_STEPS);
  if(ids.has(r.id))throw Error("duplicate "+r.id);
  ids.add(r.id);
  assert.ok(r.score>=0&&r.score<=100);
 }});
 assert.equal(s.total,150000);
 assert.equal(ids.size,150000);
 assert.equal(s.passed+s.failed,150000);
 assert.equal(s.professionalDomains,15);
 assert.equal(s.uniqueTemplates,150);
 assert.equal(s.bySplit.training.sessions,120000);
 assert.equal(s.bySplit.heldout.sessions,30000);
 for(const [domain,counts] of Object.entries(s.byProfession))assert.equal(counts.sessions,10000,domain);
 for(const [policy,counts] of Object.entries(s.byPolicy))assert.equal(counts.sessions,30000,policy);
 assert.equal(s.unsafePasses,0);
 assert.equal(s.modelInferenceCalls,0);
 assert.equal(s.gradientUpdates,0);
 assert.equal(s.modelWeightsChanged,false);
 assert.equal(s.adapterTrained,false);
 assert.equal(s.reviewedTrainingRows,0);
 assert.equal(s.unreviewedCandidateRows,720);
 assert.equal(candidates.length,720);
 assert.equal(new Set(candidates.map(x=>x.id)).size,720);
 assert.ok(candidates.every(x=>x.source==="synthetic-sandbox"&&!x.reviewed&&!x.consent&&!x.holdout&&!x.eligibleForTraining));
 assert.ok(candidates.every(x=>x.templateId&&Number(x.templateId.slice(4))%10!==9&&Number(x.templateId.slice(4))%10!==0));
 console.log("OCTOBER_150K_ASSERTIONS",JSON.stringify({sessions:s.total,passed:s.passed,failed:s.failed,unsafePasses:s.unsafePasses,candidates:candidates.length}));
});
