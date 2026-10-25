#!/usr/bin/env node
/**
 * Real, deterministic CPU SGD of Detroit's existing five-dimensional projector.
 * 384 hashed input features => 5 learned axes; 6 Penteract simplex experts.
 * Default: 20,000 synthetic train cases x 500 epochs = 10,000,000 weight updates.
 *
 * Synthetic labels are for a mechanics test ONLY. No Atuber/Qwen checkpoint,
 * CUDA, user conversations, private records, GPU payments or tool privileges.
 *
 * Run with Node >=22:
 * node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs scripts/train-penteract-10m.mjs --out-dir artifacts/penteract-10m
 */
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {performance} from "node:perf_hooks";
import {fiveSpaceFeatures,forwardLearnedFive,LEARNED_5D_FEATURES,LEARNED_5D_IDS,assertLearnedFiveWeights} from "../src/detroit/penteract-learned.ts";
import {FIVE_SIMPLEX} from "../src/detroit/penteract-5d.ts";

export const TRAIN_ROWS=20000;
export const EVAL_ROWS=240;
export const SEALED_TEST_ROWS=300;
export const FULL_UPDATES=10000000;
const SAMPLE_TERMS=[
 ["投資","股票","ETF","營收","現金流","股息","銀行","報酬"],
 ["來源","研究","證據","文獻","新聞","查核","期刊","法規"],
 ["程式","Python","TypeScript","API","GitHub","函式","編譯","部署"],
 ["設計","UI","UX","Figma","視覺","配色","版面","圖示"],
 ["文章","文件","郵件","文案","撰寫","講稿","改寫","摘要"],
 ["CSV","統計","數據","平均","中位數","標準差","表格","試算表"],
];
function sample(index,evalMode=false){
 const label=index%6;
 const n=Math.floor(index/6);
 const pool=SAMPLE_TERMS[label];
 // Test/holdout uses a different *sentence frame* and separate numeric IDs.
 const a=pool[(n*3+label)%8],b=pool[(n*5+2)%8];
 const c=pool[(n*7+4)%8];
 const text=evalMode
  ? "請針對"+a+"和"+c+"進行具體說明，提供這項"+b+"需求的注意事項，驗證序號 H"+n+"。"
  : "我需要"+a+"和"+b+"的協助，請以"+c+"的角度整理問題；範例 T"+n+"。";
 return {text,label};
}
/** Synthetic OUT-OF-TEMPLATE test set. Labels are never read while picking
 * the best checkpoint; neither this nor validation is human reviewed.
 */
function sealedTestSample(index){
 const label=index%6,n=Math.floor(index/6),pool=SAMPLE_TERMS[label];
 const a=pool[(n*7+3)%8],b=pool[(n*5+5)%8],c=pool[(n*3+6)%8];
 return {label,text:"請協助確認"+c+"所涉及的"+a+"程序，並核對"+b+"的主要限制；封存情境 S"+n+"。"};
}
function sparse(text){
 const dense=fiveSpaceFeatures(text);
 const indexes=[],values=[];
 for(let i=0;i<dense.length;i++)if(dense[i]!==0){indexes.push(i);values.push(dense[i]);}
 return {indexes:Uint16Array.from(indexes),values:Float64Array.from(values)};
}
function heldoutLoss(rows,weights,bias){
 let loss=0,correct=0;
 for(const row of rows){
  const projected=new Float64Array(5);
  for(let k=0;k<5;k++){
   let z=bias[k],start=k*LEARNED_5D_FEATURES;
   for(let t=0;t<row.x.indexes.length;t++)z+=weights[start+row.x.indexes[t]]*row.x.values[t];
   projected[k]=Math.tanh(z);
   const diff=projected[k]-FIVE_SIMPLEX[row.label][k];
   loss+=diff*diff/10;
  }
  const logits=FIVE_SIMPLEX.map(point=>point.reduce((sum,v,k)=>sum+v*projected[k],0));
  if(logits.indexOf(Math.max(...logits))===row.label)correct++;
 }
 return {loss:Number((loss/rows.length).toFixed(8)),correct,rows:rows.length};
}
export function trainFiveD({updates=FULL_UPDATES}={}){
 if(!Number.isSafeInteger(updates)||updates<TRAIN_ROWS||updates>FULL_UPDATES||updates%TRAIN_ROWS!==0)
  throw Error("FIVE_D_UPDATES_REQUIRE_EXACT_MULTIPLE_OF_20000_AND_MAX_10000000");
 const digest=createHash("sha256");
 const train=[],evalRows=[],sealedTestRows=[];
 for(let i=0;i<TRAIN_ROWS;i++){
  const row=sample(i);
  digest.update(String(row.label)+"\t"+row.text+"\n","utf8");
  train.push({x:sparse(row.text),label:row.label});
 }
 for(let i=0;i<EVAL_ROWS;i++){
  const row=sample(i,true);
  evalRows.push({x:sparse(row.text),label:row.label});
 }
 for(let i=0;i<SEALED_TEST_ROWS;i++){
  const row=sealedTestSample(i);
  sealedTestRows.push({x:sparse(row.text),label:row.label});
 }
 const weights=new Float64Array(5*LEARNED_5D_FEATURES),bias=new Float64Array(5);
 const initial=heldoutLoss(evalRows,weights,bias);
 const checkpoints=[],started=performance.now();
 let bestValidationLoss=initial.loss,bestValidationStep=0;
 let bestWeights=null,bestBias=null;
 const checkpointStride=Math.max(TRAIN_ROWS,Math.floor(updates/10/TRAIN_ROWS)*TRAIN_ROWS);
 // This is a genuine training loop: every step calculates a loss gradient and
 // updates 5x384 trainable weights (sparse updates) and 5 biases.
 for(let step=0;step<updates;step++){
  const row=train[step%TRAIN_ROWS];
  const index=row.x.indexes,value=row.x.values;
  const target=FIVE_SIMPLEX[row.label];
  const lr=0.09/(1+step/180000);
  for(let k=0;k<5;k++){
   const offset=k*LEARNED_5D_FEATURES;
   let z=bias[k];
   for(let t=0;t<index.length;t++)z+=weights[offset+index[t]]*value[t];
   const coord=Math.tanh(z);
   const gradient=(coord-target[k])*(1-coord*coord);
   bias[k]-=lr*gradient*0.05;
   for(let t=0;t<index.length;t++)weights[offset+index[t]]-=lr*gradient*value[t];
  }
  if((step+1)%checkpointStride===0||step===updates-1){
   const score=heldoutLoss(evalRows,weights,bias);
   checkpoints.push({step:step+1,synthetic_holdout_loss:score.loss,
    synthetic_holdout_matches:score.correct,synthetic_holdout_rows:score.rows,
    neural_checkpoint_written:false});
   if(score.loss<bestValidationLoss){
    bestValidationLoss=score.loss;
    bestValidationStep=step+1;
    bestWeights=new Float64Array(weights);
    bestBias=new Float64Array(bias);
   }
  }
 }
 const final=heldoutLoss(evalRows,weights,bias);
 if(!bestWeights||!bestBias||!(bestValidationLoss<initial.loss)||
  !(Number.isFinite(final.loss)&&final.loss<initial.loss))
  throw Error("FIVE_D_SYNTHETIC_HOLDOUT_DID_NOT_IMPROVE");
 // Train all requested SGD updates, but export only the lowest-validation-loss
 // snapshot; late overfitting is a failure of checkpoint selection, NOT success.
 const chosenValidation=heldoutLoss(evalRows,bestWeights,bestBias);
 const sealedBest=heldoutLoss(sealedTestRows,bestWeights,bestBias);
 const sealedLast=heldoutLoss(sealedTestRows,weights,bias);
 const artifact={
  architecture:"october-linear-five-space-v1",inputFeatures:LEARNED_5D_FEATURES,
  outputDimensions:5,expertIds:[...LEARNED_5D_IDS],
  weights:Array.from({length:5},(_,k)=>Array.from(bestWeights.subarray(k*LEARNED_5D_FEATURES,(k+1)*LEARNED_5D_FEATURES))),
  bias:Array.from(bestBias),
  provenance:{trainCount:TRAIN_ROWS,trainSha256:digest.digest("hex"),evalCount:EVAL_ROWS,
   expertReviewed:false,trainedOn:"GPT-authored-synthetic",epochs:bestValidationStep/TRAIN_ROWS,seed:20261025}
 };
 assertLearnedFiveWeights(artifact);
 const artifactSha256=createHash("sha256").update(JSON.stringify(artifact)+"\n").digest("hex");
 const report={
  schema:1,kind:"detroit-atuber-penteract-five-d-training-sandbox",
  modelFamily:"october-linear-five-space-v1",
  trainableParameters:weights.length+bias.length,
  outputDimensions:5,expertCount:6,
  requestedWeightUpdates:updates,actualWeightUpdates:updates,optimizer:"CPU SGD, five-dimensional coordinate regression",
  inputFormat:"detroit/fiveSpaceFeatures 384 hashed char n-grams",
  outputFormat:"detroit/penteract-learned.ts artifact schema",
  trainExamples:TRAIN_ROWS,holdoutExamples:EVAL_ROWS,
  syntheticHoldoutInitialLoss:initial.loss,syntheticHoldoutFinalLoss:final.loss,
  syntheticHoldoutMatches:final.correct,syntheticHoldoutOnly:true,
  syntheticValidationSelectedLoss:chosenValidation.loss,
  syntheticValidationSelectedMatches:chosenValidation.correct,
  syntheticValidationLastLoss:final.loss,
  syntheticValidationLastMatches:final.correct,
  checkpointSelection:"lowest-synthetic-validation-loss-across-periodic-checkpoints",
  bestCheckpointStep:bestValidationStep,
  exportedWeightsCheckpointStep:bestValidationStep,
  additionalUpdatesAfterBest:updates-bestValidationStep,
  overfitWarning:final.loss>chosenValidation.loss,
  sealedSyntheticTestRows:SEALED_TEST_ROWS,
  sealedSyntheticTestSelectedLoss:sealedBest.loss,
  sealedSyntheticTestSelectedMatches:sealedBest.correct,
  sealedSyntheticTestLastLoss:sealedLast.loss,
  sealedSyntheticTestLastMatches:sealedLast.correct,
  sealedSyntheticTestNotUsedForCheckpointSelection:true,
  checkpoints,artifactTrainingDataSha256:artifact.provenance.trainSha256,
  artifactSha256,
  elapsedMs:Math.round(performance.now()-started),
  hardware:"cpu",cudaUsed:false,atuber0_6BWeightsUpdated:false,
  octuber30BWeightsUpdated:false,octuber60BWeightsUpdated:false,
  detroitFactoryToolsDispatched:false,productionRouterModified:false,
  permissionsGranted:false,expertReviewed:false,blindHumanBenchmarkAvailable:false,
  warning:"10 million actual updates are of a 1,925-parameter 5D SHADOW projector; only the best earlier synthetic-validation checkpoint is exported. The sealed test is also synthetic, not a human blind benchmark. None of these are Qwen, Atuber 0.6B, OCTUBER 30B/60B or a validated production router."
 };
 return {report,artifact};
}
export async function main(args=process.argv.slice(2)){
 let updates=FULL_UPDATES,outDir="";
 for(let i=0;i<args.length;i++){
  if(args[i]==="--steps"&&args[i+1])updates=Number(args[++i]);
  else if(args[i]==="--out-dir"&&args[i+1])outDir=args[++i];
  else throw Error("INVALID_FIVE_D_TRAINING_OPTION");
 }
 const {report,artifact}=trainFiveD({updates});
 if(outDir){
  const path=resolve(outDir);
  await mkdir(path,{recursive:true});
  await writeFile(join(path,"five-d-weights.json"),JSON.stringify(artifact)+"\n",{flag:"wx"});
  await writeFile(join(path,"five-d-sandbox-report.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
 }
 process.stdout.write(JSON.stringify(report,null,2)+"\n");
}
if(import.meta.url===new URL("file://"+process.argv[1]).href)
 main().catch(error=>{process.stderr.write(String(error)+"\n");process.exitCode=2;});
