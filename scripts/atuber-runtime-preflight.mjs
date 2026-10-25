#!/usr/bin/env node
/**
 * Read-only local hardware and Ollama inventory for approved October tiers.
 * No model pulls, no GPU rental, no Slime pairing, no network calls beyond
 * http://127.0.0.1:11434. This is NOT an inference benchmark.
 */
import os from "node:os";
import {statfsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const GiB=1024**3;
export const TIER_REQUIREMENTS=[
 {alias:"october:sm",base:"qwen3:4b",label:"4B",ramGiB:6,downloadGiB:2.5},
 {alias:"october:ml",base:"qwen3:14b",label:"14B",ramGiB:16,downloadGiB:9.3},
 {alias:"october:lg",base:"qwen3:30b",label:"30B",ramGiB:32,downloadGiB:19}
];
/** Additional on-owner-host model sizes; not a promise of actual installation. */
export const EXTRA_TIER_REQUIREMENTS=[
 {alias:"qwen3:0.6b",base:"qwen3:0.6b",label:"0.6B Ollama",ramGiB:3,downloadGiB:.523},
 {alias:"octuber:compact-1.7b",base:"qwen3:1.7b",label:"1.7B",ramGiB:4,downloadGiB:1.4},
 {alias:"octuber:balanced-8b",base:"qwen3:8b",label:"8B",ramGiB:10,downloadGiB:5.2},
 {alias:"octuber:sumptuous-32b",base:"qwen3:32b",label:"32B Dense",ramGiB:36,downloadGiB:20}
];
export function assessTier(tier,info){
 const installedModel=[tier.alias,tier.base].find(name=>info.installedModels.includes(name))??null;
 const installed=Boolean(installedModel);
 const sufficientRam=info.ramGiB>=tier.ramGiB;
 // Allow space for temporary downloads and model compilation; conservative.
 const enoughDisk=installed||info.freeDiskGiB>=Math.ceil(tier.downloadGiB*1.35+2);
 return {
  alias:tier.alias,base:tier.base,label:tier.label,
  installed,installedModel,ollamaReachable:info.ollamaReachable,
  recommendedMemoryMet:sufficientRam,
  downloadHeadroomMet:enoughDisk,
  readyForInferenceCheck:Boolean(installed&&info.ollamaReachable&&sufficientRam),
  inferenceVerified:false,
  note:!info.ollamaReachable?"本地 Ollama 未就緒":
   !installed?"尚未安裝模型":
   !sufficientRam?"低於保守 RAM 建議；可另外實測 CPU offload，但可能非常慢":
   "可開始實際推論測試；尚未證明生成成功"
 };
}
export async function inspectLocalRuntime(){
 const ramGiB=Number((os.totalmem()/GiB).toFixed(1));
 let freeDiskGiB=0;
 try{const fs=statfsSync(process.cwd());freeDiskGiB=Number((Number(fs.bavail)*Number(fs.bsize)/GiB).toFixed(1));}catch{}
 let gpu=[];
 try{
  const raw=execFileSync("nvidia-smi",["--query-gpu=name,memory.total","--format=csv,noheader"],
   {encoding:"utf8",timeout:3500,stdio:["ignore","pipe","ignore"]});
  gpu=raw.split("\n").map(x=>x.trim()).filter(Boolean).slice(0,8);
 }catch{}
 let installedModels=[],ollamaReachable=false;
 try{
  const response=await fetch("http://127.0.0.1:11434/api/tags",{signal:AbortSignal.timeout(4000)});
  if(response.ok){
   const data=await response.json();
   if(Array.isArray(data?.models)){
    installedModels=data.models.filter(x=>typeof x?.name==="string").map(x=>x.name);
    ollamaReachable=true;
   }
  }
 }catch{}
 const info={ramGiB,freeDiskGiB,gpu,installedModels,ollamaReachable};
 return {contract:"atuber-local-preflight-v1",host:os.hostname(),os:os.platform(),...info,
  tiers:[...TIER_REQUIREMENTS,...EXTRA_TIER_REQUIREMENTS].map(t=>assessTier(t,info)),
  notice:"Read-only inventory. Weights are not downloaded, services not enabled, paid infrastructure not provisioned."};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 console.log(JSON.stringify(await inspectLocalRuntime(),null,2));
}
