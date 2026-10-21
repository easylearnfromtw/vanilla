/** Read-only CPU latency diagnostic for October's R5 shadow router.
 *
 * Measures the SAME text inputs through the existing lexical 5D router
 * and the genuinely trained CPU R5 projection, alternating call order.
 * Provider: local Node.js hrtime; not Ollama/Slime/model inference tokens,
 * GPU usage, estimated FLOPs, battery draw, or electrical joules.
 * No input strings in output, disk cache, telemetry, model download or network.
 */
import {performance} from "node:perf_hooks";
import {writeFileSync,mkdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {assertLearnedFiveWeights,routeLearnedFive} from "../../src/detroit/penteract-learned.ts";
import {shadowPenteractRoute} from "../../src/detroit/penteract-shadow.ts";
import {PENTERACT_PROJECTOR_EVAL} from "./penteract-projector-curriculum.mjs";
import {trainFiveProjector} from "./train-penteract-projector.mjs";

const DEFAULT_REPEATS=30;
export function penteractQuantile(values,probability){
 if(!Array.isArray(values)||values.length===0||values.some(x=>!Number.isFinite(x)||x<0)||
  !Number.isFinite(probability)||probability<0||probability>1)throw Error("INVALID_PENTERACT_QUANTILE");
 const sorted=[...values].sort((a,b)=>a-b);
 const rank=(sorted.length-1)*probability;
 const lower=Math.floor(rank),upper=Math.ceil(rank),weight=rank-lower;
 return sorted[lower]*(1-weight)+sorted[upper]*weight;
}
function summarize(times){
 return {samples:times.length,
  p50Ms:Number(penteractQuantile(times,.5).toFixed(5)),
  p95Ms:Number(penteractQuantile(times,.95).toFixed(5)),
  p99Ms:Number(penteractQuantile(times,.99).toFixed(5)),
  meanMs:Number((times.reduce((a,b)=>a+b,0)/times.length).toFixed(5))};
}
/** Input samples may only come from fixed synthetic project curriculum.
 * Avoid displaying any user prompt, partial payload or model response.
 */
export function benchmarkFiveProjectorCpu(weights,{repeats=DEFAULT_REPEATS,now=()=>performance.now()}={}){
 assertLearnedFiveWeights(weights);
 if(!Number.isInteger(repeats)||repeats<2||repeats>100||typeof now!=="function")
  throw Error("INVALID_PENTERACT_BENCHMARK_PARAMS");
 const text=PENTERACT_PROJECTOR_EVAL.map(x=>x.text);
 const elapsed={lexical:[],learned:[]};
 const invoke={
  lexical:question=>shadowPenteractRoute(question),
  learned:question=>routeLearnedFive(question,weights)
 };
 // Warm up each implementation and V8 code paths before timing.
 for(let round=0;round<3;round++)for(const question of text){
  invoke.lexical(question);invoke.learned(question);
 }
 // Each task gets the same question in both orders. No parallel GC pressure.
 for(let round=0;round<repeats;round++){
  for(const question of text){
   const names=round%2===0?["lexical","learned"]:["learned","lexical"];
   for(const name of names){
    const start=now();
    invoke[name](question);
    const end=now();
    const dt=end-start;
    if(!Number.isFinite(dt)||dt<0)throw Error("INVALID_BENCHMARK_CLOCK");
    elapsed[name].push(dt);
   }
  }
 }
 const lexical=summarize(elapsed.lexical),learned=summarize(elapsed.learned);
 return {
  suite:"October five-dimensional LOCAL CPU shadow latency v1",
  cases:text.length,repeatsPerCase:repeats,warmupRounds:3,
  samplesPerImplementation:text.length*repeats,
  source:"node:perf_hooks performance.now",
  schedule:"same 68 GPT-authored synthetic texts, alternating call order",
  baseline:"deterministic lexical 5D shadow",
  experimental:"CPU-trained 1925-weight R5 shadow",
  baselineCpuMs:lexical,experimentalCpuMs:learned,
  experimentalOverBaselineP95Ratio:lexical.p95Ms>0?
   Number((learned.p95Ms/lexical.p95Ms).toFixed(3)):null,
  claims:{
   qwenLanguageWeightsTrained:false,
   ollamaOrGpuInferenceMeasured:false,
   electricalPowerOrJoulesMeasured:false,
   inferenceCorrectnessMeasured:false,
   mayAutodeploy:false
  },
  privacy:"no user questions, text, embeddings, model responses or network results persisted",
  caution:"Runner latency varies with CPU scheduling and V8 warmup. No production performance claim."
 };
}
function main(){
 const args=process.argv.slice(2);
 if(args.length!==0&&(args.length!==2||args[0]!=="--output"))throw Error("USAGE: benchmark-penteract-cpu.mjs [--output generated/report.json]");
 const output=args.length===2?args[1]:"";
 if(output){
  const dest=resolve(output),dir=resolve("training/october/generated");
  if(!dest.startsWith(dir+"/")||!dest.endsWith(".json"))throw Error("INVALID_BENCHMARK_OUTPUT_PATH");
 }
 const {artifact}=trainFiveProjector();
 const report=benchmarkFiveProjectorCpu(artifact);
 if(output){mkdirSync(dirname(resolve(output)),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+"\n");}
 console.log(JSON.stringify(report));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
