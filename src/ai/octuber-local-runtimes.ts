/**
 * Official/local Ollama model tags recognized as OCTUBER compute tiers.
 * This describes compatible *base weights*, NOT model fine-tuning.
 * Do not claim a model is usable until /api/tags AND /api/chat succeed.
 * Never infer capacity from arbitrary user-supplied labels or substrings.
 */
export const OCTUBER_LOCAL_BASES=[
 {tier:"mid-small",brand:"OCTUBER FLATTERING",models:["qwen3:4b","qwen3:1.7b"]},
 {tier:"mid-large",brand:"OCTUBER MODEST",models:["qwen3:14b","qwen3:8b"]},
 {tier:"large",brand:"OCTUBER SUMPTUOUS",models:["qwen3:30b","qwen3:30b-a3b","qwen3:30b-a3b-instruct-2507","qwen3-coder:30b"]},
 {tier:"ultra",brand:"OCTUBER SUMPTUOUS",models:["qwen3:32b"]}
] as const;
export type LocalBaseTier=(typeof OCTUBER_LOCAL_BASES)[number]["tier"];
export function localOctuberBaseTier(model:string):LocalBaseTier|null{
 const normalized=model.trim().toLowerCase();
 for(const group of OCTUBER_LOCAL_BASES){
  if((group.models as readonly string[]).includes(normalized))return group.tier;
 }
 return null;
}
export function localOctuberBaseNames(tier:LocalBaseTier):readonly string[]{
 return OCTUBER_LOCAL_BASES.find(group=>group.tier===tier)?.models??[];
}
export function recognizedLocalModelName(model:string):boolean{
 return Boolean(localOctuberBaseTier(model))||
 ["october:sm","october:ml","october:lg","octuber:flattering","octuber:modest","octuber:sumptuous","octuber:sumptuous-32b","octuber:compact-1.7b","octuber:balanced-8b"].includes(model.trim().toLowerCase());
}
export function installedTierModel(names:readonly string[],tier:LocalBaseTier,aliases:readonly string[]):string|null{
 const available=new Set(names.map(x=>x.trim().toLowerCase()));
 return [...aliases,...localOctuberBaseNames(tier)].find(n=>available.has(n.toLowerCase()))??null;
}
