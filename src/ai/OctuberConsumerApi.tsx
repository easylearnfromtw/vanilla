import {useState} from "react";
import {Copy,KeyRound,ShieldCheck} from "lucide-react";

type ApiModel={id:string};
type ApiUsage={daily?:unknown;monthly?:unknown;limits?:unknown;[key:string]:unknown};
/** Consumer-side setup for an issued Vanilla / OCTUBER API key.
 * No credentials are written into localStorage, Drive, telemetry or GitHub.
 */
export default function OctuberConsumerApi(){
 const [endpoint,setEndpoint]=useState("");
 const [apiKey,setApiKey]=useState("");
 const [models,setModels]=useState<ApiModel[]>([]);
 const [selected,setSelected]=useState("");
 const [usage,setUsage]=useState<ApiUsage|null>(null);
 const [verified,setVerified]=useState(false);
 const [working,setWorking]=useState(false);
 const [status,setStatus]=useState("取得個人 API 金鑰後，輸入授權服務的 HTTPS 網址與金鑰，即可檢查模型清單、配額與實際推論。");
 function baseUrl(){
  let parsed:URL;try{parsed=new URL(endpoint.trim());}catch{throw new Error("請輸入已授權 API 的完整 HTTPS 網址");}
  if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.search||parsed.hash)
   throw new Error("API 網址需為 HTTPS，且不得包含帳密、查詢參數或片段");
  if(["localhost","127.0.0.1","[::1]"].includes(parsed.hostname))
   throw new Error("公用網站請使用可連線的 HTTPS 推論閘道，不可使用 localhost");
  const path=parsed.pathname.replace(/\/+$/,"").replace(/\/v1$/,"");
  return parsed.origin+path+"/v1";
 }
 async function request(path:string,init:RequestInit={}){
  if(!apiKey.startsWith("vnl_"))throw new Error("請輸入 Vanilla 核發的 vnl_ API Key");
  const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),20000);
  try{
   const response=await fetch(baseUrl()+path,{...init,signal:controller.signal,
    headers:{Authorization:"Bearer "+apiKey,...(init.body?{"Content-Type":"application/json"}:{})}});
   if(!response.ok)throw new Error("API HTTP "+response.status+"，請核對授權、模型配額和服務啟用狀態");
   return response.json() as Promise<unknown>;
  }finally{window.clearTimeout(timeout);}
 }
 async function discover(){
  setWorking(true);setVerified(false);setModels([]);setUsage(null);setStatus("正在驗證授權，取得模型清單…");
  try{
   const payload=await request("/models") as {data?:Array<{id?:unknown}>};
   const found=(Array.isArray(payload.data)?payload.data:[]).filter(x=>typeof x.id==="string").map(x=>({id:String(x.id)}));
   if(!found.length)throw new Error("閘道沒有回傳可用模型；可能尚未啟用推論");
   setModels(found);setSelected(found[0].id);setStatus("授權可用，找到 "+found.length+" 個模型。請再檢查額度或測試實際回答。");
  }catch(error){setStatus("模型清單驗證失敗："+String(error instanceof Error?error.message:error));}
  finally{setWorking(false);}
 }
 async function checkUsage(){
  setWorking(true);setStatus("正在讀取自己的 Token 額度…");
  try{
   const payload=await request("/vanilla/usage");
   if(!payload||typeof payload!=="object")throw Error("配額回應格式不正確");
   setUsage(payload as ApiUsage);setStatus("已取得這把 Key 對應的使用量資料；實際費用以服務提供者公告為準。");
  }catch(error){setStatus("配額查詢失敗："+String(error instanceof Error?error.message:error));}
  finally{setWorking(false);}
 }
 async function testInference(){
  if(!selected){setStatus("請先取得並選擇模型");return;}
  setWorking(true);setVerified(false);setStatus("正在確認模型能實際回答…");
  try{
   const response=await request("/chat/completions",{
    method:"POST",body:JSON.stringify({model:selected,messages:[{role:"user",content:"請只回答 OK"}],max_tokens:48,stream:false})
   }) as {choices?:Array<{message?:{content?:unknown}}>} ;
   const answer=response.choices?.[0]?.message?.content;
   if(typeof answer!=="string"||!answer.trim())throw Error("未回傳有效的模型答案");
   setVerified(true);setStatus("OCTUBER API 推論驗證成功：「"+answer.slice(0,50)+"」。模型已可透過此 Key 使用。");
  }catch(error){setStatus("推論測試失敗："+String(error instanceof Error?error.message:error));}
  finally{setWorking(false);}
 }
 const sample="curl -X POST \"https://YOUR-DOMAIN/v1/chat/completions\" \\\n  -H \"Authorization: Bearer vnl_YOUR_KEY\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"model\":\"vanilla-default\",\"messages\":[{\"role\":\"user\",\"content\":\"你好\"}],\"max_tokens\":256,\"stream\":false}'";
 return <section className="octuber-consumer-api" aria-label="OCTUBER 使用者 API">
  <div className="connection-title"><KeyRound size={20}/><h3>已取得 API Key？在這裡啟用</h3></div>
  <p>適用於 Vanilla 自家核發的 <code>vnl_</code> API Key，不是 Gemini、DeepSeek 或 Ollama 的供應商金鑰。只在按下測試時送出請求，不會自動啟用第三方付費服務。</p>
  <label htmlFor="octuber-consumer-endpoint">API 服務 HTTPS 網址</label>
  <input id="octuber-consumer-endpoint" type="url" value={endpoint} onChange={e=>{setEndpoint(e.target.value);setVerified(false);}} placeholder="https://your-authorized-gateway.example/v1" autoCapitalize="none" spellCheck={false}/>
  <label htmlFor="octuber-consumer-key">API Key</label>
  <input id="octuber-consumer-key" type="password" value={apiKey} onChange={e=>{setApiKey(e.target.value.trim());setVerified(false);}} autoComplete="off" placeholder="vnl_••••••••" autoCapitalize="none" spellCheck={false}/>
  <div className="connection-buttons">
   <button type="button" disabled={working||!endpoint||!apiKey} onClick={()=>void discover()}>① 驗證金鑰／取得模型</button>
   <button type="button" disabled={working||!models.length} onClick={()=>void checkUsage()}>② 查看額度</button>
   <button type="button" disabled={working||!models.length} onClick={()=>void testInference()}>③ 測試實際回答</button>
  </div>
  {models.length>0&&<label htmlFor="octuber-consumer-model">允許的模型<select id="octuber-consumer-model" value={selected} onChange={e=>{setSelected(e.target.value);setVerified(false);}}>{models.map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select></label>}
  <p className="octuber-api-note" role="status" aria-live="polite">{verified?<ShieldCheck size={14}/>:null}{status}</p>
  {usage&&<details><summary>查看此金鑰的額度回傳資料</summary><pre>{JSON.stringify(usage,null,2)}</pre></details>}
  <details><summary>第三方應用程式串接範例</summary>
   <p>請把示範網域與 Key 換成自己的值；不要將真實金鑰提交到公開程式碼。範例不包含金鑰明文。</p>
   <pre>{sample}</pre>
   <button type="button" onClick={()=>void navigator.clipboard.writeText(sample)}><Copy size={13}/>複製範例</button>
  </details>
  <p className="octuber-api-note"><ShieldCheck size={14}/> 為降低外洩風險，金鑰僅保留在此畫面的記憶體中，離開或重整即清除。請只連接你確認可信任的授權服務網域；此頁不提供金鑰申請或付款功能。</p>
 </section>;
}
