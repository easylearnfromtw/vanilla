/** Explicitly opted-in text-only Ceres drafting over Vanilla's existing model router.
 * Never retries on a second provider, runs tools or sends anything to Telegram.
 */
import {generateCandidate,type ModelCandidate} from "../ai/model-orchestrator";
import {buildCeresDraftPrompt,cleanCeresDraft,type CeresDraftTone} from "./draft-policy";

export async function generateCeresDraft(candidate:ModelCandidate,source:string,tone:CeresDraftTone,signal?:AbortSignal):Promise<string>{
 if(!["local","ollama","gemini","deepseek"].includes(candidate.source))throw Error("Ceres 不支援此模型來源");
 if(signal?.aborted)throw Error("已停止草稿生成");
 const prompt=buildCeresDraftPrompt(source,tone);
 const draft=await generateCandidate(candidate,[{role:"user",content:prompt}],undefined,undefined,{
  task:"casual",privateMode:false,signal,deep:false
 });
 if(signal?.aborted)throw Error("已停止草稿生成");
 return cleanCeresDraft(draft);
}
