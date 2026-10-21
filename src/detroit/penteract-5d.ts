/** October Penteract 5D geometry and understanding-first funnel.
 * The geometry is genuinely five-dimensional, projected onto a 2D screen.
 * Routing is a deterministic, EXPERIMENTAL advisory—not learned embeddings,
 * not Qwen weights, not authorization, not measured watts or GPU usage.
 * No network, data persistence, model invocation or external library.
 */
export type Vec5=readonly [number,number,number,number,number];
export type Vec3=readonly [number,number,number];
export type RotationPlane="xy"|"xz"|"xw"|"xv"|"yz"|"yw"|"yv"|"zw"|"zv"|"wv";
export const ROTATION_PLANES:readonly RotationPlane[]=["xy","xz","xw","xv","yz","yw","yv","zw","zv","wv"];
export const PENTERACT_VERTICES:readonly Vec5[]=Array.from({length:32},(_,i)=>[
 (i&1)?1:-1,(i&2)?1:-1,(i&4)?1:-1,(i&8)?1:-1,(i&16)?1:-1
] as Vec5);
export const PENTERACT_EDGES:readonly (readonly [number,number])[]=Array.from({length:32},(_,i)=>
 Array.from({length:5},(_,d)=>[i,i^(1<<d)] as const).filter(([a,b])=>a<b)
).flat();
export function rotate5D(value:Vec5,plane:RotationPlane,angle:number):Vec5{
 if(!ROTATION_PLANES.includes(plane)||!Number.isFinite(angle))throw new Error("INVALID_5D_ROTATION");
 const a=["x","y","z","w","v"].indexOf(plane[0]),b=["x","y","z","w","v"].indexOf(plane[1]);
 const copy=[...value],c=Math.cos(angle),s=Math.sin(angle);
 copy[a]=c*value[a]-s*value[b];copy[b]=s*value[a]+c*value[b];
 return copy as unknown as Vec5;
}
export function project5D(value:Vec5,rotation:RotationPlane="xw",angle=0):Vec3{
 const r=rotate5D(value,rotation,angle);
 // An explicit rank-3 linear map R5→R3 with nonzero w and v components.
 return [r[0]+0.32*r[3]-0.18*r[4],
         r[1]+0.24*r[3]+0.37*r[4],
         r[2]-0.21*r[3]+0.16*r[4]];
}
export function distance5D(a:Vec5,b:Vec5):number{
 return Math.hypot(...a.map((n,i)=>n-b[i]));
}
const normalize=(values:number[]):Vec5=>{
 const size=Math.hypot(...values)||1;
 return values.map(x=>x/size) as unknown as Vec5;
};
/** Six equally spaced expert anchors form a regular 5-simplex in R5.
 * Helmert orthogonal coordinates embed six vertices in five REAL axes:
 * ||c_i||=1, c_i·c_j=-1/5 for all i≠j. No fictional sixth spatial axis.
 */
export const FIVE_SIMPLEX:readonly Vec5[]=Array.from({length:6},(_,i)=>
 Array.from({length:5},(_,k)=>{
  const unit=1/Math.sqrt((k+1)*(k+2));
  const basis=i<=k?unit:i===k+1?-(k+1)*unit:0;
  return basis/Math.sqrt(5/6);
 }) as unknown as Vec5);
const KEYWORDS:readonly RegExp[]=[
 /(?:財務|投資|報酬|毛利|現金流|營收|利潤|股價|股息|資金|NPV|稅費)/i,
 /(?:來源|文獻|研究|證據|最新|查核|查證|新聞|法規|指引|指南)/i,
 /(?:程式|TypeScript|Python|GitHub|API|修復|重構|bug|測試|原始碼|部署|軟體)/i,
 /(?:設計|UI|UX|視覺|排版|配色|色彩|Figma|iOS|海報|介面|網站)/i,
 /(?:文章|文件|改寫|報告|電子郵件|Email|講稿|撰寫|文案|摘要|故事)/i,
 /(?:CSV|數據|統計|平均|標準差|計算|百分比|圖表|試算表|資料集)/i
];
/** Stable five-dimensional random feature map of bounded character trigrams.
 * This does NOT imply that five coordinates preserve all semantic meaning.
 */
export function embedFiveSpace(text:string):Vec5{
 const q=text.normalize("NFKC").trim().toLocaleLowerCase().slice(0,1024);
 if(!q)return [0,0,0,0,0];
 // Sparse semantic anchors are only a transparent lexical prefilter, not
 // trained Qwen embeddings. General queries fall back to hashed R5 projection.
 const matched=KEYWORDS.map(re=>re.test(q)?1:0);
 if(matched.some(Boolean)){
  const weighted=Array.from({length:5},(_,axis)=>FIVE_SIMPLEX.reduce((sum,p,i)=>sum+p[axis]*matched[i],0));
  return normalize(weighted);
 }
 const bucket=new Float64Array(64);
 const chars=Array.from(q.replace(/\s+/g," "));
 for(let i=0;i<chars.length;i++){
  const token=chars.slice(i,i+3).join("");
  let hash=2166136261;
  for(let j=0;j<token.length;j++)hash=Math.imul(hash^token.charCodeAt(j),16777619)>>>0;
  bucket[hash%64]+=(hash&128)?-1:1;
 }
 const dims=Array.from({length:5},(_,d)=>{
  let sum=0;
  for(let j=0;j<64;j++){
   let x=Math.imul((j+1)*2654435761^(d+19)*2246822519,1597334677)>>>0;
   sum+=bucket[j]*((x&1)?-1:1);
  }
  return sum;
 });
 return normalize(dims);
}
/** Local, uncalibrated lexical evidence for SHADOW-ONLY routing checks.
 * A geometric nearest neighbor is not reliable without any known task cues.
 * This number is NOT semantic confidence, policy approval or authorization.
 */
export function penteractLexicalEvidence(question:string):number{
 const bounded=question.normalize("NFKC").trim().slice(0,1024);
 return KEYWORDS.filter(pattern=>pattern.test(bounded)).length;
}

export type FiveExpert={id:string;title:string;prototype:Vec5;group:string};
const SEEDS=[
 {id:"finance",title:"財務分析",group:"expert",sample:"財務 投資 報酬率 毛利 現金流 風險 NPV 財報"},
 {id:"research",title:"研究查證",group:"evidence",sample:"文獻 查核 最新 來源 研究 證據 資料 正確性"},
 {id:"code",title:"程式架構",group:"expert",sample:"程式 TypeScript Python bug API GitHub 架構 修復 測試"},
 {id:"design",title:"介面設計",group:"expert",sample:"設計 UI UX 視覺 圖表 色彩 iOS 排版 可讀性"},
 {id:"writing",title:"文字文件",group:"expert",sample:"文章 文件 email 改寫 報告 講稿 創作文案"},
 {id:"numbers",title:"CREAM 計算",group:"verified-tool",sample:"統計 CSV 數據 平均 標準差 變異 資料表 計算"}
] as const;
export const FIVE_EXPERTS:readonly FiveExpert[]=SEEDS.map((s,i)=>({
 id:s.id,title:s.title,group:s.group,prototype:FIVE_SIMPLEX[i]
}));
export type FiveRoute={id:string;title:string;distance:number;group:string};
export type FunnelStage={id:"understand"|"route"|"evidence"|"synthesize"|"verify";
 label:string;budgetPct:number;maxCandidates:number};
export type PenteractPlan={
 version:"penteract-funnel-v0.1";spaceDimensions:5;projectionDimensions:3;
 geometry:{vertices:32;edges:80;rotationPlanes:10};
 mode:"advisory";modelInvoked:false;actualEnergyMeasured:false;
 understandingEffortPct:number;ambiguity:"low"|"medium"|"high";
 confidence:"not-calibrated";budgetUnit:"planned-abstract-compute-units";
 queryPosition:Vec5;routes:FiveRoute[];stages:FunnelStage[];
 authorization:"separate-diana-ceres-policy";note:string;
};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function planPenteractFunnel(question:string,opts:{budget?:number;privateMode?:boolean}={}):PenteractPlan{
 // No prompt or user identity is retained in returned telemetry.
 const clean=question.trim().slice(0,1024);
 const q=embedFiveSpace(clean);
 const ambiguous=clean.length<12||/(?:不確定|不知道|好像|隨便|你看著辦)/.test(clean);
 const complex=clean.length>140||/(?:比較|分析|研究|完整|推導|多步|驗證)/.test(clean);
 const ambiguity: PenteractPlan["ambiguity"]=ambiguous?"high":complex?"medium":"low";
 // These percentages are NOT measured hardware watts or real model inference budgets.
 const understand=ambiguity==="high"?62:complex?57:55;
 const route=14,verify=15,remaining=100-understand-route-verify;
 const evidence=Math.ceil(remaining*0.55),synthesize=remaining-evidence;
 const staged:[FunnelStage,FunnelStage,FunnelStage,FunnelStage,FunnelStage]=[
  {id:"understand",label:"理解問題與辨識限制",budgetPct:understand,maxCandidates:FIVE_EXPERTS.length},
  {id:"route",label:"五維稀疏空間路由",budgetPct:route,maxCandidates:3},
  {id:"evidence",label:"知識／工具需求核對",budgetPct:evidence,maxCandidates:2},
  {id:"synthesize",label:"最短必要回答",budgetPct:synthesize,maxCandidates:1},
  {id:"verify",label:"獨立驗證與安全門檻",budgetPct:verify,maxCandidates:1}
 ];
 const limit=clamp(Number.isFinite(opts.budget)?Math.floor(opts.budget!):3,1,3);
 const routes=FIVE_EXPERTS.map(x=>({id:x.id,title:x.title,group:x.group,
  distance:Number(distance5D(q,x.prototype).toFixed(5))}))
  .sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id)).slice(0,limit);
 return {version:"penteract-funnel-v0.1",spaceDimensions:5,projectionDimensions:3,
  geometry:{vertices:32,edges:80,rotationPlanes:10},
  mode:"advisory",modelInvoked:false,actualEnergyMeasured:false,
  understandingEffortPct:understand,ambiguity,confidence:"not-calibrated",
  budgetUnit:"planned-abstract-compute-units",queryPosition:q,routes,stages:staged,
  authorization:"separate-diana-ceres-policy",
  note:opts.privateMode?"僅本機幾何計算；不呼叫模型或網路":"實驗性幾何路由建議；未執行工具或模型"};
}
