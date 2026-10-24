/**
 * October / 阿土伯 single conversational driver with three owner-hosted tiers.
 * This chooses among configured candidates; it neither downloads weights nor
 * asserts a model is reachable. Never substitutes cloud experts silently.
 */
import type {ModelCandidate} from "./model-orchestrator";
import type {TaskKind} from "./task-kind";
import {isAtuberModel} from "./prompts";
import {hostedOctuberOption,isHostedOctuberReady} from "./octuber-hosted";
import {localOctuberBaseTier} from "./octuber-local-runtimes";
import {isOllamaModelVerified} from "./ollama";

export const ATUBER_SINGLE_DRIVER=true as const;
export const ATUBER_LOCAL_MODEL="Qwen3-0.6B-q4f16_1-MLC" as const;
/** Public OCTUBER names are UI-facing tiers; historical October Ollama tags stay valid. */
export const OCTUBER_LOCAL_BRAND="OCTUBER FLATTERING" as const;
export const OCTUBER_TIER_PREFERENCE_KEY="vanilla.octuber.tier-preference.v1";
export type OctuberTierPreference="auto"|"mid-small"|"mid-large"|"large"|"ultra";
export function octuberTierPreference():OctuberTierPreference{
 try{const value=localStorage.getItem(OCTUBER_TIER_PREFERENCE_KEY);return value==="mid-small"||value==="mid-large"||value==="large"||value==="ultra"?value:"auto";}catch{return "auto";}
}
export function setOctuberTierPreference(value:OctuberTierPreference):void{
 try{localStorage.setItem(OCTUBER_TIER_PREFERENCE_KEY,value);}catch{}
}

/** Install on an approved Ollama host with the matching deployment Modelfiles. */
export const ATUBER_TIERS=[
 {tier:"mid-small",model:"october:sm",publicAlias:"octuber:flattering",brand:"OCTUBER FLATTERING",base:"qwen3:4b",label:"OCTUBER FLATTERING · 4B",approxDownloadGB:2.5},
 {tier:"mid-large",model:"october:ml",publicAlias:"octuber:modest",brand:"OCTUBER MODEST",base:"qwen3:14b",label:"OCTUBER MODEST · 14B",approxDownloadGB:9.3},
 {tier:"large",model:"october:lg",publicAlias:"octuber:sumptuous",brand:"OCTUBER SUMPTUOUS",base:"qwen3:30b",label:"OCTUBER SUMPTUOUS · 30B (MoE)",approxDownloadGB:19}
] as const;
/** Additional dense flagship, opt-in only; historic three-tier aliases remain unchanged. */
export const OCTUBER_HIGH_CAPACITY={
 tier:"ultra",model:"octuber:sumptuous-32b",publicAlias:"octuber:sumptuous-32b",
 brand:"OCTUBER SUMPTUOUS",base:"qwen3:32b",label:"OCTUBER SUMPTUOUS · 32B Dense",approxDownloadGB:20
} as const;
export type AtuberTier="phone"|"mid-small"|"mid-large"|"large"|"ultra"|"custom";
export function atuberTier(candidate:ModelCandidate):AtuberTier|null{
 if(candidate.source==="local")return candidate.model===ATUBER_LOCAL_MODEL?"phone":null;
 if(candidate.source==="octuber-hosted"){
  const remote=hostedOctuberOption(candidate.model);
  return remote&&isHostedOctuberReady(candidate.model)?remote.tier:null;
 }
 if(candidate.source!=="ollama"||candidate.location!=="自架主機")return null;
 const model=candidate.model.toLowerCase();
 const found=ATUBER_TIERS.find(t=>t.model===model||t.publicAlias===model);
 if(found)return found.tier;
 if(model===OCTUBER_HIGH_CAPACITY.model)return "ultra";
 // Real locally installed Ollama model weights are valid drivers without an
 // owner-created model alias. The runtime list and inference proof are separate.
 const native=localOctuberBaseTier(model);
 if(native&&isOllamaModelVerified(candidate.model))return native;
 // Backward-compatible owner-created October aliases. Unknown capacity is
 // deliberately NOT counted as a verified large model.
 return /^(?:october|octuber|atuber|阿土伯)(?::[a-z0-9._-]+)?$/i.test(candidate.model)&&isAtuberModel(candidate.model)?"custom":null;
}
export type AtuberRouteDecision={
 policy:"atuber-single-driver-v1";
 controller:ModelCandidate|null;
 specialists:ModelCandidate[];
 reason:"ready-local"|"ready-ollama"|"ready-hosted"|"private-needs-local"|
  "vision-needs-approved-adapter"|"no-atuber-runtime"|"fact-needs-stronger-runtime";
};
export function isAtuberDriver(candidate:ModelCandidate):boolean{
 return atuberTier(candidate)!==null;
}
const order:Record<AtuberTier,number>={"phone":0,"mid-small":1,"mid-large":2,"large":3,"ultra":4,"custom":0};
/** Task-dependent floor, not a claim of correctness or hardware readiness. */
function desiredTier(task:TaskKind,restrictTinyModel:boolean):number{
 if(task==="code")return 3;
 if(task==="analysis")return 2;
 if(restrictTinyModel)return 2;
 if(task==="writing")return 1;
 return 0;
}
export function selectAtuberDriver(
 candidates:readonly ModelCandidate[],
 options:{privateMode:boolean;localOnly:boolean;image:boolean;task:TaskKind;restrictTinyModel?:boolean}
):AtuberRouteDecision{
 const specialists=candidates.filter(x=>!isAtuberDriver(x));
 const eligible=candidates.filter(isAtuberDriver);
 const local=eligible.find(x=>x.source==="local")??null;
 const hosts=eligible.filter(x=>x.source==="ollama"||x.source==="octuber-hosted");
 const base={policy:"atuber-single-driver-v1" as const,specialists};
 if(options.image)return {...base,controller:null,reason:"vision-needs-approved-adapter"};
 if(options.privateMode||options.localOnly){
  const controller=options.restrictTinyModel?null:local;
  return {...base,controller,reason:controller?"ready-local":
   options.restrictTinyModel?"fact-needs-stronger-runtime":"private-needs-local"};
 }
 const floor=desiredTier(options.task,Boolean(options.restrictTinyModel));
 const preference=octuberTierPreference();
 const requested=preference==="auto"?floor:Math.max(floor,order[preference]);
 const target=requested;
 // Never allow the 0.6B phone model on verified demanding/factual routes.
 const allowed=hosts.filter(x=>!options.restrictTinyModel||order[atuberTier(x)!]>=1);
 const best=allowed.map((candidate,index)=>({candidate,index,level:order[atuberTier(candidate)!]}))
  .sort((a,b)=>{
   const da=Math.abs(a.level-target),db=Math.abs(b.level-target);
   return da-db||(target>=2?b.level-a.level:a.level-b.level)||a.index-b.index;
  })[0]?.candidate??null;
 const preferHost=target>=1;
 const controller=preferHost?(best??(options.restrictTinyModel?null:local)):(local??best);
 return {...base,controller,reason:controller?.source==="local"?"ready-local":
  controller?.source==="ollama"?"ready-ollama":
  controller?.source==="octuber-hosted"?"ready-hosted":
  options.restrictTinyModel?"fact-needs-stronger-runtime":"no-atuber-runtime"};
}
/** No cross-boundary fallback or automatic cloud-provider promotion. */
export function atuberFallback(
 ranked:readonly ModelCandidate[],failed:ModelCandidate,options:{privateMode:boolean;localOnly:boolean}
):ModelCandidate|null{
 return ranked.find(x=>x.id!==failed.id&&isAtuberDriver(x)&&
  (!(options.privateMode||options.localOnly)||x.source==="local")&&
  !(failed.source==="local"&&x.source!=="local")&&
  !(failed.source==="ollama"&&x.source!=="ollama")&&
  !(failed.source==="octuber-hosted"&&x.source!=="octuber-hosted"))??null;
}
