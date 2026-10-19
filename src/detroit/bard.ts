/** Bard image tool. Explicit remote opt-in. No automatic API billing from text routing. */
import {getConfigs} from '../vault/providers';
export type BardImage={mime:string;base64:string;model:string;prompt:string};
const ALLOWED=new Set(['image/png','image/jpeg','image/webp']);
export function bardValidate(prompt:string,options:{privateMode:boolean;approved:boolean;online:boolean}):string{
 const q=prompt.trim();if(q.length<6||q.length>3000)throw Error('生圖提示詞需 6 至 3,000 字元');
 if(options.privateMode)throw Error('私密模式不允許將提示詞傳送至雲端圖片模型');
 if(!options.approved)throw Error('必須明確同意圖片生成可能產生 API 使用費');
 if(!options.online)throw Error('離線狀態無法使用雲端圖片生成');
 return q;
}
export async function bardGenerate(prompt:string,options:{privateMode:boolean;approved:boolean;signal?:AbortSignal;model?:string}):Promise<BardImage>{
 const text=bardValidate(prompt,{privateMode:options.privateMode,approved:options.approved,online:navigator.onLine});
 const config=getConfigs().find(c=>c.provider==='gemini');if(!config?.key)throw Error('請先在 Vanilla 設定連接 Gemini API，Bard 才能生成圖片');
 const model=options.model||'gemini-2.5-flash-image';
 if(!/^gemini-[\w.-]+-image(?:-[\w.-]+)?$/.test(model))throw Error('僅接受 Gemini 圖片生成模型');
 const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
  method:'POST',signal:options.signal,headers:{'Content-Type':'application/json','x-goog-api-key':config.key},
  body:JSON.stringify({contents:[{role:'user',parts:[{text}]}],generationConfig:{responseModalities:['TEXT','IMAGE']}})
 });
 if(!response.ok)throw Error(`Bard API 回應 ${response.status}；請檢查 Gemini 圖片模型權限及額度`);
 const data=await response.json() as {candidates?:Array<{content?:{parts?:Array<{inlineData?:{mimeType?:string;data?:string}}>} }>};
 const part=data.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data)?.inlineData;
 if(!part?.data||!part.mimeType||!ALLOWED.has(part.mimeType))throw Error('模型未回傳可用圖片，可能已拒絕此提示詞');
 if(part.data.length>16_000_000||!/^[A-Za-z0-9+/=]+$/.test(part.data))throw Error('圖片資料過大或格式錯誤');
 return {base64:part.data,mime:part.mimeType,model,prompt:text};
}
export function bardSave(image:BardImage){
 const a=document.createElement('a');a.href=`data:${image.mime};base64,${image.base64}`;
 a.download='Bard-'+new Date().toISOString().slice(0,10)+(image.mime==='image/jpeg'?'.jpg':image.mime==='image/webp'?'.webp':'.png');
 document.body.appendChild(a);a.click();a.remove();
}
