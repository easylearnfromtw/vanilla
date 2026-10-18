import {getConfigs} from "../vault/providers";
import {getOllamaConfig,isOllamaConfigured,generateOllamaReply} from "./ollama";
import {generateCloudReply,type ImageInput} from "../vault/providers";
import {generateLocalReply,type ChatTurn} from "../local-ai/engine";

export type ModelSource="local"|"ollama"|"gemini"|"deepseek";
export type ModelCandidate={id:string;source:ModelSource;model:string;label:string;location:string;note:string};
export type TaskKind="casual"|"code"|"analysis"|"writing"|"vision"|"general";
export type Vote={at:number;task:TaskKind;winner:string;loser:string};
const VOTE_KEY="vanilla.model.choices.v1";
export function classifyTask(question:string,image=false):TaskKind{
 if(image)return "vision";
 if(/程式|程式碼|debug|bug|github|typescript|javascript|python|除錯|修復|編譯|API|regex/i.test(question))return "code";
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
export function resetModelChoices(){try{localStorage.removeItem(VOTE_KEY);}catch{}window.dispatchEvent(new Event("vanilla-preferences-changed"));}
export function listCandidates(options:{localReady:boolean;localModel:string;image:boolean;online:boolean;privateMode:boolean}):ModelCandidate[]{
 const result:ModelCandidate[]=[];
 if(options.localReady&&!options.image){
  result.push({id:"local:"+options.localModel,source:"local",model:options.localModel,label:"手機本地 AI",location:"本機",note:"在此裝置運算，無 API 使用費"});
 }
 if(options.privateMode)return result;
 if(isOllamaConfigured()&&!options.image){
  const ollama=getOllamaConfig();
  result.push({id:"ollama:"+ollama.model,source:"ollama",model:ollama.model,label:"Ollama · "+ollama.model,location:"自架主機",note:"你的家庭主機或 VM 執行；網路傳輸需受保護"});
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
  return (task==="code"?78:task==="analysis"?78:79)+(size>=7?4:0);
 }
 if(candidate.source==="gemini")return (task==="vision"?95:task==="code"?81:task==="analysis"?87:task==="writing"?87:task==="casual"?65:85)-(candidate.model.includes("lite")?11:0);
 return task==="code"?84:task==="analysis"?79:task==="writing"?80:task==="casual"?62:76;
}
export function rankedCandidates(candidates:ModelCandidate[],task:TaskKind,priority:"local-first"|"quality"="local-first"):ModelCandidate[]{
 const allVotes=votes().filter(v=>v.task===task);
 const score=(candidate:ModelCandidate)=>{
  const wins=allVotes.filter(v=>v.winner===candidate.id).length;
  const losses=allVotes.filter(v=>v.loser===candidate.id).length;
  const params=Number(candidate.model.match(/([0-9]+(?:[.][0-9]+)?)B/i)?.[1]||"0");
  const localBonus=priority==="local-first"&&candidate.source==="local"&&params>=1.5&&(task==="general"||task==="casual")?26:0;
  const qualityBonus=priority==="quality"&&candidate.source==="gemini"?8:0;
  return baseScore(candidate,task)+localBonus+qualityBonus+Math.max(-13,Math.min(13,36*(wins-losses)/(6+wins+losses)));
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
 if(candidate.source==="local"){
  return generateLocalReply(history,onLocalText||(()=>{}));
 }
 if(candidate.source==="ollama")return generateOllamaReply(history,candidate.model);
 return generateCloudReply(candidate.source,history,image,candidate.model);
}
