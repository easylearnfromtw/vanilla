import {getConfigs} from "../vault/providers";
import {getOllamaConfig,isOllamaConfigured,generateOllamaReply} from "./ollama";
import {generateCloudReply,type ImageInput} from "../vault/providers";
import {generateLocalReply,type ChatTurn} from "../local-ai/engine";
import {getHealthAdjustment,recordModelRun} from "./model-health";

export type ModelSource="local"|"ollama"|"gemini"|"deepseek";
export type ModelCandidate={id:string;source:ModelSource;model:string;label:string;location:string;note:string};
export type TaskKind="casual"|"code"|"analysis"|"writing"|"vision"|"general";
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

export function classifyTask(question:string,image=false):TaskKind{
 if(image)return "vision";
 if(/程式|程式碼|debug|bug|github|typescript|javascript|python|除錯|修復|編譯|\bAPI\b|regex/i.test(question))return "code";
 if(/分析|比較|研究|論文|醫學|證據|為什麼|推理|數據|計算|評估|規劃|策略/.test(question))return "analysis";
 if(/寫作|改寫|草稿|文案|電子郵件|文章|報告|故事|摘要|翻譯/.test(question))return "writing";
 if(/^(你好|哈囉|嗨|hi|hello|謝謝|早安|晚安)[!！。？?\s]*$/i.test(question))return "casual";
 return "general";
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
   result.push({id:"ollama:"+model,source:"ollama",model,label:"Ollama · "+model,location:officialCloud?"Ollama Cloud":"自架主機",note:officialCloud?"雲端模型可能有使用量限制與計費":"家庭主機或 VM 運算；請使用可信任的安全連線"});
  }
  }
 }
 if(!options.online)return result;
 const cfg=getConfigs();
 const gemini=cfg.find(x=>x.provider==="gemini");
 if(gemini){
  result.push({id:"gemini:"+gemini.model,source:"gemini",model:gemini.model,label:"Gemini · "+gemini.model,location:"Google 雲端",note:"依帳號額度／計費規則使用"});
  if(gemini.model!=="gemini-2.5-flash-lite")result.push({id:"gemini:gemini-2.5-flash-lite",source:"gemini",model:"gemini-2.5-flash-lite",label:"Gemini · Flash-Lite",location:"Google 雲端",note:"較輕量的替代模型，仍受 API 額度限制"});
 }
 const deepseek=cfg.find(x=>x.provider==="deepseek");
 if(deepseek&&!options.image)result.push({id:"deepseek:"+deepseek.model,source:"deepseek",model:deepseek.model,label:"DeepSeek · "+deepseek.model,location:"DeepSeek 雲端",note:"可能產生 API 費用"});
 return options.image?result.filter(x=>x.source==="gemini"):result;
}
function baseScore(candidate:ModelCandidate,task:TaskKind):number{
 if(candidate.source==="local"){
  const size=candidate.model.match(/(0[.]5|1[.]5|1|2|3|4|7)B/i)?.[1];
  const large=Number(size||0)>=1.5;
  return task==="casual"?90:large?64:32;
 }
 if(candidate.source==="ollama"){
  const size=Number(candidate.model.match(/([0-9]+(?:[.][0-9]+)?)b/i)?.[1]||"0");
  const scale=size>=14?13:size>=7?9:size>=3?5:size>=1.5?2:-4;
  return (task==="code"?77:task==="analysis"?77:78)+scale;
 }
 if(candidate.source==="gemini")return (task==="vision"?95:task==="code"?81:task==="analysis"?87:task==="writing"?87:task==="casual"?65:85)-(candidate.model.includes("lite")?11:0);
 return task==="code"?84:task==="analysis"?79:task==="writing"?80:task==="casual"?62:76;
}
export function rankedCandidates(candidates:ModelCandidate[],task:TaskKind,priority:"local-first"|"quality"="local-first"):ModelCandidate[]{
 const allVotes=votes().filter(v=>v.task===task);
 const feedback=ratings().filter(r=>r.task===task);
 const score=(candidate:ModelCandidate)=>{
  const wins=allVotes.filter(v=>v.winner===candidate.id).length;
  const losses=allVotes.filter(v=>v.loser===candidate.id).length;
  const graded=feedback.filter(r=>r.candidate===candidate.id);
  const approvals=graded.filter(r=>r.liked).length;
  const rejections=graded.length-approvals;
  const feedbackScore=Math.max(-12,Math.min(12,30*(approvals-rejections)/(6+graded.length)));
  const params=Number(candidate.model.match(/([0-9]+(?:[.][0-9]+)?)B/i)?.[1]||"0");
  const localBonus=priority==="local-first"&&candidate.source==="local"&&params>=1.5&&(task==="general"||task==="casual")?26:0;
  const qualityBonus=priority==="quality"&&candidate.source==="gemini"?8:0;
  const selfHostedBonus=priority==="local-first"&&candidate.source==="ollama"&&candidate.location==="自架主機"?8:0;
  return baseScore(candidate,task)+localBonus+qualityBonus+selfHostedBonus+Math.max(-13,Math.min(13,36*(wins-losses)/(6+wins+losses)))+getHealthAdjustment(candidate.id)+feedbackScore;
 };
 return [...candidates].sort((a,b)=>score(b)-score(a));
}
export function topComparisonCandidates(candidates:ModelCandidate[],task:TaskKind,priority:"local-first"|"quality"="local-first"):ModelCandidate[]{
 const ordered=rankedCandidates(candidates,task,priority);
 if(ordered.length<2)return ordered;
 const first=ordered[0];
 const different=ordered.find(x=>x.source!==first.source);
 return [first,different||ordered[1]];
}
export async function generateCandidate(candidate:ModelCandidate,history:ChatTurn[],image?:ImageInput,onLocalText?:(text:string)=>void):Promise<string>{
 const start=Date.now();
 try{
  let result:string;
  if(candidate.source==="local")result=await generateLocalReply(history,onLocalText||(()=>{}));
  else if(candidate.source==="ollama")result=await generateOllamaReply(history,candidate.model);
  else result=await generateCloudReply(candidate.source,history,image,candidate.model);
  recordModelRun(candidate.id,true,Date.now()-start);
  return result;
 }catch(error){
  recordModelRun(candidate.id,false,Date.now()-start);
  throw error;
 }
}
