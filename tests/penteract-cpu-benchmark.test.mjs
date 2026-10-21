import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {trainFiveProjector} from "../training/october/train-penteract-projector.mjs";
import {PENTERACT_PROJECTOR_EVAL} from "../training/october/penteract-projector-curriculum.mjs";
import {penteractQuantile,benchmarkFiveProjectorCpu} from "../training/october/benchmark-penteract-cpu.mjs";

test("CPU performance quantile is interpolated from valid finite samples",()=>{
 assert.equal(penteractQuantile([10,20,30,40],0),10);
 assert.equal(penteractQuantile([10,20,30,40],1),40);
 assert.equal(penteractQuantile([10,20,30,40],.5),25);
 assert.equal(penteractQuantile([1,2,3,4,5],.95),4.8);
 for(const [v,p] of [[[],.5],[[1,NaN],.5],[[1,-1],.5],[[1],Infinity],[[1],1.1]]){
  assert.throws(()=>penteractQuantile(v,p),/INVALID_PENTERACT_QUANTILE/);
 }
});
test("Paired timings report bounded p50/p95 and no user questions or energy claims",()=>{
 const {artifact}=trainFiveProjector({epochs:8});
 let time=0;
 const result=benchmarkFiveProjectorCpu(artifact,{repeats:2,now:()=>++time});
 assert.equal(result.cases,PENTERACT_PROJECTOR_EVAL.length);
 assert.equal(result.cases,68);
 assert.equal(result.samplesPerImplementation,136);
 for(const key of ["baselineCpuMs","experimentalCpuMs"]){
  assert.equal(result[key].samples,136);
  assert.equal(result[key].p50Ms,1);
  assert.equal(result[key].p95Ms,1);
  assert.equal(result[key].p99Ms,1);
 }
 assert.equal(result.experimentalOverBaselineP95Ratio,1);
 assert.equal(result.claims.mayAutodeploy,false);
 assert.equal(result.claims.electricalPowerOrJoulesMeasured,false);
 assert.equal(result.claims.qwenLanguageWeightsTrained,false);
 const report=JSON.stringify(result);
 assert.ok(!report.includes(PENTERACT_PROJECTOR_EVAL[0].text));
 assert.ok(!report.includes(PENTERACT_PROJECTOR_EVAL.at(-1).text));
 assert.doesNotMatch(report,/rawPrompt|promptText|apiKey|bearer/i);
});
test("Bad clocks and unbounded repetitions fail closed",()=>{
 const {artifact}=trainFiveProjector({epochs:1});
 for(const repeats of [0,1,-1,101,Infinity,2.1,"5"]){
  assert.throws(()=>benchmarkFiveProjectorCpu(artifact,{repeats}),/INVALID_PENTERACT_BENCHMARK_PARAMS/);
 }
 let tick=0;
 assert.throws(()=>benchmarkFiveProjectorCpu(artifact,{repeats:2,now:()=>--tick}),/INVALID_BENCHMARK_CLOCK/);
});
test("Benchmark never uses system telemetry, third-party services or arbitrary commands",()=>{
 const source=readFileSync(new URL("../training/october/benchmark-penteract-cpu.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(source,/fetch\(|child_process|spawn\(|execSync|navigator\.gpu|nvidia-smi|localStorage|sessionStorage/);
 assert.match(source,/alternating call order/);
 assert.match(source,/performance\.now/);
});
