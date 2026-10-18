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
export function chooseProvider(question:string,options?:{localReady?:boolean;online?:boolean}):Provider|"local"{
 const q=question.trim();
 const ready=options?.localReady??true;
 const online=options?.online??navigator.onLine;
 if(!online)return "local";
 if(/只用本地|僅用本地|不要上傳|離線回答|私密回答/.test(q))return "local";
 const gemini=configs.has("gemini"),deepseek=configs.has("deepseek");
 if(!gemini&&!deepseek)return "local";
 if(ready&&/^(你好|哈囉|嗨|謝謝|晚安|早安|測試|hello|hi)[！!。.?？ ]*$/i.test(q))return "local";
 if(/程式|代碼|debug|typescript|python|github|修復|編譯/i.test(q)&&deepseek)return "deepseek";
 return gemini?"gemini":"deepseek";
}
export type ImageInput={mimeType:string;data:string};
export async function generateCloudReply(provider:Provider,history:ChatTurn[],image?:ImageInput):Promise<string>{
 if(image&&provider!=="gemini")throw new Error("圖片辨識目前僅支援 Gemini，請切換至 Gemini API");
 const config=configs.get(provider);if(!config)throw new Error("尚未連接 "+provider+" API");
 const system="你是 Vanilla，臺灣繁體中文家庭 AI。回答一律使用臺灣繁體中文，準確、具體，不捏造。適合比較時輸出標準 Markdown 表格（含標題與分隔列）；數據趨勢可輸出 Markdown 表格供視覺化；使用者要求文件時輸出清晰標題與段落。不要聲稱已建立尚未產生的檔案。";
 let res:Response;
 if(provider==="gemini"){
  res=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(config.model)+":generateContent",{
   method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":config.key},
   body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:history.slice(-20).map(x=>({role:x.role==="assistant"?"model":"user",parts:x.role==="user"&&image&&x===history[history.length-1]?[{text:x.content},{inlineData:{mimeType:image.mimeType,data:image.data}}]:[{text:x.content}]})),generationConfig:{maxOutputTokens:2048}})
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
