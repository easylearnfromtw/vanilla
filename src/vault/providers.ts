import {Converter} from "opencc-js";
import type {ChatTurn} from "../local-ai/engine";
export type Provider="gemini"|"deepseek";
export type ProviderConfig={provider:Provider;key:string;model:string};
const configs=new Map<Provider,ProviderConfig>();
const convert=Converter({from:"cn",to:"tw"});
export function setProvider(config:ProviderConfig){configs.set(config.provider,config);window.dispatchEvent(new Event("vanilla-providers-changed"));}
export function removeProvider(provider:Provider){configs.delete(provider);window.dispatchEvent(new Event("vanilla-providers-changed"));}
export function availableProviders():Provider[]{return [...configs.keys()];}
export function getConfigs():ProviderConfig[]{return [...configs.values()];}
export function chooseProvider(question:string):Provider|"local"{
 const q=question.trim();
 if(q.length<45&&!/(分析|比較|研究|程式|設計|推理|規劃|解釋原因|診斷|計算|寫一篇|詳細|深入)/.test(q))return "local";
 if(/程式|代碼|debug|typescript|python|github/i.test(q)&&configs.has("deepseek"))return "deepseek";
 if(configs.has("gemini"))return "gemini";
 if(configs.has("deepseek"))return "deepseek";
 return "local";
}
export async function generateCloudReply(provider:Provider,history:ChatTurn[]):Promise<string>{
 const config=configs.get(provider);if(!config)throw new Error("尚未連接 "+provider+" API");
 const system="你是 Vanilla，臺灣繁體中文家庭 AI。回答一律使用臺灣繁體中文，準確、具體，不捏造。";
 let res:Response;
 if(provider==="gemini"){
  res=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(config.model)+":generateContent",{
   method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":config.key},
   body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:history.slice(-20).map(x=>({role:x.role==="assistant"?"model":"user",parts:[{text:x.content}]})),generationConfig:{maxOutputTokens:2048}})
  });
 }else{
  res=await fetch("https://api.deepseek.com/chat/completions",{
   method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+config.key},
   body:JSON.stringify({model:config.model,messages:[{role:"system",content:system},...history.slice(-20)],max_tokens:2048})
  });
 }
 if(!res.ok)throw new Error(provider+" API 回應 "+res.status+"，請檢查金鑰、額度與模型名稱");
 const data=await res.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>;choices?:Array<{message?:{content?:string}}>};
 const answer=provider==="gemini"?data.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join(""):data.choices?.[0]?.message?.content;
 if(!answer)throw new Error("雲端模型未回傳內容");
 return convert(answer);
}
