import {taiwanSpeechInstruction} from "./taiwan-pragmatics.ts";
/**
 * Device-only conversational style adaptation.
 * Never persist message text, sentiment labels about the person, or private-mode content.
 * Adapt delivery (not factual standards, safety requirements, or identity claims).
 */
const KEY="vanilla.tone.profile.v1";
export type ToneProfile={
 version:1;enabled:boolean;strength:"light"|"balanced"|"close";samples:number;
 lengthEma:number;questionEma:number;punctuationEma:number;emojiEma:number;
 directness:number;warmth:number;detail:number;updatedAt:number;
};
export const DEFAULT_TONE:ToneProfile={
 version:1,enabled:true,strength:"balanced",samples:0,lengthEma:40,
 questionEma:0.4,punctuationEma:0.35,emojiEma:0.1,
 directness:65,warmth:55,detail:55,updatedAt:0
};
const clamp=(n:number,min=0,max=100)=>Math.min(max,Math.max(min,n));
function num(v:unknown,fallback:number,min=0,max=100):number{return typeof v==="number"&&Number.isFinite(v)?clamp(v,min,max):fallback;}
export function getToneProfile():ToneProfile{
 try{
  const v=JSON.parse(localStorage.getItem(KEY)||"null") as Partial<ToneProfile>|null;
  if(!v||v.version!==1)return {...DEFAULT_TONE};
  return {...DEFAULT_TONE,
   enabled:v.enabled!==false,
   strength:v.strength==="light"||v.strength==="close"?v.strength:"balanced",
   samples:Math.trunc(num(v.samples,0,0,10000)),
   lengthEma:num(v.lengthEma,40,0,400),
   questionEma:num(v.questionEma,0.4,0,1),
   punctuationEma:num(v.punctuationEma,0.35,0,1),
   emojiEma:num(v.emojiEma,0.1,0,1),
   directness:num(v.directness,65),warmth:num(v.warmth,55),detail:num(v.detail,55),
   updatedAt:num(v.updatedAt,0,0,Number.MAX_SAFE_INTEGER)
  };
 }catch{return {...DEFAULT_TONE};}
}
export function saveToneProfile(next:ToneProfile){
 const clean={...next,version:1 as const,samples:Math.min(10000,Math.max(0,Math.trunc(next.samples))),
  directness:clamp(next.directness),warmth:clamp(next.warmth),detail:clamp(next.detail),updatedAt:Date.now()};
 try{localStorage.setItem(KEY,JSON.stringify(clean));}catch{}
 window.dispatchEvent(new Event("vanilla-tone-changed"));
}
export function resetToneProfile(){try{localStorage.removeItem(KEY);}catch{}window.dispatchEvent(new Event("vanilla-tone-changed"));}
export function learnToneFromMessage(message:string,privateMode=false){
 const profile=getToneProfile();
 if(!profile.enabled||privateMode)return;
 // Ignore pasted documents/code and short/noisy signals; do not store raw content.
 if(message.length<3||message.length>550||message.includes("```")||message.includes("\n\n"))return;
 const sample=message.trim();
 const count=Math.min(400,[...sample].length);
 const hasQuestion=/[？?]|^(?:什麼|怎麼|為什麼|如何|可以|能不能|是否)/.test(sample)?1:0;
 const punctuation=((sample.match(/[，。？！；：、,.!?;]/g)||[]).length/Math.max(1,count));
 const emoji=/[\u{1F300}-\u{1FAFF}]/u.test(sample)?1:0;
 const alpha=profile.samples<6?1/(profile.samples+1):0.12;
 const ema=(before:number,next:number)=>before*(1-alpha)+next*alpha;
 const lengthEma=ema(profile.lengthEma,count),questionEma=ema(profile.questionEma,hasQuestion);
 const punctuationEma=ema(profile.punctuationEma,Math.min(1,punctuation*12));
 const emojiEma=ema(profile.emojiEma,emoji);
 saveToneProfile({...profile,samples:Math.min(profile.samples+1,10000),
  lengthEma,questionEma,punctuationEma,emojiEma});
}
export type ToneFeedback="match"|"formal"|"verbose"|"cold";
export function toneFeedback(kind:ToneFeedback){
 const p=getToneProfile();if(!p.enabled)return;
 if(kind==="match"){saveToneProfile({...p,strength:"close"});return;}
 if(kind==="formal"){saveToneProfile({...p,directness:clamp(p.directness+10),warmth:clamp(p.warmth+4)});return;}
 if(kind==="verbose"){saveToneProfile({...p,detail:clamp(p.detail-12),directness:clamp(p.directness+6)});return;}
 saveToneProfile({...p,warmth:clamp(p.warmth+12)});
}
export function toneInstruction(p=getToneProfile(),latestUserText=""):string{
 if(!p.enabled)return "請使用自然、專業的臺灣繁體中文，並尊重使用者當次指定的語氣。"+taiwanSpeechInstruction(latestUserText,"light");
 const enough=p.samples>=3;
 const direct=enough&&p.lengthEma<45?"精簡直接，少用鋪陳；":p.directness>=60?"先講結論，避免冗言；":"清楚完整地說明；";
 const punctuation=enough&&p.punctuationEma<0.18?"標點簡潔，不必模仿使用者省略標點；":"句子順暢、分段清楚；";
 const emoji=enough&&p.emojiEma<0.15?"少用表情符號；":"表情符號只在自然時少量使用；";
 const length=p.detail<40?"通常用短段落，重點優先；":p.detail>72?"需要時給出具體步驟及依據；":"依問題難度調整詳略；";
 const warmth=p.warmth>70?"保持親切、自然，不過分親密；":p.warmth<35?"語氣理性、俐落；":"語氣友善，但不客套；";
 const current=latestUserText.length<500&&/很煩|爛|有問題|不行|失敗|錯誤|壞掉|不對/.test(latestUserText)?"使用者可能遇到挫折，優先處理實際問題，不要制式安慰。":"";
 const power=p.strength==="light"?"輕度參考個人偏好；":p.strength==="close"?"適度貼近使用者的語速和措辭習慣，但不冒充本人；":"自然呼應使用者的溝通節奏；";
 return "回覆風格指引（僅調整表達形式，不影響事實準確、安全與隱私）：以臺灣繁體中文回答。"+power+direct+punctuation+emoji+length+warmth+current+"使用者明確指定不同語氣、長度、格式時以當次要求為準；不要宣稱自己就是使用者。"+taiwanSpeechInstruction(latestUserText,p.strength);
}
/**
 * Explicit conversational preferences are applied locally, without an API call.
 * Broad ordinary questions are not intercepted or interpreted as durable settings.
 */
export function applyExplicitToneRequest(text:string,privateMode=false):string|null{
 if(privateMode)return null;
 const q=text.trim();
 if(q.length>240||q.length<5)return null;
 if(!/(?:以後|之後|往後|從現在起|每次|回答時|回覆時|語氣|說話方式|像我一點)/.test(q))return null;
 if(!/(?:回覆|回答|語氣|說話|文字|表情符號|Emoji|emoji|詳細|簡短|囉嗦|客氣|正式)/i.test(q))return null;
 let profile=getToneProfile();
 if(/(?:停用|不要|關閉|停止)(?:自動)?(?:學習|模仿|適應|調整)(?:我的)?(?:語氣|風格)/.test(q)){
  saveToneProfile({...profile,enabled:false});
  return "我已在這台裝置停用自動語氣適應；不會再從後續的一般對話更新語氣統計。";
 }
 if(!profile.enabled){
  if(/(?:開啟|啟用|恢復)(?:自動)?(?:語氣|風格)(?:適應|學習)/.test(q)){
   saveToneProfile({...profile,enabled:true});return "已重新開啟語氣適應。";
  }
  return null;
 }
 const adjustments:string[]=[];
 if(/(?:口語|自然一點|別那麼正式|不要太正式|別太官腔|像我說話|像我一點)/.test(q)){
  profile={...profile,directness:clamp(profile.directness+12),warmth:clamp(profile.warmth+6),
   strength:/像我/.test(q)?"close":profile.strength};
  adjustments.push("語氣更自然、較少官腔");
 }
 if(/(?:簡短|簡潔|精簡|重點就好|少點廢話|不要囉嗦|太囉嗦)/.test(q)){
  profile={...profile,detail:clamp(profile.detail-15),directness:clamp(profile.directness+7)};
  adjustments.push("回答更精簡");
 }
 if(/(?:講詳細|寫詳細|詳細一點|說完整|多舉例|解釋清楚)/.test(q)){
  profile={...profile,detail:clamp(profile.detail+15)};
  adjustments.push("回答更完整");
 }
 if(/(?:親切一點|溫柔一點|不要太冷淡|別那麼冷)/.test(q)){
  profile={...profile,warmth:clamp(profile.warmth+12)};
  adjustments.push("語氣更親切");
 }
 if(/(?:理性一點|冷靜一點|客觀|不要太熱情)/.test(q)){
  profile={...profile,warmth:clamp(profile.warmth-12)};
  adjustments.push("語氣更理性");
 }
 if(/(?:不要|少用|別用)(?:太多)?(?:emoji|表情符號|顏文字)/i.test(q)){
  profile={...profile,emojiEma:0};adjustments.push("減少表情符號");
 }
 if(!adjustments.length)return null;
 saveToneProfile(profile);
 return "已更新這台裝置的回覆偏好："+[...new Set(adjustments)].join("、")+"。之後會持續參考你的回饋；若單次問題有指定風格，仍以當次要求為準。";
}
export function getToneSummary(profile=getToneProfile()):string{
 if(!profile.enabled)return "已停用語氣適應";
 if(profile.samples<3)return "正在建立對話風格基線（不儲存原文）";
 const rhythm=profile.lengthEma<45?"偏精簡":profile.lengthEma>130?"偏完整":"中等篇幅";
 return `依 ${profile.samples} 則訊息估計：${rhythm}、${profile.punctuationEma<0.2?"少標點":"正常標點"}；會優先遵守你當次的要求。`;
}
