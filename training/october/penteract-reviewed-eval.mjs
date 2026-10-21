/** Optional, OFFLINE evaluation of October 5D against author-provided labels.
 *
 * This evaluator never trains, executes Diana, calls models, sends data to a
 * network, uploads prompts or modifies system routing. Diana's existing
 * chooseDianaTool() is called only as a PLAN proposal if explicitly supplied.
 * The six expert IDs and Diana tool IDs are DIFFERENT taxonomies and accuracy
 * figures must NEVER be numerically ranked as if equivalent.
 *
 * The "reviewer" and "consent" declarations are self-attested input metadata;
 * software cannot prove two people independently reviewed a case.
 */
import {readFileSync,writeFileSync,mkdirSync,statSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {assertLearnedFiveWeights,routeLearnedFive,LEARNED_5D_IDS} from "../../src/detroit/penteract-learned.ts";
import {shadowPenteractRoute} from "../../src/detroit/penteract-shadow.ts";
const RESTRICTED=/(?:sk-[A-Za-z0-9_-]{12,}|github_pat_[A-Za-z0-9_]{10,}|gh[pousr]_[A-Za-z0-9_]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i;
const DIANA_IDS=new Set([
 "diana","merlin","cream","scouts","atriensis","janus","retina","orchestra",
 "bard","luna","canva","jensen-huang","zeus","athena","medusa","ceres",
 "gridcraft","moli","persistent-jobs","luca","quirinus","notion","er-ya",
 "weiguo","venus","veritas","mnemosyne","hermes","chronos","dionysus",
 "holy-roman-empire"
]);

export function wilson95(successes,total){
 if(!Number.isInteger(successes)||!Number.isInteger(total)||successes<0||
  total<1||successes>total)throw Error("INVALID_BINOMIAL_INTERVAL");
 const z=1.96,p=successes/total,denom=1+z*z/total;
 const center=(p+z*z/(2*total))/denom;
 const margin=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/denom;
 return [Number(Math.max(0,center-margin).toFixed(4)),
         Number(Math.min(1,center+margin).toFixed(4))];
}
export function verifyReviewedRoutingCases(rows){
 if(!Array.isArray(rows)||rows.length<2||rows.length>300)
  throw Error("INVALID_REVIEWED_SCOPE");
 const seen=new Set();
 for(const item of rows){
  if(!item||typeof item!=="object"||Array.isArray(item)||
   Object.keys(item).sort().join(",")!==
    "adjudicated,consented,dianaToolLabel,expertLabel,id,question,redacted,reviewers")
   throw Error("INVALID_REVIEWED_SCHEMA");
  if(typeof item.id!=="string"||!/^[A-Za-z0-9_-]{3,50}$/.test(item.id)||
   seen.has(item.id))throw Error("DUPLICATE_OR_INVALID_REVIEWED_ID");
  seen.add(item.id);
  if(typeof item.question!=="string"||item.question.length<6||
   item.question.length>900||/[\u0000-\u0008\u000b-\u001f]/.test(item.question)||
   RESTRICTED.test(item.question))throw Error("PRIVATE_OR_INVALID_REVIEWED_QUESTION");
  if(item.expertLabel!==null&&!LEARNED_5D_IDS.includes(item.expertLabel))
   throw Error("UNRECOGNIZED_EXPERT_LABEL");
  if(item.dianaToolLabel!==null&&!DIANA_IDS.has(item.dianaToolLabel))
   throw Error("UNRECOGNIZED_DIANA_TOOL_LABEL");
  if(!Array.isArray(item.reviewers)||item.reviewers.length<2||
   item.reviewers.length>4||item.reviewers.some(x=>typeof x!=="string"||
     !/^[A-Za-z0-9_-]{2,24}$/.test(x))||new Set(item.reviewers).size<2)
   throw Error("REVIEWER_ATTESTATION_REQUIRED");
  if(item.consented!==true||item.redacted!==true||item.adjudicated!==true)
   throw Error("REDACTION_CONSENT_ADJUDICATION_REQUIRED");
 }
 return {records:rows.length,adjudication:"self-attested; no identity verification"};
}
const ratio=(a,b)=>b?Number((a/b).toFixed(4)):null;
function detail(success,total){return {correct:success,total,rate:ratio(success,total),
  wilson95:total?wilson95(success,total):null};}
export function evaluateReviewedProjector(rows,artifact,dianaPlanFn=null){
 verifyReviewedRoutingCases(rows);
 assertLearnedFiveWeights(artifact);
 if(dianaPlanFn!==null&&typeof dianaPlanFn!=="function")throw Error("INVALID_DIANA_PLAN");
 let known=0,learnedCorrect=0,lexicalCorrect=0;
 let learnedCovered=0,lexicalCovered=0,unknown=0,learnedAbstained=0,lexicalAbstained=0;
 let dianaTotal=0,dianaMatches=0;
 const perExpert={};
 for(const case_ of rows){
  const learned=routeLearnedFive(case_.question,artifact);
  const lexical=shadowPenteractRoute(case_.question);
  if(case_.expertLabel===null){
   unknown++;
   if(learned.status==="abstain")learnedAbstained++;
   if(lexical.status==="abstain")lexicalAbstained++;
  }else{
   known++;
   const key=case_.expertLabel,g=perExpert[key]??{known:0,learnedCorrect:0,lexicalCorrect:0};
   g.known++;
   if(learned.status==="candidate")learnedCovered++;
   if(lexical.status==="candidate")lexicalCovered++;
   if(learned.candidateId===key){learnedCorrect++;g.learnedCorrect++;}
   if(lexical.candidateId===key){lexicalCorrect++;g.lexicalCorrect++;}
   perExpert[key]=g;
  }
  if(case_.dianaToolLabel!==null&&dianaPlanFn!==null){
   const proposed=dianaPlanFn(case_.question);
   if(!proposed||typeof proposed.tool!=="string"||!DIANA_IDS.has(proposed.tool))
    throw Error("INVALID_DIANA_PROPOSAL");
   dianaTotal++;
   if(proposed.tool===case_.dianaToolLabel)dianaMatches++;
  }
 }
 return {
  suite:"October 5D independently reviewable LOCAL shadow evaluation",
  source:"self-attested operator-supplied redacted cases; independence NOT independently verified",
  noTraining:true,noToolExecution:true,noCloudTransfer:true,noModelExecution:true,
  expertTask:{known,unknown,
   learnedCorrect:detail(learnedCorrect,known),
   lexicalCorrect:detail(lexicalCorrect,known),
   learnedCoverage:detail(learnedCovered,known),
   lexicalCoverage:detail(lexicalCovered,known),
   learnedUnknownAbstention:detail(learnedAbstained,unknown),
   lexicalUnknownAbstention:detail(lexicalAbstained,unknown),
   perExpert
  },
  dianaToolTask:{comparableWithExpertClassification:false,proposalsEvaluated:dianaTotal,
   proposalToolMatches:detail(dianaMatches,dianaTotal),
   note:"Diana labels are real tool IDs; expert classifier accuracy is a distinct task"},
  deploymentEligible:false,requiresIndependentReleaseReview:true
 };
}
async function main(){
 const args=process.argv.slice(2);let cases="",weights="",output="",includeDiana=false;
 for(let i=0;i<args.length;i++){
  if(args[i]==="--cases"&&args[i+1])cases=args[++i];
  else if(args[i]==="--weights"&&args[i+1])weights=args[++i];
  else if(args[i]==="--output"&&args[i+1])output=args[++i];
  else if(args[i]==="--diana-readonly")includeDiana=true;
  else throw Error("Usage: --cases <reviewed.jsonl> --weights <weights.json> [--output <report.json>] [--diana-readonly]");
 }
 if(!cases||!weights)throw Error("EXPLICIT_CASES_AND_WEIGHTS_REQUIRED");
 const file=resolve(cases),weightFile=resolve(weights);
 // Check bytes BEFORE opening the input. A multi-gigabyte private file must
 // never be materialized merely to discover that it exceeds the safe limit.
 if(statSync(file).size>1_000_000||statSync(weightFile).size>200_000)
  throw Error("REVIEWED_EVAL_OVERSIZED");
 const raw=readFileSync(file,"utf8"),rawWeights=readFileSync(weightFile,"utf8");
 if(Buffer.byteLength(raw)>1_000_000||Buffer.byteLength(rawWeights)>200_000)
  throw Error("REVIEWED_EVAL_OVERSIZED");
 const rows=raw.split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));
 let dianaFn=null;
 if(includeDiana){
  // Node-only shims for modules that read browser preferences; deliberately
  // no network / model calls. chooseDianaTool produces a proposal, not action.
  globalThis.localStorage??={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  globalThis.sessionStorage??={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  globalThis.window??=new EventTarget();
  const {chooseDianaTool}=await import("../../src/detroit/diana.ts");
  dianaFn=question=>chooseDianaTool(question,
    {privateMode:true,online:false,hasCreamResult:false,hasModel:false});
 }
 const report=evaluateReviewedProjector(rows,JSON.parse(rawWeights),dianaFn);
 report.inputSha256=createHash("sha256").update(raw).digest("hex");
 if(output){
  const p=resolve(output);
  if(!p.startsWith(resolve("training/october/generated")+"/")||!p.endsWith(".json"))
   throw Error("INVALID_REVIEWED_OUTPUT_LOCATION");
  mkdirSync(dirname(p),{recursive:true});writeFileSync(p,JSON.stringify(report,null,2)+"\n");
 }
 console.log(JSON.stringify(report));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{process.stderr.write("REVIEWED_EVAL_ERROR: "+
  (error instanceof Error?error.message:"Unknown")+"\n");process.exitCode=2;});
}
