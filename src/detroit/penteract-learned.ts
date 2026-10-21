/** October trainable five-dimensional router: pure-CPU, non-executable shadow inference.
 *
 * A small 5×384 learned feature projection is a real trainable set of weights.
 * It is NOT a Qwen/Transformer fine-tune, does not preserve general semantics,
 * and never grants tool authority. Training happens only via an explicit local
 * script. No model download, network calls, telemetry persistence or GPU load.
 */
import {FIVE_SIMPLEX,type Vec5} from "./penteract-5d";

export const LEARNED_5D_FEATURES=384;
export const LEARNED_5D_CLASSES=6;
export const LEARNED_5D_SCALE=4.0;
export const LEARNED_5D_IDS=Object.freeze([
 "finance","research","code","design","writing","numbers"
]);
export type LearnedFiveWeights={
 architecture:"october-linear-five-space-v1";
 inputFeatures:384;outputDimensions:5;
 expertIds:string[];weights:number[][];bias:number[];
 provenance:{trainCount:number;trainSha256:string;evalCount:number;expertReviewed:false;
   trainedOn:"GPT-authored-synthetic";epochs:number;seed:number;};
};
const valid=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n);
const SEED=2166136261;
function hashToken(token:string):number{
 let h=SEED;
 for(let j=0;j<token.length;j++)h=Math.imul(h^token.charCodeAt(j),16777619)>>>0;
 return h>>>0;
}
/** Unicode NFKC char 1–3-grams. No English tokenizer, dictionary or cloud. */
export function fiveSpaceFeatures(text:string):Float64Array{
 if(typeof text!=="string")throw Error("INVALID_FIVE_SPACE_TEXT");
 const chars=Array.from(text.normalize("NFKC").trim().toLowerCase().replace(/\s+/g," ").slice(0,240));
 const features=new Float64Array(LEARNED_5D_FEATURES);
 for(let i=0;i<chars.length;i++)for(let n=1;n<=3&&i+n<=chars.length;n++){
  const code=hashToken(n+":"+chars.slice(i,i+n).join(""));
  const index=code%LEARNED_5D_FEATURES;
  features[index]+=(code&0x80000000)?-1:1;
 }
 const norm=Math.hypot(...features);
 if(norm)for(let i=0;i<features.length;i++)features[i]/=norm;
 return features;
}
export function assertLearnedFiveWeights(raw:unknown):LearnedFiveWeights{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("INVALID_LEARNED_WEIGHTS");
 const d=raw as Record<string,unknown>;
 if(Object.keys(d).sort().join(",")!=="architecture,bias,expertIds,inputFeatures,outputDimensions,provenance,weights"||
  d.architecture!=="october-linear-five-space-v1"||
  d.inputFeatures!==LEARNED_5D_FEATURES||d.outputDimensions!==5||
  !Array.isArray(d.expertIds)||d.expertIds.join(",")!==LEARNED_5D_IDS.join(",")||
  !Array.isArray(d.weights)||d.weights.length!==5||
  !Array.isArray(d.bias)||d.bias.length!==5||
  d.bias.some(v=>!valid(v)||Math.abs(v)>8)||
  d.weights.some(row=>!Array.isArray(row)||row.length!==LEARNED_5D_FEATURES||
    row.some(v=>!valid(v)||Math.abs(v)>8)))throw Error("INVALID_LEARNED_WEIGHTS");
 const p=d.provenance as Record<string,unknown>|undefined;
 if(!p||Object.keys(p).sort().join(",")!=="epochs,evalCount,expertReviewed,seed,trainCount,trainSha256,trainedOn"||
  !Number.isInteger(p.trainCount)||Number(p.trainCount)<10||
  !Number.isInteger(p.evalCount)||Number(p.evalCount)<3||
  p.expertReviewed!==false||p.trainedOn!=="GPT-authored-synthetic"||
  !Number.isInteger(p.epochs)||Number(p.epochs)<1||Number(p.epochs)>500||
  !Number.isInteger(p.seed)||!Number.isSafeInteger(p.seed)||
  typeof p.trainSha256!=="string"||!/^[0-9a-f]{64}$/.test(p.trainSha256))
  throw Error("INVALID_LEARNED_PROVENANCE");
 return raw as LearnedFiveWeights;
}
export function forwardLearnedFive(
 x:Float64Array,weights:Pick<LearnedFiveWeights,"weights"|"bias">
):{coordinate:Vec5;probabilities:number[]}{
 if(x.length!==LEARNED_5D_FEATURES)throw Error("INVALID_5D_FEATURE_VECTOR");
 const coord:Array<number>=[];
 for(let k=0;k<5;k++){
  let sum=weights.bias[k];
  for(let j=0;j<x.length;j++)sum+=weights.weights[k][j]*x[j];
  coord.push(Math.tanh(sum));
 }
 const scores=FIVE_SIMPLEX.map(p=>2*LEARNED_5D_SCALE*
  p.reduce((s,n,i)=>s+n*coord[i],0));
 const max=Math.max(...scores);
 const probs=scores.map(s=>Math.exp(s-max));
 const denom=probs.reduce((a,b)=>a+b,0);
 return {coordinate:coord as unknown as Vec5,probabilities:probs.map(p=>p/denom)};
}
/** Evidence is a conservative safety veto, not an expert classifier or a
 * language model. One-domain agreement is required before suggesting ONE
 * specialist. Multi-domain and unseen phrasing remain in Merlin/Diana.
 *
 * These regex guards were revised after inspecting exploratory synthetic
 * holdouts, therefore old holdout scores are NOT independent/blind evidence.
 */
const LEARNED_DOMAIN_EVIDENCE:readonly RegExp[]=[
 /(?:財務|投資|股息|股票|營收|報酬|基金|毛利|ETF|資產|收益|淨利|貸款|房貸|殖利率|償債|租金|獲利|現金流|銀行|利率)/i,
 /(?:來源|文獻|法規|法律|研究|證據|新聞|指引|期刊|查核|查證|原始試驗|DOI|法源|學術|發表|指南)/i,
 /(?:程式|Python|TypeScript|GitHub|API|修復|元件|編譯|部署|編碼|套件|函式|測試|腳本|後端|伺服器|模組|錯誤|軟體)/i,
 /(?:設計|UI|UX|海報|介面|視覺|Figma|配色|App|版面|儀表板|卡片|陰影|留白|導覽|圖示)/i,
 /(?:文章|文件|郵件|文案|撰寫|稿|改寫|摘要|致謝函|發言|潤飾|敘述|逐字稿|通知內容|起草|報告)/i,
 /(?:CSV|數據|數值|統計|平均|標準差|試算表|表格|樣本|數列|加總|比例|數字|中位數|頻數|百分位|離群值)/i
];
export function detectLearnedFiveEvidence(text:string):readonly string[]{
 const bounded=text.normalize("NFKC").trim().slice(0,240);
 return LEARNED_5D_IDS.filter((_,i)=>LEARNED_DOMAIN_EVIDENCE[i].test(bounded));
}

export type LearnedFiveRoute={
 status:"candidate"|"abstain";candidateId:string|null;
 reason:"learned-shadow"|"insufficient-evidence"|"uncertain-margin"|"multi-domain"|"empty"|"no-domain-evidence"|"intent-disagreement";
 confidence:number|null;margin:number|null;coordinate:Vec5;
 policy:"advisory-only";
};
export function routeLearnedFive(text:string,artifact:LearnedFiveWeights):LearnedFiveRoute{
 assertLearnedFiveWeights(artifact);
 const input=text.trim();
 const features=fiveSpaceFeatures(input);
 const {coordinate,probabilities}=forwardLearnedFive(features,artifact);
 const sorted=probabilities.map((p,i)=>({p,i})).sort((a,b)=>b.p-a.p||a.i-b.i);
 const top=sorted[0],second=sorted[1],margin=top.p-second.p;
 const meta={confidence:Number(top.p.toFixed(4)),margin:Number(margin.toFixed(4)),
  coordinate,policy:"advisory-only" as const};
 if(!input)return {status:"abstain",candidateId:null,reason:"empty",...meta};
 // Strong visible signals of a multi-stage task require the pre-existing
 // Merlin/Diana orchestration, not blind top-one sparse specialization.
 const evidence=detectLearnedFiveEvidence(input);
 if(evidence.length===0)return {status:"abstain",candidateId:null,reason:"no-domain-evidence",...meta};
 if(evidence.length>1)return {status:"abstain",candidateId:null,reason:"multi-domain",...meta};
 // Low-dimensional prediction must agree with independently observable task
 // cues; disagreement delegates understanding to the original safe pipeline.
 if(LEARNED_5D_IDS[top.i]!==evidence[0])
  return {status:"abstain",candidateId:null,reason:"intent-disagreement",...meta};
 // Thresholds are heuristic only, NOT calibrated confidence intervals.
 if(top.p<0.6)return {status:"abstain",candidateId:null,reason:"insufficient-evidence",...meta};
 if(margin<0.2)return {status:"abstain",candidateId:null,reason:"uncertain-margin",...meta};
 return {status:"candidate",candidateId:LEARNED_5D_IDS[top.i],reason:"learned-shadow",...meta};
}
