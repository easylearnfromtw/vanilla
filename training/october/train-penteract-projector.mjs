/** October R5 geometric projector CPU optimizer (real gradient descent).
 *
 * Trains ONLY five-dimensional sparse routing projection weights (5x384+bias),
 * never the Qwen language model. GPT-authored synthetic examples only.
 * Pre-declared train/eval split; the held-out set is used for final reporting
 * but NEVER for learning rate, stop condition, threshold or weight selection.
 * No network, API tokens, device access, cloud jobs or private messages.
 */
import {createHash} from "node:crypto";
import {writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {FIVE_SIMPLEX} from "../../src/detroit/penteract-5d.ts";
import {shadowPenteractRoute} from "../../src/detroit/penteract-shadow.ts";
import {
 LEARNED_5D_FEATURES,LEARNED_5D_IDS,LEARNED_5D_SCALE,
 fiveSpaceFeatures,forwardLearnedFive,routeLearnedFive,assertLearnedFiveWeights
} from "../../src/detroit/penteract-learned.ts";
import {
 PENTERACT_PROJECTOR_TRAIN,PENTERACT_PROJECTOR_EVAL,validatePenteractProjectorCurriculum
} from "./penteract-projector-curriculum.mjs";

export const PROJECTOR_TRAIN_SEED=20261021;
export const PROJECTOR_EPOCHS=160;
const hash=rows=>createHash("sha256").update(rows.map(row=>[row.id,row.text,row.expected].join("\t")).join("\n")).digest("hex");
function randomGenerator(seed){
 let n=seed>>>0;
 return ()=>{
  n^=n<<13;n^=n>>>17;n^=n<<5;
  return (n>>>0)/4294967296;
 };
}
export function initializeFiveProjector(seed=PROJECTOR_TRAIN_SEED){
 const rand=randomGenerator(seed);
 return {
  weights:Array.from({length:5},()=>Array.from({length:LEARNED_5D_FEATURES},()=>Number(((rand()-.5)*.04).toFixed(8)))),
  bias:Array(5).fill(0)
 };
}
function sampleLoss(features,labelIndex,model){
 const state=forwardLearnedFive(features,model);
 return -Math.log(Math.max(1e-14,state.probabilities[labelIndex]));
}
export function trainFiveProjector({epochs=PROJECTOR_EPOCHS,seed=PROJECTOR_TRAIN_SEED}={}){
 const data=validatePenteractProjectorCurriculum();
 if(!Number.isInteger(epochs)||epochs<1||epochs>500||
  !Number.isSafeInteger(seed)||seed<1)throw Error("INVALID_PROJECTOR_TRAINING_PARAMS");
 // Internal 120/24 stratified train/calibration. This calibration split is
 // carved EXCLUSIVELY from the 144 TRAIN samples; the 68 final evaluation
 // samples remain untouched by parameter or epoch selection.
 const allSamples=PENTERACT_PROJECTOR_TRAIN.map(row=>({
  input:fiveSpaceFeatures(row.text),label:LEARNED_5D_IDS.indexOf(row.expected)
 }));
 const fitSamples=allSamples.filter((_,i)=>i%6!==5);
 const calibrationSamples=allSamples.filter((_,i)=>i%6===5);
 if(fitSamples.length!==120||calibrationSamples.length!==24)throw Error("CALIBRATION_SPLIT_CHANGED");
 const initial=initializeFiveProjector(seed);
 const startLoss=allSamples.reduce((sum,row)=>sum+sampleLoss(row.input,row.label,initial),0)/allSamples.length;
 const runEpoch=(model,samples,order,rand,epoch,totalEpochs)=>{
  for(let i=order.length-1;i>0;i--){
   const j=Math.floor(rand()*(i+1));
   [order[i],order[j]]=[order[j],order[i]];
  }
  // The schedule is fixed before any evaluation: no meta-optimization on eval.
  const rate=.1*(1-.7*epoch/totalEpochs);
  for(const index of order){
   const item=samples[index];
   const {coordinate,probabilities}=forwardLearnedFive(item.input,model);
   for(let axis=0;axis<5;axis++){
    let derivative=0;
    for(let cls=0;cls<LEARNED_5D_IDS.length;cls++){
     derivative+=(probabilities[cls]-(cls===item.label?1:0))*FIVE_SIMPLEX[cls][axis];
    }
    const delta=2*LEARNED_5D_SCALE*derivative*(1-coordinate[axis]*coordinate[axis]);
    const weights=model.weights[axis];
    for(let j=0;j<LEARNED_5D_FEATURES;j++){
     weights[j]-=rate*(delta*item.input[j]+.00015*weights[j]);
    }
    model.bias[axis]-=rate*delta;
   }
  }
 };
 const validation=initializeFiveProjector(seed);
 const calOrder=fitSamples.map((_,i)=>i);
 const calRng=randomGenerator(seed^0x9e3779b9);
 let bestEpoch=1,bestCalLoss=Infinity;
 for(let epoch=0;epoch<epochs;epoch++){
  runEpoch(validation,fitSamples,calOrder,calRng,epoch,epochs);
  const calLoss=calibrationSamples.reduce((sum,row)=>
   sum+sampleLoss(row.input,row.label,validation),0)/calibrationSamples.length;
  if(Number.isFinite(calLoss)&&calLoss<bestCalLoss-1e-6){
   bestCalLoss=calLoss;
   bestEpoch=epoch+1;
  }
 }
 if(!Number.isFinite(bestCalLoss))throw Error("CALIBRATION_LOSS_NONFINITE");
 // Retrain selected epochs on the ORIGINAL 144 TRAIN examples. This step
 // never sees the final 48+20 eval cases and never changes release thresholds.
 const model=initializeFiveProjector(seed);
 const order=allSamples.map((_,i)=>i),rng=randomGenerator(seed^0x9e3779b9);
 for(let epoch=0;epoch<bestEpoch;epoch++){
  runEpoch(model,allSamples,order,rng,epoch,epochs);
 }
 const trainLoss=allSamples.reduce((sum,row)=>sum+sampleLoss(row.input,row.label,model),0)/allSamples.length;
 if(!Number.isFinite(trainLoss)||!Number.isFinite(startLoss)||trainLoss>=startLoss)
  throw Error("PROJECTOR_TRAINING_DID_NOT_REDUCE_LOSS");
 const artifact={
  architecture:"october-linear-five-space-v1",
  inputFeatures:LEARNED_5D_FEATURES,outputDimensions:5,expertIds:[...LEARNED_5D_IDS],
  weights:model.weights,bias:model.bias,
  provenance:{
   trainCount:data.train,trainSha256:hash(PENTERACT_PROJECTOR_TRAIN),
   evalCount:data.eval,expertReviewed:false,
   trainedOn:"GPT-authored-synthetic",epochs:bestEpoch,seed
  }
 };
 assertLearnedFiveWeights(artifact);
 return {artifact,startLoss,trainLoss,calibration:{selectedEpochs:bestEpoch,maxEpochs:epochs,fitCases:fitSamples.length,calibrationCases:calibrationSamples.length,bestCalibrationLoss:bestCalLoss,criterion:"train-only stratified cross-entropy; NO eval-based selection"}};
}
/** Compare like-for-like 6-class intent IDs vs prior heuristic 5D shadow.
 * Existing Diana routes tool permissions, NOT six expert domains; direct
 * numeric "Diana vs experts" accuracy would be misleading and is excluded.
 */
export function compareProjector(artifact,examples=PENTERACT_PROJECTOR_EVAL){
 assertLearnedFiveWeights(artifact);
 let known=0,learnedTopCorrect=0,learnedCorrect=0,learnedAnswered=0;
 let lexicalCorrect=0,lexicalAnswered=0,unknown=0,unknownRejected=0;
 let lexicalUnknownRejected=0,unknownFalseNomination=0;
 const groups={};
 for(const row of examples){
  if(!row||typeof row.text!=="string"||
   row.expected!==null&&!LEARNED_5D_IDS.includes(row.expected))throw Error("INVALID_PROJECTOR_EVAL_CASE");
  const learned=routeLearnedFive(row.text,artifact);
  const baseline=shadowPenteractRoute(row.text);
  const features=fiveSpaceFeatures(row.text);
  const probabilities=forwardLearnedFive(features,artifact).probabilities;
  const raw=LEARNED_5D_IDS[probabilities.indexOf(Math.max(...probabilities))];
  if(row.expected===null){
   unknown++;
   if(learned.status==="abstain")unknownRejected++;
   else unknownFalseNomination++;
   if(baseline.status==="abstain")lexicalUnknownRejected++;
  }else{
   known++;
   if(raw===row.expected)learnedTopCorrect++;
   if(learned.status==="candidate")learnedAnswered++;
   if(learned.candidateId===row.expected)learnedCorrect++;
   if(baseline.status==="candidate")lexicalAnswered++;
   if(baseline.candidateId===row.expected)lexicalCorrect++;
   const g=groups[row.expected]??{total:0,learnedCorrect:0,lexicalCorrect:0,learnedAbstain:0};
   g.total++;
   if(learned.candidateId===row.expected)g.learnedCorrect++;
   if(baseline.candidateId===row.expected)g.lexicalCorrect++;
   if(learned.status==="abstain")g.learnedAbstain++;
   groups[row.expected]=g;
  }
 }
 const ratio=(a,b)=>b?Number((a/b).toFixed(4)):null;
 const report={
  suite:"October REAL CPU-trained R5 projection — SYNTHETIC held-out v1",
  split:"144 training / 48 held-out single-domain / 20 held-out unknown-or-mixed",
  author:"GPT-authored synthetic (NOT independently human adjudicated)",
  trainSha256:artifact.provenance.trainSha256,
  trainedParameters:5*LEARNED_5D_FEATURES+5,
  weightsTrained:true,qwenWeightsTrained:false,modelInvoked:false,
  dianaToolChoiceNotComparableToSixExpertIntents:true,
  known,unknown,
  modelRawTop1OnKnown:ratio(learnedTopCorrect,known),
  modelShadowCorrectOnKnown:ratio(learnedCorrect,known),
  modelShadowCoverageOnKnown:ratio(learnedAnswered,known),
  lexicalShadowCorrectOnKnown:ratio(lexicalCorrect,known),
  lexicalShadowCoverageOnKnown:ratio(lexicalAnswered,known),
  modelUnknownAbstainRate:ratio(unknownRejected,unknown),
  modelUnknownFalseNominations:unknownFalseNomination,
  lexicalUnknownAbstainRate:ratio(lexicalUnknownRejected,unknown),
  groups,
  privacy:"no user questions/answers stored; all training examples are authored synthetic"
 };
 // A learned router must NEVER gain coverage by sacrificing safe abstention.
 // These are diagnostic synthetic checks, not permission to ship.
 report.syntheticSafetyVsLexical={
  didNotIncreaseUnknownNominations:unknownRejected>=lexicalUnknownRejected,
  didNotReduceKnownCorrectness:learnedCorrect>=lexicalCorrect,
  unsafeExtraNominations:Math.max(0,unknownFalseNomination-(unknown-lexicalUnknownRejected)),
  diagnosticPass:unknownRejected>=lexicalUnknownRejected&&learnedCorrect>=lexicalCorrect
 };
 // Strict no-deploy gate. A synthetic fixture alone can never establish the
 // real-world understanding and safety evidence required for production.
 report.deploymentEligible=false;
 report.deploymentBlockers=[
  ...(!report.syntheticSafetyVsLexical.diagnosticPass?["synthetic safety regression against existing lexical 5D shadow"] :[]),
  "real independently adjudicated holdout absent",
  "no paired Diana tool-execution benchmark on consented tasks",
  "latency/energy not measured on user GPU",
  "Qwen model weights and 5D semantic alignment not trained"
 ];
 return report;
}
function main(){
 const args=process.argv.slice(2);
 let output="training/october/generated/october-five-projector-weights.json";
 let reportOutput="training/october/generated/october-five-projector-report.json";
 for(let i=0;i<args.length;i++){
  if(args[i]==="--output"&&args[i+1])output=args[++i];
  else if(args[i]==="--report"&&args[i+1])reportOutput=args[++i];
  else throw Error("Unsupported parameter "+args[i]);
 }
 // This command is opt-in and may write only project-local generated artifacts.
 for(const file of [output,reportOutput]){
  const abs=resolve(file),base=resolve("training/october/generated");
  if(!abs.startsWith(base+"/")||!abs.endsWith(".json"))throw Error("INVALID_REPORT_PATH");
 }
 const checked=validatePenteractProjectorCurriculum();
 const {artifact,startLoss,trainLoss,calibration}=trainFiveProjector();
 const report={...compareProjector(artifact),startLoss:Number(startLoss.toFixed(6)),
  finalTrainingLoss:Number(trainLoss.toFixed(6)),trainingExamples:checked.train,
  heldoutExamples:checked.eval,calibration};
 for(const [path,value] of [[output,artifact],[reportOutput,report]]){
  mkdirSync(dirname(resolve(path)),{recursive:true});
  writeFileSync(path,JSON.stringify(value,null,2)+"\n");
 }
 console.log(JSON.stringify(report));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
