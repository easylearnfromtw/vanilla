/**
 * In-browser-only, read-only test contract for the experimental October 5D
 * shadow router. No network access, prompt persistence, or tool dispatch.
 * The result omits the actual questions by design.
 */
import {FIVE_EXPERTS,planPenteractFunnel} from "./penteract-5d";
import {shadowPenteractRoute} from "./penteract-shadow";

const VALID_EXPERTS=new Set(FIVE_EXPERTS.map(e=>e.id));
export type LabCase={id:string;question:string;expectedCandidate?:string|null};
export type LabRequest={version:1;cases:LabCase[]};
export type LabResult={
 contract:"atuber-5d-shadow-v1";mode:"local-readonly";
 authorized:false;modelInvoked:false;toolsDispatched:false;
 total:number;scored:number;matched:number;coverage:number;rows:Array<{
  id:string;status:"candidate"|"abstain";candidateId:string|null;
  reason:string;nearestDistance:number|null;
  ambiguity:"low"|"medium"|"high";expectedCandidate?:string|null;match?:boolean;
 }>;
};
function validId(x:unknown):x is string{
 return typeof x==="string"&&/^[a-zA-Z0-9_-]{1,64}$/.test(x);
}
export function evaluatePenteractLabBatch(raw:unknown):LabResult{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("INVALID_5D_TEST_REQUEST");
 const req=raw as Record<string,unknown>;
 if(Object.keys(req).sort().join(",")!=="cases,version"||req.version!==1||
  !Array.isArray(req.cases)||req.cases.length<1||req.cases.length>48)throw Error("INVALID_5D_TEST_REQUEST");
 const seen=new Set<string>();
 const rows:LabResult["rows"]=[];
 let scored=0,matched=0;
 for(const item of req.cases){
  if(!item||typeof item!=="object"||Array.isArray(item))throw Error("INVALID_5D_TEST_CASE");
  const c=item as Record<string,unknown>;
  if(Object.keys(c).some(k=>!["id","question","expectedCandidate"].includes(k))||
   !validId(c.id)||seen.has(c.id)||typeof c.question!=="string"||
   c.question.length<1||c.question.length>1024||
   !c.question.trim()||/[\u0000-\u001F\u007F]/.test(c.question)||
   (c.expectedCandidate!==undefined&&c.expectedCandidate!==null&&
    (typeof c.expectedCandidate!=="string"||!VALID_EXPERTS.has(c.expectedCandidate))))
   throw Error("INVALID_5D_TEST_CASE");
  seen.add(c.id);
  const verdict=shadowPenteractRoute(c.question);
  const plan=planPenteractFunnel(c.question,{privateMode:true});
  const hasExpected=Object.prototype.hasOwnProperty.call(c,"expectedCandidate");
  const match=hasExpected?verdict.candidateId===c.expectedCandidate:undefined;
  if(hasExpected){scored++;if(match)matched++;}
  rows.push({
   id:c.id,status:verdict.status,candidateId:verdict.candidateId,
   reason:verdict.reason,nearestDistance:plan.routes[0]?.distance??null,
   ambiguity:plan.ambiguity,
   ...(hasExpected?{expectedCandidate:c.expectedCandidate as string|null,match}: {})
  });
 }
 return {contract:"atuber-5d-shadow-v1",mode:"local-readonly",
  authorized:false,modelInvoked:false,toolsDispatched:false,
  total:rows.length,scored,matched,coverage:rows.filter(r=>r.status==="candidate").length/rows.length,rows};
}
