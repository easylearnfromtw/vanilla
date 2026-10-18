import type {ChatTurn} from "../local-ai/engine";

const KEY="vanilla.ollama.connection.v1";
const SECRET_KEY="vanilla.ollama.proxy-token.v1";
export type OllamaConfig={endpoint:string;model:string;models:string[]};
export type OllamaModel={name:string;size?:number;details?:{parameter_size?:string;family?:string}};
export type OllamaTest={models:OllamaModel[];url:string};

function stored():OllamaConfig{
 try{
  const raw=localStorage.getItem(KEY);
  if(!raw)return {endpoint:"",model:"",models:[]};
  const value=JSON.parse(raw) as Partial<OllamaConfig>;
  return {endpoint:typeof value.endpoint==="string"?value.endpoint:"",model:typeof value.model==="string"?value.model:"",models:Array.isArray(value.models)?value.models.filter((m):m is string=>typeof m==="string").slice(0,4):[]};
 }catch{return {endpoint:"",model:"",models:[]};}
}
let config=stored();
let token="";
try{token=sessionStorage.getItem(SECRET_KEY)||"";}catch{}

export function getOllamaConfig():OllamaConfig{return {...config};}
export function getOllamaTokenConfigured():boolean{return Boolean(token);}
export function setOllamaConfig(next:OllamaConfig,accessToken?:string){
 const endpoint=next.endpoint.trim().replace(/\/+$/,"");
 const model=next.model.trim();
 if(endpoint)normalizeOllamaUrl(endpoint);
 const names=[model,...(next.models||[])].filter(Boolean);
 config={endpoint,model,models:[...new Set(names)].slice(0,4)};
 if(accessToken!==undefined)token=accessToken.trim();
 try{
  localStorage.setItem(KEY,JSON.stringify(config));
  if(token)sessionStorage.setItem(SECRET_KEY,token);
  else sessionStorage.removeItem(SECRET_KEY);
 }catch{}
 window.dispatchEvent(new Event("vanilla-ollama-changed"));
}
export function clearOllamaConfig(){
 config={endpoint:"",model:"",models:[]};token="";
 try{localStorage.removeItem(KEY);sessionStorage.removeItem(SECRET_KEY);}catch{}
 window.dispatchEvent(new Event("vanilla-ollama-changed"));
}
function normalizeOllamaUrl(value:string):string{
 let url:URL;
 try{url=new URL(value);}catch{throw new Error("請輸入完整的 Ollama HTTPS 連線網址");}
 if(url.username||url.password||url.search||url.hash)throw new Error("連線網址不可包含密碼、參數或片段");
 const loopback=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
 if(url.protocol!=="https:"&&!(url.protocol==="http:"&&loopback)){
  throw new Error("非本機 Ollama 必須經過 HTTPS 安全代理；請勿公開 11434 連接埠");
 }
 const pathname=url.pathname.replace(/\/+$/,"").replace(/\/api(?:\/chat|\/tags)?$/,"");
 return url.origin+pathname;
}
function headers():HeadersInit{
 return {"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})};
}
async function timedFetch(url:string,init:RequestInit={}):Promise<Response>{
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),180000);
 try{
  const response=await fetch(url,{...init,signal:controller.signal,headers:headers()});
  if(!response.ok)throw new Error("Ollama HTTP "+response.status+"；請確認模型、代理授權與伺服器狀態");
  return response;
 }catch(e){
  if(e instanceof Error&&e.name==="AbortError")throw new Error("Ollama 連線逾時，請確認主機是否開機、網路及 HTTPS 代理設定");
  if(e instanceof TypeError)throw new Error("瀏覽器無法連接 Ollama：請檢查 HTTPS、CORS、網路或憑證設定");
  throw e;
 }finally{clearTimeout(timeout);}
}
export function isOllamaConfigured(){return Boolean(config.endpoint&&config.model);}
export async function testOllama(endpoint=config.endpoint,accessToken=token):Promise<OllamaTest>{
 const base=normalizeOllamaUrl(endpoint);
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(base+"/api/tags",{
   headers:accessToken?{Authorization:"Bearer "+accessToken}:{},
   signal:controller.signal
  });
  if(!response.ok)throw new Error("Ollama HTTP "+response.status+"，請檢查存取授權");
  const data=await response.json() as {models?:OllamaModel[]};
  if(!Array.isArray(data.models))throw new Error("伺服器沒有回傳有效 Ollama 模型清單");
  return {models:data.models.filter(x=>typeof x.name==="string"),url:base};
 }catch(e){
  if(e instanceof Error&&e.name==="AbortError")throw new Error("Ollama 偵測逾時");
  if(e instanceof TypeError)throw new Error("連接失敗：檢查 HTTPS、CORS 和網路；iPhone 的 localhost 並不是家裡的電腦");
  throw e;
 }finally{clearTimeout(timeout);}
}
export async function generateOllamaReply(history:ChatTurn[],model=config.model):Promise<string>{
 if(!config.endpoint||!model)throw new Error("請先在設定中連接 Ollama，並選擇已下載的模型");
 const base=normalizeOllamaUrl(config.endpoint);
 const system="你是 Vanilla 家庭 AI。請用臺灣繁體中文精準回答，尊重使用者要求，不捏造未執行的工具或即時資料。";
 const res=await timedFetch(base+"/api/chat",{
  method:"POST",
  body:JSON.stringify({
   model,stream:false,
   messages:[{role:"system",content:system},...history.slice(-20).map(x=>({role:x.role,content:x.content}))],
   options:{temperature:0.45,num_predict:2048}
  })
 });
 const body=await res.json() as {message?:{content?:string};error?:string};
 if(body.error)throw new Error(body.error);
 const answer=body.message?.content?.trim();
 if(!answer)throw new Error("Ollama 未回傳回答");
 return answer;
}
