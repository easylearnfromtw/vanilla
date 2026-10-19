import {getConfigs} from "../vault/providers";
import {getOllamaConfig,isOllamaConfigured,generateOllamaReply} from "./ollama";
import {generateCloudReply,type ImageInput} from "../vault/providers";
import {generateLocalReply,loadLocalModel,type ChatTurn} from "../local-ai/engine";
import {retryDisposedLocalInference} from "../local-ai/webllm-compat";
import {getHealthAdjustment,recordModelRun} from "./model-health";
import {noodlesModelAdjustment} from "../noodles/core";
import {readNoodles,recordNoodles} from "../noodles/storage";
import {preferTaideForTaiwan,isTaideModel} from "./taiwan-routing";
import {profileFor,geminiLiteSibling} from "./model-profiles";
import {localInferenceQueue} from "../detroit/zeus";

export type ModelSource="local"|"ollama"|"gemini"|"deepseek";
export type ModelCandidate={id:string;source:ModelSource;model:string;label:string;location:string;note:string};
import {classifyTask,type TaskKind} from "./task-kind";
export {classifyTask,type TaskKind};
export type Vote={at:number;task:TaskKind;winner:string;loser:string};
const VOTE_KEY="vanilla.model.choices.v1";
const RATING_KEY="vanilla.model.ratings.v1";
type ModelRating={at:number;task:TaskKind;candidate:string;liked:boolean};
function ratings():ModelRating[]{
 try{
  const data:unknown=JSON.parse(localStorage.getItem(RATING_KEY)||"[]");
  return Array.isArray(data)?data.filter(x=>x&&typeof x==="object"&&typeof x.candidate==="string"&&typeof x.task==="string"&&typeof x.liked==="boolean").slice(-300):[];
 }catch{return [];}
}
export function getRatingCount():number{return ratings().length;}
export function saveAnswerRating(task:TaskKind,candidateId:string,liked:boolean):void{
 const value=[...ratings(),{at:Date.now(),task,candidate:candidateId,liked}].slice(-300);
 try{localStorage.setItem(RATING_KEY,JSON.stringify(value));}catch{}
 window.dispatchEvent(new Event("vanilla-preferences-changed"));
}

function votes():Vote[]{
 try{
  const data:unknown=JSON.parse(localStorage.getItem(VOTE_KEY)||"[]");
  return Array.isArray(data)?data.filter(x=>x&&typeof x==="object"&&typeof x.winner==="string"&&typeof x.loser==="string"&&typeof x.task==="string").slice(-300):[];
 }catch{return [];}
}
export function getVoteCount(){return votes().length;}
export function saveModelChoice(task:TaskKind,winner:ModelCandidate,losers:ModelCandidate[]){
 const current=votes();
 const stamp=Date.now();
 const fresh=losers.filter(x=>x.id!==winner.id).map(x=>({task,winner:winner.id,loser:x.id,at:stamp}));
 if(!fresh.length)return;
 try{localStorage.setItem(VOTE_KEY,JSON.stringify([...current,...fresh].slice(-300)));}catch{}
 window.dispatchEvent(new Event("vanilla-preferences-changed"));
}
export function resetModelChoices(){try{localStorage.removeItem(VOTE_KEY);localStorage.removeItem(RATING_KEY);}catch{}window.dispatchEvent(new Event("vanilla-preferences-changed"));}
export function listCandidates(options:{localReady:boolean;localModel:string;image:boolean;online:boolean;privateMode:boolean}):ModelCandidate[]{
 const result:ModelCandidate[]=[];
 if(options.localReady&&!options.image){
  result.push({id:"local:"+options.localModel,source:"local",model:options.localModel,label:"手機本地 AI",location:"本機",note:"在此裝置運算，無 API 使用費"});
 }
 if(options.privateMode)return result;
 if(isOllamaConfigured()&&!options.image){
  const ollama=getOllamaConfig();
  const officialCloud=/^https:\/\/ollama[.]com(?:\/|$)/i.test(ollama.endpoint);
  if(options.online||!officialCloud){
  const approved=[...new Set([ollama.model,...ollama.models])].filter(Boolean).slice(0,4);
  for(const model of approved){
   result.push({id:"ollama:"+model,source:"ollama",model,label:(isTaideModel(model)?"TAIDE · ":"Ollama · ")+model,location:officialCloud?"Ollama Cloud":"自架主機",note:officialCloud?"雲端模型可能有使用量限制與計費":"家庭主機或 VM 運算；請使用可信任的安全連線"});
  }
  }
 }
 if(!options.online)return result;
 const cfg=getConfigs();
 const gemini=cfg.find(x=>x.provider==="gemini");
 if(gemini){
  result.push({id:"gemini:"+gemini.model,source:"gemini",model:gemini.model,label:"Gemini · "+gemini.model,location:"Google 雲端",note:"依帳號額度／計費規則使用"});
  const lite=geminiLiteSibling(gemini.model);
  if(gemini.model!==lite)result.push({id:"gemini:"+lite,source:"gemini",model:lite,label:"Gemini · Flash-Lite",location:"Google 雲端",note:"較輕量快速的替代模型，仍受 API 額度限制"});
 }
 const deepseek=cfg.find(x=>x.provider==="deepseek");
 if(deepseek&&!options.image)result.push({id:"deepseek:"+deepseek.model,source:"deepseek",model:deepseek.model,label:"DeepSeek · "+deepseek.model,location:"DeepSeek 雲端",note:"可能產生 API 費用"});
 return options.image?result.filter(x=>x.source==="gemini"):result;
}
/** Quality prior from the model profile, adjusted per task (fast models win casual chat). */
function baseScore(candidate:ModelCandidate,task:TaskKind):number{
 const profile=profileFor(candidate.source,candidate.model);
 let score=profile.tier;
 if(task==="casual")score=candidate.source==="local"?90:Math.min(score,70)-4;
 if(candidate.source==="local"&&task!=="casual")score-=4; // phone models: honest about depth
 if(candidate.source==="gemini"&&task==="vision")score+=6;
 if(candidate.source==="deepseek"&&task==="code")score+=3;
 if(/coder/i.test(candidate.model))score+=task==="code"?14:-10;
 return score;
}
export function rankedCandidates(candidates:ModelCandidate[],task:TaskKind,priority:"local-first"|"quality"="local-first",useNoodles=true,question=""):ModelCandidate[]{
 const allVotes=votes().filter(v=>v.task===task);
 const feedback=ratings().filter(r=>r.task===task);
 const score=(candidate:ModelCandidate)=>{
  const wins=allVotes.filter(v=>v.winner===candidate.id).length;
  const losses=allVotes.filter(v=>v.loser===candidate.id).length;
  const graded=feedback.filter(r=>r.candidate===candidate.id);
  const approvals=graded.filter(r=>r.liked).length;
  const rejections=graded.length-approvals;
  const feedbackScore=Math.max(-12,Math.min(12,30*(approvals-rejections)/(6+graded.length)));
  const params=profileFor(candidate.source,candidate.model).paramsB;
  const localBonus=priority==="local-first"&&candidate.source==="local"&&params>=1.5&&(task==="general"||task==="casual")?26:0;
  const qualityBonus=priority==="quality"&&candidate.source==="gemini"?8:0;
  const selfHostedBonus=priority==="local-first"&&candidate.source==="ollama"&&candidate.location==="自架主機"?8:0;
  return baseScore(candidate,task)+localBonus+qualityBonus+selfHostedBonus+Math.max(-13,Math.min(13,36*(wins-losses)/(6+wins+losses)))+getHealthAdjustment(candidate.id)+feedbackScore+(useNoodles?noodlesModelAdjustment(readNoodles(),task,candidate.id):0);
 };
 return preferTaideForTaiwan([...candidates].sort((a,b)=>score(b)-score(a)),question);
}
export function topComparisonCandidates(candidates:ModelCandidate[],task:TaskKind,priority:"local-first"|"quality"="local-first",useNoodles=true,question=""):ModelCandidate[]{
 const ordered=rankedCandidates(candidates,task,priority,useNoodles,question);
 if(ordered.length<2)return ordered;
 const first=ordered[0];
 const different=ordered.find(x=>x.source!==first.source);
 return [first,different||ordered[1]];
}
/** Tokens available for the newest user message (question + attached context) per candidate.
 * Local phones have a 4K window; cloud models are capped for cost and latency, not capability. */
export function promptBudgetFor(candidate:ModelCandidate,task:TaskKind):number{
 const profile=profileFor(candidate.source,candidate.model);
 if(candidate.source==="local")return Math.max(600,profile.contextTokens-profile.maxOutput[task]-(profile.compactPrompt?220:520)-520);
 if(candidate.source==="ollama")return Math.max(1200,profile.contextTokens-profile.maxOutput[task]-900-1200);
 return 24000;
}
export type GenerateOptions={task:TaskKind;privateMode:boolean;signal?:AbortSignal;deep?:boolean};
export async function generateCandidate(candidate:ModelCandidate,history:ChatTurn[],image?:ImageInput,onText?:(text:string)=>void,optimization?:GenerateOptions):Promise<string>{
 const start=Date.now();
 const task=optimization?.task;
 const signal=optimization?.signal;
 try{
  let result:string;
  if(candidate.source==="local")result=await retryDisposedLocalInference(
   ()=>localInferenceQueue.run(()=>generateLocalReply(history,onText||(()=>{}),{task,signal,deep:optimization?.deep}),signal),
   // Reload outside the Zeus GPU queue: loadLocalModel itself acquires this queue.
   ()=>loadLocalModel(()=>{},candidate.model),
   ()=>onText?.(""),
   signal
  );
  else if(candidate.source==="ollama")result=await generateOllamaReply(history,candidate.model,{task,onText,signal,deep:optimization?.deep});
  else result=await generateCloudReply(candidate.source,history,image,candidate.model,{task,onText,signal,deep:optimization?.deep});
  const duration=Date.now()-start;
  recordModelRun(candidate.id,true,duration);
  if(optimization)recordNoodles({kind:"run",at:Date.now(),model:candidate.id,task:optimization.task,ok:true,durationMs:duration},optimization.privateMode);
  return result;
 }catch(error){
  const duration=Date.now()-start;
  // A user pressing "stop" is not a model failure.
  if(!signal?.aborted)recordModelRun(candidate.id,false,duration);
  if(optimization&&!signal?.aborted)recordNoodles({kind:"run",at:Date.now(),model:candidate.id,task:optimization.task,ok:false,durationMs:duration},optimization.privateMode);
  throw error;
 }
}
