/** Safe, browser-local 5D SHADOW router. No execution, model call, I/O or authorization.
 * A sole five-dimensional nearest-neighbor choice is not evidence of intent.
 * Abstain on absent lexical anchors or near-tied experts. Unlike Diana,
 * this function NEVER chooses a real tool or confers permissions.
 */
import {planPenteractFunnel,penteractLexicalEvidence} from "./penteract-5d";
export type PenteractShadowVerdict={
 status:"candidate"|"abstain";
 candidateId:string|null;
 reason:"single-geometry-neighbor"|"no-lexical-evidence"|"near-tie";
 neighborGap:number|null;
 routeCount:number;
 policy:"advisory-only";
};
export function shadowPenteractRoute(question:string):PenteractShadowVerdict{
 const plan=planPenteractFunnel(question,{budget:3,privateMode:true});
 const [first,second]=plan.routes;
 const gap=first&&second?Number((second.distance-first.distance).toFixed(5)):null;
 const common={neighborGap:gap,routeCount:plan.routes.length,policy:"advisory-only" as const};
 if(!penteractLexicalEvidence(question)||!first){
  return {...common,status:"abstain",candidateId:null,reason:"no-lexical-evidence"};
 }
 if(gap===null||gap<=0.12){
  return {...common,status:"abstain",candidateId:null,reason:"near-tie"};
 }
 return {...common,status:"candidate",candidateId:first.id,reason:"single-geometry-neighbor"};
}
