/**
 * 阿土伯 / October single conversational-driver policy.
 *
 * Distinct from model-weight merging: experts and deterministic tools can
 * remain capabilities, but no Gemini/DeepSeek/unrelated Ollama model may
 * silently become the user-facing conversation driver.
 * A route decision is not an authorization: Diana/Ceres/Quirinus still gate
 * execution and explicit external consent is never skipped.
 */
import type {ModelCandidate} from "./model-orchestrator";
import type {TaskKind} from "./task-kind";
import {isAtuberModel} from "./prompts";

export const ATUBER_SINGLE_DRIVER=true as const;
export const ATUBER_LOCAL_MODEL="Qwen3-0.6B-q4f16_1-MLC" as const;
export type AtuberRouteDecision={
 policy:"atuber-single-driver-v1";
 controller:ModelCandidate|null;
 specialists:ModelCandidate[];
 reason:"ready-local"|"ready-ollama"|"private-needs-local"|
  "vision-needs-approved-adapter"|"no-atuber-runtime"|"fact-needs-stronger-runtime";
};

/** Only the dedicated local Qwen3 0.6B or a named self-hosted October/Atuber
 * Ollama deployment can be the controller. A generic Qwen 0.6B alias from
 * unrelated providers and cloud Gemini/DeepSeek are NEVER accepted.
 */
export function isAtuberDriver(candidate:ModelCandidate):boolean{
 if(candidate.source==="local")return candidate.model===ATUBER_LOCAL_MODEL;
 if(candidate.source!=="ollama"||candidate.location!=="自架主機")return false;
 return isAtuberModel(candidate.model)&&/^(?:october|atuber|阿土伯)(?::[a-z0-9._-]+)?$/i.test(candidate.model);
}

export function selectAtuberDriver(
 candidates:readonly ModelCandidate[],
 options:{privateMode:boolean;localOnly:boolean;image:boolean;task:TaskKind;restrictTinyModel?:boolean}
):AtuberRouteDecision{
 const specialists=candidates.filter(x=>!isAtuberDriver(x));
 const driverCandidates=candidates.filter(isAtuberDriver);
 const local=driverCandidates.find(c=>c.source==="local");
 const host=driverCandidates.find(c=>c.source==="ollama");
 const base={policy:"atuber-single-driver-v1" as const,specialists};
 if(options.image)return {...base,controller:null,reason:"vision-needs-approved-adapter"};
 if(options.privateMode||options.localOnly)
  return {...base,controller:options.restrictTinyModel?null:local??null,
   reason:options.restrictTinyModel?"fact-needs-stronger-runtime":local?"ready-local":"private-needs-local"};
 // Use the stronger self-hosted October runtime on factual/high-complexity
 // tasks when present; a private/on-device request never makes this choice.
 const preferHost=options.restrictTinyModel||options.task==="analysis"||options.task==="code";
 const controller=preferHost?(host??(options.restrictTinyModel?null:local??null)):(local??host??null);
 return {...base,controller,reason:controller?.source==="local"?"ready-local":
   controller?.source==="ollama"?"ready-ollama":
   options.restrictTinyModel?"fact-needs-stronger-runtime":"no-atuber-runtime"};
}

/** Fail closed: no automatic generic-model takeover if October crashes. */
export function atuberFallback(
 ranked:readonly ModelCandidate[],failed:ModelCandidate,options:{privateMode:boolean;localOnly:boolean}
):ModelCandidate|null{
 return ranked.find(x=>x.id!==failed.id&&isAtuberDriver(x)&&
  (!(options.privateMode||options.localOnly)||x.source==="local")&&
  // The fallback must not silently move an on-device prompt to a host.
  !(failed.source==="local"&&x.source!=="local")&&
  !(failed.source==="ollama"&&x.source!=="ollama"))??null;
}
